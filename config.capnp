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
    (name = "compile.ts", esModule = embed "platform/compile.ts"),
    (name = "registry.ts", esModule = embed "platform/registry.ts"),
    (name = "bundle.ts", esModule = embed "platform/bundle.ts"),
    (name = "libs.ts", esModule = embed "platform/libs.ts"),
    (name = "ui.ts", esModule = embed "platform/ui.ts"),

    # What the platform itself imports.
    (name = "hono", esModule = embed "vendor/hono/index.js"),
    (name = "hono/html", esModule = embed "vendor/hono/html.js"),
    (name = "sucrase", esModule = embed "vendor/sucrase.js"),
    # @cloudflare/worker-bundler, bundled once with Node; it imports "./esbuild.wasm".
    (name = "worker-bundler", esModule = embed "vendor/worker-bundler.js"),
    (name = "esbuild.wasm", wasm = embed "vendor/esbuild.wasm"),

    # What apps can import. Text here, handed to each app as a module (platform/libs.ts).
    (name = "lib/hono", text = embed "vendor/hono/index.js"),
    (name = "lib/hono/body-limit", text = embed "vendor/hono/body-limit.js"),
    (name = "lib/hono/cookie", text = embed "vendor/hono/cookie.js"),
    (name = "lib/hono/cors", text = embed "vendor/hono/cors.js"),
    (name = "lib/hono/csrf", text = embed "vendor/hono/csrf.js"),
    (name = "lib/hono/etag", text = embed "vendor/hono/etag.js"),
    (name = "lib/hono/factory", text = embed "vendor/hono/factory.js"),
    (name = "lib/hono/html", text = embed "vendor/hono/html.js"),
    (name = "lib/hono/http-exception", text = embed "vendor/hono/http-exception.js"),
    (name = "lib/hono/jsx", text = embed "vendor/hono/jsx.js"),
    (name = "lib/hono/jsx/jsx-runtime", text = embed "vendor/hono/jsx/jsx-runtime.js"),
    (name = "lib/hono/logger", text = embed "vendor/hono/logger.js"),
    (name = "lib/hono/request-id", text = embed "vendor/hono/request-id.js"),
    (name = "lib/hono/secure-headers", text = embed "vendor/hono/secure-headers.js"),
    (name = "lib/hono/streaming", text = embed "vendor/hono/streaming.js"),
    (name = "lib/hono/timing", text = embed "vendor/hono/timing.js"),
    (name = "lib/hono/validator", text = embed "vendor/hono/validator.js"),
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
