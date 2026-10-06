// Bounded selected-contract checks. Fixture materialization is never fresh4999 evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loadInputs, makeSampler, seatRange, samplePair } from '../scripts/postflop-ai/inputs.mjs';
import { dealRunout } from '../scripts/postflop-ai/simulation.mjs';
import { seedFor, seededRandom } from '../scripts/lib/equity.mjs';
import { createModel11BehaviorCompletion } from '../scripts/postflop-ai/offpath-behavior-model11.mjs';
import { playModel11Hand } from '../scripts/postflop-ai/simulation-model11.mjs';
import { contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { resolveModel11GatePlan } from '../scripts/postflop-ai/model11-gate-contract.mjs';
import { completionRepresentativeCells } from '../scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { openCompletionRepresentativeEvidence } from '../scripts/postflop-ai/model11-completion-representative-store.mjs';
import { originalDealStream, validateSelectedManifest, produceSelectedCell, validateSelectedCell, compareSelectedCell,
  runSelectedCacheControls, selectedTrials } from '../scripts/postflop-ai/model11-selected-regression.mjs';
import { parseSelectedArguments } from '../scripts/postflop-ai/evaluate-model11-selected-regression.mjs';
import { SELECTION_SHA } from '../scripts/postflop-ai/model11-selected-regression-runtime.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model11-dual-source-full-proof96.json', import.meta.url)));
const selectionBytes = readFileSync(new URL('./fixtures/model11-selected-regression-selection-v2.json', import.meta.url));
const selection = JSON.parse(selectionBytes), inputs = loadInputs('BTN_open_SB_3bet_BB_call_BTN_fold');
const fullPlan = resolveModel11GatePlan(inputs, { kind: 'representative', scope: 'full', cacheBatchSize: 512 }, { executeFull: true });
const sourceCells = completionRepresentativeCells(inputs, fullPlan), temp = () => mkdtempSync(join(tmpdir(), 'model11-selected-'));
test('exact authorized4999 manifest covers all72 cells and every512 boundary without changing full diagnostics', () => {
  assert.equal(createHash('sha256').update(selectionBytes).digest('hex'), SELECTION_SHA);
  assert.equal(validateSelectedManifest(selection, inputs, fullPlan).length, 72);
  assert.equal(selection.rows.reduce((n, row) => n + row.selected, 0), 4999);
  for (const mutate of [x => x.rows.pop(), x => x.rows.reverse(), x => x.rows[0].trialIndices.reverse(),
    x => x.rows[0].trialIndices[0] = 1, x => x.rows[0].cell.samples = 64, x => x.selectedTrials = 4608]) {
    const wrong = structuredClone(selection); mutate(wrong); assert.throws(() => validateSelectedManifest(wrong, inputs, fullPlan));
  }
  assert.throws(() => resolveModel11GatePlan(inputs, { kind: 'representative', scope: 'diagnostic', boardIds: ['As7d2c'], street: 'all', samples: 64, profiles: ['passive'], heroes: ['SB'], cacheBatchSize: 512 }));
});
test('filtered traversal advances original variable-consumption deal/runout/24 draws and resets before sampling', () => {
  const board = fullPlan.boardList[0], cell = { ...sourceCells[3], samples: 1024 }, observed = [], resets = [];
  const ip = makeSampler(seatRange(inputs, inputs.spot.ip, board.cards)), oop = makeSampler(seatRange(inputs, inputs.spot.oop, board.cards));
  const random = seededRandom(seedFor(`${inputs.config.seed}|${board.id}|${cell.opponent}|${cell.hero}`));
  const expected = [];
  for (let index = 0; index < 1024; index++) {
    const hands = samplePair(ip, oop, random, inputs.spot), runout = dealRunout(hands, board.cards, random), randoms = Array.from({ length: 24 }, () => random());
    if ([0, 10, 511, 512, 1023].includes(index)) expected.push({ index, hands, runout, randoms });
  }
  let advanced = 0;
  for (const draw of originalDealStream(inputs, board, cell, index => { advanced++; if (index % 512 === 0) resets.push(index); })) {
    assert.equal(advanced, draw.index + 1); if ([0, 10, 511, 512, 1023].includes(draw.index)) observed.push(draw);
  }
  assert.equal(advanced, 1024); assert.deepEqual(observed, expected); assert.deepEqual(resets, [0, 512]);
});
function fixtureRun() {
  const source = fixture.sides.original, sourceCell = source.savedCells[3].saved.cell;
  const row = { cellIndex: 3, cell: sourceCell, trialIndices: [0, 10, 15], boundaryCount: 0, completionTrials: 1, selected: 3 };
  const binding = { ...fixture.sides.memo7911.binding, kind: 'selected-regression-unit-fixture-not-acceptance' };
  const store = openCompletionRepresentativeEvidence(temp(), binding, { fresh: true });
  const saved = produceSelectedCell(inputs, fixture.policyInputs.flop, fixture.policyInputs.later, binding, store, 3, row);
  validateSelectedCell(inputs, fixture.policyInputs.flop, fixture.policyInputs.later, binding, store, row, saved);
  store.write(store.cellName(3), saved);
  const oldStore = openCompletionRepresentativeEvidence(temp(), source.binding, { fresh: true });
  for (const [path, value] of Object.entries(source.files)) oldStore.write(path, value);
  const oldCell = source.savedCells[3].saved, oldRecord = { ...oldStore.record(oldStore.cellName(3)), numericalHash: contentHash(oldCell) };
  return { row, binding, store, saved, oldStore, oldBinding: source.binding, oldRecord };
}
test('three sparse real trials including knownindex10 exactly match old returns/events/full84-row proof', () => {
  const f = fixtureRun(), result = compareSelectedCell(f.oldStore, f.oldBinding, f.oldRecord, f.store, f.binding, f.row, f.saved);
  assert.equal(result.selectedTrials, 3); assert.equal(result.completionTrials, 1); assert.equal(result.proofHashes.length, 1);
  assert.equal(f.saved.counts.advancedRngTrials, 16); assert.deepEqual(f.saved.resetIndices, [0]);
  assert.deepEqual([...selectedTrials(f.store, f.binding, f.row, f.saved)].map(row => row.index), [0, 10, 15]);
  assert.equal(f.store.readProof(result.proofHashes[0]).rows.length, 84);
});
test('missing/reordered selected indices, wrong bindings/counts and fake reset histories are rejected', () => {
  const f = fixtureRun();
  for (const mutate of [s => s.bindingHash = 'wrong', s => s.index = 4, s => s.chunks.pop(), s => s.proofs.pop(), s => s.counts.completedSelectedTrials--,
    s => s.resetIndices = [], s => s.storageCell.samples = 10000, s => s.extraSourceWrapper = true]) {
    const wrong = structuredClone(f.saved); mutate(wrong);
    assert.throws(() => validateSelectedCell(inputs, fixture.policyInputs.flop, fixture.policyInputs.later, f.binding, f.store, f.row, wrong));
  }
  const wrongRow = { ...f.row, trialIndices: [0, 15, 10] };
  assert.throws(() => [...selectedTrials(f.store, f.binding, wrongRow, f.saved)]);
});
test('fresh trial and full-proof byte tampering cannot be hidden by its sparse wrapper', () => {
  const f = fixtureRun(), proofPath = join(f.store.dir, f.saved.proofs[0].path);
  const proof = JSON.parse(readFileSync(proofPath)); proof.proof.rows.pop(); writeFileSync(proofPath, JSON.stringify(proof) + '\n');
  assert.throws(() => validateSelectedCell(inputs, fixture.policyInputs.flop, fixture.policyInputs.later, f.binding, f.store, f.row, f.saved));
  assert.throws(() => compareSelectedCell(f.oldStore, f.oldBinding, f.oldRecord, f.store, f.binding, f.row, f.saved));
});
test('four real cache controls compare full decision traces and keep index10 and zero retention nonvacuous', () => {
  const controls = runSelectedCacheControls({ playModel11Hand, createModel11BehaviorCompletion }, inputs, fixture.policyInputs.flop, fixture.policyInputs.later, fullPlan, sourceCells);
  assert.equal(controls.controlHandExecutions, 16); assert.equal(controls.cases.length, 4);
  assert.ok(controls.cases[1].completionEvents > 0);
  for (const row of controls.cases) { assert.equal(row.strictZeroRetentionEntries, 0); assert.equal(row.controlHandExecutions, 4); assert.equal(contentHash(row.coldTrace), row.traceHash); }
});
test('targeted entry cannot masquerade as a full gate command', () => {
  const base = ['--operation', 'selected-lane', '--lane', '0', '--spec', '/tmp/spec.json', '--spec-sha256', 'a'.repeat(64), '--execute-targeted'];
  assert.equal(parseSelectedArguments(base)['--lane'], '0');
  for (const wrong of [base.map(x => x === '--execute-targeted' ? '--execute-full' : x), base.map(x => x === 'selected-lane' ? 'report' : x),
    [...base, '--lane', '1'], base.map(x => x === '0' ? '4' : x), base.slice(0, -1)]) assert.throws(() => parseSelectedArguments(wrong));
});
