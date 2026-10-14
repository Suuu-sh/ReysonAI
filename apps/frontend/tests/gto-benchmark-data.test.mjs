import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBenchmarkDataset } from '../scripts/import-gto-benchmark.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(frontendRoot, '../..');
const datasetPath = path.join(frontendRoot, 'src/gto/benchmark-flop.json');

test('GTO benchmark import preserves validated restricted-tree results and provenance', async () => {
  const imported = await buildBenchmarkDataset({ projectRoot });
  const saved = JSON.parse(await readFile(datasetPath, 'utf8'));
  assert.deepEqual(saved, imported);

  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.id, 'btn-bb-100bb-qsjh2h-single-size');
  assert.equal(saved.metadata.benchmarkStatus, 'target_reached');
  assert.ok(saved.metadata.exploitabilityPotFraction <= 0.003);
  assert.equal(saved.metadata.coverage, 'flop-two-decisions');
  assert.match(saved.metadata.upstream.license, /^AGPL-3\.0/);
  assert.match(saved.metadata.scope, /restricted action-tree/);
  assert.match(saved.metadata.inputs.note, /not solver-derived preflop GTO/);
  assert.match(saved.metadata.reachWeightMeaning, /not a normalized probability/);
  assert.ok(!JSON.stringify(saved.metadata).includes('/Users/'), 'shipped metadata must not contain local absolute paths');

  const [bbRoot, btnAfterCheck] = saved.nodes;
  assert.equal(bbRoot.id, 'bb-root');
  assert.equal(bbRoot.position, 'BB');
  assert.deepEqual(bbRoot.history, []);
  assert.equal(bbRoot.combos.length, 1176);
  assert.equal(bbRoot.classes.length, 169);
  assert.equal(btnAfterCheck.id, 'btn-after-check');
  assert.equal(btnAfterCheck.position, 'BTN');
  assert.deepEqual(btnAfterCheck.history, [{ position: 'BB', action: 'check' }]);
  assert.equal(btnAfterCheck.combos.length, 690);
  assert.equal(btnAfterCheck.classes.length, 119);
  assert.deepEqual(bbRoot.actions, [
    { id: 'check', kind: 'check', amountBb: 0, potFraction: null },
    { id: 'bet', kind: 'bet', amountBb: 2.75, potFraction: 0.5 },
  ]);

  for (const node of saved.nodes) {
    const combos = new Set();
    for (const row of node.combos) {
      assert.match(row.combo, /^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/);
      assert.ok(row.reachWeight > 0);
      assert.ok(!combos.has(row.combo), `duplicate combo ${row.combo}`);
      combos.add(row.combo);
      assert.ok(row.frequencies.check >= 0 && row.frequencies.check <= 1);
      assert.ok(row.frequencies.bet >= 0 && row.frequencies.bet <= 1);
      assert.ok(Math.abs(row.frequencies.check + row.frequencies.bet - 1) <= 5e-8);
    }
    assert.ok(node.combos.some((row) => row.reachWeight > 1), 'raw weight must not be normalized or clipped');
    assert.ok(node.classes.every((row) => row.comboCount > 0 && row.reachWeight > 0));
  }
});
