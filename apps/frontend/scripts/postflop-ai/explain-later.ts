import type { FlopPolicy, HandTier, Inputs, LaterPolicy, PreviousLine, RoleValues } from "./types.ts";
import type { PlayerRole } from "./tree.ts";
import type { LaterStreet } from "./later-tree.ts";
import type { ReachStep } from "./types.ts";
import type { WeightedCombo } from "../lib/equity.ts";
import type { Table } from "./engine.ts";
import type { Spot } from "./spots.ts";
import type { LaterStartState } from "../../src/estimated/postflop-trial.ts";
export type LaterContextOptions = { flop: unknown; flopActions?: unknown; turn: unknown; turnActions?: unknown; river?: unknown; riverActions?: unknown };
export type LaterExplainOptions = LaterContextOptions & { inputs: Inputs; flopPolicy: FlopPolicy; laterPolicy: LaterPolicy; cards?: unknown; combos?: readonly { cards: string; weight: number }[] };
export type PendingLaterDecision = Extract<ReturnType<typeof laterDecision>, { node: string }>;
export type LaterExplainContext = { flopBoard: ReturnType<typeof parseFlopBoard>; flopPath: string[]; flopSteps: ReachStep[]; start: LaterStartState;
 turnPath: string[]; turnReplay: ReturnType<typeof replayLater>; turnBoard: number[]; riverPath: string[]; riverBoard: number[] | null;
 riverStart: LaterStartState | null; riverReplay: ReturnType<typeof replayLater> | null; street: LaterStreet; board: number[];
 history: string[]; previousAggressor: PlayerRole | null; decision: PendingLaterDecision };
export type ExplanationGroup = { key: string; share: number; hands: { hand: string; tier: string }[] };
export type LaterActionFacts = { groups: ExplanationGroup[]; foldShare?: number; required?: number };
type EvaluatedCombo = WeightedCombo & { tier: HandTier; equity: number };
type DefenceModel = ReturnType<typeof defenceFor>;

// Evidence for one private combo on the saved AI-estimated turn/river policy.
// This is a range-weighted estimate, not a solver or GTO result.
import { evaluate } from "../lib/equity.ts";
import { seatRange } from "./browser-inputs.ts";
import { parseCards, parseFlopBoard, runoutTexture } from "./model.ts";
import { handTier } from "./hu-hand-tier.ts";
import { scaleByPath, validatePolicy } from "./policy.ts";
import { LATER_NODES, laterNodeRole } from "./later-tree.ts";
import { laterPolicyMix, validateLaterPolicy } from "./later-policy.ts";
import { flopState } from "./tree.ts";
import { laterDecisionState as laterDecision, laterStart, replayLater } from "./street-state.mjs";
import { defenceFor, isFacingNode, replayOrNull } from "./defence.ts";
import { averageExplanationFacts } from "./explain-aggregate.ts";
import { profileReferenceFacts } from "./profile-reference.ts";

const RANKS = "23456789TJQKA";
const MAX_TURN_COMBOS = 300;
const cardText = (card: number): string => RANKS[card >> 2] + "cdhs"[card & 3];
const otherRole = (role: PlayerRole): PlayerRole => role === "ip" ? "oop" : "ip";
const lineFor = (previousAggressor: PlayerRole | null, role: PlayerRole): PreviousLine => previousAggressor === null
  ? "checked" : previousAggressor === role ? "aggressor" : "defender";

function parsePath(value: unknown, label: string): string[] {
  if (value == null || value === "") return [];
  if (typeof value !== "string") throw new Error(`${label}アクションの形式が正しくありません。`);
  return value.split(",");
}

function singleCard(value: unknown, label: string, used: Set<number>, required: true): number;
function singleCard(value: unknown, label: string, used: Set<number>, required?: boolean): number | null;
function singleCard(value: unknown, label: string, used: Set<number>, required = false): number | null {
  if (!value) {
    if (required) throw new Error(`${label}カードを選択してください。`);
    return null;
  }
  const card = parseCards(value, 1)[0];
  if (used.has(card)) throw new Error("盤面カードが重複しています。");
  used.add(card);
  return card;
}

