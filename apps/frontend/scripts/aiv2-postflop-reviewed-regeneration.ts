// Three explicitly selected replacement decisions, never an original-cache overwrite.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { postflopHash, decisionIdentity, advancePostflopDecision, postflopPrompt, postflopResponseSchema, validatePostflopResponse, buildPostflopArtifact, validatePostflopArtifact } from "./aiv2-postflop.ts";
import type { DecisionArtifact, DecisionInput } from "./aiv2-postflop.ts";
import { createAiv2SessionProvider } from "./lib/aiv2-provider-session.ts";
import type { SessionMetric } from "./lib/aiv2-provider-session.ts";
export const REGEN_VERSION = "review-bound-three-decision-checkthrough-v1";
export const REGEN_REVIEW_SHA = "7729cfcf3aa919e0cd9d94de0fa8b7ff73500de15d88d982415fed0e2ab2ed88";
export const REGEN_DIAGNOSTIC_ID = "14a8d2662b98717176516bbc74a455cf3b8811f984267a113dbcecb0fb3d2e89";
export const REGEN_DIAGNOSTIC_SHA = "4f907d7f1c68669bc6b0a622d4d8880d223c7d3627e59b95b2b235e7119ae98e";
export const REGEN_ROOT_PARENT = "52ef028be959308231f9123c14d061d783a33c8db3e987246a8f28f03e767b4e";
export const REGEN_STAGES = [
  { stage: "turn-btn", original_id: "db36b233b2a0234cc36b87999597bc64c53e80525c99f604889faa38870ec445", parent_stage: null, next_card: null, street: "turn", actor: "BTN", board: "As7d2c9h" },
  { stage: "river-bb", original_id: "6f9b28e4a8b7e1c30d4f4a1da188d013e2ca9528bb40b02f67676edbccfd5af2", parent_stage: "turn-btn", next_card: "3s", street: "river", actor: "BB", board: "As7d2c9h3s" },
  { stage: "river-btn", original_id: "744fb2ef8bb0a5fd9e0f5d5a59538eddfafdd7545538dafda31f242432353e7f", parent_stage: "river-bb", next_card: null, street: "river", actor: "BTN", board: "As7d2c9h3s" },
] as const;
export type RegenStage = typeof REGEN_STAGES[number]["stage"];
const root = fileURLToPath(new URL("../../../", import.meta.url));
const frontend = join(root, "apps/frontend");
const candidate = join(frontend, "candidates/aiv2-postflop/llm-postflop-single-response-v1");
const rawHash = (raw: string | Uint8Array) => createHash("sha256").update(raw).digest("hex");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export function reviewedRegenerationPlan() {
  const reportRaw = readFileSync(join(root, "docs/qa/aiv2-postflop-checkthrough-review.json"), "utf8");
  const diagnosticRaw = readFileSync(join(candidate, "reason-amendments/diagnostics", REGEN_DIAGNOSTIC_ID + ".json"), "utf8");
  if (rawHash(reportRaw) !== REGEN_REVIEW_SHA || rawHash(diagnosticRaw) !== REGEN_DIAGNOSTIC_SHA) throw new Error("Bound regeneration review/diagnostic changed");
  const report = JSON.parse(reportRaw), diagnostic = JSON.parse(diagnosticRaw), { revision_id, ...body } = diagnostic;
  if (report.approved !== false || postflopHash(body) !== revision_id || revision_id !== REGEN_DIAGNOSTIC_ID || diagnostic.source_response.assessment !== "policy-change-required" || diagnostic.approval_status !== "requires-policy-regeneration" || diagnostic.base.decision_id !== REGEN_STAGES[0].original_id || diagnostic.provenance.confirmed_model !== "gpt-6.1-sol" || diagnostic.provenance.confirmed_effort !== "medium") throw new Error("A reason-only or unbound diagnostic cannot authorize policy regeneration");
  const implementation_hash = postflopHash({ version: REGEN_VERSION, source_texts: ["aiv2-postflop.ts", "aiv2-postflop-reviewed-regeneration.ts"].map(f => readFileSync(join(frontend, "scripts", f), "utf8")), review_raw_sha256: REGEN_REVIEW_SHA, diagnostic_raw_sha256: REGEN_DIAGNOSTIC_SHA });
  const plan = { schema_version: "aiv2-postflop-reviewed-regeneration-plan-v1", version: REGEN_VERSION, implementation_hash, model: "gpt-6.1-sol", effort: "medium", review_raw_sha256: REGEN_REVIEW_SHA, diagnostic_id: REGEN_DIAGNOSTIC_ID, diagnostic_raw_sha256: REGEN_DIAGNOSTIC_SHA, unaffected_parent_id: REGEN_ROOT_PARENT, board_runout: "As7d2c9h3s", stages: REGEN_STAGES, publication_status: "pending-independent-review" };
  return { plan, run_id: postflopHash(plan), report, diagnostic };
}
function originalArtifact(id: string, report: any) {
  const entry = report.artifacts.find((e: any) => e.decision_id === id); if (!entry) throw new Error("Original is outside the bound review inventory");
  const raw = readFileSync(join(candidate, "decisions", id + ".json"), "utf8");
  if (rawHash(raw) !== entry.raw_file_sha256) throw new Error("Original artifact raw identity changed");
  return { artifact: JSON.parse(raw) as DecisionArtifact, raw_sha256: rawHash(raw) };
}
export function prepareReviewedRegeneration(stage: RegenStage, storageRoot?: string) {
  const shared = reviewedRegenerationPlan(), spec = REGEN_STAGES.find(s => s.stage === stage);
  if (!spec) throw new Error("Stage is outside the three approved replacements");
  const directory = storageRoot ?? join(candidate, "reviewed-regeneration", shared.run_id);
  const old = originalArtifact(spec.original_id, shared.report);
  let parent: DecisionArtifact, parentRaw: string;
  if (spec.parent_stage === null) {
    const frozen = originalArtifact(REGEN_ROOT_PARENT, shared.report); parent = frozen.artifact;
    parentRaw = readFileSync(join(candidate, "decisions", REGEN_ROOT_PARENT + ".json"), "utf8");
    validatePostflopArtifact(parent);
  } else {
    const preparedParent = prepareReviewedRegeneration(spec.parent_stage, storageRoot);
    if (!existsSync(preparedParent.artifact_path) || !existsSync(preparedParent.record_path)) throw new Error("Missing NEW reviewed-regeneration parent: " + spec.parent_stage);
    parentRaw = readFileSync(preparedParent.artifact_path, "utf8"); parent = JSON.parse(parentRaw);
    validateSavedRegeneration(read(preparedParent.record_path), parentRaw, preparedParent);
  }
  const transition = advancePostflopDecision(parent, "check", spec.next_card ?? undefined);
  if (transition.status !== "decision") throw new Error("Selected saved check has zero reach or no valid continuing decision");
  const input: DecisionInput = transition.input;
  if (input.street !== spec.street || input.actor !== spec.actor || input.board !== spec.board) throw new Error("Regeneration escaped the approved public path");
  const decision_id = decisionIdentity(input, shared.plan.implementation_hash), schema = postflopResponseSchema(input, decision_id);
  const reviewContext = { review_raw_sha256: REGEN_REVIEW_SHA, findings: shared.report.findings, terminal_diagnostic_id: REGEN_DIAGNOSTIC_ID, terminal_assessment: shared.diagnostic.source_response,
    previous_policy_id: old.artifact.decision_id, previous_policy_is_NOT_a_frequency_target: true, complete_previous_policy_and_reasons: old.artifact.source_response };
  const prompt = postflopPrompt(input, decision_id) + "\nThis is a NEW complete policy regeneration, not a reason-only amendment. Reconsider the entire two-player strategy from the CURRENT exact live ranges and public history. Freely change all frequencies and bilingual reasons; old policy and critique are inputs for critical reassessment, never fixed targets. The critique is an AI review hypothesis, NOT solver/GTO proof. You may assign zero to any size. Do NOT force bluffs into every size, a pot-size bluff quota, or a particular 85s betting frequency. Correct fact: on As7d2c9h every85s has a gutshot completed by any6; do not invent a flush draw. An A-high board cannot have an overpair. On later nodes recompute range statements from CURRENT ranges, not old exclusive-combo claims. Produce only the original full postflop response schema already specified, all positive actor combos exactly once, concise faithful EN/JA; no separate review response.\nBound previous-policy/review context: " + JSON.stringify(reviewContext);
  return { ...shared, spec, directory, old, parent: { decision_id: parent.decision_id, raw_sha256: rawHash(parentRaw), policy_hash: parent.metadata.policy_hash, action: "check", next_card: spec.next_card }, input, decision_id, prompt, schema,
    artifact_path: join(directory, "decisions", decision_id + ".json"), record_path: join(directory, "generation-revisions", decision_id + ".json") };
}
export type ReviewedRegenerationContext = ReturnType<typeof prepareReviewedRegeneration>;
export function buildRegenerationRecord(context: ReviewedRegenerationContext, artifactRaw: string, metric: SessionMetric, effectivePrompt = context.prompt, attempts = 1) {
  const artifact = validatePostflopArtifact(JSON.parse(artifactRaw));
  if (artifact.decision_id !== context.decision_id || postflopHash(artifact.input) !== postflopHash(context.input) || artifact.metadata.implementation_hash !== context.plan.implementation_hash) throw new Error("New regeneration artifact/input mismatch");
  if (metric.status !== "completed" || metric.confirmedModel !== "gpt-6.1-sol" || metric.confirmedEffort !== "medium" || metric.model !== "gpt-6.1-sol" || metric.effort !== "medium" || !metric.threadId || !metric.turnId) throw new Error("Actual regeneration model/effort/thread/turn attestation required");
  if (![1, 2].includes(attempts) || (attempts === 1 ? effectivePrompt !== context.prompt : !effectivePrompt.startsWith(context.prompt + "\nPrevious response failed numeric/shape validation:"))) throw new Error("Unbound effective regeneration prompt");
  const body = { schema_version: "aiv2-postflop-generation-revision-v1", run_id: context.run_id, version: REGEN_VERSION, stage: context.spec.stage,
    original_decision_id: context.old.artifact.decision_id, original_raw_file_sha256: context.old.raw_sha256, new_decision_id: artifact.decision_id, new_raw_file_sha256: rawHash(artifactRaw),
    implementation_hash: context.plan.implementation_hash, failed_review_raw_sha256: REGEN_REVIEW_SHA, terminal_diagnostic_id: REGEN_DIAGNOSTIC_ID, terminal_diagnostic_raw_sha256: REGEN_DIAGNOSTIC_SHA,
    parent: context.parent, input_hash: artifact.metadata.input_hash, response_hash: artifact.metadata.response_hash, policy_hash: artifact.metadata.policy_hash,
    request: { base_prompt: context.prompt, effective_prompt: effectivePrompt, output_schema: context.schema, base_prompt_hash: postflopHash(context.prompt), effective_prompt_hash: postflopHash(effectivePrompt), schema_hash: postflopHash(context.schema), attempts },
    provider: { requested_model: metric.model, requested_effort: metric.effort, confirmed_model: metric.confirmedModel, confirmed_effort: metric.confirmedEffort, thread_id: metric.threadId, turn_id: metric.turnId },
    coverage: "one-replacement-decision-on-approved-checkthrough-runout", publication_status: "pending-independent-review" };
  return { ...body, record_id: postflopHash(body) };
}
export type GenerationRevision = ReturnType<typeof buildRegenerationRecord>;
export function validateSavedRegeneration(record: GenerationRevision, artifactRaw: string, context: ReviewedRegenerationContext) {
  const { record_id, ...body } = record;
  if (postflopHash(body) !== record_id || record.schema_version !== "aiv2-postflop-generation-revision-v1" || record.run_id !== context.run_id || record.new_raw_file_sha256 !== rawHash(artifactRaw) || record.stage !== context.spec.stage || record.publication_status !== "pending-independent-review") throw new Error("Immutable regeneration receipt changed");
  const expected = buildRegenerationRecord(context, artifactRaw, { model: record.provider.requested_model, effort: record.provider.requested_effort, confirmedModel: record.provider.confirmed_model, confirmedEffort: record.provider.confirmed_effort, threadId: record.provider.thread_id, turnId: record.provider.turn_id, status: "completed", attempt: 1, queueMs: 0, elapsedMs: 0, transport: "pooled-app-server", processStarted: false, sessionTurn: 1, promptBytes: 0 }, record.request.effective_prompt, record.request.attempts);
  if (postflopHash(expected) !== postflopHash(record)) throw new Error("Saved regeneration parent/prompt/model/source binding changed");
  return JSON.parse(artifactRaw) as DecisionArtifact;
}
function exclusiveJson(path: string, value: unknown) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, JSON.stringify(value) + "\n", { flag: "wx" }); }
export async function runReviewedRegeneration(argv: string[]) {
  const requested = argv.find(a => a.startsWith("--stage="))?.slice("--stage=".length);
  if (!requested) {
    if (argv.includes("--generate")) throw new Error("One exact --stage is required");
    const { plan, run_id } = reviewedRegenerationPlan(); console.log(JSON.stringify({ status: "dry-no-generation", run_id, plan })); return;
  }
  if (!REGEN_STAGES.some(s => s.stage === requested)) throw new Error("Unapproved regeneration stage");
  const context = prepareReviewedRegeneration(requested as RegenStage);
  const info = { run_id: context.run_id, stage: requested, decision_id: context.decision_id, path: context.artifact_path, record_path: context.record_path, implementation_hash: context.plan.implementation_hash, parent: context.parent, prompt_bytes: Buffer.byteLength(context.prompt), actor: context.input.actor, street: context.input.street, board: context.input.board, reached_combos: Object.values(context.input.ranges[context.input.actor]).filter(w => w > 0).length };
  if (existsSync(context.artifact_path) || existsSync(context.record_path)) {
    if (!existsSync(context.artifact_path) || !existsSync(context.record_path)) throw new Error("Incomplete immutable regeneration pair; no implicit overwrite/replay");
    validateSavedRegeneration(read(context.record_path), readFileSync(context.artifact_path, "utf8"), context); console.log(JSON.stringify({ ...info, status: "saved-pending-independent-review" })); return;
  }
  if (!argv.includes("--generate")) { console.log(JSON.stringify({ ...info, status: "not-generated", ...(argv.includes("--prompt") ? { prompt: context.prompt, schema: context.schema } : {}) })); return; }
  if (!argv.includes("--confirm-one-reviewed-decision")) throw new Error("Use --generate --confirm-one-reviewed-decision");
  const planPath = join(context.directory, "run-plan.json");
  if (existsSync(planPath)) { if (postflopHash(read(planPath)) !== postflopHash(context.plan)) throw new Error("Immutable regeneration plan changed"); }
  else exclusiveJson(planPath, context.plan);
  let stop = false, effectivePrompt = context.prompt, attempts = 0;
  const drain = () => { stop = true; }; process.once("SIGTERM", drain);
  const metrics: SessionMetric[] = [], provider = createAiv2SessionProvider({ concurrency: 1, onMetric: metric => metrics.push(metric) });
  try {
    const raw = await provider.withSession(async session => {
      let issue = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        if (stop) throw new Error("controlled_stop_requested"); attempts = attempt + 1;
        effectivePrompt = context.prompt + (attempt ? "\nPrevious response failed numeric/shape validation: " + issue + ". Return the COMPLETE exact policy+ENJA JSON; no missing combos or extra keys." : "");
        let value: unknown;
        try { value = await session.run(effectivePrompt, { model: "gpt-6.1-sol", effort: "medium", outputSchema: context.schema }); }
        catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "invalid_json") throw error; issue = "invalid JSON"; continue; }
        try { validatePostflopResponse(value, context.input, context.decision_id); return value; }
        catch (error) { issue = error instanceof Error ? error.message : "invalid response"; }
      }
      throw new Error("Bounded reviewed-regeneration validation failed: " + issue);
    });
    const fresh = prepareReviewedRegeneration(requested as RegenStage);
    if (postflopHash(fresh.input) !== postflopHash(context.input) || fresh.run_id !== context.run_id) throw new Error("Regeneration sources/parent changed during inference");
    const artifact = buildPostflopArtifact(context.input, raw, context.plan.implementation_hash), artifactRaw = JSON.stringify(artifact) + "\n";
    const metric = metrics.at(-1); if (!metric) throw new Error("Missing actual provider attestation");
    const record = buildRegenerationRecord(context, artifactRaw, metric, effectivePrompt, attempts);
    exclusiveJson(context.artifact_path, artifact); exclusiveJson(context.record_path, record);
    console.log(JSON.stringify({ ...info, status: "saved-pending-independent-review", record_id: record.record_id, new_raw_file_sha256: record.new_raw_file_sha256, metrics }));
  } finally { await provider.drain(); process.removeListener("SIGTERM", drain); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runReviewedRegeneration(process.argv.slice(2));
