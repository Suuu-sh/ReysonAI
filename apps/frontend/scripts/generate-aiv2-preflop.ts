// Authenticated local generation; candidates never replace the reviewed AI/GTO.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AIV2_MODEL, AIV2_REASONING_EFFORT, AIV2_PREflop_METHOD, CONCRETE_COMBOS, actionsForSpot, compressConcretePolicy,
  concreteComboReachWeights, encodeComboReachWeights, expandConcretePolicy, rangePrompt, rangeAnalysisPrompt, scenarioOnly,
  validateAiv2Policy, validateFinalReasons, validateRangeAnalysis, summarizeConcretePolicy } from "./aiv2-preflop.ts";
import { buildGraph, DATASETS, PROFILE_DATASETS, PROFILES } from "./aiv2-preflop-graph.ts";
import { consistencyPlan, auditGlobal } from "./aiv2-preflop-consistency.ts";
import type { Node, Profile } from "./aiv2-preflop-graph.ts";
import { createAiv2Provider } from "./lib/aiv2-provider.ts";
import { encodeCompactPolicy, decodeCompactPolicy } from "./aiv2-preflop-codec.ts";
import { generationCounts, analysisOutputSchema, analysisDiagnostics } from "./aiv2-preflop-run-state.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const estimated = join(root, "src/estimated");
const candidateRoot = join(root, "candidates/aiv2-preflop", AIV2_PREflop_METHOD);
const checkpoints = join(root, ".local/aiv2-preflop", AIV2_PREflop_METHOD, "all-checkpoints");
const VERSION = "dag-full-history-per-seat-bilingual-v3-exact-defaults-1";
let stopRequested = false;
process.once("SIGTERM", () => { stopRequested = true; });
let sourceActions = new Map<string, string[]>();
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function read(path: string): any { return JSON.parse(readFileSync(path, "utf8")); }
function atomicJson(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + "\n"); renameSync(temp, path);
}
const outputPath = (node: Node) => join(candidateRoot, "spots", node.key + ".json");
const checkpointPath = (node: Node, phase: string) => join(checkpoints, node.key + "." + phase + ".json");
const identity = { method: AIV2_PREflop_METHOD, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, version: VERSION };
// Hash executable prompt/validation/graph source as well as prompt/context: editing
// code can never silently reuse a different semantic generation.
const implementationHash = sha(["generate-aiv2-preflop.ts", "aiv2-preflop.ts", "aiv2-preflop-graph.ts", "aiv2-preflop-consistency.ts", "aiv2-preflop-run-state.ts", "aiv2-preflop-codec.ts"].map(path => readFileSync(join(root, "scripts", path), "utf8")));

