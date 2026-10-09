// Bounded MCP projection of one published flop-policy decision. This deliberately
// lives in the MCP adapter so the frontend evaluator and its reviewed provenance
// sources remain unchanged. Its output is regression-tested against computeBoard.
import { comboRange } from "../../frontend/scripts/postflop-ai/browser-inputs.ts";
import { flopTextureKeys, handTier, TIERS } from "../../frontend/scripts/postflop-ai/model.ts";
import { NODES, nodeRole, treeNodes, withRaise } from "../../frontend/scripts/postflop-ai/policy.ts";
import { FLOP_BETS, flopState, historyFor } from "../../frontend/scripts/postflop-ai/tree.ts";
import { comboId, defenceFor, flopRunouts, replayOrNull, DEFENCE_VERSION } from "../../frontend/scripts/postflop-ai/defence.ts";
import { EVALUATOR_VERSION } from "../../frontend/scripts/lib/equity.ts";

export function assertPolicyNodeComplete(policy, node) {
  if (!Object.hasOwn(NODES, node)) throw new Error(`Unknown policy node: ${node}`);
  for (const tier of TIERS) if (!policy.rules.some(rule => rule.node === node && rule.tier === tier && rule.texture === "any")) {
    throw new Error(`Incomplete published policy node: ${node}/${tier}`);
  }
}

export function projectPolicyRows(rows) {
  return rows.map(row => ({ hand: row.hand, preflopSupport: row.reachable,
    nodeReachable: row.reachWeight > 0, comboCount: row.comboCount,
    frequencies: row.mix, tierWeights: row.tiers, reachWeight: row.reachWeight }));
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

  // The shared web evaluator caches 300 rank tables for each of up to 16 flops.
  // MCP requests are independent reads, so release this request's large runout
  // tables after projecting the node; the bounded rank-table LRU remains shared.
  const runouts = flopRunouts(boardCards);
  try {
    const defence = defenceFor(inputs, policy, null);
    const reach = defence.rangeOf(table, boardCards, seat);
    for (const actor of [spot.ip, spot.oop]) {
      const hasAction = table.log.some(entry => entry.seat === actor && entry.action !== null);
      if (hasAction) {
        const actorReach = actor === seat ? reach : defence.rangeOf(table, boardCards, actor);
        if (!actorReach?.some(weight => weight > 0)) throw new Error(`Unreachable flop history for ${node}`);
      }
    }

    // Use the same texture fallback order as policyMix, indexed locally so the bounded
    // projection does not repeat a linear scan of the published rules for every combo.
    const ruleIndex = new Map(policy.rules.map(rule => [`${rule.node}|${rule.tier}|${rule.texture}`, rule]));
    const textures = flopTextureKeys(boardCards);
    const savedMix = (tier) => {
      for (const texture of textures) {
        const rule = ruleIndex.get(`${node}|${tier}|${texture}`);
        if (rule) return withRaise(node, rule.mix);
      }
      throw new Error(`Uncovered policy node: ${node}/${textures[0]}/${tier}`);
    };
    const rows = inputs.seatRows[seat].map(row => {
      const combos = comboRange([row], "freq", boardCards);
      const total = combos.reduce((sum, item) => sum + item.weight, 0);
      const mixes = combos.map(item => {
        const tier = handTier(item.combo, boardCards);
        const base = savedMix(tier);
        return { tier, mix: defence.mix(table, boardCards, node, item.combo, base) };
      });
      const mix = Object.fromEntries(actions.map(action => [action, total
        ? combos.reduce((sum, item, index) => sum + item.weight * mixes[index].mix[action], 0) / total / 100
        : 0]));
      const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0]));
      let reachWeight = 0;
      combos.forEach((item, index) => {
        const { tier } = mixes[index];
        if (total) tiers[tier] += item.weight / total;
        reachWeight += reach[comboId(item.combo[0], item.combo[1])];
      });
      return { hand: row.hand, comboCount: combos.length, reachable: total > 0, mix, tiers, combos: [], reachWeight };
    });
    return { seat, actions, rows };
  } finally {
    runouts.tables = null;
  }
}
