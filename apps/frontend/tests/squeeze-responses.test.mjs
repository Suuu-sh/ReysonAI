import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.ts";
import { squeezeResponseSpots, validateSqueezeDataset, findSqueezeSpot, squeezeMatrixModel } from "../src/estimated/squeeze-responses.ts";
import { callContexts, callFacts, allowedCall, callDefenseCapacity, squeezeFoldThreshold, THREE_BET_FILL_EV } from "../src/estimated/call-ev.ts";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { fourBetToSize, squeezeFourBetToSize, threeBetToSize } from "../src/estimated/sizing.ts";

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
const newHistoryIds = [
  "CO_vs_UTG_HJcall", "BTN_vs_UTG_HJcall", "BTN_vs_UTG_COcall", "BTN_vs_HJ_COcall",
  "BB_vs_UTG_SBcall", "BB_vs_HJ_SBcall", "BB_vs_CO_SBcall", "BB_vs_BTN_SBcall",
];
const historyReachable = spot => opening.spots.find(s => s.hero === spot.opener).hands.some(row => row.open > 0) &&
  responses.spots.find(s => s.opener === spot.opener && s.hero === spot.caller).hands.some(row => row.call > 0);
const reachOf = spot => {
  const source = spot.prior_action === null
    ? opening.spots.find(s => s.hero === spot.opener)
    : responses.spots.find(s => s.opener === spot.opener && s.hero === spot.caller);
  return new Map(source.hands.map(row => [row.hand, historyReachable(spot)
    ? (spot.prior_action === null ? row.open : row.call) / 100 : 0]));
};

test("60 squeeze-response spots: 20 opener, 20 caller-after-fold, 20 caller-after-call, with source sizes", () => {
  assert.equal(validateSqueezeDataset(data, multiway, responses, opening), data);
  assert.equal(data.spots.length, 60);
  assert.equal(data.entry_count, 10140);
  assert.deepEqual(data.spots.map(s => s.prior_action), [...Array(20).fill(null), ...Array(20).fill("fold"), ...Array(20).fill("call")]);
  const oldMatchups = ["UTG_HJ", "UTG_CO", "UTG_BTN", "HJ_CO", "HJ_BTN", "CO_BTN"];
  const historyIds = ["BB", "SB"].flatMap(s => oldMatchups.map(pair => `${s}_vs_${pair}call`)).concat(newHistoryIds);
  for (let stage = 0; stage < 3; stage += 1) {
    assert.deepEqual(data.spots.slice(stage * 20, (stage + 1) * 20).map(s => s.source_squeeze_id), historyIds);
  }
  for (const [i, spot] of data.spots.entries()) {
    const expected = squeezeResponseSpots[i];
    assert.equal(spot.id, expected.id);
    assert.equal(spot.hero, spot.prior_action === null ? spot.opener : spot.caller);
    const source = multiway.spots.find(s => s.id === spot.source_squeeze_id);
    assert.equal(source.hero, spot.squeezer);
    assert.equal(spot.squeeze_size_bb, source.squeeze_size_bb);
    assert.equal(spot.squeeze_size_bb, threeBetToSize(spot.opener, spot.squeezer, 1));
    assert.equal(spot.four_bet_size_bb, squeezeFourBetToSize(spot.hero, spot.squeezer));
    const fourBet = spot.hero === "SB" ? 24 : 26;
    assert.equal(spot.four_bet_size_bb, fourBet);
    assert.ok(spot.four_bet_size_bb >= 2 * spot.squeeze_size_bb - spot.open_size_bb, `${spot.id}: full-raise minimum`);
    assert.equal(spot.unreachable === true, !historyReachable(spot));
    assert.deepEqual(spot.hands.map(row => row.hand), hands);
    const reach = reachOf(spot);
    for (const row of spot.hands) {
      assert.deepEqual(Object.keys(row), ["hand", "fold", "call", "four_bet", "four_bet_size_bb"]);
      assert.equal(row.fold + row.call + row.four_bet, 100);
      assert.equal(row.four_bet_size_bb, row.four_bet > 0 ? fourBet : null);
      if (reach.get(row.hand) === 0) assert.equal(row.fold, 100, `${spot.id}/${row.hand}`);
    }
  }
  assert.equal(findSqueezeSpot(data, { opener: "UTG", caller: "HJ", squeezer: "BB" }).id, "UTG_vs_BB_squeeze_HJcall");
  assert.equal(findSqueezeSpot(data, { opener: "CO", caller: "BTN", squeezer: "BB", priorAction: "fold" }).id, "BTN_vs_BB_squeeze_COfold");
  assert.equal(findSqueezeSpot(data, { opener: "CO", caller: "BTN", squeezer: "SB", priorAction: "call" }).id, "BTN_vs_SB_squeeze_COcall");
  assert.equal(findSqueezeSpot(data, { opener: "UTG", caller: "HJ", squeezer: "CO" }).id, "UTG_vs_CO_squeeze_HJcall");
  assert.equal(findSqueezeSpot(data, { opener: "HJ", caller: "CO", squeezer: "BTN", priorAction: "fold" }).id, "CO_vs_BTN_squeeze_HJfold");
  assert.equal(findSqueezeSpot(data, { opener: "BTN", caller: "SB", squeezer: "BB", priorAction: "call" }).id, "SB_vs_BB_squeeze_BTNcall");
  assert.throws(() => findSqueezeSpot(data, { opener: "BTN", caller: "CO", squeezer: "BB" }));
});

