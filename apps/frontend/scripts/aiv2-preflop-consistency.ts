import { createHash } from "node:crypto";
import { actionsForSpot, scenarioOnly } from "./aiv2-preflop.ts";
import type { Node } from "./aiv2-preflop-graph.ts";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function size(spot: Record<string, any>, action: string, facedSize?: number): number | null {
  const structure = scenarioOnly(spot) as Record<string, any>;
  if (structure.action_sizes_bb && Object.hasOwn(structure.action_sizes_bb, action)) {
    if (action === "call" && facedSize !== undefined && structure.action_sizes_bb[action] !== facedSize)
      throw new Error("Recorded call-to size contradicts faced action history");
    return structure.action_sizes_bb[action];
  }
  if (action === "fold" || action === "check") return null;
  if (action === "limp") return 1;
  if (action === "all_in") return structure.all_in_size_bb ?? structure.effective_stack_bb;
  if (action === "call") {
    if (!Number.isFinite(facedSize)) throw new Error("Call requires authoritative faced raise-to size");
    return facedSize!;
  }
  return structure[action + "_size_bb"] ?? (action === "raise" ? structure.raise_to_bb : undefined) ?? null;
}
export function actionSize(node: Node, action: string, byKey: Map<string, Node>): number | null {
  if (action !== "call") return size(node.spot, action);
  if (node.full_history) {
    const faced = [...node.full_history].reverse().find(event => !["fold", "check", "call"].includes(event.action));
    if (faced?.to_size_bb !== null && faced?.to_size_bb !== undefined) return size(node.spot, action, faced.to_size_bb);
  }
  // Proposed future raise sizes are not the amount currently faced. Walk the
  // actual prior aggressive action, retaining its actor and raise-to amount.
  for (let index = node.refs.length - 1; index >= 0; index--) {
    const ref = node.refs[index];
    if (!["fold", "check", "call"].includes(ref.action)) {
      const faced = actionSize(byKey.get(node.dependencies[index])!, ref.action, byKey);
      if (faced === null) throw new Error("Unknown faced size " + node.key);
      return size(node.spot, action, faced);
    }
  }
  if (node.spot.unreachable) return node.spot.facing_size_bb ?? node.spot.open_size_bb ?? null;
  throw new Error("Missing faced action history " + node.key);
}
export function consistencyPlan(nodes: Node[]) {
  const byKey = new Map(nodes.map(node => [node.key, node]));
  const identities = new Map<string, string>(), canonical = new Map<string, string>(), aliases = new Map<string, string>();
  function identity(node: Node): string {
    if (identities.has(node.key)) return identities.get(node.key)!;
    if (!Array.isArray(node.full_history)) throw new Error("Missing canonical full history " + node.key);
    const history = node.full_history.map(({ seat, action, to_size_bb, source, assumption }) => ({
      seat, action, to_size_bb,
      // Assumed folds remain explicit and distinguish a known conditional source
      // from an unresolved structural input, without inventing policy precision.
      conditional_policy: source ? "catalog-resolved" : "structural-assumption",
      ...(source ? {} : { assumption }),
    }));
    const actions = actionsForSpot(node.spot);
    const value = sha({ game: "6max-NLHE-cash-100bb-ante0-rake5pct-cap3bb", hero: node.spot.hero,
      profile: node.profile ?? null, placeholder_identity: node.spot.unreachable ? node.spot.id : null, history, legal_actions: [...actions].sort(),
      action_sizes: Object.fromEntries([...actions].sort().map(action => [action, actionSize(node, action, byKey)])), unreachable: !!node.spot.unreachable });
    identities.set(node.key, value);
    const prior = canonical.get(value);
    if (prior) aliases.set(node.key, prior); else canonical.set(value, node.key);
    return value;
  }
  nodes.forEach(identity);
  return { identities, aliases };
}
export function auditGlobal(nodes: Node[], outputs: Map<string, any>, identities: Map<string, string>) {
  const fingerprints = new Map<string, string>();
  for (const node of nodes) {
    const output = outputs.get(node.key);
    if (!output) throw new Error("Global coverage missing " + node.key);
    for (const key of node.dependencies) if (!outputs.has(key)) throw new Error("Global prerequisite missing " + key);
    const fingerprint = sha({ final_policy_hash: output.metadata.final_hash, hands: output.spot.hands, overrides: output.spot.combo_overrides, reach: output.combo_reach_weights });
    const semantic = identities.get(node.key)!;
    if (fingerprints.has(semantic) && fingerprints.get(semantic) !== fingerprint) throw new Error("Contradictory duplicate decision " + node.key);
    fingerprints.set(semantic, fingerprint);
    if (output.metadata.semantic_identity !== semantic) throw new Error("Semantic identity mismatch " + node.key);
    const observed = node.dependencies.map(key => outputs.get(key).metadata.final_hash ?? outputs.get(key).metadata.source_hash);
    if (sha(observed) !== output.metadata.upstream_fingerprint) throw new Error("Stale upstream identity " + node.key);
  }
  return { status: "passed", nodes: nodes.length, unique_decisions: fingerprints.size, duplicate_aliases: nodes.length - fingerprints.size,
    checks: ["exact-domain-coverage", "per-seat-action-history-identity", "legal-action-size-identity", "dependency-final-policy-hashes", "duplicate-decision-policy-equality"] };
}
