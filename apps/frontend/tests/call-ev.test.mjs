import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EQR, BB_BEHIND_EQR, CALLER_BEHIND_EQR, COLD_CALL_OFFSUIT_EQR, COLD_CALL_SQUEEZE_EQR, MULTIWAY_EQR, OPENER_BEHIND_EQR, eqrCategory, equityRealization } from "../src/estimated/eqr.ts";
import { allowedCall, callContexts, callFacts, limpReraiseFoldThreshold, validCallEquities } from "../src/estimated/call-ev.ts";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { hands } from "../src/data.ts";
import { positions } from "../src/estimated/sizing.ts";
import { raked } from "../src/estimated/rake.ts";

const root = new URL("..", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), multiway: load("multiway-responses"), squeezes: load("squeeze-responses"), limp: load("limp-responses"), fiveBets: load("five-bet-responses"), coldThreeBets: load("cold-three-bet-responses") });
const table = () => load("call-equities");

test("EQR categories use ordered precedence and the specified assumed values", () => {
  for (const [hand, category] of Object.entries({ AA: "pair", "97s": "suited_connected", "AKs": "suited_connected", "ATs": "suited_broadway", "A9s": "suited_ace", "K8s": "suited_other", "ATo": "offsuit_broadway", "98o": "offsuit_connected", "97o": "offsuit_other" })) {
    assert.equal(eqrCategory(hand), category);
    assert.equal(equityRealization(hand, "BB", ["SB"]), EQR[category][0]);
    assert.equal(equityRealization(hand, "SB", ["BB"]), EQR[category][1]);
  }
  assert.equal(equityRealization("J4o", "BB", ["SB"]), EQR.offsuit_other[0]);
  assert.equal(equityRealization("J4o", "BB", ["BTN"]), EQR.offsuit_other[1]);
  assert.equal(equityRealization("JTs", "BTN", ["SB", "BB"]), EQR.suited_connected[0] * 0.9);
  assert.equal(equityRealization("JTs", "BB", ["SB", "BTN"]), EQR.suited_connected[1] * 0.9);
  assert.equal(equityRealization("72o", "SB", ["BB", "BTN"], { allIn: true }), 1);
  // SB versus an open plus a cold call, BB still to act: OOP × three-way × BB-behind.
  assert.equal(equityRealization("99", "SB", ["UTG", "HJ"], { bbBehind: true }), EQR.pair[1] * MULTIWAY_EQR * BB_BEHIND_EQR);
  assert.equal(equityRealization("99", "SB", ["UTG", "HJ"], { bbBehind: true, allIn: true }), 1);
  assert.ok(BB_BEHIND_EQR > 0 && BB_BEHIND_EQR < 1);
  assert.throws(() => equityRealization("99", "BB", ["UTG", "HJ"], { bbBehind: true }));
  assert.throws(() => equityRealization("99", "SB", ["BB", "HJ"], { bbBehind: true }));
  // Opener facing a squeeze with the cold caller still behind: HU EQR × CALLER_BEHIND_EQR.
  assert.equal(CALLER_BEHIND_EQR, 0.9);
  assert.equal(equityRealization("QQ", "UTG", ["BB"], { callerBehind: true }), EQR.pair[0] * CALLER_BEHIND_EQR);
  assert.equal(equityRealization("QQ", "UTG", ["BB"], { callerBehind: true, allIn: true }), 1);
  assert.throws(() => equityRealization("QQ", "UTG", ["BB", "HJ"], { callerBehind: true }));
  assert.throws(() => equityRealization("QQ", "SB", ["UTG"], { callerBehind: true, bbBehind: true }));
  // Cold call of a 3bet with the opener still behind: HU EQR × OPENER_BEHIND_EQR.
  assert.equal(OPENER_BEHIND_EQR, 0.85);
  assert.equal(equityRealization("JJ", "BTN", ["CO"], { openerBehind: true }), EQR.pair[0] * OPENER_BEHIND_EQR);
  assert.equal(equityRealization("AKo", "BB", ["BTN"], { openerBehind: true }), EQR.offsuit_broadway[1] * OPENER_BEHIND_EQR);
  assert.equal(equityRealization("JJ", "BTN", ["CO"], { openerBehind: true, allIn: true }), 1);
  assert.throws(() => equityRealization("JJ", "BTN", ["CO", "HJ"], { openerBehind: true }));
  assert.throws(() => equityRealization("JJ", "BTN", ["CO"], { openerBehind: true, callerBehind: true }));
  assert.throws(() => equityRealization("JJ", "SB", ["CO"], { openerBehind: true, bbBehind: true }));
  // HJ / CO / BTN cold-calling an open: squeeze discount by seats behind, offsuit also × COLD_CALL_OFFSUIT_EQR.
  assert.deepEqual({ ...COLD_CALL_SQUEEZE_EQR }, { 2: 0.94, 3: 0.91, 4: 0.885 });
  assert.equal(COLD_CALL_OFFSUIT_EQR, 0.95);
  assert.equal(equityRealization("JTs", "HJ", ["UTG"], { coldCallBehind: true }), EQR.suited_connected[0] * 0.885);
  assert.equal(equityRealization("66", "CO", ["HJ"], { coldCallBehind: true }), EQR.pair[0] * 0.91);
  assert.equal(equityRealization("ATo", "BTN", ["UTG"], { coldCallBehind: true }), EQR.offsuit_broadway[0] * 0.94 * COLD_CALL_OFFSUIT_EQR);
  assert.equal(equityRealization("ATo", "BTN", ["UTG"], { coldCallBehind: true, allIn: true }), 1);
  assert.throws(() => equityRealization("AA", "SB", ["UTG"], { coldCallBehind: true }));
  assert.throws(() => equityRealization("AA", "BB", ["UTG"], { coldCallBehind: true }));
  assert.throws(() => equityRealization("AA", "HJ", ["CO"], { coldCallBehind: true }));
  assert.throws(() => equityRealization("AA", "BTN", ["UTG", "HJ"], { coldCallBehind: true }));
  assert.throws(() => equityRealization("AA", "BTN", ["CO"], { coldCallBehind: true, openerBehind: true }));
  for (const hand of ["AXs", "AAo", "2As", "AK"]) assert.throws(() => eqrCategory(hand));
  assert.throws(() => equityRealization("AA", "XX", ["BB"]));
  assert.throws(() => equityRealization("AA", "BB", ["BB"]));
});

