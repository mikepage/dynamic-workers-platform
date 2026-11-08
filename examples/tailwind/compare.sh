#!/bin/bash
# Compare the CSS this app builds inside the Worker with @tailwindcss/postcss in Node, for
# the same styles.css and the same rendered page. Deploy the app first:
#   ./deploy.sh examples/tailwind && ./examples/tailwind/compare.sh
# Node runs here only to produce the reference output.
set -eu
cd "$(dirname "$0")"
platform=${PLATFORM:-http://localhost:8080}
out=$(mktemp -d)
cp styles.css brand.ts "$out/"
curl -fsS "$platform/apps/tailwind/" > "$out/rendered.html"

# Split the page into the Worker's CSS and the HTML without it.
perl -0ne 'print $1 if /<style>(.*?)<\/style>/s' "$out/rendered.html" > "$out/worker.css"
perl -0pe 's/<style>.*?<\/style>//s' "$out/rendered.html" > "$out/page.html"
# PostCSS scans files, so point it at the page and nothing else.
perl -pe 's/\@import "tailwindcss";/\@import "tailwindcss" source(none);\n\@source ".\/page.html";/' styles.css > "$out/input.css"

cat > "$out/run.mjs" <<'EOF'
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFileSync, writeFileSync } from "node:fs";
const input = readFileSync("input.css", "utf8");
for (const optimize of [false, true]) {
  const out = await postcss([tailwind({ base: process.cwd(), optimize })]).process(input, { from: "styles.css" });
  writeFileSync(optimize ? "postcss-optimized.css" : "postcss.css", out.css);
}
EOF
docker run --rm -v "$out:/work" -w /work node:24-slim sh -c \
  'npm i -s --no-save postcss@8 @tailwindcss/postcss@4.3.5 tailwindcss@4.3.5 >/dev/null 2>&1 && node run.mjs'

cd "$out"
for f in worker.css postcss.css postcss-optimized.css; do
  printf '%-22s %6s bytes, %5s gzipped\n' "$f" "$(wc -c < "$f" | tr -d ' ')" "$(gzip -c "$f" | wc -c | tr -d ' ')"
done
echo "Rules that differ between worker.css and postcss.css:"
diff <(sed 's/^ *//' worker.css | sort -u) <(sed 's/^ *//' postcss.css | sort -u) || true
echo "Files in $out"
