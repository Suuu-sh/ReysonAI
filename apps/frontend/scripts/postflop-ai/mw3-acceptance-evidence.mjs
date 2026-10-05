// Read-only completeness checks for existing evidence, never a rerun or approval.
import pilot from '../data/postflop-ai-pilot.json' with { type: 'json' };
import { representativeMw3Runouts } from './mw3-audit.mjs';
import { parseCards } from './model.ts';
import { validateMw3SimulationReport } from './mw3-simulation-report.mjs';
import { mw3Sha } from './mw3-inputs.mjs';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = value => Array.isArray(value) && value.length === 0;
const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;
const fail = message => { throw new Error(`Incomplete/stale Mw3 evidence: ${message}`); };
export function verifyMw3Evidence(inputs, reports, { sourceHash, implementationHash, verificationHash, recipeSha256, flopHash, laterHash, authorVersion, policyContexts }) {
  if (sourceHash !== inputs.fingerprint || !Number.isSafeInteger(policyContexts) || policyContexts < 1) fail('trusted source/context identity');
  const identity = { spot: inputs.spot.id, sourceHash, implementationHash, verificationHash, flopHash, laterHash,
    authorModel: 'gpt-6-astra', status: 'candidate_not_published' };
  for (const name of ['all-flops', 'later-runouts', 'joint-defence', 'simulation', 'simulation-replay']) {
    const report = reports[name];
    if (!report || Object.entries(identity).some(([key, value]) => report[key] !== value)) fail(`${name} identity`);
    // The accepted V4 pilot predates these two extra provenance fields. Its
    // recipe is pinned by the saved pair/manifest; never relabel old reports.
    if (inputs.spot.id !== 'CO_open_BTN_call_BB_call' && (report.recipeSha256 !== recipeSha256 || report.authorVersion !== authorVersion)) fail(`${name} recipe identity`);
  }
  const flop = reports['all-flops'];
  if (flop.schemaVersion !== 1 || flop.boards !== 1755 || !Number.isSafeInteger(flop.comboContexts) || flop.comboContexts <= 0 ||
      flop.policyContexts !== policyContexts || flop.scope !== 'all_1755_flops_all_geometric_contexts_all_source_supported_combo_tiers' ||
      !empty(flop.errors) || !empty(flop.uncoveredExplicitSelectors) || !Array.isArray(flop.warnings)) fail('all 1755 flop structural coverage');
  const expectedRunouts = representativeMw3Runouts(pilot.boards.map(row => parseCards(row.cards, 3))), later = reports['later-runouts'];
  if (later.scope !== 'one_actual_board_per_reachable_runout_texture_after_each_representative_flop' || !Array.isArray(later.results) || later.results.length !== expectedRunouts.length) fail('later scope');
  for (const [index, board] of expectedRunouts.entries()) {
    const row = later.results[index];
    if (!row || !same(row.board, board) || row.street !== (board.length === 4 ? 'turn' : 'river') ||
        !empty(row.errors) || !empty(row.missingExplicitContexts) || !Array.isArray(row.warnings)) fail('later board/structural coverage');
  }
  const joint = reports['joint-defence'], expectedEvents = new Set();
  const eventKey = row => JSON.stringify([row.board, row.paths, row.action]);
  for (const row of pilot.boards) for (const actions of [[], ['check'], ['check', 'check']]) for (const action of ['bet33', 'bet75', 'bet125']) {
    expectedEvents.add(eventKey({ board: parseCards(row.cards, 3), paths: { flop: actions }, action }));
  }
  if (!Array.isArray(joint.results) || !Array.isArray(joint.unreachable) || joint.results.length + joint.unreachable.length !== expectedEvents.size) fail('joint 108-event coverage');
  for (const [unreachable, rows] of [[false, joint.results], [true, joint.unreachable]]) for (const row of rows) {
    if (!expectedEvents.delete(eventKey(row))) fail('joint repeated/unknown event');
    if (unreachable) {
      if (row.reason !== 'No policy-supported mw3 range at this history') fail('joint zero-support reason');
      continue;
    }
    const n = row.samples, radius = Math.sqrt(Math.log(2 / 0.001) / (2 * n));
    const warning = Math.abs(row.difference) > 0.15 ? row.difference < 0 ? 'joint_overfold' : 'joint_overcontinue' : null;
    if (row.spot !== inputs.spot.id || row.sourceHash !== sourceHash || !Number.isSafeInteger(n) || n < 20000 || row.seed !== 'mw3-joint-defence-v1' ||
        row.tupleMethod !== 'whole_tuple_rejection_with_folded_participant_blockers' || row.probabilityMethod !== 'mean_of_sequential_fold_products_within_joint_tuple' ||
        row.forcedFoldOutsideSeats !== 'unmodeled' || row.mdfDefinition !== 'rake_agnostic_P_over_P_plus_new_wager_advisory_only' ||
        row.intervalMethod !== 'fixed_sample_hoeffding_99.9pct' || row.severity !== 'warning_only_not_equilibrium_acceptance' ||
        ![row.continuation, row.allFoldProbability, row.mdf].every(probability) || Math.abs(row.continuation + row.allFoldProbability - 1) > 1e-12 ||
        !Number.isFinite(row.difference) || Math.abs(row.continuation - row.mdf - row.difference) > 1e-12 ||
        !Array.isArray(row.continuationInterval) || row.continuationInterval.length !== 2 || !row.continuationInterval.every(probability) ||
        !Array.isArray(row.observableAliases) || !row.observableAliases.includes(row.action) || new Set(row.observableAliases).size !== row.observableAliases.length ||
        row.observableAliases.some(action => !['bet33', 'bet75', 'bet125', 'allin'].includes(action)) ||
        Math.abs(row.continuationInterval[0] - Math.max(0, row.continuation - radius)) > 1e-12 ||
        Math.abs(row.continuationInterval[1] - Math.min(1, row.continuation + radius)) > 1e-12 ||
        !Number.isFinite(row.sampleVariance) || row.sampleVariance < 0 || row.sampleVariance > n / (n - 1) * 0.25 + 1e-12 || row.warning !== warning) fail('joint sample/diagnostic identity');
  }
  if (expectedEvents.size) fail('missing joint event');
  const simulation = reports.simulation;
  validateMw3SimulationReport(simulation, { sourceHash, spotId: inputs.spot.id, seats: inputs.spot.seats, potBb: inputs.spot.potBb,
    stackBb: inputs.spot.stackBb, flopHash, laterHash, samplesPerBoard: pilot.samples_per_board_profile_seat });
  const replay = reports['simulation-replay'];
  if (replay.replayKind !== 'same_engine_deterministic_replay_not_independent_algorithm' || replay.match !== true || replay.boards !== 12 ||
      replay.samplesPerBoard !== simulation.samplesPerBoard || replay.simulationHash !== mw3Sha(simulation)) fail('full deterministic replay identity');
  return { status: 'complete_evidence_not_acceptance', flopBoards: 1755, laterBoards: expectedRunouts.length,
    jointEvents: joint.results.length, zeroSupportEvents: joint.unreachable.length, jointWarningCount: joint.results.filter(row => row.warning).length,
    structuralWarningCount: flop.warnings.length + later.results.reduce((sum, row) => sum + row.warnings.length, 0),
    simulationHands: 12 * simulation.samplesPerBoard, replayHands: 12 * replay.samplesPerBoard,
    limitations: ['AI estimate, not equilibrium/GTO proof', 'Joint MDF deviations are advisory',
      'Zero-support reasons require independent source/policy review', 'Replay uses the same engine, not an independent solver',
      'Structural coverage is geometric context/source-combo tier coverage, not joint policy reach',
      'Fold conditions of seats outside the active three are unmodeled',
      'After 3-to-2, context buckets can merge different surviving opponent identities'] };
}
