import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.js";
import { rangeTypes } from "../src/estimated/ranges.js";
import { findOpeningSpot, openingMatrixModel, validateOpeningDataset } from "../src/estimated/opening-ranges.js";

const source = JSON.parse(readFileSync(new URL("../src/estimated/opening-ranges.json", import.meta.url), "utf8"));
test("every response matchup has its own opener's complete comparison range", () => {
  const responses = JSON.parse(readFileSync(new URL("../src/estimated/preflop-ranges.json", import.meta.url), "utf8"));
  for (const response of responses.spots) {
    const opening = findOpeningSpot(source, response.opener);
    assert.equal(opening.hero, response.opener);
    assert.notEqual(opening.hero, response.hero);
    assert.equal(opening.open_size_bb, response.open_size_bb);
    assert.equal(opening.effective_stack_bb, response.effective_stack_bb);
    assert.deepEqual(opening.hands.map(row => row.hand), response.hands.map(row => row.hand));
  }
});
test("five positions include all 845 canonical RFI records", () => {
  assert.equal(validateOpeningDataset(source), source);
  assert.equal(rangeTypes.find(type => type.value === "open").available, true);
  assert.deepEqual(source.spots.map(spot => spot.hero), ["UTG", "HJ", "CO", "BTN", "SB"]);
  for (const spot of source.spots) {
    assert.equal(findOpeningSpot(source, spot.hero), spot);
    assert.deepEqual(new Set(spot.hands.map(row => row.hand)), new Set(hands));
    for (const row of spot.hands) {
      const hasLimp = spot.hero === "SB";
      assert.deepEqual(Object.keys(row), hasLimp
        ? ["hand", "open", "limp", "fold", "open_size_bb", "limp_size_bb"]
        : ["hand", "open", "fold", "open_size_bb"]);
      assert.equal(row.open + (row.limp ?? 0) + row.fold, 100);
      assert.ok(row.open >= 0 && row.open <= 100);
      assert.ok(row.fold >= 0 && row.fold <= 100);
      assert.equal(row.open_size_bb, row.open > 0 ? 2.5 : null);
      if (hasLimp) assert.equal(row.limp_size_bb, row.limp > 0 ? 1 : null);
    }
  }
  assert.throws(() => findOpeningSpot(source, "BB"));
});
test("opening matrix preserves JSON percentages without call or 3bet", () => {
  for (const spot of source.spots) {
    const { actions, aggregates } = openingMatrixModel(spot);
    assert.deepEqual(actions, ["raise_2.5", "limp", "fold"]);
    assert.equal(aggregates.size, 169);
    assert.equal([...aggregates.values()].reduce((sum, row) => sum + row.comboCount, 0), 1326);
    for (const row of spot.hands) {
      assert.deepEqual(aggregates.get(row.hand).actions,
        { "raise_2.5": row.open / 100, limp: (row.limp ?? 0) / 100, fold: row.fold / 100 });
    }
    assert.equal(modelActionLabel(spot), "リンプ");
  }
});
test("premium hands open, weak hands fold, and later seats have wider authored RFI ranges", () => {
  const weighted = source.spots.map(spot => {
    for (const hand of ["AA", "KK", "QQ", "AKs", "AKo"]) {
      assert.equal(spot.hands.find(row => row.hand === hand).open, 100);
    }
    assert.equal(spot.hands.find(row => row.hand === "72o").open, 0);
    return spot.hands.reduce((sum, row) => sum + row.open * (row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12), 0);
  });
  assert.ok(weighted[0] < weighted[1] && weighted[1] < weighted[2] && weighted[2] < weighted[3]);
  assert.ok(source.metadata.sb_policy.includes('リンプ'));
  const sb = findOpeningSpot(source, "SB");
  const actionWeightedPct = action => sb.hands.reduce((sum, row) => sum + row[action] * (row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12), 0) / 1326;
  assert.ok(actionWeightedPct("limp") > actionWeightedPct("open"));
});
test("opening dataset validation rejects malformed records and unsupported conditions", () => {
  for (const mutate of [
    d => { d.spots.pop(); },
    d => { d.spots[0] = d.spots[1]; },
    d => { d.spots[0].hero = "BB"; },
    d => { d.spots[0].hands.pop(); },
    d => { d.spots[0].hands[0].open = 101; },
    d => { d.spots[0].hands[0].fold = 1; },
    d => { d.spots[0].hands[0].open = NaN; },
    d => { d.spots[0].hands[0].open_size_bb = null; },
    d => { d.spots[0].hands[1] = d.spots[0].hands[0]; },
    d => { d.spots[0].hands[0].hand = "KAo"; },
    d => { d.metadata.open_size_bb = 3; },
    d => { d.spots.find(s => s.hero === "SB").hands[0].limp = 101; },
    d => { d.spots.find(s => s.hero === "SB").hands[0].limp_size_bb = 1; },
    d => { d.spots.find(s => s.hero === "UTG").hands[0].limp = 0; },
    d => { d.metadata.rake.cap_bb = null; },
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid);
    assert.throws(() => validateOpeningDataset(invalid));
  }
});

function modelActionLabel(spot) {
  return openingMatrixModel(spot).actionLabels.limp;
}
