import type { PostflopDatasets } from "../../scripts/postflop-ai/types.ts";
// How an Reyson Agent picks its action. The balanced agent plays the saved frequencies exactly:
// preflop the dataset row of its hand class (after the table rules in preflop.ts), postflop the
// mix the AI-estimate candidate plays (policy + computed defence, as in simulation.mjs).
//
// A5 hook: `ProfilePolicyRegistry` may return a profile-specific mix (opponent-adjusted range
// tables, once they exist) for a decision. Without one the balanced mix is used. The agent never
// edits frequencies itself.
import { buildInputs, sha } from "../../scripts/postflop-ai/browser-inputs.ts";
import { validatePolicy, choose } from "../../scripts/postflop-ai/policy.ts";
import { validateLaterPolicy } from "../../scripts/postflop-ai/later-policy.ts";
import { defenceFor } from "../../scripts/postflop-ai/defence.ts";
import type { Choice, PreflopAction } from "./preflop.ts";

export type PostflopKit = { spotId: string; inputs: any; flopPolicy: any; laterPolicy: any; defence: any };

// Validates the saved flop and later candidates against the spot's inputs (same checks as
// postflop-compute.ts) and prepares the computed defence. Returns null when anything is
// missing or stale, so the hand is checked down instead of using another spot's policy.
export function makePostflopKit(spotId: string, datasets: PostflopDatasets, flopCandidate: any, laterCandidate: any): PostflopKit | null {
  try {
    if (!flopCandidate || !laterCandidate) return null;
    const inputs = buildInputs(spotId, datasets);
    const flopPolicy = validatePolicy(flopCandidate.policy, inputs.spot.tree);
    if (flopCandidate.metadata?.source_hash !== inputs.fingerprint || flopCandidate.metadata.policy_hash !== sha(flopPolicy) ||
        laterCandidate.metadata?.source_hash !== inputs.fingerprint ||
        laterCandidate.metadata?.flop_policy_hash !== flopCandidate.metadata.policy_hash) return null;
    const laterPolicy = validateLaterPolicy(laterCandidate.policy);
    if (laterCandidate.metadata.policy_hash !== sha(laterPolicy)) return null;
    return { spotId, inputs, flopPolicy, laterPolicy, defence: defenceFor(inputs, flopPolicy, laterPolicy) };
  } catch {
    return null;
  }
}

export type DecisionSource = "balanced" | "profile";

export type ProfilePolicyRegistry = {
  // `key` identifies the decision: preflop dataset source, or postflop spot + street + node.
  lookup(query: { key: string; hand: string; profileId: string | null }): Record<string, number> | null;
};
export const emptyRegistry: ProfilePolicyRegistry = { lookup: () => null };

export type PreflopQuery = { pos: string; hand: string; cards: number[]; offered: { source: string | null; choices: Choice[]; tableRule: string | null }; random: number };
export type PostflopQuery = { kit: PostflopKit; table: any; street: string; seat: string; node: string; board: number[]; hole: number[]; line: string | null; actions: string[]; random: number };

export type Decider = {
  preflop(query: PreflopQuery): { action: PreflopAction; mix: Record<string, number>; source: DecisionSource };
  postflop(query: PostflopQuery): { action: string; mix: Record<string, number>; source: DecisionSource };
};

export function createAgent({ registry = emptyRegistry, profileId = null }: { registry?: ProfilePolicyRegistry; profileId?: string | null } = {}): Decider {
  return {
    preflop({ hand, offered, random }) {
      const balanced = Object.fromEntries(offered.choices.map(choice => [choice.action.key, choice.freq]));
      const profile = offered.tableRule ? null : registry.lookup({ key: `preflop:${offered.source}`, hand, profileId });
      const mix = profile ?? balanced;
      const keys = offered.choices.map(choice => choice.action.key);
      const key = choose(mix, random, keys);
      return { action: offered.choices.find(choice => choice.action.key === key)!.action, mix, source: profile ? "profile" : "balanced" };
    },
    postflop({ kit, table, street, node, board, hole, actions, random }) {
      const base = kit.defence.baseMix(table, board, node, hole);
      const balanced = kit.defence.mix(table, board, node, hole, base);
      const profile = registry.lookup({ key: `postflop:${kit.spotId}:${street}:${node}`, hand: "", profileId });
      const mix = profile ?? balanced;
      return { action: choose(mix, random, actions), mix, source: profile ? "profile" : "balanced" };
    },
  };
}
