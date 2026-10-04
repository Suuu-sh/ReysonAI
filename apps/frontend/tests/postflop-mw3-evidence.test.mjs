import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMw3Evidence } from '../scripts/postflop-ai/mw3-acceptance-evidence.mjs';
import { representativeMw3Runouts } from '../scripts/postflop-ai/mw3-audit.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { mw3Sha } from '../scripts/postflop-ai/mw3-inputs.mjs';
import pilot from '../scripts/data/postflop-ai-pilot.json' with { type: 'json' };
function fixture() {
  const sourceHash = 'a'.repeat(64), inputs = { fingerprint: sourceHash, spot: { id: 'synthetic_never_published', seats: ['BB', 'HJ', 'BTN'], potBb: 8, stackBb: 97.5 } };
  const expected = { sourceHash, implementationHash: 'b'.repeat(64), verificationHash: 'c'.repeat(64), recipeSha256: 'd'.repeat(64),
    flopHash: 'e'.repeat(64), laterHash: 'f'.repeat(64), authorVersion: 1, policyContexts: 96 };
  const identity = { spot: inputs.spot.id, ...expected, authorModel: 'gpt-6-astra', status: 'candidate_not_published' };
  delete identity.policyContexts;
  const simulation = { ...identity, version: 1, samplesPerBoard: 10000, fullRepresentativeScope: true, tupleSampling: 'full_three_player_tuple_rejection',
    policyInterpretation: 'direct_saved_mix_with_observable_alias_sum', purpose: 'deterministic_self_play_chip_flow_not_ev_or_equilibrium_approval',
    results: pilot.boards.map(board => ({ board: board.cards, split: board.split, samples: 10000, seed: `mw3-simulation-v1|${sourceHash}|${board.cards}`,
      wins: { BB: 10000, HJ: 0, BTN: 0 }, ties: 0, foldTerminals: 0, allInTerminals: 0, rakeTotal: 4000,
      finalStackTotals: { BB: 1051000, HJ: 975000, BTN: 975000 }, actionCounts: { flop: { check: 30000 }, turn: { check: 30000 }, river: { check: 30000 } } })) };
  const samples = 20000, radius = Math.sqrt(Math.log(2000) / (2 * samples));
  const jointRows = pilot.boards.flatMap(row => [[], ['check'], ['check', 'check']].flatMap(actions => ['bet33', 'bet75', 'bet125'].map(action => ({
    spot: inputs.spot.id, board: parseCards(row.cards, 3), paths: { flop: actions }, action, observableAliases: [action], sourceHash, samples,
    seed: 'mw3-joint-defence-v1', tupleMethod: 'whole_tuple_rejection_with_folded_participant_blockers', forcedFoldOutsideSeats: 'unmodeled',
    probabilityMethod: 'mean_of_sequential_fold_products_within_joint_tuple', mdfDefinition: 'rake_agnostic_P_over_P_plus_new_wager_advisory_only',
    allFoldProbability: 0.5, continuation: 0.5, mdf: 0.5, difference: 0, continuationInterval: [0.5 - radius, 0.5 + radius], sampleVariance: 0,
    intervalMethod: 'fixed_sample_hoeffding_99.9pct', severity: 'warning_only_not_equilibrium_acceptance', warning: null }))));
  const reports = {
    'all-flops': { ...identity, schemaVersion: 1, boards: 1755, comboContexts: 1, policyContexts: 96, scope: 'all_1755_flops_all_geometric_contexts_all_source_supported_combo_tiers', errors: [], warnings: [], uncoveredExplicitSelectors: [] },
    'later-runouts': { ...identity, scope: 'one_actual_board_per_reachable_runout_texture_after_each_representative_flop', results: representativeMw3Runouts(pilot.boards.map(row => parseCards(row.cards, 3))).map(board => ({ board, street: board.length === 4 ? 'turn' : 'river', errors: [], warnings: [], missingExplicitContexts: [] })) },
    'joint-defence': { ...identity, results: jointRows, unreachable: [] }, simulation,
    'simulation-replay': { ...identity, replayKind: 'same_engine_deterministic_replay_not_independent_algorithm', match: true, boards: 12, samplesPerBoard: 10000, simulationHash: mw3Sha(simulation) },
  };
  return { inputs, expected, reports };
}
test('saved-evidence validator accepts complete synthetic shape without generating policies or running simulation', () => {
  const f = fixture(), result = verifyMw3Evidence(f.inputs, f.reports, f.expected);
  assert.equal(result.status, 'complete_evidence_not_acceptance'); assert.equal(result.jointEvents, 108); assert.equal(result.simulationHands, 120000);
});
test('acceptance evidence keeps structural, outside-seat and opponent-identity abstractions explicit', () => {
  const f = fixture(), result = verifyMw3Evidence(f.inputs, f.reports, f.expected);
  assert.deepEqual(result.limitations.slice(-3), [
    'Structural coverage is geometric context/source-combo tier coverage, not joint policy reach',
    'Fold conditions of seats outside the active three are unmodeled',
    'After 3-to-2, context buckets can merge different surviving opponent identities',
  ]);
});
test('all phases must have current source/recipe identities and full board/event coverage', () => {
  for (const mutate of [
    r => { r['all-flops'].boards = 1754; }, r => { r['all-flops'].errors = [{}]; }, r => { r['all-flops'].uncoveredExplicitSelectors = [{}]; },
    r => { r['later-runouts'].results.pop(); }, r => { r['later-runouts'].results.reverse(); }, r => { r['later-runouts'].results[0].missingExplicitContexts.push({}); },
    r => { r['joint-defence'].results.pop(); }, r => { r['joint-defence'].results[1] = structuredClone(r['joint-defence'].results[0]); },
    r => { r['simulation-replay'].simulationHash = '0'.repeat(64); }, r => { r['simulation-replay'].samplesPerBoard = 9999; },
    r => { r.simulation.recipeSha256 = '0'.repeat(64); }, r => { r['all-flops'].implementationHash = '0'.repeat(64); },
  ]) { const f = fixture(); mutate(f.reports); assert.throws(() => verifyMw3Evidence(f.inputs, f.reports, f.expected)); }
});
test('joint evidence enforces minimum samples, finite intervals and exact warning/accounting metadata', () => {
  for (const mutate of [
    row => { row.samples = 19999; }, row => { row.continuationInterval[0] = NaN; }, row => { row.continuationInterval[1] = Infinity; },
    row => { row.continuation = 0.7; }, row => { row.difference = 0.1; }, row => { row.warning = 'joint_overfold'; },
    row => { row.sampleVariance = -1; }, row => { row.tupleMethod = 'marginal_product'; }, row => { row.observableAliases = []; },
  ]) { const f = fixture(); mutate(f.reports['joint-defence'].results[0]); assert.throws(() => verifyMw3Evidence(f.inputs, f.reports, f.expected)); }
});
test('zero-support entries retain the full event coverage and disclose their review limitation', () => {
  const f = fixture(), row = f.reports['joint-defence'].results.shift();
  f.reports['joint-defence'].unreachable.push({ board: row.board, paths: row.paths, action: row.action, reason: 'No policy-supported mw3 range at this history' });
  const result = verifyMw3Evidence(f.inputs, f.reports, f.expected); assert.equal(result.zeroSupportEvents, 1);
  assert.ok(result.limitations.some(text => text.includes('Zero-support')));
  f.reports['joint-defence'].unreachable[0].reason = 'skipped for speed'; assert.throws(() => verifyMw3Evidence(f.inputs, f.reports, f.expected));
});
