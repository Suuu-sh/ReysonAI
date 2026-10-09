import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMw3SimulationReport } from '../scripts/postflop-ai/mw3-simulation-report.mjs';
import pilot from '../scripts/data/postflop-ai-pilot.json' with { type: 'json' };
const expected = { sourceHash: 'a'.repeat(64), spotId: 'synthetic-never-published', seats: ['BB', 'CO', 'BTN'],
  potBb: 8, stackBb: 97.5, flopHash: 'b'.repeat(64), laterHash: 'c'.repeat(64), samplesPerBoard: 10000 };
function fixture() {
  const n = expected.samplesPerBoard;
  return { version: 1, sourceHash: expected.sourceHash, spot: expected.spotId, flopHash: expected.flopHash,
    laterHash: expected.laterHash, samplesPerBoard: n, fullRepresentativeScope: true,
    tupleSampling: 'full_three_player_tuple_rejection', policyInterpretation: 'direct_saved_mix_with_observable_alias_sum',
    purpose: 'deterministic_self_play_chip_flow_not_ev_or_equilibrium_approval', results: pilot.boards.map(board => ({
      board: board.cards, split: board.split, samples: n, seed: `mw3-simulation-v1|${expected.sourceHash}|${board.cards}`,
      wins: { BB: n, CO: 0, BTN: 0 }, ties: 0, foldTerminals: 0, allInTerminals: 0,
      rakeTotal: 0.4 * n, finalStackTotals: { BB: 105.1 * n, CO: 97.5 * n, BTN: 97.5 * n },
      actionCounts: { flop: { check: 3 * n }, turn: { check: 3 * n }, river: { check: 3 * n } },
    })) };
}
const reject = mutation => { const report = fixture(); mutation(report, report.results[0]); assert.throws(() => validateMw3SimulationReport(report, expected), /Invalid mw3 simulation report/); };

test('independent report validator is pure and accepts a complete synthetic accounting fixture', () => {
  const report = fixture(), before = JSON.stringify(report);
  assert.equal(validateMw3SimulationReport(report, expected), report);
  assert.equal(JSON.stringify(report), before);
  assert.throws(() => validateMw3SimulationReport(report), /expected identity/);
});
test('report identities, minimum samples, complete ordered boards and deterministic seeds are required', () => {
  for (const key of ['sourceHash', 'flopHash', 'laterHash', 'spot', 'tupleSampling', 'policyInterpretation', 'purpose']) reject(report => { report[key] = 'wrong'; });
  reject(report => { report.samplesPerBoard = 9999; });
  reject(report => { report.fullRepresentativeScope = false; });
  reject(report => { report.results.pop(); });
  reject(report => { report.results[1] = structuredClone(report.results[0]); });
  reject(report => { report.results.reverse(); });
  for (const key of ['samples', 'split', 'seed', 'board']) reject((report, row) => { row[key] = 'wrong'; });
});
test('winner totals, terminal overlap semantics and integer counters are checked independently', () => {
  reject((report, row) => { row.wins.BB--; });
  reject((report, row) => { row.wins.UTG = 0; });
  reject((report, row) => { row.ties = 0.5; });
  reject((report, row) => { row.foldTerminals = 1; });
  reject((report, row) => { row.allInTerminals = 1; });
  // A shove followed by two folds is both a fold terminal and an all-in event.
  const report = fixture(), row = report.results[0], n = expected.samplesPerBoard;
  row.foldTerminals = n; row.allInTerminals = n;
  row.actionCounts = { flop: { allin: n, fold: 2 * n }, turn: {}, river: {} };
  assert.equal(validateMw3SimulationReport(report, expected), report);
});
test('street action bounds and whole-hand fold accounting reject impossible logs', () => {
  reject((report, row) => { row.actionCounts.preflop = {}; });
  reject((report, row) => { row.actionCounts.flop.solver = 0; });
  reject((report, row) => { row.actionCounts.flop.check = 29999; });
  reject((report, row) => { row.actionCounts.flop.raise = 20001; });
  reject((report, row) => { row.actionCounts.turn.bet33 = 10001; });
  reject((report, row) => { row.actionCounts.river.fold = 10001; });
  reject((report, row) => { row.actionCounts.turn.check = NaN; });
});
test('rake cap, per-seat bounds and aggregate chip conservation catch missing or manufactured chips', () => {
  reject((report, row) => { row.rakeTotal = -1; });
  reject((report, row) => { row.rakeTotal = 30001; });
  reject((report, row) => { row.rakeTotal = 3999; });
  reject((report, row) => { row.finalStackTotals.BB += 0.01; });
  reject((report, row) => { row.finalStackTotals.CO = Infinity; });
  reject((report, row) => { delete row.finalStackTotals.BTN; });
  const report = fixture(); report.results[0].finalStackTotals.BB += 1e-7;
  validateMw3SimulationReport(report, expected);
});
