import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { label, sortActions, hands } from "../src/data.ts";
import { rangeTypes } from "../src/estimated/ranges.ts";
import { findThreeBetSpot, threeBetMatrixModel, validateThreeBetDataset } from "../src/estimated/three-bet-responses.ts";

const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const data = read("three-bet-responses"), responses = read("preflop-ranges"), openings = read("opening-ranges");

test("all 15 3bet response spots preserve the original opener as Hero and existing 3bet sizes", () => {
  assert.equal(validateThreeBetDataset(data, responses, openings), data);
  assert.equal(rangeTypes.find(x => x.value === "three_bet").available, true);
  assert.equal(rangeTypes.find(x => x.value === "four_bet").available, true);
  assert.equal(data.spots.length, 15);
  assert.equal(data.spots.reduce((n, s) => n + s.hands.length, 0), 2535);
  for (const before of responses.spots) {
    const after = findThreeBetSpot(data, before.opener, before.hero);
    assert.equal(after.hero, before.opener);
    assert.equal(after.three_bettor, before.hero);
    assert.equal(after.three_bet_size_bb, before.three_bet_size_bb);
    assert.equal(after.hero_position_vs_three_bettor, before.hero_position_vs_opener === "IP" ? "OOP" : "IP");
  }
  assert.throws(() => findThreeBetSpot(data, "BB", "BTN"));
  assert.throws(() => findThreeBetSpot(data, "BTN", "BTN"));
});

test("2,535 records normalize to 100 and all 4bet sizes are legal raise-to amounts", () => {
  for (const spot of data.spots) {
    assert.deepEqual(spot.hands.map(h => h.hand), hands);
    assert.equal(new Set(spot.hands.map(h => h.hand)).size, 169);
    assert.ok(spot.four_bet_size_bb >= 2 * spot.three_bet_size_bb - spot.open_size_bb);
    assert.ok(spot.four_bet_size_bb <= 100);
    for (const row of spot.hands) {
      assert.deepEqual(Object.keys(row), ["hand", "fold", "call", "four_bet", "four_bet_size_bb"]);
      assert.equal(row.fold + row.call + row.four_bet, 100);
      assert.ok([row.fold,row.call,row.four_bet].every(n => Number.isFinite(n) && n >= 0 && n <= 100));
      assert.equal(row.four_bet_size_bb, row.four_bet > 0 ? spot.four_bet_size_bb : null);
      const opened = openings.spots.find(s => s.hero === spot.hero).hands.find(h => h.hand === row.hand);
      if (opened.open === 0) {
        assert.equal(row.fold, 100);
      }
    }
  }
});

test("matrix values and 4bet action labels match the persisted JSON without synthetic EV", () => {
  for (const spot of data.spots) {
    const model = threeBetMatrixModel(spot);
    assert.deepEqual(model.actions, ["raise_four_bet", "call", "fold"]);
    assert.deepEqual(sortActions(model.actions), model.actions);
    assert.equal([...model.aggregates.values()].reduce((n, row) => n + row.comboCount, 0), 1326);
    for (const row of spot.hands) {
      assert.deepEqual(model.aggregates.get(row.hand).actions,
        { raise_four_bet: row.four_bet / 100, call: row.call / 100, fold: row.fold / 100 });
    }
  }
  assert.equal(label("raise_four_bet"), "4bet（推定サイズ）");
  const btn = findThreeBetSpot(data, "BTN", "BB");
  assert.equal(btn.three_bet_size_bb, 12);
  assert.equal(btn.four_bet_size_bb, 26);
  assert.equal(btn.hero_position_vs_three_bettor, "IP");
  assert.deepEqual(btn.hands.find(h => h.hand === "AKo"), {
    hand: "AKo", fold: 0, call: 25, four_bet: 75, four_bet_size_bb: 26,
  });
  const sb = findThreeBetSpot(data, "SB", "BB");
  assert.deepEqual([sb.open_size_bb, sb.three_bet_size_bb, sb.four_bet_size_bb], [3.5, 10.5, 24]);
});

test("malformed output, mismatched references, and unreachable-hand continuations fail closed", () => {
  for (const mutate of [
    d => d.spots.pop(),
    d => { d.spots[0] = d.spots[1]; },
    d => { d.spots[0].hero = "BB"; },
    d => { d.spots[0].three_bet_size_bb = 9; },
    d => { d.spots[0].source_response_id = "wrong"; },
    d => { d.spots[0].hero_position_vs_three_bettor = "IP"; },
    d => { d.spots[0].four_bet_size_bb = 101; },
    d => { d.spots[0].four_bet_size_bb = 4; },
    d => { d.spots[0].hands.pop(); },
    d => { d.spots[0].hands[1] = d.spots[0].hands[0]; },
    d => { d.spots[0].hands[0].four_bet = 101; },
    d => { d.spots[0].hands[0].call = NaN; },
    d => { d.spots[0].hands[0].fold = 1; },
    d => { d.spots[0].hands[0].four_bet_size_bb = null; },
    d => { const row = d.spots[0].hands.find(h => h.hand === "72o"); row.fold = 95; row.call = 5; },
  ]) {
    const invalid = structuredClone(data);
    mutate(invalid);
    assert.throws(() => validateThreeBetDataset(invalid, responses, openings));
  }
});