test("squeeze-only 26BB 4bets preserve every heads-up and blind-squeeze fixed size", () => {
  const postflopOrder = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
  for (const hero of postflopOrder) for (const villain of postflopOrder) {
    if (hero === villain) continue;
    const headsUpSize = hero === "SB" && villain === "BB" ? 24 :
      postflopOrder.indexOf(hero) > postflopOrder.indexOf(villain) ? 26 : 20;
    assert.equal(fourBetToSize(hero, villain), headsUpSize, `${hero}/${villain}: heads-up unchanged`);
  }
  for (const [opener, caller, squeezer] of [["UTG", "HJ", "CO"], ["UTG", "HJ", "BTN"], ["UTG", "CO", "BTN"], ["HJ", "CO", "BTN"]]) {
    assert.equal(threeBetToSize(opener, squeezer, 1), 12);
    for (const hero of [opener, caller]) {
      assert.equal(fourBetToSize(hero, squeezer), 20, `${hero}/${squeezer}: heads-up unchanged`);
      assert.equal(squeezeFourBetToSize(hero, squeezer), 26);
    }
  }
  for (const hero of ["UTG", "HJ", "CO", "BTN"]) for (const squeezer of ["SB", "BB"]) {
    assert.equal(fourBetToSize(hero, squeezer), 26);
    assert.equal(squeezeFourBetToSize(hero, squeezer), 26);
  }
  assert.equal(fourBetToSize("SB", "BB"), 24);
  assert.equal(squeezeFourBetToSize("SB", "BB"), 24);
  assert.equal(fourBetToSize("BB", "SB"), 26);
  assert.throws(() => squeezeFourBetToSize("CO", "CO"));
});

test("validation rejects wrong sizes, sources and non-placeholder unreachable rows", () => {
  const mutations = [
    d => { d.spots[0].four_bet_size_bb = 20; },
    d => { d.spots[13].squeeze_size_bb = 13; },
    d => { d.spots[30].source_squeeze_id = "BB_vs_UTG_HJcall"; },
    d => { const row = d.spots[0].hands.find(r => r.hand === "72o"); Object.assign(row, { fold: 90, call: 10 }); },
    d => { const row = d.spots[12].hands.find(r => r.hand === "AA"); Object.assign(row, { fold: 0, call: 0, four_bet: 100, four_bet_size_bb: null }); },
    d => { d.metadata.legal_actions = ["fold", "call", "all_in"]; },
    d => { delete d.spots.find(s => s.caller === "SB").unreachable; },
    d => { d.spots[0].unreachable = true; },
    d => { Object.assign(d.spots.find(s => s.caller === "SB").hands[0], { fold: 90, call: 10 }); },
    d => {
      const spot = d.spots.find(s => s.squeezer === "CO");
      spot.four_bet_size_bb = 20;
      for (const row of spot.hands) if (row.four_bet > 0) row.four_bet_size_bb = 20;
    },
    d => {
      const spot = d.spots.find(s => s.squeezer === "BTN");
      spot.four_bet_size_bb = 20;
      for (const row of spot.hands) if (row.four_bet > 0) row.four_bet_size_bb = 20;
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data); mutate(copy);
    assert.throws(() => validateSqueezeDataset(copy, multiway, responses, opening));
  }
});

