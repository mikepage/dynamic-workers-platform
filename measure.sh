#!/bin/bash
# Compare the two deploy paths on the same apps. Run against a freshly started platform:
#   docker compose down -v && docker compose up -d && sleep 4 && ./measure.sh
# Writes results/compare-<timestamp>.tsv.
set -eu
cd "$(dirname "$0")"
platform=${PLATFORM:-http://localhost:8080}
RUNS=${RUNS:-5}
mkdir -p results
out=results/compare-$(date +%Y%m%d-%H%M%S).tsv
printf "app\tbuild\trun\tbuild_ms\tdeploy_s\tfirst_s\twarm_s\tmodule_bytes\tmem\n" | tee "$out"

mem() { docker stats --no-stream --format '{{.MemUsage}}' workerd-vibe-platform-platform-1 | cut -d/ -f1 | tr -d ' '; }

deploy() { # folder name build -> JSON
  local args=()
  while IFS= read -r f; do args+=(-F "${f#"$1"/}=@$f"); done \
    < <(find "$1" -type f \( -name '*.ts' -o -name '*.tsx' -o -name package.json \) | sort)
  curl -sS -X PUT "${args[@]}" -w '\t%{time_total}' "$platform/api/apps/$2?build=$3"
}

field() { echo "$1" | sed -E "s/.*\"$2\":([0-9.]+).*/\1/"; }

for build in strip bundle; do
  for app in starter notes page; do
    for run in $(seq 1 "$RUNS"); do
      name="$app-$build"
      res=$(deploy "examples/$app" "$name" "$build")
      json=${res%$'\t'*}
      deploy_s=${res##*$'\t'}
      first=$(curl -s -o /dev/null -w '%{time_total}' "http://$name.localhost:8080/")
      warm=$(curl -s -o /dev/null -w '%{time_total}' "http://$name.localhost:8080/")
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$app" "$build" "$run" \
        "$(field "$json" buildMs)" "$deploy_s" "$first" "$warm" "$(field "$json" moduleBytes)" "$(mem)" | tee -a "$out"
    done
  done
done
echo "wrote $out"
