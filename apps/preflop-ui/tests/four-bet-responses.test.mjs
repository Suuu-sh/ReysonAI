import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands, sortActions } from "../src/data.js";
import { positions, rangeTypes } from "../src/estimated/ranges.js";
import { findFourBetSpot, fourBetMatrixModel, loadFourBetDataset, validateFourBetDataset } from "../src/estimated/four-bet-responses.js";

const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const data = read("four-bet-responses"), responses = read("preflop-ranges"), previous = read("three-bet-responses"), openings = read("opening-ranges");
const validate = d => validateFourBetDataset(d, responses, previous, openings);
const load = raw => loadFourBetDataset(raw, responses, previous, openings);

test("15 four-bet spots preserve original 3bettor Hero and both persisted raise-to sizes", () => {
  assert.equal(validate(data), data);
  assert.equal(rangeTypes.find(t => t.value === "four_bet").available, true);
  assert.equal(data.spots.reduce((n, s) => n + s.hands.length, 0), 2535);
  for (const before of previous.spots) {
    const s = findFourBetSpot(data, before.opener, before.three_bettor);
    const source = responses.spots.find(r => r.id === s.source_response_id);
    assert.equal(s.hero, before.three_bettor);
    assert.equal(s.three_bettor, s.hero);
    assert.notEqual(s.hero, s.opener);
    assert.equal(s.three_bet_size_bb, source.three_bet_size_bb);
    assert.equal(s.four_bet_size_bb, before.four_bet_size_bb);
    assert.equal(s.source_three_bet_response_id, before.id);
    assert.equal(s.hero_position_vs_opener, source.hero_position_vs_opener);
    assert.deepEqual(s.hands.map(r => r.hand), hands);
    assert.equal(s.all_in_size_bb, 100);
    for (const r of s.hands) {
      assert.equal(r.fold + r.call + r.all_in, 100);
      assert.equal(r.all_in_size_bb, r.all_in > 0 ? 100 : null);
      assert.ok(s.four_bet_size_bb >= 2 * s.three_bet_size_bb - 2.5);
      assert.ok(s.all_in_size_bb >= 2 * s.four_bet_size_bb - s.three_bet_size_bb);
    }
  }
  for (const opener of positions) for (const hero of positions) {
    if (positions.indexOf(hero) <= positions.indexOf(opener)) assert.throws(() => findFourBetSpot(data, opener, hero));
  }
  assert.throws(() => findFourBetSpot(data, "unknown", "BB"));
});

test("matrix displays exactly persisted conditional frequencies, excluding unreachable recommendations", () => {
  let unreachable = 0, reachableFold = 0;
  for (const s of data.spots) {
    const source = responses.spots.find(r => r.id === s.source_response_id);
    const model = fourBetMatrixModel(s, source);
    assert.deepEqual(model.actions, ["all_in", "call", "fold"]);
    assert.deepEqual(sortActions(model.actions), model.actions);
    assert.equal([...model.aggregates.values()].reduce((n, r) => n + r.comboCount, 0), 1326);
    for (const r of s.hands) {
      const before = source.hands.find(h => h.hand === r.hand);
      const a = model.aggregates.get(r.hand);
      assert.equal(a.unreachable, before.three_bet === 0);
      if (a.unreachable) {
        unreachable++;
        assert.equal(r.fold, 100);
        assert.match(r.reason, /対象外/);
        assert.deepEqual(a.actions, {});
      } else {
        assert.deepEqual(a.actions, { all_in: r.all_in / 100, call: r.call / 100, fold: r.fold / 100 });
        if (r.fold === 100) reachableFold++;
      }
      assert.equal(a.ev, undefined);
    }
  }
  assert.ok(unreachable > 0 && reachableFold > 0);
  assert.equal(findFourBetSpot(data, "BTN", "BB").four_bet_size_bb, 26.5);
});

