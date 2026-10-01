// Only the numeric facts consumed by postflop-explanation.ts. No obsolete evidence groups
// or independent 120-runout equity simulation: UI equity already comes from defence/betting.
// Direct and stored paths use this same projection in canonical suit coordinates.
import { canonicalFlop, cardIds, comboKey } from "./flop-isomorphism.mjs";
import { comboId, defenceFor, flopRunouts, rankTable, replayOrNull } from "./defence.mjs";
import { equityVersus, indexOf, makeRange, weightOf } from "./range-equity.mjs";
import { seatRange } from "./browser-inputs.mjs";
import { NODES, policyMix, scaleByPath } from "./policy.mjs";
import { FLOP_BETS, facingNode, flopState, historyFor, nodeRole, otherRole, raiseNodeAfter } from "./tree.mjs";
import { averageExplanationFacts } from "./explain-aggregate.mjs";

const caches = new WeakMap();
const rounded = value => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : value;
function roundFacts(value) {
  if (Array.isArray(value)) return value.map(roundFacts);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundFacts(item)]));
  return rounded(value);
}
// The defence's individual facts already use four decimals. The UI projection uses
// that same precision for fold shares and weighted averages, not misleading f64 tails.
// Mixes/reach weights in the strategy tables are never rounded by this projection.
export const averageFlopUiFacts = entries => roundFacts(averageExplanationFacts(entries));
const pick = (value, keys) => Object.fromEntries(keys.filter(key => key in value).map(key => [key, value[key]]));
function contextFor(inputs, policy, board, node, history) {
  let byPolicy = caches.get(inputs);
  if (!byPolicy) caches.set(inputs, byPolicy = new WeakMap());
  let cache = byPolicy.get(policy);
  if (!cache) byPolicy.set(policy, cache = new Map());
  const key = `${board}|${history}`;
  if (cache.has(key)) return cache.get(key);
  if (cache.size >= 120) cache.delete(cache.keys().next().value);
  const defence = defenceFor(inputs, policy, null);
  const table = replayOrNull(inputs, board, { flop: history });
  const role = nodeRole(node), opponent = inputs.spot[otherRole(role)];
  const villains = table ? defence.rangeItems(table, board, opponent)
    : scaleByPath(seatRange(inputs, opponent, board), otherRole(role), flopState(inputs.spot.tree, history).steps, policy, board);
  const responses = {};
  const response = (action, responseNode) => {
    const after = replayOrNull(inputs, board, { flop: [...history, action] });
    responses[action] = villains.map(item => {
      const base = policyMix(policy, responseNode, item.combo, board);
      return { ...item, fold: (after ? defence.mix(after, board, responseNode, item.combo, base) : base).fold / 100 };
    });
  };
  if (node.endsWith("_first")) for (const bet of FLOP_BETS) response(bet, facingNode(role, bet));
  else if (NODES[node].includes("raise")) response("raise", raiseNodeAfter(otherRole(role)));
  const value = { defence, table, villains, responses };
  cache.set(key, value);
  return value;
}

