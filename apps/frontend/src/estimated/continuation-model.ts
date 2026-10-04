// Shared authoring / audit / facts model for the bounded continuation tree.
// Frequencies are conditional on this exact history, never a HU substitute.
import { hands } from "../data.ts";
import { callFacts } from "./call-ev.ts";
import { raked } from "./rake.ts";

export const CONTINUATION_VERSION = 3;
export const CONTINUATION_SEED = "continuation-equity-v3|range-fingerprint|hand";
export const continuationSamples = node => node.bet_level === 5 ? 20000 : 12000;
export const continuationComboCount = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const ranks = "23456789TJQKA";
export function continuationCombos(hand) {
  const a = ranks.indexOf(hand[0]), b = ranks.indexOf(hand[1]), result = [];
  for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) {
    if (hand.length === 2 ? s < t : hand.endsWith("s") ? s === t : s !== t) result.push([a * 4 + s, b * 4 + t]);
  }
  return result;
}

// Suit-symmetric class ranges: the first Hero combo represents every suit
// permutation. Prove that a joint deal exists before calling a sampler.
export function hasCompatibleDeal(hand, ranges) {
  const mine = continuationCombos(hand)[0];
  if (!mine || ranges.some(range => !range.length)) return false;
  const candidates = ranges.map(range => range.flatMap(([name, weight]) => weight > 0 ? continuationCombos(name) : []))
    .sort((a, b) => a.length - b.length);
  const used = new Set(mine);
  function assign(index) {
    if (index === candidates.length) return true;
    for (const [a, b] of candidates[index]) {
      if (used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b);
      if (assign(index + 1)) return true;
      used.delete(a); used.delete(b);
    }
    return false;
  }
  return assign(0);
}

export function createContinuationModel(datasets) {
  const sources = new Map();
  for (const [name, data] of Object.entries(datasets)) {
    for (const spot of data?.spots ?? []) sources.set(`${name}/${spot.id}`, spot);
  }
  const rowMaps = new Map();
  const factorCache = new Map();
  const register = spot => {
    sources.set(`continuation-responses/${spot.id}`, spot);
    rowMaps.delete(`continuation-responses/${spot.id}`);
    factorCache.clear();
  };
  const source = factor => {
    const key = `${factor.dataset}/${factor.spot_id}`;
    const spot = sources.get(key);
    if (!spot) throw new Error(`Missing continuation source ${key}`);
    if (!rowMaps.has(key)) {
      if (!Array.isArray(spot.hands) || spot.hands.length !== hands.length) throw new Error(`Malformed continuation source ${key}`);
      rowMaps.set(key, new Map(spot.hands.map(row => [row.hand, row])));
      if (rowMaps.size > 256) rowMaps.delete(rowMaps.keys().next().value);
    }
    return rowMaps.get(key);
  };
  const weights = factors => {
    const key = JSON.stringify(factors);
    if (factorCache.has(key)) return factorCache.get(key);
    const rows = factors.map(factor => [factor, source(factor)]);
    const result = new Map(hands.map(hand => [hand, rows.reduce((weight, [factor, map]) => {
      const value = map.get(hand)?.[factor.action];
      if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`Invalid source action ${factor.spot_id}/${hand}/${factor.action}`);
      return weight * value / 100;
    }, 1)]));
    factorCache.set(key, result);
    if (factorCache.size > 512) factorCache.delete(factorCache.keys().next().value);
    return result;
  };
  function context(node, spot = node) {
    const bySeat = Object.fromEntries(node.participants.map(seat => [seat, weights(node.source_factors[seat])]));
    const historyPossible = node.participants.every(seat => [...bySeat[seat].values()].some(weight => weight > 0));
    const opponents = node.live_participants.filter(seat => seat !== node.hero);
    const ranges = opponents.map(seat => [...bySeat[seat]].filter(([, weight]) => weight > 0));
    const deadOpponents = node.participants.filter(seat => node.folded.includes(seat));
    const deadRanges = deadOpponents.map(seat => [...bySeat[seat]].filter(([, weight]) => weight > 0));
    const cost = node.facing_size_bb - node.contributions_bb[node.hero];
    const pot = Object.values(node.contributions_bb).reduce((sum, value) => sum + value, 0) + cost;
    if (!(cost > 0) || ![1, 2, 3].includes(opponents.length)) throw new Error(`Invalid continuation call geometry ${node.id}`);
    const input = { hero: node.hero, opponents, cost_to_call: cost, total_pot_after_call: pot,
      all_in: node.bet_level === 5, ranges, dead_opponents: deadOpponents, dead_ranges: deadRanges,
      pending_actors: node.pending_actors.filter(seat => seat !== node.hero),
      opponent_model: "all-live-current-reach-no-future-chips-joint-dead-cards-best-five-v3" };
    const compatible = new Map();
    const reach = hand => {
      const weight = historyPossible ? bySeat[node.hero].get(hand) ?? 0 : 0;
      if (!weight) return 0;
      if (!compatible.has(hand)) compatible.set(hand, hasCompatibleDeal(hand, [...ranges, ...deadRanges]));
      return compatible.get(hand) ? weight : 0;
    };
    const unreachable = !hands.some(hand => reach(hand) > 0);
    return { type: "continuation", node, spot, input, reach, historyPossible, unreachable, weights: bySeat };
  }
  return { context, register, weights, sources };
}

export function validContinuationEquity(entry, context) {
  return entry?.version === CONTINUATION_VERSION && entry.seed === CONTINUATION_SEED &&
    entry.samples === continuationSamples(context.node) && JSON.stringify(entry.input) === JSON.stringify(context.input) &&
    hands.every(hand => context.reach(hand) > 0
      ? Number.isFinite(entry.equities?.[hand]) && entry.equities[hand] >= 0 && entry.equities[hand] <= 1
      : entry.equities?.[hand] === null);
}

export function continuationFacts(context, hand, entry) {
  if (context.reach(hand) <= 0) return { reach_pct: 0, equity_pct: null, eqr: null, realized_equity_pct: null, call_ev_bb: null };
  const equity = entry.equities[hand];
  return { reach_pct: context.reach(hand) * 100, equity_pct: equity * 100, ...callFacts(context, hand, equity) };
}

export function continuationMix(spot, context) {
  const total = spot.hands.reduce((sum, row) => sum + continuationComboCount(row.hand) * context.reach(row.hand), 0);
  const frequencies = Object.fromEntries(["fold", "call", "four_bet", "all_in"].map(action => [action, total
    ? Math.max(0, Math.min(100, spot.hands.reduce((sum, row) => sum + continuationComboCount(row.hand) * context.reach(row.hand) * row[action], 0) / total)) : null]));
  return { reachable_combos: total, ...frequencies };
}

export function continuationBreakEven(context) {
  return context.input.cost_to_call / raked(context.input.total_pot_after_call) * 100;
}
