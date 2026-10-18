import assert from "node:assert/strict";
import test from "node:test";
import { hands } from "../src/data.ts";
import { AIV2_PREflop_METHOD, AIV2_MODEL, AIV2_REASONING_EFFORT, summarizeConcretePolicy, actionsForSpot, scenarioOnly, CONCRETE_COMBOS, compressConcretePolicy, concreteComboReachWeights,
  encodeComboReachWeights, expandConcretePolicy, generateAndReevaluate, validateAiv2Policy, validateFinalReasons,
  validateRangeAnalysis } from "../scripts/aiv2-preflop.ts";

test("AIv2 supports all physical combos with exact class multiplicities and per-combo exceptions", () => {
  assert.equal(AIV2_PREflop_METHOD, "llm-range-wide-combo-v5");
  assert.equal(AIV2_MODEL, "gpt-6.1-sol");
  assert.equal(AIV2_REASONING_EFFORT, "medium");
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

test("zero-reach hand classes keep the generated mix without inventing incompatible actions", () => {
  const policy = validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: "zero-reach",
    class_mixes: hands.map(hand => ({ hand, mix: { open: 60, fold: 40 } })), combo_overrides: [] }, "zero-reach", ["open", "fold"]);
  const combos = expandConcretePolicy(policy, Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo, hand === "AA" ? 0 : 1])));
  const aa = compressConcretePolicy(combos, ["open", "fold"]).find(row => row.hand === "AA")!;
  assert.equal(aa.unreachable, true);
  assert.equal(aa.reach_weight, 0);
  assert.deepEqual(aa.mix, { open: 60, fold: 40 });
  assert.equal(Object.values(aa.mix).reduce((sum, value) => sum + value, 0), 100);
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
  const result = { scenario_id: "spot", reasons: hands.map(hand => ({ hand, text: "Final mix explained.", text_ja: "最終ミックスの理由。" })),
    combo_reasons: [{ combo: "AsKh", text: "Card blocker exception.", text_ja: "カードブロッカーの例外。" }] };
  assert.equal(validateFinalReasons(result, "spot", ["AsKh"]).combo_reasons.length, 1);
  assert.throws(() => validateFinalReasons({ ...result, combo_reasons: [] }, "spot", ["AsKh"]), /concrete combo reasons/);
  assert.throws(() => validateFinalReasons({ ...result, reasons: result.reasons.slice(1) }, "spot", ["AsKh"]), /incomplete/);
  assert.throws(() => validateFinalReasons({ ...result, reasons: result.reasons.map(({ text, ...row }) => row) }, "spot", ["AsKh"]), /incomplete/);
  assert.throws(() => validateFinalReasons({ ...result, combo_reasons: [{ combo: "AsKh", text: "Card blocker exception." }] }, "spot", ["AsKh"]), /concrete combo reasons/);
});


test("normalized policy checkpoints remain strictly validated on resume", () => {
  const raw = { kind: "aiv2_preflop_combo_policy", scenario_id: "cache", class_mixes: hands.map(hand => ({ hand, mix: { fold: 20, call: 80 } })), combo_overrides: [] };
  const normalized = validateAiv2Policy(raw, "cache", ["fold", "call"]);
  assert.deepEqual(validateAiv2Policy(normalized, "cache", ["fold", "call"]), normalized);
  assert.throws(() => validateAiv2Policy({ ...normalized, actions: ["fold", "raise"] }, "cache", ["fold", "call"]), /legal actions/);
  assert.throws(() => validateAiv2Policy({ ...raw, ev: 1 }, "cache", ["fold", "call"]), /unsupported fields/);
  assert.throws(() => validateAiv2Policy(raw, "cache", ["fold", "fold"]), /duplicate legal/);
});

