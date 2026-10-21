// Presentation-only immutable revisions. Never mutate a base policy or a child reference.
import { createHash } from "node:crypto";
import { postflopHash } from "./aiv2-postflop.ts";
import type { DecisionArtifact } from "./aiv2-postflop.ts";
import type { SessionMetric } from "./lib/aiv2-provider-session.ts";
export const AMENDMENT_METHOD = "aiv2-postflop-reason-amendment-v1";
export const AMENDMENT_VERSION = "three-bound-findings-v1";
export const FAILED_REVIEW_SHA256 = "7729cfcf3aa919e0cd9d94de0fa8b7ff73500de15d88d982415fed0e2ab2ed88";
export const AMENDMENT_TARGETS = [
  { decision_id: "db36b233b2a0234cc36b87999597bc64c53e80525c99f604889faa38870ec445", raw_file_sha256: "01d858b35c9a0023a7ae80665df49b82838244347afbd7b160d3d2cfcc9a8f64", finding_id: "turn-btn-85s-straight-completion", kind: "combo-reasons", combos: ["8s5s", "8h5h", "8d5d", "8c5c"], facts: "On As7d2c9h, every 85s has a one-card straight completion: any 6 makes 5-6-7-8-9. The original claim of no one-card straight completion is false. Consider actual suits and blockers separately; do not invent a flush draw. The saved mix for all four combos is check100. Assess whether that mix still makes sense given the corrected draw fact and BOTH complete ranges; you are free to require a policy change instead of defending it." },
  { decision_id: "6f9b28e4a8b7e1c30d4f4a1da188d013e2ca9528bb40b02f67676edbccfd5af2", raw_file_sha256: "367a6df2585a131b378e30bc900b14a342f9fb37dce6512af632ba1acdaee876", finding_id: "river-bb-overpair-terminology", kind: "summary", combos: [], facts: "On As7d2c9h3s, an overpair is impossible: no pocket rank exceeds the board ace. The original summary's claim of many BTN overpairs is incorrect. Reassess the complete two live ranges and current saved policy before deciding whether terminology-only correction is sufficient. Do not mechanically replace it with an unsupported range claim." },
  { decision_id: "744fb2ef8bb0a5fd9e0f5d5a59538eddfafdd7545538dafda31f242432353e7f", raw_file_sha256: "8ab9e92341ede9ca82a4e13d38857251f3b92092e7c831109fe93bf60ede37ef", finding_id: "river-btn-overpair-terminology", kind: "summary", combos: [], facts: "On As7d2c9h3s, an overpair is impossible: no pocket rank exceeds the board ace. The original summary's high-overpair wording is incorrect. Reassess both complete live ranges and current saved policy. The review found BTN-only54 consistent with saved BB check conditioning; do not confuse that claim with overpairs. Require policy regeneration if correcting facts changes any frequency." },
] as const;
export const rawSha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export function frequencyOnlyDigest(a: DecisionArtifact) {
  return postflopHash({ decision_id: a.decision_id, input_hash: a.metadata.input_hash, legal_actions: a.legal_actions,
    combos: a.combos.map(({ combo, hand, reach_weight, mix }) => ({ combo, hand, reach_weight, mix })) });
}
const exact = (value: any, keys: string[], label: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error(label + ": exact keys required");
};
const bilingual = (value: any) => {
  exact(value, ["text", "text_ja"], "bilingual text");
  if ([value.text, value.text_ja].some(v => typeof v !== "string" || !v.trim() || v.length > 1800)) throw new Error("Missing/oversized bilingual text");
};
export function prepareReasonAmendment(baseRaw: string, reportRaw: string, implementationHash: string) {
  if (rawSha256(reportRaw) !== FAILED_REVIEW_SHA256 || !/^[a-f0-9]{64}$/.test(implementationHash)) throw new Error("Review/implementation identity changed");
  const original = JSON.parse(baseRaw) as DecisionArtifact, report = JSON.parse(reportRaw);
  const target = AMENDMENT_TARGETS.find(t => t.decision_id === original.decision_id);
  if (!target || rawSha256(baseRaw) !== target.raw_file_sha256 || report.approved !== false || !report.findings?.some((f: any) => f.id === target.finding_id && f.decision_id === target.decision_id && f.artifact_raw_file_sha256 === target.raw_file_sha256)) throw new Error("Unreviewed or changed original decision");
  if (original.metadata.model !== "gpt-6.1-sol" || original.metadata.reasoning_effort !== "medium" || postflopHash(original.input) !== original.metadata.input_hash || postflopHash(original.source_response) !== original.metadata.response_hash || postflopHash(original.combos) !== original.metadata.policy_hash) throw new Error("Original policy provenance changed");
  const base = { decision_id: original.decision_id, raw_file_sha256: target.raw_file_sha256, policy_hash: original.metadata.policy_hash, input_hash: original.metadata.input_hash, response_hash: original.metadata.response_hash, frequency_only_sha256: frequencyOnlyDigest(original) };
  const scope = { kind: target.kind, combos: [...target.combos] };
  const resolved_finding_ids = [target.finding_id];
  const request = { method: AMENDMENT_METHOD, version: AMENDMENT_VERSION, model: "gpt-6.1-sol", effort: "medium", implementation_hash: implementationHash, base, original_failed_review_sha256: FAILED_REVIEW_SHA256, scope, resolved_finding_ids };
  const request_id = postflopHash(request);
  const ranges = Object.fromEntries(Object.entries(original.input.ranges).map(([seat, weights]) => {
    const groups = new Map<number, string[]>();
    for (const [combo, weight] of Object.entries(weights)) if (weight > 0) groups.set(weight, [...(groups.get(weight) ?? []), combo]);
    return [seat, [...groups].map(([weight, combos]) => ({ weight, combos }))];
  }));
  const { ranges: _ranges, ...state } = original.input;
  const prompt = [
    "Review ONE already-saved exact HU decision and its complete current policy against corrected facts. This is a NEW post-generation reason review, NOT the original frequency/reason response. No tools, files, solver/GTO or invented numerical EV/equity. Use gpt-6.1-sol medium. Consider BOTH full live ranges jointly, all current frequencies, exact board/history, blockers and value/bluff balance; do not assess only the target hands in isolation.",
    "You have two equally valid outcomes: reason-only ONLY if ALL original frequencies across the COMPLETE policy remain defensible after the factual correction; otherwise policy-change-required. Never defend a bad frequency merely to preserve a saved history. policy-change-required is a valid terminal result, not a schema error and will NOT trigger forced unchanged-frequency repair.",
    "Return ONLY this new schema (do not use the original postflop response format): {request_id,assessment:'reason-only'|'policy-change-required',unchanged_all_frequencies:boolean,explanation:{text,text_ja},summary_patch:null|{text,text_ja},combo_patches:[{combo,mix,text,text_ja}]}. Both languages must be faithful. Keep concise while retaining strategic specificity. No other keys.",
    "If policy-change-required: unchanged_all_frequencies=false, summary_patch=null, combo_patches=[], and explanation states the necessary strategic reassessment. Do NOT write a replacement policy in this request.",
    target.kind === "combo-reasons" ? "If reason-only: unchanged_all_frequencies=true; summary_patch=null; combo_patches must contain EXACTLY these four combos in this order: " + target.combos.join(",") + ". Each mix must be exactly its original full action mix; revise only its EN/JA reason. Every other reason, input, frequency and summary is untouched." : "If reason-only: unchanged_all_frequencies=true; summary_patch contains the corrected complete EN/JA range summary; combo_patches=[]; do not modify any per-combo reason, frequency or input.",
    "Corrected facts: " + target.facts,
    "Request identity: " + JSON.stringify({ request_id, ...request }),
    "Common complete context: " + JSON.stringify({ state, ranges, legal_actions: original.legal_actions, complete_current_policy_and_reasons: original.source_response }),
  ].join("\n");
  const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
  const prose = { type: "string", minLength: 1, maxLength: 1800 }, pair = obj({ text: prose, text_ja: prose });
  const schema = obj({ request_id: { type: "string", const: request_id }, assessment: { type: "string", enum: ["reason-only", "policy-change-required"] }, unchanged_all_frequencies: { type: "boolean" }, explanation: pair,
    summary_patch: { anyOf: [{ type: "null" }, pair] }, combo_patches: { type: "array", maxItems: 4, items: obj({ combo: { type: "string", enum: ["8s5s", "8h5h", "8d5d", "8c5c"] }, mix: obj(Object.fromEntries(original.legal_actions.map(a => [a.action, { type: "integer", minimum: 0, maximum: 100 }]))), text: prose, text_ja: prose }) } });
  return { original, target, base, scope, resolved_finding_ids, request, request_id, prompt, schema };
}
export type AmendmentContext = ReturnType<typeof prepareReasonAmendment>;
export type AmendmentResponse = { request_id: string; assessment: "reason-only" | "policy-change-required"; unchanged_all_frequencies: boolean; explanation: {text: string; text_ja: string}; summary_patch: null | {text: string; text_ja: string}; combo_patches: Array<{combo: string; mix: Record<string, number>; text: string; text_ja: string}> };
export function validateReasonAmendmentResponse(raw: unknown, context: AmendmentContext): AmendmentResponse {
  const r = raw as AmendmentResponse;
  exact(r, ["request_id", "assessment", "unchanged_all_frequencies", "explanation", "summary_patch", "combo_patches"], "amendment response");
  if (r.request_id !== context.request_id || !["reason-only", "policy-change-required"].includes(r.assessment) || typeof r.unchanged_all_frequencies !== "boolean" || !Array.isArray(r.combo_patches)) throw new Error("Amendment identity/assessment mismatch");
  bilingual(r.explanation);
  if (r.assessment === "policy-change-required") {
    if (r.unchanged_all_frequencies || r.summary_patch !== null || r.combo_patches.length) throw new Error("Policy-change assessment must not contain an applicable reason overlay");
    return r;
  }
  if (!r.unchanged_all_frequencies) throw new Error("Unchanged complete policy confirmation required");
  if (context.scope.kind === "summary") {
    bilingual(r.summary_patch); if (r.combo_patches.length) throw new Error("Summary amendment cannot change combo reasons");
  } else {
    if (r.summary_patch !== null || r.combo_patches.length !== 4) throw new Error("Exactly four combo reason amendments required");
    for (let i = 0; i < context.scope.combos.length; i++) {
      const patch = r.combo_patches[i]; exact(patch, ["combo", "mix", "text", "text_ja"], "combo patch");
      bilingual({ text: patch.text, text_ja: patch.text_ja });
      if (patch.combo !== context.scope.combos[i]) throw new Error("Combo outside exact amendment order/scope");
      const original = context.original.combos.find(row => row.combo === patch.combo)!;
      exact(patch.mix, Object.keys(original.mix), "unchanged mix");
      if (Object.keys(original.mix).some(action => patch.mix[action] !== original.mix[action])) throw new Error("Frequency change requires policy/descendant regeneration, not a reason amendment");
    }
  }
  if (frequencyOnlyDigest(context.original) !== context.base.frequency_only_sha256 || postflopHash(context.original.combos) !== context.base.policy_hash) throw new Error("Complete original frequency/policy changed during review");
  return r;
}
export function buildReasonAmendment(raw: unknown, context: AmendmentContext, metric: SessionMetric, effectivePrompt = context.prompt) {
  const parsed = validateReasonAmendmentResponse(raw, context);
  // Lossless action-key normalization only, preserving every original frequency.
  const response = { ...parsed, combo_patches: parsed.combo_patches.map(patch => ({ ...patch, mix: Object.fromEntries(Object.keys(context.original.combos.find(row => row.combo === patch.combo)!.mix).map(action => [action, patch.mix[action]])) })) };
  if (metric.status !== "completed" || metric.model !== "gpt-6.1-sol" || metric.effort !== "medium" || metric.confirmedModel !== "gpt-6.1-sol" || metric.confirmedEffort !== "medium" || !metric.threadId || !metric.turnId) throw new Error("Actual amendment model/effort/thread/turn attestation required");
  const body = { schema_version: AMENDMENT_METHOD, generation_mode: "post-generation-review-amendment", request_id: context.request_id, base: context.base,
    original_failed_review_sha256: FAILED_REVIEW_SHA256, resolved_finding_ids: context.resolved_finding_ids, scope: context.scope, source_response: response,
    provenance: { method: AMENDMENT_METHOD, version: AMENDMENT_VERSION, model: "gpt-6.1-sol", effort: "medium", implementation_hash: context.request.implementation_hash, prompt_hash: postflopHash(effectivePrompt), schema_hash: postflopHash(context.schema), confirmed_model: metric.confirmedModel, confirmed_effort: metric.confirmedEffort, thread_id: metric.threadId, turn_id: metric.turnId },
    approval_status: response.assessment === "reason-only" ? "pending-independent-review" : "requires-policy-regeneration" };
  return { ...body, revision_id: postflopHash(body) };
}
export type ReasonAmendment = ReturnType<typeof buildReasonAmendment>;
export function validateReasonAmendment(revision: ReasonAmendment, context: AmendmentContext) {
  exact(revision, ["schema_version", "generation_mode", "request_id", "base", "original_failed_review_sha256", "resolved_finding_ids", "scope", "source_response", "provenance", "approval_status", "revision_id"], "revision");
  const { revision_id, ...body } = revision;
  if (postflopHash(body) !== revision_id || revision.request_id !== context.request_id || postflopHash(revision.base) !== postflopHash(context.base) || revision.original_failed_review_sha256 !== FAILED_REVIEW_SHA256 || postflopHash(revision.scope) !== postflopHash(context.scope) || postflopHash(revision.resolved_finding_ids) !== postflopHash(context.resolved_finding_ids) || revision.generation_mode !== "post-generation-review-amendment" || revision.schema_version !== AMENDMENT_METHOD) throw new Error("Amendment immutable binding changed");
  const p = revision.provenance;
  if (p.method !== AMENDMENT_METHOD || p.version !== AMENDMENT_VERSION || p.model !== "gpt-6.1-sol" || p.effort !== "medium" || p.confirmed_model !== p.model || p.confirmed_effort !== p.effort || !p.thread_id || !p.turn_id || p.implementation_hash !== context.request.implementation_hash || p.schema_hash !== postflopHash(context.schema) || !/^[a-f0-9]{64}$/.test(p.prompt_hash)) throw new Error("Amendment provider provenance changed");
  const r = validateReasonAmendmentResponse(revision.source_response, context);
  if (revision.approval_status !== (r.assessment === "reason-only" ? "pending-independent-review" : "requires-policy-regeneration")) throw new Error("Amendment assessment state changed");
  return revision;
}
export type AmendmentApproval = { schema_version: "aiv2-postflop-reason-amendment-approval-v1"; approved: true; scope: "three-saved-decision-reason-only-amendments"; original_failed_review_sha256: string; reviewer: { actor: string; model: string | null; relationship: "independent-review"; evidence: string[] }; revisions: Array<{ revision_id: string; revision_raw_file_sha256: string; base_decision_id: string; base_raw_file_sha256: string; frequency_only_sha256: string }> };
export function validateAmendmentApproval(approval: AmendmentApproval, revisions: Array<{ revision: ReasonAmendment; raw_sha256: string }>) {
  if (approval.schema_version !== "aiv2-postflop-reason-amendment-approval-v1" || approval.approved !== true || approval.scope !== "three-saved-decision-reason-only-amendments" || approval.original_failed_review_sha256 !== FAILED_REVIEW_SHA256 || !approval.reviewer?.actor?.trim() || ["generator", "codex-local-provider"].includes(approval.reviewer.actor) || approval.reviewer.relationship !== "independent-review" || !(approval.reviewer.model === null || typeof approval.reviewer.model === "string") || !approval.reviewer.evidence?.length || approval.reviewer.evidence.some(v => typeof v !== "string" || !v.trim()) || approval.revisions?.length !== 3 || revisions.length !== 3) throw new Error("Independent exact three-revision approval required");
  if (new Set(approval.revisions.map(r => r.revision_id)).size !== 3 || new Set(approval.revisions.map(r => r.base_decision_id)).size !== 3) throw new Error("Duplicate approval bindings");
  for (const { revision, raw_sha256 } of revisions) {
    const { revision_id, ...body } = revision;
    if (postflopHash(body) !== revision_id || revision.original_failed_review_sha256 !== FAILED_REVIEW_SHA256 || revision.schema_version !== AMENDMENT_METHOD) throw new Error("Unvalidated revision content");
    const target = AMENDMENT_TARGETS.find(t => t.decision_id === revision.base.decision_id);
    if (!target || revision.base.raw_file_sha256 !== target.raw_file_sha256 || postflopHash(revision.resolved_finding_ids) !== postflopHash([target.finding_id])) throw new Error("Revision outside bound review targets");
    const entry = approval.revisions.find(e => e.revision_id === revision.revision_id);
    if (revision.source_response.assessment !== "reason-only" || revision.approval_status !== "pending-independent-review" || !AMENDMENT_TARGETS.some(t => t.decision_id === revision.base.decision_id) || !/^[a-f0-9]{64}$/.test(raw_sha256) || entry?.revision_raw_file_sha256 !== raw_sha256 || entry.base_decision_id !== revision.base.decision_id || entry.base_raw_file_sha256 !== revision.base.raw_file_sha256 || entry.frequency_only_sha256 !== revision.base.frequency_only_sha256) throw new Error("Unapproved/mismatched revision binding");
  }
  return approval;
}
