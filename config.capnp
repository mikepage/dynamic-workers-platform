using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "platform", worker = .platform),
    (name = "data", disk = (path = "/data", writable = true)),
  ],
  sockets = [
    (name = "http", address = "*:8080", http = (), service = "platform"),
  ],
);

# The platform itself is TypeScript too, run as written (typescript_strip_types).
# Module names are flat so bare imports like "hono" resolve; `embed` reads from platform/.
# Worker Loader is experimental: run with `workerd serve --experimental`.
const platform :Workerd.Worker = (
  compatibilityDate = "2026-11-01",
  compatibilityFlags = ["typescript_strip_types"],
  modules = [
    (name = "index.ts", esModule = embed "platform/index.ts"),
    (name = "registry.ts", esModule = embed "platform/registry.ts"),
    (name = "bundle.ts", esModule = embed "platform/bundle.ts"),
    (name = "ui.ts", esModule = embed "platform/ui.ts"),

    # What the platform itself imports.
    (name = "hono", esModule = embed "vendor/hono/index.js"),
    (name = "hono/html", esModule = embed "vendor/hono/html.js"),
    # @cloudflare/worker-bundler, bundled once with Node; it imports "./esbuild.wasm".
    (name = "worker-bundler", esModule = embed "vendor/worker-bundler.js"),
    (name = "esbuild.wasm", wasm = embed "vendor/esbuild.wasm"),
  ],
  durableObjectNamespaces = [
    (className = "Registry", uniqueKey = "vibe-platform-registry", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "data"),
  bindings = [
    (name = "LOADER", workerLoader = (id = "apps")),
    (name = "REGISTRY", durableObjectNamespace = "Registry"),
  ],
);
