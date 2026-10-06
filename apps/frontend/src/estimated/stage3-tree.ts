// Full offline catalog. UI paths should import stage3-catalog.ts and expand only
// the selected root with enumerateStage3Tree([root]). No saved frequencies here.
export * from "./stage3-catalog.ts";
import { enumerateStage3Tree } from "./stage3-catalog.ts";
const catalog = enumerateStage3Tree();
export const stage3Roots = catalog.roots;
export const stage3Spots = catalog.spots;
export const stage3Decisions = catalog.all_decisions;
export const stage3Terminals = catalog.terminals;
export const stage3Boundaries = catalog.boundaries;
export const stage3ById = new Map(stage3Spots.map(node => [node.id, node]));
export const stage3RootById = new Map(stage3Roots.map(root => [root.id, root]));
