import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.js";
import { multiwayMatchups, multiwaySpots, validateMultiwayDataset, findMultiwaySpot, multiwayMatrixModel } from "../src/estimated/multiway-responses.js";
import { callContexts, callFacts, allowedCall } from "../src/estimated/call-ev.js";
import { threeBetToSize } from "../src/estimated/sizing.js";

const data = JSON.parse(readFileSync(new URL("../src/estimated/multiway-responses.json", import.meta.url), "utf8"));
const headsUp = JSON.parse(readFileSync(new URL("../src/estimated/preflop-ranges.json", import.meta.url), "utf8"));
const comboCount = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const weightedCombos = (rows, action) => rows.reduce((sum, row) => sum + comboCount(row.hand) * row[action] / 100, 0);

test("six BB and six SB open-plus-one-caller spots contain 169 canonical integer rows", () => {
  assert.equal(validateMultiwayDataset(data), data);
  assert.equal(data.spots.length, 12);
  assert.equal(data.spots.reduce((total, spot) => total + spot.hands.length, 0), 2028);
  assert.deepEqual(data.spots.map(spot => spot.hero), [...Array(6).fill("BB"), ...Array(6).fill("SB")]);
  for (const { hero, opener, caller } of multiwaySpots) {
    const spot = findMultiwaySpot(data, opener, caller, hero);
    assert.equal(spot.id, `${hero}_vs_${opener}_${caller}call`);
    assert.deepEqual(spot.callers, [caller]);
    assert.equal(spot.hero, hero);
    assert.equal(spot.squeeze_size_bb, threeBetToSize(opener, hero, 1));
    assert.equal(spot.squeeze_size_bb, 13);
    assert.deepEqual(spot.hands.map(row => row.hand), hands);
    for (const row of spot.hands) {
      assert.deepEqual(Object.keys(row), ["hand", "fold", "call", "squeeze", "squeeze_size_bb"]);
      assert.ok([row.fold, row.call, row.squeeze].every(value => Number.isInteger(value) && value >= 0 && value <= 100));
      assert.equal(row.fold + row.call + row.squeeze, 100);
      assert.equal(row.squeeze_size_bb, row.squeeze > 0 ? spot.squeeze_size_bb : null);
    }
    assert.equal(spot.hands.find(row => row.hand === "AA").fold, 0);
    assert.equal(spot.hands.find(row => row.hand === "72o").fold, 100);
  }
  // hero defaults to BB so existing callers keep working.
  for (const [opener, caller] of multiwayMatchups) assert.equal(findMultiwaySpot(data, opener, caller).hero, "BB");
  assert.throws(() => findMultiwaySpot(data, "BTN", "CO"));
  assert.throws(() => findMultiwaySpot(data, "UTG", "SB"));
  assert.throws(() => findMultiwaySpot(data, "UTG", "HJ", "CO"));
});

test("matrix model uses stored squeeze, call and fold values without synthetic EV", () => {
  for (const spot of data.spots) {
    const model = multiwayMatrixModel(spot);
    assert.deepEqual(model.actions, ["squeeze", "call", "fold"]);
    assert.equal(model.actionLabels.squeeze, `スクイーズ ${spot.squeeze_size_bb}BB`);
    assert.equal([...model.aggregates.values()].reduce((sum, entry) => sum + entry.comboCount, 0), 1326);
    for (const row of spot.hands) {
      const entry = model.aggregates.get(row.hand);
      assert.deepEqual(entry.actions, { squeeze: row.squeeze / 100, call: row.call / 100, fold: row.fold / 100 });
      assert.equal(entry.ev, undefined);
    }
  }
});

test("EV-aware multiway defense is not forced to a heads-up width floor and keeps squeezes unchanged", () => {
  const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
  const equities = read("call-equities");
  const contexts = callContexts({ opening: read("opening-ranges"), responses: headsUp, multiway: data });
  const reductions = read("call-ev-report");
  const continuation = new Map();
  for (const spot of data.spots) {
    const source = headsUp.spots.find(row => row.opener === spot.opener && row.hero === spot.hero);
    const call = weightedCombos(spot.hands, "call");
    const squeeze = weightedCombos(spot.hands, "squeeze");
    // The old 80%-of-HU floor preceded current-range EQR/EV. It would restore
    // losing calls; actual three-way EV, not a width target, now selects hands.
    assert.ok((call + squeeze) / 1326 * 100 <= reductions.spots[spot.id].before_continuation_pct + 1e-9);
    const context = contexts.find(c => c.spot.id === spot.id);
    for (const row of spot.hands) {
      const facts = callFacts(context, row.hand, equities.spots[spot.id].equities[row.hand]);
      assert.equal(row.call, allowedCall(row.call, facts.call_ev_bb), `${spot.id}/${row.hand}`);
    }
    // BB closes the action and calls wider than it squeezes; SB (BB still behind) is squeeze-or-fold first.
    if (spot.hero === "BB") assert.ok(squeeze < call, spot.id);
    else assert.ok(squeeze > call && call > 0, spot.id);
    assert.ok(squeeze <= weightedCombos(source.hands, "three_bet"), spot.id);
    continuation.set(spot.id, call + squeeze);
  }
  for (const hero of ["BB", "SB"]) for (const opener of ["UTG", "HJ"]) {
    const callers = opener === "UTG" ? ["HJ", "CO", "BTN"] : ["CO", "BTN"];
    const widths = callers.map(caller => continuation.get(`${hero}_vs_${opener}_${caller}call`));
    assert.ok(widths.every((width, index) => index === 0 || widths[index - 1] <= width), `${hero}/${opener}`);
  }
  // SB widens as the opener moves later (UTG → HJ → CO).
  const sbWidths = ["UTG_BTN", "HJ_BTN", "CO_BTN"].map(pair => continuation.get(`SB_vs_${pair}call`));
  assert.ok(sbWidths.every((width, index) => index === 0 || sbWidths[index - 1] < width));
});

