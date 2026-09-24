import assert from "node:assert/strict";
import test from "node:test";
import { adjustOpeningSpot, adjustResponseRow, adjustmentReason, applyTableProfile, isDefaultProfile, markAdjustedModel, normalizeProfile, parseTableDescription, profileKey } from "../src/estimated/table-profile.js";
import { compareOpenEv, limitToBudget } from "../scripts/exploit-open.mjs";
import adjustments from "../src/estimated/table-profile-adjustments.json" with { type: "json" };
import opening from "../src/estimated/opening-ranges.json" with { type: "json" };
import { comboCount } from "../scripts/lib/equity.mjs";
import { summarizeAgreement } from "../scripts/benchmark-record.mjs";

const total = row => row.fold + row.call + row.three_bet;

test("default profile leaves response rows unchanged", () => {
  const row = { hand: "AQs", fold: 10, call: 20, three_bet: 70 };
  assert.deepEqual(adjustResponseRow(row, {}), row);
});

test("fewer 3bets become calls, and more calls come out of folds", () => {
  const passive = adjustResponseRow({ hand: "AJs", fold: 30, call: 40, three_bet: 30 }, { three_bet: "low" });
  assert.deepEqual([passive.fold, passive.call, passive.three_bet], [30, 58, 12]);
  const sticky = adjustResponseRow({ hand: "K9s", fold: 50, call: 40, three_bet: 10 }, { call: "high" });
  assert.deepEqual([sticky.fold, sticky.call, sticky.three_bet], [26, 64, 10]);
});

test("adjusted rows stay valid frequencies for every level combination", () => {
  const rows = [{ fold: 0, call: 0, three_bet: 100 }, { fold: 100, call: 0, three_bet: 0 }, { fold: 5, call: 90, three_bet: 5 }, { fold: 40, call: 10, three_bet: 50 }];
  for (const call of ["low", "normal", "high"]) for (const three_bet of ["low", "normal", "high"]) for (const row of rows) {
    const out = adjustResponseRow({ hand: "X", ...row }, { call, three_bet });
    assert.ok(Math.abs(total(out) - 100) < 0.2, `${call}/${three_bet} ${JSON.stringify(out)}`);
    for (const key of ["fold", "call", "three_bet"]) assert.ok(out[key] >= 0 && out[key] <= 100);
  }
});

test("applyTableProfile copies the dataset and records the profile", () => {
  const dataset = { metadata: { a: 1 }, spots: [{ id: "BB_vs_BTN", hands: [{ hand: "AA", fold: 0, call: 50, three_bet: 50 }] }] };
  const out = applyTableProfile(dataset, { three_bet: "low" });
  assert.equal(dataset.spots[0].hands[0].three_bet, 50);
  assert.equal(out.spots[0].hands[0].three_bet, 20);
  assert.deepEqual(out.metadata.table_profile, { call: "normal", three_bet: "low" });
});

test("invalid levels are rejected", () => {
  assert.throws(() => normalizeProfile({ call: "huge" }));
  assert.ok(isDefaultProfile({}));
});

test("table descriptions map to profile levels", () => {
  assert.deepEqual(parseTableDescription("この卓めっちゃコールされる、3betはほぼしてこない").profile, { call: "high", three_bet: "low" });
  assert.deepEqual(parseTableDescription("みんなタイトで3betが多い").profile, { call: "low", three_bet: "high" });
  assert.deepEqual(parseTableDescription("普通の卓").profile, { call: "normal", three_bet: "normal" });
});

test("compareOpenEv flags only decisions whose EV shift crosses the margin", () => {
  const base = { hands: [{ hand: "K5o", open_freq: 0, delta_ev_bb: -0.02 }, { hand: "64s", open_freq: 100, delta_ev_bb: 0.03 }, { hand: "AA", open_freq: 100, delta_ev_bb: 2 }] };
  const exploit = { hands: [{ hand: "K5o", delta_ev_bb: 0.1 }, { hand: "64s", delta_ev_bb: -0.1 }, { hand: "AA", delta_ev_bb: 1.8 }] };
  const { add, drop } = compareOpenEv(base, exploit);
  assert.deepEqual(add.map(r => r.hand), ["K5o"]);
  assert.deepEqual(drop.map(r => r.hand), ["64s"]);
});

