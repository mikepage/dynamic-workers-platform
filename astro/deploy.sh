#!/bin/bash
# Build this Astro app with Node in a container, then deploy the build output to the
# platform as a Dynamic Worker: ./astro/deploy.sh [name]
# worker-bundler can't build .astro files, so the build happens here, not in the platform.
set -eu
cd "$(dirname "$0")"
name=${1:-astro}
platform=${PLATFORM:-http://localhost:8080}

docker run --rm -v "$PWD:/app" -w /app -e ASTRO_TELEMETRY_DISABLED=1 node:24-slim \
  sh -c 'npm install --no-audit --no-fund --loglevel=error && npx astro build'

# The platform wants an index.js entry; Astro's is dist/server/entry.mjs.
args=(-F 'index.js=export { default } from "./entry.mjs";')
while IFS= read -r f; do
  args+=(-F "${f#dist/server/}=@$f")
done < <(find dist/server -name '*.mjs' | sort)
curl -sS -X PUT "${args[@]}" "$platform/api/apps/$name"
echo
