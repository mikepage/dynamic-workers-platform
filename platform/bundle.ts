import { createWorker } from "worker-bundler";
import { CompileError, MAIN_MODULES, type Files } from "./compile.ts";

// The other deploy path: Cloudflare's @cloudflare/worker-bundler, the way VibeSDK
// deploys generated apps. esbuild runs as WebAssembly inside this Worker, installs
// npm dependencies from package.json, and bundles everything into JavaScript.
// Apps get no platform libraries here: they ship their own through package.json.

// Same Hono as the strip path, so the two paths run the same code.
const DEFAULT_PACKAGE = JSON.stringify({ dependencies: { hono: "5.0.0-rc.1" } });

export type LoaderModules = Record<string, string | Record<string, unknown>>;

export async function bundle(files: Files): Promise<{ modules: LoaderModules; mainModule: string; ms: number }> {
  const start = performance.now();
  const entryPoint = MAIN_MODULES.find((m) => m in files);
  if (!entryPoint) throw new CompileError(`add one of ${MAIN_MODULES.join(", ")}`);
  try {
    const result = await createWorker({ files: { "package.json": DEFAULT_PACKAGE, ...files }, entryPoint });
    return {
      modules: result.modules as LoaderModules,
      mainModule: result.mainModule,
      ms: performance.now() - start,
    };
  } catch (e) {
    throw new CompileError((e as Error).message);
  }
}
