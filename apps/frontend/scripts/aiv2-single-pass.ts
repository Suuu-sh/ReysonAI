// One scene, one response: frequencies and faithful bilingual reasons together.
import { hands } from "../src/data.ts";
import { actionsForSpot, validateAiv2Policy, expandConcretePolicy, compressConcretePolicy, summarizeConcretePolicy, validateFinalReasons, scenarioOnly } from "./aiv2-preflop.ts";
import { encodeCompactPolicy } from "./aiv2-preflop-codec.ts";
import { CANONICAL_COMBO_PATTERN } from "./aiv2-preflop-run-state.ts";
import type { Node } from "./aiv2-preflop-graph.ts";
import { createHash } from "node:crypto";
export const SINGLE_PASS_METHOD = "llm-range-single-response-v6";
export const SINGLE_PASS_VERSION = "single-scene-frequency-bilingual-1";
export const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type SinglePassProvider = (prompt: string, options: { model: string; effort: string; outputSchema: Record<string, unknown> }) => Promise<unknown>;
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export function singlePassSchema(id: string, actions: string[]) {
  const mix = object(Object.fromEntries(actions.map(action => [action, { type: "integer", minimum: 0, maximum: 100 }])));
  const reason = { text: { type: "string", minLength: 1 }, text_ja: { type: "string", minLength: 1 } };
  return object({ scenario_id: { type: "string", const: id }, hands: { type: "array", minItems: 169, maxItems: 169,
    items: object({ hand: { type: "string", enum: hands }, mix, ...reason }) }, combo_overrides: { type: "array", maxItems: 1326,
    items: object({ combo: { type: "string", pattern: CANONICAL_COMBO_PATTERN }, mix, ...reason }) } });
}
const exactKeys = (value: any, keys: string[], label: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + ": expected object");
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error(label + ": exact keys required " + keys.join(","));
};
export function validateSinglePass(raw: any, id: string, actions: string[]) {
  exactKeys(raw, ["scenario_id", "hands", "combo_overrides"], "response");
  if (raw.scenario_id !== id || !Array.isArray(raw.hands) || raw.hands.length !== 169 || !Array.isArray(raw.combo_overrides)) throw new Error("Wrong scene identity or incomplete169 hand classes");
  raw.hands.forEach((row: any, index: number) => { exactKeys(row, ["hand", "mix", "text", "text_ja"], "hand[" + index + "]"); if (row.hand !== hands[index]) throw new Error("Canonical hand order mismatch at " + index); });
  raw.combo_overrides.forEach((row: any, index: number) => exactKeys(row, ["combo", "mix", "text", "text_ja"], "override[" + index + "]"));
  const policy = validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: id,
    class_mixes: raw.hands.map((row: any) => ({ hand: row.hand, mix: row.mix })), combo_overrides: raw.combo_overrides.map((row: any) => ({ combo: row.combo, mix: row.mix })) }, id, actions);
  const comboReasons = raw.combo_overrides.map(({ combo, text, text_ja }: any) => ({ combo, text, text_ja })).sort((a: any, b: any) => a.combo.localeCompare(b.combo));
  const reasons = validateFinalReasons({ scenario_id: id, reasons: raw.hands.map(({ hand, text, text_ja }: any) => ({ hand, text, text_ja })), combo_reasons: comboReasons }, id, Object.keys(policy.combo_overrides).sort());
  return { policy, reasons };
}
export function singlePassInput(node: Node, upstream: unknown[], reach: unknown) {
  const actions = actionsForSpot(node.spot);
  const scenario = { ...scenarioOnly(node.spot), id: String(node.spot.id), history: node.full_history, dataset: node.dataset,
    context_kind: node.profile ? "villain-profile" : "base", ...(node.profile ?? {}) };
  // One compact context block, no duplicated scene or separately persisted analysis.
  const context = { scenario, legal_actions: actions, upstream_ranges: upstream, per_seat_reach: reach,
    reach_model: "Per-player product of own prior conditional actions; not a card-removal-conditioned joint deal distribution." };
  const prompt = ["Generate this ONE preflop scene's complete range and reasons in ONE JSON response. Do not return a separate analysis, candidate or review.",
    "6-max cash,100BB effective,no ante,rake5% capped3BB. Estimate AI strategy, not GTO or a solver. Use only supplied legal actions/raise-to sizes and exact actor/history/profile. Opponent actions inform strategy but never multiply another participant's same-combo reach into hero reach. Zero-own-reach combos remain counterfactual policies, excluded from reached aggregates. Preserve suit symmetry unless supplied context justifies physical-card exceptions. No legacy AI targets, invented EV/equity/solver measurements or postflop sizing.",
    "Return scenario_id,hands:[{hand,mix,text,text_ja}] in the exact canonical169 order " + hands.join(",") + ", and combo_overrides:[{combo,mix,text,text_ja}] (empty when unnecessary). Each mix contains exactly legal actions, integer percentages0..100 summing100. Every row includes an English explanation specific to its final frequencies and faithful natural Japanese of the SAME content. Reasons and frequencies are simultaneous, not a second call.",
    "Context: " + JSON.stringify(context)].join("\n");
  return { scenario, actions, context, prompt, schema: singlePassSchema(node.spot.id, actions) };
}
export function singlePassOutput(node: Node, input: ReturnType<typeof singlePassInput>, raw: unknown, ownReach: Record<string, number>, reach: unknown, provenance: Record<string, unknown>) {
  const { policy, reasons } = validateSinglePass(raw, node.spot.id, input.actions);
  const expanded = expandConcretePolicy(policy, ownReach);
  return { spot: { ...input.scenario, hands: compressConcretePolicy(expanded, input.actions).map(({ hand, mix, ...rest }) => ({ hand, ...mix, ...rest })), ...encodeCompactPolicy(policy) }, reasons, combo_reach_weights: { players: reach },
    metadata: { ...provenance, method: SINGLE_PASS_METHOD, version: SINGLE_PASS_VERSION, scenario_id: node.spot.id,
      final_hash: hash(policy), reason_hash: hash(reasons), storage_format: "exact-class-defaults-v1", concrete_combo_count: 1326, decision_count: 169,
      actual_range_summary: summarizeConcretePolicy(expanded, input.actions), history_assumptions: node.full_history.filter(event => !event.source && event.assumption),
      reach_distribution_model: "per-player conditional action product; not joint card-removal-conditioned distribution", generation_mode: "single-scene-single-response", reasons_generated_with_frequencies: true,
      status: "complete", publication_status: "candidate-not-selectable" } };
}
export async function requestSinglePass(input: ReturnType<typeof singlePassInput>, provider: SinglePassProvider, options: { model: string; effort: string; shouldStop?: () => boolean; onInvalid?: (value: unknown) => void }) {
  let issue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.shouldStop?.()) throw new Error("controlled_stop_requested");
    const prompt = input.prompt + (attempt ? "\nYour response failed validation: " + issue + ". Correct that issue and return the COMPLETE exact JSON object, all169 hands and both languages; no extra keys/prose. Original context above remains authoritative." : "");
    let raw: unknown;
    try { raw = await provider(prompt, { model: options.model, effort: options.effort, outputSchema: input.schema }); }
    catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "invalid_json") throw error;
      issue = "Response is not valid JSON";
      options.onInvalid?.({ attempt: attempt + 1, issue, error_code: "invalid_json" });
      continue;
    }
    try { validateSinglePass(raw, (input.scenario as Record<string, unknown>).id as string, input.actions); return { raw, attempts: attempt + 1, prompt_hash: hash(prompt) }; }
    catch (error) { issue = error instanceof Error ? error.message : "invalid JSON shape"; options.onInvalid?.({ attempt: attempt + 1, issue, response_hash: hash(raw) }); }
  }
  throw new Error("AIv2 single-response validation failed: " + issue);
}
