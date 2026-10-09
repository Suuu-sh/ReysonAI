// Runtime bridge to the frontend's shared, pure postflop codec and game tree.
// The declaration file keeps the MCP typecheck scoped to this boundary while
// the Worker and Node still execute the single shared implementation.
export { canonicalFlop, remapFlopNode } from "../../frontend/scripts/postflop-ai/flop-isomorphism.ts";
export { hydrateFrame, unpackView } from "../../frontend/scripts/postflop-ai/flop-base-codec.ts";
export { flopState, NODES } from "../../frontend/scripts/postflop-ai/tree.ts";
export { referenceLaterPolicy } from "../../frontend/scripts/postflop-ai/later-policy.ts";
export { parseFlopBoard } from "../../frontend/scripts/postflop-ai/model.ts";
export { buildInputs } from "../../frontend/scripts/postflop-ai/browser-inputs.ts";
export { assertPolicyNodeComplete, evaluateFlopNodeCanonical, projectPolicyRows, withRankTableCacheLimit } from "./postflop-eval.mjs";
export { DEFENCE_VERSION } from "../../frontend/scripts/postflop-ai/defence.ts";
export { EVALUATOR_VERSION } from "../../frontend/scripts/lib/equity.ts";
export { validatePolicy } from "../../frontend/scripts/postflop-ai/policy.ts";
