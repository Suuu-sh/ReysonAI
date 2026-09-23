import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));

test("5bet responses call exactly when equity vs the shove range clears pot odds", () => {
  const data = load("five-bet-responses");
  assert.equal(data.spots.length, 15);
  for (const spot of data.spots) {
    for (const row of spot.hands) {
      assert.equal(row.fold + row.call, 100);
      if (row.equity_vs_shove_pct === null) { assert.equal(row.fold, 100); continue; }
      const margin = row.equity_vs_shove_pct - spot.call_break_even_equity_pct;
      if (margin >= 2.1) assert.equal(row.call, 100, `${spot.id} ${row.hand}`);
      if (margin <= -2.1) assert.equal(row.call, 0, `${spot.id} ${row.hand}`);
      assert.match(row.reason, /必要勝率/);
    }
  }
  const btnVsBb = data.spots.find(s => s.id === "BTN_vs_BB_five_bet");
  assert.equal(btnVsBb.hands.find(r => r.hand === "AA").call, 100);
  assert.equal(btnVsBb.hands.find(r => r.hand === "72o").equity_vs_shove_pct, null); // never 4bet
});

test("5bet model hides unreachable placeholders and validates frequencies", async () => {
  const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  try {
    const { fiveBetMatrixModel, validateFiveBetDataset } = await server.ssrLoadModule("/src/estimated/five-bet-responses.js");
    const data = validateFiveBetDataset(load("five-bet-responses"));
    const model = fiveBetMatrixModel(data.spots[0]);
    assert.deepEqual(model.actions, ["call", "fold"]);
    assert.equal(model.aggregates.get("72o").unreachable, true);
    assert.deepEqual(model.aggregates.get("72o").actions, {});
    const broken = structuredClone(data);
    broken.spots[0].hands[0].call = 60;
    assert.throws(() => validateFiveBetDataset(broken), /頻度が不正/);
  } finally { await server.close(); }
});