export function laterExplainContext({ flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "" }: LaterContextOptions, inputs: Inputs): LaterExplainContext {
  const flopBoard = parseFlopBoard(flop);
  const flopPath = parsePath(flopActions, "フロップ");
  const turnPath = parsePath(turnActions, "ターン");
  const riverPath = parsePath(riverActions, "リバー");
  const used = new Set(flopBoard.cards);
  const turnCard = singleCard(turn, "ターン", used, true);
  const turnBoard = [...flopBoard.cards, turnCard];
  const start = laterStart(flopPath, inputs.spot);
  if (!start) throw new Error("フロップのアクションが後続ストリートへ進める状態ではありません。");

  const turnReplay = replayLater("turn", turnPath, start, inputs.spot);
  let street: LaterStreet = "turn", board = turnBoard, history = turnPath;
  let nodeDecision = laterDecision("turn", turnPath, start, inputs.spot);
  let previousAggressor = start.lastAggressor;
  let riverBoard: number[] | null = null, riverStart: LaterStartState | null = null, riverReplay: ReturnType<typeof replayLater> | null = null;
  if (!nodeDecision.node) {
    if (["fold", "raise-fold"].includes(turnReplay.end?.type!) || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
      throw new Error("このアクションではショウダウンまで進んでおり、次の判断はありません。");
    }
    const riverCard = singleCard(river, "リバー", used, true);
    riverBoard = [...turnBoard, riverCard];
    riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    riverReplay = replayLater("river", riverPath, riverStart, inputs.spot);
    nodeDecision = laterDecision("river", riverPath, riverStart, inputs.spot);
    if (!nodeDecision.node) throw new Error("リバーの判断は終了しています。");
    street = "river";
    board = riverBoard;
    history = riverPath;
    previousAggressor = riverStart.lastAggressor;
  } else if (river || riverPath.length) {
    throw new Error("リバーはターンの判断が終わってから指定してください。");
  }

  const flopReplay = flopState(inputs.spot.tree, flopPath);
  if (flopReplay.end && !["check", "call", "raise-call"].includes(flopReplay.end.type)) {
    throw new Error("フロップのアクションが後続ストリートへ進める状態ではありません。");
  }
  return { flopBoard, flopPath, flopSteps: flopReplay.steps, start, turnPath, turnReplay, turnBoard,
    riverPath, riverBoard, riverStart, riverReplay, street, board, history, previousAggressor, decision: nodeDecision as PendingLaterDecision };
}

function scaleLaterPath<T extends WeightedCombo>(items: T[], role: PlayerRole, steps: readonly ReachStep[], policy: LaterPolicy, board: readonly number[], previousAggressor: PlayerRole | null,
  requireSavedPolicy = false): T[] {
  const line = lineFor(previousAggressor, role);
  return steps.filter(step => step.role === role).reduce((range, step) => range.map(item => ({
    ...item, weight: item.weight * laterPolicyMix(policy, step.node, item.combo, board, line, { requireSavedPolicy })[step.action] / 100,
  })), items);
}

// Exported for range-reach tests and other local analysis. Each opponent combo is weighted
// by that seat's saved preflop, flop, turn, and (when present) river actions only.
export function laterOpponentRange({ context, inputs, hero, flopPolicy, laterPolicy }: { context: LaterExplainContext; inputs: Inputs; hero: readonly number[]; flopPolicy: FlopPolicy; laterPolicy: LaterPolicy }): WeightedCombo[] {
  const { spot } = inputs;
  const role = otherRole(context.decision.role);
  const seat = spot[role];
  const board = context.board;
  const requireSavedPolicy = Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard");
  // Reach weights with the bluff cap from the engine table at the hero's decision.
  const table = replayOrNull(inputs, board, { flop: context.flopPath, turn: context.turnPath, river: context.street === "river" ? context.riverPath : [] });
  if (table) return defenceFor(inputs, flopPolicy, laterPolicy).rangeItems(table, board, seat).filter(item => !item.combo.some(card => hero.includes(card)));
  let items = seatRange(inputs, seat, board).filter(item => !item.combo.some(card => hero.includes(card)));
  items = scaleByPath(items, role, context.flopSteps, flopPolicy, context.flopBoard.cards, { requireSavedPolicy });
  items = scaleLaterPath(items, role, context.turnReplay.state.steps, laterPolicy, context.turnBoard, context.start.lastAggressor, requireSavedPolicy);
  if (context.street === "river") {
    items = scaleLaterPath(items, role, context.riverReplay!.state.steps, laterPolicy, context.riverBoard!, context.riverStart!.lastAggressor, requireSavedPolicy);
  }
  return items.filter(item => item.weight > 0);
}

