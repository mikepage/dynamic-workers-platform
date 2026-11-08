import { Hono } from "hono";
import { BuildError, checkFiles, type Built, type Files, type LoaderModules } from "./checks.ts";
import { generate, MODELS, type Step } from "./generate.ts";
import { ui, type AppSummary } from "./ui.ts";

// The platform runs as a Dynamic Worker. boot.js built it with worker-bundler and passes
// in two bindings: HOST (build, start and store apps) and AI (Workers AI).
type Host = {
  build(files: Files, entryPoint: string): Promise<Built>;
  smoke(name: string, hash: string, built: Built): Promise<{ status: number; body: string }>;
  serve(name: string, request: Request): Promise<Response>;
  put(name: string, files: Files, hash: string, mainModule: string, modules: LoaderModules): Promise<number>;
  source(name: string): Promise<Files | null>;
  remove(name: string): Promise<boolean>;
  list(): Promise<AppSummary[]>;
};
type Env = { HOST: Host; AI: Ai };

// Apps live at /apps/<name>/ and at <name>.localhost:8080.
const APP_HOST = /^([a-z0-9-]{1,32})\.localhost(:\d+)?$/;
const APP_PATH = /^\/apps\/([a-z0-9-]{1,32})(\/.*)?$/;
const APP_NAME = /^[a-z0-9-]{1,32}$/;

async function hashOf(built: Built): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([built.mainModule, built.modules]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Check, build, start, request GET /, and only then store. Every failure is a
// BuildError with a message the model can fix.
async function deploy(env: Env, name: string, files: Files) {
  const entryPoint = checkFiles(files);
  let built: Built;
  try {
    built = await env.HOST.build(files, entryPoint);
  } catch (e) {
    throw new BuildError((e as Error).message);
  }
  const hash = await hashOf(built);
  let res: { status: number; body: string };
  try {
    res = await env.HOST.smoke(name, hash, built);
  } catch (e) {
    throw new BuildError(`GET / threw: ${(e as Error).message}`);
  }
  if (res.status >= 500) throw new BuildError(`GET / returned ${res.status}:\n${res.body}`);
  const version = await env.HOST.put(name, files, hash, built.mainModule, built.modules);
  return {
    name,
    version,
    url: `/apps/${name}/`,
    buildMs: Math.round(built.ms),
    moduleBytes: JSON.stringify(built.modules).length,
  };
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

platform.get("/", async (c) => c.html(ui(await c.env.HOST.list(), MODELS)));

platform.get("/api/apps", async (c) => c.json(await c.env.HOST.list()));

platform.get("/api/apps/:name", async (c) => {
  const files = await c.env.HOST.source(c.req.param("name"));
  return files ? c.json({ files }) : c.json({ error: "not found" }, 404);
});

platform.delete("/api/apps/:name", async (c) =>
  (await c.env.HOST.remove(c.req.param("name"))) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
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
  const current = await c.env.HOST.source(name);
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
    if (host) return env.HOST.serve(host[1], req);
    const path = url.pathname.match(APP_PATH);
    if (path) {
      if (!path[2]) return Response.redirect(`${url.origin}/apps/${path[1]}/`, 301);
      return env.HOST.serve(path[1], new Request(new URL(path[2] + url.search, url.origin), req));
    }
    return platform.fetch(req, env, ctx);
  },
};
