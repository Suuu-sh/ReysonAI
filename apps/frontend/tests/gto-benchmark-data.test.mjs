import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBenchmarkDataset } from '../scripts/import-gto-benchmark.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(frontendRoot, '../..');
const datasetPath = path.join(frontendRoot, 'src/gto/benchmark-flop.json');

test('saved GTO benchmark preserves validated restricted-tree results and provenance without solver artifacts', async () => {
  const saved = JSON.parse(await readFile(datasetPath, 'utf8'));

  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.id, 'btn-bb-100bb-qsjh2h-single-size');
  assert.deepEqual(saved.metadata.board, ['Qs', 'Jh', '2h']);
  assert.equal(saved.metadata.startingStackBb, 100);
  assert.equal(saved.metadata.effectiveStackBb, 97.5);
  assert.equal(saved.metadata.potBb, 5.5);
  assert.equal(saved.metadata.openSizeBb, 2.5);
  assert.equal(saved.metadata.betPotFraction, 0.5);
  assert.equal(saved.metadata.raiseMultiplier, 2.5);
  assert.equal(saved.metadata.raiseLimit, null);
  assert.equal(saved.metadata.rakePercent, 0);
  assert.equal(saved.metadata.rakeCapBb, 0);
  assert.equal(saved.metadata.benchmarkStatus, 'target_reached');
  assert.equal(saved.metadata.exploitabilityPotFraction, 0.0027267485857009888);
  assert.equal(saved.metadata.iterations, 160);
  assert.deepEqual(saved.metadata.measured, { solveSeconds: 755.815893125, peakRssBytes: 8966111232 });
  assert.equal(saved.metadata.coverage, 'flop-two-decisions');
  assert.equal(saved.metadata.upstream.url, 'https://github.com/b-inary/postflop-solver');
  assert.equal(saved.metadata.upstream.sha, '9d1509fe5077d019825f833eed04b16d342dfda1');
  assert.match(saved.metadata.upstream.license, /^AGPL-3\.0/);
  assert.match(saved.metadata.scope, /restricted action-tree/);
  assert.match(saved.metadata.inputs.note, /not solver-derived preflop GTO/);
  assert.match(saved.metadata.reachWeightMeaning, /not a normalized probability/);
  assert.ok(!JSON.stringify(saved.metadata).includes('/Users/'), 'shipped metadata must not contain local absolute paths');

  assert.equal(saved.metadata.inputs.BTN_open.sourcePath, 'apps/frontend/src/estimated/opening-ranges.json');
  assert.equal(saved.metadata.inputs.BTN_open.sourceId, 'BTN_open');
  assert.equal(saved.metadata.inputs.BTN_open.fileSha256, '236225dbae1c8aa2e2e7af8a449555f27ef80fed878114408c0e7338b89d0f0b');
  assert.equal(saved.metadata.inputs.BTN_open.rangeSha256, '30090fc2ccdeee4191298115c571defa147e8ae7f70a28dd0e21a984aab36a60');
  assert.equal(saved.metadata.inputs.BB_call.sourcePath, 'solutions/cash-6max-100bb-v1.json');
  assert.equal(saved.metadata.inputs.BB_call.nodeId, 'node-72f98d904c1d2d17');
  assert.equal(saved.metadata.inputs.BB_call.fileSha256, '9cd797c296e59565dc1317e2b7e3db9dcfcd9c88f4fe6c5e1b38b036593bee2b');
  assert.equal(saved.metadata.inputs.BB_call.rangeSha256, '402b5c3ee030ca2144d7013c8490c9c7e9c0635c3724d5ce6377e11fd07981e5');
  assert.equal(saved.metadata.inputs.benchmarkResultsSha256, '07d44934f72a1063c858c51c69a73da53c53a5130695e4e1569c846dc5a14a94');
  assert.deepEqual(saved.metadata.inputs.strategyCsvSha256, {
    'strategy-root-oop-bb-combos.csv': '0d9a1c935c739169f6afa3a7e228ea36eb54c4c902461d81da1a8cd42452065b',
    'strategy-root-oop-bb-classes.csv': '52c593b86ab3d4597110fbf1c4164726e37612d80fd97de5f71c7cd1f8428b52',
    'strategy-after-check-ip-btn-combos.csv': '26c79b7f0a4bb1f2b254999fa1cce11452f3d946adb70c7ef057b913cd58de24',
    'strategy-after-check-ip-btn-classes.csv': '8d899d69f7e296e26eeb753d4dcc5609f9003c01ac66a06222776c6d45040277',
  });

  assert.equal(saved.nodes.length, 2);
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
  const actions = [
    { id: 'check', kind: 'check', amountBb: 0, potFraction: null },
    { id: 'bet', kind: 'bet', amountBb: 2.75, potFraction: 0.5 },
  ];

  for (const node of saved.nodes) {
    assert.deepEqual(node.actions, actions);
    const combos = new Set();
    const groups = new Map();
    for (const row of node.combos) {
      assert.match(row.combo, /^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/);
      const first = row.combo.slice(0, 2);
      const second = row.combo.slice(2, 4);
      const ranks = '23456789TJQKA';
      const suits = 'cdhs';
      const cardId = (card) => ranks.indexOf(card[0]) * 4 + suits.indexOf(card[1]);
      assert.ok(cardId(first) > cardId(second), `non-canonical combo ${row.combo}`);
      assert.ok(!saved.metadata.board.includes(first) && !saved.metadata.board.includes(second), `board overlap ${row.combo}`);
      const handClass = first[0] === second[0] ? `${first[0]}${second[0]}` : `${first[0]}${second[0]}${first[1] === second[1] ? 's' : 'o'}`;
      assert.equal(row.handClass, handClass);
      assert.ok(Number.isFinite(row.reachWeight) && row.reachWeight > 0);
      assert.ok(!combos.has(row.combo), `duplicate combo ${row.combo}`);
      combos.add(row.combo);
      assert.ok(Number.isFinite(row.frequencies.check) && Number.isFinite(row.frequencies.bet));
      assert.ok(row.frequencies.check >= 0 && row.frequencies.check <= 1);
      assert.ok(row.frequencies.bet >= 0 && row.frequencies.bet <= 1);
      assert.ok(Math.abs(row.frequencies.check + row.frequencies.bet - 1) <= 5e-8);
      const group = groups.get(handClass) ?? { count: 0, weight: 0, check: 0, bet: 0 };
      group.count += 1;
      group.weight += row.reachWeight;
      group.check += row.reachWeight * row.frequencies.check;
      group.bet += row.reachWeight * row.frequencies.bet;
      groups.set(handClass, group);
    }
    assert.ok(node.combos.some((row) => row.reachWeight > 1), 'raw weight must not be normalized or clipped');
    const classes = new Set();
    for (const row of node.classes) {
      assert.ok(!classes.has(row.handClass), `duplicate class ${row.handClass}`);
      classes.add(row.handClass);
      const group = groups.get(row.handClass);
      assert.ok(group, `class without combo rows ${row.handClass}`);
      assert.equal(row.comboCount, group.count);
      assert.ok(Math.abs(row.reachWeight - group.weight) <= 1e-7, `class weight ${row.handClass}`);
      assert.ok(Number.isFinite(row.frequencies.check) && Number.isFinite(row.frequencies.bet));
      assert.ok(row.frequencies.check >= 0 && row.frequencies.check <= 1);
      assert.ok(row.frequencies.bet >= 0 && row.frequencies.bet <= 1);
      assert.ok(Math.abs(row.frequencies.check - group.check / group.weight) <= 1e-8, `class check frequency ${row.handClass}`);
      assert.ok(Math.abs(row.frequencies.bet - group.bet / group.weight) <= 1e-8, `class bet frequency ${row.handClass}`);
    }
    assert.equal(classes.size, groups.size, 'all combo classes must have aggregates');
  }
});

