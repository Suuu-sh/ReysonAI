import type { FlopPolicy, FlopTexture, HandTier, LaterPolicy, PreviousLine, RunoutTexture } from "./types.ts";
import type { LaterStreet } from "./later-tree.ts";
import { HEIGHTS, LINES, RUNOUT_TEXTURES, SHAPES, TIERS } from "./model.ts";
import { DEFAULT_TREE, NODES, treeNodes } from "./tree.ts";
import { LATER_NODES, STREETS, streetNodes } from "./later-tree.ts";
import { validatePolicy } from "./policy.ts";
import { validateLaterPolicy } from "./later-policy.ts";

// Single Size validation is separate from the unchanged multi-size runtime.
const tiersFor = (street: string): HandTier[] => TIERS.filter(tier => street !== "river" || tier !== "draw");

// Copy the runtime lookup priority locally without changing multi-size decisions.
function resolveFlopPolicyRule(policy: FlopPolicy, node: string, tier: HandTier, keys: readonly (FlopTexture | "any")[]) {
  let rule;
  for (const key of keys) if ((rule = policy.rules.find(item => item.node === node && item.tier === tier && item.texture === key))) break;
  return rule;
}

export function validateSingleSizePolicy(policy: unknown, tree: string = DEFAULT_TREE): FlopPolicy {
  const validated = validatePolicy(policy, tree);
  for (const node of treeNodes(tree).filter(name => name === "btn_first" || name === "oop_first")) {
    for (const shape of SHAPES) for (const height of HEIGHTS) {
      const texture: FlopTexture = `${shape}_${height}`;
      // Match unchanged flopTextureKeys' specificity order without real boards.
      const keys: (FlopTexture | "any")[] = [texture, shape, height, "any"];
      const wagers = new Set<string>();
      for (const tier of TIERS) {
        const rule = resolveFlopPolicyRule(validated, node, tier, keys)!;
        for (const action of NODES[node]) if (action !== "check" && rule.mix[action] > 0) wagers.add(action);
      }
      if (wagers.size > 1) throw new Error(`Single-size policy uses several bet sizes: ${node}/${texture}: ${[...wagers].sort().join(",")}`);
    }
  }
  return validated;
}

// Copy runtime line-before-texture precedence locally for exhaustive validation.
function resolveLaterPolicyRule(policy: LaterPolicy, street: LaterStreet, node: string, tier: HandTier, line: PreviousLine, texture: RunoutTexture) {
  const rules = policy.streets[street].rules;
  for (const [matchLine, matchTexture] of [[line, texture], [line, "any"], ["any", texture], ["any", "any"]]) {
    const rule = rules.find(item => item.node === node && item.tier === tier && item.line === matchLine && item.texture === matchTexture);
    if (rule) return rule;
  }
  return undefined;
}

export function validateSingleSizeLaterPolicy(policy: unknown): LaterPolicy {
  const validated = validateLaterPolicy(policy);
  for (const street of STREETS) for (const node of streetNodes(street).filter(name => name.endsWith("_first"))) {
    for (const line of LINES) for (const texture of RUNOUT_TEXTURES) {
      const wagers = new Set<string>();
      for (const tier of tiersFor(street)) {
        const rule = resolveLaterPolicyRule(validated, street, node, tier, line, texture)!;
        for (const action of LATER_NODES[node]) if (action !== "check" && rule.mix[action] > 0) wagers.add(action);
      }
      if (wagers.size > 1) throw new Error(`Single-size policy uses several bet sizes: ${node}/${line}/${texture}: ${[...wagers].sort().join(",")}`);
    }
  }
  return validated;
}

