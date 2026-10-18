import test from "node:test";
import assert from "node:assert/strict";
import { generatedAiv2Reason } from "../src/estimated/english-reasons.ts";

test("AIv2 explanations preserve the generated A2s and A9s text", () => {
  const reasons = {
    A2s: "Open 45%, fold 55%. Suited wheel potential supports some opens; the lowest ace kicker keeps folds more common.",
    A9s: "Open 90%, fold 10%. Suited ace potential supports frequent opens, with some restraint from UTG.",
  };
  for (const [hand, reason] of Object.entries(reasons)) {
    assert.equal(generatedAiv2Reason({ reason }), reason, `${hand} should display the saved generated explanation verbatim`);
  }
});

test("AIv2 does not synthesize an explanation when generated text is missing", () => {
  assert.equal(generatedAiv2Reason(undefined), null);
  assert.equal(generatedAiv2Reason({ reason: "  " }), null);
});
