// Evidence for one private combo on the saved AI-estimated turn/river policy.
// This is a range-weighted estimate, not a solver or GTO result.
import { evaluate } from "../lib/equity.mjs";
import { boards, seatRange } from "./inputs.mjs";
import { handTier, parseCards, runoutTexture } from "./model.mjs";
import { scaleByPath, validatePolicy } from "./policy.mjs";
import { LATER_NODES, laterNodeRole } from "./later-tree.mjs";
import { laterPolicyMix, validateLaterPolicy } from "./later-policy.mjs";
import { flopState } from "./tree.mjs";
import { laterDecision, laterStart, replayLater } from "../../src/estimated/postflop-trial.ts";

const RANKS = "23456789TJQKA";
const MAX_TURN_COMBOS = 300;
const cardText = card => RANKS[card >> 2] + "cdhs"[card & 3];
const cardKey = cards => [...cards].sort((a, b) => a - b).join(",");
const otherRole = role => role === "ip" ? "oop" : "ip";
const lineFor = (previousAggressor, role) => previousAggressor === null
  ? "checked" : previousAggressor === role ? "aggressor" : "defender";

function representativeFlop(value) {
  const cards = parseCards(value, 3);
  const board = boards().find(item => cardKey(item.cards) === cardKey(cards));
  if (!board) throw new Error("対象の代表フロップがありません。");
  return board;
}

function parsePath(value, label) {
  if (value == null || value === "") return [];
  if (typeof value !== "string") throw new Error(`${label}アクションの形式が正しくありません。`);
  return value.split(",");
}

function singleCard(value, label, used, required = false) {
  if (!value) {
    if (required) throw new Error(`${label}カードを選択してください。`);
    return null;
  }
  const card = parseCards(value, 1)[0];
  if (used.has(card)) throw new Error("盤面カードが重複しています。");
  used.add(card);
  return card;
}

export function laterExplainContext({ flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "" }, inputs) {
  const flopBoard = representativeFlop(flop);
  const flopPath = parsePath(flopActions, "フロップ");
  const turnPath = parsePath(turnActions, "ターン");
  const riverPath = parsePath(riverActions, "リバー");
  const used = new Set(flopBoard.cards);
  const turnCard = singleCard(turn, "ターン", used, true);
  const turnBoard = [...flopBoard.cards, turnCard];
  const start = laterStart(flopPath, inputs.spot);
  if (!start) throw new Error("フロップのアクションが後続ストリートへ進める状態ではありません。");

  const turnReplay = replayLater("turn", turnPath, start, inputs.spot);
  let street = "turn", board = turnBoard, history = turnPath;
  let nodeDecision = laterDecision("turn", turnPath, start, inputs.spot);
  let previousAggressor = start.lastAggressor;
  let riverBoard = null, riverStart = null, riverReplay = null;
  if (!nodeDecision.node) {
    if (["fold", "raise-fold"].includes(turnReplay.end?.type) || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
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
    riverPath, riverBoard, riverStart, riverReplay, street, board, history, previousAggressor, decision: nodeDecision };
}

function scaleLaterPath(items, role, steps, policy, board, previousAggressor) {
  const line = lineFor(previousAggressor, role);
  return steps.filter(step => step.role === role).reduce((range, step) => range.map(item => ({
    ...item, weight: item.weight * laterPolicyMix(policy, step.node, item.combo, board, line)[step.action] / 100,
  })), items);
}

// Exported for range-reach tests and other local analysis. Each opponent combo is weighted
// by that seat's saved preflop, flop, turn, and (when present) river actions only.
export function laterOpponentRange({ context, inputs, hero, flopPolicy, laterPolicy }) {
  const { spot } = inputs;
  const role = otherRole(context.decision.role);
  const seat = spot[role];
  const board = context.board;
  let items = seatRange(inputs, seat, board).filter(item => !item.combo.some(card => hero.includes(card)));
  items = scaleByPath(items, role, context.flopSteps, flopPolicy, context.flopBoard.cards);
  items = scaleLaterPath(items, role, context.turnReplay.state.steps, laterPolicy, context.turnBoard, context.start.lastAggressor);
  if (context.street === "river") {
    items = scaleLaterPath(items, role, context.riverReplay.state.steps, laterPolicy, context.riverBoard, context.riverStart.lastAggressor);
  }
  return items.filter(item => item.weight > 0);
}

function handClass([a, b]) {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return RANKS[high >> 2].repeat(2);
  return RANKS[high >> 2] + RANKS[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
}

function equityFor(hero, villain, board) {
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

function summarize(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const byClass = new Map();
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

function group(key, items, all) {
  const { weight, hands } = summarize(items);
  return { key, share: all ? weight / all : 0, hands };
}

function detailsFor(hero, villains, board, policy, decision, spot, potBb, stacks) {
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
  const actions = {};
  const responseDetail = (responseNode, lineRole, action) => {
    const response = evaluated.map(item => {
      const mix = laterPolicyMix(policy, responseNode, item.combo, board, lineFor(decision.previousAggressor, lineRole));
      return { item, fold: mix.fold / 100, cont: 1 - mix.fold / 100 };
    });
    const weighted = (list, key) => list.map(({ item, ...rest }) => ({ ...item, weight: item.weight * rest[key] })).filter(item => item.weight > 0);
    const folds = response.reduce((sum, entry) => sum + entry.item.weight * entry.fold, 0);
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
  } else {
    const facing = /_vs_(33|75|125|allin)$/.exec(node);
    if (!facing && !node.endsWith("_vs_raise")) throw new Error(`Unsupported later decision: ${node}`);
    const role = decision.role;
    const other = otherRole(role);
    const ownCommitted = spot.stackBb - stacks[role];
    const otherCommitted = spot.stackBb - stacks[other];
    const toCall = Math.max(0, otherCommitted - ownCommitted);
    const required = toCall / (potBb + toCall);
    const caught = { groups: [group("ahead", ahead, total), group("behind", behind, total)], required };
    actions.call = caught;
    actions.fold = caught;
    if (LATER_NODES[node].includes("raise")) {
      const bettorRole = other;
      responseDetail(`${decision.street}_${bettorRole}_vs_raise`, bettorRole, "raise");
    }
  }
  return { actions, equity, combos: evaluated.length, truncated };
}

export function explainLaterCombo({ flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "", cards,
  inputs, flopPolicy, laterPolicy }) {
  const boardContext = laterExplainContext({ flop, flopActions, turn, turnActions, river, riverActions }, inputs);
  const flopRules = validatePolicy(flopPolicy, inputs.spot.tree);
  const laterRules = validateLaterPolicy(laterPolicy);
  const hero = parseCards(cards, 2);
  if (hero.some(card => boardContext.board.includes(card))) throw new Error("ボードと重なるカードです。");
  const villains = laterOpponentRange({ context: boardContext, inputs, hero, flopPolicy: flopRules, laterPolicy: laterRules });
  const result = detailsFor(hero, villains, boardContext.board, laterRules, {
    ...boardContext.decision, street: boardContext.street, previousAggressor: boardContext.previousAggressor,
  }, inputs.spot, boardContext.decision.potBb, boardContext.street === "turn" ? boardContext.turnReplay.stacks : boardContext.riverReplay.stacks);
  return { kind: "ai_estimate_not_gto", node: boardContext.decision.node, street: boardContext.street,
    line: boardContext.decision.line, texture: runoutTexture(boardContext.board), equity: result.equity,
    combos: result.combos, actions: result.actions, ...(result.truncated ? { truncated: true } : {}) };
}
