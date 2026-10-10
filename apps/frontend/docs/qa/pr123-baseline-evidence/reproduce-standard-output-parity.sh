#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd -P)
closure_manifest="$script_dir/runtime-import-closure.json"
input_manifest="$script_dir/runtime-filesystem-json-inputs.json"
expected_closure_sha256=c28d77a70470845f89c37e1659c8b9a9b4b84ad6f6bca669f2e1df5e32a70d1c
expected_input_sha256=9d8b9152e41c62f119c52472e9762313447a08dffe62026a6d51da13193da179
if [[ ${1:-} == --check-manifests ]]; then
  node "$script_dir/verify-standard-output-parity-manifests.mjs" "$closure_manifest" "$input_manifest"
  exit 0
fi
repo_root=$(cd "${1:?Usage: bash reproduce-standard-output-parity.sh <repository-root> <output-directory>}" && pwd -P)
output_dir=${2:?Usage: bash reproduce-standard-output-parity.sh <repository-root> <output-directory>}
baseline_commit=7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5
baseline_tree=04486039e4394a2238b71de24434623c255bfb87
source_commit=91109e156c17c7fdb9e2eb0dbc8d0704c7ee3e46
source_tree=9d4bf2f8ae341d38507f209ccd8bcc9f437bbd2d
pr_head=6b5291089c15304c25af7433e87cd1bcaac38428
pr_head_tree=b02e4eca21633c17f877515ad5bda0f55f66a7a5
expected_candidate_execution_tree=f1bc0d3312adb5ebb96e8890e80d17126d60bbf5

[[ "$(node --version)" == "v25.8.1" ]] || {
  printf 'This capture is pinned to Node.js v25.8.1; found %s\n' "$(node --version)" >&2
  exit 2
}

for commit in "$baseline_commit" "$source_commit" "$pr_head"; do
  git -C "$repo_root" cat-file -e "$commit^{commit}"
done
[[ "$(git -C "$repo_root" rev-parse "$baseline_commit^{tree}")" == "$baseline_tree" ]]
[[ "$(git -C "$repo_root" rev-parse "$source_commit^{tree}")" == "$source_tree" ]]
[[ "$(git -C "$repo_root" rev-parse "$pr_head^{tree}")" == "$pr_head_tree" ]]

mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd -P)
baseline_dir=$(mktemp -d "${TMPDIR:-/tmp}/pr123-baseline.XXXXXX")
candidate_dir=$(mktemp -d "${TMPDIR:-/tmp}/pr123-candidate.XXXXXX")
cleanup() {
  git -C "$repo_root" worktree remove --force "$baseline_dir" >/dev/null 2>&1 || rm -rf "$baseline_dir"
  git -C "$repo_root" worktree remove --force "$candidate_dir" >/dev/null 2>&1 || rm -rf "$candidate_dir"
}
trap cleanup EXIT

git -C "$repo_root" worktree add --detach "$baseline_dir" "$baseline_commit" >/dev/null
git -C "$repo_root" worktree add --detach "$candidate_dir" "$baseline_commit" >/dev/null

# Establish historical state before the candidate overlay. A new worktree must
# contain only tracked files from this commit; ignored host data is never copied.
[[ -z "$(git -C "$baseline_dir" status --porcelain=v1 --untracked-files=all)" ]]
[[ "$(git -C "$baseline_dir" rev-parse HEAD^{tree})" == "$baseline_tree" ]]
[[ -z "$(git -C "$candidate_dir" status --porcelain=v1 --untracked-files=all)" ]]

closure_sha256=$(shasum -a 256 "$closure_manifest" | awk '{print $1}')
input_sha256=$(shasum -a 256 "$input_manifest" | awk '{print $1}')
[[ "$closure_sha256" == "$expected_closure_sha256" ]]
[[ "$input_sha256" == "$expected_input_sha256" ]]
node "$script_dir/verify-standard-output-parity-manifests.mjs" "$closure_manifest" "$input_manifest" >/dev/null

# Verify all 70 source files against both the reviewed source commit and the
# exact protected PR head, then apply only that closure to a separate checkout.
while IFS=$'\t' read -r path expected_source expected_pr_head; do
  [[ -n "$path" ]] || continue
  actual_source=$(git -C "$repo_root" rev-parse "$source_commit:$path")
  actual_pr_head=$(git -C "$repo_root" rev-parse "$pr_head:$path")
  [[ "$actual_source" == "$expected_source" ]]
  [[ "$actual_pr_head" == "$expected_pr_head" ]]
  [[ "$actual_source" == "$actual_pr_head" ]]
  git -C "$candidate_dir" checkout "$source_commit" -- "$path"
done < <(node - "$closure_manifest" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const item of manifest.closure) console.log(`${item.path}\t${item.source_blob}\t${item.pr_head_blob}`);
NODE
)

