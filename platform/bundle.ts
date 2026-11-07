import { createWorker } from "worker-bundler";

// What a deploy sends: file name → source text, as the author or the AI wrote it.
export type Files = Record<string, string>;
// What Worker Loader takes: module name → source, or { js: source } and friends.
export type LoaderModules = Record<string, string | Record<string, unknown>>;
export type Built = { modules: LoaderModules; mainModule: string; ms: number };

export class BuildError extends Error {}

export const MAIN_MODULES = ["index.ts", "index.tsx", "index.js", "index.jsx"];

// Apps that send no package.json still get Hono.
export const DEFAULT_PACKAGE = JSON.stringify({ dependencies: { hono: "5.0.0-rc.1" } });

const IMPORT = /(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*[\w*{}\s,$]+\s*from\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

// worker-bundler marks an import it can't resolve as external and builds anyway, so a
// missing package only shows up when the app starts. Catch it here, with a message an
// agent can act on.
export function checkImports(files: Files): void {
  let pkg: { dependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(files["package.json"] ?? DEFAULT_PACKAGE);
  } catch (e) {
    throw new BuildError(`package.json: ${(e as Error).message}`);
  }
  const deps = new Set(Object.keys(pkg.dependencies ?? {}));
  const missing = new Set<string>();
  for (const [name, source] of Object.entries(files)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
    for (const [, spec] of source.matchAll(IMPORT)) {
      if (spec.startsWith(".") || spec.startsWith("/") || /^(cloudflare|node):/.test(spec)) continue;
      const parts = spec.split("/");
      const pkgName = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      if (!deps.has(pkgName)) missing.add(`${pkgName} (imported in ${name})`);
    }
  }
  if (missing.size) {
    throw new BuildError(`not in package.json dependencies: ${[...missing].join(", ")}`);
  }
}

// Build with Cloudflare's @cloudflare/worker-bundler, the way VibeSDK builds previews.
// esbuild runs as WebAssembly inside this Worker, fetches npm packages from
// package.json, and bundles the app into JavaScript that Worker Loader accepts.
export async function bundle(files: Files): Promise<Built> {
  const start = performance.now();
  if (Object.keys(files).length === 0) throw new BuildError("no files");
  const entryPoint = MAIN_MODULES.find((m) => m in files);
  if (!entryPoint) throw new BuildError(`add one of ${MAIN_MODULES.join(", ")}`);
  checkImports(files);
  try {
    const result = await createWorker({
      files: { "package.json": DEFAULT_PACKAGE, ...files },
      entryPoint,
      // esbuild defaults to React's classic JSX; these apps use Hono's.
      jsx: "automatic",
      jsxImportSource: "hono/jsx",
    });
    return {
      modules: result.modules as LoaderModules,
      mainModule: result.mainModule,
      ms: performance.now() - start,
    };
  } catch (e) {
    throw new BuildError((e as Error).message);
  }
}
