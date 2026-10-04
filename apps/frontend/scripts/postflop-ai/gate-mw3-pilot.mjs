// Explicit local representative gate. This compiles the already-authored Astra source,
// never invokes an AI, writes source ranges, deploys or imports D1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMw3PilotPolicies, MW3_PILOT_AUTHORSHIP } from '../data/mw3-co-btn-bb-authored.mjs';
import { loadMw3Inputs, mw3Root, mw3Sha } from './mw3-inputs.mjs';
import { probeMw3Hand } from './mw3-tree.mjs';
import { auditMw3AllFlops, auditMw3Board, representativeMw3Runouts } from './mw3-audit.mjs';
import { diagnoseMw3JointFold } from './mw3-joint-defence.mjs';
import { mw3ImplementationHash } from './mw3-artifacts.mjs';
import { simulateMw3 } from './mw3-simulation.mjs';
import { validateMw3SimulationReport } from './mw3-simulation-report.mjs';
import { parseCards } from './model.mjs';
import pilot from '../data/postflop-ai-pilot.json' with { type: 'json' };
const args = new Set(process.argv.slice(2));
if ([...args].some(arg => !['--all-flops', '--later', '--joint', '--simulate', '--replay'].includes(arg)) || !args.size) throw new Error('Use --all-flops, --later, --joint, --simulate and/or --replay explicitly');
const inputs = loadMw3Inputs(MW3_PILOT_AUTHORSHIP.spotId), contract = probeMw3Hand(inputs.spot), policies = buildMw3PilotPolicies(inputs, contract);
const implementationHash = mw3ImplementationHash();
const verificationHash = mw3Sha(Object.fromEntries(['gate-mw3-pilot.mjs', 'mw3-audit.mjs', 'mw3-simulation.mjs', 'mw3-simulation-report.mjs', 'flop-isomorphism.mjs', '../data/postflop-ai-pilot.json']
  .map(path => [path, readFileSync(join(mw3Root, 'scripts/postflop-ai', path), 'utf8')])));
const outDir = join(mw3Root, '.local/postflop-ai/mw3/pilot-gate', `v${MW3_PILOT_AUTHORSHIP.version}-${inputs.fingerprint.slice(0, 12)}-${implementationHash.slice(0, 12)}-${verificationHash.slice(0, 12)}`);
mkdirSync(outDir, { recursive: true });
const identity = { spot: inputs.spot.id, sourceHash: inputs.fingerprint, flopHash: mw3Sha(policies.flop), laterHash: mw3Sha(policies.later),
  implementationHash, verificationHash, authorModel: MW3_PILOT_AUTHORSHIP.model, status: 'candidate_not_published' };
function saveReport(name, report) {
  const path = join(outDir, `${name}.json`), text = `${JSON.stringify(report)}\n`;
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== text) throw new Error(`Existing mw3 report differs and is preserved: ${path}`);
  } else writeFileSync(path, text, { flag: 'wx' });
  return path;
}
console.log(JSON.stringify({ outDir, ...identity }));
if (args.has('--all-flops')) {
  const report = auditMw3AllFlops(inputs, policies, { contract, onProgress: row => console.log(`flops ${row.boards}/${row.total}`) });
  saveReport('all-flops', { ...identity, ...report });
  console.log(JSON.stringify({ task: 'all-flops', boards: report.boards, errors: report.errors.length, warnings: report.warnings.length,
    missingExplicitContexts: report.uncoveredExplicitSelectors.length, comboContexts: report.comboContexts }));
  if (report.errors.length || report.uncoveredExplicitSelectors.length) process.exitCode = 1;
}
if (args.has('--later')) {
  const boards = representativeMw3Runouts(pilot.boards.map(item => parseCards(item.cards, 3))), results = [];
  for (const [index, board] of boards.entries()) {
    const report = auditMw3Board(inputs, policies, board, contract.contexts);
    const missing = Object.entries(report.coverage).flatMap(([context, tiers]) => Object.entries(tiers).flatMap(([tier, fields]) =>
      Object.entries(fields).filter(([, ok]) => !ok).map(([field]) => ({ context, tier, field }))));
    results.push({ board, street: report.street, errors: report.errors, warnings: report.warnings, missingExplicitContexts: missing });
    if ((index + 1) % 25 === 0) console.log(`runouts ${index + 1}/${boards.length}`);
  }
  const errors = results.reduce((sum, row) => sum + row.errors.length, 0), missing = results.reduce((sum, row) => sum + row.missingExplicitContexts.length, 0);
  saveReport('later-runouts', { ...identity, scope: 'one_actual_board_per_reachable_runout_texture_after_each_representative_flop', results });
  console.log(JSON.stringify({ task: 'later', boards: results.length, errors, missingExplicitContexts: missing }));
  if (errors || missing) process.exitCode = 1;
}
if (args.has('--joint')) {
  const results = [], unreachable = [];
  for (const item of pilot.boards) for (const actions of [[], ['check'], ['check', 'check']]) for (const action of ['bet33', 'bet75', 'bet125']) {
    const options = { board: parseCards(item.cards, 3), paths: { flop: actions }, action };
    try { results.push(diagnoseMw3JointFold(inputs, policies, options)); }
    catch (error) {
      if (/No policy-supported/.test(error.message)) unreachable.push({ ...options, reason: error.message });
      else throw error;
    }
  }
  saveReport('joint-defence', { ...identity, results, unreachable });
  console.log(JSON.stringify({ task: 'joint', events: results.length, unreachable: unreachable.length, samplesPerEvent: 20000,
    warnings: results.filter(row => row.warning).length }));
}
const simulationOptions = { onBoard: row => console.log(JSON.stringify({ task: 'self-play-board', board: row.board, samples: row.samples, folds: row.foldTerminals, ties: row.ties })) };
const simulationExpected = { sourceHash: inputs.fingerprint, spotId: inputs.spot.id, seats: inputs.spot.seats, potBb: inputs.spot.potBb,
  stackBb: inputs.spot.stackBb, flopHash: identity.flopHash, laterHash: identity.laterHash, samplesPerBoard: pilot.samples_per_board_profile_seat };
if (args.has('--simulate')) {
  const report = simulateMw3(inputs, policies, simulationOptions);
  validateMw3SimulationReport(report, simulationExpected);
  saveReport('simulation', { ...identity, ...report });
  console.log(JSON.stringify({ task: 'simulation', boards: report.results.length, samplesPerBoard: report.samplesPerBoard, reportHash: mw3Sha(report) }));
}
if (args.has('--replay')) {
  const expected = JSON.parse(readFileSync(join(outDir, 'simulation.json'), 'utf8'));
  if (Object.entries(identity).some(([key, value]) => expected[key] !== value)) throw new Error('Stale mw3 simulation cannot be replayed as current');
  validateMw3SimulationReport(expected, simulationExpected);
  const actual = { ...identity, ...simulateMw3(inputs, policies, simulationOptions) };
  validateMw3SimulationReport(actual, simulationExpected);
  if (mw3Sha(actual) !== mw3Sha(expected)) throw new Error('Deterministic mw3 simulation replay mismatch');
  saveReport('simulation-replay', { ...identity, replayKind: 'same_engine_deterministic_replay_not_independent_algorithm', simulationHash: mw3Sha(expected), match: true,
    boards: actual.results.length, samplesPerBoard: actual.samplesPerBoard });
  console.log(JSON.stringify({ task: 'simulation-replay', match: true, boards: actual.results.length, samplesPerBoard: actual.samplesPerBoard }));
}
console.log(JSON.stringify({ memory: process.memoryUsage(), ...identity }));
