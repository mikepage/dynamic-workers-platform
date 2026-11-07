import { Hono } from "hono";
import { BuildError, bundle, type Built, type Files } from "./bundle.ts";
import { generate, MODELS, type Step } from "./generate.ts";
import type { Registry } from "./registry.ts";
import { ui } from "./ui.ts";

export { Registry } from "./registry.ts";

type Env = {
  LOADER: WorkerLoader;
  REGISTRY: DurableObjectNamespace<Registry>;
  AI: Ai;
};

// Apps live at /apps/<name>/ and at <name>.localhost:8080.
const APP_HOST = /^([a-z0-9-]{1,32})\.localhost(:\d+)?$/;
const APP_PATH = /^\/apps\/([a-z0-9-]{1,32})(\/.*)?$/;
const APP_NAME = /^[a-z0-9-]{1,32}$/;
const COMPAT_DATE = "2026-11-01";

const registry = (env: Env) => env.REGISTRY.get(env.REGISTRY.idFromName("registry"));

async function hashOf(built: Built): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([built.mainModule, built.modules]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One isolate per name@hash. Worker Loader caches it, so the smoke test warms the
// isolate that serves the app afterwards.
const load = (env: Env, name: string, hash: string, built: Pick<Built, "mainModule" | "modules">) =>
  env.LOADER.get(`${name}@${hash}`, async () => ({
    compatibilityDate: COMPAT_DATE,
    mainModule: built.mainModule,
    modules: built.modules,
    // No network for generated code.
    globalOutbound: null,
  }));

// Build, start, request GET /, and only then store. Every failure is a BuildError with a
// message the model can fix.
async function deploy(env: Env, name: string, files: Files) {
  const built = await bundle(files);
  const hash = await hashOf(built);
  let res: Response;
  try {
    res = await load(env, name, hash, built).getEntrypoint().fetch(new Request("http://app/"));
  } catch (e) {
    throw new BuildError(`GET / threw: ${(e as Error).message}`);
  }
  if (res.status >= 500) {
    throw new BuildError(`GET / returned ${res.status}:\n${(await res.text()).slice(0, 2000)}`);
  }
  const version = await registry(env).put(name, files, hash, built.mainModule, built.modules);
  return {
    name,
    version,
    url: `/apps/${name}/`,
    buildMs: Math.round(built.ms),
    moduleBytes: JSON.stringify(built.modules).length,
  };
}

async function serveApp(env: Env, name: string, req: Request): Promise<Response> {
  const app = await registry(env).get(name);
  if (!app) return new Response(`No app named ${name}.`, { status: 404 });
  try {
    return await load(env, name, app.hash, app).getEntrypoint().fetch(req);
  } catch (e) {
    return new Response(`App ${name} failed:\n${(e as Error).message}`, { status: 502 });
  }
}

// A deploy is JSON ({ files }) or multipart from curl, one field per file.
async function readFiles(req: Request): Promise<Files | null> {
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const files: Files = {};
    for (const [name, value] of form) files[name] = typeof value === "string" ? value : await value.text();
    return Object.keys(files).length ? files : null;
  }
  const body = await req.json<{ files?: Files }>().catch(() => null);
  return body?.files && typeof body.files === "object" ? body.files : null;
}

const platform = new Hono<{ Bindings: Env }>();

platform.get("/", async (c) => c.html(ui(await registry(c.env).list(), MODELS)));

platform.get("/api/apps", async (c) => c.json(await registry(c.env).list()));

platform.get("/api/apps/:name", async (c) => {
  const files = await registry(c.env).source(c.req.param("name"));
  return files ? c.json({ files }) : c.json({ error: "not found" }, 404);
});

platform.delete("/api/apps/:name", async (c) =>
  (await registry(c.env).remove(c.req.param("name"))) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
);

// Deploy files as they are.
platform.put("/api/apps/:name", async (c) => {
  const name = c.req.param("name");
  if (!APP_NAME.test(name)) return c.json({ error: "name: lowercase letters, digits and dashes" }, 400);
  const files = await readFiles(c.req.raw);
  if (!files) return c.json({ error: 'send JSON { files: { "index.ts": "..." } } or multipart, one field per file' }, 400);
  try {
    return c.json(await deploy(c.env, name, files));
  } catch (e) {
    if (e instanceof BuildError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

// Prompt in, running app out. Changes an existing app when the name is taken.
platform.post("/api/apps/:name/generate", async (c) => {
  const name = c.req.param("name");
  if (!APP_NAME.test(name)) return c.json({ error: "name: lowercase letters, digits and dashes" }, 400);
  const body = await c.req.json<{ prompt?: string; model?: string }>().catch(() => ({}) as { prompt?: string; model?: string });
  if (!body.prompt?.trim()) return c.json({ error: "send JSON { prompt }" }, 400);
  const model = body.model && MODELS.includes(body.model) ? body.model : MODELS[0];
  const current = await registry(c.env).source(name);
  try {
    const out = await generate(c.env.AI, { prompt: body.prompt, model, current }, (files) => deploy(c.env, name, files));
    return c.json({ ...out.result, model, steps: out.steps, files: out.files });
  } catch (e) {
    const err = e as Error & { steps?: Step[]; files?: Files };
    return c.json({ error: err.message, model, steps: err.steps ?? [], files: err.files ?? current ?? {} }, 422);
  }
});

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    const host = (req.headers.get("host") ?? url.host).match(APP_HOST);
    if (host) return serveApp(env, host[1], req);
    const path = url.pathname.match(APP_PATH);
    if (path) {
      if (!path[2]) return Response.redirect(`${url.origin}/apps/${path[1]}/`, 301);
      const inner = new URL(path[2] + url.search, url.origin);
      return serveApp(env, path[1], new Request(inner, req));
    }
    return platform.fetch(req, env, ctx);
  },
};