test('benchmark importer requires an explicit results directory', async () => {
  for (const resultsDir of [undefined, '', '   ']) {
    await assert.rejects(buildBenchmarkDataset({ projectRoot, resultsDir }), /resultsDir is required/);
  }
});

test('benchmark importer rejects invalid generated results before reading external source artifacts', async (t) => {
  // Only the small metadata envelope is generated. No solver execution, original
  // CSVs, or duplicate strategy dataset is needed to exercise rejection paths.
  const saved = JSON.parse(await readFile(datasetPath, 'utf8'));
  const metadata = saved.metadata;
  const makeResults = () => ({
    status: metadata.benchmarkStatus,
    upstream_sha: metadata.upstream.sha,
    achieved_exploitability_percent_initial_pot: metadata.exploitabilityPotFraction * 100,
    iterations: metadata.iterations,
    solve_seconds: metadata.measured.solveSeconds,
    configuration: {
      upstream: metadata.upstream.url,
      upstream_sha: metadata.upstream.sha,
      board: metadata.board.join(''),
      starting_pot_bb: metadata.potBb,
      effective_stack_bb: metadata.effectiveStackBb,
      bet_sizes: { all_streets: '50% pot', raises: '2.5x previous bet', raise_cap_count: 0 },
      rake: { rate: 0, cap: 0 },
      merging_threshold: 0,
      add_allin_threshold: 0,
      force_allin_threshold: 0,
      input_ranges: Object.fromEntries(['BTN_open', 'BB_call'].map((key) => [key, {
        path: metadata.inputs[key].sourcePath,
        file_sha256: metadata.inputs[key].fileSha256,
        range_sha256: metadata.inputs[key].rangeSha256,
        node_id: metadata.inputs[key].nodeId,
      }])),
    },
  });
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'gto-benchmark-test-'));
  t.after(() => rm(resultsDir, { recursive: true, force: true }));
  const cases = [
    ['unfinished solve', (data) => { data.status = 'iteration_limit'; }, /did not reach exploitability target/],
    ['unpinned solver', (data) => { data.upstream_sha = '0'.repeat(40); }, /upstream solver SHA/],
    ['different board', (data) => { data.configuration.board = 'AsKdQc'; }, /unexpected board/],
    ['different action tree', (data) => { data.configuration.bet_sizes.all_streets = '75% pot'; }, /unexpected action sizing/],
    ['different input fingerprint', (data) => { data.configuration.input_ranges.BB_call.range_sha256 = '0'.repeat(64); }, /fingerprint metadata mismatch/],
    ['different input source', (data) => { data.configuration.input_ranges.BTN_open.path = 'other/opening-ranges.json'; }, /BTN_open: source path differs/],
  ];
  for (const [name, mutate, error] of cases) {
    await t.test(name, async () => {
      const results = makeResults();
      mutate(results);
      await writeFile(path.join(resultsDir, 'results.json'), JSON.stringify(results));
      await assert.rejects(buildBenchmarkDataset({ resultsDir, projectRoot: path.join(resultsDir, 'no-source-artifacts') }), error);
    });
  }
});