test("benchmark summary keeps only aggregates", () => {
  const rows = [
    { spot_id: "BTN_open", action: "open", ours: 42, reference: 40, diff: 2 },
    { spot_id: "SB_open", action: "open", ours: 5, reference: 34, diff: -29 },
    { spot_id: "BB_vs_BTN", action: null, ours: null, reference: null, diff: null },
  ];
  const summary = summarizeAgreement(rows, 3);
  assert.deepEqual(summary, {
    tolerance_pt: 3, spots_compared: 2, actions_compared: 2, mean_abs_diff_pt: 15.5, max_abs_diff_pt: 29,
    outside_tolerance: 1, spots_outside_tolerance: ["SB_open"], spots_missing: ["BB_vs_BTN"],
  });
});

test("width budget keeps hands nearest the boundary", () => {
  const base = { hands: [{ hand: "AA", open_freq: 100 }, { hand: "KK", open_freq: 100 }] }; // 12 open combos
  const add = [{ hand: "72o", base_ev_bb: -0.5 }, { hand: "A5s", base_ev_bb: -0.01 }, { hand: "K9s", base_ev_bb: -0.1 }];
  assert.deepEqual(limitToBudget({ add, drop: [] }, base, 0.5).add.map(r => r.hand), ["A5s"]);
});

test("adjusted opening spot opens added hands, folds dropped hands and explains them", () => {
  const spot = { hero: "BTN", open_size_bb: 2.5, hands: [
    { hand: "K5o", open: 0, fold: 100, open_size_bb: null },
    { hand: "64s", open: 100, fold: 0, open_size_bb: 2.5 },
    { hand: "AA", open: 100, fold: 0, open_size_bb: 2.5 },
  ] };
  const profile = { call: "high", three_bet: "normal" };
  const table = { profiles: { [profileKey(profile)]: { BTN: { add: [["K5o", 0.08]], drop: [["64s", -0.2]] } } } };
  const out = adjustOpeningSpot(spot, table, profile);
  assert.deepEqual(out.hands.map(r => [r.hand, r.open, r.fold, r.adjusted ?? null]), [["K5o", 100, 0, "add"], ["64s", 0, 100, "drop"], ["AA", 100, 0, null]]);
  assert.equal(adjustOpeningSpot(spot, table, {}), spot);
  assert.match(adjustmentReason(out.hands[1], out.table_profile), /コールされて不利.*オープンから除外.*100%/);
  const model = markAdjustedModel({ aggregates: new Map(spot.hands.map(r => [r.hand, { hand: r.hand }])) }, out);
  assert.equal(model.aggregates.get("K5o").adjusted, "add");
});

test("saved adjustments cover every non-default profile and stay within the width budget", () => {
  assert.equal(Object.keys(adjustments.profiles).length, 8);
  for (const [key, positions] of Object.entries(adjustments.profiles)) for (const spot of opening.spots) {
    const change = positions[spot.hero];
    assert.ok(change, `${key} ${spot.hero}`);
    const openCombos = spot.hands.reduce((sum, row) => sum + comboCount(row.hand) * row.open / 100, 0);
    for (const side of ["add", "drop"]) {
      const combos = change[side].reduce((sum, [hand]) => sum + comboCount(hand), 0);
      assert.ok(combos <= openCombos * adjustments.metadata.width_budget + 1e-9, `${key} ${spot.hero} ${side}`);
    }
    const rows = new Map(spot.hands.map(row => [row.hand, row]));
    for (const [hand] of change.add) assert.ok(rows.get(hand).open < 50, `${hand} already opens`);
    for (const [hand] of change.drop) assert.ok(rows.get(hand).open >= 50, `${hand} already folds`);
  }
});
