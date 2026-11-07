import { Hono } from "hono";
import { BuildError, bundle, type Files } from "./bundle.ts";
import type { Registry } from "./registry.ts";
import { ui } from "./ui.ts";

export { Registry } from "./registry.ts";

type Env = {
  LOADER: WorkerLoader;
  REGISTRY: DurableObjectNamespace<Registry>;
};

// Apps live at <name>.localhost:8080. Browsers resolve *.localhost to 127.0.0.1.
const APP_HOST = /^([a-z0-9-]{1,32})\.localhost(:\d+)?$/;
const APP_NAME = /^[a-z0-9-]{1,32}$/;
const COMPAT_DATE = "2026-11-01";

const registry = (env: Env) => env.REGISTRY.get(env.REGISTRY.idFromName("registry"));

const appUrl = (name: string, req: Request) => {
  const url = new URL(req.url);
  return `${url.protocol}//${name}.localhost${url.port ? `:${url.port}` : ""}/`;
};

// Run one request through an app. Worker Loader caches the isolate per name@version,
// so a deploy starts a fresh isolate and the old one is unloaded once idle.
async function serveApp(env: Env, name: string, req: Request): Promise<Response> {
  const app = await registry(env).get(name);
  if (!app) return new Response(`No app named ${name}. Deploy one at the platform root.`, { status: 404 });
  const worker = env.LOADER.get(`${name}@${app.version}`, async () => ({
    compatibilityDate: COMPAT_DATE,
    mainModule: app.mainModule,
    modules: app.modules,
    // No network for generated code. Swap in a service here to allow a list of hosts.
    globalOutbound: null,
  }));
  try {
    return await worker.getEntrypoint().fetch(req);
  } catch (e) {
    return new Response(`App ${name} failed:\n${(e as Error).message}`, { status: 502 });
  }
}

// A deploy is JSON ({ files }) from an editor or an agent, or multipart from curl:
//   curl -X PUT -F index.ts=@index.ts -F db.ts=@db.ts localhost:8080/api/apps/notes
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

platform.get("/", async (c) => c.html(ui(await registry(c.env).list())));

platform.get("/api/apps", async (c) => c.json(await registry(c.env).list()));

platform.get("/api/apps/:name", async (c) => {
  const files = await registry(c.env).source(c.req.param("name"));
  return files ? c.json({ files }) : c.json({ error: "not found" }, 404);
});

// Deploy: TypeScript in, running app out. The build runs here, not in a container.
// Send a package.json to use npm packages.
platform.put("/api/apps/:name", async (c) => {
  const name = c.req.param("name");
  if (!APP_NAME.test(name)) return c.json({ error: "name: lowercase letters, digits and dashes" }, 400);
  const files = await readFiles(c.req.raw);
  if (!files) return c.json({ error: 'send JSON { files: { "index.ts": "..." } } or multipart, one field per file' }, 400);
  try {
    const { modules, mainModule, ms } = await bundle(files);
    const version = await registry(c.env).put(name, files, mainModule, modules);
    const size = JSON.stringify(modules).length;
    return c.json({ name, version, url: appUrl(name, c.req.raw), buildMs: Math.round(ms * 10) / 10, moduleBytes: size });
  } catch (e) {
    if (e instanceof BuildError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const host = new URL(req.url).hostname + (new URL(req.url).port ? `:${new URL(req.url).port}` : "");
    const match = (req.headers.get("host") ?? host).match(APP_HOST);
    if (match) return serveApp(env, match[1], req);
    return platform.fetch(req, env, ctx);
  },
};
