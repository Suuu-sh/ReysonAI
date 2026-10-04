// Advisory diagnostics only. Draw all three holecard ranges simultaneously and reject
// the complete tuple on collision; never multiply independently averaged fold rates.
import { seedFor, seededRandom } from '../lib/equity.mjs';
import { mw3BoardRanges } from './mw3-audit.mjs';
import { applyMw3Action, createMw3Table, mw3Decision, MW3_STREETS, replayMw3, startMw3Street } from './mw3-engine.mjs';
import { cloneMw3Table, mw3ActionGroups, mw3ObservedProbability } from './mw3-actions.mjs';
import { mw3PolicyMix } from './mw3-policy.mjs';
export const MW3_JOINT_SAMPLES = 20000;
const policyFor = (policies, street) => street === 'flop' ? policies.flop : policies.later;
const boardFor = (board, street) => board.slice(0, { flop: 3, turn: 4, river: 5 }[street]);

export function mw3HistoryRanges(inputs, policies, board, paths) {
  // Replay once before range work so malformed/skipped/trailing streets fail closed.
  const expected = replayMw3(inputs.spot, paths);
  if (board.length !== ({ flop: 3, turn: 4, river: 5 }[expected.street])) throw new Error('Joint diagnostic board/street mismatch');
  const ranges = mw3BoardRanges(inputs, board), table = createMw3Table(inputs.spot);
  for (const street of MW3_STREETS.filter(street => Object.hasOwn(paths, street))) {
    startMw3Street(table, street);
    for (const action of paths[street]) {
      const decision = mw3Decision(table), groups = mw3ActionGroups(table), policy = policyFor(policies, street), currentBoard = boardFor(board, street);
      ranges[decision.seat] = ranges[decision.seat].map(item => ({ ...item, weight: item.weight *
        mw3ObservedProbability(groups, mw3PolicyMix(policy, decision, item.combo, currentBoard), action) })).filter(item => item.weight > 0);
      applyMw3Action(table, action);
    }
  }
  return { table, ranges };
}
function weightedSampler(items) {
  let total = 0;
  const thresholds = items.map(item => (total += item.weight));
  if (!(total > 0)) throw new Error('No policy-supported mw3 range at this history');
  return random => {
    const target = random() * total; let lo = 0, hi = items.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (thresholds[mid] <= target) lo = mid + 1; else hi = mid; }
    return items[lo].combo;
  };
}
export function makeMw3TupleSampler(ranges, seats) {
  const samplers = seats.map(seat => weightedSampler(ranges[seat]));
  return random => {
    for (let attempts = 0; attempts < 100000; attempts++) {
      const tuple = samplers.map(sample => sample(random));
      if (new Set(tuple.flat()).size === seats.length * 2) return Object.fromEntries(seats.map((seat, i) => [seat, tuple[i]]));
    }
    throw new Error('Could not draw a legal joint mw3 tuple; do not substitute marginal ranges');
  };
}

export function diagnoseMw3JointFold(inputs, policies, { board, paths, action, samples = MW3_JOINT_SAMPLES, seed = 'mw3-joint-defence-v1' }) {
  if (!Number.isInteger(samples) || samples < MW3_JOINT_SAMPLES) throw new Error(`Joint diagnostic requires at least ${MW3_JOINT_SAMPLES} tuples`);
  const { table, ranges } = mw3HistoryRanges(inputs, policies, board, paths), decision = mw3Decision(table);
  if (decision.end || !decision.actions.includes(action) || !['raise', 'allin'].includes(action) && !action.startsWith('bet')) throw new Error('Joint diagnostic needs a legal aggressive action');
  const groups = mw3ActionGroups(table), policy = policyFor(policies, decision.street);
  // Condition the bettor on the actual observable wager, including every same-amount alias.
  ranges[decision.seat] = ranges[decision.seat].map(item => ({ ...item, weight: item.weight *
    mw3ObservedProbability(groups, mw3PolicyMix(policy, decision, item.combo, board), action) })).filter(item => item.weight > 0);
  const sample = makeMw3TupleSampler(ranges, inputs.spot.seats), random = seededRandom(seedFor(`${seed}|${inputs.fingerprint}|${JSON.stringify(board)}|${JSON.stringify(paths)}|${action}`));
  const afterBet = cloneMw3Table(table); applyMw3Action(afterBet, action);
  const risk = afterBet.pot - table.pot, mdf = table.pot / (table.pot + risk);
  // The all-fold line's state changes (including 3→2 live players) are known. A tuple's
  // fold probabilities are multiplied inside that very tuple along this sequential line.
  const foldLine = [], probe = cloneMw3Table(afterBet);
  while (!mw3Decision(probe).end) {
    const response = mw3Decision(probe);
    if (!response.actions.includes('fold')) throw new Error('Invalid joint all-fold line');
    foldLine.push(response); applyMw3Action(probe, 'fold');
  }
  if (probe.winner !== decision.seat) throw new Error('Joint all-fold line has the wrong winner');
  const caches = foldLine.map(() => new Map());
  let mean = 0, m2 = 0;
  for (let n = 1; n <= samples; n++) {
    const tuple = sample(random); let product = 1;
    for (const [index, response] of foldLine.entries()) {
      const combo = tuple[response.seat], key = combo[0] * 52 + combo[1], cache = caches[index];
      if (!cache.has(key)) cache.set(key, mw3PolicyMix(policy, response, combo, board).fold / 100);
      product *= cache.get(key);
    }
    const delta = product - mean; mean += delta / n; m2 += delta * (product - mean);
  }
  const radius = Math.sqrt(Math.log(2 / 0.001) / (2 * samples));
  const continuation = 1 - mean;
  return { spot: inputs.spot.id, board, paths, action, observableAliases: groups.find(group => group.actions.includes(action)).actions,
    sourceHash: inputs.fingerprint, samples, seed, tupleMethod: 'whole_tuple_rejection_with_folded_participant_blockers',
    forcedFoldOutsideSeats: 'unmodeled', probabilityMethod: 'mean_of_sequential_fold_products_within_joint_tuple',
    allFoldProbability: mean, continuation, mdf, difference: continuation - mdf,
    continuationInterval: [Math.max(0, continuation - radius), Math.min(1, continuation + radius)],
    sampleVariance: m2 / (samples - 1), intervalMethod: 'fixed_sample_hoeffding_99.9pct',
    severity: 'warning_only_not_equilibrium_acceptance', warning: Math.abs(continuation - mdf) > 0.15 ? continuation < mdf ? 'joint_overfold' : 'joint_overcontinue' : null };
}
