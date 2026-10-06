import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fixture, emitFresh } from './helpers/model11-execution-fixtures.mjs';
import { resolveModel11GatePlan, validateModel11Simulation, simulationNumerical, expectedModel11LaterCoverage } from '../scripts/postflop-ai/model11-gate-contract.mjs';
import { captureModel11GateSource } from '../scripts/postflop-ai/model11-gate-source.mjs';
import { validateModel11BoardRow } from '../scripts/postflop-ai/model11-gate-drivers.mjs';
import { parseModel11GateArguments } from '../scripts/postflop-ai/evaluate-model11-audit.mjs';
import { createModel11Execution } from '../scripts/postflop-ai/execution-model11.mjs';
import { createModel11BalanceFacade } from '../scripts/postflop-ai/gate-model11.mjs';
import { replayDecision } from '../scripts/postflop-ai/defence.mjs';
import { verifyZeroLikelihoodProof } from '../scripts/postflop-ai/model11-zero-proof.mjs';
import { contentHash, savedPayloadHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { seatRange } from '../scripts/postflop-ai/inputs.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { model11SampleStats, summarizeModel11Trials } from '../scripts/postflop-ai/simulation-model11.mjs';
const planFile = name => JSON.parse(readFileSync(new URL(`./fixtures/model11-${name}-plan.json`, import.meta.url)));
const repository = new URL('../../../', import.meta.url);

test('model11 driver plans prohibit default work reduced full gates and expanded diagnostics', () => {
  const { inputs, execution } = fixture(); execution.releaseBoardCaches();
  assert.throws(() => parseModel11GateArguments([]));
  assert.throws(() => resolveModel11GatePlan(inputs, planFile('representative-full')));
  const full = resolveModel11GatePlan(inputs, planFile('representative-full'), { executeFull: true });
  assert.equal(full.boardList.length, 12); assert.equal(full.samples, 10000);
  assert.deepEqual(full.profiles, ['standard', 'passive', 'aggressive']);
  assert.deepEqual(full.heroes, [inputs.spot.ip, inputs.spot.oop]); assert.equal(full.street, 'all'); assert.equal(full.authored, true);
  assert.equal(full.boardList.length * full.profiles.length * full.heroes.length * full.samples, 720000);
  for (const extra of [{ samples: 1 }, { boardIds: ['As7d2c'] }, { street: 'flop' }, { authored: false }]) assert.throws(() => resolveModel11GatePlan(inputs, { ...planFile('representative-full'), ...extra }, { executeFull: true }));
  const all = resolveModel11GatePlan(inputs, planFile('all-board-full'), { executeFull: true });
  assert.equal(all.boardList.length, 1755); assert.equal(all.street, 'all');
  assert.throws(() => resolveModel11GatePlan(inputs, { ...planFile('representative-diagnostic'), samples: 10000 }));
  assert.throws(() => resolveModel11GatePlan(inputs, { ...planFile('all-board-diagnostic'), boardIds: ['2c2d2h', '2c2d3c'] }));
  emitFresh('gate-driver-fixed-plans', { checks: { defaultRejected: true, full720000Slots: true, all1755: true, diagnosticNonAcceptance: true } });
});

test('model11 driver report contract rejects missing cells metrics identities counts and survivor EV', () => {
  const { inputs, execution } = fixture(); execution.releaseBoardCaches();
  const plan = resolveModel11GatePlan(inputs, planFile('representative-diagnostic'));
  const board = plan.boardList[0], binding = { execution: { test: 'synthetic-unit-fixture' }, belief: { test: true }, artifactProvenance: { test: true } };
  const row = { board: board.id, split: board.split, hero: 'BB', opponent: 'standard', ...summarizeModel11Trials({ attempted: 1, candidate: [1], baseline: [0], unresolved: [] }) };
  const report = { kind: 'model11-offline-simulation-not-acceptance', version: 2, ...binding,
    planIdentity: contentHash({ boards: plan.boardList, samples: 1, seed: plan.seed, cacheBatchSize: 1, profiles: plan.profiles, heroes: plan.heroes }),
    samples_per_board_profile_seat: 1, seed: plan.seed, profiles: plan.profiles, heroes: plan.heroes,
    counts: { attempted: 1, completed: 1, offModel: 0 }, diagnostics: { elapsedMs: 123 }, results: [row] };
  const valid = validateModel11Simulation(inputs, plan, binding, report); assert.equal(valid.counts.requestedTrials, 1);
  const telemetry = structuredClone(report); telemetry.diagnostics = { elapsedMs: 456, memory: 999 };
  assert.deepEqual(simulationNumerical(report), simulationNumerical(telemetry));
  for (const edit of [r => r.results.pop(), r => r.results.push(row), r => r.counts.completed++, r => r.execution.test = 'wrong', r => r.results[0].split = 'wrong', r => r.results[0].candidate_ev_bb.mean = null]) {
    const bad = structuredClone(report); edit(bad); assert.throws(() => validateModel11Simulation(inputs, plan, binding, bad));
  }
  const unresolved = structuredClone(report);
  Object.assign(unresolved.results[0], summarizeModel11Trials({ attempted: 1, candidate: [], baseline: [], unresolved: [{ index: 0, status: 'off-model-observed-action', message: 'synthetic test only', decision: { randomIndex: 0, request: { board: board.cards, path: { flop: [] } } }, zeroLikelihoodProof: null }] }));
  unresolved.counts = { attempted: 1, completed: 0, offModel: 1 };
  assert.equal(validateModel11Simulation(inputs, plan, binding, unresolved).complete, false);
  unresolved.results[0].candidate_ev_bb = model11SampleStats([1]);
  assert.throws(() => validateModel11Simulation(inputs, plan, binding, unresolved));
});

test('model11 driver source inventory rejects changed dependencies and missing raw inputs', () => {
  const identity = captureModel11GateSource();
  assert.equal(identity.inputs.length, 12);
  const root = mkdtempSync(join(tmpdir(), 'model11-driver-source-'));
  try {
    for (const record of [...identity.sources, identity.inventory, ...identity.inputs]) {
      const destination = join(root, record.path); mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(new URL(record.path, repository), destination);
    }
    assert.deepEqual(captureModel11GateSource({ root }), identity);
    const target = identity.sources.find(item => item.path.endsWith('model11-gate-contract.mjs')).path;
    writeFileSync(join(root, target), '\nimport(unrecordedPath);\n', { flag: 'a' });
    assert.throws(() => captureModel11GateSource({ root }), /closed inventory/);
    copyFileSync(new URL(target, repository), join(root, target));
    rmSync(join(root, identity.inputs[0].path));
    assert.throws(() => captureModel11GateSource({ root }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('model11 exact zero certificate covers every actor combo and binds the skipped descendant', () => {
  const { inputs, flop, later, execution: original } = fixture(); original.releaseBoardCaches();
  const revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const execution = createModel11Execution(inputs, revised, linked), request = { board: parseCards('Jc9d4h', 3), path: { flop: ['bet33'] } };
  let certificate;
  assert.throws(() => execution.rangeState(request, inputs.spot.ip), error => {
    certificate = error.zeroLikelihoodProof;
    return error.status === 'off-model-observed-action' && certificate?.rows.length > 0;
  });
  assert.equal(verifyZeroLikelihoodProof(execution, certificate, request).eligible, true);
  assert.equal(certificate.afterTotal, 0); assert.ok(certificate.rows.every(row => row.physicalMass === 0 && row.afterWeight === 0));
  for (const altered of [{ board: parseCards('Tc9d4h', 3), path: request.path }, { board: request.board, path: { flop: ['bet75'] } }]) assert.throws(() => verifyZeroLikelihoodProof(execution, certificate, altered), /prefix|descend/);
  const incomplete = structuredClone(certificate); incomplete.rows.pop();
  const { proofHash: _old, ...body } = incomplete; incomplete.proofHash = contentHash(body);
  assert.throws(() => verifyZeroLikelihoodProof(execution, incomplete, request), /support|accounting/);
  const prefix = execution.prefix(request), binding = { execution: execution.identity, belief: execution.belief,
    artifactProvenance: execution.artifactProvenance, plan: { kind: 'all-boards', street: 'flop' } };
  const board = { id: 'Jc9d4h', cards: request.board };
  const root = execution.prefix({ board: request.board, path: { flop: [] } });
  const persisted = { board: board.id, bindingHash: contentHash(binding), complete: true,
    stages: [{ street: 'flop', complete: true }], flopRoot: { request: { board: root.board, path: root.path }, prefixIdentity: contentHash(root), actor: root.pending.seat, evaluatedCombos: seatRange(inputs, root.pending.seat, root.board).length }, globalFindings: [], findings: [], offModelStages: 0,
    prefixCounts: { requested: 2, evaluated: 1, provedModelUnreachable: 1, unresolved: 0 },
    modelUnreachableProofs: [certificate], modelUnreachablePrefixes: [{ request, prefixIdentity: contentHash(prefix), proofHash: certificate.proofHash }] };
  const verifyProof = (proof, target) => verifyZeroLikelihoodProof(execution, proof, target);
  validateModel11BoardRow(inputs, binding, board, persisted, { verifyProof });
  const empty = structuredClone(persisted); empty.prefixCounts = { requested: 0, evaluated: 0, provedModelUnreachable: 0, unresolved: 0 }; empty.modelUnreachableProofs = []; empty.modelUnreachablePrefixes = []; empty.flopRoot = null;
  assert.throws(() => validateModel11BoardRow(inputs, binding, board, empty, { verifyProof }), /empty|initial/);
  const forged = structuredClone(persisted);
  forged.modelUnreachableProofs = [incomplete]; forged.modelUnreachablePrefixes[0].proofHash = incomplete.proofHash;
  // All self hashes have been recomputed: only full semantic support replay catches this.
  assert.throws(() => validateModel11BoardRow(inputs, binding, board, forged, { verifyProof }), /support|accounting/);
  assert.throws(() => validateModel11BoardRow(inputs, binding, board, persisted), /semantic verification/);
  const bridge = createModel11BalanceFacade(inputs, revised, linked), table = replayDecision(inputs, request.board, request.path, inputs.config);
  assert.equal(bridge.facade.context(table, request.board, table.log.at(-1).node), null);
  assert.ok(bridge.coverage().some(row => row.state === 'proved-model-unreachable' && row.zeroLikelihoodVerification.eligible));
  // The gate-only permission does not change the same execution's actual-observation contract.
  assert.throws(() => execution.rangeState(request, inputs.spot.ip), error => error.status === 'off-model-observed-action');
  emitFresh('gate-exact-zero-certificate', { certificate, checks: { completeSupport: true, wrongBoardRejected: true, wrongBranchRejected: true, gateOnly: true } });
  execution.releaseBoardCaches(); bridge.execution.releaseBoardCaches();
});
