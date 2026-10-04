/** Fixed comparator returned to the versioned public runtime-config endpoint. */
export type ReferenceTier = "monster" | "strong" | "draw" | "medium" | "air";
export type FlopReferencePolicy = {
  version: 1;
  kind: "ai_estimate_not_gto";
  rules: Array<{
    node: string;
    tier: ReferenceTier;
    texture: "any";
    mix: Record<string, number>;
  }>;
};

export function referencePolicyFor(tree?: "oop_checks" | "oop_leads"): FlopReferencePolicy;
