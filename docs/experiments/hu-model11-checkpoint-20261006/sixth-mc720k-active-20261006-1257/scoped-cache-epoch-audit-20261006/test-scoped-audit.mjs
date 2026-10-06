import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadContext } from '../co-bb-squeeze-btncall-optimized-five-workers/context.mjs';
import { loadScopedAuditApi, createScopedManifest, validateScopedManifest, scanStoredCell, compareScopedCell,
  replayAndCompareCell, advanceUnselectedCell, assertExactEvidenceFiles, runCurrentCacheControls } from './scoped-audit.mjs';

const base = dirname(fileURLToPath(import.meta.url)), out = join(base, 'test-result');
mkdirSync(out); // Fresh only; never reroll or overwrite an existing diagnostic.
const c = loadContext('c1b0e672b29346ab8f0efc2e2dd98f3503d4d19365c24c92d136f00a35d78988');
const api = await loadScopedAuditApi(c.p.repository), binding = c.regressionBinding, index = 2, cell = c.cells[index];
const store = api.openCompletionRepresentativeEvidence(join(c.p.runRoot, 'regression/cells/002'), binding);
const saved = store.read(store.cellName(index)), record = { ...store.record(store.cellName(index)), numericalHash: api.contentHash(saved) };
const priorPath = join(c.p.runRoot, 'attempts/attempt-1936c565-75cc-4d10-94ec-50ec20d18b55/jobs/regression-lane0-0002.completed.json');
const priorReceipt = JSON.parse(readFileSync(priorPath, 'utf8'));
// This diagnostic explicitly invokes native semantics before exercising receipt
// reuse. It does not invent historical execution evidence for the old worker.
api.validateCompletionRepresentativeCell(c.inputs, c.flop, c.later, binding, store, cell, saved);
const receipt = { ...priorReceipt, nativeValidation: { validator: 'validateCompletionRepresentativeCell', source: api.validatorSource,
  calls: 1, fullCell: true, cell: store.record(store.cellName(index)), completed: true } };
const scan = () => scanStoredCell(api, c.inputs, binding, store, index, cell, record, receipt);
const result = scan(); assert.equal(result.trialCount, 64); assert.equal(result.proofCount, 1);
assertExactEvidenceFiles(api, store, result.evidenceFiles);
const row = { cellIndex: index, cell, trialIndices: Array.from({ length: 64 }, (_, i) => i), selected: 64 };
const freshBinding = { ...binding, kind: 'hu-scoped-audit-one-epoch-diagnostic', retainedRecord: record };
const freshStore = api.openCompletionRepresentativeEvidence(join(out, 'fresh'), freshBinding, { fresh: true });
const replay = replayAndCompareCell(api, c.inputs, c.flop, c.later, binding, store, record, freshBinding, freshStore, row);
assert.equal(replay.compared.selectedTrials, 64); assert.equal(replay.compared.proofHashes.length, 1);
const rejected = [];
const fails = (name, fn) => { assert.throws(fn); rejected.push(name); };
fails('wrong source binding', () => scanStoredCell(api, c.inputs, { ...binding, version: 999 }, store, index, cell, record, receipt));
fails('missing native-validation receipt', () => scanStoredCell(api, c.inputs, binding, store, index, cell, record, { ...receipt, nativeValidation: null }));
fails('wrong original cell record', () => scanStoredCell(api, c.inputs, binding, store, index, cell, { ...record, numericalHash: '0'.repeat(64) }, receipt));
const truncatedStore = { ...store, read: (name, pin) => {
  const value = store.read(name, pin); return name.endsWith('.trials.json') ? { ...value, trials: value.trials.slice(0, -1) } : value;
} };
fails('truncated row stream', () => scanStoredCell(api, c.inputs, binding, truncatedStore, index, cell, record, receipt));
const changedProofStore = { ...store, readProof: hash => ({ ...store.readProof(hash), changed: true }) };
fails('changed full proof body', () => scanStoredCell(api, c.inputs, binding, changedProofStore, index, cell, record, receipt));
fails('changed selected full proof', () => compareScopedCell(api, changedProofStore, binding, record, freshStore, freshBinding, row, replay.fresh));
const changedTrialStore = { ...store, read: (name, pin) => {
  const value = store.read(name, pin); if (!name.endsWith('.trials.json')) return value;
  const trials = value.trials.map((t, i) => i === 63 ? { ...t, candidateReturn: t.candidateReturn + 1 } : t);
  return { ...value, trials };
} };
fails('changed stored last trial', () => scanStoredCell(api, c.inputs, binding, changedTrialStore, index, cell, record, receipt));
const fullBinding = { ...binding, plan: { ...binding.plan, samples: 10000 } };
const witnesses = [1, 2, 59].map(cellIndex => ({ cellIndex, reason: cellIndex === 1 ? 'Retained adverse mean condition' : 'Retained semantic completion condition',
  evidence: api.pilotFile(join(base, `../trial-cost-diagnostic-20261006/current-${String(cellIndex).padStart(3, '0')}/result.json`)) }));
