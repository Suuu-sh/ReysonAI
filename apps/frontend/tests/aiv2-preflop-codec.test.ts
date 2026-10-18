import assert from "node:assert/strict";
import test from "node:test";
import { hands } from "../src/data.ts";
import { CONCRETE_COMBOS, validateAiv2Policy, expandConcretePolicy, compressConcretePolicy } from "../scripts/aiv2-preflop.ts";
import { decodeCompactPolicy, encodeCompactPolicy } from "../scripts/aiv2-preflop-codec.ts";
const actions = ["fold", "call"];
const makePolicy = (exceptions = true) => validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: "codec",
  class_mixes: hands.map(hand => ({ hand, mix: { fold: 30, call: 70 } })),
  combo_overrides: exceptions ? [{ combo: "AsKh", mix: { fold: 100, call: 0 } }, { combo: "AsAh", mix: { fold: 0, call: 100 } }] : [],
}, "codec", actions);

test("compact defaults preserve all 1326 exact mixes independently of weighted display averages", () => {
  const policy = makePolicy();
  const reach = Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo, hand === "AA" ? 0 : combo === "AsKh" ? 0.17 : 0.83]));
  const before = expandConcretePolicy(policy, reach);
  const display = compressConcretePolicy(before, actions).map(({ hand, mix }) => ({ hand, ...mix }));
  assert.notEqual(display.find(row => row.hand === "AKo")!.fold, policy.class_mixes.AKo.fold);
  assert.notEqual(display.find(row => row.hand === "AA")!.fold, policy.class_mixes.AA.fold);
  const compact = encodeCompactPolicy(policy);
  assert.equal(compact.class_defaults.length, 169);
  const restored = decodeCompactPolicy({ id: "codec", hands: display, ...JSON.parse(JSON.stringify(compact)) }, actions);
  assert.deepEqual(restored, policy);
  assert.deepEqual(expandConcretePolicy(restored, reach), before);
  const reversed = decodeCompactPolicy({ id: "codec", ...compact }, [...actions].reverse());
  assert.deepEqual(reversed.class_mixes, policy.class_mixes);
  assert.deepEqual(reversed.combo_overrides, policy.combo_overrides);
});

test("legacy zero-exception rows restore safely but legacy exception aggregates are rejected", () => {
  const policy = makePolicy(false);
  const display = compressConcretePolicy(expandConcretePolicy(policy), actions).map(({ hand, mix }) => ({ hand, ...mix }));
  assert.deepEqual(decodeCompactPolicy({ id: "codec", hands: display, combo_overrides: [] }, actions), policy);
  assert.throws(() => decodeCompactPolicy({ id: "codec", hands: display, combo_overrides: encodeCompactPolicy(makePolicy()).combo_overrides }, actions), /missing exact class defaults/);
});

test("codec rejects incomplete defaults, malformed totals and noncanonical legacy rows without normalization", () => {
  const compact = encodeCompactPolicy(makePolicy());
  assert.throws(() => decodeCompactPolicy({ id: "codec", ...compact, class_defaults: compact.class_defaults.slice(1) }, actions), /169 complete/);
  assert.throws(() => decodeCompactPolicy({ id: "codec", ...compact, class_defaults: compact.class_defaults.map((row, i) => i ? row : [29, 70]) }, actions), /sum to 100/);
  assert.throws(() => decodeCompactPolicy({ id: "codec", ...compact, class_defaults: compact.class_defaults.map((row, i) => i ? row : [30.1, 69.9]) }, actions), /integer frequencies/);
  assert.throws(() => decodeCompactPolicy({ id: "codec", hands: [...hands].reverse().map(hand => ({ hand, fold: 30, call: 70 })) }, actions), /canonical hand rows/);
  assert.throws(() => decodeCompactPolicy({ id: "codec", ...compact, combo_overrides: {} }, actions), /must be an array/);
  assert.throws(() => decodeCompactPolicy({ id: "codec", ...compact, combo_overrides: null }, actions), /must be an array/);
  assert.throws(() => decodeCompactPolicy({ id: "codec", ...compact, class_default_actions: ["fold", "fold"] }, actions), /exact legal action columns/);
});
