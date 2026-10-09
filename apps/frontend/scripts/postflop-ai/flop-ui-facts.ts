import type { ActionMix, FlopPolicy, Inputs } from "./types.ts";
import type { WeightedCombo } from "../lib/equity.ts";
import type { RankTable } from "./defence.ts";
import type { Table } from "./engine.ts";
import type { FlopHistoryView } from "./views.ts";
export type FlopFactOptions = { boardCards: readonly number[]; node: string; cards?: string; history?: string[] | null; prev?: string; inputs: Inputs; policy: FlopPolicy;
  combos?: readonly { cards: string; weight: number }[] };
type ResponseCombo = WeightedCombo & { fold: number };
type Context = { defence: ReturnType<typeof defenceFor>; table: Table | null; villains: WeightedCombo[]; responses: Record<string, ResponseCombo[]>;
  unsupportedResponses: Record<string, string>; tables?: RankTable[]; calledRanges?: Record<string, ReturnType<typeof makeRange>> };
// Only the numeric facts consumed by postflop-explanation.ts. No obsolete evidence groups
// or independent 120-runout equity simulation: UI equity already comes from defence/betting.
// Direct and stored paths use this same projection in canonical suit coordinates.
import { canonicalFlop, cardIds, comboKey } from "./flop-isomorphism.ts";
import { comboId, defenceFor, flopRunouts, rankTable, replayOrNull } from "./defence.ts";
import { equityVersus, indexOf, makeRange, weightOf } from "./range-equity.ts";
import { seatRange } from "./browser-inputs.ts";
import { NODES, policyMix, scaleByPath } from "./policy.ts";
import { FLOP_BETS, facingNode, flopState, historyFor, nodeRole, otherRole } from "./tree.ts";
import { averageExplanationFacts } from "./explain-aggregate.ts";
import { profileReferenceFacts } from "./profile-reference.ts";

const caches = new WeakMap<Inputs, WeakMap<FlopPolicy, Map<string, Context>>>();
const rounded = <T>(value: T): T => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 as T : value;
function roundFacts<T>(value: T): T {
  if (Array.isArray(value)) return value.map(roundFacts) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundFacts(item)])) as T;
  return rounded(value);
}
// The defence's individual facts already use four decimals. The UI projection uses
// that same precision for fold shares and weighted averages, not misleading f64 tails.
// Mixes/reach weights in the strategy tables are never rounded by this projection.
export const averageFlopUiFacts = <T extends object>(entries: readonly { facts: T | null | undefined; weight: number }[]) => roundFacts(averageExplanationFacts(entries));
const pick = <T extends object, K extends string>(value: T, keys: readonly K[]): { [P in K]: P extends keyof T ? T[P] : undefined } => Object.fromEntries(keys.filter(key => key in value).map(key => [key, (value as Record<string, unknown>)[key]])) as { [P in K]: P extends keyof T ? T[P] : undefined };
function contextFor(inputs: Inputs, policy: FlopPolicy, board: readonly number[], node: string, history: string[]): Context {
  let byPolicy = caches.get(inputs);
  if (!byPolicy) caches.set(inputs, byPolicy = new WeakMap());
  let cache = byPolicy.get(policy);
  if (!cache) byPolicy.set(policy, cache = new Map());
  const key = `${board}|${history}`;
  if (cache.has(key)) return cache.get(key)!;
  if (cache.size >= 120) cache.delete(cache.keys().next().value!);
  const defence = defenceFor(inputs, policy, null);
  const requireSavedPolicy = Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard");
  const table = replayOrNull(inputs, board, { flop: history });
  const role = nodeRole(node), opponent = inputs.spot[otherRole(role)];
  const villains = table ? defence.rangeItems(table, board, opponent)
    : scaleByPath(seatRange(inputs, opponent, board), otherRole(role), flopState(inputs.spot.tree, history).steps, policy, board, { requireSavedPolicy });
  const responses: Record<string, ResponseCombo[]> = {}, unsupportedResponses: Record<string, string> = {};
  const response = (action: string, responseNode: string) => {
    const after = replayOrNull(inputs, board, { flop: [...history, action] });
    try {
      responses[action] = villains.map(item => {
        const base = policyMix(policy, responseNode, item.combo, board, { requireSavedPolicy });
        return { ...item, fold: (after ? defence.mix(after, board, responseNode, item.combo, base) : base).fold / 100 };
      });
    } catch (error) {
      if (requireSavedPolicy && (error as { code?: string })?.code === "PROFILE_POLICY_MISSING") {
        unsupportedResponses[action] = responseNode;
        return;
      }
      throw error;
    }
  };
  if (node.endsWith("_first")) for (const bet of FLOP_BETS) response(bet, facingNode(role, bet));
  else if (NODES[node].includes("raise")) {
    // Whoever answers the raise: the node after history + raise (a re-raise chain has several).
    const answer = flopState(inputs.spot.tree, [...history, "raise"]).node;
    if (answer) response("raise", answer);
  }
  const value = { defence, table, villains, responses, unsupportedResponses };
  cache.set(key, value);
  return value;
}

