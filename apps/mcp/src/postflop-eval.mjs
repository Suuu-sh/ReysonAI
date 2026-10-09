// Bounded MCP projection of one published flop-policy decision. This deliberately
// lives in the MCP adapter so the frontend evaluator and its reviewed provenance
// sources remain unchanged. Its output is regression-tested against computeBoard.
import { comboRange } from "../../frontend/scripts/postflop-ai/browser-inputs.ts";
import { handTier, TIERS } from "../../frontend/scripts/postflop-ai/model.ts";
import { NODES, nodeRole, policyMix, treeNodes } from "../../frontend/scripts/postflop-ai/policy.ts";
import { FLOP_BETS, flopState, historyFor } from "../../frontend/scripts/postflop-ai/tree.ts";
import { comboId, defenceFor, replayOrNull } from "../../frontend/scripts/postflop-ai/defence.ts";

export function assertPolicyNodeComplete(policy, node) {
  if (!Object.hasOwn(NODES, node)) throw new Error(`Unknown policy node: ${node}`);
  for (const tier of TIERS) if (!policy.rules.some(rule => rule.node === node && rule.tier === tier && rule.texture === "any")) {
    throw new Error(`Incomplete published policy node: ${node}/${tier}`);
  }
}

export function evaluateFlopNodeCanonical(inputs, policy, boardCards, node, history = null) {
  const { spot } = inputs;
  if (!treeNodes(spot.tree).includes(node)) throw new Error(`Unknown flop node: ${node}`);
  assertPolicyNodeComplete(policy, node);
  const actions = NODES[node];
  const seat = spot[nodeRole(node)];
  const path = history && flopState(spot.tree, history).node === node
    ? history : historyFor(spot.tree, node, FLOP_BETS[0]);
  const table = replayOrNull(inputs, boardCards, { flop: path });
  if (!table) throw new Error(`Unreachable flop history for ${node}`);

  const defence = defenceFor(inputs, policy, null);
  const reach = defence.rangeOf(table, boardCards, seat);
  for (const actor of [spot.ip, spot.oop]) {
    const hasAction = table.log.some(entry => entry.seat === actor && entry.action !== null);
    if (hasAction) {
      const actorReach = actor === seat ? reach : defence.rangeOf(table, boardCards, actor);
      if (!actorReach?.some(weight => weight > 0)) throw new Error(`Unreachable flop history for ${node}`);
    }
  }

  const mixOf = combo => {
    // Complete any-rules are required at this node and every ancestor before this
    // function is called, so the shared frontend lookup cannot use reference mixes.
    const base = policyMix(policy, node, combo, boardCards);
    return defence.mix(table, boardCards, node, combo, base);
  };
  const rows = inputs.seatRows[seat].map(row => {
    const combos = comboRange([row], "freq", boardCards);
    const total = combos.reduce((sum, item) => sum + item.weight, 0);
    const mixes = combos.map(item => mixOf(item.combo));
    const mix = Object.fromEntries(actions.map(action => [action, total
      ? combos.reduce((sum, item, index) => sum + item.weight * mixes[index][action], 0) / total / 100
      : 0]));
    const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0]));
    let reachWeight = 0;
    combos.forEach((item, index) => {
      const tier = handTier(item.combo, boardCards);
      if (total) tiers[tier] += item.weight / total;
      reachWeight += reach[comboId(item.combo[0], item.combo[1])];
    });
    return { hand: row.hand, comboCount: combos.length, reachable: total > 0, mix, tiers, combos: [], reachWeight };
  });
  return { seat, actions, rows };
}
