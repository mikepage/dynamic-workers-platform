#!/bin/bash
# Deploy a folder of TypeScript to the platform: ./deploy.sh examples/notes [name]
# Only curl. Every .ts/.tsx/.js/.jsx/.css file and package.json becomes one form field named by its relative path.
set -eu
dir=${1:?usage: ./deploy.sh <folder> [name]}
name=${2:-$(basename "$dir")}
platform=${PLATFORM:-http://localhost:8080}
args=()
while IFS= read -r f; do
  rel=${f#"$dir"/}
  args+=(-F "$rel=@$f")
done < <(find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.css' -o -name package.json \) | sort)
curl -sS -X PUT "${args[@]}" "$platform/api/apps/$name"
echo