export function flopUiComboFactsCanonical({ boardCards, node, cards, history, prev = "bet33", inputs, policy }: FlopFactOptions) {
  history ??= historyFor(inputs.spot.tree, node, prev);
  if (flopState(inputs.spot.tree, history).node !== node) throw new Error("Flop explanation history does not reach the node");
  const hero = cardIds(cards, 2);
  if (hero.some(card => boardCards.includes(card))) throw new Error("ボードと重なるカードです。");
  const { defence, table, villains, responses, unsupportedResponses } = contextFor(inputs, policy, boardCards, node, history);
  const compatible = (combo: readonly number[]) => !combo.includes(hero[0]) && !combo.includes(hero[1]);
  const actions: Record<string, { foldShare: number }> = {};
  for (const [action, range] of Object.entries(responses)) {
    let total = 0, folded = 0;
    for (const item of range) if (compatible(item.combo)) { total += item.weight; folded += item.weight * item.fold; }
    actions[action] = { foldShare: rounded(total ? folded / total : 0) };
  }
  const base = policyMix(policy, node, hero, boardCards, { requireSavedPolicy: Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard") });
  const facing = table ? defence.facts(table, boardCards, node, hero, base) : null;
  const betting = table ? defence.bettingFacts(table, boardCards, node, hero) : null;
  const profileReference = profileReferenceFacts(inputs, policy, null, table, boardCards, node, hero, base);
  return { kind: "ai_estimate_not_gto", cards: comboKey(cards), node,
    ...(profileReference ? { profile_reference: profileReference } : {}),
    ...(Object.keys(unsupportedResponses).length ? { unsupported_actions: unsupportedResponses } : {}),
    equity: facing?.equity ?? betting?.equity_vs_defender ?? 0,
    actions,
    ...(facing ? { defence: {
      ...pick(facing, ["node", "street", "role", "pot_before_bb", "bet_bb", "call_bb", "rake_bb", "required_equity",
        "equity", "realization", "realized_equity", "percentile", "defence_frequency", "mdf", "blockers"]),
      bettor_range: pick(facing.bettor_range, ["value_pct", "bluff_pct"]),
      faced_action: pick(facing.faced_action, ["action", "capped", "alpha", "bluff_share_after_pct"]),
    } } : {}), ...(betting ? { betting: { equity_vs_defender: betting.equity_vs_defender,
      actions: betting.actions.map(action => pick(action, ["action", "alpha", "bluffs_per_100_value", "capped"])) } } : {}) };
}

// The final boards the defence evaluates equity over (same measure as defence.mjs finalTables).
function finalTables(board: readonly number[]): RankTable[] {
  if (board.length === 5) return [rankTable(board)];
  if (board.length === 4) return Array.from({ length: 52 }, (_, card) => card).filter(card => !board.includes(card)).map(card => rankTable([...board, card]));
  const entry = flopRunouts(board);
  return entry.tables ??= entry.runouts.map(([turn, river]) => rankTable([...board, turn, river]));
}

// Per-action "your equity when called": the hero's equity against the part of the opponent's range that
// continues (1 - fold) after each aggressive action, and against the whole range for a check. Computed
// from the same contexts as the fold shares, so nothing about the stored flop base changes.
export function flopBetTableCanonical({ boardCards, node, cards, history, prev = "bet33", inputs, policy }: FlopFactOptions) {
  const betting = node.endsWith("_first") || NODES[node]?.includes("raise");
  if (!betting) return {};
  history ??= historyFor(inputs.spot.tree, node, prev);
  if (flopState(inputs.spot.tree, history).node !== node) throw new Error("Flop explanation history does not reach the node");
  const hero = cardIds(cards, 2);
  if (hero.some(card => boardCards.includes(card))) throw new Error("ボードと重なるカードです。");
  const context = contextFor(inputs, policy, boardCards, node, history);
  const id = comboId(hero[0], hero[1]);
  const tables = context.tables ??= finalTables(boardCards);
  const ranges = context.calledRanges ??= {};
  const rangeFor = (name: string, weightOfItem: (item: WeightedCombo) => number) => ranges[name] ??= (() => {
    const dense = new Float64Array(52 * 52);
    for (const item of context.villains) dense[comboId(item.combo[0], item.combo[1])] = weightOfItem(item);
    return makeRange(dense);
  })();
  const actions: Record<string, { calledEquity: number | null }> = {};
  if (node.endsWith("_first")) actions.check = { calledEquity: equityVersus(rangeFor("all", item => item.weight), id, tables) };
  for (const [action, range] of Object.entries(context.responses)) {
    const dense = new Map(range.map(item => [comboId(item.combo[0], item.combo[1]), item.weight * (1 - item.fold)]));
    const called = rangeFor(action, item => dense.get(comboId(item.combo[0], item.combo[1])) ?? 0);
    actions[action] = { calledEquity: called.total > 0 ? equityVersus(called, id, tables) : null };
  }
  return { bet_table: roundFacts({ actions }) };
}

export function flopBetTable(options: FlopFactOptions) {
  const one = (cards: string | undefined) => {
    const canonical = canonicalFlop(options.boardCards);
    return flopBetTableCanonical({ ...options, boardCards: canonical.cards, cards: comboKey(cards, canonical.toCanonical) });
  };
  if (!options.combos) return one(options.cards);
  const entries = options.combos.map(({ cards, weight }) => ({ weight, facts: one(cards) }));
  if (!entries[0].facts.bet_table) return {};
  const { bet_table } = averageFlopUiFacts(entries);
  return { bet_table };
}

export function flopUiComboFacts(options: FlopFactOptions) {
  const canonical = canonicalFlop(options.boardCards);
  const cards = comboKey(options.cards, canonical.toCanonical);
  const facts = flopUiComboFactsCanonical({ ...options, boardCards: canonical.cards, cards });
  // Preserve the request's spelling (the exact combo selector's key), including pair order.
  return { ...facts, cards: options.cards };
}

export function flopUiFacts(options: FlopFactOptions) {
  if (!options.combos) return flopUiComboFacts(options);
  return averageFlopUiFacts(options.combos.map(({ cards, weight }) => ({ weight,
    facts: flopUiComboFacts({ ...options, cards }) })));
}

export function releaseFlopUiFacts(inputs: Inputs, policy: FlopPolicy) { caches.get(inputs)?.get(policy)?.clear(); }

// Optional lossless codec predictors, not UI facts or a second defence model.
// Stored residuals correct even floating-point/rounding boundary differences.
export function flopBlockerPredictors(inputs: Inputs, policy: FlopPolicy, board: readonly number[], history: string[], view: FlopHistoryView): Record<string, { perCard: number[]; intersection: number[] }> | null {
  const table = replayOrNull(inputs, board, { flop: history });
  if (!table) return null;
  const defence = defenceFor(inputs, policy, null), context = defence.context(table, board, view.node);
  if (!context) return null;
  const summary = defence.summarize(context), range = indexOf(context.bettorRange);
  const cards = view.rows.flatMap(row => row.combos.map(combo => cardIds(combo.cards, 2)));
  return Object.fromEntries(([["value_removed_pct", 1, summary.valueWeight], ["bluff_removed_pct", 2, summary.bluffWeight]] as [string, number, number][]).map(([name, kind, total]) => {
    const perCard = Array.from({ length: 52 }, (_, card) => {
      let sum = 0;
      for (const id of range.byCard![card]) if (summary.kind[id] === kind) sum += range.dense![id];
      return rounded(total ? sum / total * 100 : 0);
    });
    const intersection = cards.map(combo => {
      const id = comboId(...combo as [number, number]);
      return rounded(total && summary.kind[id] === kind ? weightOf(context.bettorRange, id) / total * 100 : 0);
    });
    return [name, { perCard, intersection }];
  }));
}

export type FlopUiFacts = ReturnType<typeof flopUiComboFactsCanonical>;
