// Independent, pure accounting checks for saved simulation reports. This does not
// run the simulator, prove strategy quality, or replace deterministic replay.
import pilot from '../data/postflop-ai-pilot.json' with { type: 'json' };
const HASH = /^[a-f0-9]{64}$/;
const STREETS = ['flop', 'turn', 'river'];
const ACTIONS = ['check', 'fold', 'call', 'bet33', 'bet75', 'bet125', 'allin', 'raise'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, expected) => object(value) && Object.keys(value).length === expected.length &&
  expected.every(key => Object.hasOwn(value, key));
const count = (value, limit) => Number.isSafeInteger(value) && value >= 0 && value <= limit;
const sum = values => values.reduce((total, value) => total + value, 0);
const fail = detail => { throw new Error(`Invalid mw3 simulation report: ${detail}`); };

export function validateMw3SimulationReport(report, { sourceHash, spotId, seats, potBb, stackBb,
  flopHash, laterHash, samplesPerBoard = 10000 } = {}) {
  if (![sourceHash, flopHash, laterHash].every(hash => typeof hash === 'string' && HASH.test(hash)) ||
      typeof spotId !== 'string' || !spotId || !Array.isArray(seats) || seats.length !== 3 ||
      new Set(seats).size !== 3 || seats.some(seat => typeof seat !== 'string' || !seat) ||
      !Number.isFinite(potBb) || potBb <= 0 || !Number.isFinite(stackBb) || stackBb <= 0 ||
      !Number.isSafeInteger(samplesPerBoard) || samplesPerBoard < 10000 ||
      !Number.isSafeInteger(samplesPerBoard * 27)) fail('trusted expected identity/geometry');
  if (!object(report) || report.version !== 1 || report.sourceHash !== sourceHash || report.spot !== spotId ||
      report.flopHash !== flopHash || report.laterHash !== laterHash || report.samplesPerBoard !== samplesPerBoard ||
      report.fullRepresentativeScope !== true || report.tupleSampling !== 'full_three_player_tuple_rejection' ||
      report.policyInterpretation !== 'direct_saved_mix_with_observable_alias_sum' ||
      report.purpose !== 'deterministic_self_play_chip_flow_not_ev_or_equilibrium_approval') fail('identity or scope');
  if (pilot.boards.length !== 12 || !Array.isArray(report.results) || report.results.length !== 12) fail('all twelve representative boards required');
  const initialTotal = potBb + 3 * stackBb, totalChips = samplesPerBoard * initialTotal;
  // Per-hand integer-cent wagers are exact; aggregate floating-point payouts can
  // accumulate tiny summation errors. This is 0.00001BB at 10,000 samples.
  const tolerance = Math.max(1e-6, samplesPerBoard * 1e-9);
  if (!Number.isFinite(totalChips)) fail('aggregate chip bound');
  for (const [index, expected] of pilot.boards.entries()) {
    const row = report.results[index], label = expected.cards;
    if (!object(row) || row.board !== expected.cards || row.split !== expected.split || row.samples !== samplesPerBoard ||
        row.seed !== `mw3-simulation-v1|${sourceHash}|${expected.cards}`) fail(`${label}: board, sample or seed identity`);
    if (!sameKeys(row.wins, seats) || !seats.every(seat => count(row.wins[seat], samplesPerBoard)) ||
        !count(row.ties, samplesPerBoard) || sum(Object.values(row.wins)) + row.ties !== samplesPerBoard) fail(`${label}: winner/tie counts`);
    if (!count(row.foldTerminals, samplesPerBoard) || !count(row.allInTerminals, samplesPerBoard) ||
        row.foldTerminals > sum(Object.values(row.wins))) fail(`${label}: terminal counts`);
    if (!sameKeys(row.actionCounts, STREETS)) fail(`${label}: street action counts`);
    let folds = 0, literalAllins = 0, callOrAggression = 0;
    for (const street of STREETS) {
      const actions = row.actionCounts[street];
      if (!object(actions) || Object.entries(actions).some(([action, value]) => !ACTIONS.includes(action) || !count(value, 9 * samplesPerBoard))) fail(`${label}/${street}: unknown or invalid action count`);
      const total = sum(Object.values(actions));
      // Three actors, one opening wager, at most two raises: no street exceeds
      // nine decisions, including the two possible checks before the first bet.
      if (total > 9 * samplesPerBoard || street === 'flop' && total < 3 * samplesPerBoard ||
          (actions.check ?? 0) > 3 * samplesPerBoard || (actions.raise ?? 0) > 2 * samplesPerBoard ||
          (actions.fold ?? 0) > 2 * samplesPerBoard ||
          sum(['bet33', 'bet75', 'bet125', 'allin'].map(action => actions[action] ?? 0)) > samplesPerBoard) fail(`${label}/${street}: impossible aggregate action count`);
      folds += actions.fold ?? 0;
      literalAllins += actions.allin ?? 0;
      callOrAggression += sum(['call', 'raise', 'bet33', 'bet75', 'bet125', 'allin'].map(action => actions[action] ?? 0));
    }
    // A fold win needs exactly two original players to have folded. A showdown
    // can have zero or one fold. Fold terminals and all-in terminals may overlap.
    if (folds < 2 * row.foldTerminals || folds > samplesPerBoard + row.foldTerminals ||
        literalAllins > 3 * row.allInTerminals || row.allInTerminals > callOrAggression) fail(`${label}: terminal/action accounting`);
    const minimumRake = Math.min(potBb * 0.05, 3) * samplesPerBoard;
    if (!Number.isFinite(row.rakeTotal) || row.rakeTotal < minimumRake - tolerance || row.rakeTotal > 3 * samplesPerBoard + tolerance ||
        !sameKeys(row.finalStackTotals, seats) || !seats.every(seat => Number.isFinite(row.finalStackTotals[seat]) &&
          row.finalStackTotals[seat] >= 0 && row.finalStackTotals[seat] <= totalChips + tolerance)) fail(`${label}: stack/rake bounds`);
    if (Math.abs(sum(Object.values(row.finalStackTotals)) + row.rakeTotal - totalChips) > tolerance) fail(`${label}: aggregate chip conservation`);
  }
  return report;
}
