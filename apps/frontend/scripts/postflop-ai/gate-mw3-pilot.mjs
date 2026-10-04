// Explicit local representative gate. This compiles the already-authored Astra source,
// never invokes an AI, writes source ranges, deploys or imports D1.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMw3PilotPolicies, MW3_PILOT_AUTHORSHIP } from '../data/mw3-co-btn-bb-authored.mjs';
import { loadMw3Inputs, mw3Root, mw3Sha } from './mw3-inputs.mjs';
import { probeMw3Hand } from './mw3-tree.mjs';
import { auditMw3AllFlops, auditMw3Board, representativeMw3Runouts } from './mw3-audit.mjs';
import { diagnoseMw3JointFold } from './mw3-joint-defence.mjs';
import { parseCards } from './model.mjs';
import pilot from '../data/postflop-ai-pilot.json' with { type: 'json' };
const args = new Set(process.argv.slice(2));
if ([...args].some(arg => !['--all-flops', '--later', '--joint'].includes(arg)) || !args.size) throw new Error('Use --all-flops, --later and/or --joint explicitly');
const inputs = loadMw3Inputs(MW3_PILOT_AUTHORSHIP.spotId), contract = probeMw3Hand(inputs.spot), policies = buildMw3PilotPolicies(inputs, contract);
const outDir = join(mw3Root, '.local/postflop-ai/mw3/pilot-gate'); mkdirSync(outDir, { recursive: true });
const identity = { spot: inputs.spot.id, sourceHash: inputs.fingerprint, flopHash: mw3Sha(policies.flop), laterHash: mw3Sha(policies.later),
  authorModel: MW3_PILOT_AUTHORSHIP.model, status: 'candidate_not_published' };
if (args.has('--all-flops')) {
  const report = auditMw3AllFlops(inputs, policies, { contract, onProgress: row => console.log(`flops ${row.boards}/${row.total}`) });
  writeFileSync(join(outDir, 'all-flops.json'), JSON.stringify({ ...identity, ...report }) + '\n');
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
  writeFileSync(join(outDir, 'later-runouts.json'), JSON.stringify({ ...identity, scope: 'one_actual_board_per_reachable_runout_texture_after_each_representative_flop', results }) + '\n');
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
  writeFileSync(join(outDir, 'joint-defence.json'), JSON.stringify({ ...identity, results, unreachable }) + '\n');
  console.log(JSON.stringify({ task: 'joint', events: results.length, unreachable: unreachable.length, samplesPerEvent: 20000,
    warnings: results.filter(row => row.warning).length }));
}
console.log(JSON.stringify({ memory: process.memoryUsage(), ...identity }));
