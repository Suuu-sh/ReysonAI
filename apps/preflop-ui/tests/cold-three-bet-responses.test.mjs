import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.js";
import { coldThreeBetSpots, validateColdThreeBetDataset, findColdThreeBetSpot, coldThreeBetMatrixModel } from "../src/estimated/cold-three-bet-responses.js";
import { callContexts, callFacts, allowedCall, THREE_BET_FILL_EV } from "../src/estimated/call-ev.js";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.js";
import { fourBetToSize, isInPosition, threeBetToSize } from "../src/estimated/sizing.js";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const data = load("cold-three-bet-responses");
const responses = load("preflop-ranges");
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"),
  fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"), multiway: load("multiway-responses"),
  squeezes: load("squeeze-responses"), limp: load("limp-responses"), coldThreeBets: load("cold-three-bet-responses") });
const comboCount = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const continued = spot => spot.hands.reduce((n, row) => n + comboCount(row.hand) * (100 - row.fold) / 100, 0);
const byId = id => data.spots.find(s => s.id === id);
const row = (id, hand) => byId(id).hands.find(r => r.hand === hand);

test("20 cold 3bet-response spots in seat order with the source 3bet and fixed 4bet sizes", () => {
  assert.equal(validateColdThreeBetDataset(data, responses), data);
  assert.equal(data.spots.length, 20);
  assert.deepEqual(data.spots.map(s => s.id), coldThreeBetSpots.map(s => s.id));
  assert.deepEqual(data.spots.slice(0, 4).map(s => s.id),
    ["CO_vs_HJ_3bet_UTGopen", "BTN_vs_HJ_3bet_UTGopen", "SB_vs_HJ_3bet_UTGopen", "BB_vs_HJ_3bet_UTGopen"]);
  assert.equal(data.spots.at(-1).id, "BB_vs_SB_3bet_BTNopen");
  for (const spot of data.spots) {
    const source = responses.spots.find(s => s.id === spot.source_response_id);
    assert.equal(source.opener, spot.opener);
    assert.equal(source.hero, spot.three_bettor);
    assert.equal(spot.three_bet_size_bb, source.three_bet_size_bb);
    assert.equal(spot.three_bet_size_bb, threeBetToSize(spot.opener, spot.three_bettor));
    assert.equal(spot.open_size_bb, 2.5);
    // Cold 4bet: 26BB in position, 20BB out of position (blinds vs HJ/CO/BTN).
    assert.equal(spot.four_bet_size_bb, fourBetToSize(spot.hero, spot.three_bettor));
    assert.equal(spot.four_bet_size_bb, isInPosition(spot.hero, spot.three_bettor) ? 26 : 20);
    assert.deepEqual(spot.hands.map(r => r.hand), hands);
    for (const r of spot.hands) {
      assert.deepEqual(Object.keys(r), ["hand", "fold", "call", "four_bet", "four_bet_size_bb"]);
      assert.equal(r.fold + r.call + r.four_bet, 100);
      assert.equal(r.four_bet_size_bb, r.four_bet > 0 ? spot.four_bet_size_bb : null);
    }
  }
  assert.equal(findColdThreeBetSpot(data, { opener: "HJ", threeBettor: "CO", hero: "BTN" }).id, "BTN_vs_CO_3bet_HJopen");
  assert.throws(() => findColdThreeBetSpot(data, { opener: "HJ", threeBettor: "BB", hero: "SB" }));
});

test("validation rejects wrong sizes, sources and broken rows", () => {
  const mutations = [
    d => { d.spots[0].four_bet_size_bb = 20; },
    d => { d.spots[2].three_bet_size_bb = 12; },
    d => { d.spots[5].source_response_id = "CO_vs_HJ"; },
    d => { const r = d.spots[0].hands.find(x => x.hand === "72o"); Object.assign(r, { fold: 90, call: 5 }); },
    d => { const r = d.spots[0].hands.find(x => x.hand === "AA"); Object.assign(r, { fold: 0, call: 0, four_bet: 100, four_bet_size_bb: null }); },
    d => { d.metadata.legal_actions = ["fold", "call", "all_in"]; },
    d => { d.spots.pop(); },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data); mutate(copy);
    assert.throws(() => validateColdThreeBetDataset(copy, responses));
  }
});

test("matrix model shows the saved 4bet / call / fold without synthetic EV", () => {
  const model = coldThreeBetMatrixModel(byId("SB_vs_BTN_3bet_COopen"));
  assert.equal(model.actionLabels.raise_four_bet, "4bet 20BB");
  for (const r of byId("SB_vs_BTN_3bet_COopen").hands) {
    assert.deepEqual(model.aggregates.get(r.hand).actions, { raise_four_bet: r.four_bet / 100, call: r.call / 100, fold: r.fold / 100 });
    assert.equal(model.aggregates.get(r.hand).ev, undefined);
  }
});

