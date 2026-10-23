import { test } from "node:test";
import assert from "node:assert/strict";
import { hands } from "../src/data.ts";
import { singlePassInput, requestSinglePass, validateSinglePass, singlePassOutput } from "../scripts/aiv2-single-pass.ts";
import { decodeCompactPolicy } from "../scripts/aiv2-preflop-codec.ts";
import type { Node } from "../scripts/aiv2-preflop-graph.ts";
const node = { key: "base/opening-ranges/UTG_open", dataset: "opening-ranges", spot: { id: "UTG_open", hero: "UTG", effective_stack_bb: 100, open_size_bb: 2.5, hands: [{ hand: "AA", fold: 0, open: 100 }] }, full_history: [], dependencies: [], refs: [] } as unknown as Node;
const input = singlePassInput(node, [], {});
const valid = () => ({ scenario_id: "UTG_open", hands: hands.map(hand => ({ hand, mix: { fold: 50, open: 50 }, text: "Mix opening and folding in this scene.", text_ja: "この場面ではオープンとフォールドを混ぜます。" })), combo_overrides: [] });
test("one scene returns frequencies and both languages in exactly one normal call", async () => {
  let calls = 0; const result = await requestSinglePass(input, async (_prompt, options) => { calls++; assert.equal(options.model, "gpt-6.1-sol"); assert.equal(options.effort, "medium"); assert.equal((options.outputSchema as any).additionalProperties, false); return valid(); }, { model: "gpt-6.1-sol", effort: "medium" });
  assert.equal(calls, 1); assert.equal(result.attempts, 1); assert.ok(!input.prompt.includes("Persisted Phase"));
  const output = singlePassOutput(node, input, result.raw, {}, {}, { model: "gpt-6.1-sol", reasoning_effort: "medium" });
  assert.equal(output.spot.hands.length, 169); assert.equal(output.reasons.reasons.length, 169); assert.equal(output.metadata.generation_mode, "single-scene-single-response"); assert.equal(Object.keys(decodeCompactPolicy(output.spot, input.actions).class_mixes).length, 169);
});
test("only invalid data triggers bounded correction with actual validation issue", async () => {
  const prompts: string[] = []; const result = await requestSinglePass(input, async prompt => { prompts.push(prompt); const raw = valid(); if (prompts.length === 1) raw.hands[0].mix.open = 49; return raw; }, { model: "gpt-6.1-sol", effort: "medium" });
  assert.equal(result.attempts, 2); assert.match(prompts[1], /integer frequencies must sum to 100/); assert.match(prompts[1], /Context:/);
});
test("missing hand, extra field, illegal action and missing Japanese fail closed", () => {
  let raw: any = valid(); raw.hands.pop(); assert.throws(() => validateSinglePass(raw, "UTG_open", input.actions));
  raw = valid(); raw.analysis = "extra"; assert.throws(() => validateSinglePass(raw, "UTG_open", input.actions), /exact keys/);
  raw = valid(); raw.hands[0].mix.call = 0; assert.throws(() => validateSinglePass(raw, "UTG_open", input.actions));
  raw = valid(); raw.hands[0].text_ja = ""; assert.throws(() => validateSinglePass(raw, "UTG_open", input.actions));
});
test("transport/quota error is never silently retried; invalid responses stop at two", async () => {
  let calls = 0; await assert.rejects(requestSinglePass(input, async () => { calls++; throw new Error("quota_or_rate_limit"); }, { model: "gpt-6.1-sol", effort: "medium" }), /quota/); assert.equal(calls, 1);
  calls = 0; await assert.rejects(requestSinglePass(input, async () => { calls++; return {}; }, { model: "gpt-6.1-sol", effort: "medium" }), /validation failed/); assert.equal(calls, 2);
});
test("invalid JSON parse failure repairs same scene once but model guards never retry", async () => {
  let calls = 0; const prompts: string[] = [];
  const result = await requestSinglePass(input, async prompt => { prompts.push(prompt); if (++calls === 1) throw Object.assign(new Error("invalid_json"), { code: "invalid_json" }); return valid(); }, { model: "gpt-6.1-sol", effort: "medium" });
  assert.equal(result.attempts, 2); assert.match(prompts[1], /Response is not valid JSON/);
  calls = 0; await assert.rejects(requestSinglePass(input, async () => { calls++; throw Object.assign(new Error("model_or_effort_mismatch"), { code: "model_or_effort_mismatch" }); }, { model: "gpt-6.1-sol", effort: "medium" }), /mismatch/); assert.equal(calls, 1);
});
test("runner fatal circuit recognizes exact provider model and protocol safety codes", async () => {
  const { isFatalSinglePassError } = await import("../scripts/aiv2-single-pass-runner.ts");
  for (const code of ["model_or_effort_mismatch", "unexpected_tool_call", "protocol_error", "unexpected_server_request", "quota_or_rate_limit", "authentication_required", "missing_thread", "missing_turn"]) assert.equal(isFatalSinglePassError(Object.assign(new Error(code), { code })), true, code);
  assert.equal(isFatalSinglePassError(Object.assign(new Error("timeout"), { code: "timeout" })), false);
  assert.equal(isFatalSinglePassError(Object.assign(new Error("invalid_json"), { code: "invalid_json" })), false);
});
