// What a deploy sends: file name → source text, as the author or the AI wrote it.
export type Files = Record<string, string>;
// What Worker Loader takes: module name → source, or { js: source } and friends.
export type LoaderModules = Record<string, string | Record<string, unknown>>;
export type Built = { modules: LoaderModules; mainModule: string; ms: number };

export class BuildError extends Error {}

export const MAIN_MODULES = ["index.ts", "index.tsx", "index.js", "index.jsx"];

const DEFAULT_PACKAGE = '{ "dependencies": { "hono": "5.0.0-rc.1" } }';

const IMPORT = /(?:(?<![\w$.@])import\s*(?:[\w*{}\s,$]+\s*from\s*)?|(?<![\w$.@])export\s*[\w*{}\s,$]+\s*from\s*|(?<![\w$.@])import\s*\(\s*)["']([^"']+)["']/g;

// What must hold before a build: an entry file, and every bare import in package.json.
// worker-bundler marks an import it can't resolve as external and builds anyway, so a
// missing package would otherwise only show up when the app starts.
export function checkFiles(files: Files): string {
  if (Object.keys(files).length === 0) throw new BuildError("no files");
  const entryPoint = MAIN_MODULES.find((m) => m in files);
  if (!entryPoint) throw new BuildError(`add one of ${MAIN_MODULES.join(", ")}`);

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
  if (missing.size) throw new BuildError(`not in package.json dependencies: ${[...missing].join(", ")}`);
  return entryPoint;
}
