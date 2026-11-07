# workerd-vibe-platform

A small app platform on workerd: send TypeScript as text, get a running app at `<name>.localhost:8080`.
No build container and no Node in the deploy path. Each app runs in its own isolate with no network access.

It's the shape of a vibe-coding platform: an editor or an agent writes `index.tsx`, `PUT`s it, and opens
the URL. It has two deploy paths, so they can be measured side by side:

- **strip** (default): Sucrase removes types per file in ~2 ms. Apps import a fixed set of libraries.
- **bundle** (`?build=bundle`): Cloudflare's `@cloudflare/worker-bundler`, the path
  [VibeSDK](https://github.com/cloudflare/vibesdk) uses. esbuild runs as WebAssembly inside the platform,
  installs npm packages from `package.json`, and bundles. ~400 ms.

## Strip vs bundle

Same three apps, five deploys each, fresh platform. Raw: [`results/`](results/).

| | strip (Sucrase) | bundle (worker-bundler) |
|---|---|---|
| Build | 1–7 ms | 370–430 ms; 817 ms for the first |
| Deploy round trip | ~10 ms | ~0.4 s |
| First request to a new version | 16–30 ms | 9–12 ms |
| Warm request | ~3.5 ms | ~3.5 ms |
| Code per app | 0.2–1.4 KB, plus shared libraries | 45–51 KB (Hono tree-shaken in); 909 KB with zod + marked |
| Memory per running app | ~3.7 MB | ~2.8 MB |
| Platform memory | 107 MB | +320 MB once the first bundle runs, resident until restart |
| npm packages | no: the platform's list only | yes: `zod` and `marked` deploy and run (2.3 s build) |
| Enums, parameter properties, JSX | yes | yes |
| Missing package | 502 on first request | 502 on first request: the bundler leaves unknown imports external without a word |

What it means:

- **Strip wins the deploy loop.** 2 ms against 400 ms matters when an agent deploys after every edit.
- **Bundle wins the running app.** One tree-shaken module starts faster and uses less memory than 17 library
  modules, and it can use any npm package.
- **The bundler's cost sits in the platform.** esbuild's WebAssembly takes ~320 MB once loaded. Run it in its own
  Worker or Durable Object, away from the one serving requests.
- **Neither catches a missing package at deploy.** Check imports against `package.json` before you accept a
  deploy, or the agent finds out from a 502.

VibeSDK went the same way: its setup docs call the Sandbox container (a Bun image running installs and builds)
"the retired sandbox preview path". Previews now build with worker-bundler and run as Dynamic Workers.

## Why

Workers for Platforms, and Worker Loader under it, take JavaScript only. Deploying TypeScript from users
or an AI means compiling first, so platforms keep a container with Node and a bundler in the deploy path.
Cloudflare's own answer, `@cloudflare/worker-bundler`, moves that build inside the Worker: esbuild compiled
to WebAssembly plus the TypeScript compiler.

workerd already strips TypeScript types itself (`typescript_strip_types`), but only for modules declared in
`config.capnp`. Worker Loader never calls the stripper. Pass it `index.ts` and it answers:

> Module name must end with '.js' or '.py' … If you're trying to load TypeScript, bundle it first with
> '@cloudflare/worker-bundler' and pass the generated JavaScript modules.

So this platform strips types itself, inside workerd, one file at a time, with Sucrase (204 KB of plain JS).
No bundling: every file stays a module under its own name, and imports stay as written.

## Strip path details

| | |
|---|---|
| Deploy (`PUT`, strip + store) | ~5 ms for two files |
| First request to a new version | ~14 ms, including isolate start |
| Warm request | ~3 ms |
| Stripping | 1–12 ms per deploy |
| Memory | ~3.8 MB per running app (100 apps: +384 MB) |
| Restart | apps persist in SQLite; in-memory app state resets |

Deploys that fail say why, at the right moment:

- Syntax error: `400 {"error":"index.ts: Error transforming index.ts: Unexpected token (1:10)"}` at deploy.
- Unknown import: `502 App badimport failed: … No such module "left-pad"` on first request.
- Network: `fetch()` in an app throws "This worker is not permitted to access the internet via global
  functions like fetch(). It must use capabilities (such as bindings in 'env')".

What apps get:

- TypeScript and TSX, including enums and parameter properties: Sucrase transforms them, unlike strip-only.
- JSX through `hono/jsx`.
- `hono` and 16 `hono/*` entries under their npm names. The official Hono starter deploys unchanged
  (`examples/starter`).
- No network, no bindings, no npm packages beyond the platform's list.

## Surprises

- **Worker Loader is experimental twice over.** The binding needs `workerd serve --experimental`. Experimental
  compatibility flags in a loaded Worker also need the `experimental` flag on the platform Worker and
  `allowExperimental: true` per load, and even then `typescript_strip_types` doesn't apply to loaded code.
- **Every loaded module needs an explicit type** unless its name ends in `.js` or `.py`. `"hono": source` fails;
  `"hono": { js: source }` works. Names can keep their `.ts` extension that way, so `./store.ts` imports resolve.
- **Bare imports resolve against the importing module's folder.** `hono/jsx/jsx-runtime` from
  `components/Layout.tsx` becomes `components/hono/jsx/jsx-runtime`. The platform rewrites imports of its own
  libraries to `/hono/...` after stripping (`platform/compile.ts`).
- **A rejected `.ts` load points you at the bundler.** The fix workerd suggests is the build step this repo avoids.

## What workerd would need

One change removes Sucrase from this repo: apply `typescript_strip_types` to Worker Loader modules, the way it
already applies to config modules. Strip-only would then cover everything but enums, namespaces and JSX.

## Layout

| Path | What |
|---|---|
| `config.capnp` | The platform Worker, its Worker Loader and Durable Object bindings, libraries as text modules |
| `platform/index.ts` | Routing: `<name>.localhost` → app, platform UI and deploy API on `localhost` |
| `platform/compile.ts` | strip path: Sucrase per file, then pin library imports to the root |
| `platform/bundle.ts` | bundle path: `@cloudflare/worker-bundler` with a default `package.json` |
| `platform/registry.ts` | Durable Object with SQLite: app name, version, source, compiled modules |
| `platform/libs.ts` | What apps can import |
| `platform/ui.ts` | Editor page |
| `examples/` | `starter` (official Hono starter), `notes` (enum, private field, validator), `page` (TSX components), `npm` (zod + marked, bundle path only) |
| `measure.sh` | Deploys each example five times per path and logs build, deploy, first and warm request, size and memory |
| `deploy.sh` | Deploy a folder with curl |
| `vendor/` | Hono (`vendor.sh`), `sucrase.js`, `worker-bundler.js` and `esbuild.wasm` |

The platform itself is TypeScript too, run as written through `typescript_strip_types`.

## Run

```bash
docker compose up -d --build                # http://localhost:8080
./deploy.sh examples/notes                  # → http://notes.localhost:8080/
BUILD=bundle ./deploy.sh examples/npm       # bundle path, npm packages from package.json
./measure.sh                                # strip vs bundle, writes results/
curl -X PUT -H 'content-type: application/json' \
  -d '{"files":{"index.ts":"export default { fetch: () => new Response(\"hi\") }"}}' \
  localhost:8080/api/apps/hi                # what an agent would send
docker compose down -v                      # remove all apps
```

## Building vendor/sucrase.js and vendor/worker-bundler.js

The one place Node shows up: once, to bundle each into a single ES module. It is not in the deploy path.

```bash
docker run --rm -v "$PWD/vendor:/out" -w /tmp node:24-slim sh -c \
  'npm i -s sucrase@3.35.1 esbuild@0.28.1 && echo "export { transform } from \"sucrase\";" > e.js && \
   npx esbuild e.js --bundle --format=esm --platform=neutral --main-fields=module,main --minify --outfile=/out/sucrase.js'

docker run --rm -v "$PWD/vendor:/out" -w /tmp node:24-slim sh -c \
  'npm i -s @cloudflare/worker-bundler@0.2.6 esbuild@0.28.1 && \
   echo "export { createWorker, createApp } from \"@cloudflare/worker-bundler\";" > e.js && \
   npx esbuild e.js --bundle --format=esm --platform=neutral --main-fields=module,main --minify \
     --external:./esbuild.wasm --outfile=/out/worker-bundler.js && \
   cp node_modules/@cloudflare/worker-bundler/dist/esbuild.wasm /out/'
```

## Not done

- Bindings per app (storage, AI) passed through `env` as capabilities.
- A list of allowed hosts through `globalOutbound` instead of no network.
- An AI endpoint that writes the files. The deploy API is already what an agent needs.
- Running the bundler in its own Durable Object, so its memory stays out of the request path.
- Checking imports against `package.json` at deploy.
- CPU and memory limits per app. workerd has none of Cloudflare's production limits.