export function flopUiComboFactsCanonical({ boardCards, node, cards, history, prev = "bet33", inputs, policy }) {
  history ??= historyFor(inputs.spot.tree, node, prev);
  if (flopState(inputs.spot.tree, history).node !== node) throw new Error("Flop explanation history does not reach the node");
  const hero = cardIds(cards, 2);
  if (hero.some(card => boardCards.includes(card))) throw new Error("ボードと重なるカードです。");
  const { defence, table, villains, responses } = contextFor(inputs, policy, boardCards, node, history);
  const compatible = combo => !combo.includes(hero[0]) && !combo.includes(hero[1]);
  const actions = {};
  for (const [action, range] of Object.entries(responses)) {
    let total = 0, folded = 0;
    for (const item of range) if (compatible(item.combo)) { total += item.weight; folded += item.weight * item.fold; }
    actions[action] = { foldShare: rounded(total ? folded / total : 0) };
  }
  const facing = table ? defence.facts(table, boardCards, node, hero, policyMix(policy, node, hero, boardCards)) : null;
  const betting = table ? defence.bettingFacts(table, boardCards, node, hero) : null;
  return { kind: "ai_estimate_not_gto", cards: comboKey(cards), node,
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
function finalTables(board) {
  if (board.length === 5) return [rankTable(board)];
  if (board.length === 4) return Array.from({ length: 52 }, (_, card) => card).filter(card => !board.includes(card)).map(card => rankTable([...board, card]));
  const entry = flopRunouts(board);
  return entry.tables ??= entry.runouts.map(([turn, river]) => rankTable([...board, turn, river]));
}

// Per-action "your equity when called": the hero's equity against the part of the opponent's range that
// continues (1 - fold) after each aggressive action, and against the whole range for a check. Computed
// from the same contexts as the fold shares, so nothing about the stored flop base changes.
export function flopBetTableCanonical({ boardCards, node, cards, history, prev = "bet33", inputs, policy }) {
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
  const rangeFor = (name, weightOfItem) => ranges[name] ??= (() => {
    const dense = new Float64Array(52 * 52);
    for (const item of context.villains) dense[comboId(item.combo[0], item.combo[1])] = weightOfItem(item);
    return makeRange(dense);
  })();
  const actions = {};
  if (node.endsWith("_first")) actions.check = { calledEquity: equityVersus(rangeFor("all", item => item.weight), id, tables) };
  for (const [action, range] of Object.entries(context.responses)) {
    const dense = new Map(range.map(item => [comboId(item.combo[0], item.combo[1]), item.weight * (1 - item.fold)]));
    const called = rangeFor(action, item => dense.get(comboId(item.combo[0], item.combo[1])) ?? 0);
    actions[action] = { calledEquity: called.total > 0 ? equityVersus(called, id, tables) : null };
  }
  return { bet_table: roundFacts({ actions }) };
}

export function flopBetTable(options) {
  const one = cards => {
    const canonical = canonicalFlop(options.boardCards);
    return flopBetTableCanonical({ ...options, boardCards: canonical.cards, cards: comboKey(cards, canonical.toCanonical) });
  };
  if (!options.combos) return one(options.cards);
  const entries = options.combos.map(({ cards, weight }) => ({ weight, facts: one(cards) }));
  if (!entries[0].facts.bet_table) return {};
  const { bet_table } = averageFlopUiFacts(entries);
  return { bet_table };
}

export function flopUiComboFacts(options) {
  const canonical = canonicalFlop(options.boardCards);
  const cards = comboKey(options.cards, canonical.toCanonical);
  const facts = flopUiComboFactsCanonical({ ...options, boardCards: canonical.cards, cards });
  // Preserve the request's spelling (the exact combo selector's key), including pair order.
  return { ...facts, cards: options.cards };
}

export function flopUiFacts(options) {
  if (!options.combos) return flopUiComboFacts(options);
  return averageFlopUiFacts(options.combos.map(({ cards, weight }) => ({ weight,
    facts: flopUiComboFacts({ ...options, cards }) })));
}

export function releaseFlopUiFacts(inputs, policy) { caches.get(inputs)?.get(policy)?.clear(); }

// Optional lossless codec predictors, not UI facts or a second defence model.
// Stored residuals correct even floating-point/rounding boundary differences.
export function flopBlockerPredictors(inputs, policy, board, history, view) {
  const table = replayOrNull(inputs, board, { flop: history });
  if (!table) return null;
  const defence = defenceFor(inputs, policy, null), context = defence.context(table, board, view.node);
  if (!context) return null;
  const summary = defence.summarize(context), range = indexOf(context.bettorRange);
  const cards = view.rows.flatMap(row => row.combos.map(combo => cardIds(combo.cards, 2)));
  return Object.fromEntries([["value_removed_pct", 1, summary.valueWeight], ["bluff_removed_pct", 2, summary.bluffWeight]].map(([name, kind, total]) => {
    const perCard = Array.from({ length: 52 }, (_, card) => {
      let sum = 0;
      for (const id of range.byCard[card]) if (summary.kind[id] === kind) sum += range.dense[id];
      return rounded(total ? sum / total * 100 : 0);
    });
    const intersection = cards.map(combo => {
      const id = comboId(...combo);
      return rounded(total && summary.kind[id] === kind ? weightOf(context.bettorRange, id) / total * 100 : 0);
    });
    return [name, { perCard, intersection }];
  }));
}