candidate_tree=$(git -C "$candidate_dir" write-tree)
[[ "$candidate_tree" == "$expected_candidate_execution_tree" ]]
node - "$repo_root" "$baseline_dir" "$candidate_dir" "$closure_manifest" "$input_manifest" <<'NODE'
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [repo, baseline, candidate, closurePath, inputPath] = process.argv.slice(2);
const closure = JSON.parse(fs.readFileSync(closurePath, 'utf8'));
const inputs = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const closurePaths = new Set(closure.closure.map(item => item.path));
assert.equal(closure.closure.length, 70, 'Unexpected runtime/import closure size');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(closurePath)).digest('hex'),
  'c28d77a70470845f89c37e1659c8b9a9b4b84ad6f6bca669f2e1df5e32a70d1c', 'Exact runtime closure manifest bytes changed');
const statuses = execFileSync('git', ['-C', candidate, 'status', '--porcelain=v1', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).map(item => item.slice(3));
assert(statuses.every(file => closurePaths.has(file)), 'Candidate overlay changed a path outside the 70-file closure');
assert.equal(inputs.files.length, 11, 'Expected the pinned eleven JSON inputs');
assert.deepEqual([inputs.baselineCommit, inputs.sourceCommit, inputs.prHeadCommit], [
  '7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5',
  '91109e156c17c7fdb9e2eb0dbc8d0704c7ee3e46',
  '6b5291089c15304c25af7433e87cd1bcaac38428',
]);
assert.equal(new Set(inputs.files.map(item => item.path)).size, inputs.files.length, 'Duplicate JSON input path');
for (const item of inputs.files) {
  assert.equal(item.sourceBlob, item.baselineBlob, `Source JSON blob differs: ${item.path}`);
  assert.equal(item.prHeadBlob, item.baselineBlob, `Protected PR JSON blob differs: ${item.path}`);
  for (const [label, root] of [['baseline', baseline], ['candidate', candidate]]) {
    const filename = path.join(root, item.path);
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.length, item.bytes, `${label} input byte length changed: ${item.path}`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, `${label} input content changed: ${item.path}`);
    assert.equal(execFileSync('git', ['-C', root, 'hash-object', item.path], { encoding: 'utf8' }).trim(), item.baselineBlob, `${label} Git blob changed: ${item.path}`);
  }
  for (const commit of [inputs.baselineCommit, inputs.sourceCommit, inputs.prHeadCommit]) {
    const expected = execFileSync('git', ['-C', repo, 'rev-parse', `${commit}:${item.path}`], { encoding: 'utf8' }).trim();
    assert.equal(expected, item.baselineBlob, `Pinned JSON input differs at ${commit}: ${item.path}`);
  }
}
console.log(JSON.stringify({ closureFiles: closure.closure.length, candidateChangedPaths: statuses.length, inheritedJsonInputs: inputs.files.length, allInputsIdentical: true }));
NODE

PR123_SOURCE_COMMIT="$baseline_commit" PR123_SOURCE_TREE="$baseline_tree" \
PR123_EXECUTION_TREE="$baseline_tree" PR123_RUNTIME_CLOSURE_SHA256="$closure_sha256" \
PR123_FILESYSTEM_INPUTS_SHA256="$input_sha256" \
  node --experimental-strip-types "$script_dir/standard-output-capture.mjs" \
  "$baseline_dir" baseline-7c2 "$output_dir/baseline.json"
PR123_SOURCE_COMMIT="$source_commit" PR123_SOURCE_TREE="$source_tree" \
PR123_EXECUTION_TREE="$candidate_tree" PR123_RUNTIME_CLOSURE_SHA256="$closure_sha256" \
PR123_FILESYSTEM_INPUTS_SHA256="$input_sha256" \
  node --experimental-strip-types "$script_dir/standard-output-capture.mjs" \
  "$candidate_dir" candidate-91109 "$output_dir/candidate.json"

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
console.log(JSON.stringify({ outputCount: 13, allEqual: true, canonicalOutputsObjectSha256: digest,
  baselineExecutionTree: baseline.execution_tree, candidateExecutionTree: candidate.execution_tree,
  runtimeClosureManifestSha256: candidate.runtime_closure_manifest_sha256,
  filesystemJsonInputsSha256: candidate.filesystem_json_inputs_sha256 }));
NODE

gzip -n -9 -c "$output_dir/baseline.json" > "$output_dir/baseline-capture.json.gz"
gzip -n -9 -c "$output_dir/candidate.json" > "$output_dir/candidate-capture.json.gz"
gzip -n -9 -c "$output_dir/canonical-outputs.json" > "$output_dir/raw-standard-output-objects.json.gz"
printf 'Capture envelopes and canonical outputs saved under %s\n' "$output_dir"
