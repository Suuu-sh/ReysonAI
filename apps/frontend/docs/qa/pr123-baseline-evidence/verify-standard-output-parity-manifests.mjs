import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [closurePath, inputPath] = process.argv.slice(2);
assert.equal(typeof closurePath, 'string');
assert.equal(typeof inputPath, 'string');

const expected = {
  closureSha256: 'c28d77a70470845f89c37e1659c8b9a9b4b84ad6f6bca669f2e1df5e32a70d1c',
  inputSha256: '9d8b9152e41c62f119c52472e9762313447a08dffe62026a6d51da13193da179',
  baselineCommit: '7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5',
  sourceCommit: '91109e156c17c7fdb9e2eb0dbc8d0704c7ee3e46',
  prHeadCommit: '6b5291089c15304c25af7433e87cd1bcaac38428',
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const closureBytes = readFileSync(closurePath);
const inputBytes = readFileSync(inputPath);
assert.equal(sha256(closureBytes), expected.closureSha256, 'Exact runtime closure manifest bytes changed');
assert.equal(sha256(inputBytes), expected.inputSha256, 'Exact filesystem JSON input manifest bytes changed');

const closure = JSON.parse(closureBytes);
assert.deepEqual(
  [closure.source_commit, closure.source_tree, closure.pr_head_commit, closure.pr_head_tree],
  [expected.sourceCommit, '9d4bf2f8ae341d38507f209ccd8bcc9f437bbd2d', expected.prHeadCommit, 'b02e4eca21633c17f877515ad5bda0f55f66a7a5'],
);
assert.equal(closure.closure.length, 70, 'Unexpected runtime/import closure size');
const closurePaths = closure.closure.map(item => item.path);
assert.equal(new Set(closurePaths).size, closurePaths.length, 'Duplicate runtime/import closure path');

const inputs = JSON.parse(inputBytes);
assert.deepEqual(
  [inputs.baselineCommit, inputs.sourceCommit, inputs.prHeadCommit],
  [expected.baselineCommit, expected.sourceCommit, expected.prHeadCommit],
);
assert.equal(inputs.files.length, 11, 'Expected the pinned eleven JSON inputs');
assert.equal(new Set(inputs.files.map(item => item.path)).size, inputs.files.length, 'Duplicate filesystem JSON input path');
for (const item of inputs.files) {
  assert.equal(item.sourceBlob, item.baselineBlob, `Source JSON blob differs: ${item.path}`);
  assert.equal(item.prHeadBlob, item.baselineBlob, `Protected PR JSON blob differs: ${item.path}`);
  assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0, `Invalid input byte count: ${item.path}`);
  assert.match(item.sha256, /^[a-f0-9]{64}$/, `Invalid input SHA-256: ${item.path}`);
}

console.log(JSON.stringify({
  closureFiles: closure.closure.length,
  closureManifestSha256: expected.closureSha256,
  inheritedJsonInputs: inputs.files.length,
  inputManifestSha256: expected.inputSha256,
}));