test("every spot rejects malformed IDs, sizes, hand sets, frequencies, reasons and unreachable continuation", () => {
  const mutations = [
    s => { s.id += "bad"; }, s => { s.hero = s.opener; }, s => { s.three_bettor = s.opener; },
    s => { s.source_response_id = "bad"; }, s => { s.source_three_bet_response_id = "bad"; },
    s => { s.hero_position_vs_opener = "bad"; }, s => { s.open_size_bb = 3; },
    s => { s.effective_stack_bb = 50; }, s => { s.three_bet_size_bb += 0.5; },
    s => { s.four_bet_size_bb += 0.5; }, s => { s.four_bet_size_bb = 100; },
    s => { s.all_in_size_bb = 99; }, s => { s.all_in_size_bb = 101; },
    s => { s.hands.pop(); }, s => { s.hands[1] = s.hands[0]; }, s => { s.hands[0] = null; },
    s => { s.hands[0].hand = "KAo"; }, s => { s.hands[0].call = -1; },
    s => { s.hands[0].all_in = 101; }, s => { s.hands[0].call = NaN; },
    s => { s.hands[0].fold = Infinity; }, s => { s.hands[0].call = "10"; },
    s => { s.hands[0].fold += 1; }, s => { s.hands[0].all_in_size_bb = null; },
    s => { s.hands[0].all_in_size_bb = 100-s.three_bet_size_bb; },
    s => { s.hands[0].five_bet = 0; }, s => { s.hands[0].reason = " "; },
    s => { s.hands.find(r => r.hand === "72o").reason = "フォールド推奨"; },
    s => { const r = s.hands.find(r => r.hand === "72o"); r.fold = 95; r.call = 5; },
    s => { s.hands.find(r => r.hand === "72o").all_in_size_bb = 100; },
  ];
  for (let i = 0; i < 15; i++) for (const mutate of mutations) {
    const invalid = structuredClone(data);
    mutate(invalid.spots[i]);
    assert.throws(() => validate(invalid), `spot ${i}: ${mutate}`);
  }
});

test("metadata, missing/invalid JSON and upstream corruption fail closed without fallback", () => {
  for (const mutate of [
    d => { d.spots.pop(); }, d => { d.spots[0] = d.spots[1]; },
    d => { d.spot_count = 14; }, d => { d.entry_count = 1; }, d => { d.hand_classes_per_spot = 168; },
    d => { d.metadata.ante_bb = null; }, d => { d.metadata.game = "9max"; },
    d => { d.metadata.effective_stack_bb = 50; }, d => { d.metadata.open_size_bb = 3; },
    d => { d.metadata.strategy_type = "gto"; }, d => { d.metadata.legal_actions.push("five_bet"); },
  ]) {
    const invalid = structuredClone(data); mutate(invalid); assert.throws(() => validate(invalid));
    assert.equal(load(JSON.stringify(invalid)).data, undefined);
  }
  for (const raw of [undefined, "", "{", "null", "{}", "[]"]) {
    const result = load(raw);
    assert.ok(result.error); assert.equal(result.data, undefined);
  }
  assert.deepEqual(load(JSON.stringify(data)).data, data);
  for (let index = 0; index < 3; index++) {
    const deps = [responses, previous, openings].map(d => structuredClone(d));
    deps[index].metadata.ante_bb = null;
    assert.throws(() => validateFourBetDataset(data, ...deps));
    assert.throws(() => validateFourBetDataset(data, ...deps.map((d, i) => i === index ? undefined : d)));
  }
  const wrong = structuredClone(responses);
  wrong.spots[0].hands[0].three_bet_size_bb += 1;
  assert.throws(() => validateFourBetDataset(data, wrong, previous, openings));
});


test("reachable frequency boundaries accept pure fold, pure call and total-100BB all-in", () => {
  for (const frequencies of [[100, 0, 0], [0, 100, 0], [0, 0, 100]]) {
    const d = structuredClone(data);
    const r = d.spots[0].hands.find(h => h.hand === "AA");
    [r.fold, r.call, r.all_in] = frequencies;
    r.all_in_size_bb = r.all_in > 0 ? 100 : null;
    assert.equal(validate(d), d);
  }
});
