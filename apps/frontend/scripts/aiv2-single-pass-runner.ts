// Separate v6 namespace. Never changes old v5 data or production datasets.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildGraph } from "./aiv2-preflop-graph.ts";
import type { Node } from "./aiv2-preflop-graph.ts";
import { consistencyPlan, auditGlobal } from "./aiv2-preflop-consistency.ts";
import { actionsForSpot, concreteComboReachWeights, encodeComboReachWeights, CONCRETE_COMBOS, expandConcretePolicy, compressConcretePolicy, validateFinalReasons, AIV2_MODEL, AIV2_REASONING_EFFORT } from "./aiv2-preflop.ts";
import { decodeCompactPolicy } from "./aiv2-preflop-codec.ts";
import { createAiv2SessionProvider } from "./lib/aiv2-provider-session.ts";
import { singlePassConcurrency, runtimeCompatibleSource, singlePassScope, singlePassScopeProgress } from "./aiv2-single-pass-runtime.ts";
import { hash, SINGLE_PASS_METHOD, SINGLE_PASS_VERSION, singlePassInput, singlePassOutput, requestSinglePass } from "./aiv2-single-pass.ts";
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
function save(path: string, value: unknown) { mkdirSync(join(path, ".."), { recursive: true }); const temp = path + "." + process.pid + ".tmp"; writeFileSync(temp, JSON.stringify(value) + "\n"); renameSync(temp, path); }
export function auditSingleArtifact(node: Node, output: any) {
  const actions = actionsForSpot(node.spot), metadata = output.metadata;
  if (metadata?.model !== AIV2_MODEL || metadata?.reasoning_effort !== AIV2_REASONING_EFFORT || ![SINGLE_PASS_METHOD, "llm-range-wide-combo-v5"].includes(metadata?.method)) throw new Error("Artifact provenance mismatch " + node.key);
  if (node.spot.unreachable) { if (metadata.status !== "unreachable-placeholder") throw new Error("Placeholder identity mismatch"); return; }
  const policy = decodeCompactPolicy(output.spot, actions);
  if (hash(policy) !== metadata.final_hash || hash(output.reasons) !== metadata.reason_hash || output.spot.id !== node.spot.id) throw new Error("Artifact policy/reason identity mismatch " + node.key);
  const encoded = output.combo_reach_weights?.players?.[node.spot.hero];
  if (encoded && !["hand-class-exact-suit-symmetry", "concrete-combo-exact"].includes(encoded.encoding)) throw new Error("Unknown reach encoding");
  const own = encoded ? Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo, encoded.weights[encoded.encoding === "concrete-combo-exact" ? combo : hand]])) : {};
  if (Object.values(own).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("Invalid reach");
  const display = compressConcretePolicy(expandConcretePolicy(policy, own), actions).map(({ hand, mix, ...rest }) => ({ hand, ...mix, ...rest }));
  if (hash(display) !== hash(output.spot.hands)) throw new Error("Artifact display/physical policy mismatch");
  validateFinalReasons(output.reasons, node.spot.id, Object.keys(policy.combo_overrides).sort());
}
export function isFatalSinglePassError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  return new Set(["quota_or_rate_limit", "authentication_required", "unsupported_model_effort_or_schema", "model_or_effort_mismatch", "unexpected_tool_call", "unexpected_server_request", "protocol_error", "missing_turn", "missing_thread", "overlapping_session_turn", "session_closed_during_turn", "provider_closed"]).has(code) ||
    /quota|authentication|unsupported_model|model_or_effort_mismatch|unexpected_tool_call|protocol_error/i.test(message);
}
export async function runSinglePass(argv: string[]) {
  const graph = buildGraph(join(root, "src/estimated")), consistency = consistencyPlan(graph.nodes);
  const scope = singlePassScope(argv, graph.nodes);
  const directory = join(root, "candidates/aiv2-preflop", SINGLE_PASS_METHOD), statePath = join(directory, "manifest.json");
  const checkpointRoot = join(root, ".local/aiv2-preflop", SINGLE_PASS_METHOD, "checkpoints");
  const artifact = (node: Node) => join(directory, "spots", node.key + ".json");
  const implementationHash = hash(["aiv2-single-pass.ts", "aiv2-single-pass-runner.ts", "aiv2-preflop.ts", "aiv2-preflop-graph.ts", "aiv2-preflop-consistency.ts", "aiv2-preflop-codec.ts", "aiv2-preflop-run-state.ts"].map(file => runtimeCompatibleSource(file, readFileSync(join(root, "scripts", file), "utf8"))));
  if (argv.includes("--status")) { console.log(JSON.stringify(existsSync(statePath) ? read(statePath) : { method: SINGLE_PASS_METHOD, generated_completed: 0, generated_total: 2100 }, null, 2)); return; }
  if (argv.includes("--domain")) { console.log(JSON.stringify({ method: SINGLE_PASS_METHOD, nodes: graph.nodes.length, actionable: 2100, minimum_new_calls_per_scene: 1, max_invalid_response_attempts: 2, production_modified: false })); return; }
  if (!argv.includes("--all") || !argv.includes("--confirm-full-quota")) throw new Error("Use --all --confirm-full-quota; no implicit generation");
  const concurrency = singlePassConcurrency(argv);
  const limit = Number(argv.find(value => value.startsWith("--limit="))?.split("=")[1] ?? "2100");
  if (!Number.isInteger(limit) || limit < 1 || limit > 2100) throw new Error("Invalid concurrency/limit");
  let stop = false, stopped: string | null = null, finished = false, scopeAudit: unknown = null;
  const drain = () => { stop = true; }; process.once("SIGTERM", drain);
  const states: Record<string, any> = {}, outputs = new Map<string, any>(), metrics: any[] = [], pending = new Set(graph.nodes.map(node => node.key));
  const previous = existsSync(statePath) ? read(statePath) : null;
  const failed = new Set<string>(Object.entries<any>(previous?.nodes ?? {}).filter(([, state]) => state.status === "failed").map(([key]) => key));
  const metricsPath = join(directory, "provider-metrics.json");
  if (existsSync(metricsPath)) metrics.push(...read(metricsPath));
  const provider = createAiv2SessionProvider({ concurrency, onMetric: metric => { metrics.push(metric); save(metricsPath, metrics); } });
  const counts = () => { const actionable = graph.nodes.filter(node => !node.spot.unreachable), completed = actionable.filter(node => states[node.key]?.status === "complete"); return { generated_total: 2100, generated_completed: completed.length,
    existing_reused: completed.filter(node => states[node.key].origin === "existing-v5").length, new_single_pass: completed.filter(node => states[node.key].origin === "single-pass-v6").length,
    remaining_actionable: 2100 - completed.length, placeholders_completed: graph.nodes.filter(node => node.spot.unreachable && states[node.key]?.status === "complete").length,
    failed: Object.values(states).filter(value => value.status === "failed").length, running: Object.values(states).filter(value => value.status === "running").length }; };
  const persist = () => save(statePath, { method: SINGLE_PASS_METHOD, version: SINGLE_PASS_VERSION, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT,
    updated_at: new Date().toISOString(), status: stopped ? "blocked-resumable" : stop ? "controlled-draining" : finished ? scope && scopeAudit ? "scope-complete-audited-candidate-not-selectable" : counts().generated_completed === 2100 && counts().placeholders_completed === 16 ? "complete-audited-candidate-not-selectable" : "limit-reached-not-complete" : "running", ...counts(), ...singlePassScopeProgress(scope, states),
    ...(scope ? { scoped_status: scopeAudit ? "complete-audited-candidate-not-selectable" : stopped ? "blocked-resumable" : stop ? "controlled-draining" : finished ? "incomplete" : "running", scope_audit: scopeAudit } : {}), stopped_reason: stopped, nodes: states,
    publication_status: "candidate-not-selectable", production_modified: false, next_github_save_boundary: (Math.floor(counts().generated_completed / 100) + 1) * 100 });
  function contextFor(node: Node) {
    const factors = new Map<string, any[]>(), upstream: any[] = [];
    node.refs.forEach((ref, index) => { const key = node.dependencies[index], prior = outputs.get(key); if (!prior) throw new Error("Missing prerequisite " + key);
      const policy = decodeCompactPolicy(prior.spot, actionsForSpot(graph.byKey.get(key)!.spot));
      const frequenciesByHand = Object.fromEntries(Object.entries(policy.class_mixes).map(([hand, mix]) => [hand, mix[ref.action]]));
      const frequenciesByCombo = Object.fromEntries(Object.entries(policy.combo_overrides).map(([combo, mix]) => [combo, mix[ref.action]]));
      factors.set(ref.seat, [...(factors.get(ref.seat) ?? []), { action: ref.action, frequenciesByHand, frequenciesByCombo }]);
      upstream.push({ ...ref, method: prior.metadata.method, source_hash: prior.metadata.source_hash, final_hash: prior.metadata.final_hash, action_frequencies: frequenciesByHand, combo_action_overrides: frequenciesByCombo }); });
    const weights = Object.fromEntries([...factors].map(([seat, factors]) => [seat, concreteComboReachWeights(factors)]));
    return { upstream, weights, reach: Object.fromEntries(Object.entries(weights).map(([seat, weight]) => [seat, encodeComboReachWeights(weight)])) };
  }
  // Explicit v5 reuse keeps the ORIGINAL artifact/method intact, with a separate adoption receipt.
  const v5Path = join(root, "candidates/aiv2-preflop/llm-range-wide-combo-v5/manifest.json");
  const old = argv.includes("--reuse-validated-v5") && existsSync(v5Path) ? read(v5Path) : null;
  let changed = true;
  while (changed) { changed = false; for (const node of graph.nodes) {
    if (!pending.has(node.key) || !node.dependencies.every(key => outputs.has(key))) continue;
    let output: any, origin: string;
    if (previous?.nodes?.[node.key]?.status === "complete" && existsSync(artifact(node))) { output = read(artifact(node)); origin = previous.nodes[node.key].origin; }
    else if (old?.nodes?.[node.key]?.status === "complete") { output = read(old.nodes[node.key].artifact); origin = "existing-v5"; }
    else continue;
    auditSingleArtifact(node, output);
    if (output.metadata.semantic_identity !== consistency.identities.get(node.key) || output.metadata.upstream_fingerprint !== hash(node.dependencies.map(key => outputs.get(key).metadata.final_hash ?? outputs.get(key).metadata.source_hash))) throw new Error("Reused dependency identity mismatch " + node.key);
    if (output.metadata.method === SINGLE_PASS_METHOD && !node.spot.unreachable) {
      const { upstream, reach } = contextFor(node), input = singlePassInput(node, upstream, reach);
      const expected = hash({ input: input.context, prompt: input.prompt, schema: input.schema, method: SINGLE_PASS_METHOD, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, version: SINGLE_PASS_VERSION, implementationHash });
      if (expected !== output.metadata.source_hash) throw new Error("Completed v6 prompt/context identity changed " + node.key);
    }
    save(artifact(node), output); outputs.set(node.key, output); pending.delete(node.key); states[node.key] = { status: "complete", origin, artifact: artifact(node), original_method: output.metadata.method, artifact_hash: hash(output), original_source_hash: output.metadata.source_hash }; changed = true;
  } }
  persist();
  const active = new Map<string, Promise<void>>();
  async function execute(node: Node) {
    pending.delete(node.key); states[node.key] = { status: "running", phase: "single-response" }; persist();
    try {
      let output: any;
      if (node.spot.unreachable) { output = { spot: { ...scenarioPlaceholder(node), hands: node.spot.hands.map((row: any) => ({ hand: row.hand, ...Object.fromEntries(actionsForSpot(node.spot).map(action => [action, action === "fold" ? 100 : 0])), unreachable: true })), combo_overrides: [] }, metadata: { method: SINGLE_PASS_METHOD, model: AIV2_MODEL, reasoning_effort: AIV2_REASONING_EFFORT, source_hash: hash(node.key), status: "unreachable-placeholder" } }; }
      else {
        const { upstream, weights, reach } = contextFor(node), input = singlePassInput(node, upstream, reach);
        const sourceHash = hash({ input: input.context, prompt: input.prompt, schema: input.schema, method: SINGLE_PASS_METHOD, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, version: SINGLE_PASS_VERSION, implementationHash });
        const checkpoint = join(checkpointRoot, node.key + ".json");
        let result: any;
        if (existsSync(checkpoint)) { result = read(checkpoint); if (result.source_hash !== sourceHash || result.result_hash !== hash(result.raw)) throw new Error("Checkpoint identity changed; no blind regeneration " + node.key); }
        else { const invalid: any[] = []; result = { ...await provider.withSession(session => requestSinglePass(input, session.run, { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, shouldStop: () => stop,
          onInvalid: diagnostic => { invalid.push(diagnostic); save(checkpoint + ".diagnostics.json", invalid); } })), source_hash: sourceHash }; result.result_hash = hash(result.raw); result.base_prompt = input.prompt; result.output_schema = input.schema; save(checkpoint, result); }
        output = singlePassOutput(node, input, result.raw, weights[node.spot.hero] ?? {}, reach, { model: AIV2_MODEL, reasoning_effort: AIV2_REASONING_EFFORT,
          source_hash: sourceHash, prompt_hash: result.prompt_hash, schema_hash: hash(input.schema), implementation_hash: implementationHash, response_hash: result.result_hash, response_attempts: result.attempts });
      }
      output.metadata.semantic_identity = consistency.identities.get(node.key); output.metadata.upstream_fingerprint = hash(node.dependencies.map(key => outputs.get(key).metadata.final_hash ?? outputs.get(key).metadata.source_hash));
      auditSingleArtifact(node, output); save(artifact(node), output); outputs.set(node.key, output); states[node.key] = { status: "complete", origin: "single-pass-v6", artifact: artifact(node), artifact_hash: hash(output), original_method: output.metadata.method };
    } catch (error) { const message = error instanceof Error ? error.message : "generation failed";
      if (message.includes("controlled_stop_requested")) { delete states[node.key]; pending.add(node.key); }
      else { states[node.key] = { status: "failed", phase: "single-response", error: message }; if (isFatalSinglePassError(error)) { stopped = message; stop = true; } }
    } finally { persist(); }
  }
  try { while (pending.size || active.size) {
    if (!stop) {
      const ready = graph.nodes.filter(node => (!scope || scope.allowedKeys.has(node.key)) && pending.has(node.key) && node.dependencies.every(key => outputs.has(key))).sort((a, b) => Number(failed.has(b.key)) - Number(failed.has(a.key)));
      const activeActionable = [...active.keys()].filter(key => !graph.byKey.get(key)!.spot.unreachable).length;
      let actionableSlots = Math.max(0, limit - counts().generated_completed - activeActionable);
      const selected: Node[] = [];
      for (const node of ready) {
        if (selected.length >= concurrency - active.size) break;
        if (!node.spot.unreachable && actionableSlots === 0) continue;
        selected.push(node); if (!node.spot.unreachable) actionableSlots--;
      }
      for (const node of selected) active.set(node.key, execute(node).finally(() => { active.delete(node.key); }));
    }
    if (!active.size) break; await Promise.race(active.values());
  }
  if (scope && singlePassScopeProgress(scope, states).scoped_remaining === 0) {
    try {
      scopeAudit = auditGlobal(graph.nodes.filter(node => scope.allowedKeys.has(node.key)), outputs, consistency.identities);
      save(join(directory, "basic-hu-audit.json"), { scope: scope.name, ...singlePassScopeProgress(scope, states), audit: scopeAudit });
    } catch (error) {
      stopped = "Scoped audit failed: " + (error instanceof Error ? error.message : "unknown audit error");
      save(join(directory, "basic-hu-audit.json"), { scope: scope.name, status: "failed", error: stopped });
    }
  }
  if (counts().generated_completed === 2100 && counts().placeholders_completed === 16) { const audit = auditGlobal(graph.nodes, outputs, consistency.identities); save(join(directory, "global-audit.json"), audit); }
  if (!stopped && stop) stopped = "controlled-stop-requested";
  if (!stopped && counts().failed) stopped = "Failed nodes; bounded retry requires explicit resume";
  finished = true; persist(); console.log(JSON.stringify({ ...counts(), ...singlePassScopeProgress(scope, states), stopped_reason: stopped }));
  } finally { await provider.drain(); process.removeListener("SIGTERM", drain); }
}
const scenarioPlaceholder = (node: Node) => ({ id: node.spot.id, hero: node.spot.hero, history: node.full_history, dataset: node.dataset, unreachable: true });
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runSinglePass(process.argv.slice(2));
