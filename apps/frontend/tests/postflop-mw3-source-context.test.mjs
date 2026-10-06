import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectSourceContexts, moduleDependencies, verifyContextReceipt, verifyIntegrationContexts } from '../scripts/postflop-ai/mw3-source-context.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const policy = JSON.parse(readFileSync(root + 'apps/frontend/scripts/postflop-ai/mw3-source-context.policy.json'));
const files = new Map(Object.keys(policy.owners).map(path => [path, readFileSync(root + path)]));
const collect = (current = files, classification = policy) => collectSourceContexts(current, classification);
const baseline = collect();
// Synthetic approval tokens exercise invalidation only; no production receipt.
const receipt = scope => ({ schema: 1, status: 'approved', scope, digest: baseline.contexts[scope].digest, reviewer: 'synthetic test', reviewId: 'synthetic-only' });
const mutate = (path, text) => new Map(files).set(path, Buffer.from(files.get(path).toString() + text));

test('actual shared closure retains inputs, equity, registry, loader, dispatch, cache, settlement and recorded storage', () => {
  for (const path of ['apps/frontend/scripts/lib/equity.ts', 'apps/shared/mw3-approved.ts', 'apps/backend/src/index.ts',
    'apps/frontend/src/estimated/datasets.ts', 'apps/frontend/src/estimated/range-url.ts', 'apps/frontend/src/agent/hand.ts',
    'apps/frontend/src/agent/session.ts', 'apps/frontend/src/agent/agent-stats.ts', 'apps/frontend/src/agent/mw3-kit-cache.ts',
    'apps/frontend/src/estimated/opening-ranges.json', 'apps/frontend/src/estimated/preflop-ranges.json', 'apps/frontend/src/estimated/multiway-responses.json']) {
    assert.ok(baseline.contexts.numerical.records.some(row => row.path === path), path);
  }
  assert.ok(baseline.contexts.ui.bridges.includes('apps/frontend/src/agent/hand.ts'));
  assert.ok(baseline.contexts.ui.records.some(row => row.path.endsWith('gameplay-mobile.css')));
});

test('presentation-only mutations retain numerical approval and invalidate UI approval', () => {
  for (const path of ['apps/frontend/src/agent/gameplay-mobile.css', 'apps/frontend/src/agent/GameplayDetails.tsx']) {
    const changed = collect(mutate(path, '\n/* synthetic presentation mutation */\n'));
    assert.equal(changed.contexts.numerical.digest, baseline.contexts.numerical.digest);
    assert.notEqual(changed.contexts.ui.digest, baseline.contexts.ui.digest);
    assert.doesNotThrow(() => verifyContextReceipt(changed.contexts.numerical, receipt('numerical'), 'numerical'));
    assert.throws(() => verifyContextReceipt(changed.contexts.ui, receipt('ui'), 'ui'), /stale ui/);
  }
});

test('numerical/dispatch/input/storage mutations invalidate numerical approval', () => {
  const mutations = [
    ['apps/frontend/scripts/lib/equity.ts', 'hand.length === 2 ? 6', 'hand.length === 2 ? 5'],
    ['apps/backend/src/index.ts', 'routeMw3Transport(request, env.DB, MW3_APPROVED_POLICIES)', 'routeMw3Transport(request, env.DB, [])'],
    ['apps/shared/mw3-approved.ts', 'CO_open_BTN_call_BB_call', 'CO_open_BTN_call_SB_call'],
    ['apps/frontend/src/estimated/opening-ranges.json', '"open_size_bb": 2.5', '"open_size_bb": 3'],
    ['apps/frontend/src/agent/agent-stats.ts', 'const LIMIT = 3000', 'const LIMIT = 1'],
  ];
  for (const [path, before, after] of mutations) {
    assert.ok(files.get(path).toString().includes(before), path);
    const current = new Map(files).set(path, Buffer.from(files.get(path).toString().replace(before, after)));
    const changed = collect(current);
    assert.notEqual(changed.contexts.numerical.digest, baseline.contexts.numerical.digest, path);
    assert.throws(() => verifyContextReceipt(changed.contexts.numerical, receipt('numerical'), 'numerical'), /stale numerical/);
  }
});

test('new relative dependency cannot silently escape classification or be downgraded to UI', () => {
  const added = 'apps/frontend/src/agent/new-shared.ts';
  const next = mutate('apps/frontend/src/agent/hand.ts', '\nimport "./new-shared.ts";\n');
  next.set(added, Buffer.from('export const value = 1;'));
  assert.throws(() => collect(next), /unclassified dependency/);
  const classified = structuredClone(policy); classified.owners[added] = 'ui';
  assert.throws(() => collect(next, classified), /numerical closure depends on UI/);
  classified.owners[added] = 'numerical';
  assert.notEqual(collect(next, classified).contexts.numerical.digest, baseline.contexts.numerical.digest);
});

test('type-only, re-export, side-effect and dynamic imports are followed; comments are not edges', () => {
  const body = Buffer.from('import type { A } from "./type.ts"; export { a } from "./export.ts"; import "./style.css"; const p=import("./lazy.ts"); type Q = typeof import("./query.json"); // import "./fake.ts"');
  const existing = new Set(['src/type.ts', 'src/export.ts', 'src/style.css', 'src/lazy.ts', 'src/query.json']);
  assert.deepEqual(moduleDependencies('src/a.ts', body, path => existing.has(path)), [...existing].sort());
  assert.throws(() => moduleDependencies('src/a.ts', Buffer.from('import(variable)'), () => true), /computed module dependency/);
  assert.throws(() => moduleDependencies('src/a.ts', Buffer.from('import "../../outside.ts"'), () => true), /unsafe dependency/);
});

test('changed computed imports, missing declarations and orphan classifications fail closed', () => {
  const changed = mutate('apps/frontend/tests/mw3-consumer-ui.test.mjs', '\nconst x = import(otherPath);\n');
  assert.throws(() => collect(changed), /computed module dependency/);
  const without = structuredClone(policy); delete without.computed['apps/frontend/tests/mw3-consumer-ui.test.mjs'];
  assert.throws(() => collect(files, without), /computed module dependency/);
  const orphan = structuredClone(policy); orphan.owners['orphan.ts'] = 'numerical';
  assert.throws(() => collect(files, orphan), /unreachable classified/);
});

test('integration requires both approvals and verifies both record sets against one committed tree', () => {
  const tree = 'a'.repeat(40); let witnessed = false;
  const receipts = { numerical: receipt('numerical'), ui: receipt('ui') };
  const result = verifyIntegrationContexts(baseline, receipts, tree, (actual, records) => {
    assert.equal(actual, tree); assert.equal(records.length, files.size); witnessed = true;
  });
  assert.ok(witnessed); assert.equal(result.sourceTree, tree);
  assert.throws(() => verifyIntegrationContexts(baseline, { ...receipts, ui: { ...receipts.ui, status: 'unapproved' } }, tree, () => {}), /stale ui/);
  assert.throws(() => verifyIntegrationContexts(baseline, receipts, 'HEAD', () => {}), /committed integration tree/);
  const forged = structuredClone(baseline); forged.contexts.numerical.records[0].sha256 = '0'.repeat(64);
  assert.throws(() => verifyIntegrationContexts(forged, receipts, tree, () => {}), /tampered numerical/);
  assert.throws(() => verifyIntegrationContexts(baseline, receipts, tree, () => { throw new Error('tree bytes differ'); }), /tree bytes differ/);
});
