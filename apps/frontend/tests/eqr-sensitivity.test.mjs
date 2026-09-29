import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEqrSensitivity } from "../scripts/lib/eqr-sensitivity.mjs";
import { raiseEv } from "../scripts/lib/raise-ev.mjs";

test("reports a call/fold boundary crossed by EQR ±5%", () => {
  const result = compareEqrSensitivity({ equity: 0.5, eqr: 1, pot: 10, cost: 4.9 });
  assert.equal(result.callFold, true);
  assert.ok(result.callLow < 0 && result.callHigh > 0);
});

test("ignores decisions unchanged across the EQR interval", () => {
  const result = compareEqrSensitivity({ equity: 0.5, eqr: 1, pot: 10, cost: 1, raiseAtScale: () => -10 });
  assert.equal(result.callFold, false);
  assert.equal(result.raiseCall, false);
});

test("reports a raise/call ranking reversal", () => {
  const result = compareEqrSensitivity({ equity: 0.5, eqr: 1, pot: 10, cost: 1, raiseAtScale: () => 3.9 });
  assert.equal(result.raiseCall, true);
});

test("raise EV scales only non-all-in EQR branches", () => {
  const g = { hero: "BB", opener: "BTN", open: 2.5, threeBet: 12, fourBet: 26, stack: 100 };
  const eq = { vsCall: 0.5, vsFourBet: 0.5 };
  const call = scale => raiseEv("AKs", { fold: 0, call: 1, four_bet: 0 }, null, eq, g, { eqrScale: scale }).ev;
  assert.ok(call(1.05) > call(0.95));
  const allIn = scale => raiseEv("AKs", { fold: 0, call: 0, four_bet: 1 },
    { fold: 0, call: 0, all_in: 100 }, eq, g, { eqrScale: scale }).ev;
  assert.equal(allIn(1.05), allIn(0.95));
});