test("row size metadata is scenario context, never an action or lost with legacy frequencies", () => {
  const spot = { id: "size", hands: hands.map(hand => ({ hand, fold: 90, call: 5, squeeze: 5, squeeze_size_bb: 12, equity_vs_shove_pct: 0 })) };
  assert.deepEqual(actionsForSpot(spot), ["fold", "call", "squeeze"]);
  assert.deepEqual(scenarioOnly(spot), { id: "size", squeeze_size_bb: 12 });
  assert.deepEqual(scenarioOnly({ ...spot, hands: [{ ...spot.hands[0], squeeze_size_bb: null }, ...spot.hands.slice(1)] }), { id: "size", squeeze_size_bb: 12 });
  assert.deepEqual(actionsForSpot({ hands: [{ hand: "AA", open: 90, fold: 0, limp: 10, limp_size_bb: 1 }] }), ["open", "fold", "limp"]);
  assert.throws(() => scenarioOnly({ ...spot, squeeze_size_bb: 9 }), /Conflicting/);
  assert.throws(() => scenarioOnly({ ...spot, hands: [...spot.hands.slice(1), { ...spot.hands[0], squeeze_size_bb: 13 }] }), /Inconsistent/);
});

test("concrete aggregation rejects malformed reach, missing combos and duplicate cards", () => {
  const policy = validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: "aggregate", class_mixes: hands.map(hand => ({ hand, mix: { fold: 25, call: 75 } })), combo_overrides: [] }, "aggregate", ["fold", "call"]);
  assert.throws(() => expandConcretePolicy(policy, { AsAh: 1 }), /complete and finite/);
  const rows = expandConcretePolicy(policy);
  assert.throws(() => compressConcretePolicy(rows.slice(1), ["fold", "call"]), /Incomplete/);
  assert.throws(() => compressConcretePolicy([...rows.slice(1), rows[1]], ["fold", "call"]), /duplicate/);
  assert.throws(() => compressConcretePolicy(rows.map((row, i) => i ? row : { ...row, reach_weight: NaN }), ["fold", "call"]), /nonfinite/);
  assert.throws(() => compressConcretePolicy(rows.map((row, i) => i ? row : { ...row, mix: { fold: 24.9, call: 75 } }), ["fold", "call"]), /integer frequencies/);
  const aa = rows.filter(row => row.hand === "AA");
  aa[0].reach_weight = 0;
  aa[0].mix = { fold: 100, call: 0 };
  assert.deepEqual(compressConcretePolicy(rows, ["fold", "call"]).find(row => row.hand === "AA")?.mix, { fold: 25, call: 75 });
});


test("range aggregates use physical combo counts and own reach, excluding unreachable rows", () => {
  const policy = validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: "summary", class_mixes: hands.map(hand => ({ hand, mix: { fold: hand === "AA" ? 0 : 100, call: hand === "AA" ? 100 : 0 } })), combo_overrides: [] }, "summary", ["fold", "call"]);
  const rows = expandConcretePolicy(policy);
  assert.equal(summarizeConcretePolicy(rows, ["fold", "call"]).action_frequency_pct.call, 600 / 1326);
  for (const row of rows) if (row.hand !== "AA") row.reach_weight = 0;
  const summary = summarizeConcretePolicy(rows, ["fold", "call"]);
  assert.equal(summary.reached_combo_count, 6);
  assert.deepEqual(summary.action_frequency_pct, { fold: 0, call: 100 });
  for (const row of rows) row.reach_weight = 0;
  assert.deepEqual(summarizeConcretePolicy(rows, ["fold", "call"]).action_frequency_pct, { fold: null, call: null });
});


test("independent scenario context strips legacy strategy facts but retains game geometry", () => {
  const clean = scenarioOnly({ id: "shove", hero: "BB", effective_stack_bb: 100, pot_bb: 40,
    cost_to_call_bb: 80, all_in_size_bb: 100, history: [{ seat: "BTN", action: "all_in", to_size_bb: 100 }],
    shove_range_combos: 42, call_break_even_equity_pct: 44, equity_vs_shove_pct: 53,
    reason: "Old decision", reasons: [], summary: "Legacy plan", combo_mixes: [],
    analysis: {}, metadata: { model: "old" }, provenance: {}, call_ev_bb: 3,
    hands: [{ hand: "AA", fold: 0, call: 100 }] });
  assert.deepEqual(clean, { id: "shove", hero: "BB", effective_stack_bb: 100, pot_bb: 40,
    cost_to_call_bb: 80, all_in_size_bb: 100, history: [{ seat: "BTN", action: "all_in", to_size_bb: 100 }] });
});
