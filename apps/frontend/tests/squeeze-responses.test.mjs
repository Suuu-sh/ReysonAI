import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.ts";
import { squeezeResponseSpots, validateSqueezeDataset, findSqueezeSpot, squeezeMatrixModel } from "../src/estimated/squeeze-responses.ts";
import { callContexts, callFacts, allowedCall, callDefenseCapacity, squeezeFoldThreshold, THREE_BET_FILL_EV } from "../src/estimated/call-ev.ts";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { fourBetToSize, threeBetToSize } from "../src/estimated/sizing.ts";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const data = load("squeeze-responses");
const multiway = load("multiway-responses");
const responses = load("preflop-ranges");
const opening = load("opening-ranges");
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"),
  fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"), multiway: load("multiway-responses"),
  squeezes: load("squeeze-responses"), limp: load("limp-responses") });
const comboCount = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const cont = row => 100 - row.fold;
const reachOf = spot => {
  const source = spot.prior_action === null
    ? opening.spots.find(s => s.hero === spot.opener)
    : responses.spots.find(s => s.opener === spot.opener && s.hero === spot.caller);
  return new Map(source.hands.map(row => [row.hand, (spot.prior_action === null ? row.open : row.call) / 100]));
};

test("36 squeeze-response spots: 12 opener, 12 caller-after-fold, 12 caller-after-call, with source sizes", () => {
  assert.equal(validateSqueezeDataset(data, multiway, responses, opening), data);
  assert.equal(data.spots.length, 36);
  assert.deepEqual(data.spots.map(s => s.prior_action), [...Array(12).fill(null), ...Array(12).fill("fold"), ...Array(12).fill("call")]);
  for (const [i, spot] of data.spots.entries()) {
    const expected = squeezeResponseSpots[i];
    assert.equal(spot.id, expected.id);
    assert.equal(spot.hero, spot.prior_action === null ? spot.opener : spot.caller);
    const source = multiway.spots.find(s => s.id === spot.source_squeeze_id);
    assert.equal(source.hero, spot.squeezer);
    assert.equal(spot.squeeze_size_bb, source.squeeze_size_bb);
    assert.equal(spot.squeeze_size_bb, threeBetToSize(spot.opener, spot.squeezer, 1));
    // The opener and the caller are both in position against a blind squeezer: 26BB.
    assert.equal(spot.four_bet_size_bb, fourBetToSize(spot.hero, spot.squeezer));
    assert.equal(spot.four_bet_size_bb, 26);
    assert.deepEqual(spot.hands.map(row => row.hand), hands);
    const reach = reachOf(spot);
    for (const row of spot.hands) {
      assert.deepEqual(Object.keys(row), ["hand", "fold", "call", "four_bet", "four_bet_size_bb"]);
      assert.equal(row.fold + row.call + row.four_bet, 100);
      assert.equal(row.four_bet_size_bb, row.four_bet > 0 ? 26 : null);
      if (reach.get(row.hand) === 0) assert.equal(row.fold, 100, `${spot.id}/${row.hand}`);
    }
  }
  assert.equal(findSqueezeSpot(data, { opener: "UTG", caller: "HJ", squeezer: "BB" }).id, "UTG_vs_BB_squeeze_HJcall");
  assert.equal(findSqueezeSpot(data, { opener: "CO", caller: "BTN", squeezer: "BB", priorAction: "fold" }).id, "BTN_vs_BB_squeeze_COfold");
  assert.equal(findSqueezeSpot(data, { opener: "CO", caller: "BTN", squeezer: "SB", priorAction: "call" }).id, "BTN_vs_SB_squeeze_COcall");
  assert.throws(() => findSqueezeSpot(data, { opener: "BTN", caller: "CO", squeezer: "BB" }));
});

test("validation rejects wrong sizes, sources and non-placeholder unreachable rows", () => {
  const mutations = [
    d => { d.spots[0].four_bet_size_bb = 20; },
    d => { d.spots[13].squeeze_size_bb = 12; },
    d => { d.spots[30].source_squeeze_id = "BB_vs_UTG_HJcall"; },
    d => { const row = d.spots[0].hands.find(r => r.hand === "72o"); Object.assign(row, { fold: 90, call: 10 }); },
    d => { const row = d.spots[12].hands.find(r => r.hand === "AA"); Object.assign(row, { fold: 0, call: 0, four_bet: 100, four_bet_size_bb: null }); },
    d => { d.metadata.legal_actions = ["fold", "call", "all_in"]; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data); mutate(copy);
    assert.throws(() => validateSqueezeDataset(copy, multiway, responses, opening));
  }
});

test("matrix model shows the saved 4bet / call / fold without synthetic EV", () => {
  for (const spot of data.spots) {
    const model = squeezeMatrixModel(spot);
    assert.equal(model.actionLabels.raise_four_bet, "4bet 26BB");
    for (const row of spot.hands) {
      assert.deepEqual(model.aggregates.get(row.hand).actions, { raise_four_bet: row.four_bet / 100, call: row.call / 100, fold: row.fold / 100 });
      assert.equal(model.aggregates.get(row.hand).ev, undefined);
    }
  }
});