function handClass([a, b]: readonly number[]): string {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return RANKS[high >> 2].repeat(2);
  return RANKS[high >> 2] + RANKS[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
}

function equityFor(hero: readonly number[], villain: readonly number[], board: readonly number[]): number {
  if (board.length === 5) {
    const mine = evaluate([...hero, ...board]), theirs = evaluate([...villain, ...board]);
    return mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
  }
  const used = new Set([...hero, ...villain, ...board]);
  let live = 0, won = 0;
  for (let card = 0; card < 52; card++) {
    if (used.has(card)) continue;
    const river = [...board, card];
    const mine = evaluate([...hero, ...river]), theirs = evaluate([...villain, ...river]);
    won += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
    live++;
  }
  return live ? won / live : 0.5;
}

function summarize(items: readonly EvaluatedCombo[]) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const byClass = new Map<string, { hand: string; weight: number; tiers: Partial<Record<HandTier, number>> }>();
  for (const item of items) {
    const key = handClass(item.combo);
    const entry = byClass.get(key) ?? { hand: key, weight: 0, tiers: {} };
    entry.weight += item.weight;
    entry.tiers[item.tier] = (entry.tiers[item.tier] ?? 0) + item.weight;
    byClass.set(key, entry);
  }
  const hands = [...byClass.values()].sort((a, b) => b.weight - a.weight)
    .slice(0, 8).map(entry => ({ hand: entry.hand,
      tier: Object.entries(entry.tiers).sort((a, b) => b[1] - a[1])[0][0] }));
  return { weight: total, hands };
}

function group(key: string, items: readonly EvaluatedCombo[], all: number): ExplanationGroup {
  const { weight, hands } = summarize(items);
  return { key, share: all ? weight / all : 0, hands };
}

