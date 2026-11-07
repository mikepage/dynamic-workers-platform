# workerd-vibe-platform

A small app platform built as a Worker. `PUT` TypeScript as text and get a running app at `<name>.localhost:8080`.
It runs locally on workerd, the open-source runtime behind Cloudflare Workers.

- **Build:** [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler) 0.2.6,
  inside the platform Worker. It runs esbuild as WebAssembly, fetches npm packages from `package.json`, and
  bundles each app into one module.
- **Run:** Worker Loader (Dynamic Workers). Each app gets its own isolate and `globalOutbound: null`.
- **Store:** a Durable Object with SQLite keeps each app's source and built modules.
- **Runtime:** workerd `v1.20261107.1` with `--experimental`, in `debian:13-slim`.

This is how [VibeSDK](https://github.com/cloudflare/vibesdk) builds previews.

worker-bundler is experimental and says so on its first `createWorker()` call. It resolves imports through its
own esbuild plugin, `virtual-fs`, against the files you send and the packages it fetched.

## Measurements

Four apps, five deploys each, on a fresh platform. Raw data: [`results/`](results/).

| | |
|---|---|
| Build, small Hono app | 450–530 ms; 837 ms for the first after a restart |
| Build with `zod` and `marked` | 1.5–1.6 s, 909 KB bundle |
| Bundle size, Hono apps | 45–73 KB |
| First request to a new version | 8–17 ms; 25–27 ms for the npm app |
| Warm request | 3–6 ms |
| Platform memory | 105 MB idle, 419 MB after the first build |

The first build loads esbuild's WebAssembly, about 310 MB, which stays until restart.

## Surprises

- **A missing package deploys.** `virtual-fs` marks an import it can't resolve as external. The app then fails
  on its first request: `502 … No such module "left-pad"`.
- **JSX is React's by default.** The platform passes `jsx: "automatic"` and `jsxImportSource: "hono/jsx"`.
  Without them a Hono TSX app throws `React is not defined`.
- **Loaded Workers need their own flags.** Experimental flags on the platform don't carry over to the apps it loads.

## Advice

- Run the bundler in its own Worker or Durable Object, apart from the one serving traffic.
- Check imports against `package.json` before accepting a deploy, so the agent gets the error.
- Plan for about half a second per preview.
- Pin your workerd and worker-bundler versions.

## Layout

| Path | What |
|---|---|
| `config.capnp` | Platform Worker, Worker Loader and Durable Object bindings |
| `platform/index.ts` | `<name>.localhost` → app; UI and deploy API on `localhost` |
| `platform/bundle.ts` | The build, with a default `package.json` and Hono JSX |
| `platform/registry.ts` | App registry in SQLite |
| `platform/ui.ts` | Editor page |
| `examples/` | `starter` (Hono starter), `notes` (enum, validator), `page` (TSX components), `npm` (`zod`, `marked`) |
| `deploy.sh`, `measure.sh` | Deploy a folder with curl; log build, request times, size and memory |
| `vendor/` | `worker-bundler.js`, `esbuild.wasm`, and the Hono the platform UI uses (`vendor.sh`) |

## Run

```bash
docker compose up -d --build                # http://localhost:8080
./deploy.sh examples/page                   # → http://page.localhost:8080/
./measure.sh                                # writes results/
docker compose down -v                      # remove all apps
```

An agent sends JSON:

```bash
curl -X PUT -H 'content-type: application/json' \
  -d '{"files":{"index.ts":"export default { fetch: () => new Response(\"hi\") }"}}' \
  localhost:8080/api/apps/hi
```

## Rebuilding vendor/worker-bundler.js

```bash
docker run --rm -v "$PWD/vendor:/out" -w /tmp node:24-slim sh -c \
  'npm i -s @cloudflare/worker-bundler@0.2.6 esbuild@0.28.1 && \
   echo "export { createWorker, createApp } from \"@cloudflare/worker-bundler\";" > e.js && \
   npx esbuild e.js --bundle --format=esm --platform=neutral --main-fields=module,main --minify \
     --external:./esbuild.wasm --outfile=/out/worker-bundler.js && \
   cp node_modules/@cloudflare/worker-bundler/dist/esbuild.wasm /out/'
```
