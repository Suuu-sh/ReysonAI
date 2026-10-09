#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "${1:?Usage: bash reproduce-standard-output-parity.sh <clean-repository-root> <output-directory>}" && pwd -P)
output_dir=${2:?Usage: bash reproduce-standard-output-parity.sh <clean-repository-root> <output-directory>}
script_dir=$(cd "$(dirname "$0")" && pwd -P)
manifest="$script_dir/runtime-import-closure.json"
baseline_commit=7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5
baseline_tree=04486039e4394a2238b71de24434623c255bfb87
source_commit=91109e156c17c7fdb9e2eb0dbc8d0704c7ee3e46
source_tree=9d4bf2f8ae341d38507f209ccd8bcc9f437bbd2d
pr_head=6b5291089c15304c25af7433e87cd1bcaac38428
pr_head_tree=b02e4eca21633c17f877515ad5bda0f55f66a7a5

for commit in "$baseline_commit" "$source_commit" "$pr_head"; do
  git -C "$repo_root" cat-file -e "$commit^{commit}"
done
[[ "$(git -C "$repo_root" rev-parse "$baseline_commit^{tree}")" == "$baseline_tree" ]]
[[ "$(git -C "$repo_root" rev-parse "$source_commit^{tree}")" == "$source_tree" ]]
[[ "$(git -C "$repo_root" rev-parse "$pr_head^{tree}")" == "$pr_head_tree" ]]

mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd -P)
baseline_dir=$(mktemp -d "${TMPDIR:-/tmp}/pr123-parity.XXXXXX")
cleanup() {
  git -C "$repo_root" worktree remove --force "$baseline_dir" >/dev/null 2>&1 || rm -rf "$baseline_dir"
}
trap cleanup EXIT

git -C "$repo_root" worktree add --detach "$baseline_dir" "$baseline_commit" >/dev/null
while IFS=$'\t' read -r path expected_source expected_pr_head; do
  [[ -n "$path" ]] || continue
  actual_source=$(git -C "$repo_root" rev-parse "$source_commit:$path")
  actual_pr_head=$(git -C "$repo_root" rev-parse "$pr_head:$path")
  [[ "$actual_source" == "$expected_source" ]]
  [[ "$actual_pr_head" == "$expected_pr_head" ]]
  [[ "$actual_source" == "$actual_pr_head" ]]
  mkdir -p "$baseline_dir/$(dirname "$path")"
  git -C "$repo_root" show "$source_commit:$path" > "$baseline_dir/$path"
done < <(node - "$manifest" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const item of manifest.closure) console.log(`${item.path}\t${item.source_blob}\t${item.pr_head_blob}`);
NODE
)

PR123_SOURCE_COMMIT="$baseline_commit" PR123_SOURCE_TREE="$baseline_tree" \
  node --experimental-strip-types "$script_dir/standard-output-capture.mjs" \
  "$baseline_dir" baseline-7c2 "$output_dir/baseline.json"
PR123_SOURCE_COMMIT="$source_commit" PR123_SOURCE_TREE="$source_tree" \
  node --experimental-strip-types "$script_dir/standard-output-capture.mjs" \
  "$baseline_dir" candidate-91109 "$output_dir/candidate.json"

node - "$output_dir/baseline.json" "$output_dir/candidate.json" "$output_dir/canonical-outputs.json" <<'NODE'
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const [baselinePath, candidatePath, canonicalPath] = process.argv.slice(2);
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
assert.deepEqual(candidate.outputs, baseline.outputs);
assert.deepEqual(candidate.sha256, baseline.sha256);
assert.equal(Object.keys(baseline.outputs).length, 13);
const canonical = JSON.stringify(baseline.outputs);
const digest = crypto.createHash('sha256').update(canonical).digest('hex');
assert.equal(digest, '13e2e209855c33995d3cfceb04ee1d0de1faad0aa7f953c72657618cc8450185');
fs.writeFileSync(canonicalPath, canonical);
console.log(JSON.stringify({ outputCount: 13, allEqual: true, canonicalOutputsObjectSha256: digest }));
NODE

gzip -n -9 -c "$output_dir/canonical-outputs.json" > "$output_dir/raw-standard-output-objects.json.gz"
printf 'Canonical raw outputs: %s\n' "$output_dir/canonical-outputs.json"
printf 'Compressed output objects: %s\n' "$output_dir/raw-standard-output-objects.json.gz"
