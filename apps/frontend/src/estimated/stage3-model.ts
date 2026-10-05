import type { Stage3Action, Stage3Sources, Stage3SourceSpot, Stage3Decision, Stage3Root, Stage3RootEvidence, Stage3Context, Stage3Equity } from "./stage3-types.ts";
import type { WeightedRange } from "./call-ev.ts";
import type { FrequencyRow, PreflopAction } from "./preflop-types.ts";
import type { SourceFactor } from "./continuation-tree.ts";
// Shared authoring / audit / facts model for the bounded stage3 tree.
// Frequencies are conditional on this exact history, never a HU substitute.
import { hands } from "../data.ts";
import { stage3ById, stage3RootById, STAGE3_RARE_THRESHOLD } from "./stage3-tree.ts";
import { callFacts } from "./stage3-call-ev.ts";
import { raked } from "./rake.ts";

export const STAGE3_VERSION = 1;
export const STAGE3_SEED = "stage3-equity-v1|range-fingerprint|hand";
export const stage3Samples = (node: Pick<Stage3Decision, "bet_level">) => node.bet_level === 5 ? 20000 : 12000;
export const stage3ComboCount = (hand: string) => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const ranks = "23456789TJQKA";
export function stage3Combos(hand: string): [number, number][] {
  const a = ranks.indexOf(hand[0]), b = ranks.indexOf(hand[1]), result: [number, number][] = [];
  for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) {
    if (hand.length === 2 ? s < t : hand.endsWith("s") ? s === t : s !== t) result.push([a * 4 + s, b * 4 + t]);
  }
  return result;
}

