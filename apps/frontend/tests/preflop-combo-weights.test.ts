import assert from "node:assert/strict";
import test from "node:test";
import { hands } from "../src/data.ts";
import { preflopComboWeights } from "../src/estimated/ranges.ts";

test("preflop ranges expose all 1,326 concrete combos with exact class and prior reach weights", () => {
  const rows = hands.map(hand => ({ hand, fold: 40, call: 35, three_bet: 25 }));
  const weights = preflopComboWeights(rows, 0.5);
  assert.equal(weights.length, 1326);
  assert.equal(new Set(weights.map(value => value.combo)).size, 1326);
  assert.ok(weights.every(value => value.reachWeight === 0.5 && value.frequencies.fold === 40));
  assert.equal(weights.filter(value => value.handClass === "AA").length, 6);
  assert.equal(weights.filter(value => value.handClass === "AKs").length, 4);
  assert.equal(weights.filter(value => value.handClass === "AKo").length, 12);
  const weighted = preflopComboWeights([{ hand: "AKs", fold: 50, call: 50 }], { AcKc: 0.25 });
  assert.equal(weighted.find(value => value.combo === "AcKc")?.reachWeight, 0.25);
  assert.equal(weighted.filter(value => value.reachWeight === 0).length, 3);
});