test("only proven unreachable histories may have an empty squeeze range; missing sources never pass", () => {
  const emptyReachable = structuredClone(multiway);
  for (const row of emptyReachable.spots[0].hands) Object.assign(row, { fold: 100, call: 0, squeeze: 0, squeeze_size_bb: null });
  assert.throws(() => validateSqueezeDataset(data, emptyReachable, responses, opening));

  const missingSqueeze = structuredClone(multiway);
  missingSqueeze.spots = missingSqueeze.spots.filter(s => s.id !== "BB_vs_UTG_SBcall");
  assert.throws(() => validateSqueezeDataset(data, missingSqueeze, responses, opening));
  for (const source of ["opening", "response"]) {
    const o = structuredClone(opening), r = structuredClone(responses);
    const dataset = source === "opening" ? o : r;
    const id = source === "opening" ? "UTG_open" : "SB_vs_UTG";
    dataset.spots = dataset.spots.filter(s => s.id !== id);
    assert.throws(() => validateSqueezeDataset(data, multiway, r, o));
  }
  const incompleteCalls = structuredClone(responses);
  incompleteCalls.spots.find(s => s.id === "SB_vs_UTG").hands.pop();
  assert.throws(() => validateSqueezeDataset(data, multiway, incompleteCalls, opening));
  const malformedCalls = structuredClone(responses);
  delete malformedCalls.spots.find(s => s.id === "SB_vs_UTG").hands[0].call;
  assert.throws(() => validateSqueezeDataset(data, multiway, malformedCalls, opening));
  assert.throws(() => validateSqueezeDataset(data, multiway));
});

test("the twelve SB-caller response spots are full placeholders without fabricated call-equity entries", () => {
  const unreachable = data.spots.filter(spot => !historyReachable(spot));
  assert.equal(unreachable.length, 12);
  const contexts = callContexts(datasets()).filter(c => c.type === "squeeze");
  assert.equal(contexts.length, 48);
  const equities = load("call-equities"), report = load("call-ev-report");
  for (const spot of unreachable) {
    assert.equal(spot.caller, "SB");
    assert.equal(spot.unreachable, true);
    for (const row of spot.hands) assert.deepEqual(row, {
      hand: row.hand, fold: 100, call: 0, four_bet: 0, four_bet_size_bb: null,
    });
    assert.ok(!contexts.some(c => c.spot.id === spot.id));
    assert.ok(!Object.hasOwn(equities.spots, spot.id));
    assert.ok(!Object.hasOwn(report.spots, spot.id));
  }
});

test("matrix model shows the saved 4bet / call / fold without synthetic EV", () => {
  for (const spot of data.spots) {
    const model = squeezeMatrixModel(spot);
    assert.equal(model.actionLabels.raise_four_bet, `4bet ${spot.four_bet_size_bb}BB`);
    for (const row of spot.hands) {
      assert.deepEqual(model.aggregates.get(row.hand).actions, { raise_four_bet: row.four_bet / 100, call: row.call / 100, fold: row.fold / 100 });
      assert.equal(model.aggregates.get(row.hand).ev, undefined);
    }
  }
});