// `defenceOf(action)` returns { defence, table } for the responder's decision after `action`
// (defence.mjs), or null when the line is not a legal continuation.
function detailsFor(hero: readonly number[], villains: WeightedCombo[], board: readonly number[], policy: LaterPolicy,
 decision: PendingLaterDecision & { previousAggressor: PlayerRole | null }, spot: Spot, potBb: number, stacks: RoleValues,
 heroDefence: { requirement: ReturnType<DefenceModel["requirement"]>; facts: ReturnType<DefenceModel["facts"]> } | null,
 defenceOf: (action: string) => { defence: DefenceModel; table: Table } | null, requireSavedPolicy = false) {
  let range = villains.filter(item => item.weight > 0);
  let truncated = false;
  // Turn equity enumerates all legal rivers per combo. Bound worker latency by retaining
  // the 300 most-weighted combos; ties are deterministic by card id.
  if (board.length === 4 && range.length > MAX_TURN_COMBOS) {
    range = [...range].sort((a, b) => b.weight - a.weight || a.combo[0] - b.combo[0] || a.combo[1] - b.combo[1]).slice(0, MAX_TURN_COMBOS);
    truncated = true;
  }
  const evaluated = range.map(item => ({ ...item, tier: handTier(item.combo, board), equity: equityFor(hero, item.combo, board) }));
  const total = evaluated.reduce((sum, item) => sum + item.weight, 0);
  const equity = total ? evaluated.reduce((sum, item) => sum + item.weight * item.equity, 0) / total : 0;
  const ahead = evaluated.filter(item => item.equity >= 0.5), behind = evaluated.filter(item => item.equity < 0.5);
  const actions: Record<string, LaterActionFacts> = {}, betTable: Record<string, { calledEquity: number | null }> = {};
  const unsupportedActions: Record<string, string> = {};
  const responseDetail = (responseNode: string, lineRole: PlayerRole, action: string) => {
    const computed = defenceOf(action);
    let response: { item: EvaluatedCombo; fold: number; cont: number }[];
    try {
      response = evaluated.map(item => {
        let mix = laterPolicyMix(policy, responseNode, item.combo, board,
          lineFor(decision.previousAggressor, lineRole), { requireSavedPolicy });
        if (computed) mix = computed.defence.mix(computed.table, board, responseNode, item.combo, mix);
        return { item, fold: mix.fold / 100, cont: 1 - mix.fold / 100 };
      });
    } catch (error) {
      if (requireSavedPolicy && (error as { code?: string })?.code === "PROFILE_POLICY_MISSING") {
        unsupportedActions[action] = responseNode;
        return;
      }
      throw error;
    }
    const weighted = (list: { item: EvaluatedCombo; fold: number; cont: number }[], key: "fold" | "cont") => list.map(({ item, ...rest }) => ({ ...item, weight: item.weight * rest[key] })).filter(item => item.weight > 0);
    const folds = response.reduce((sum, entry) => sum + entry.item.weight * entry.fold, 0);
    let calledWeight = 0, calledEquity = 0;
    for (const entry of response) { const w = entry.item.weight * entry.cont; calledWeight += w; calledEquity += w * entry.item.equity; }
    betTable[action] = { calledEquity: calledWeight > 0 ? Math.round(calledEquity / calledWeight * 1e4) / 1e4 : null };
    actions[action] = { foldShare: total ? folds / total : 0, groups: [
      group("value", weighted(response.filter(entry => entry.item.equity >= 0.5), "cont"), total),
      group("foldBetter", weighted(response.filter(entry => entry.item.equity < 0.5), "fold"), total),
      group("continueBetter", weighted(response.filter(entry => entry.item.equity < 0.5), "cont"), total),
    ] };
  };

  const node = decision.node;
  if (node.endsWith("_first")) {
    const actorRole = laterNodeRole(node);
    for (const bet of LATER_NODES[node].filter(action => action !== "check")) {
      const responderRole = otherRole(actorRole);
      const size = bet === "allin" ? "allin" : bet.slice(3);
      responseDetail(`${decision.street}_${responderRole}_vs_${size}`, responderRole, bet);
    }
    actions.check = { groups: [group("ahead", ahead, total), group("behind", behind, total)] };
    betTable.check = { calledEquity: Math.round(equity * 1e4) / 1e4 };
  } else {
    const facing = /_vs_(33|75|125|allin)$/.exec(node);
    if (!facing && !/_vs_raise\d*$/.test(node)) throw new Error(`Unsupported later decision: ${node}`);
    const role = decision.role;
    const other = otherRole(role);
    const ownCommitted = spot.stackBb - stacks[role];
    const otherCommitted = spot.stackBb - stacks[other];
    const toCall = Math.max(0, otherCommitted - ownCommitted);
    // Break-even from the computed defence (rake and stack caps included).
    const required = heroDefence?.requirement?.required ?? toCall / (potBb + toCall);
    const caught = { groups: [group("ahead", ahead, total), group("behind", behind, total)], required };
    actions.call = caught;
    actions.fold = caught;
    if (LATER_NODES[node].includes("raise")) {
      const bettorRole = other;
      // The answer to this raise: the other seat at raise depth + 1 (turn_oop_vs_raise, turn_ip_vs_raise2 ...).
      const depth = /_vs_raise(\d*)$/.exec(node), next = depth ? Number(depth[1] || 1) + 1 : 1;
      responseDetail(`${decision.street}_${bettorRole}_vs_raise${next === 1 ? "" : next}`, bettorRole, "raise");
    }
  }
  return { actions, equity, combos: evaluated.length, truncated, betTable, unsupportedActions };
}

