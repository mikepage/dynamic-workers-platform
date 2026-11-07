#!/bin/sh
# Fetch the Hono entries the platform itself imports, with curl, no npm.
# Each is a self-contained ES module from jsDelivr. Apps don't use these:
# worker-bundler fetches their Hono from npm at build time.
# vendor/worker-bundler.js and vendor/esbuild.wasm are built separately: see README.
set -eu
HONO=5.0.0-rc.1

# <import name after "hono/">:<file in Hono's dist/>
ENTRIES="
index:index
html:helper/html/index
"

cd "$(dirname "$0")"
rm -rf vendor/hono && mkdir -p vendor/hono

for entry in $ENTRIES; do
  name=${entry%%:*}
  path=${entry#*:}
  curl -fsSL -o "vendor/hono/$name.js" "https://cdn.jsdelivr.net/npm/hono@${HONO}/dist/${path}.js/+esm"
  # jsDelivr appends a sourceMappingURL to its own CDN; drop it.
  sed -i.bak '/^\/\/# sourceMappingURL=/d' "vendor/hono/$name.js" && rm "vendor/hono/$name.js.bak"
done

curl -fsSL -o vendor/hono.tgz "https://registry.npmjs.org/hono/-/hono-${HONO}.tgz"
tar -xzf vendor/hono.tgz -C vendor/hono --strip-components=1 package/LICENSE
rm vendor/hono.tgz