test("SB with BB behind flats clearly less than BB, keeps strong hands in its call, and only +EV calls", () => {
  const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
  const equities = read("call-equities");
  const contexts = callContexts({ opening: read("opening-ranges"), responses: headsUp, multiway: data });
  for (const [opener, caller] of multiwayMatchups) {
    const sb = findMultiwaySpot(data, opener, caller, "SB");
    const bb = findMultiwaySpot(data, opener, caller, "BB");
    assert.ok(weightedCombos(sb.hands, "call") * 3 < weightedCombos(bb.hands, "call"), sb.id);
    assert.ok(weightedCombos(sb.hands, "call") + weightedCombos(sb.hands, "squeeze") < weightedCombos(bb.hands, "call") + weightedCombos(bb.hands, "squeeze"), sb.id);
    // The flat is protected: AA/KK/AKs keep some calls, so it is never capped.
    for (const hand of ["AA", "KK", "AKs"]) assert.ok(sb.hands.find(row => row.hand === hand).call > 0, `${sb.id}/${hand}`);
    const context = contexts.find(c => c.spot.id === sb.id);
    assert.equal(context.input.bb_behind, true);
    for (const row of sb.hands) {
      if (!row.call) continue;
      const ev = callFacts(context, row.hand, equities.spots[sb.id].equities[row.hand]).call_ev_bb;
      assert.ok(ev >= -0.05, `${sb.id}/${row.hand}: ${ev}`);
      if (ev < 0.05) assert.ok(row.call <= 50, `${sb.id}/${row.hand}`);
    }
    // Offsuit trash and suited connectors never call.
    for (const hand of ["KJo", "76s", "22"]) assert.equal(sb.hands.find(row => row.hand === hand).call, 0, `${sb.id}/${hand}`);
  }
});

test("validator rejects corrupt contexts, ordering, percentages, sizes and extra row fields", () => {
  const changes = [
    d => { d.metadata.strategy_type = "gto"; },
    d => { d.metadata.ante_bb = 0.5; },
    d => { d.metadata.legal_actions.push("all_in"); },
    d => { d.spot_count = 6; },
    d => { d.entry_count = 1014; },
    d => { d.spots.splice(6); },
    d => { d.spots[6].hero = "BB"; },
    d => { d.spots[6].id = "BB_vs_UTG_HJcall"; },
    d => { [d.spots[0], d.spots[6]] = [d.spots[6], d.spots[0]]; },
    d => { d.spots[11].squeeze_size_bb = 12; },
    d => { d.spots[11].hands.find(row => row.hand === "AA").squeeze_size_bb = 12; },
    d => { d.spots.reverse(); },
    d => { d.spots[0].id = "bad"; },
    d => { d.spots[0].callers = ["CO"]; },
    d => { d.spots[0].hero = "SB"; },
    d => { d.spots[0].squeeze_size_bb = 12; },
    d => { d.spots[0].hands.pop(); },
    d => { [d.spots[0].hands[0], d.spots[0].hands[1]] = [d.spots[0].hands[1], d.spots[0].hands[0]]; },
    d => { d.spots[0].hands[0].call = 0.5; },
    d => { d.spots[0].hands[0].fold = -1; },
    d => { d.spots[0].hands[0].squeeze = 101; },
    d => { d.spots[0].hands[0].fold = 1; },
    d => { d.spots[0].hands[0].squeeze_size_bb = null; },
    d => { d.spots[0].hands.find(row => row.hand === "72o").squeeze_size_bb = 13; },
    d => { d.spots[0].hands[0].reason = "not here"; },
  ];
  for (const mutate of changes) {
    const invalid = structuredClone(data);
    mutate(invalid);
    assert.throws(() => validateMultiwayDataset(invalid), String(mutate));
  }
});