// Suit-symmetric class ranges: the first Hero combo represents every suit
// permutation. Prove that a joint deal exists before calling a sampler.
export function hasCompatibleDeal(hand: string, ranges: readonly WeightedRange[]) {
  const mine = stage3Combos(hand)[0];
  if (!mine || ranges.some(range => !range.length)) return false;
  const candidates = ranges.map(range => range.flatMap(([name, weight]) => weight > 0 ? stage3Combos(name) : []))
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

export class MissingStage3SourceError extends Error {
  declare sourceKey: string;
  constructor(sourceKey: string, reachable = false) {
    super(`Missing ${reachable ? "reachable " : ""}stage3 source ${sourceKey}`);
    this.name = "MissingStage3SourceError";
    this.sourceKey = sourceKey;
  }
}

// Only a proved impossible history may receive an in-memory placeholder. A
// missing reachable strategy remains an error, including missing ancestors.
const impossibleHands = Object.freeze(hands.map(hand => Object.freeze({ hand, fold: 100, call: 0, squeeze: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })));
export function createStage3Model(datasets: Stage3Sources) {
  const sources = new Map<string, Stage3SourceSpot>();
  for (const [name, data] of Object.entries(datasets)) {
    for (const spot of data?.spots ?? []) sources.set(`${name}/${spot.id}`, spot);
  }
  const rowMaps = new Map<string, Map<string, FrequencyRow>>();
  const factorCache = new Map<string, Map<string, number>>();
  const register = (spot: Stage3SourceSpot) => {
    sources.set(`stage3-responses/${spot.id}`, spot);
    rowMaps.delete(`stage3-responses/${spot.id}`);
    factorCache.clear();
  };
  const rootEvidenceCache = new Map<string, Stage3RootEvidence>();
  const rootEvidence = (root: Stage3Root): Stage3RootEvidence => {
    if (rootEvidenceCache.has(root.id)) return rootEvidenceCache.get(root.id)!;
    const factors = Object.fromEntries(root.participants.map(seat => [seat, root.history.filter(a => a.seat === seat && a.source).map(a => a.source!)]));
    const known: Stage3RootEvidence["known"] = [], unresolved: Stage3RootEvidence["unresolved"] = [];
    for (const [seat, refs] of Object.entries(factors)) {
      if (!refs.length) continue;
      if (refs.some(ref => ref.dataset === "stage3-responses" && !sources.has(`${ref.dataset}/${ref.spot_id}`))) { unresolved.push({ seat, factors: refs }); continue; }
      const range = weights(refs), mass = [...range].reduce((sum, [hand, weight]) => sum + stage3ComboCount(hand) * weight, 0) / 1326;
      known.push({ seat, factors: refs, independent_support: mass });
    }
    const independent = known.reduce((product, item) => product * item.independent_support, 1);
    const disjoint = known.reduce((product, _, i) => product * ((52 - 2 * i) * (51 - 2 * i)) / (52 * 51), 1);
    const upper = Math.min(1, independent / disjoint);
    const evidence = { root_id: root.id, observed_participants: known.length, known, unresolved,
      independent_product: unresolved.length ? null : independent, independent_product_upper_bound: independent,
      random_tuple_disjoint_probability: disjoint, exact_joint_reach: null, joint_reach_upper_bound: upper,
      threshold_probability: STAGE3_RARE_THRESHOLD, rare: root.rare_eligible && upper < STAGE3_RARE_THRESHOLD,
      probability_units: "ratio; multiply by100 for percent", method: unresolved.length ? "known-prefix upper bound; unknown additional action bounded by1" : "complete own-action support product; legal-tuple joint probability bounded by product / random disjoint probability" };
    // An unknown factor is acceptable only when the already known prefix is
    // rigorously below the threshold. It never invents a saved call policy.
    if (unresolved.length && !evidence.rare) throw new MissingStage3SourceError(`${unresolved[0].factors[0].dataset}/${unresolved[0].factors[0].spot_id}`, true);
    rootEvidenceCache.set(root.id, evidence); return evidence;
  };
  const resolving = new Set();
  const resolveSpot = (node: Stage3Decision): Stage3SourceSpot => {
    const key = `stage3-responses/${node.id}`;
    if (rootEvidence(stage3RootById.get(node.root_id)!).rare) throw new RareStage3HistoryError(node.id);
    if (sources.has(key)) return sources.get(key)!;
    if (resolving.has(key)) throw new Error(`Cyclic stage3 source ${key}`);
    resolving.add(key);
    try {
      if (!context(node).unreachable) throw new MissingStage3SourceError(key, true);
      const spot = { ...node, unreachable: true, hands: impossibleHands };
      sources.set(key, spot);
      return spot;
    } finally { resolving.delete(key); }
  };
  const source = (factor: SourceFactor): Map<string, FrequencyRow> => {
    const key = `${factor.dataset}/${factor.spot_id}`;
    const node = factor.dataset === "stage3-responses" ? stage3ById.get(factor.spot_id) : null;
    const spot = sources.get(key) ?? (node && !node.reused ? resolveSpot(node) : null);
    if (!spot) throw new MissingStage3SourceError(key);
    if (!rowMaps.has(key)) {
      if (!Array.isArray(spot.hands) || spot.hands.length !== hands.length) throw new Error(`Malformed stage3 source ${key}`);
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
  function context<S = Stage3Decision>(node: Stage3Decision, spot: S = node as unknown as S): Stage3Context<S> {
    if (rootEvidence(stage3RootById.get(node.root_id)!).rare) throw new RareStage3HistoryError(node.id);
    const bySeat = Object.fromEntries(node.participants.map(seat => [seat, weights(node.source_factors[seat])]));
    const historyPossible = node.participants.every(seat => [...bySeat[seat].values()].some(weight => weight > 0));
    const opponents = node.live_participants.filter(seat => seat !== node.hero);
    const ranges = opponents.map(seat => [...bySeat[seat]].filter(([, weight]) => weight > 0));
    const deadOpponents = node.participants.filter(seat => node.folded.includes(seat));
    const deadRanges = deadOpponents.map(seat => [...bySeat[seat]].filter(([, weight]) => weight > 0));
    const cost = node.facing_size_bb - node.contributions_bb[node.hero];
    const pot = Object.values(node.contributions_bb).reduce((sum, value) => sum + value, 0) + cost;
    if (!(cost > 0) || ![1, 2, 3, 4, 5].includes(opponents.length)) throw new Error(`Invalid stage3 call geometry ${node.id}`);
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
    return { type: "stage3", node, spot, input, reach, historyPossible, unreachable, weights: bySeat };
  }
  return { context, register, weights, sources, resolveSpot, rootEvidence };
}

export function validStage3Equity(entry: Stage3Equity | null | undefined, context: Pick<Stage3Context<unknown>, "node" | "input" | "reach">): entry is Stage3Equity {
  return entry?.version === STAGE3_VERSION && entry.seed === STAGE3_SEED &&
    entry.samples === stage3Samples(context.node) && JSON.stringify(entry.input) === JSON.stringify(context.input) &&
    hands.every(hand => context.reach(hand) > 0
      ? Number.isFinite(entry.equities?.[hand]) && entry.equities[hand]! >= 0 && entry.equities[hand]! <= 1
      : entry.equities?.[hand] === null);
}

export function stage3Facts(context: Pick<Stage3Context<unknown>, "node" | "input" | "reach">, hand: string, entry: Stage3Equity) {
  if (context.reach(hand) <= 0) return { reach_pct: 0, equity_pct: null, eqr: null, realized_equity_pct: null, call_ev_bb: null };
  const equity = entry.equities[hand]!;
  return { reach_pct: context.reach(hand) * 100, equity_pct: equity * 100, ...callFacts(context, hand, equity) };
}

export function stage3Mix(spot: Stage3SourceSpot, context: Pick<Stage3Context<unknown>, "reach">): { reachable_combos: number } & Record<Stage3Action, number | null> {
  const total = spot.hands.reduce((sum, row) => sum + stage3ComboCount(row.hand) * context.reach(row.hand), 0);
  const frequencies = Object.fromEntries(["fold", "call", "squeeze", "four_bet", "all_in"].map(action => [action, total
    ? Math.max(0, Math.min(100, spot.hands.reduce((sum, row) => sum + stage3ComboCount(row.hand) * context.reach(row.hand) * row[action as Stage3Action]!, 0) / total)) : null]));
  return { reachable_combos: total, ...frequencies } as { reachable_combos: number } & Record<Stage3Action, number | null>;
}

export function stage3BreakEven(context: Pick<Stage3Context<unknown>, "input">) {
  return context.input.cost_to_call / raked(context.input.total_pot_after_call) * 100;
}

export class RareStage3HistoryError extends Error { declare spotId: string; constructor(id: string) { super(`Rare Stage3 history intentionally unavailable: ${id}`); this.name = "RareStage3HistoryError"; this.spotId = id; } }
