import assert from "node:assert/strict";
import test from "node:test";

import {
  DeterministicPreflopRangeProvider,
  STARTING_HANDS,
  createDefaultAiPreflopRanges,
  validateAiRange,
} from "../dist/preflop-ranges.js";

function assertCompleteRange(range, actions) {
  assert.equal(range.hands.length, 169);
  assert.equal(new Set(range.hands.map(({ hand }) => hand)).size, 169);
  assert.deepEqual(new Set(range.hands.map(({ hand }) => hand)), new Set(STARTING_HANDS));
  assert.deepEqual(range.actions, actions);
  assert.deepEqual(validateAiRange(range), { valid: true, errors: [] });
  for (const { hand, frequencies } of range.hands) {
    const values = actions.map(action => frequencies[action]);
    assert.ok(values.every(value => Number.isFinite(value) && value >= 0 && value <= 100), hand);
    assert.equal(values.reduce((sum, value) => sum + value, 0), 100, hand);
  }
}

test("deterministic provider generates the BTN open range", () => {
  const range = new DeterministicPreflopRangeProvider().generate({ spot: "btn_open" });
  assert.equal(range.status, "ai_estimated");
  assert.equal(range.gtoVerified, false);
  assert.equal(range.spot.label, "BTN Open 2.5BB");
  assertCompleteRange(range, ["open", "fold"]);
  assert.equal(range.hands.find(({ hand }) => hand === "AA").frequencies.open, 100);
});

test("deterministic provider generates the BB response range", () => {
  const range = new DeterministicPreflopRangeProvider().generate({ spot: "bb_vs_btn_open" });
  assert.equal(range.spot.label, "BB vs BTN Open 2.5BB");
  assert.equal(range.spot.threeBetSizeBb, 10);
  assertCompleteRange(range, ["fold", "call", "three_bet"]);
  assert.ok(range.hands.find(({ hand }) => hand === "AA").frequencies.three_bet > 0);
});

test("default ranges are reproducible and cover both requested spots", () => {
  const first = createDefaultAiPreflopRanges();
  const second = createDefaultAiPreflopRanges();
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ["btn_open", "bb_vs_btn_open"]);
});

test("validator rejects incomplete or unbalanced AI output", () => {
  const range = new DeterministicPreflopRangeProvider().generate({ spot: "btn_open" });
  const invalid = {
    ...range,
    hands: range.hands.slice(0, -1).map(item => ({ ...item })),
  };
  invalid.hands[0].frequencies.open = 101;
  const validation = validateAiRange(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.includes("169")));
  assert.ok(validation.errors.some(error => error.includes("0..100")));
});