test("calls follow the shared EV rule; +0.50bb or better never folds", () => {
  const d = datasets(), equities = load("call-equities");
  const contexts = callContexts(d).filter(c => c.type === "squeeze");
  assert.equal(contexts.length, 48);
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
    if (spot.prior_action === null && historyReachable(spot)) {
      for (const hand of ["AA", "KK", "QQ", "AKs", "AKo"]) assert.equal(row(hand).fold, 0, `${spot.id}/${hand}`);
      assert.ok(row("AA").call > 0 && row("KK").call > 0, `${spot.id}: AA/KK keep flats`);
      assert.ok(row("AA").four_bet >= 50 && row("KK").four_bet >= 50);
      // Tighter than the heads-up 3bet response of the same opener vs the same squeezer.
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
  const tier = ["UTG", "HJ", "CO", "BTN"];
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
  assert.equal(squeezeFoldThreshold({ squeezer: "CO", squeeze_size_bb: 12, open_size_bb: 2.5 }), 12 / 18.5);
  assert.equal(squeezeFoldThreshold({ squeezer: "BTN", squeeze_size_bb: 12, open_size_bb: 2.5 }), 12 / 18.5);
  const d = datasets(), equities = load("call-equities");
  const report = auditEstimates(d);
  assert.equal(report.squeezeDefense.length, 16);
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
  // Any hand BTN never flats versus a CO open is an unreachable placeholder here.
  const flats = new Map(d.responses.spots.find(s => s.id === "BTN_vs_CO").hands.map(r => [r.hand, r.call]));
  const row = spot.hands.find(r => flats.get(r.hand) === 0 && r.fold === 100);
  Object.assign(row, { fold: 50, call: 50 });
  assert.ok(auditEstimates(d).findings.some(f => f.check === "range-flow" && f.spot === spot.id && isBlockingAuditFinding(f)));
});

test("audit rejects any recommendation in a wholly unreachable opener or caller response", () => {
  for (const prior of [null, "fold", "call"]) {
    const d = datasets();
    const spot = d.squeezes.spots.find(s => s.caller === "SB" && s.prior_action === prior);
    // AA reaches the opener's RFI, but no SB hand reaches the original cold
    // call: even the opener's strongest hand is a placeholder in this history.
    Object.assign(spot.hands.find(row => row.hand === "AA"), { fold: 50, call: 50 });
    assert.ok(auditEstimates(d).findings.some(f => f.check === "range-flow" && f.spot === spot.id && isBlockingAuditFinding(f)), spot.id);
  }
});

test("every new squeeze-response spot has 169 saved reasons with correct OOP or unreachable facts", () => {
  const added = data.spots.filter(spot => newHistoryIds.includes(spot.source_squeeze_id));
  assert.equal(added.length, 24);
  for (const spot of added) {
    const reason = load(`reasons/${spot.id}`);
    assert.equal(reason.spot_id, spot.id);
    assert.equal(reason.type, "squeeze");
    assert.ok(typeof reason.source_fingerprint === "string" && reason.source_fingerprint.length > 0);
    assert.deepEqual(Object.keys(reason.hands).sort(), [...hands].sort());
    assert.equal(reason.spot_facts.unreachable === true, !historyReachable(spot));
    if (historyReachable(spot)) {
      assert.equal(reason.spot_facts.position, "OOP");
      assert.equal(reason.spot_facts.squeeze_size_bb, 12);
      assert.equal(reason.spot_facts.four_bet_size_bb, 26);
    }
    const reach = reachOf(spot);
    for (const row of spot.hands) {
      const detail = reason.hands[row.hand];
      if (reach.get(row.hand) === 0) {
        assert.match(detail.reason, historyReachable(spot) ? /対象外/ : /到達不能/);
        assert.ok(Object.values(detail.facts).every(value => value === null));
        if (!historyReachable(spot)) assert.match(detail.reason, /実際の推奨ではありません/);
      } else {
        for (const [key, label] of [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]]) {
          if (row[key] > 0) assert.match(detail.reason, new RegExp(`${label} ${row[key]}%`), `${spot.id}/${row.hand}`);
        }
        assert.ok(Object.values(detail.facts).some(Number.isFinite));
      }
    }
  }
});