test("Python and JS EQR match for all 169 hands and every HU/three-way seat assignment", () => {
  const cases = [];
  for (const hand of hands) for (const hero of positions) for (const opponent of positions.filter(p => p !== hero)) {
    cases.push([hand, hero, [opponent], false, false, false, false], [hand, hero, [opponent], false, false, true, false],
      [hand, hero, [opponent], false, false, false, true], [hand, hero, [opponent], true, false, false, true]);
    if (["HJ", "CO", "BTN"].includes(hero) && positions.indexOf(opponent) < positions.indexOf(hero)) {
      cases.push([hand, hero, [opponent], false, false, false, false, true], [hand, hero, [opponent], true, false, false, false, true]);
    }
    for (const second of positions.filter(p => p !== hero && positions.indexOf(p) > positions.indexOf(opponent))) {
      cases.push([hand, hero, [opponent, second], false, false, false, false], [hand, hero, [opponent, second], true, false, false, false]);
      if (hero === "SB" && ![opponent, second].includes("BB")) {
        cases.push([hand, hero, [opponent, second], false, true, false, false], [hand, hero, [opponent, second], true, true, false, false]);
      }
    }
  }
  const result = spawnSync("python3", ["-c", "import json,sys; sys.path.insert(0,'scripts'); from eqr import equity_realization; print(json.dumps([equity_realization(*c) for c in json.load(sys.stdin)]))"], { cwd: root, input: JSON.stringify(cases), encoding: "utf8", maxBuffer: 8e6 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(cases.some(c => c[4]) && cases.some(c => c[5]) && cases.some(c => c[6]) && cases.some(c => c[7]));
  assert.deepEqual(JSON.parse(result.stdout), cases.map(([hand, hero, opponents, allIn, bbBehind, callerBehind, openerBehind, coldCallBehind = false]) => equityRealization(hand, hero, opponents, { allIn, bbBehind, callerBehind, openerBehind, coldCallBehind })));
});

test("strict EV boundaries: below -0.05 zero, [-0.05, +0.05) capped, +0.05 preserved", () => {
  assert.equal(allowedCall(95, -0.050001), 0);
  for (const ev of [-0.05, 0, 0.049999]) {
    assert.equal(allowedCall(95, ev), 50);
    assert.equal(allowedCall(25, ev), 25);
  }
  assert.equal(allowedCall(95, 0.05), 95);
  assert.throws(() => allowedCall(50, NaN));
});

test("call contexts derive actual investments, dead blinds and prior weighted opponent ranges", () => {
  const data = datasets();
  const contexts = callContexts(data);
  assert.equal(contexts.length, 115); // + 36 squeeze responses + BB vs SB limp-reraise + 20 cold 3bet responses
  const input = id => contexts.find(c => c.spot.id === id).input;
  assert.deepEqual([input("BB_vs_SB").cost_to_call, input("BB_vs_SB").total_pot_after_call], [2.5, 7]);
  assert.deepEqual([input("SB_vs_UTG").cost_to_call, input("SB_vs_UTG").total_pot_after_call], [2, 6]);
  // HJ / CO / BTN flats of an open carry the cold-call discount; blinds do not.
  for (const id of ["HJ_vs_UTG", "CO_vs_UTG", "BTN_vs_UTG", "CO_vs_HJ", "BTN_vs_HJ", "BTN_vs_CO"]) assert.equal(input(id).cold_call_behind, true);
  for (const id of ["SB_vs_UTG", "BB_vs_UTG", "BB_vs_SB"]) assert.equal(input(id).cold_call_behind, undefined);
  assert.equal(callFacts(contexts.find(c => c.spot.id === "HJ_vs_UTG"), "KQo", 0.45).eqr, EQR.offsuit_broadway[0] * 0.885 * COLD_CALL_OFFSUIT_EQR);
  assert.deepEqual([input("SB_vs_BB_three_bet").cost_to_call, input("SB_vs_BB_three_bet").total_pot_after_call], [7, 21]);
  assert.deepEqual([input("BB_vs_SB_four_bet").cost_to_call, input("BB_vs_SB_four_bet").total_pot_after_call], [13.5, 48]);
  assert.deepEqual([input("BB_vs_UTG_HJcall").cost_to_call, input("BB_vs_UTG_HJcall").total_pot_after_call], [1.5, 8]);
  assert.equal(input("BB_vs_UTG_HJcall").bb_behind, undefined);
  // SB completes 2BB of the 2.5BB open; BB's 1BB blind is dead money and BB still acts behind.
  assert.deepEqual([input("SB_vs_CO_BTNcall").cost_to_call, input("SB_vs_CO_BTNcall").total_pot_after_call, input("SB_vs_CO_BTNcall").bb_behind], [2, 8.5, true]);
  const sb = contexts.find(c => c.spot.id === "SB_vs_CO_BTNcall");
  const sbFacts = callFacts(sb, "99", 0.4);
  assert.equal(sbFacts.eqr, EQR.pair[1] * MULTIWAY_EQR * BB_BEHIND_EQR);
  assert.ok(Math.abs(sbFacts.call_ev_bb - (0.4 * sbFacts.eqr * raked(8.5) - 2)) < 1e-12);
  assert.deepEqual([input("SB_vs_BB_iso").cost_to_call, input("SB_vs_BB_iso").total_pot_after_call], [2.5, 7]);
  // BB facing SB's 10.5BB limp-reraise after its 3.5BB iso: 7BB more into 21BB, in position.
  const reraise = contexts.find(c => c.spot.id === "BB_vs_SB_limp_reraise");
  assert.deepEqual([reraise.type, reraise.input.cost_to_call, reraise.input.total_pot_after_call, reraise.input.opponents, reraise.input.all_in], ["limp_reraise", 7, 21, ["SB"], false]);
  assert.equal(callFacts(reraise, "99", 0.45).eqr, EQR.pair[0]);
  assert.equal(limpReraiseFoldThreshold(reraise.spot), 9.5 / 14);
  const sbOpen = new Map(data.opening.spots.find(s => s.hero === "SB").hands.map(r => [r.hand, r.limp]));
  assert.deepEqual(reraise.input.ranges[0], data.limp.spots.find(s => s.id === "SB_vs_BB_iso").hands
    .map(r => [r.hand, sbOpen.get(r.hand) / 100 * r.raise / 100]).filter(([, w]) => w > 0));
  const iso = new Map(data.limp.spots.find(s => s.id === "BB_vs_SB_limp").hands.map(r => [r.hand, r.raise]));
  for (const hand of ["AA", "K8s", "72o"]) assert.equal(reraise.reach(hand), iso.get(hand) / 100);
  // Facing a 13BB squeeze: 10.5BB more. BB squeezing leaves SB's 0.5 dead; SB squeezing, BB's 1.
  const squeeze = id => { const i = input(id); return [i.cost_to_call, i.total_pot_after_call, i.opponents, i.caller_behind ?? false]; };
  assert.deepEqual(squeeze("UTG_vs_BB_squeeze_HJcall"), [10.5, 29, ["BB"], true]);
  assert.deepEqual(squeeze("UTG_vs_SB_squeeze_HJcall"), [10.5, 29.5, ["SB"], true]);
  assert.deepEqual(squeeze("HJ_vs_BB_squeeze_UTGfold"), [10.5, 29, ["BB"], false]);
  assert.deepEqual(squeeze("BTN_vs_SB_squeeze_COfold"), [10.5, 29.5, ["SB"], false]);
  assert.deepEqual(squeeze("HJ_vs_BB_squeeze_UTGcall"), [10.5, 39.5, ["BB", "UTG"], false]);
  assert.deepEqual(squeeze("BTN_vs_SB_squeeze_COcall"), [10.5, 40, ["SB", "CO"], false]);
  const opener = contexts.find(c => c.spot.id === "UTG_vs_BB_squeeze_HJcall");
  assert.equal(callFacts(opener, "QQ", 0.45).eqr, EQR.pair[0] * CALLER_BEHIND_EQR);
  assert.equal(callFacts(contexts.find(c => c.spot.id === "HJ_vs_BB_squeeze_UTGcall"), "QQ", 0.45).eqr, EQR.pair[0] * MULTIWAY_EQR);
  // The three-way opponent range is the opener's RFI × its saved squeeze-call frequency.
  const first = data.squeezes.spots.find(s => s.id === "UTG_vs_BB_squeeze_HJcall");
  const utg = new Map(data.opening.spots.find(s => s.hero === "UTG").hands.map(r => [r.hand, r.open]));
  assert.deepEqual(input("HJ_vs_BB_squeeze_UTGcall").ranges[1],
    first.hands.map(r => [r.hand, utg.get(r.hand) / 100 * r.call / 100]).filter(([, w]) => w > 0));
  // Cold call of a 3bet: 3bet minus the hero's blind, into both 3bets + the open + other dead blinds.
  const cold = id => { const i = input(id); return [i.cost_to_call, i.total_pot_after_call, i.opponents, i.opener_behind, i.all_in]; };
  assert.deepEqual(cold("CO_vs_HJ_3bet_UTGopen"), [8, 20, ["HJ"], true, false]);
  assert.deepEqual(cold("SB_vs_BTN_3bet_COopen"), [7.5, 19.5, ["BTN"], true, false]);
  assert.deepEqual(cold("BB_vs_BTN_3bet_COopen"), [7, 19, ["BTN"], true, false]);
  assert.deepEqual(cold("BB_vs_SB_3bet_BTNopen"), [11, 26.5, ["SB"], true, false]);
  const coldContext = id => contexts.find(c => c.spot.id === id);
  assert.equal(coldContext("CO_vs_HJ_3bet_UTGopen").type, "cold_three_bet");
  assert.equal(callFacts(coldContext("CO_vs_HJ_3bet_UTGopen"), "JJ", 0.5).eqr, EQR.pair[0] * OPENER_BEHIND_EQR);
  assert.equal(callFacts(coldContext("BB_vs_BTN_3bet_COopen"), "JJ", 0.5).eqr, EQR.pair[1] * OPENER_BEHIND_EQR);
  assert.equal(callFacts(coldContext("BB_vs_SB_3bet_BTNopen"), "JJ", 0.5).eqr, EQR.pair[0] * OPENER_BEHIND_EQR);
  assert.deepEqual(input("CO_vs_HJ_3bet_UTGopen").ranges[0], data.responses.spots.find(s => s.id === "HJ_vs_UTG").hands
    .map(r => [r.hand, r.three_bet / 100]).filter(([, w]) => w > 0));
  for (const hand of ["AA", "72o"]) assert.equal(coldContext("CO_vs_HJ_3bet_UTGopen").reach(hand), 1);
  const c = contexts.find(c => c.spot.id === "BB_vs_SB");
  const facts = callFacts(c, "J4o", 0.352);
  assert.equal(facts.eqr, EQR.offsuit_other[0]);
  assert.ok(Math.abs(facts.realized_equity_pct - 0.352 * EQR.offsuit_other[0] * 100) < 1e-9);
  assert.ok(Math.abs(facts.call_ev_bb - (0.352 * EQR.offsuit_other[0] * raked(7) - 2.5)) < 1e-12);
  const allIn = structuredClone(c.input);
  allIn.all_in = true; allIn.total_pot_after_call = 200; allIn.cost_to_call = 76;
  assert.equal(callFacts({ input: allIn }, "J4o", 0.5).call_ev_bb, 22.5);
});

test("all published calls obey EQR/EV selection; BB-vs-SB trash calls are eliminated", () => {
  const data = datasets(), equities = table();
  for (const c of callContexts(data)) {
    assert.ok(validCallEquities(equities, c), c.spot.id);
    for (const row of c.spot.hands) {
      const ev = callFacts(c, row.hand, equities.spots[c.spot.id].equities[row.hand]).call_ev_bb;
      assert.equal(row.call, allowedCall(row.call, ev), `${c.spot.id}/${row.hand}: ${ev}`);
    }
  }
  const bb = data.responses.spots.find(s => s.id === "BB_vs_SB");
  for (const hand of ["J4o", "72o"]) assert.equal(bb.hands.find(r => r.hand === hand).call, 0);
  const authored = JSON.parse(readFileSync(new URL("../scripts/data/response-mixes.json", import.meta.url)));
  for (const s of data.responses.spots) for (const [hand, call, three] of authored.spots[s.id]) {
    const row = s.hands.find(r => r.hand === hand);
    assert.equal(row.three_bet, three);
    if (row.call > call) {
      const c = callContexts(data).find(c => c.spot.id === s.id);
      assert.ok(callFacts(c, hand, equities.spots[s.id].equities[hand]).call_ev_bb >= 0.05);
    }
  }
});

test("negative-ev-call warn/error boundaries and publication behavior", () => {
  for (const [call, ev, severity] of [[5, -1, "warn"], [10, -0.2, "warn"], [10, -0.21, "error"], [10, -0.05, null], [10, -0.051, "warn"]]) {
    const data = datasets(), equities = table();
    const c = callContexts(data).find(c => c.spot.id === "BB_vs_SB");
    const row = c.spot.hands.find(r => r.hand === "J4o");
    row.call = call; row.fold = 100 - call - row.three_bet;
    // Move infinitesimally inside the equality boundaries to avoid arithmetic ulps.
    equities.spots[c.spot.id].equities.J4o = (ev + (ev === -0.05 || ev === -0.2 ? 1e-12 : 0) + 2.5) / (EQR.offsuit_other[0] * raked(7));
    const finding = auditEstimates({ ...data, callEquities: equities }).findings.find(f => f.check === "negative-ev-call" && f.spot === c.spot.id && f.detail.startsWith("J4o:"));
    assert.equal(finding?.severity ?? null, severity, `call ${call}, EV ${ev}`);
    if (finding) assert.equal(isBlockingAuditFinding(finding), severity === "error");
  }
});

test("audit fails closed for missing, stale or corrupt equity sources without local reason-facts", () => {
  for (const mutate of [
    (d, e) => { delete e.spots.BB_vs_SB; },
    (d, e) => { e.spots.BB_vs_SB.equities.J4o = null; },
    (d, e) => { e.version = -1; },
    (d, e) => { e.samples = 1; },
    d => { d.opening.spots.find(s => s.hero === "SB").hands[0].open -= 5; },
    d => { d.responses.spots.find(s => s.id === "BB_vs_SB").open_size_bb = 2.5; },
  ]) {
    const data = datasets(), equities = table(); mutate(data, equities);
    assert.ok(auditEstimates({ ...data, callEquities: equities }).findings.some(f => f.check === "call-equity-source" && isBlockingAuditFinding(f)));
  }
});

test("generator is idempotent, preserves raises, and uses checked equities rather than local facts", () => {
  const dir = mkdtempSync(join(tmpdir(), "call-policy-test-"));
  try {
    for (const name of ["opening-ranges", "preflop-ranges", "call-equities"]) writeFileSync(join(dir, `${name}.json`), JSON.stringify(load(name)));
    const run = () => spawnSync("python3", ["scripts/generate-response-ranges.py"], { cwd: root, env: { ...process.env, ESTIMATES_DIR: dir }, encoding: "utf8" });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    const snapshot = readFileSync(join(dir, "preflop-ranges.json"), "utf8");
    const second = run(); assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(join(dir, "preflop-ranges.json"), "utf8"), snapshot);
    assert.doesNotMatch(first.stdout + second.stdout, /Computed call equity/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("EV-capacity conflicts stay advisory, but leaving profitable defense unused blocks", () => {
  const data = datasets();
  const report = auditEstimates(data);
  // After EQR calibration (2026-09-24) UTG defends HJ 3bets inside the break-even band.
  for (const conflict of report.capacityConflicts) assert.ok(conflict.maximumContinuationPct < conflict.requiredContinuationPct);
  assert.ok(report.findings.filter(f => f.check === "ev-capacity-conflict").every(f => f.severity === "warn"));
  // UTG now defends HJ 3bets with a margin (pairs keep their calls), so drop every
  // call: profitable defense exists, so the overfold must block, not be excused.
  for (const row of data.threeBets.spots.find(s => s.id === "UTG_vs_HJ_three_bet").hands) { row.fold += row.call; row.call = 0; }
  assert.ok(auditEstimates(data).findings.some(f => f.check === "auto-profit" && f.spot === "UTG vs HJ 3bet" && isBlockingAuditFinding(f)));
});

test("cached Monte Carlo equity can be reproduced from checked source ranges and the recorded seed", async () => {
  const { equityVsRange, weightedRange, seededRandom, seedFor } = await import("../scripts/lib/equity.mjs");
  const entry = table().spots.BB_vs_SB;
  const range = weightedRange(entry.input.ranges[0].map(([hand, weight]) => ({ hand, weight })));
  const actual = equityVsRange("J4o", range, 12000, seededRandom(seedFor("call-equity-v1|BB_vs_SB|J4o")));
  assert.equal(actual, entry.equities.J4o);
});

test("every reachable call-decision reason exposes the same EQR/EV as generation and audit", () => {
  const data = datasets(), equities = table();
  for (const c of callContexts(data)) {
    const reasons = load(`reasons/${c.spot.id}`);
    assert.ok(reasons.fact_labels.some(f => f.key === "realized_equity_pct" && f.label === "実現後の勝率" && f.scope === "hand"));
    assert.ok(reasons.fact_labels.some(f => f.key === "call_ev_bb" && f.unit === "bb" && f.scope === "hand"));
    for (const row of c.spot.hands) {
      const result = reasons.hands[row.hand];
      if (!c.reach(row.hand)) {
        for (const key of ["eqr", "realized_equity_pct", "call_ev_bb"]) assert.equal(result.facts[key], null);
        assert.match(result.reason, /対象外/);
        continue;
      }
      const expected = callFacts(c, row.hand, equities.spots[c.spot.id].equities[row.hand]);
      for (const [key, value] of Object.entries(expected)) assert.equal(result.facts[key], value, `${c.spot.id}/${row.hand}/${key}`);
      const aggressive = 100 - row.fold - row.call;
      if (Math.max(row.fold, row.call) > aggressive) {
        assert.match(result.reason, /実現後の勝率/);
        assert.match(result.reason, /コールのEV/);
      }
      assert.doesNotMatch(result.reason, /NaN|undefined|null/);
    }
  }
});

test("reason composer refuses stale local facts instead of silently reintroducing old advice", () => {
  const dir = mkdtempSync(join(tmpdir(), "stale-call-facts-"));
  try {
    writeFileSync(join(dir, "BB_vs_SB.json"), JSON.stringify({ spot_id: "BB_vs_SB", source_fingerprint: "old" }));
    const result = spawnSync(process.execPath, ["scripts/compose-reasons.mjs", "BB_vs_SB"], { cwd: root,
      env: { ...process.env, REASON_FACTS_DIR: dir }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stale facts: BB_vs_SB/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("generation fills clearly positive-EV calls without touching raises", async () => {
  const { targetCall } = await import("../src/estimated/call-ev.ts");
  assert.equal(targetCall(35, 0.12, 100), 100);
  assert.equal(targetCall(20, 0.07, 90), 45);
  assert.equal(targetCall(60, 0.07, 90), 60);
  assert.equal(targetCall(40, 0.0, 95), 40);
  assert.equal(targetCall(40, -0.2, 95), 0);
  assert.throws(() => targetCall(50, 0.2, 40));
});

test("3bet, squeeze and cold-3bet pots fill only calls of +0.50bb or better, never touching 4bets", async () => {
  const { threeBetTargetCall, THREE_BET_FILL_EV, OOP_THREE_BET_FILL_EV, isOopThreeBetResponse } = await import("../src/estimated/call-ev.ts");
  assert.equal(THREE_BET_FILL_EV, 0.5);
  assert.equal(OOP_THREE_BET_FILL_EV, 1.5);
  assert.equal(threeBetTargetCall(40, 1.2, 100, OOP_THREE_BET_FILL_EV), 40);
  assert.equal(threeBetTargetCall(40, 1.5, 100, OOP_THREE_BET_FILL_EV), 100);
  assert.equal(threeBetTargetCall(60, 0.5, 95), 95);
  assert.equal(threeBetTargetCall(60, 0.49, 95), 60);
  assert.equal(threeBetTargetCall(60, 0.0, 95), 50);
  assert.equal(threeBetTargetCall(60, -0.2, 95), 0);
  assert.throws(() => threeBetTargetCall(50, 0.6, 40));
  const data = datasets(), equities = table();
  for (const c of callContexts(data).filter(c => ["three_bet", "squeeze", "cold_three_bet"].includes(c.type))) for (const row of c.spot.hands) {
    if (c.reach(row.hand) <= 0) continue;
    const ev = callFacts(c, row.hand, equities.spots[c.spot.id].equities[row.hand]).call_ev_bb;
    if (ev >= (isOopThreeBetResponse(c) ? OOP_THREE_BET_FILL_EV : THREE_BET_FILL_EV)) assert.equal(row.fold, 0, `${c.spot.id}/${row.hand}: ${ev}`);
  }
  // Out of position to the 3bettor, small pairs are not filled: 22-55 stay mostly fold.
  const oop = callContexts(data).filter(isOopThreeBetResponse);
  assert.deepEqual(oop.map(c => c.spot.id).sort(), ["CO_vs_BTN_three_bet", "HJ_vs_BTN_three_bet", "HJ_vs_CO_three_bet", "SB_vs_BB_three_bet", "UTG_vs_BTN_three_bet", "UTG_vs_CO_three_bet", "UTG_vs_HJ_three_bet"]);
  for (const c of oop) for (const row of c.spot.hands.filter(r => ["55", "44", "33", "22"].includes(r.hand))) assert.ok(row.call <= 50, `${c.spot.id}/${row.hand}`);
});
