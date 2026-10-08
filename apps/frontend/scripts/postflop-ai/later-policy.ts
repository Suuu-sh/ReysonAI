import type { ActionMix, HandTier, LaterPolicy, OpponentProfile, PreviousLine } from "./types.ts";
import type { LaterStreet } from "./later-tree.ts";
import { LINES, RUNOUT_TEXTURES, runoutTexture, TIERS } from "./model.ts";
import { handTier } from "./hu-hand-tier.ts";
import { LATER_NODES, STREETS, streetNodes } from "./later-tree.ts";
import { raiseDepth } from "./tree.ts";
import { raiseReferenceRow, withRaise } from "./policy.ts";

const tiersFor = (street: string): HandTier[] => TIERS.filter(tier => street !== "river" || tier !== "draw");
// Policies saved before repeated raises have no raise key on *_vs_raise rules and no *_vs_raise2..N nodes.
const legacyActions = (node: string, mix: ActionMix | null | undefined): readonly string[] => raiseDepth(node) === 1 && mix && typeof mix === "object" && !("raise" in mix)
  ? LATER_NODES[node].filter(action => action !== "raise") : LATER_NODES[node];
const hasKeys = (value: unknown, keys: readonly string[]) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");

export function validateLaterPolicy(policy: unknown): LaterPolicy {
  if (!hasKeys((policy as LaterPolicy), ["version", "kind", "streets"]) || (policy as LaterPolicy).version !== 1 || (policy as LaterPolicy).kind !== "ai_estimate_not_gto" ||
      !hasKeys((policy as LaterPolicy).streets, STREETS)) throw new Error("Invalid later policy envelope");
  for (const street of STREETS) {
    const section = (policy as LaterPolicy).streets[street], nodes = streetNodes(street), tiers = tiersFor(street);
    if (!hasKeys(section, ["rules"]) || !Array.isArray(section.rules)) throw new Error("Invalid later policy rules");
    const seen = new Set(), overrides = Object.fromEntries(nodes.map(node => [node, 0]));
    for (const rule of section.rules) {
      if (!hasKeys(rule, ["node", "line", "texture", "tier", "mix"]) || !nodes.includes(rule.node) ||
          !["any", ...LINES].includes(rule.line) || !["any", ...RUNOUT_TEXTURES].includes(rule.texture) || !tiers.includes(rule.tier)) {
        throw new Error("Invalid later policy rule");
      }
      const key = `${rule.node}|${rule.line}|${rule.texture}|${rule.tier}`;
      if (seen.has(key)) throw new Error(`Duplicate later policy rule: ${key}`);
      seen.add(key);
      const actions = legacyActions(rule.node, rule.mix);
      if (!hasKeys(rule.mix, actions) || actions.some(action => !Number.isInteger(rule.mix[action]) || rule.mix[action] < 0 || rule.mix[action] > 100) ||
          actions.reduce((sum, action) => sum + rule.mix[action], 0) !== 100) throw new Error(`Invalid later action mix: ${key}`);
      if ((rule.line !== "any" || rule.texture !== "any") && ++overrides[rule.node] > 20) throw new Error(`Too many later overrides: ${rule.node}`);
    }
    for (const node of nodes.filter(name => raiseDepth(name) < 2)) for (const tier of tiers) {
      if (!seen.has(`${node}|any|any|${tier}`)) throw new Error(`Missing later fallback rule: ${node}/${tier}`);
    }
  }
  return (policy as LaterPolicy);
}

export function laterPolicyMix(policy: LaterPolicy, node: string, hole: readonly number[], board: readonly number[], line: PreviousLine): ActionMix {
  const street = node.split("_")[0] as LaterStreet;
  if (!LATER_NODES[node] || board.length !== (street === "turn" ? 4 : 5) || !LINES.includes(line)) throw new Error("Invalid later policy decision");
  let tier = handTier(hole, board);
  if (street === "river" && tier === "draw") tier = "medium";
  const texture = runoutTexture(board), rules = policy.streets[street].rules;
  for (const [matchLine, matchTexture] of [[line, texture], [line, "any"], ["any", texture], ["any", "any"]]) {
    const rule = rules.find(item => item.node === node && item.tier === tier && item.line === matchLine && item.texture === matchTexture);
    if (rule) return withRaise(node, rule.mix);
  }
  // Nodes added after a policy was saved (re-raises) use the reference mixes.
  if (raiseDepth(node) >= 2 && policy !== reference) return referenceLaterTierMix(node, tier);
  throw new Error(`Uncovered later policy node: ${node}/${line}/${texture}/${tier}`);
}

