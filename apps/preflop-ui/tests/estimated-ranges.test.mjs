import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { availableHeroes, availableOpeners, findSpot, hasSpot, matrixModel, positions, validateDataset } from "../src/estimated/ranges.js";

const data = JSON.parse(readFileSync(new URL("../src/estimated/preflop-ranges.json", import.meta.url), "utf8"));
test("all 15 persisted JSON spots retain all 2,535 answers in the matrix", () => {
  assert.equal(validateDataset(data), data);
  for (const spot of data.spots) {
    const model = matrixModel(spot);
    assert.deepEqual(model.actions, ["raise_ai", "call", "fold"]);
    assert.equal(model.aggregates.size, 169);
    assert.equal([...model.aggregates.values()].reduce((n, h) => n + h.comboCount, 0), 1326);
    for (const row of spot.hands) {
      assert.deepEqual(model.aggregates.get(row.hand).actions,
        { raise_ai: row.three_bet / 100, call: row.call / 100, fold: row.fold / 100 });
    }
  }
});
test("legal position selectors cover exactly 15 ordered matchups", () => {
  let count = 0;
  for (const opener of positions) for (const hero of availableHeroes(opener)) {
    assert.equal(findSpot(data, opener, hero).id, `${hero}_vs_${opener}`);
    count++;
  }
  assert.equal(count, 15);
  assert.deepEqual(availableOpeners(data), ["UTG", "HJ", "CO", "BTN", "SB"]);
  assert.equal(hasSpot(data, "UTG", "HJ"), true);
  assert.equal(hasSpot(data, "UTG", "UTG"), false);
  assert.deepEqual(availableHeroes("SB"), ["BB"]);
  assert.deepEqual(availableHeroes("unknown"), []);
  assert.throws(() => findSpot(data, "BTN", "UTG"));
});
test("AKo BB vs BTN uses the new frequency, unrestricted size and reason", () => {
  const row = findSpot(data, "BTN", "BB").hands.find(h => h.hand === "AKo");
  assert.deepEqual([row.fold, row.call, row.three_bet, row.three_bet_size_bb], [0, 25, 75, 12]);
  assert.match(row.reason, /BTN/);
});
test("invalid JSON fails closed rather than substituting strategies", () => {
  for (const mutate of [
    d => d.spots.pop(),
    d => d.spots[0].hands.pop(),
    d => { d.spots[0].hands[0].fold = 101; },
    d => { d.spots[0].hands[0].three_bet_size_bb = null; },
    d => { d.spots[0].hands[0].reason = ""; },
    d => { d.spots[0].hands[1] = d.spots[0].hands[0]; },
  ]) {
    const invalid = structuredClone(data);
    mutate(invalid);
    assert.throws(() => validateDataset(invalid));
  }
});
