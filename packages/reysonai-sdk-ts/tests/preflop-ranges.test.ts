import assert from "node:assert/strict";
import test from "node:test";

import {
  DeterministicPreflopRangeProvider,
  STARTING_HANDS,
  createDefaultAiPreflopRanges,
  validateAiRange,
} from "../dist/preflop-ranges.js";
import {
  BB_VS_BTN_OPEN_AI_RESPONSES,
  BTN_OPEN_AI_RESPONSES,
} from "../dist/preflop-ai-responses.js";

function assertCompleteRange(range?: any, actions?: any): any {
  assert.equal(range.hands.length, 169);
  assert.equal(new Set(range.hands.map(({ hand }: any): any => hand)).size, 169);
  assert.deepEqual(new Set(range.hands.map(({ hand }: any): any => hand)), new Set(STARTING_HANDS));
  assert.deepEqual(range.actions, actions);
  assert.deepEqual(validateAiRange(range), { valid: true, errors: [] });
  for (const { hand, frequencies } of range.hands) {
    const values = actions.map((action?: any): any => frequencies[action]);
    assert.ok(values.every((value?: any): any => Number.isFinite(value) && value >= 0 && value <= 100), hand);
    assert.equal(values.reduce((sum?: any, value?: any): any => sum + value, 0), 100, hand);
  }
}

test("deterministic provider generates the BTN open range", (): any => {
  const range = new DeterministicPreflopRangeProvider().generate({ spot: "btn_open" });
  assert.equal(range.status, "ai_estimated");
  assert.equal(range.gtoVerified, false);
  assert.equal(range.spot.label, "BTN Open 2.5BB");
  assert.equal(range.provider.name, "ai-knowledge-response");
  assertCompleteRange(range, ["open", "fold"]);
  assert.deepEqual(new Set(Object.keys(BTN_OPEN_AI_RESPONSES)), new Set(STARTING_HANDS));
  assert.deepEqual(range.hands.map(({ hand, frequencies }: any): any => ({ hand, ...frequencies })),
    STARTING_HANDS.map((hand?: any): any => ({ hand, ...BTN_OPEN_AI_RESPONSES[hand] })));
  assert.deepEqual((range.hands.find(({ hand }: any): any => hand === "AKo")!).frequencies, { open: 100, fold: 0 });
  assert.ok(range.hands.every(({ reason }: any): any => typeof reason === "string" && reason.length > 0));
});

test("deterministic provider generates the BB response range", (): any => {
  const range = new DeterministicPreflopRangeProvider().generate({ spot: "bb_vs_btn_open" });
  assert.equal(range.spot.label, "BB vs BTN Open 2.5BB");
  assert.deepEqual(range.spot.raiseSizesBb, [9, 9.5, 10, 10.5, 11]);
  assertCompleteRange(range, ["fold", "call", "three_bet"]);
  assert.deepEqual(new Set(Object.keys(BB_VS_BTN_OPEN_AI_RESPONSES)), new Set(STARTING_HANDS));
  assert.deepEqual((range.hands.find(({ hand }: any): any => hand === "AKo")!).frequencies, { fold: 0, call: 25, three_bet: 75 });
  assert.equal((range.hands.find(({ hand }: any): any => hand === "AKo")!).raiseSizeBb, 10);
  assert.match((range.hands.find(({ hand }: any): any => hand === "AKo")!).reason!, /75%.*10BB.*25%/);
  assert.deepEqual((range.hands.find(({ hand }: any): any => hand === "42o")!).frequencies, { fold: 100, call: 0, three_bet: 0 });
  assert.match((range.hands.find(({ hand }: any): any => hand === "42o")!).reason!, /フォールド100%/);
  assert.ok(range.hands.every(({ frequencies }: any): any => Object.values(frequencies).every((value?: any): any => value % 25 === 0)));
  assert.ok(range.hands.filter(({ frequencies }: any): any => frequencies.three_bet > 0).every(({ raiseSizeBb }: any): any => Number.isFinite(raiseSizeBb)));
  assert.ok(range.hands.every(({ reason }: any): any => typeof reason === "string" && reason.length > 0));
});

test("default ranges are reproducible and cover both requested spots", (): any => {
  const first = createDefaultAiPreflopRanges();
  const second = createDefaultAiPreflopRanges();
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ["btn_open", "bb_vs_btn_open"]);
});

test("validator rejects incomplete or unbalanced AI output", (): any => {
  const range = new DeterministicPreflopRangeProvider().generate({ spot: "btn_open" });
  const invalid = {
    ...range,
    hands: range.hands.slice(0, -1).map((item?: any): any => ({ ...item })),
  };
  invalid.hands[0].frequencies.open = 101;
  const validation = validateAiRange(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error?: any): any => error.includes("169")));
  assert.ok(validation.errors.some((error?: any): any => error.includes("0..100")));
});