// Independent, deliberately simple AI-estimate comparator, not a solver target. Preserve
// the old continuation's bet totals (80/35/20/10/5) and facing continue totals (100/70/50/30/0),
// spread over the configured sizes: value hands lean big, medium hands small, air polarized.
const SIZE_WEIGHTS: Record<HandTier, Record<string, number>> = {
  monster: { 33: 2, 75: 4, 125: 3, allin: 1 }, strong: { 33: 5, 75: 4, 125: 1, allin: 0 },
  draw: { 33: 4, 75: 4, 125: 2, allin: 0 }, medium: { 33: 8, 75: 2, 125: 0, allin: 0 },
  air: { 33: 4, 75: 3, 125: 3, allin: 0 },
};
const sizeKey = (action: string): string => action === "allin" ? "allin" : action.slice(3);

// Integer mix summing to 100 from non-negative raw values (largest remainder).
function roundMix(raw: ActionMix, actions: readonly string[]): ActionMix {
  const mix = Object.fromEntries(actions.map(action => [action, Math.floor(raw[action] ?? 0)]));
  const left = 100 - Object.values(mix).reduce((sum, value) => sum + value, 0);
  const order = [...actions].sort((a, b) => (raw[b] ?? 0) % 1 - (raw[a] ?? 0) % 1);
  for (let i = 0; i < left; i++) mix[order[i % order.length]]++;
  return mix;
}

// Splits `total`% of betting over a node's bet actions by the tier's size weights.
function spreadBets(total: number, bets: readonly string[], tier: HandTier): ActionMix {
  const weights = bets.map(action => SIZE_WEIGHTS[tier][sizeKey(action)] ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(bets.map((action, i) => [action, total * weights[i] / sum]));
}

// The reference mix of a node and tier (any line / texture).
export function referenceLaterTierMix(node: string, tier: HandTier): ActionMix {
  const actions = LATER_NODES[node];
  return roundMix(Object.fromEntries(raiseReferenceRow(node, tier, actions).map((value, i) => [actions[i], value])), actions);
}

export function referenceLaterPolicy(): LaterPolicy {
  return validateLaterPolicy({ version: 1, kind: "ai_estimate_not_gto", streets: Object.fromEntries(STREETS.map(street => [street, {
    rules: streetNodes(street).flatMap(node => tiersFor(street).map(tier => {
      const actions = LATER_NODES[node];
      const bet = { monster: 80, strong: 35, draw: 20, medium: 10, air: 5 }[tier];
      const call = { monster: 100, strong: 70, draw: 50, medium: 30, air: 0 }[tier];
      const raise = tier === "monster" ? 15 : tier === "strong" ? 5 : 0;
      let raw;
      if (node.endsWith("_first")) raw = { check: 100 - bet, ...spreadBets(bet, actions.slice(1), tier) };
      else if (raiseDepth(node)) return { node, line: "any", texture: "any", tier, mix: referenceLaterTierMix(node, tier) };
      else if (!actions.includes("raise")) raw = { fold: 100 - call, call };
      else raw = { fold: 100 - call, call: call - raise, raise };
      return { node, line: "any", texture: "any", tier, mix: roundMix(raw, actions) };
    })),
  }])) });
}

const reference = referenceLaterPolicy();
export function referenceLaterMix(node: string, hole: readonly number[], board: readonly number[], line: PreviousLine, profile: OpponentProfile = "standard"): ActionMix {
  if (!["standard", "passive", "aggressive"].includes(profile)) throw new Error("Unknown opponent profile");
  const base = laterPolicyMix(reference, node, hole, board, line);
  if (profile === "standard") return { ...base };
  const factor = profile === "passive" ? 0.5 : 1.5;
  const actions = LATER_NODES[node];
  if (node.endsWith("_first")) {
    const bets = actions.slice(1), current = bets.reduce((sum, action) => sum + base[action], 0);
    const total = Math.min(100, current * factor);
    return roundMix({ check: 100 - total, ...Object.fromEntries(bets.map(action => [action, current ? total * base[action] / current : 0])) }, actions);
  }
  if (!actions.includes("raise")) {
    const call = Math.min(100, Math.max(0, base.call + (profile === "passive" ? 10 : -10)));
    return { fold: 100 - call, call };
  }
  const raise = Math.min(100 - base.fold, Math.round(base.raise * factor));
  return { fold: base.fold, call: 100 - base.fold - raise, raise };
}
