// Explains one private combo's flop options against the opponent's AI-estimated range.
// Read-only: it reuses the audited candidate policy and never changes it.
import { evaluate, seededRandom, seedFor } from "../lib/equity.ts";
import { seatRange } from "./browser-inputs.ts";
import { parseCards } from "./model.ts";
import { handTier } from "./hu-hand-tier.ts";
import { NODES, policyMix, scaleByPath, treeNodes } from "./policy.ts";
import { FLOP_BETS, facingNode, flopBetFraction, flopState, historyFor, nodeRole, otherRole, raiseDepth } from "./tree.ts";
import { defenceFor, replayOrNull } from "./defence.ts";
import { averageExplanationFacts } from "./explain-aggregate.ts";
import { profileReferenceFacts } from "./profile-reference.ts";

const RANKS = "23456789TJQKA";
const RUNOUTS = 120;

export function handClass([a, b]: any) : any {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return RANKS[high >> 2].repeat(2);
  return RANKS[high >> 2] + RANKS[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
}

function runouts(flop?: any, dead?: any, seed?: any) : any {
  const blocked = new Set([...flop, ...dead]);
  const live = Array.from({ length: 52 }, (_?: any, card?: any) : any => card).filter((card: any) : any => !blocked.has(card));
  const random = seededRandom(seed);
  return Array.from({ length: RUNOUTS }, () : any => {
    const turn = live[Math.floor(random() * live.length)];
    let river: any;
    do river = live[Math.floor(random() * live.length)]; while (river === turn);
    return [turn, river];
  });
}

function equityAgainst(hero?: any, villain?: any, flop?: any, boards?: any) : any {
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
function opponentRange(node?: any, inputs?: any, policy?: any, flop?: any, hero?: any, prev?: any) : any {
  const { spot } = inputs;
  const dead = new Set(hero);
  const role = otherRole(nodeRole(node));
  const history = historyFor(spot.tree, node, prev);
  // Reach weights with the bluff cap from the engine table at the hero's decision.
  const table = replayOrNull(inputs, flop, { flop: history });
  if (table) return defenceFor(inputs, policy, null).rangeItems(table, flop, spot[role]).filter((item: any) : any => !item.combo.some((card: any) : any => dead.has(card)));
  const { steps } = flopState(spot.tree, history);
  return scaleByPath(seatRange(inputs, spot[role], flop).filter((item: any) : any => !item.combo.some((card: any) : any => dead.has(card))), role, steps, policy, flop,
    { requireSavedPolicy: Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard") });
}

const FIRST_NODES: any = { btn_first: "ip", oop_first: "oop" };
// Facing-bet node → the bettor's role and the bet it faces (e.g. bb_vs_125 → IP's bet125).
const facing = (node: any) : any => FLOP_BETS.map((bet: any) : any => [bet, ["ip", "oop"].find((role: any) : any => facingNode(role, bet) === node)]).find(([, role]: any) : any => role);

// Chips (totals on the street) of the wager faced at `node`, without a replayed table: the bet, then each
// raise at `multiplier` times the previous total, capped by the stack. Returns [facing total, previous total].
function facedTotals(node?: any, prev?: any, startPot?: any, multiplier?: any, stack?: any) : any {
  const depth = raiseDepth(node), bet = flopBetFraction(depth ? prev : facing(node)[0]) * startPot;
  const totals = [bet];
  for (let k = 1; k <= depth; k++) totals.push(Math.min(totals[k - 1] * multiplier, stack));
  return [totals[depth], totals[depth - 1] ?? 0];
}

function summarize(items?: any) : any {
  const total = items.reduce((sum?: any, item?: any) : any => sum + item.weight, 0);
  const byClass = new Map();
  for (const item of items) {
    const key = handClass(item.combo);
    const entry = byClass.get(key) ?? { hand: key, weight: 0, tiers: {} };
    entry.weight += item.weight;
    entry.tiers[item.tier] = (entry.tiers[item.tier] ?? 0) + item.weight;
    byClass.set(key, entry);
  }
  const hands = [...byClass.values()].sort((a?: any, b?: any) : any => b.weight - a.weight).slice(0, 8)
    .map((entry: any) : any => ({ hand: entry.hand, tier: Object.entries<any>(entry.tiers).sort((a?: any, b?: any) : any => b[1] - a[1])[0][0] }));
  return { weight: total, hands };
}

function group(key?: any, items?: any, all?: any) : any {
  const { weight, hands } = summarize(items);
  return { key, share: all ? weight / all : 0, hands };
}

export function explainCombo({ boardCards, node, cards, prev = "bet33", inputs, policy }: any) : any {
  if (!NODES[node] || !treeNodes(inputs.spot.tree).includes(node)) throw new Error("未対応の判断です。");
  const flop = boardCards;
  const hero = parseCards(cards, 2);
  if (hero.some((card: any) : any => flop.includes(card))) throw new Error("ボードと重なるカードです。");
  const boards = runouts(flop, hero, seedFor(`${cards}|${node}`));
  const villains = opponentRange(node, inputs, policy, flop, hero, prev)
    .filter((item: any) : any => item.weight > 0)
    .map((item: any) : any => ({ ...item, tier: handTier(item.combo, flop), equity: equityAgainst(hero, item.combo, flop, boards) }));
  const total = villains.reduce((sum?: any, item?: any) : any => sum + item.weight, 0);
  const equity = total ? villains.reduce((sum?: any, item?: any) : any => sum + item.weight * item.equity, 0) / total : 0;
  const ahead = villains.filter((item: any) : any => item.equity >= 0.5), behind = villains.filter((item: any) : any => item.equity < 0.5);
  const actions: Record<string, any> = {};
  const unsupportedActions: Record<string, any> = {};
  const requireSavedPolicy = Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard");
  let defenceFacts: any = null;
  let bettingFacts: any = null;
  // Villain responses use the computed defence (defence.ts) after the line `history` + hero's action.
  const defence = defenceFor(inputs, policy, null);
  const history = historyFor(inputs.spot.tree, node, prev);
  const table = replayOrNull(inputs, flop, { flop: history });

  const vsResponse = (responseNode?: any, action?: any, line?: any) : any => {
    const table = replayOrNull(inputs, flop, { flop: [...history, ...line] });
    let response: any;
    try {
      response = villains.map((item: any) : any => {
        const base = policyMix(policy, responseNode, item.combo, flop, { requireSavedPolicy });
        const mix = table ? defence.mix(table, flop, responseNode, item.combo, base) : base;
        const fold = mix.fold / 100;
        return { item, fold, cont: 1 - fold };
      });
    } catch (error: any) {
      if (requireSavedPolicy && error?.code === "PROFILE_POLICY_MISSING") {
        unsupportedActions[action] = responseNode;
        return;
      }
      throw error;
    }
    const scale = (list?: any, key?: any) : any => list.map(({ item, ...rest }: any) : any => ({ ...item, weight: item.weight * rest[key] })).filter((item: any) : any => item.weight > 0);
    const folds = response.reduce((sum?: any, entry?: any) : any => sum + entry.item.weight * entry.fold, 0);
    actions[action] = {
      foldShare: total ? folds / total : 0,
      groups: [
        group("value", scale(response.filter((entry: any) : any => entry.item.equity >= 0.5), "cont"), total),
        group("foldBetter", scale(response.filter((entry: any) : any => entry.item.equity < 0.5), "fold"), total),
        group("continueBetter", scale(response.filter((entry: any) : any => entry.item.equity < 0.5), "cont"), total),
      ],
    };
  };

  if (FIRST_NODES[node]) {
    for (const bet of FLOP_BETS) vsResponse(facingNode(FIRST_NODES[node], bet), bet, [bet]);
    actions.check = { groups: [group("ahead", ahead, total), group("behind", behind, total)] };
    if (table) bettingFacts = defence.bettingFacts(table, flop, node, hero);
  } else {
    // Break-even and the hero's defence facts from the computed defence (rake and stack caps included).
    const requirement = table ? defence.requirement(table, flop, node) : null;
    let required: any;
    if (requirement) required = requirement.required;
    else {
      const startPot = inputs.spot.potBb;
      // A raise is capped by the stack (all-in).
      const [faced, before] = facedTotals(node, prev, startPot, inputs.config.flop_check_raise_multiplier ?? 3, inputs.spot.stackBb);
      const toCall = faced - before;
      required = toCall / (startPot + faced + before + toCall);
    }
    const caught = { groups: [group("ahead", ahead, total), group("behind", behind, total)], required };
    actions.call = caught;
    actions.fold = caught;
    if (NODES[node].includes("raise")) {
      const answer = flopState(inputs.spot.tree, [...history, "raise"]).node;
      if (answer) vsResponse(answer, "raise", ["raise"]);
    }
    if (table) {
      defenceFacts = defence.facts(table, flop, node, hero, policyMix(policy, node, hero, flop, { requireSavedPolicy }));
      bettingFacts = defence.bettingFacts(table, flop, node, hero);
    }
  }
  const profileReference = requireSavedPolicy
    ? profileReferenceFacts(inputs, policy, null, table, flop, node, hero, policyMix(policy, node, hero, flop, { requireSavedPolicy }))
    : null;
  return { kind: "ai_estimate_not_gto", cards, node, ...(profileReference ? { profile_reference: profileReference } : {}),
    ...(Object.keys(unsupportedActions).length ? { unsupported_actions: unsupportedActions } : {}), equity: defenceFacts?.equity ?? equity, combos: villains.length, actions,
    ...(defenceFacts ? { defence: defenceFacts } : {}), ...(bettingFacts ? { betting: bettingFacts } : {}) };
}

export function explainCombos({ boardCards, node, combos, prev = "bet33", inputs, policy }: any) : any {
  if (!Array.isArray(combos) || !combos.length) throw new Error("At least one reachable combo is required.");
  const entries = combos.map(({ cards, weight }: any) : any => ({ weight,
    facts: explainCombo({ boardCards, node, cards, prev, inputs, policy }) }));
  return averageExplanationFacts(entries);
}
