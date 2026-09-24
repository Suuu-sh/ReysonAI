import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.js";
import { findLimpResponseSpot, limpResponsesMatrixModel, validateLimpResponses } from "../src/estimated/limp-responses.js";

const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const opening = read("opening-ranges");
const data = read("limp-responses");

test("SB limp response datasets contain both 169-hand branches and configured sizes", () => {
  assert.equal(validateLimpResponses(data, opening), data);
  assert.deepEqual(data.spots.map(spot => spot.id), ["BB_vs_SB_limp", "SB_vs_BB_iso"]);
  assert.equal(data.entry_count, 338);
  assert.deepEqual(data.spots.map(spot => spot.hands.length), [169, 169]);
  assert.equal(data.spots[0].raise_size_bb, 3.5);
  assert.equal(data.spots[1].iso_size_bb, 3.5);
  assert.equal(data.spots[1].raise_to_bb, 10.5);
  for (const spot of data.spots) assert.deepEqual(spot.hands.map(row => row.hand), hands);
});

test("protected SB limps can call or reraise the iso; BB no longer value-isolates marginal broadways", () => {
  const sb = findLimpResponseSpot(data, "SB_vs_BB_iso");
  for (const hand of ["AA", "KK", "AKs"]) {
    const row = sb.hands.find(r => r.hand === hand);
    assert.equal(row.fold, 0);
    assert.ok(row.call > 0 && row.raise > 0);
  }
  const bb = findLimpResponseSpot(data, "BB_vs_SB_limp");
  for (const hand of ["K8s", "Q9s", "JTs", "K9o", "QJo"]) assert.equal(bb.hands.find(r => r.hand === hand).raise, 0);
  const isoPct = bb.hands.reduce((sum, row) => sum + (row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12) * row.raise, 0) / 1326;
  assert.ok(isoPct > 10 && isoPct < 25, `narrowed iso width: ${isoPct}`);
});

test("BB iso and SB limp-reraise matrices preserve combo-weighted frequencies and reachability", () => {
  const bb = findLimpResponseSpot(data, "BB_vs_SB_limp");
  const bbModel = limpResponsesMatrixModel(bb, opening);
  assert.deepEqual(bbModel.actions, ["raise_3.5", "check"]);
  assert.equal(bbModel.actionLabels["raise_3.5"], "アイソレイズ 3.5BB");
  for (const row of bb.hands) {
    const aggregate = bbModel.aggregates.get(row.hand);
    assert.equal(aggregate.actions["raise_3.5"], row.raise / 100);
    assert.equal(aggregate.actions.check, row.check / 100);
  }

  const sb = findLimpResponseSpot(data, "SB_vs_BB_iso");
  const sbModel = limpResponsesMatrixModel(sb, opening);
  assert.deepEqual(sbModel.actions, ["raise_10.5", "call", "fold"]);
  const limp = new Map(opening.spots.find(spot => spot.hero === "SB").hands.map(row => [row.hand, row.limp]));
  for (const row of sb.hands) {
    const aggregate = sbModel.aggregates.get(row.hand);
    if (limp.get(row.hand) === 0) {
      assert.equal(aggregate.unreachable, true);
      assert.deepEqual(aggregate.actions, {});
    } else {
      assert.equal(aggregate.unreachable, false);
      assert.equal(aggregate.actions["raise_10.5"], row.raise / 100);
      assert.equal(aggregate.actions.call, row.call / 100);
      assert.equal(aggregate.actions.fold, row.fold / 100);
    }
  }
});

test("limp response validation fails closed for malformed sizes, flow and unreachable hands", () => {
  const mutations = [
    d => { d.spots.pop(); },
    d => { d.spots[0].raise_size_bb = 3; },
    d => { d.spots[0].hands[0].check = 1; },
    d => { d.spots[1].hands[0].raise_size_bb = 9; },
    d => { d.metadata.rake.no_flop_no_drop = false; },
    d => {
      const row = d.spots[1].hands.find(item => opening.spots.find(s => s.hero === "SB").hands.find(h => h.hand === item.hand).limp === 0);
      Object.assign(row, { fold: 0, call: 100, raise: 0 });
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(data);
    mutate(invalid);
    assert.throws(() => validateLimpResponses(invalid, opening));
  }
});
