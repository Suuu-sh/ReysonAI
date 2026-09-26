import { boardTexture, handTier, TEXTURES, TIERS } from "./model.mjs";

import { DEFAULT_TREE, NODES, TREES, nodeRole, treeNodes } from "./tree.mjs";

// Node names and trees live in tree.mjs: "btn_*" / "ip_*" nodes belong to the in-position
// player and "bb_*" / "oop_*" nodes to the out-of-position player of a heads-up pot.
export { NODES, TREES, nodeRole, treeNodes };

// A policy is valid for one tree: only that tree's nodes, and a texture=any fallback for
// every node and tier (20 rules for "oop_checks", 40 for "oop_leads").
export function validatePolicy(policy, tree = DEFAULT_TREE) {
  const nodes = treeNodes(tree);
  if (!policy || policy.version !== 1 || policy.kind !== "ai_estimate_not_gto" ||
      !Array.isArray(policy.rules) || policy.rules.length < nodes.length * 5 || policy.rules.length > nodes.length * 25 ||
      Object.keys(policy).some(key => !["version", "kind", "rules"].includes(key))) throw new Error("Invalid postflop policy envelope");
  const seen = new Set();
  for (const rule of policy.rules) {
    if (!rule || Object.keys(rule).sort().join(",") !== "mix,node,texture,tier" ||
        !nodes.includes(rule.node) || !["any", ...TEXTURES].includes(rule.texture) || !TIERS.includes(rule.tier)) {
      throw new Error("Invalid postflop policy rule");
    }
    const key = `${rule.node}|${rule.texture}|${rule.tier}`;
    if (seen.has(key)) throw new Error(`Duplicate policy rule: ${key}`);
    seen.add(key);
    const actions = NODES[rule.node];
    if (!rule.mix || Object.keys(rule.mix).sort().join(",") !== [...actions].sort().join(",") ||
        actions.some(action => !Number.isInteger(rule.mix[action]) || rule.mix[action] < 0 || rule.mix[action] > 100) ||
        actions.reduce((sum, action) => sum + rule.mix[action], 0) !== 100) {
      throw new Error(`Invalid action mix: ${key}`);
    }
  }
  for (const node of nodes) for (const tier of TIERS) {
    if (!seen.has(`${node}|any|${tier}`)) throw new Error(`Missing fallback rule: ${node}/${tier}`);
  }
  return policy;
}

export function policyMix(policy, node, hole, flop) {
  const tier = handTier(hole, flop), texture = boardTexture(flop);
  const rule = policy.rules.find(item => item.node === node && item.tier === tier && item.texture === texture) ??
    policy.rules.find(item => item.node === node && item.tier === tier && item.texture === "any");
  if (!rule) throw new Error(`Uncovered policy node: ${node}/${texture}/${tier}`);
  return rule.mix;
}

export function choose(mix, random, actions = Object.keys(mix)) {
  let target = random * 100;
  for (const action of actions) { target -= mix[action]; if (target < 0) return action; }
  return actions.at(-1);
}

// Fixed independent comparator. These are intentionally simple reference policies,
// not GTO or performance targets; simulations report differences only.
const standard = {
  btn_first: {
    monster: [5, 25, 70], strong: [25, 55, 20], draw: [45, 45, 10],
    medium: [75, 25, 0], air: [85, 15, 0],
  },
  bb_vs_33: {
    monster: [0, 45, 55], strong: [5, 80, 15], draw: [20, 70, 10],
    medium: [35, 65, 0], air: [90, 10, 0],
  },
  bb_vs_75: {
    monster: [0, 55, 45], strong: [20, 70, 10], draw: [45, 50, 5],
    medium: [70, 30, 0], air: [95, 5, 0],
  },
  btn_vs_raise: {
    monster: [0, 100], strong: [25, 75], draw: [45, 55],
    medium: [75, 25], air: [95, 5],
  },
  // The OOP preflop raiser leading (oop_leads tree): a little less betting than IP after a check.
  oop_first: {
    monster: [30, 40, 30], strong: [45, 45, 10], draw: [55, 35, 10],
    medium: [80, 20, 0], air: [80, 20, 0],
  },
  ip_vs_33: {
    monster: [0, 45, 55], strong: [5, 80, 15], draw: [20, 70, 10],
    medium: [35, 65, 0], air: [90, 10, 0],
  },
  ip_vs_75: {
    monster: [0, 55, 45], strong: [20, 70, 10], draw: [45, 50, 5],
    medium: [70, 30, 0], air: [95, 5, 0],
  },
  oop_vs_raise: {
    monster: [0, 100], strong: [25, 75], draw: [45, 55],
    medium: [75, 25], air: [95, 5],
  },
};

// The fixed reference policy of one tree (only that tree's nodes, in the original rule order).
export function referencePolicyFor(tree = DEFAULT_TREE) {
  const nodes = treeNodes(tree);
  return validatePolicy({ version: 1, kind: "ai_estimate_not_gto",
    rules: Object.entries(standard).filter(([node]) => nodes.includes(node)).flatMap(([node, tiers]) => Object.entries(tiers).map(([tier, values]) => ({
      node, tier, texture: "any", mix: Object.fromEntries(NODES[node].map((action, i) => [action, values[i]])),
    }))),
  }, tree);
}
export const referencePolicy = referencePolicyFor(DEFAULT_TREE);
const referenceAll = referencePolicyFor("oop_leads");

function roundMix(mix, actions) {
  const entries = actions.map(action => [action, mix[action]]);
  const result = Object.fromEntries(entries.map(([action, value]) => [action, Math.floor(value)]));
  let left = 100 - Object.values(result).reduce((sum, value) => sum + value, 0);
  entries.sort((a, b) => (b[1] % 1) - (a[1] % 1));
  for (let i = 0; i < left; i++) result[entries[i][0]]++;
  return result;
}

export function opponentMix(node, hole, flop, profile) {
  if (!["standard", "passive", "aggressive"].includes(profile)) throw new Error("Unknown opponent profile");
  const base = policyMix(referenceAll, node, hole, flop);
  if (profile === "standard") return base;
  const factor = profile === "passive" ? 0.5 : 1.5;
  const actions = NODES[node];
  if (node === "btn_first" || node === "oop_first") {
    const betTotal = Math.min(100, (base.bet33 + base.bet75) * factor);
    const fraction33 = base.bet33 / (base.bet33 + base.bet75 || 1);
    return roundMix({ check: 100 - betTotal, bet33: betTotal * fraction33, bet75: betTotal * (1 - fraction33) }, actions);
  }
  if (node === "btn_vs_raise" || node === "oop_vs_raise") {
    const call = Math.min(100, Math.max(0, base.call + (profile === "passive" ? 10 : -10)));
    return { fold: 100 - call, call };
  }
  const raise = Math.min(100 - base.fold, Math.round(base.raise * factor));
  const call = 100 - base.fold - raise;
  return { fold: base.fold, call, raise };
}

// Weights each combo of `role`'s range by the policy frequency of that player's own
// earlier flop actions in `steps` (from tree.flopState), i.e. its reach at a later decision.
export function scaleByPath(items, role, steps, policy, flop) {
  return steps.filter(step => step.role === role).reduce((range, step) =>
    range.map(item => ({ ...item, weight: item.weight * policyMix(policy, step.node, item.combo, flop)[step.action] / 100 })), items);
}
