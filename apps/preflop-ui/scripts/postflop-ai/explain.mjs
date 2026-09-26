// Explains one private combo's flop options against the opponent's AI-estimated range.
// Read-only: it reuses the audited candidate policy and never changes it.
import { evaluate, seededRandom, seedFor } from "../lib/equity.mjs";
import { seatRange } from "./inputs.mjs";
import { handTier, parseCards } from "./model.mjs";
import { NODES, policyMix, scaleByPath, treeNodes } from "./policy.mjs";
import { flopState, historyFor, nodeRole, otherRole } from "./tree.mjs";

const RANKS = "23456789TJQKA";
const RUNOUTS = 120;

export function handClass([a, b]) {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return RANKS[high >> 2].repeat(2);
  return RANKS[high >> 2] + RANKS[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
}

function runouts(flop, dead, seed) {
  const blocked = new Set([...flop, ...dead]);
  const live = Array.from({ length: 52 }, (_, card) => card).filter(card => !blocked.has(card));
  const random = seededRandom(seed);
  return Array.from({ length: RUNOUTS }, () => {
    const turn = live[Math.floor(random() * live.length)];
    let river;
    do river = live[Math.floor(random() * live.length)]; while (river === turn);
    return [turn, river];
  });
}

function equityAgainst(hero, villain, flop, boards) {
  let won = 0, played = 0;
  for (const [turn, river] of boards) {
    if (villain.includes(turn) || villain.includes(river)) continue;
    const board = [...flop, turn, river];
    const mine = evaluate([...hero, ...board]), theirs = evaluate([...villain, ...board]);
    won += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
    played++;
  }
  return played ? won / played : 0.5;
}

// Which opponent combos reach this node, with how much weight: the opponent's saved range
// scaled by its own earlier flop actions on the canonical path to the node (tree.historyFor).
function opponentRange(node, inputs, policy, flop, hero, prev) {
  const { spot } = inputs;
  const dead = new Set(hero);
  const role = otherRole(nodeRole(node));
  const { steps } = flopState(spot.tree, historyFor(spot.tree, node, prev));
  return scaleByPath(seatRange(inputs, spot[role], flop).filter(item => !item.combo.some(card => dead.has(card))), role, steps, policy, flop);
}

const FIRST_NODES = { btn_first: ["bb_vs_33", "bb_vs_75"], oop_first: ["ip_vs_33", "ip_vs_75"] };
const RAISE_NODES = { btn_vs_raise: true, oop_vs_raise: true };
const RAISE_AFTER = { bb_vs_33: "btn_vs_raise", bb_vs_75: "btn_vs_raise", ip_vs_33: "oop_vs_raise", ip_vs_75: "oop_vs_raise" };

function betSize(node, prev, config, startPot) {
  const fraction = key => config.flop_bet_fractions[key === "bet75" ? 1 : 0] ?? (key === "bet75" ? 0.75 : 0.33);
  if (FIRST_NODES[node]) return null;
  if (RAISE_NODES[node]) return fraction(prev) * startPot;
  return fraction(node.endsWith("_75") ? "bet75" : "bet33") * startPot;
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
  const hands = [...byClass.values()].sort((a, b) => b.weight - a.weight).slice(0, 8)
    .map(entry => ({ hand: entry.hand, tier: Object.entries(entry.tiers).sort((a, b) => b[1] - a[1])[0][0] }));
  return { weight: total, hands };
}

function group(key, items, all) {
  const { weight, hands } = summarize(items);
  return { key, share: all ? weight / all : 0, hands };
}

export function explainCombo({ boardCards, node, cards, prev = "bet33", inputs, policy }) {
  if (!NODES[node] || !treeNodes(inputs.spot.tree).includes(node)) throw new Error("未対応の判断です。");
  const flop = boardCards;
  const hero = parseCards(cards, 2);
  if (hero.some(card => flop.includes(card))) throw new Error("ボードと重なるカードです。");
  const boards = runouts(flop, hero, seedFor(`${cards}|${node}`));
  const villains = opponentRange(node, inputs, policy, flop, hero, prev)
    .filter(item => item.weight > 0)
    .map(item => ({ ...item, tier: handTier(item.combo, flop), equity: equityAgainst(hero, item.combo, flop, boards) }));
  const total = villains.reduce((sum, item) => sum + item.weight, 0);
  const equity = total ? villains.reduce((sum, item) => sum + item.weight * item.equity, 0) / total : 0;
  const ahead = villains.filter(item => item.equity >= 0.5), behind = villains.filter(item => item.equity < 0.5);
  const actions = {};

  const vsResponse = (responseNode, action) => {
    const response = villains.map(item => {
      const mix = policyMix(policy, responseNode, item.combo, flop);
      const fold = mix.fold / 100;
      return { item, fold, cont: 1 - fold };
    });
    const scale = (list, key) => list.map(({ item, ...rest }) => ({ ...item, weight: item.weight * rest[key] })).filter(item => item.weight > 0);
    const folds = response.reduce((sum, entry) => sum + entry.item.weight * entry.fold, 0);
    actions[action] = {
      foldShare: total ? folds / total : 0,
      groups: [
        group("value", scale(response.filter(entry => entry.item.equity >= 0.5), "cont"), total),
        group("foldBetter", scale(response.filter(entry => entry.item.equity < 0.5), "fold"), total),
        group("continueBetter", scale(response.filter(entry => entry.item.equity < 0.5), "cont"), total),
      ],
    };
  };

  if (FIRST_NODES[node]) {
    vsResponse(FIRST_NODES[node][0], "bet33");
    vsResponse(FIRST_NODES[node][1], "bet75");
    actions.check = { groups: [group("ahead", ahead, total), group("behind", behind, total)] };
  } else {
    const startPot = inputs.spot.potBb;
    const bet = betSize(node, prev, inputs.config, startPot);
    const multiplier = inputs.config.flop_check_raise_multiplier ?? 3;
    // A raise is capped by the stack (all-in).
    const raiseTo = Math.min(bet * multiplier, inputs.spot.stackBb);
    const toCall = RAISE_NODES[node] ? raiseTo - bet : bet;
    const potBefore = RAISE_NODES[node] ? startPot + bet + raiseTo : startPot + bet;
    const required = toCall / (potBefore + toCall);
    const caught = { groups: [group("ahead", ahead, total), group("behind", behind, total)], required };
    actions.call = caught;
    actions.fold = caught;
    if (RAISE_AFTER[node]) vsResponse(RAISE_AFTER[node], "raise");
  }
  return { kind: "ai_estimate_not_gto", cards, node, equity, combos: villains.length, actions };
}