export function explainLaterCombo({ flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "", cards,
  inputs, flopPolicy, laterPolicy }: LaterExplainOptions) {
  const boardContext = laterExplainContext({ flop, flopActions, turn, turnActions, river, riverActions }, inputs);
  const flopRules = validatePolicy(flopPolicy, inputs.spot.tree);
  const laterRules = validateLaterPolicy(laterPolicy);
  const requireSavedPolicy = Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard");
  const hero = parseCards(cards, 2);
  if (hero.some(card => boardContext.board.includes(card))) throw new Error("ボードと重なるカードです。");
  const villains = laterOpponentRange({ context: boardContext, inputs, hero, flopPolicy: flopRules, laterPolicy: laterRules });
  // Responders (and the hero's own break-even / defence facts) use the computed defence.
  const defence = defenceFor(inputs, flopRules, laterRules);
  const { board, street } = boardContext;
  const pathWith = (action: string) => ({ flop: boardContext.flopPath,
    turn: street === "turn" ? [...boardContext.turnPath, action] : boardContext.turnPath,
    river: street === "river" ? [...boardContext.riverPath, action] : [] });
  const defenceOf = (action: string) => {
    const table = replayOrNull(inputs, board, pathWith(action));
    return table ? { defence, table } : null;
  };
  const heroTable = replayOrNull(inputs, board, {
    flop: boardContext.flopPath, turn: boardContext.turnPath, river: street === "river" ? boardContext.riverPath : [],
  });
  const heroDefence = heroTable && { requirement: defence.requirement(heroTable, board, boardContext.decision.node),
    facts: defence.facts(heroTable, board, boardContext.decision.node, hero,
      laterPolicyMix(laterRules, boardContext.decision.node, hero, board, boardContext.decision.line, { requireSavedPolicy })) };
  const bettingFacts = heroTable && defence.bettingFacts(heroTable, board, boardContext.decision.node, hero);
  const result = detailsFor(hero, villains, board, laterRules, {
    ...boardContext.decision, street, previousAggressor: boardContext.previousAggressor,
  }, inputs.spot, boardContext.decision.potBb, street === "turn" ? boardContext.turnReplay.stacks : boardContext.riverReplay!.stacks,
  heroDefence, defenceOf, requireSavedPolicy);
  const profileReference = profileReferenceFacts(inputs, flopRules, laterRules, heroTable, board, boardContext.decision.node, hero,
    laterPolicyMix(laterRules, boardContext.decision.node, hero, board, boardContext.decision.line, { requireSavedPolicy }));
  return { kind: "ai_estimate_not_gto", node: boardContext.decision.node, street,
    ...(profileReference ? { profile_reference: profileReference } : {}),
    ...(Object.keys(result.unsupportedActions).length ? { unsupported_actions: result.unsupportedActions } : {}),
    line: boardContext.decision.line, texture: runoutTexture(board), equity: heroDefence?.facts?.equity ?? result.equity,
    combos: result.combos, actions: result.actions, ...(result.truncated ? { truncated: true } : {}),
    ...(heroDefence?.facts ? { defence: heroDefence.facts } : {}), ...(bettingFacts ? { betting: bettingFacts } : {}),
    ...(Object.keys(result.betTable).length ? { bet_table: { actions: result.betTable } } : {}) };
}

export function explainLaterCombos({ flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "", combos,
  inputs, flopPolicy, laterPolicy }: LaterExplainOptions) {
  if (!Array.isArray(combos) || !combos.length) throw new Error("At least one reachable combo is required.");
  const entries = combos.map(({ cards, weight }) => ({ weight,
    facts: explainLaterCombo({ flop, flopActions, turn, turnActions, river, riverActions, cards,
      inputs, flopPolicy, laterPolicy }) }));
  return averageExplanationFacts(entries);
}
