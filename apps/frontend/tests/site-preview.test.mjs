import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("marketing range preview mirrors persisted strategies", () => {
  const preview = read("../src/site/range-preview.json");
  for (const [mode, file, spotId, actions] of [
    ["opening", "opening-ranges.json", "BTN_open", ["open", "fold"]],
    ["response", "preflop-ranges.json", "BB_vs_BTN", ["three_bet", "call", "fold"]],
  ]) {
    const spot = read(`../src/estimated/${file}`).spots.find(item => item.id === spotId);
    assert.ok(spot);
    assert.equal(Object.keys(preview[mode]).length, 169);
    for (const row of spot.hands) {
      assert.deepEqual(preview[mode][row.hand], Object.fromEntries(actions.map(action => [action, row[action]])));
    }
  }
  assert.equal(preview.opening.K7s.open, 100);
});
