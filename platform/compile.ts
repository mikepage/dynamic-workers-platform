import { transform } from "sucrase";

// What a deploy sends: file name → source text, as the author or the AI wrote it.
export type Files = Record<string, string>;
// What Worker Loader takes: file name → JavaScript. Names stay the same, so imports
// like "./db.ts" keep resolving without rewriting.
export type Modules = Record<string, { js: string }>;

export class CompileError extends Error {}

// workerd resolves a bare import against the importing module's folder: "hono" from
// "components/Layout.tsx" becomes "components/hono". Pin imports of the platform's own
// libraries to the root ("/hono") so they resolve from any folder.
function pinLibImports(js: string, libNames: Set<string>): string {
  return js.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\s]+)\2/g,
    (all, lead: string, quote: string, spec: string) => (libNames.has(spec) ? `${lead}${quote}/${spec}${quote}` : all),
  );
}

const NAME = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.(ts|tsx|js|jsx)$/i;
export const MAIN_MODULES = ["index.ts", "index.tsx", "index.js", "index.jsx"];

// Worker Loader only accepts JavaScript, and workerd's own type stripper only runs on
// modules from config.capnp. So strip types here: one file at a time, no bundling,
// no dependency resolution. JSX compiles to hono/jsx, which the platform provides.
export function compile(files: Files, libNames: Set<string>): { modules: Modules; mainModule: string; ms: number } {
  const start = performance.now();
  const names = Object.keys(files);
  if (names.length === 0) throw new CompileError("no files");
  const mainModule = MAIN_MODULES.find((m) => m in files);
  if (!mainModule) throw new CompileError(`add one of ${MAIN_MODULES.join(", ")}`);

  const modules: Modules = {};
  for (const name of names) {
    if (!NAME.test(name)) throw new CompileError(`${name}: use a relative .ts, .tsx, .js or .jsx path`);
    const ext = name.slice(name.lastIndexOf(".") + 1);
    const transforms: ("typescript" | "jsx")[] = [];
    if (ext === "ts" || ext === "tsx") transforms.push("typescript");
    if (ext === "tsx" || ext === "jsx") transforms.push("jsx");
    try {
      const js = transforms.length
        ? transform(files[name], {
            transforms,
            filePath: name,
            jsxRuntime: "automatic",
            jsxImportSource: "hono/jsx",
            production: true,
            disableESTransforms: true,
          }).code
        : files[name];
      modules[name] = { js: pinLibImports(js, libNames) };
    } catch (e) {
      throw new CompileError(`${name}: ${(e as Error).message}`);
    }
  }
  return { modules, mainModule, ms: performance.now() - start };
}
