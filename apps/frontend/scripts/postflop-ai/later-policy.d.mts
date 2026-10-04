import type { ReferenceTier } from "./policy.mjs";

/** Fixed turn/river comparator; river rules never contain the draw tier. */
type ReferenceRules<Tier extends ReferenceTier> = {
  rules: Array<{
    node: string;
    line: "any";
    texture: "any";
    tier: Tier;
    mix: Record<string, number>;
  }>;
};
export type LaterReferencePolicy = {
  version: 1;
  kind: "ai_estimate_not_gto";
  streets: {
    turn: ReferenceRules<ReferenceTier>;
    river: ReferenceRules<Exclude<ReferenceTier, "draw">>;
  };
};

export function referenceLaterPolicy(): LaterReferencePolicy;
