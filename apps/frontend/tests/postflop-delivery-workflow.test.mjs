import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPOSITORY } from '../scripts/postflop-ai/reviewed-postflop.mjs';
const workflow = readFileSync(join(REPOSITORY, '.github/workflows/verify-reviewed-postflop.yml'), 'utf8');
test('verification workflow has no deployment, authoring, audit or production credentials', () => {
  assert.doesNotMatch(workflow, /secrets\.|--remote|wrangler deploy|cli\.mjs (?:generate|generate-later|simulate|audit)|audit-all-boards\.mjs|package-reviewed-postflop\.mjs|package-all-board-companion\.mjs/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /lfs: true/);
  assert.match(workflow, /node-version: '22\.20\.0'/); assert.match(workflow, /wrangler@4\.147\.0/);
  assert.match(workflow, /contents: read/); assert.doesNotMatch(workflow, /\n  deploy:/);
  for (const sha of ['d23441a48e516b6c34aea4fa41551a30e30af803', '249970729cb0ef3589644e2896645e5dc5ba9c38', 'ea165f8d65b6e75b540449e92b4886f43607fa02']) assert.ok(workflow.includes(sha));
});
test('code/fixture checks make no current-delivery claim and absent requested index fails', () => {
  assert.match(workflow, /Code and historical legacy fixture checks/);
  assert.match(workflow, /Code\/legacy fixtures only; no current reviewed HU delivery was verified/);
  assert.match(workflow, /inputs\.prepare_current_delivery/);
  assert.match(workflow, /test -n "\$HU_INDEX"/); assert.match(workflow, /test -f/);
  assert.match(workflow, /verify-reviewed-postflop-delivery\.mjs --index/);
  assert.match(workflow, /restore-reviewed-postflop-index\.mjs --index/);
  assert.match(workflow, /verify-postflop-local-d1\.mjs --index/);
  assert.match(workflow, /if-no-files-found: error/); assert.match(workflow, /include-hidden-files: true/);
  const current = workflow.slice(workflow.indexOf('\n  current_delivery:'));
  assert.ok(current.indexOf('Verify exact independently reviewed') < current.indexOf('Retain exact validated'));
  assert.ok(current.indexOf('Strict full-file LOCAL D1') < current.indexOf('Retain exact validated'));
});
