import type { ContinuationDecision, SourceFactor } from "./continuation-tree.ts";
import type { FrequencyRow, PreflopAction, ContinuationHand } from "./preflop-types.ts";
import type { CallContext, CallInput, WeightedRange } from "./call-ev.ts";
export type ContinuationSourceSpot = { id: string; hands: readonly FrequencyRow[] };
export type ContinuationSources = Record<string, { spots: readonly ContinuationSourceSpot[] } | null | undefined>;
export type ContinuationContext<S = ContinuationSourceSpot> = CallContext<S> & { node: ContinuationDecision; historyPossible: boolean; unreachable: boolean; weights: Record<string, Map<string, number>> };
export type ContinuationEquity = { version: number; samples: number; seed: string; input: CallInput; equities: Record<string, number | null> };
// Shared authoring / audit / facts model for the bounded continuation tree.
// Frequencies are conditional on this exact history, never a HU substitute.
import { hands } from "../data.ts";
import { continuationById } from "./continuation-tree.ts";
import { callFacts } from "./call-ev.ts";
import { raked } from "./rake.ts";

export const CONTINUATION_VERSION = 3;
export const CONTINUATION_SEED = "continuation-equity-v3|range-fingerprint|hand";
export const continuationSamples = (node: Pick<ContinuationDecision, "bet_level">) => node.bet_level === 5 ? 20000 : 12000;
export const continuationComboCount = (hand: string) => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const ranks = "23456789TJQKA";
export function continuationCombos(hand: string): [number, number][] {
  const a = ranks.indexOf(hand[0]), b = ranks.indexOf(hand[1]), result: [number, number][] = [];
  for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) {
    if (hand.length === 2 ? s < t : hand.endsWith("s") ? s === t : s !== t) result.push([a * 4 + s, b * 4 + t]);
  }
  return result;
}

