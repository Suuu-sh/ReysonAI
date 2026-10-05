// Tiny synthetic inventory contracts. No saved policy, encoding command,
// recipe, independent receipt, build activation or D1 execution is performed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDraftInventory } from '../scripts/postflop-ai/mw3-draft-pins.mjs';
const spots = Array.from({ length: 16 }, (_, i) => `synthetic_${i}`);
const fixture = () => ({ kind: 'coordinator-exact-raw-gate-inventory-not-independent-receipt', summary: { spots: 16 },
  spots: spots.map(spot => ({ spot, source: 'a'.repeat(64) })),
  files: Array.from({ length: 112 }, (_, i) => ({ path: `.local/postflop-ai/mw3/synthetic-${i}.json`, bytes: 1, sha256: 'b'.repeat(64) })) });
test('draft transport inventory requires all sixteen sources and exact 112 bounded unique raw paths', () => {
  const inventory = fixture(), records = assertDraftInventory(inventory, spots);
  assert.equal(records.size, 112);
  assert.ok([...records.keys()].every(path => path.startsWith('apps/frontend/.local/postflop-ai/mw3/')));
  assert.equal(inventory.kind, 'coordinator-exact-raw-gate-inventory-not-independent-receipt');
});
test('draft transport inventory rejects incomplete, duplicate, escaped, stale and approval-shaped inputs', () => {
  for (const mutate of [f => { f.kind = 'mw3-independent-acceptance'; }, f => { f.summary.spots = 15; }, f => { f.spots.pop(); },
    f => { f.spots[0].spot = f.spots[1].spot; }, f => { f.spots[0].source = 'stale'; }, f => { f.files.pop(); },
    f => { f.files[0].path = f.files[1].path; }, f => { f.files[0].path = '.local/postflop-ai/mw3/../escape.json'; },
    f => { f.files[0].path = '/absolute.json'; }, f => { f.files[0].bytes = 0; }, f => { f.files[0].bytes = 17 * 1024 * 1024; },
    f => { f.files[0].sha256 = 'unapproved'; }]) {
    const inventory = fixture(); mutate(inventory); assert.throws(() => assertDraftInventory(inventory, spots));
  }
});
