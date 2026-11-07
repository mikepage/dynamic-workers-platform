#!/bin/sh
# Fetch Hono with curl, no npm. For each entry below:
#   vendor/hono/<name>.js     self-contained ES module from jsDelivr, loaded by workerd as "hono/<name>"
#   vendor/hono/<name>.d.ts   one line pointing tsc at Hono's own types in vendor/hono/types/
# Bump HONO or edit ENTRIES and rerun. The platform hands every entry to every app.
# vendor/sucrase.js is built separately: see README.
set -eu
HONO=5.0.0-rc.1

# <import name after "hono/">:<file in Hono's dist/, from package.json "exports">
ENTRIES="
index:index
html:helper/html/index
cookie:helper/cookie/index
factory:helper/factory/index
streaming:helper/streaming/index
http-exception:http-exception
validator:validator/index
logger:middleware/logger/index
cors:middleware/cors/index
secure-headers:middleware/secure-headers/index
etag:middleware/etag/index
request-id:middleware/request-id/index
timing:middleware/timing/index
body-limit:middleware/body-limit/index
csrf:middleware/csrf/index
jsx:jsx/index
jsx/jsx-runtime:jsx/jsx-runtime
"

cd "$(dirname "$0")"
rm -rf vendor/hono && mkdir -p vendor/hono/types

for entry in $ENTRIES; do
  name=${entry%%:*}
  path=${entry#*:}
  mkdir -p "$(dirname "vendor/hono/$name.js")"
  curl -fsSL -o "vendor/hono/$name.js" "https://cdn.jsdelivr.net/npm/hono@${HONO}/dist/${path}.js/+esm"
  # jsDelivr appends a sourceMappingURL to its own CDN; drop it.
  sed -i.bak '/^\/\/# sourceMappingURL=/d' "vendor/hono/$name.js" && rm "vendor/hono/$name.js.bak"
  up=$(echo "$name" | sed -E 's#[^/]+#..#g; s#\.\.$##'); echo "export * from \"./${up}types/${path}.js\";" > "vendor/hono/$name.d.ts"
done

curl -fsSL -o vendor/hono.tgz "https://registry.npmjs.org/hono/-/hono-${HONO}.tgz"
tar -xzf vendor/hono.tgz -C vendor/hono/types --strip-components=2 --include='package/dist/*.d.ts' --include='package/dist/**/*.d.ts'
tar -xzf vendor/hono.tgz -C vendor/hono --strip-components=1 package/LICENSE
rm vendor/hono.tgz
