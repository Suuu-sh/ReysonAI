import type { ActionMix, FlopPolicy, Inputs, LaterPolicy, PreviousLine, ReachStep, StrategyCombo, StrategyNode, StrategyNodes, StrategyRow } from "./types.ts";
import type { PlayerRole } from "./tree.ts";
import type { WeightedCombo } from "../lib/equity.ts";
import type { ActionPaths } from "./engine.ts";
export type FlopHistoryView = StrategyNode & { node: string };
// Range-weighted mix tables of the read-only postflop views. Pure and shared by the Node view
// (local-view.mjs) and the browser compute layer (src/estimated/postflop-compute.ts) so both build
// exactly the same rows. Facing decisions use the computed defence (defence.mjs); every other
// decision (checks, bets, raises) keeps the AI policy mix.
import { comboRange } from "./browser-inputs.ts";
import { handTier, TIERS } from "./model.ts";
import { LATER_NODES } from "./later-tree.ts";
import { laterPolicyMix } from "./later-policy.ts";
import { NODES, nodeRole, policyMix, policyMixExact, scaleByPath, treeNodes } from "./policy.ts";
import { FLOP_BETS, flopState, historyFor, treeHistories } from "./tree.ts";
import { comboId, defenceFor, replayOrNull } from "./defence.ts";
import { canonicalFlop, remapFlopNodes } from "./flop-isomorphism.ts";

const cardText = (card: number): string => "23456789TJQKA"[card >> 2] + "cdhs"[card & 3];
const lineFor = (previousAggressor: PlayerRole | null, role: PlayerRole): PreviousLine => previousAggressor === null
  ? "checked" : previousAggressor === role ? "aggressor" : "defender";

export function scaleLaterPath<T extends WeightedCombo>(items: T[], role: PlayerRole, steps: readonly ReachStep[], policy: LaterPolicy, board: readonly number[], previousAggressor: PlayerRole | null): T[] {
  return steps.filter(step => step.role === role).reduce((range, step) => {
    const line = lineFor(previousAggressor, role);
    return range.map(item => ({ ...item,
      weight: item.weight * laterPolicyMix(policy, step.node, item.combo, board, line)[step.action] / 100,
    }));
  }, items);
}

// The flop view of any valid three-card board: every node of the spot's tree, one row per hand
// class. A facing node is shown after the canonical line that reaches it (historyFor, smallest bet).
export function flopNodes(inputs: Inputs, policy: FlopPolicy, boardCards: readonly number[], history: string[] | null = null): StrategyNodes {
  const canonical = canonicalFlop(boardCards);
  const nodes = flopNodesCanonical(inputs, policy, canonical.cards, history);
  return remapFlopNodes(nodes, canonical.fromCanonical);
}

// The raw canonical-coordinate implementation is also used by the offline base generator.
export function flopNodesCanonical(inputs: Inputs, policy: FlopPolicy, boardCards: readonly number[], history: string[] | null = null): StrategyNodes {
  return Object.fromEntries(treeNodes(inputs.spot.tree).map(node => [node,
    flopNodeCanonical(inputs, policy, boardCards, node, history)]));
}

// The bounded MCP projection uses the same computation for one exact flop decision,
// without building the other nodes or retaining combo-level output.
export function flopNodeCanonical(inputs: Inputs, policy: FlopPolicy, boardCards: readonly number[], node: string,
  history: string[] | null = null, { includeCombos = true, requireSavedRules = false }:
    { includeCombos?: boolean; requireSavedRules?: boolean } = {}): StrategyNode {
  const { spot } = inputs;
  if (!treeNodes(spot.tree).includes(node)) throw new Error(`Unknown flop node: ${node}`);
  const actions = NODES[node];
  const seat = spot[nodeRole(node)]; // btn_* / ip_* = IP, bb_* / oop_* = OOP
  // A line the engine resolves differently (e.g. a wager merged into an all-in) keeps the policy mix.
  const path = history && flopState(spot.tree, history).node === node ? history : historyFor(spot.tree, node, FLOP_BETS[0]);
  const table = replayOrNull(inputs, boardCards, { flop: path });
  if (requireSavedRules && !table) throw new Error(`Unreachable flop history for ${node}`);
  const defence = defenceFor(inputs, policy, null);
  const reach = table ? defence.rangeOf(table, boardCards, seat) : null;
  if (requireSavedRules && table) {
    for (const actor of [spot.ip, spot.oop]) {
      const hasAction = table.log.some(entry => entry.seat === actor && entry.action !== null);
      if (hasAction) {
        const actorReach = actor === seat ? reach : defence.rangeOf(table, boardCards, actor);
        if (!actorReach?.some(weight => weight > 0)) throw new Error(`Unreachable flop history for ${node}`);
      }
    }
  }
  const mixOf = (combo: readonly number[]): ActionMix => {
    const base = requireSavedRules ? policyMixExact(policy, node, combo, boardCards) : policyMix(policy, node, combo, boardCards);
    return table ? defence.mix(table, boardCards, node, combo, base) : base;
  };
  const rows = inputs.seatRows[seat].map(row => {
    const combos = comboRange([row], "freq", boardCards);
    const total = combos.reduce((sum, item) => sum + item.weight, 0);
    const mixes = combos.map(item => mixOf(item.combo));
    const mix = Object.fromEntries(actions.map(action => [action, total
      ? combos.reduce((sum, item, index) => sum + item.weight * mixes[index][action], 0) / total / 100
      : 0]));
    const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0])) as Record<import("./types.ts").HandTier, number>;
    let reachWeight = 0;
    const detail = includeCombos ? [] as StrategyCombo[] : null;
    combos.forEach((item, index) => {
      const tier = handTier(item.combo, boardCards);
      if (total) tiers[tier] += item.weight / total;
      const comboReach = reach ? reach[comboId(...item.combo as [number, number])] : item.weight;
      reachWeight += comboReach;
      detail?.push({ cards: item.combo.map(cardText).join(""), tier, weight: item.weight,
        reachWeight: comboReach, mix: Object.fromEntries(actions.map(action => [action, mixes[index][action] / 100])) });
    });
    return { hand: row.hand, comboCount: combos.length, reachable: total > 0, mix, tiers,
      combos: detail ?? [], reachWeight };
  });
  return { seat, actions, rows };
}