test("calls follow the shared EV rule; +0.50bb or better never folds", () => {
  const d = datasets(), equities = load("call-equities");
  const contexts = callContexts(d).filter(c => c.type === "squeeze");
  assert.equal(contexts.length, 36);
  for (const c of contexts) for (const row of c.spot.hands) {
    if (c.reach(row.hand) <= 0) continue;
    const ev = callFacts(c, row.hand, equities.spots[c.spot.id].equities[row.hand]).call_ev_bb;
    assert.equal(row.call, allowedCall(row.call, ev), `${c.spot.id}/${row.hand}`);
    if (ev >= THREE_BET_FILL_EV) assert.equal(row.fold, 0, `${c.spot.id}/${row.hand}: ${ev}`);
  }
});

test("shape: QQ+/AK 4bet core, calls stay protected, three-way is tighter, and the opener is tighter than heads-up", () => {
  const threeBets = load("three-bet-responses");
  for (const spot of data.spots) {
    const reach = reachOf(spot);
    const row = hand => spot.hands.find(r => r.hand === hand);
    if (spot.prior_action === null) {
      for (const hand of ["AA", "KK", "QQ", "AKs", "AKo"]) assert.equal(row(hand).fold, 0, `${spot.id}/${hand}`);
      assert.ok(row("AA").call > 0 && row("KK").call > 0, `${spot.id}: AA/KK keep flats`);
      assert.ok(row("AA").four_bet >= 50 && row("KK").four_bet >= 50);
      // Tighter than the heads-up 3bet response of the same opener vs the same blind.
      const hu = threeBets.spots.find(s => s.hero === spot.opener && s.three_bettor === spot.squeezer);
      const weighted = s => s.hands.reduce((n, r) => n + comboCount(r.hand) * reach.get(r.hand) * cont(r), 0);
      assert.ok(weighted(spot) < weighted(hu), spot.id);
    }
    if (spot.prior_action === "call") {
      const afterFold = data.spots.find(s => s.prior_action === "fold" && s.source_squeeze_id === spot.source_squeeze_id);
      for (const r of spot.hands) assert.ok(cont(r) <= cont(afterFold.hands.find(x => x.hand === r.hand)), `${spot.id}/${r.hand}`);
    }
    for (const r of spot.hands) if (reach.get(r.hand) === 0) assert.equal(r.fold, 100);
  }
  // Same squeezer and caller: facing the squeeze of a later (wider) opener, no hand continues much less.
  const tier = ["UTG", "HJ", "CO"];
  for (const early of data.spots.filter(s => s.prior_action !== null)) for (const late of data.spots) {
    if (late.prior_action !== early.prior_action || late.squeezer !== early.squeezer || late.caller !== early.caller ||
        tier.indexOf(late.opener) <= tier.indexOf(early.opener)) continue;
    const reachEarly = reachOf(early), reachLate = reachOf(late);
    for (const r of early.hands) {
      if (!reachEarly.get(r.hand) || !reachLate.get(r.hand)) continue;
      assert.ok(cont(r) - cont(late.hands.find(x => x.hand === r.hand)) <= 10, `${early.id} vs ${late.id}/${r.hand}`);
    }
  }
});

test("squeeze auto-profit: opener × caller fold is within break-even, or a proven EV-capacity conflict", () => {
  assert.equal(squeezeFoldThreshold({ squeezer: "BB", squeeze_size_bb: 13, open_size_bb: 2.5 }), 12 / 18.5);
  assert.equal(squeezeFoldThreshold({ squeezer: "SB", squeeze_size_bb: 13, open_size_bb: 2.5 }), 12.5 / 19);
  const d = datasets(), equities = load("call-equities");
  const report = auditEstimates(d);
  assert.equal(report.squeezeDefense.length, 12);
  const contexts = callContexts(d);
  for (const item of report.squeezeDefense) {
    if (item.foldRate <= item.threshold) continue;
    const finding = report.findings.find(f => f.spot === item.spot && f.check === "ev-capacity-conflict");
    assert.equal(finding?.severity, "warn", item.spot);
    // Both decisions already call every legal hand (within the strength-order limits).
    for (const prior of [null, "fold"]) {
      const c = contexts.find(x => x.spot.source_squeeze_id === item.spot && x.spot.prior_action === prior);
      const capacity = callDefenseCapacity(c, equities, { ordered: true });
      const saved = c.spot.hands.reduce((n, r) => n + comboCount(r.hand) * c.reach(r.hand) * r.fold / 100, 0) /
        c.spot.hands.reduce((n, r) => n + comboCount(r.hand) * c.reach(r.hand), 0);
      assert.ok(saved <= capacity.minimumFoldRate + 1e-9, `${c.spot.id}`);
    }
  }
  // Dropping every call where defense is feasible must block publication.
  const feasible = report.squeezeDefense.find(item => item.foldRate <= item.threshold);
  for (const spot of d.squeezes.spots.filter(s => s.source_squeeze_id === feasible.spot && s.prior_action !== "call")) {
    for (const row of spot.hands) { row.fold += row.call; row.call = 0; }
  }
  assert.ok(auditEstimates(d).findings.some(f => f.check === "auto-profit" && f.spot === feasible.spot && isBlockingAuditFinding(f)));
});

test("audit flags a reachable row folded as a placeholder violation only when it is unreachable", () => {
  const d = datasets();
  const spot = d.squeezes.spots.find(s => s.id === "BTN_vs_BB_squeeze_COfold");
  const row = spot.hands.find(r => r.hand === "AA"); // BTN never flats AA versus a CO open
  Object.assign(row, { fold: 50, call: 50 });
  assert.ok(auditEstimates(d).findings.some(f => f.check === "range-flow" && f.spot === spot.id && isBlockingAuditFinding(f)));
});
