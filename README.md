# workerd-vibe-platform

A small app platform on workerd: send TypeScript as text, get a running app at `<name>.localhost:8080`
a few milliseconds later. No build container, no bundler, no Node in the deploy path. Each app runs in its
own isolate with no network access.

It's the shape of a vibe-coding platform: an editor or an agent writes `index.tsx`, `PUT`s it, and opens
the URL.

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

## Results

| | |
|---|---|
| Deploy (`PUT`, strip + store) | ~5 ms for two files |
| First request to a new version | ~14 ms, including isolate start |
| Warm request | ~3 ms |
| Stripping | 1–12 ms per deploy |
| Memory | 55 MB platform; ~3.8 MB per running app (100 apps: 439 MB) |
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
| `platform/compile.ts` | Sucrase per file, then pin library imports to the root |
| `platform/registry.ts` | Durable Object with SQLite: app name, version, source, compiled modules |
| `platform/libs.ts` | What apps can import |
| `platform/ui.ts` | Editor page |
| `examples/` | `starter` (official Hono starter), `notes` (enum, private field, validator), `page` (TSX components) |
| `deploy.sh` | Deploy a folder with curl |
| `vendor/` | Hono (`vendor.sh`) and `sucrase.js` |

The platform itself is TypeScript too, run as written through `typescript_strip_types`.

## Run

```bash
docker compose up -d --build                # http://localhost:8080
./deploy.sh examples/notes                  # → http://notes.localhost:8080/
curl -X PUT -H 'content-type: application/json' \
  -d '{"files":{"index.ts":"export default { fetch: () => new Response(\"hi\") }"}}' \
  localhost:8080/api/apps/hi                # what an agent would send
docker compose down -v                      # remove all apps
```

## Building vendor/sucrase.js

The one place Node shows up: once, to bundle Sucrase into a single ES module. It is not in the deploy path.

```bash
docker run --rm -v "$PWD/vendor:/out" -w /tmp node:24-slim sh -c \
  'npm i -s sucrase@3.35.1 esbuild@0.28.1 && echo "export { transform } from \"sucrase\";" > e.js && \
   npx esbuild e.js --bundle --format=esm --platform=neutral --main-fields=module,main --minify --outfile=/out/sucrase.js'
```

## Not done

- Bindings per app (storage, AI) passed through `env` as capabilities.
- A list of allowed hosts through `globalOutbound` instead of no network.
- An AI endpoint that writes the files. The deploy API is already what an agent needs.
- CPU and memory limits per app. workerd has none of Cloudflare's production limits.
