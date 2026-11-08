// The loader Worker. Plain JavaScript, so workerd runs it with no build and no
// experimental compatibility flag. It does three things:
//   1. holds the real bindings: Worker Loader, the Durable Object, the Workers AI account
//   2. builds the platform's TypeScript (platform/) with worker-bundler
//   3. runs the platform as a Dynamic Worker and hands it HOST and AI as bindings
// Everything else, including the builder, lives in TypeScript under platform/.

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { createWorker } from "worker-bundler";
import checksTs from "platform/checks.ts";
import generateTs from "platform/generate.ts";
import indexTs from "platform/index.ts";
import packageJson from "platform/package.json";
import uiTs from "platform/ui.ts";

const COMPAT_DATE = "2026-11-01";
const PLATFORM = {
  "index.ts": indexTs,
  "checks.ts": checksTs,
  "generate.ts": generateTs,
  "ui.ts": uiTs,
  "package.json": packageJson,
};

// Apps that send no package.json still get Hono.
const DEFAULT_PACKAGE = JSON.stringify({ dependencies: { hono: "5.0.0-rc.1" } });

async function build(files, entryPoint) {
  const start = performance.now();
  const result = await createWorker({
    files: { "package.json": DEFAULT_PACKAGE, ...files },
    entryPoint,
    // esbuild defaults to React's classic JSX; these apps use Hono's.
    jsx: "automatic",
    jsxImportSource: "hono/jsx",
    // A Worker serves CSS, it doesn't bundle it: `import css from "./app.css"` is a string.
    loader: { ".css": "text" },
  });
  return { mainModule: result.mainModule, modules: result.modules, ms: performance.now() - start };
}

// One isolate per name@hash, with no network.
const load = (env, name, hash, built) =>
  env.LOADER.get(`${name}@${hash}`, async () => ({
    compatibilityDate: COMPAT_DATE,
    mainModule: built.mainModule,
    modules: built.modules,
    globalOutbound: null,
  }));

const registry = (env) => env.REGISTRY.get(env.REGISTRY.idFromName("registry"));

// Every deployed app, in SQLite.
export class Registry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS apps (
      name TEXT PRIMARY KEY, version INTEGER NOT NULL, hash TEXT NOT NULL, main TEXT NOT NULL,
      files TEXT NOT NULL, modules TEXT NOT NULL, updated TEXT NOT NULL)`);
  }
  put(name, files, hash, mainModule, modules) {
    return this.sql.exec(
      `INSERT INTO apps (name, version, hash, main, files, modules, updated)
       VALUES (?, 1, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (name) DO UPDATE SET version = version + 1, hash = excluded.hash, main = excluded.main,
         files = excluded.files, modules = excluded.modules, updated = excluded.updated
       RETURNING version`,
      name, hash, mainModule, JSON.stringify(files), JSON.stringify(modules),
    ).one().version;
  }
  get(name) {
    const [r] = [...this.sql.exec("SELECT hash, main, modules FROM apps WHERE name = ?", name)];
    return r ? { hash: r.hash, mainModule: r.main, modules: JSON.parse(r.modules) } : null;
  }
  source(name) {
    const [r] = [...this.sql.exec("SELECT files FROM apps WHERE name = ?", name)];
    return r ? JSON.parse(r.files) : null;
  }
  remove(name) {
    return this.sql.exec("DELETE FROM apps WHERE name = ?", name).rowsWritten > 0;
  }
  list() {
    return [...this.sql.exec("SELECT name, version, updated FROM apps ORDER BY updated DESC")];
  }
}

// HOST: what the platform may do. It never sees Worker Loader or the Durable Object.
export class Host extends WorkerEntrypoint {
  build(files, entryPoint) {
    return build(files, entryPoint);
  }
  // Start an app and request GET /. Throws if it fails to start or throws.
  async smoke(name, hash, built) {
    const res = await load(this.env, name, hash, built).getEntrypoint().fetch(new Request("http://app/"));
    return { status: res.status, body: (await res.text()).slice(0, 2000) };
  }
  async serve(name, request) {
    const app = await registry(this.env).get(name);
    if (!app) return new Response(`No app named ${name}.`, { status: 404 });
    try {
      return await load(this.env, name, app.hash, app).getEntrypoint().fetch(request);
    } catch (e) {
      return new Response(`App ${name} failed:\n${e.message}`, { status: 502 });
    }
  }
  put(name, files, hash, mainModule, modules) {
    return registry(this.env).put(name, files, hash, mainModule, modules);
  }
  source(name) {
    return registry(this.env).source(name);
  }
  remove(name) {
    return registry(this.env).remove(name);
  }
  list() {
    return registry(this.env).list();
  }
}

// AI: the same run() as the Workers AI binding on Cloudflare, over the REST API.
export class WorkersAI extends WorkerEntrypoint {
  async run(model, input) {
    const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = this.env;
    if (!account || !token) throw new Error("Workers AI needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env");
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(`Workers AI ${res.status}: ${body.errors?.map((e) => e.message).join("; ") ?? "request failed"}`);
    }
    return body.result;
  }
}

// The platform's id is a hash of its source, so editing platform/ rebuilds it.
let platformId;
async function platformHash() {
  const data = new TextEncoder().encode(JSON.stringify(PLATFORM));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    platformId ??= platformHash().then((h) => `platform@${h}`);
    const platform = env.LOADER.get(await platformId, async () => {
      const built = await build(PLATFORM, "index.ts");
      console.log(`built the platform in ${Math.round(built.ms)} ms`);
      return {
        compatibilityDate: COMPAT_DATE,
        mainModule: built.mainModule,
        modules: built.modules,
        env: { HOST: env.HOST, AI: env.AI },
        globalOutbound: null,
      };
    });
    return platform.getEntrypoint().fetch(request);
  },
};
