import type { Stage3Dataset, Stage3Sources } from "./stage3-types.ts";
// Full deterministic coverage/omission evidence. This never invents strategies.
import { stage3Roots, stage3Spots, stage3Terminals, stage3Boundaries, stage3Families, stage3RootById, STAGE3_RARE_THRESHOLD } from "./stage3-tree.ts";
import { createStage3Model, stage3ComboCount } from "./stage3-model.ts";
export function stage3Coverage(data: Stage3Dataset, datasets: Stage3Sources) {
  const model = createStage3Model({ ...datasets, "stage3-responses": data });
  const saved = new Map(data.spots.map(spot => [spot.id, spot]));
  const families = data.metadata.families;
  const roots = stage3Roots.filter(root => families.includes(root.family) && (!data.metadata.root_ids || data.metadata.root_ids.includes(root.id)));
  const entries = stage3Spots.filter(node => roots.some(root => root.id === node.root_id)).map(node => {
    const evidence = model.rootEvidence(stage3RootById.get(node.root_id)!);
    let status: string, independent_product: number | null = null, joint_reach_upper_bound = evidence.joint_reach_upper_bound;
    if (evidence.rare) status = "rare";
    else {
      const context = model.context(node, saved.get(node.id) ?? node);
      status = context.unreachable ? "unreachable" : saved.has(node.id) ? "saved" : "missing";
      const masses = node.participants.map(seat => [...context.weights[seat]].reduce((sum, [hand, w]) => sum + stage3ComboCount(hand) * w, 0) / 1326);
      independent_product = masses.reduce((a, b) => a * b, 1);
      const disjoint = masses.reduce((p, _, i) => p * ((52 - 2 * i) * (51 - 2 * i)) / (52 * 51), 1);
      joint_reach_upper_bound = context.unreachable ? 0 : Math.min(1, independent_product / disjoint);
    }
    return { id: node.id, root_id: node.root_id, family: node.family, hero: node.hero, status,
      independent_product, exact_joint_reach: null, joint_reach_upper_bound,
      reason: status === "rare" ? "rigorous known-prefix joint upper bound below0.01%; no policy/equity/reason authored" : status === "unreachable" ? "exact prior-action or joint-card support is empty" : status === "missing" ? "reachable strategy missing; publication blocked" : null };
  });
  return { schema_version: "stage3-coverage-v1", probability_units: "ratio; multiply by100 for percent", threshold_probability: STAGE3_RARE_THRESHOLD,
    threshold_scope: "three/four original callers only; strict upper_bound < threshold; never used to prune extra-entrant families",
    joint_bound_method: "E(product of complete own-action weights | distinct holecards) <= independent product / probability that uniform random holecard pairs are distinct. Omitted unknown next actions are bounded by1.",
    catalog_spot_count: entries.length, saved_count: entries.filter(e => e.status === "saved").length,
    omitted_unreachable_count: entries.filter(e => e.status === "unreachable").length, omitted_rare_count: entries.filter(e => e.status === "rare").length,
    missing_count: entries.filter(e => e.status === "missing").length,
    families: families.map(family => ({ family, root_count: roots.filter(r => r.family === family).length,
      decision_count: entries.filter(e => e.family === family).length, saved_count: entries.filter(e => e.family === family && e.status === "saved").length,
      rare_count: entries.filter(e => e.family === family && e.status === "rare").length,
      unreachable_count: entries.filter(e => e.family === family && e.status === "unreachable").length,
      terminal_count: stage3Terminals.filter(t => t.family === family && roots.some(root => root.id === t.root_id)).length })),
    roots: roots.map(root => ({ id: root.id, family: root.family, history: root.history, entrant: root.entrant, first_decision_id: root.first_decision_id,
      decision_count: entries.filter(e => e.root_id === root.id).length, ...model.rootEvidence(root) })),
    boundaries: stage3Boundaries.filter(b => roots.some(r => r.id === b.root_id)), entries };
}
export function validateStage3Coverage(coverage: ReturnType<typeof stage3Coverage>, data: Stage3Dataset, datasets: Stage3Sources) {
  const expected = stage3Coverage(data, datasets);
  if (JSON.stringify(coverage) !== JSON.stringify(expected) || expected.missing_count) throw new Error("Invalid/stale Stage3 coverage or omissions");
  return coverage;
}
