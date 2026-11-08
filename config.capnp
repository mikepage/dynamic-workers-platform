using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "boot", worker = .boot),
    (name = "data", disk = (path = "/data", writable = true)),
  ],
  sockets = [
    (name = "http", address = "*:8080", http = (), service = "boot"),
  ],
);

# The loader Worker is plain JavaScript, so it needs no build and no experimental
# compatibility flag. It builds platform/ with worker-bundler and runs it with Worker
# Loader. Worker Loader itself still needs `workerd serve --experimental`.
const boot :Workerd.Worker = (
  compatibilityDate = "2026-11-01",
  modules = [
    (name = "boot.js", esModule = embed "boot.js"),
    # @cloudflare/worker-bundler, bundled once with Node; it imports "./esbuild.wasm".
    (name = "worker-bundler", esModule = embed "vendor/worker-bundler.js"),
    (name = "esbuild.wasm", wasm = embed "vendor/esbuild.wasm"),

    # The platform's TypeScript, as text. boot.js builds it.
    (name = "platform/index.ts", text = embed "platform/index.ts"),
    (name = "platform/checks.ts", text = embed "platform/checks.ts"),
    (name = "platform/generate.ts", text = embed "platform/generate.ts"),
    (name = "platform/ui.ts", text = embed "platform/ui.ts"),
    (name = "platform/package.json", text = embed "platform/package.json"),
  ],
  durableObjectNamespaces = [
    (className = "Registry", uniqueKey = "vibe-platform-registry", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "data"),
  bindings = [
    (name = "LOADER", workerLoader = (id = "apps")),
    (name = "REGISTRY", durableObjectNamespace = "Registry"),
    # Loopback bindings to boot.js's own entrypoints, passed on to the platform.
    (name = "HOST", service = (name = "boot", entrypoint = "Host")),
    (name = "AI", service = (name = "boot", entrypoint = "WorkersAI")),
    (name = "CLOUDFLARE_ACCOUNT_ID", fromEnvironment = "CLOUDFLARE_ACCOUNT_ID"),
    (name = "CLOUDFLARE_API_TOKEN", fromEnvironment = "CLOUDFLARE_API_TOKEN"),
  ],
);
