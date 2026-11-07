#!/bin/bash
# Deploy each example several times and log build, deploy, first and warm request,
# bundle size and platform memory. Run against a freshly started platform:
#   docker compose down -v && docker compose up -d && sleep 4 && ./measure.sh
# Writes results/measure-<timestamp>.tsv.
set -eu
cd "$(dirname "$0")"
platform=${PLATFORM:-http://localhost:8080}
RUNS=${RUNS:-5}
mkdir -p results
out=results/measure-$(date +%Y%m%d-%H%M%S).tsv
printf "app\trun\tbuild_ms\tdeploy_s\tfirst_s\twarm_s\tmodule_bytes\tmem\n" | tee "$out"

mem() { docker stats --no-stream --format '{{.MemUsage}}' "$(docker compose ps -q platform)" | cut -d/ -f1 | tr -d ' '; }

deploy() { # folder name -> JSON
  local args=()
  while IFS= read -r f; do args+=(-F "${f#"$1"/}=@$f"); done \
    < <(find "$1" -type f \( -name '*.ts' -o -name '*.tsx' -o -name package.json \) | sort)
  curl -sS -X PUT "${args[@]}" -w '\t%{time_total}' "$platform/api/apps/$2"
}

field() { echo "$1" | sed -E "s/.*\"$2\":([0-9.]+).*/\1/"; }

printf "idle\t-\t-\t-\t-\t-\t-\t%s\n" "$(mem)" | tee -a "$out"
for app in starter notes page npm; do
  for run in $(seq 1 "$RUNS"); do
    res=$(deploy "examples/$app" "$app")
    json=${res%$'\t'*}
    deploy_s=${res##*$'\t'}
    first=$(curl -s -o /dev/null -w '%{time_total}' "http://$app.localhost:8080/")
    warm=$(curl -s -o /dev/null -w '%{time_total}' "http://$app.localhost:8080/")
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$app" "$run" \
      "$(field "$json" buildMs)" "$deploy_s" "$first" "$warm" "$(field "$json" moduleBytes)" "$(mem)" | tee -a "$out"
  done
done
echo "wrote $out"
