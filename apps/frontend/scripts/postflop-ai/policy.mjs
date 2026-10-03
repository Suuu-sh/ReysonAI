import { flopTextureKeys, handTier, TEXTURES, TIERS } from "./model.mjs";

import { LATER_NODES } from "./later-tree.mjs";
import { DEFAULT_TREE, FLOP_BETS, NODES, TREES, nodeRole, raiseDepth, treeNodes } from "./tree.mjs";

// Node names and trees live in tree.mjs: "btn_*" / "ip_*" nodes belong to the in-position
// player and "bb_*" / "oop_*" nodes to the out-of-position player of a heads-up pot.
export { NODES, TREES, nodeRole, treeNodes };

// A policy is valid for one tree: only that tree's nodes, and a texture=any fallback for
// every node and tier (5 per node of the tree; the node count follows the configured bet sizes).
// Policies saved before repeated raises stay valid: they have no raise key on *_vs_raise rules and
// no *_vs_raise2..N nodes (those fall back to the reference mixes, see policyMix).
export function validatePolicy(policy, tree = DEFAULT_TREE) {
  const nodes = treeNodes(tree), required = nodes.filter(node => raiseDepth(node) < 2);
  if (!policy || policy.version !== 1 || policy.kind !== "ai_estimate_not_gto" ||
      !Array.isArray(policy.rules) || policy.rules.length < required.length * 5 || policy.rules.length > nodes.length * 25 ||
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
    const all = NODES[rule.node];
    const actions = rule.mix && raiseDepth(rule.node) === 1 && !("raise" in rule.mix) ? all.filter(action => action !== "raise") : all;
    if (!rule.mix || Object.keys(rule.mix).sort().join(",") !== [...actions].sort().join(",") ||
        actions.some(action => !Number.isInteger(rule.mix[action]) || rule.mix[action] < 0 || rule.mix[action] > 100) ||
        actions.reduce((sum, action) => sum + rule.mix[action], 0) !== 100) {
      throw new Error(`Invalid action mix: ${key}`);
    }
  }
  for (const node of required) for (const tier of TIERS) {
    if (!seen.has(`${node}|any|${tier}`)) throw new Error(`Missing fallback rule: ${node}/${tier}`);
  }
  return policy;
}

export function policyMix(policy, node, hole, flop) {
  const tier = handTier(hole, flop), keys = flopTextureKeys(flop), texture = keys[0];
  let rule;
  for (const key of keys) if ((rule = policy.rules.find(item => item.node === node && item.tier === tier && item.texture === key))) break;
  if (!rule) {
    // Nodes added after a policy was saved (re-raises) use the reference mixes.
    if (raiseDepth(node) < 2 || policy === referenceAll) throw new Error(`Uncovered policy node: ${node}/${texture}/${tier}`);
    return referenceMix(node, tier);
  }
  return withRaise(node, rule.mix);
}

// A saved *_vs_raise rule has no raise key; read it as raise 0 without touching the rule.
export function withRaise(node, mix) {
  return (NODES[node] ?? LATER_NODES[node])?.includes("raise") && !("raise" in mix) ? { ...mix, raise: 0 } : mix;
}

// Raise cannot be offered when the raiser has no chips to raise with (the opponent is all-in or the
// call already uses the stack): the raise share plays as a call.
export function effectiveMix(mix, canRaise) {
  if (canRaise !== false || !mix.raise) return mix;
  return { ...mix, call: mix.call + mix.raise, raise: 0 };
}

export function choose(mix, random, actions = Object.keys(mix)) {
  let target = random * 100;
  for (const action of actions) { target -= mix[action]; if (target < 0) return action; }
  return actions.at(-1);
}

