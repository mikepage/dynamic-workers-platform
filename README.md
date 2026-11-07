# workerd-vibe-platform

A small app platform on workerd. Send TypeScript as text and get a running app at `<name>.localhost:8080`.
Each app runs in its own isolate with no network access.

It's the shape of a vibe-coding platform: an editor or an agent writes `index.tsx`, `PUT`s it, and opens the
URL. There's no build container. The platform builds each app itself with Cloudflare's
`@cloudflare/worker-bundler` and runs the result as a Dynamic Worker through Worker Loader.

[VibeSDK](https://github.com/cloudflare/vibesdk) works the same way. Its setup docs call the old Sandbox
container, a Bun image that ran installs and builds, "the retired sandbox preview path".

## Why there's a build at all

Worker Loader takes JavaScript only. Pass it `index.ts` and it answers:

> Module name must end with '.js' or '.py' … If you're trying to load TypeScript, bundle it first with
> '@cloudflare/worker-bundler' and pass the generated JavaScript modules.

workerd can strip TypeScript types itself (`typescript_strip_types`), but only for modules in `config.capnp`.
Code loaded at runtime never goes through it. So something has to build, and worker-bundler does it inside
the Worker: esbuild compiled to WebAssembly, npm packages fetched from `package.json`, one bundled module out.

worker-bundler is experimental. The first `createWorker()` call logs "This package is experimental and its API
may change without notice". There's no file system in a Worker, so it gives esbuild its own plugin,
`virtual-fs`, that resolves imports against the files you pass in and the packages it fetched. This repo pins
version 0.2.6.

## What it costs

Four apps, five deploys each, on a fresh platform. Raw data: [`results/`](results/).

| | |
|---|---|
| Build, small Hono app | 450–530 ms; 837 ms for the first after a restart |
| Build with `zod` and `marked` | 1.5–1.6 s, 909 KB bundle |
| Bundle size, Hono apps | 45–73 KB (Hono tree-shaken in) |
| First request to a new version | 8–17 ms; 25–27 ms for the npm app |
| Warm request | 3–6 ms |
| Platform memory | 105 MB idle, 419 MB after the first build |

The first build loads esbuild's WebAssembly, and the platform grows by about 310 MB. It stays that size until
restart. After that, each deploy adds a few MB more while old versions wait to be unloaded.

The npm app only answers `POST /`, so its request timings are for a 404 from a started isolate.

## Surprises

- **A missing package passes the build.** When the `virtual-fs` plugin can't resolve an import, it marks it
  external instead of failing. The deploy succeeds and the app fails on its first request:
  `502 App bad failed: … No such module "left-pad"`.
- **JSX defaults to React.** Without `jsx: "automatic"` and `jsxImportSource: "hono/jsx"`, a Hono TSX app builds
  fine and throws `React is not defined` on every request. The platform sets both (`platform/bundle.ts`).
- **Worker Loader is experimental.** The binding needs `workerd serve --experimental`, and Workers loaded at
  runtime don't inherit experimental flags from the platform.
- **Every loaded module needs an explicit type** unless its name ends in `.js` or `.py`. worker-bundler's output
  already has them.
- **No network for apps.** `globalOutbound: null` makes `fetch()` in an app throw "This worker is not permitted
  to access the internet via global functions like fetch()".

## What to do with this

- Run the bundler in its own Worker or Durable Object, not the one serving traffic. Its memory shouldn't sit
  next to your requests.
- Check every import against `package.json` before you accept a deploy. An agent can fix an error it gets back.
  A 502 later goes unseen.
- Expect about half a second per preview. Fine for an agent loop, too slow for keystroke-speed live reload.
- If you self-host, pass `--experimental` and pin your workerd and worker-bundler versions.

## Layout

| Path | What |
|---|---|
| `config.capnp` | The platform Worker with its Worker Loader and Durable Object bindings |
| `platform/index.ts` | Routing: `<name>.localhost` → app, platform UI and deploy API on `localhost` |
| `platform/bundle.ts` | The build: `@cloudflare/worker-bundler` with a default `package.json` and Hono JSX |
| `platform/registry.ts` | Durable Object with SQLite: app name, version, source, built modules |
| `platform/ui.ts` | Editor page |
| `examples/` | `starter` (official Hono starter), `notes` (enum, private field, validator), `page` (TSX components in a folder), `npm` (`zod` and `marked` from `package.json`) |
| `deploy.sh` | Deploy a folder with curl |
| `measure.sh` | Deploy each example five times and log build, deploy, first and warm request, size and memory |
| `vendor/` | `worker-bundler.js`, `esbuild.wasm`, and the Hono the platform itself uses (`vendor.sh`) |

The platform's own code is TypeScript too, run as written through `typescript_strip_types`.

## Run

```bash
docker compose up -d --build                # http://localhost:8080
./deploy.sh examples/page                   # → http://page.localhost:8080/
./deploy.sh examples/npm                    # npm packages from package.json
./measure.sh                                # writes results/
curl -X PUT -H 'content-type: application/json' \
  -d '{"files":{"index.ts":"export default { fetch: () => new Response(\"hi\") }"}}' \
  localhost:8080/api/apps/hi                # what an agent would send
docker compose down -v                      # remove all apps
```

## Building vendor/worker-bundler.js

The one place Node shows up: once, to bundle worker-bundler into a single ES module. It is not in the deploy
path.

```bash
docker run --rm -v "$PWD/vendor:/out" -w /tmp node:24-slim sh -c \
  'npm i -s @cloudflare/worker-bundler@0.2.6 esbuild@0.28.1 && \
   echo "export { createWorker, createApp } from \"@cloudflare/worker-bundler\";" > e.js && \
   npx esbuild e.js --bundle --format=esm --platform=neutral --main-fields=module,main --minify \
     --external:./esbuild.wasm --outfile=/out/worker-bundler.js && \
   cp node_modules/@cloudflare/worker-bundler/dist/esbuild.wasm /out/'
```

## Not done

- Bindings per app (storage, AI) passed through `env`.
- A list of allowed hosts through `globalOutbound` instead of no network.
- An AI endpoint that writes the files. The deploy API is already what an agent needs.
- Running the bundler in its own Durable Object.
- Checking imports against `package.json` at deploy.
- CPU and memory limits per app. workerd has none of Cloudflare's production limits.