function contextsFor(node: Node) {
  const contexts: any[] = [], factors = new Map<string, any[]>();
  node.refs.forEach((ref, index) => {
    const key = node.dependencies[index], path = join(candidateRoot, "spots", key + ".json");
    if (!existsSync(path)) throw new Error("Missing generated prerequisite " + key);
    const prior = read(path);
    if (prior.metadata?.model !== AIV2_MODEL || prior.metadata?.method !== AIV2_PREflop_METHOD || prior.metadata?.reasoning_effort !== AIV2_REASONING_EFFORT)
      throw new Error("Prior provenance mismatch " + key);
    const priorActions = sourceActions.get(key);
    if (!priorActions) throw new Error("Unknown original action columns " + key);
    const exactPolicy = decodeCompactPolicy(prior.spot, priorActions);
    const frequenciesByHand = Object.fromEntries(Object.entries(exactPolicy.class_mixes).map(([hand, mix]) => [hand, mix[ref.action]]));
    const frequenciesByCombo = Object.fromEntries(Object.entries(exactPolicy.combo_overrides).map(([combo, mix]) => [combo, mix[ref.action]]));
    const previous = factors.get(ref.seat) ?? [];
    previous.push({ action: ref.action, frequenciesByHand, frequenciesByCombo }); factors.set(ref.seat, previous);
    contexts.push({ ...ref, source_hash: prior.metadata.source_hash, final_hash: prior.metadata.final_hash,
      action_mixes: prior.spot.hands.map((row: any) => ({ hand: row.hand, frequency: frequenciesByHand[row.hand] })),
      combo_overrides: prior.spot.combo_overrides ?? [] });
  });
  const weights = Object.fromEntries([...factors].map(([seat, list]) => [seat, concreteComboReachWeights(list)]));
  const reach = Object.fromEntries(Object.entries(weights).map(([seat, value]) => [seat, encodeComboReachWeights(value)]));
  return { contexts, weights, reach };
}
type Provider = ReturnType<typeof createAiv2Provider>;
async function createSpot(node: Node, provider: Provider, onPhase: (phase: string, status: string) => void = () => {}, persistOutput = true) {
  const fullHistory = node.full_history;
  const actions = actionsForSpot(node.spot), scenario = { ...scenarioOnly(node.spot), ...(fullHistory.length ? { history: fullHistory } : {}), dataset: node.dataset,
    context_kind: node.profile ? "villain-profile" : "base", ...(node.profile ?? {}) };
  if (node.spot.unreachable) {
    const inputHash = sha({ scenario, actions, identity, implementationHash });
    const output = { spot: { ...scenario, hands: node.spot.hands.map((row: any) => ({ hand: row.hand,
      ...Object.fromEntries(actions.map(action => [action, action === "fold" ? 100 : 0])), unreachable: true })), combo_overrides: [] },
      metadata: { ...identity, reasoning_effort: AIV2_REASONING_EFFORT, source_hash: inputHash, status: "unreachable-placeholder", scenario_id: node.spot.id, publication_status: "candidate-not-selectable" } };
    if (persistOutput) atomicJson(outputPath(node), output); return output as any;
  }
  const phaseOrigins: any[] = [];
  const { contexts, weights, reach } = contextsFor(node);
  if (fullHistory.length) contexts.push({ reach_distribution_model: "Per-player products of that player's conditional actions, not a card-removal-conditioned joint deal distribution. Other players' action factors are supplied separately; never multiply them into the hero's same-combo reach.",
    unresolved_history_events: fullHistory.filter(event => !event.source && event.assumption) });
  const analysisPrompt = rangeAnalysisPrompt({ scenario, actions, context: [...contexts, { exact_per_seat_reach: reach }] });
  const inputHash = sha({ scenario, actions, contexts, reach, identity, implementationHash, analysisPrompt });
  async function phase<T>(name: string, prompt: string, validate: (raw: unknown) => T, outputSchema?: Record<string, unknown>): Promise<T> {
    onPhase(name, "running");
    const path = checkpointPath(node, name), phaseHash = sha({ inputHash, prompt, outputSchema, identity });
    if (existsSync(path)) {
      const saved = read(path);
      let reusable = true;
      if (saved.phase_hash !== phaseHash) {
        const identicalPromptAdoption = process.argv.includes("--adopt-identical-prompts") &&
          saved.method === identity.method && saved.model === identity.model && saved.effort === identity.effort &&
          saved.prompt_hash === sha(prompt);
        if (!identicalPromptAdoption) {
          if (!process.argv.includes("--refresh-changed-prompts")) throw new Error("Stale checkpoint (explicit reset required): " + path);
          atomicJson(path + ".prior-" + String(saved.input_hash).slice(0, 16), saved);
          reusable = false;
        }
        // Explicit audit-only upgrade: reuse only identical base prompt input,
        // never infer equivalence from an old policy/frequency result.
        if (reusable) { saved.prior_checkpoint_identity = { input_hash: saved.input_hash, phase_hash: saved.phase_hash, version: saved.version };
        saved.input_hash = inputHash; saved.phase_hash = phaseHash; saved.version = VERSION;
        atomicJson(path, saved); }
      }
      if (reusable) {
        if (saved.migrated_from) phaseOrigins.push({ phase: name, ...saved.migrated_from });
        const result = validate(saved.result);
        if (saved.result_hash !== sha(result)) throw new Error("Corrupt checkpoint: " + path);
        onPhase(name, "cached"); return result;
      }
    }
    let result: T | undefined, lastError: unknown, effectivePromptHash: string | undefined;
    let lastIssues: string[] = [];
    for (let attempt = 0; attempt < (name === "analysis" ? 3 : 2); attempt++) {
      // Schema retry does not make up missing decisions and is itself a real call.
      const repair = name === "analysis"
        ? "\nThe previous response failed validation: " + lastIssues.join("; ") + ". Regenerate the complete coherent range analysis as exact JSON. Summary <=350 characters, 1..8 themes each <=120 characters, 0..12 distinct canonical concrete blocker notes each <=350 characters. These are character counts, not tokens. No frequencies, no policy, no invented measurements."
        : "\nYour last response failed the required schema. Return the complete exact JSON schema; no prose, no omitted hands.";
      const effectivePrompt = prompt + (attempt ? repair : "");
      if (stopRequested) throw new Error("AIv2 controlled_stop_requested");
      const raw = await provider(effectivePrompt,
        { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, ...(outputSchema ? { outputSchema } : {}) });
      try { result = validate(raw); effectivePromptHash = sha(effectivePrompt); break; } catch (error) {
        lastError = error;
        lastIssues = name === "analysis" ? analysisDiagnostics(raw, node.spot.id) : [error instanceof Error ? error.message : "schema validation failed"];
        const diagnosticPath = path + ".diagnostics.json";
        const diagnostics = existsSync(diagnosticPath) ? read(diagnosticPath) : [];
        diagnostics.push({ at: new Date().toISOString(), phase: name, attempt: attempt + 1, response_hash: sha(raw), issues: lastIssues, output_schema_hash: outputSchema ? sha(outputSchema) : null });
        atomicJson(diagnosticPath, diagnostics);
      }
    }
    if (result === undefined) throw lastError;
    atomicJson(path, { ...identity, input_hash: inputHash, phase_hash: phaseHash, prompt_hash: sha(prompt), effective_prompt_hash: effectivePromptHash, output_schema_hash: outputSchema ? sha(outputSchema) : null, result_hash: sha(result), result });
    onPhase(name, "complete"); return result;
  }
  const analysis = await phase("analysis", analysisPrompt, raw => validateRangeAnalysis(raw, node.spot.id), analysisOutputSchema(node.spot.id));
  const context = [...contexts, { exact_per_seat_reach: reach }];
  const firstPrompt = rangePrompt({ scenario, actions, context, analysis });
  const candidate = await phase("candidate", firstPrompt, raw => validateAiv2Policy(raw, node.spot.id, actions));
  const candidateSummary = summarizeConcretePolicy(expandConcretePolicy(candidate, weights[node.spot.hero] ?? {}), actions);
  const reviewPrompt = rangePrompt({ scenario, actions, context: [...context, { actual_candidate_range_summary: candidateSummary }], analysis, phase: "reevaluate", candidate });
  const finalized = await phase("final-policy", reviewPrompt, raw => validateAiv2Policy(raw, node.spot.id, actions));
  const expanded = expandConcretePolicy(finalized, weights[node.spot.hero] ?? {});
  const rows = compressConcretePolicy(expanded, actions).map(({ hand, mix, ...rest }) => ({ hand, ...mix, ...rest }));
  const exceptions = Object.keys(finalized.combo_overrides).sort();
  const comboOverrides = expanded.filter(row => exceptions.includes(row.combo));
  const finalHash = sha(finalized);
  const reasonPrompt = `Compose explanations ONLY AFTER finalized frequencies, from the persisted analysis and reevaluated policy. AI estimate, not GTO/solver. Never invent numeric EV, equity or solver proof, never alter frequencies. JSON {"scenario_id":${JSON.stringify(node.spot.id)},"reasons":[{"hand":"AA","text":"English explanation","text_ja":"Faithful natural Japanese translation of exactly the same explanation"}...all 169 classes in supplied order],"combo_reasons":[{"combo":"AsKh","text":"...","text_ja":"..."}...exactly the supplied exception order]}. Both languages must retain exactly the same action frequencies and strategic content. Every explanation must be specific to this hand and this scenario; explain mixes, blocker effects only when justified, and practical tradeoffs. No unrelated old policy or old reason is supplied.\nScenario: ${JSON.stringify(scenario)}\nPersisted analysis: ${JSON.stringify(analysis)}\nActions: ${JSON.stringify(actions)}\nFinal classes (exact order): ${JSON.stringify(rows)}\nException order: ${JSON.stringify(exceptions)}\nConcrete exceptions: ${JSON.stringify(comboOverrides)}\nExact per-seat reach: ${JSON.stringify(reach)}`;
  const reasons = await phase("reasons", reasonPrompt, raw => validateFinalReasons(raw, node.spot.id, exceptions));
  const output = { spot: { ...scenario, hands: rows, ...encodeCompactPolicy(finalized) }, reasons,
    combo_reach_weights: { compression: "per-seat-conditional-action-product", players: reach }, metadata: { ...identity,
      reasoning_effort: AIV2_REASONING_EFFORT, source_hash: inputHash, scenario_id: node.spot.id,
      reach_distribution_model: "per-player conditional action product; not joint card-removal-conditioned distribution",
      history_assumptions: fullHistory.filter(event => !event.source && event.assumption),
      storage_format: "exact-class-defaults-v1", implementation_hash: implementationHash, analysis_hash: sha(analysis), candidate_hash: sha(candidate), final_hash: finalHash,
      reason_hash: sha(reasons), prompt_hashes: [sha(analysisPrompt), sha(firstPrompt), sha(reviewPrompt), sha(reasonPrompt)],
      reason_generated_after_finalization: true, concrete_combo_count: expanded.length, decision_count: rows.length,
      actual_range_summary: summarizeConcretePolicy(expanded, actions), status: "complete", ...(phaseOrigins.length ? { migrated_from: phaseOrigins } : {}), publication_status: "candidate-not-selectable" } };
  auditOutput(node, output); if (persistOutput) atomicJson(outputPath(node), output); return output;
}
function auditOutput(node: Node, output: any) {
  const actions = actionsForSpot(node.spot);
  if (output.spot.hands.length !== 169 || output.metadata.model !== AIV2_MODEL || output.metadata.reasoning_effort !== AIV2_REASONING_EFFORT || output.metadata.method !== AIV2_PREflop_METHOD) throw new Error("Candidate identity/coverage failure " + node.key);
  for (const row of output.spot.hands) {
    if (actions.some(action => !Number.isFinite(row[action]) || row[action] < 0 || row[action] > 100) ||
      actions.reduce((sum, action) => sum + row[action], 0) !== 100) throw new Error("Invalid final frequencies " + node.key);
    for (const field of ["ev", "equity", "reason", "reason_ja"]) if (field in row) throw new Error("Legacy row metadata " + node.key);
  }
  if (!node.spot.unreachable) {
    const policy = decodeCompactPolicy(output.spot, actions);
    if (sha(policy) !== output.metadata.final_hash) throw new Error("Stored exact defaults differ from finalized policy " + node.key);
    const encoded = output.combo_reach_weights?.players?.[node.spot.hero];
    let own: Record<string, number> = {};
    if (encoded) {
      if (!["hand-class-exact-suit-symmetry", "concrete-combo-exact"].includes(encoded.encoding)) throw new Error("Unknown own-reach encoding " + node.key);
      own = Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo, encoded.weights[encoded.encoding === "concrete-combo-exact" ? combo : hand]]));
      if (Object.values(own).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("Malformed exact own reach " + node.key);
    }
    const replayRows = compressConcretePolicy(expandConcretePolicy(policy, own), actions).map(({ hand, mix, ...rest }) => ({ hand, ...mix, ...rest }));
    if (sha(replayRows) !== sha(output.spot.hands)) throw new Error("Weighted display disagrees with exact stored physical policy " + node.key);
    validateFinalReasons(output.reasons, node.spot.id, output.spot.combo_overrides.map((row: any) => row.combo).sort());
    if (sha(output.reasons) !== output.metadata.reason_hash) throw new Error("Stored reason hash mismatch " + node.key);
  }
}
export function domainSummary() {
  const graph = buildGraph(estimated), nodes = graph.nodes;
  return { ...identity, dataset_files: DATASETS.length + PROFILES.length * PROFILE_DATASETS.length, nodes: nodes.length,
    actionable: nodes.filter(node => !node.spot.unreachable).length, placeholders: nodes.filter(node => node.spot.unreachable).length,
    edges: nodes.reduce((sum, node) => sum + node.dependencies.length, 0),
    full_history_assumption_occurrences: nodes.reduce((sum, node) => sum + node.full_history.filter(event => !event.source && event.assumption).length, 0),
    nodes_with_history_assumptions: nodes.filter(node => node.full_history.some(event => !event.source && event.assumption)).length,
    reach_distribution_model: "per-player conditional action product approximation, not a joint card-removal-conditioned distribution",
    provider_calls_minimum: nodes.filter(node => !node.spot.unreachable).length * 4,
    phases: ["persisted-analysis", "candidate", "strategic-reevaluation", "post-final-bilingual-reasons"],
    candidate_root: candidateRoot, production_modified: false };
}
async function fullGeneration(argv: string[]) {
  const graph = buildGraph(estimated);
  sourceActions = new Map(graph.nodes.map(node => [node.key, actionsForSpot(node.spot)]));
  const summary = domainSummary();
  const consistency = consistencyPlan(graph.nodes);
  if (argv.includes("--domain")) { console.log(JSON.stringify(summary, null, 2)); return; }
  const statePath = join(candidateRoot, "manifest.json");
  if (argv.includes("--status")) {
    const saved = existsSync(statePath) ? read(statePath) : summary;
    const status = { ...saved, ...generationCounts(graph.nodes, saved.nodes ?? {}) };
    if (argv.includes("--compact")) { delete status.nodes; delete status.semantic_aliases; }
    console.log(JSON.stringify(status, null, 2)); return;
  }
  if (!argv.includes("--confirm-full-quota")) throw new Error("Full generation requires explicit --confirm-full-quota");
  const concurrencyArg = argv.find(arg => arg.startsWith("--concurrency="))?.split("=")[1] ?? "4";
  const concurrency = Number(concurrencyArg);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("Concurrency must be 1..8");
  mkdirSync(candidateRoot, { recursive: true });
  const states: Record<string, any> = {};
  const completeOutputs = new Map<string, any>();
  let globalAudit: unknown = null;
  const metricsPath = join(candidateRoot, "provider-metrics.json");
  const metrics: any[] = existsSync(metricsPath) ? read(metricsPath) : [];
  const provider = createAiv2Provider({ concurrency, onMetric: metric => { metrics.push(metric); atomicJson(metricsPath, metrics); } });
  let stopped: string | null = null;
  const started = new Date().toISOString();
  function save() {
    const statuses = Object.values(states);
    atomicJson(statePath, { ...summary, started_at: started, updated_at: new Date().toISOString(),
      status: stopped ? "blocked-resumable" : statuses.length === graph.nodes.length && statuses.every(value => value.status === "complete") ? "complete-audited-candidate-not-selectable" : "running",
      ...generationCounts(graph.nodes, states), resumed_verified_completed: resumedCompleted, stopped_reason: stopped, consistency_audit: globalAudit, semantic_aliases: Object.fromEntries(consistency.aliases), nodes: states });
  }
  const previous = existsSync(statePath) ? read(statePath) : null;
  const priorFailurePath = join(root, "candidates/aiv2-preflop/llm-range-wide-combo-v4/manifest.json");
  const retrySource = previous ?? (argv.includes("--retry-failed") && existsSync(priorFailurePath) ? read(priorFailurePath) : null);
  const previousFailed = new Set<string>(Object.entries<any>(retrySource?.nodes ?? {}).filter(([, value]) => value.status === "failed").map(([key]) => key));
  let resumedCompleted = 0;
  const pending = new Set(graph.nodes.map(node => node.key));
  if (argv.includes("--migrate-compatible-v4") && AIV2_PREflop_METHOD.endsWith("-v4")) throw new Error("v4 migration requires the reviewed v5 full-history method");
  if (argv.includes("--migrate-compatible-v4")) {
    for (const node of graph.nodes) {
      if (node.spot.unreachable || node.full_history.length || node.dependencies.length) continue;
      const oldRoot = join(root, "candidates/aiv2-preflop/llm-range-wide-combo-v4/spots", node.key + ".json");
      if (!existsSync(oldRoot)) continue;
      const old = read(oldRoot);
      if (old.metadata?.model !== AIV2_MODEL || old.metadata?.reasoning_effort !== AIV2_REASONING_EFFORT ||
          old.metadata?.method !== "llm-range-wide-combo-v4" || (old.spot.history ?? []).length) continue;
      auditOutput(node, { ...old, metadata: { ...old.metadata, method: AIV2_PREflop_METHOD } });
      for (const phase of ["analysis", "candidate", "final-policy", "reasons"]) {
        const destination = checkpointPath(node, phase);
        if (existsSync(destination)) continue;
        const source = join(root, ".local/aiv2-preflop/llm-range-wide-combo-v4/all-checkpoints", node.key + "." + phase + ".json");
        if (!existsSync(source)) continue;
        const saved = read(source);
        if (saved.model !== AIV2_MODEL || saved.effort !== AIV2_REASONING_EFFORT || saved.method !== "llm-range-wide-combo-v4") continue;
        atomicJson(destination, { ...saved, method: AIV2_PREflop_METHOD, migrated_from: {
          method: saved.method, model: saved.model, effort: saved.effort, input_hash: saved.input_hash,
          phase_hash: saved.phase_hash, result_hash: saved.result_hash, prompt_hash: saved.prompt_hash,
          eligibility: "empty-full-history-only; exact-base-prompt-required-on-replay",
        } });
      }
    }
  }
  // Operational upgrades must not regenerate successful policies. Reconstruct
  // every cached phase under the same full history/reach, then preserve its
  // original identity only when all four prompt AND result hashes are identical.
  if (argv.includes("--resume-verified-complete") && previous?.method === AIV2_PREflop_METHOD) {
    const candidates = new Set<string>(Object.entries<any>(previous.nodes ?? {}).filter(([, value]) => value.status === "complete").map(([key]) => key));
    const cacheOnly: Provider = async () => { throw new Error("VERIFIED_REPLAY_CACHE_MISS"); };
    while (candidates.size) {
      const ready = graph.nodes.filter(node => candidates.has(node.key) && node.dependencies.every(key => states[key]?.status === "complete"));
      if (!ready.length) throw new Error("Prior completed cache has missing/changed prerequisites; refusing blind adoption");
      for (const node of ready) {
        candidates.delete(node.key);
        const prior = read(outputPath(node));
        auditOutput(node, prior);
        const output = await createSpot(node, cacheOnly, () => {}, false);
        const fields = ["analysis_hash", "candidate_hash", "final_hash", "reason_hash"];
        if (!node.spot.unreachable && (fields.some(field => output.metadata[field] !== prior.metadata[field]) ||
            sha(output.metadata.prompt_hashes) !== sha(prior.metadata.prompt_hashes)))
          throw new Error("Prior completed prompt/policy changed: " + node.key);
        const withoutStorage = (spot: Record<string, unknown>) => {
          const { class_defaults: _defaults, class_default_actions: _columns, ...rest } = spot; return rest;
        };
        if (sha(withoutStorage(output.spot)) !== sha(withoutStorage(prior.spot)) ||
            (!node.spot.unreachable && sha(decodeCompactPolicy(output.spot, actionsForSpot(node.spot))) !== sha(decodeCompactPolicy(prior.spot, actionsForSpot(node.spot)))) ||
            sha(output.combo_reach_weights ?? null) !== sha(prior.combo_reach_weights ?? null))
          throw new Error("Prior completed full-history/exact-policy/reach output changed: " + node.key);
        output.metadata = { ...prior.metadata, storage_format: "exact-class-defaults-v1", storage_implementation_hash: implementationHash, revalidated_by_version: VERSION, revalidated_implementation_hash: implementationHash,
          revalidated_input_hash: output.metadata.source_hash };
        output.metadata.semantic_identity = consistency.identities.get(node.key);
        output.metadata.upstream_fingerprint = sha(node.dependencies.map(key => completeOutputs.get(key).metadata.final_hash ?? completeOutputs.get(key).metadata.source_hash));
        atomicJson(outputPath(node), output); completeOutputs.set(node.key, output);
        states[node.key] = { ...previous.nodes[node.key], status: "complete", verified_cache_replay: true };
        pending.delete(node.key); resumedCompleted++;
      }
    }
  }
  save();
  const active = new Map<string, Promise<void>>();
  const executeNode = async (node: Node) => {
    pending.delete(node.key); states[node.key] = { status: "running" }; save();
    try {
      const alias = consistency.aliases.get(node.key);
      const output = alias ? structuredClone(completeOutputs.get(alias)) : await createSpot(node, provider, (phase, status) => {
        states[node.key].current_phase = phase; states[node.key].phases ??= {}; states[node.key].phases[phase] = status; save();
      });
      if (alias) { output.spot.id = node.spot.id; output.metadata.scenario_id = node.spot.id; output.metadata.canonical_alias = alias; if(output.reasons) output.reasons.scenario_id = node.spot.id; }
      output.metadata.semantic_identity = consistency.identities.get(node.key);
      output.metadata.upstream_fingerprint = sha(node.dependencies.map(key => completeOutputs.get(key).metadata.final_hash ?? completeOutputs.get(key).metadata.source_hash));
      auditOutput(node, output); atomicJson(outputPath(node), output); completeOutputs.set(node.key, output);
      states[node.key] = { ...states[node.key], status: "complete", source_hash: output.metadata.source_hash,
        final_hash: output.metadata.final_hash ?? null, compatible_migrated: !!output.metadata.migrated_from, artifact: outputPath(node) };
      console.log(JSON.stringify({ event: "complete", key: node.key, ...generationCounts(graph.nodes, states) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("controlled_stop_requested")) {
        delete states[node.key]; pending.add(node.key); stopped = "controlled-stop-requested; saved phases are resumable"; return;
      }
      const phase = states[node.key].current_phase;
      states[node.key] = { ...states[node.key], status: "failed", error: message, at: new Date().toISOString() };
      if (phase) states[node.key].phases[phase] = "failed";
      console.error(JSON.stringify({ event: "failed", key: node.key, phase, error: message }));
      if (/quota|rate.?limit|usage.?limit|exhausted|insufficient|model.*unavailable|unsupported.*model|authentication_required/i.test(message)) stopped = message;
    } finally { save(); }
  };
  while ((pending.size || active.size) && !stopped) {
    if (stopRequested) { stopped = "controlled-stop-requested; saved phases are resumable"; break; }
    const ready = graph.nodes.filter(node => pending.has(node.key) && node.dependencies.every(key => states[key]?.status === "complete") &&
      (!consistency.aliases.has(node.key) || states[consistency.aliases.get(node.key)!]?.status === "complete"));
    if (argv.includes("--retry-failed")) ready.sort((a, b) => Number(previousFailed.has(b.key)) - Number(previousFailed.has(a.key)));
    for (const node of ready.slice(0, concurrency - active.size)) {
      const task = executeNode(node).finally(() => active.delete(node.key));
      active.set(node.key, task);
    }
    if (!active.size) { stopped = "No ready nodes: failed prerequisites; inspect per-node phase diagnostics"; break; }
    await Promise.race(active.values());
  }
  // Drain real in-flight requests and persist their phases before quota stop.
  await Promise.all(active.values());
  if (pending.size && !stopped) stopped = "Unfinished dependencies";
  if (Object.values(states).some(value => value.status === "failed") && !stopped) stopped = "Failed nodes; rerun to retry persisted phases";
  if (!stopped) {
    // Publish a complete file only after every node has passed numeric and
    // bilingual audit; candidate directory is not imported by production.
    globalAudit = auditGlobal(graph.nodes, completeOutputs, consistency.identities);
    for (const [path] of graph.datasets) {
      const nodes = graph.nodes.filter(node => (node.profile ? `profiles/${node.profile.profile}/${node.profile.role}/` : "") + node.dataset === path);
      const outputs = nodes.map(node => { const output = read(outputPath(node)); auditOutput(node, output); return output; });
      atomicJson(join(candidateRoot, "datasets", path + ".json"), { metadata: { ...identity, publication_status: "complete-audited-candidate-not-selectable" }, spots: outputs });
    }
  }
  save();
  console.log(JSON.stringify({ manifest: statePath, status: stopped ? "blocked-resumable" : "complete", ...generationCounts(graph.nodes, states), stopped_reason: stopped }));
  if (stopped) process.exitCode = 1;
}
async function main(argv: string[]) {
  if (!argv.some(arg => ["--domain", "--status", "--all"].includes(arg))) throw new Error("Usage: --domain | --status | --all --confirm-full-quota [--concurrency=4] [--adopt-identical-prompts] [--refresh-changed-prompts] [--resume-verified-complete] [--migrate-compatible-v4] [--retry-failed]");
  await fullGeneration(argv);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