// Suit-symmetric class ranges: the first Hero combo represents every suit
// permutation. Prove that a joint deal exists before calling a sampler.
export function hasCompatibleDeal(hand: string, ranges: readonly WeightedRange[]) {
  const mine = continuationCombos(hand)[0];
  if (!mine || ranges.some(range => !range.length)) return false;
  const candidates = ranges.map(range => range.flatMap(([name, weight]) => weight > 0 ? continuationCombos(name) : []))
    .sort((a, b) => a.length - b.length);
  const used = new Set(mine);
  function assign(index: number): boolean {
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

export class MissingContinuationSourceError extends Error {
  declare sourceKey: string;
  constructor(sourceKey: string, reachable = false) {
    super(`Missing ${reachable ? "reachable " : ""}continuation source ${sourceKey}`);
    this.name = "MissingContinuationSourceError";
    this.sourceKey = sourceKey;
  }
}

// Only a proved impossible history may receive an in-memory placeholder. A
// missing reachable strategy remains an error, including missing ancestors.
const impossibleHands = Object.freeze(hands.map(hand => Object.freeze({ hand, fold: 100, call: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })));
export function createContinuationModel(datasets: ContinuationSources) {
  const sources = new Map<string, ContinuationSourceSpot>();
  for (const [name, data] of Object.entries(datasets)) {
    for (const spot of data?.spots ?? []) sources.set(`${name}/${spot.id}`, spot);
  }
  const rowMaps = new Map<string, Map<string, FrequencyRow>>();
  const factorCache = new Map<string, Map<string, number>>();
  const register = (spot: ContinuationSourceSpot) => {
    sources.set(`continuation-responses/${spot.id}`, spot);
    rowMaps.delete(`continuation-responses/${spot.id}`);
    factorCache.clear();
  };
  const resolving = new Set();
  const resolveSpot = (node: ContinuationDecision): ContinuationSourceSpot => {
    const key = `continuation-responses/${node.id}`;
    if (sources.has(key)) return sources.get(key)!;
    if (resolving.has(key)) throw new Error(`Cyclic continuation source ${key}`);
    resolving.add(key);
    try {
      if (!context(node).unreachable) throw new MissingContinuationSourceError(key, true);
      const spot = { ...node, unreachable: true, hands: impossibleHands };
      sources.set(key, spot);
      return spot;
    } finally { resolving.delete(key); }
  };
  const source = (factor: SourceFactor): Map<string, FrequencyRow> => {
    const key = `${factor.dataset}/${factor.spot_id}`;
    const node = factor.dataset === "continuation-responses" ? continuationById.get(factor.spot_id) : null;
    const spot = sources.get(key) ?? (node && !node.reused ? resolveSpot(node) : null);
    if (!spot) throw new MissingContinuationSourceError(key);
    if (!rowMaps.has(key)) {
      if (!Array.isArray(spot.hands) || spot.hands.length !== hands.length) throw new Error(`Malformed continuation source ${key}`);
      rowMaps.set(key, new Map(spot.hands.map(row => [row.hand, row])));
      if (rowMaps.size > 256) rowMaps.delete(rowMaps.keys().next().value!);
    }
    return rowMaps.get(key)!;
  };
  const weights = (factors: readonly SourceFactor[]): Map<string, number> => {
    const key = JSON.stringify(factors);
    if (factorCache.has(key)) return factorCache.get(key)!;
    const rows = factors.map((factor): [SourceFactor, Map<string, FrequencyRow>] => [factor, source(factor)]);
    const result = new Map(hands.map(hand => [hand, rows.reduce((weight, [factor, map]) => {
      const value = map.get(hand)?.[factor.action as PreflopAction];
      if (!Number.isInteger(value) || value! < 0 || value! > 100) throw new Error(`Invalid source action ${factor.spot_id}/${hand}/${factor.action}`);
      return weight * value! / 100;
    }, 1)]));
    factorCache.set(key, result);
    if (factorCache.size > 512) factorCache.delete(factorCache.keys().next().value!);
    return result;
  };
  function context<S extends ContinuationSourceSpot | ContinuationDecision = ContinuationDecision>(node: ContinuationDecision, spot: S = node as S): ContinuationContext<S> {
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
    const compatible = new Map<string, boolean>();
    const reach = (hand: string) => {
      const weight = historyPossible ? bySeat[node.hero].get(hand) ?? 0 : 0;
      if (!weight) return 0;
      if (!compatible.has(hand)) compatible.set(hand, hasCompatibleDeal(hand, [...ranges, ...deadRanges]));
      return compatible.get(hand) ? weight : 0;
    };
    const unreachable = !hands.some(hand => reach(hand) > 0);
    return { type: "continuation", node, spot, input, reach, historyPossible, unreachable, weights: bySeat };
  }
  return { context, register, weights, sources, resolveSpot };
}

export function validContinuationEquity(entry: ContinuationEquity | null | undefined, context: Pick<ContinuationContext, "node" | "input" | "reach">): entry is ContinuationEquity {
  return entry?.version === CONTINUATION_VERSION && entry.seed === CONTINUATION_SEED &&
    entry.samples === continuationSamples(context.node) && JSON.stringify(entry.input) === JSON.stringify(context.input) &&
    hands.every(hand => context.reach(hand) > 0
      ? Number.isFinite(entry.equities?.[hand]) && entry.equities[hand]! >= 0 && entry.equities[hand]! <= 1
      : entry.equities?.[hand] === null);
}

export function continuationFacts(context: ContinuationContext, hand: string, entry: ContinuationEquity) {
  if (context.reach(hand) <= 0) return { reach_pct: 0, equity_pct: null, eqr: null, realized_equity_pct: null, call_ev_bb: null };
  const equity = entry.equities[hand]!;
  return { reach_pct: context.reach(hand) * 100, equity_pct: equity * 100, ...callFacts(context, hand, equity) };
}

export function continuationMix(spot: ContinuationSourceSpot, context: Pick<ContinuationContext, "reach">) {
  const total = spot.hands.reduce((sum, row) => sum + continuationComboCount(row.hand) * context.reach(row.hand), 0);
  const frequencies = Object.fromEntries(["fold", "call", "four_bet", "all_in"].map(action => [action, total
    ? Math.max(0, Math.min(100, spot.hands.reduce((sum, row) => sum + continuationComboCount(row.hand) * context.reach(row.hand) * row[action as PreflopAction]!, 0) / total)) : null]));
  return { reachable_combos: total, ...frequencies as Record<"fold" | "call" | "four_bet" | "all_in", number | null> };
}

export function continuationBreakEven(context: Pick<ContinuationContext, "input">) {
  return context.input.cost_to_call / raked(context.input.total_pot_after_call) * 100;
}