const manifest = createScopedManifest(api, c.inputs, fullBinding, witnesses);
assert.deepEqual(createScopedManifest(api, c.inputs, fullBinding, witnesses), manifest);
validateScopedManifest(api, c.inputs, fullBinding, manifest);
assert.equal(new Set(manifest.baseCellIndices.map(i => Math.floor(i / 6))).size, 12);
for (let pair = 0; pair < 6; pair++) assert.equal(manifest.baseCellIndices.filter(i => i % 6 === pair).length, 2);
assert.ok([1, 2, 59].every(i => manifest.selectedCellIndices.includes(i)));
assert.ok(manifest.rows.every(r => r.selected === 144 && r.trialIndices[0] === 0 && r.trialIndices.at(-1) === 9999));
fails('partial selected epoch', () => validateScopedManifest(api, c.inputs, fullBinding, { ...manifest, rows: manifest.rows.map((r, i) => i ? r : { ...r, trialIndices: r.trialIndices.slice(1) }) }));
fails('foreign selection seed', () => validateScopedManifest(api, c.inputs, fullBinding, { ...manifest, selectionSeed: 'reroll' }));
// Independent direct sampling loop proves the shared stream advances rejection
// sampling and the24 action draws even across the long skipped intervals.
const inputsModule = await import('../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/inputs.mjs');
const simulation = await import('../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation.mjs');
const rng = await import('../../hu-model11-prefix-key-execution/apps/frontend/scripts/lib/equity.mjs');
const board = binding.plan.boardList.find(b => b.id === cell.board), fullCell = { ...cell, samples: 10000 };
const ip = inputsModule.makeSampler(inputsModule.seatRange(c.inputs, c.inputs.spot.ip, board.cards));
const oop = inputsModule.makeSampler(inputsModule.seatRange(c.inputs, c.inputs.spot.oop, board.cards));
const random = rng.seededRandom(rng.seedFor(`${c.inputs.config.seed}|${board.id}|${cell.opponent}|${cell.hero}`)), independent = createHash('sha256');
for (let i = 0; i < fullCell.samples; i++) {
  const hands = inputsModule.samplePair(ip, oop, random, c.inputs.spot), runout = simulation.dealRunout(hands, board.cards, random);
  independent.update(JSON.stringify({ index: i, hands, runout, randoms: Array.from({ length: 24 }, () => random()) }) + '\n');
}
const advanced = advanceUnselectedCell(api, c.inputs, fullBinding, fullCell);
assert.equal(advanced.advancedRngTrials, 10000); assert.equal(advanced.strategyTrials, 0); assert.equal(advanced.rngStreamSha256, independent.digest('hex'));
const resetIndices = [];
for (const draw of api.originalDealStream(c.inputs, board, fullCell, i => { if (i % 64 === 0) resetIndices.push(i); })) void draw;
assert.deepEqual(resetIndices, Array.from({ length: 157 }, (_, i) => i * 64));
const cacheControls = runCurrentCacheControls(api, c.inputs, c.flop, c.later, binding);
c.assertUnchanged();
const report = { kind: 'hu-scoped-cache64-audit-focused-test', version: 1, sourceCommit: c.p.commit, replayedTrials: 64,
  selectedFullObjectsEqual: true, fullProofBodiesEqual: true, nativeSemanticValidationExecutedForTest: true,
  sourceCellIndex: index, rngAdvanceTrials: advanced.advancedRngTrials, selectedCellIndices: manifest.selectedCellIndices,
  fullPlanSelectedTrials: manifest.selectedTrials, rejected, selectedManifest: manifest, cacheControls,
  limitations: 'One retained64-trial epoch tested; no720000-trial numerical execution or full fresh replay claim.' };
writeFileSync(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ pass: true, replayedTrials: 64, fullProofs: 1, rejected, selectedCellIndices: manifest.selectedCellIndices,
  fullPlanSelectedTrials: manifest.selectedTrials, maxRssKiB: process.resourceUsage().maxRSS }));
