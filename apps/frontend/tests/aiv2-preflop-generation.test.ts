import assert from "node:assert/strict";
import test from "node:test";
import { hands } from "../src/data.ts";
import { AIV2_PREflop_METHOD, CONCRETE_COMBOS, compressConcretePolicy, concreteComboReachWeights,
  encodeComboReachWeights, expandConcretePolicy, generateAndReevaluate, validateAiv2Policy, validateFinalReasons,
  validateRangeAnalysis } from "../scripts/aiv2-preflop.ts";

test("AIv2 supports all physical combos with exact class multiplicities and per-combo exceptions", () => {
  assert.equal(AIV2_PREflop_METHOD, "llm-range-wide-combo-v3");
  assert.equal(CONCRETE_COMBOS.length, 1326);
  const counts = new Map<string, number>();
  for (const { hand } of CONCRETE_COMBOS) counts.set(hand, (counts.get(hand) ?? 0) + 1);
  for (const hand of hands) assert.equal(counts.get(hand), hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12, hand);
  const policy = validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: "test",
    class_mixes: hands.map(hand => ({ hand, mix: { fold: 50, call: 50 } })),
    combo_overrides: [{ combo: "AsKh", mix: { fold: 100, call: 0 } }] }, "test", ["fold", "call"]);
  const expanded = expandConcretePolicy(policy);
  assert.equal(expanded.length, 1326);
  assert.deepEqual(expanded.find(row => row.combo === "AsKh")?.mix, { fold: 100, call: 0 });
  assert.deepEqual(expanded.find(row => row.combo === "AdKc")?.mix, { fold: 50, call: 50 });
  const compressed = compressConcretePolicy(expanded, ["fold", "call"]);
  assert.deepEqual(compressed.find(row => row.hand === "AKo")?.mix, { fold: 54, call: 46 });
});

test("per-combo history factors are multiplied exactly and only symmetric reach compresses", () => {
  const weights = concreteComboReachWeights([
    { action: "call", frequenciesByHand: Object.fromEntries(hands.map(hand => [hand, hand === "AA" ? 50 : hand === "AKo" ? 20 : 100])) },
    { action: "raise", frequenciesByHand: Object.fromEntries(hands.map(hand => [hand, hand === "AA" ? 25 : hand === "AKo" ? 30 : 100])), frequenciesByCombo: { AsKh: 0 } },
  ]);
  assert.equal(weights.AsAh, 0.125);
  assert.equal(weights.AsKh, 0);
  const compressed = encodeComboReachWeights(weights);
  assert.equal(compressed.encoding, "concrete-combo-exact");
  const symmetric = encodeComboReachWeights(Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo, hand === "AA" ? 0.25 : 1])));
  assert.equal(symmetric.encoding, "hand-class-exact-suit-symmetry");
});

test("AIv2 validates every hand, legal columns and integer totals before accepting a model result", () => {
  const valid = { kind: "aiv2_preflop_combo_policy", scenario_id: "spot",
    class_mixes: hands.map(hand => ({ hand, mix: { fold: 100, raise: 0 } })), combo_overrides: [] };
  assert.equal(validateAiv2Policy(valid, "spot", ["fold", "raise"]).class_mixes.AA.fold, 100);
  assert.throws(() => validateAiv2Policy({ ...valid, class_mixes: valid.class_mixes.slice(1) }, "spot", ["fold", "raise"]), /identity or incomplete/);
  assert.throws(() => validateAiv2Policy({ ...valid, class_mixes: valid.class_mixes.map((row, index) => index ? row : { ...row, mix: { fold: 99, raise: 0 } }) }, "spot", ["fold", "raise"]), /sum to 100/);
  assert.throws(() => validateAiv2Policy({ ...valid, combo_overrides: [{ combo: "AsAs", mix: { fold: 100, raise: 0 } }] }, "spot", ["fold", "raise"]), /invalid or duplicate/);
});

test("range analysis is persisted as its own phase before policy generation and reevaluation", async () => {
  const analysis = { kind: "aiv2_preflop_range_analysis", scenario_id: "spot", summary: "Whole-range plan.",
    range_themes: ["Keep value and bluffs balanced."], blocker_notes: [] };
  assert.equal(validateRangeAnalysis(analysis, "spot").summary, analysis.summary);
  assert.throws(() => validateRangeAnalysis({ ...analysis, scenario_id: "other" }, "spot"), /wrong identity/);
  const calls: string[] = [];
  const generator = async (prompt: string) => {
    calls.push(prompt);
    if (prompt.includes("Phase 1:")) return analysis;
    return { kind: "aiv2_preflop_combo_policy", scenario_id: "spot",
      class_mixes: hands.map(hand => ({ hand, mix: { fold: 50, open: 50 } })), combo_overrides: [] };
  };
  const result = await generateAndReevaluate({ scenario: { id: "spot" }, actions: ["fold", "open"], generator: generator as any });
  assert.equal(calls.length, 3);
  assert.match(calls[0], /Phase 1:/);
  assert.match(calls[1], /Persisted Phase 1 whole-range strategic analysis/);
  assert.match(calls[1], /Whole-range plan/);
  assert.match(calls[2], /strategic incoherence/);
  assert.match(calls[2], /Full provisional policy/);
  assert.equal(result.provenance.analysis_hash.length, 64);
});

test("post-final reasons require all class reasons and exact combo exception coverage", () => {
  const result = { scenario_id: "spot", reasons: hands.map(hand => ({ hand, text: "Final mix explained." })),
    combo_reasons: [{ combo: "AsKh", text: "Card blocker exception." }] };
  assert.equal(validateFinalReasons(result, "spot", ["AsKh"]).combo_reasons.length, 1);
  assert.throws(() => validateFinalReasons({ ...result, combo_reasons: [] }, "spot", ["AsKh"]), /concrete combo reasons/);
  assert.throws(() => validateFinalReasons({ ...result, reasons: result.reasons.slice(1) }, "spot", ["AsKh"]), /incomplete/);
});