export function flopHistoryViews(inputs: Inputs, policy: FlopPolicy, boardCards: readonly number[]): Record<string, FlopHistoryView> {
  // All histories, not just the smallest-bet template of *_vs_raise.
  return Object.fromEntries(Object.keys(treeHistories(inputs.spot.tree)).map(key => {
    const history = key ? key.split(",") : [];
    const node = flopState(inputs.spot.tree, history).node!;
    return [key, { node, ...flopNodesCanonical(inputs, policy, boardCards, history)[node] }];
  }));
}

// The rows of one turn/river decision. `paths` = { flop, turn, river } (actions before the node in
// its street, complete for earlier streets); the acting seat's own earlier actions narrow its combos.
export function laterMixRows({ actor, role, board, node, line, inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps,
  turnBoard, riverBoard, turnPreviousAggressor, riverPreviousAggressor, paths }: {
  actor: string; role: PlayerRole; board: readonly number[]; node: string; line: PreviousLine; inputs: Inputs; flopPolicy: FlopPolicy; laterPolicy: LaterPolicy;
  flopSteps: readonly ReachStep[]; turnSteps?: readonly ReachStep[] | null; riverSteps?: readonly ReachStep[] | null;
  turnBoard: readonly number[]; riverBoard?: readonly number[] | null; turnPreviousAggressor: PlayerRole | null;
  riverPreviousAggressor?: PlayerRole | null; paths: Partial<ActionPaths>;
}): StrategyRow[] {
  const actions = LATER_NODES[node];
  const rows = inputs.seatRows[actor];
  if (!rows) throw new Error(`Missing saved range for ${actor}`);
  const defence = defenceFor(inputs, flopPolicy, laterPolicy);
  const table = replayOrNull(inputs, board, paths);
  // Reach weights of the acting range, bluff cap included (the policy scaling below is the fallback).
  const dense = table ? defence.rangeOf(table, board, actor) : null;
  return rows.map(row => {
    let combos = comboRange([row], "freq", board);
    if (dense) combos = combos.map(item => ({ ...item, weight: dense[comboId(item.combo[0], item.combo[1])] }));
    else {
      combos = scaleByPath(combos, role, flopSteps, flopPolicy, board.slice(0, 3));
      if (turnSteps) combos = scaleLaterPath(combos, role, turnSteps, laterPolicy, turnBoard, turnPreviousAggressor);
      if (riverSteps) combos = scaleLaterPath(combos, role, riverSteps, laterPolicy, riverBoard!, riverPreviousAggressor!);
    }
    const totals = Object.fromEntries(actions.map(action => [action, 0]));
    const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0])) as Record<import("./types.ts").HandTier, number>;
    const detail: StrategyCombo[] = [];
    let weightTotal = 0;
    for (const item of combos) {
      if (!item.weight) continue;
      const rawTier = handTier(item.combo, board);
      const tier = rawTier === "draw" && node.startsWith("river_") ? "medium" : rawTier;
      let mix = laterPolicyMix(laterPolicy, node, item.combo, board, line);
      if (table) mix = defence.mix(table, board, node, item.combo, mix);
      detail.push({ cards: item.combo.map(cardText).join(""), tier, weight: item.weight,
        mix: Object.fromEntries(actions.map(action => [action, mix[action] / 100])) });
      weightTotal += item.weight;
      tiers[tier] += item.weight;
      for (const action of actions) totals[action] += item.weight * mix[action] / 100;
    }
    const tier = Object.entries(tiers).reduce<[string, number]>((best, item) => item[1] > best[1] ? item : best, ["air", -1])[0];
    const averaged = Object.fromEntries(actions.map(action => [action, weightTotal ? totals[action] / weightTotal : 0]));
    const mixTotal = Object.values(averaged).reduce((sum, value) => sum + value, 0);
    return { hand: row.hand, reachable: weightTotal > 0, tier, comboCount: detail.length, reachWeight: weightTotal,
      tiers: Object.fromEntries(TIERS.map(name => [name, weightTotal ? tiers[name] / weightTotal : 0])) as Record<import("./types.ts").HandTier, number>,
      mix: Object.fromEntries(actions.map(action => [action, mixTotal ? averaged[action] / mixTotal : 0])), combos: detail };
  });
}
