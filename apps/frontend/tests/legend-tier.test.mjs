import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGEND, LEGEND_TOP_N, displayTier, isLegend } from "../src/trainer/rank-store.ts";

test("Legend is the top-10 placed players in Master, not a rating band", () => {
  assert.equal(LEGEND_TOP_N, 10);
  assert.equal(displayTier(1600, 1), LEGEND);
  assert.equal(displayTier(1600, 10), LEGEND);
  assert.equal(displayTier(1600, 11), "マスター");
  assert.equal(displayTier(1600, null), "マスター");
  assert.equal(displayTier(1500, 1), "ダイヤモンド");
  assert.equal(isLegend(1550, 3), true);
});
