import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EQR, eqrCategory, equityRealization } from "../src/estimated/eqr.js";
import { allowedCall, callContexts, callFacts, validCallEquities } from "../src/estimated/call-ev.js";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.js";
import { hands } from "../src/data.js";
import { positions } from "../src/estimated/sizing.js";
import { raked } from "../src/estimated/rake.js";

const root = new URL("..", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), multiway: load("multiway-responses"), limp: load("limp-responses"), fiveBets: load("five-bet-responses") });
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
  for (const hand of ["AXs", "AAo", "2As", "AK"]) assert.throws(() => eqrCategory(hand));
  assert.throws(() => equityRealization("AA", "XX", ["BB"]));
  assert.throws(() => equityRealization("AA", "BB", ["BB"]));
});

test("Python and JS EQR match for all 169 hands and every HU/three-way seat assignment", () => {
  const cases = [];
  for (const hand of hands) for (const hero of positions) for (const opponent of positions.filter(p => p !== hero)) {
    cases.push([hand, hero, [opponent], false]);
    for (const second of positions.filter(p => p !== hero && positions.indexOf(p) > positions.indexOf(opponent))) {
      cases.push([hand, hero, [opponent, second], false], [hand, hero, [opponent, second], true]);
    }
  }
  const result = spawnSync("python3", ["-c", "import json,sys; sys.path.insert(0,'scripts'); from eqr import equity_realization; print(json.dumps([equity_realization(*c) for c in json.load(sys.stdin)]))"], { cwd: root, input: JSON.stringify(cases), encoding: "utf8", maxBuffer: 8e6 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), cases.map(([hand, hero, opponents, allIn]) => equityRealization(hand, hero, opponents, { allIn })));
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
  assert.equal(contexts.length, 52);
  const input = id => contexts.find(c => c.spot.id === id).input;
  assert.deepEqual([input("BB_vs_SB").cost_to_call, input("BB_vs_SB").total_pot_after_call], [2.5, 7]);
  assert.deepEqual([input("SB_vs_UTG").cost_to_call, input("SB_vs_UTG").total_pot_after_call], [2, 6]);
  assert.deepEqual([input("SB_vs_BB_three_bet").cost_to_call, input("SB_vs_BB_three_bet").total_pot_after_call], [7, 21]);
  assert.deepEqual([input("BB_vs_SB_four_bet").cost_to_call, input("BB_vs_SB_four_bet").total_pot_after_call], [13.5, 48]);
  assert.deepEqual([input("BB_vs_UTG_HJcall").cost_to_call, input("BB_vs_UTG_HJcall").total_pot_after_call], [1.5, 8]);
  assert.deepEqual([input("SB_vs_BB_iso").cost_to_call, input("SB_vs_BB_iso").total_pot_after_call], [2.5, 7]);
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
  const row = data.threeBets.spots.find(s => s.id === "UTG_vs_HJ_three_bet").hands.find(r => r.hand === "TT");
  row.call -= 5; row.fold += 5;
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
  const { targetCall } = await import("../src/estimated/call-ev.js");
  assert.equal(targetCall(35, 0.12, 100), 100);
  assert.equal(targetCall(20, 0.07, 90), 45);
  assert.equal(targetCall(60, 0.07, 90), 60);
  assert.equal(targetCall(40, 0.0, 95), 40);
  assert.equal(targetCall(40, -0.2, 95), 0);
  assert.throws(() => targetCall(50, 0.2, 40));
});