test("calls follow the shared EV rule with OPENER_BEHIND_EQR and the +0.50bb fill", () => {
  const d = datasets(), equities = load("call-equities");
  const contexts = callContexts(d).filter(c => c.type === "cold_three_bet");
  assert.equal(contexts.length, 20);
  for (const c of contexts) {
    assert.equal(c.input.opener_behind, true);
    for (const r of c.spot.hands) {
      const ev = callFacts(c, r.hand, equities.spots[c.spot.id].equities[r.hand]).call_ev_bb;
      assert.equal(r.call, allowedCall(r.call, ev), `${c.spot.id}/${r.hand}: ${ev}`);
      if (ev >= THREE_BET_FILL_EV) assert.equal(r.fold, 0, `${c.spot.id}/${r.hand}: ${ev}`);
    }
  }
});

test("cold continuation is far narrower than the heads-up response and widens with the 3bet", () => {
  for (const spot of data.spots) {
    const headsUp = responses.spots.find(s => s.opener === spot.three_bettor && s.hero === spot.hero);
    // Under half of Y's heads-up continuation versus the same seat's open.
    assert.ok(continued(spot) < continued(headsUp) / 2, `${spot.id}: ${continued(spot)} vs ${continued(headsUp)}`);
    // QQ+/AKs never fold; AA/KK keep a flat so the call range is not capped.
    for (const hand of ["AA", "KK", "QQ", "AKs"]) assert.equal(row(spot.id, hand).fold, 0, `${spot.id}/${hand}`);
    for (const hand of ["AA", "KK"]) assert.ok(row(spot.id, hand).call >= 20 && row(spot.id, hand).four_bet >= 70, `${spot.id}/${hand}`);
    // Trash never continues; wheel-ace blockers carry the 4bet bluffs.
    for (const hand of ["72o", "T4o", "96s"]) assert.equal(row(spot.id, hand).fold, 100, `${spot.id}/${hand}`);
    assert.ok(row(spot.id, "A5s").four_bet > 0 && row(spot.id, "A5s").call === 0, spot.id);
  }
  // A later opener means a wider 3bet: the same (3bettor, hero) continues more.
  for (const [early, late] of [["BB_vs_SB_3bet_UTGopen", "BB_vs_SB_3bet_HJopen"], ["BB_vs_SB_3bet_HJopen", "BB_vs_SB_3bet_COopen"],
    ["BB_vs_SB_3bet_COopen", "BB_vs_SB_3bet_BTNopen"], ["BTN_vs_CO_3bet_UTGopen", "BTN_vs_CO_3bet_HJopen"],
    ["BB_vs_BTN_3bet_UTGopen", "BB_vs_BTN_3bet_COopen"], ["SB_vs_BTN_3bet_UTGopen", "SB_vs_BTN_3bet_COopen"]]) {
    assert.ok(continued(byId(late)) > continued(byId(early)), `${early} < ${late}`);
  }
  // Out of position with players behind, the blinds flat less than an IP seat versus the same 3bet.
  const calls = spot => spot.hands.reduce((n, r) => n + comboCount(r.hand) * r.call / 100, 0);
  assert.ok(calls(byId("SB_vs_CO_3bet_HJopen")) < calls(byId("BTN_vs_CO_3bet_HJopen")));
  assert.ok(calls(byId("BB_vs_HJ_3bet_UTGopen")) < calls(byId("CO_vs_HJ_3bet_UTGopen")));
});

test("audit passes the cold 3bet responses and flags broken order, width and negative calls", () => {
  const report = auditEstimates(datasets());
  assert.deepEqual(report.findings.filter(f => data.spots.some(s => s.id === f.spot)), []);
  assert.equal(report.coldThreeBetDefense.length, 20);
  for (const d of report.coldThreeBetDefense) {
    assert.ok(d.heroFold > 0.9 && d.heroFold < 1 && d.openerFold > 0 && d.openerFold < 1);
    assert.ok(Math.abs(d.foldRate - d.heroFold * d.openerFold) < 1e-12);
  }

  const order = datasets();
  Object.assign(order.coldThreeBets.spots[0].hands.find(r => r.hand === "KK"), { fold: 100, call: 0, four_bet: 0, four_bet_size_bb: null });
  assert.ok(auditEstimates(order).findings.some(f => f.check === "strength-order" && f.spot === "CO_vs_HJ_3bet_UTGopen" && isBlockingAuditFinding(f)));

  const wide = datasets();
  for (const r of wide.coldThreeBets.spots[0].hands) Object.assign(r, { fold: 0, call: 0, four_bet: 100, four_bet_size_bb: 26 });
  assert.ok(auditEstimates(wide).findings.some(f => f.check === "cold-width" && f.spot === "CO_vs_HJ_3bet_UTGopen" && isBlockingAuditFinding(f)));

  const negative = datasets();
  Object.assign(negative.coldThreeBets.spots[0].hands.find(r => r.hand === "76s"), { fold: 50, call: 50 });
  assert.ok(auditEstimates(negative).findings.some(f => f.check === "negative-ev-call" && f.spot === "CO_vs_HJ_3bet_UTGopen" && isBlockingAuditFinding(f)));
});
