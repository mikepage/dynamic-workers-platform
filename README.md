# dynamic-workers-platform

An open-source vibe-coding example you run yourself. Describe an app, Workers AI writes it, and it runs a second
later at `/apps/<name>/`. The platform is a Worker, run locally on workerd, the open-source runtime behind
Cloudflare Workers.

- **Write:** Workers AI through the `AI` binding (`env.AI.run()`). On workerd, `AI` is a small Worker with the same
  `run()` that calls the Workers AI REST API (`platform/ai.ts`). Models: Kimi K2.7 Code, Qwen2.5 Coder.
- **Build:** [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler) 0.2.6,
  inside the platform Worker. It runs esbuild as WebAssembly, fetches npm packages from `package.json`, and
  bundles each app into one module.
- **Run:** Worker Loader (Dynamic Workers). Each app gets its own isolate and `globalOutbound: null`.
- **Store:** a Durable Object with SQLite keeps each app's source and built modules.
- **Runtime:** workerd `v1.20261107.1` with `--experimental`, in `debian:13-slim`.

This is how [VibeSDK](https://github.com/cloudflare/vibesdk) builds previews.

## The build loop

`POST /api/apps/<name>/generate` with `{ prompt }`, or the builder page at `localhost:8080`:

1. The model writes the files, or changes them if the app exists.
2. Every import is checked against `package.json`.
3. worker-bundler builds the app.
4. The platform starts it and requests `GET /`.
5. Any failure goes back to the model as the next message. Three attempts.

The app is stored only after it answers. The builder shows each attempt, the files, and the running app.

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

- **A missing package deploys.** `virtual-fs` marks an import it can't resolve as external, and the app fails on
  its first request. The platform checks imports against `package.json` before building.
- **JSX is React's by default.** The platform passes `jsx: "automatic"` and `jsxImportSource: "hono/jsx"`.
  Without them a Hono TSX app throws `React is not defined`.
- **Loaded Workers need their own flags.** Experimental flags on the platform don't carry over to the apps it loads.

## Advice

- Run the bundler in its own Worker or Durable Object, apart from the one serving traffic.
- Check imports and request the app before accepting a deploy, so the model gets the error.
- Plan for about half a second per preview.
- Pin your workerd and worker-bundler versions.

## Layout

| Path | What |
|---|---|
| `config.capnp` | Platform Worker, Worker Loader and Durable Object bindings |
| `platform/index.ts` | `/apps/<name>/` → app; builder, deploy and generate API |
| `platform/generate.ts` | Prompt, model call, file parsing and the retry loop |
| `platform/ai.ts` | `AI` binding for workerd, over the Workers AI REST API |
| `platform/bundle.ts` | Import check, then the build with a default `package.json` and Hono JSX |
| `platform/registry.ts` | App registry in SQLite |
| `platform/ui.ts` | Builder page |
| `examples/` | `starter` (Hono starter), `notes` (enum, validator), `page` (TSX components), `npm` (`zod`, `marked`) |
| `deploy.sh`, `measure.sh` | Deploy a folder with curl; log build, request times, size and memory |
| `vendor/` | `worker-bundler.js`, `esbuild.wasm`, and the Hono the platform UI uses (`vendor.sh`) |

## Run

Copy `.env.example` to `.env` and fill in your account ID and a Workers AI API token.

```bash
docker compose up -d --build                # builder at http://localhost:8080
./deploy.sh examples/page                   # → http://localhost:8080/apps/page/
./measure.sh                                # writes results/
docker compose down -v                      # remove all apps
```

From a script or another agent:

```bash
curl -X POST -H 'content-type: application/json' \
  -d '{"prompt":"A todo list with priorities"}' localhost:8080/api/apps/todo/generate
```

The platform listens on 127.0.0.1 only. Anyone who can reach it can spend your Workers AI quota.

## Rebuilding vendor/worker-bundler.js

```bash
docker run --rm -v "$PWD/vendor:/out" -w /tmp node:24-slim sh -c \
  'npm i -s @cloudflare/worker-bundler@0.2.6 esbuild@0.28.1 && \
   echo "export { createWorker, createApp } from \"@cloudflare/worker-bundler\";" > e.js && \
   npx esbuild e.js --bundle --format=esm --platform=neutral --main-fields=module,main --minify \
     --external:./esbuild.wasm --outfile=/out/worker-bundler.js && \
   cp node_modules/@cloudflare/worker-bundler/dist/esbuild.wasm /out/'
```