// Fixed independent comparator. These are intentionally simple reference policies,
// not GTO or performance targets; simulations report differences only.
// First-to-act nodes: [check, total bet %]; the bet is spread over the configured sizes
// by tier (value leans big, medium hands small, air slightly polarized).
const FIRST = {
  btn_first: { monster: [5, 95], strong: [25, 75], draw: [45, 55], medium: [75, 25], air: [85, 15] },
  // The OOP preflop raiser leading (oop_leads tree): a little less betting than IP after a check.
  oop_first: { monster: [30, 70], strong: [45, 55], draw: [55, 45], medium: [80, 20], air: [80, 20] },
};
const SIZE_WEIGHTS = {
  monster: { 33: 25, 75: 50, 125: 25 }, strong: { 33: 70, 75: 25, 125: 5 }, draw: { 33: 50, 75: 35, 125: 15 },
  medium: { 33: 100, 75: 0, 125: 0 }, air: { 33: 70, 75: 15, 125: 15 },
};
// Facing a bet: [fold, call, raise] by bet size (the smallest size row is reused for unknown sizes).
const FACING = {
  33: { monster: [0, 45, 55], strong: [5, 80, 15], draw: [20, 70, 10], medium: [35, 65, 0], air: [90, 10, 0] },
  75: { monster: [0, 55, 45], strong: [20, 70, 10], draw: [45, 50, 5], medium: [70, 30, 0], air: [95, 5, 0] },
  125: { monster: [0, 65, 35], strong: [30, 65, 5], draw: [55, 42, 3], medium: [80, 20, 0], air: [97, 3, 0] },
};
// Facing raise number k (1 = the first raise of a bet): [fold, call, raise] by tier. Re-raises are small
// and tiered (monster > strong > draw > medium > air = 0) and shrink with depth. The last allowed raise
// (fold/call nodes) uses RAISE_LAST: [fold, call].
export const RAISE_REFERENCE = {
  1: { monster: [0, 70, 30], strong: [25, 72, 3], draw: [45, 53, 2], medium: [75, 25, 0], air: [95, 5, 0] },
  // Re-raises keep a few draw/air bluffs so the re-raise range is not value-only.
  2: { monster: [0, 80, 20], strong: [30, 69, 1], draw: [55, 42, 3], medium: [85, 15, 0], air: [95, 3, 2] },
  3: { monster: [0, 90, 10], strong: [35, 65, 0], draw: [65, 33, 2], medium: [90, 10, 0], air: [97, 2, 1] },
};
export const RAISE_LAST = { monster: [0, 100], strong: [40, 60], draw: [70, 30], medium: [92, 8], air: [99, 1] };
// [fold, call, raise?] of a raise-facing node and tier (depth of a node beyond the table reuses the last row).
export function raiseReferenceRow(node, tier, actions) {
  if (!actions.includes("raise")) return RAISE_LAST[tier];
  return RAISE_REFERENCE[Math.min(raiseDepth(node), 3)][tier];
}

export function referenceMix(node, tier) {
  const actions = NODES[node];
  if (node.endsWith("_first")) {
    const [check, bet] = FIRST[node][tier];
    const weights = FLOP_BETS.map(action => SIZE_WEIGHTS[tier][action.slice(3)] ?? 0);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    return roundMix({ check, ...Object.fromEntries(FLOP_BETS.map((action, i) => [action, bet * weights[i] / sum])) }, actions);
  }
  if (raiseDepth(node)) { const row = raiseReferenceRow(node, tier, actions); return Object.fromEntries(actions.map((action, i) => [action, row[i]])); }
  const row = (FACING[node.split("_vs_")[1]] ?? FACING[33])[tier];
  return Object.fromEntries(actions.map((action, i) => [action, row[i]]));
}

// The fixed reference policy of one tree (only that tree's nodes, in tree order).
export function referencePolicyFor(tree = DEFAULT_TREE) {
  return validatePolicy({ version: 1, kind: "ai_estimate_not_gto",
    rules: treeNodes(tree).flatMap(node => TIERS.map(tier => ({ node, tier, texture: "any", mix: referenceMix(node, tier) }))),
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
    const current = FLOP_BETS.reduce((sum, action) => sum + base[action], 0);
    const betTotal = Math.min(100, current * factor);
    return roundMix({ check: 100 - betTotal, ...Object.fromEntries(FLOP_BETS.map(action => [action, current ? betTotal * base[action] / current : 0])) }, actions);
  }
  if (!actions.includes("raise")) {
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
    range.map(item => ({ ...item, weight: item.weight * effectiveMix(policyMix(policy, step.node, item.combo, flop), step.canRaise)[step.action] / 100 })), items);
}
