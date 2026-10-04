import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { auditEstimates, BALANCE_CHECKS, checkRangeBalance, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import handStrength from "../src/estimated/hand-strength.json" with { type: "json" };
import { hands } from "../src/data.ts";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"), multiway: load("multiway-responses"), squeezes: load("squeeze-responses"), limp: load("limp-responses"), limpDeep: load("limp-deep-responses"), coldThreeBets: load("cold-three-bet-responses"), multiway2: load("multiway2-responses"), coldFourBets: load("cold-four-bet-responses") });

test("persisted estimates pass the consistency audit", () => {
  const report = auditEstimates(datasets());
  assert.deepEqual(report.findings.filter(isBlockingAuditFinding), []);
  assert.equal(report.rangeBalance.length, Object.values(datasets()).reduce((sum, data) => sum + data.spots.length, 0));
  assert.deepEqual(report.findings.filter(f => f.spot === "SB_open"), []);
  for (const finding of report.findings) assert.equal(finding.severity, "warn");
});

test("CLI reports balance counts and spot lists but does not fail for their warnings", () => {
  const result = spawnSync(process.execPath, ["scripts/audit-estimates.mjs", "--json"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", maxBuffer: 16 << 20,
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  for (const check of BALANCE_CHECKS) {
    const matches = report.findings.filter(f => f.check === check);
    assert.equal(report.balanceSummary[check].count, matches.length);
    assert.deepEqual(report.balanceSummary[check].spots, [...new Set(matches.map(f => f.spot))].sort());
  }
  assert.equal(report.rangeBalance.length, Object.values(datasets()).reduce((sum, data) => sum + data.spots.length, 0) + (existsSync(new URL("../src/estimated/continuation-responses.json", import.meta.url)) ? load("continuation-responses").spots.length : 0));
  assert.equal(report.continuationDefense.length, (existsSync(new URL("../src/estimated/continuation-call-equities.json", import.meta.url)) ? Object.keys(load("continuation-call-equities").joint_defense).length : 0));
});

test("audit rejects an overfolding 4bet response", () => {
  const data = datasets();
  const spot = data.fourBets.spots.find(s => s.opener === "BTN" && s.hero === "SB");
  for (const row of spot.hands) Object.assign(row, { fold: 100, call: 0, all_in: 0 });
  const { findings } = auditEstimates(data);
  assert.ok(findings.some(f => f.check === "auto-profit" && f.spot === "SB vs BTN 4bet"));
});

test("audit rejects a later seat opening less than an earlier seat", () => {
  const data = datasets();
  const btn = data.opening.spots.find(s => s.hero === "BTN");
  Object.assign(btn.hands.find(row => row.hand === "97s"), { open: 50, fold: 50 });
  assert.ok(auditEstimates(data).findings.some(f => f.check === "position-nesting" && f.detail.startsWith("97s")));
});

test("audit rejects a stronger hand folding more than a weaker one", () => {
  const data = datasets();
  const spot = data.responses.spots.find(s => s.opener === "BTN" && s.hero === "BB");
  Object.assign(spot.hands.find(row => row.hand === "KK"), { fold: 50, call: 50, three_bet: 0 });
  assert.ok(auditEstimates(data).findings.some(f => f.check === "strength-order" && f.detail.startsWith("KK")));
});

test("audit warns when a BB or SB squeeze range exceeds its own heads-up 3bet width", () => {
  for (const hero of ["BB", "SB"]) {
    const data = datasets();
    const spot = data.multiway.spots.find(s => s.hero === hero && s.opener === "UTG" && s.callers[0] === "HJ");
    assert.ok(!auditEstimates(data).findings.some(f => f.check === "squeeze-width"), hero);
    for (const row of spot.hands) Object.assign(row, { fold: 0, call: 0, squeeze: 100 });
    assert.ok(auditEstimates(data).findings.some(f => f.check === "squeeze-width" && f.spot === spot.id && f.severity === "warn" && f.detail.includes(`${hero}ヘッズアップ`)), hero);
  }
});

test("audit rejects an incomplete SB raise/limp/fold split", () => {
  const data = datasets();
  data.opening.spots.find(s => s.hero === "SB").hands[0].limp += 1;
  assert.ok(auditEstimates(data).findings.some(f => f.check === "range-flow" && f.spot === "SB open"));
});

test("fixed-seed hand strength covers 169 hands without reason-facts", () => {
  assert.deepEqual(Object.keys(handStrength.equity).sort(), [...hands].sort());
  assert.equal(handStrength.samples_per_hand, 30000);
  assert.match(handStrength.seed, /seedFor/);
  for (const value of Object.values(handStrength.equity)) assert.ok(value > 0 && value < 1);
  assert.ok(handStrength.equity.AA > handStrength.equity.KK);
  assert.ok(handStrength.equity.AKs > handStrength.equity["72o"]);
});

test("deliberately capped SB limps warn without blocking publication", () => {
  const data = datasets();
  const sb = data.opening.spots.find(s => s.id === "SB_open");
  for (const row of sb.hands) Object.assign(row,
    handStrength.equity[row.hand] > 0.6 ? { open: 100, limp: 0, fold: 0 } : { open: 0, limp: 100, fold: 0 });
  const report = auditEstimates(data);
  const findings = report.findings.filter(f => f.spot === "SB_open");
  assert.deepEqual(findings.map(f => f.check), BALANCE_CHECKS);
  for (const finding of findings) {
    assert.equal(finding.severity, "warn");
    assert.equal(isBlockingAuditFinding(finding), false);
  }
  assert.ok(report.balanceSummary["range-capped"].spots.includes("SB_open"));
  assert.ok(report.balanceSummary["over-segregated"].spots.includes("SB_open"));
  assert.equal(isBlockingAuditFinding({ check: "auto-profit", severity: "error" }), true);
  assert.equal(isBlockingAuditFinding({ check: "strength-order", severity: "warn" }), true);
});

test("cap checks include limp/call/check independently and use a fractional top decile", () => {
  for (const passive of ["limp", "call", "check"]) {
    const spot = { id: "boundary", hands: [
      { hand: "AA", open: 100, [passive]: 0 },
      { hand: "KK", open: 100, [passive]: 0 },
      { hand: "72o", open: 80, [passive]: 20 },
    ] };
    assert.ok(checkRangeBalance(spot).findings.some(f => f.check === "range-capped")); // exactly 10%
    Object.assign(spot.hands[2], { open: 81, [passive]: 19 });
    assert.ok(!checkRangeBalance(spot).findings.some(f => f.check === "range-capped"));
    // Top 10% = 2.4 of AA's six combos. 2.4 * 10% / 12 = exactly 2%.
    Object.assign(spot.hands[0], { open: 90, [passive]: 10 });
    Object.assign(spot.hands[2], { open: 5, [passive]: 95 });
    const boundary = checkRangeBalance(spot);
    assert.ok(Math.abs(boundary.passiveStrongShares[passive] - 0.02) < 1e-12);
    assert.ok(!boundary.findings.some(f => f.check === "range-capped"));
    Object.assign(spot.hands[2], { open: 4, [passive]: 96 });
    assert.ok(checkRangeBalance(spot).findings.some(f => f.check === "range-capped"));
  }
});

test("segregation requires strictly over 85% pure combos and two actions at least 10%", () => {
  const spot = { id: "mixed", hands: [
    { hand: "AA", raise: 100, fold: 0 },
    { hand: "KK", raise: 0, fold: 100 },
    { hand: "72o", raise: 50, fold: 50 },
  ] };
  const report = share => checkRangeBalance(spot, hand => hand === "72o" ? (1 - share) / 2 : share / 2);
  assert.ok(!report(0.85).findings.some(f => f.check === "over-segregated"));
  assert.ok(report(0.86).findings.some(f => f.check === "over-segregated"));
  Object.assign(spot.hands[1], { raise: 100, fold: 0 });
  assert.ok(!report(0.86).findings.some(f => f.check === "over-segregated"));
});

test("the two segregation exemptions do not suppress passive cap warnings", () => {
  const spot = { id: "all-in", hands: [
    { hand: "AA", call: 0, fold: 100 },
    { hand: "72o", call: 100, fold: 0 },
  ] };
  assert.deepEqual(checkRangeBalance(spot).findings.map(f => f.check), BALANCE_CHECKS);
  assert.deepEqual(checkRangeBalance(spot, undefined, "5bet all-in response").findings.map(f => f.check), ["range-capped"]);
  assert.deepEqual(checkRangeBalance(spot, undefined, "fold/open RFI").findings.map(f => f.check), ["range-capped"]);
});

test("incoming reach weights exclude placeholders and weight rare premiums, not hand-class counts", () => {
  const spot = { id: "reach", hands: [
    { hand: "AA", call: 100, raise: 0, fold: 0 },
    { hand: "KK", call: 0, raise: 0, fold: 100 },
    { hand: "QQ", call: 0, raise: 100, fold: 0 },
    { hand: "72o", call: 100, raise: 0, fold: 0 },
  ] };
  const report = checkRangeBalance(spot, hand => ({ AA: 0.01, KK: 0, QQ: 1, "72o": 1 })[hand]);
  assert.equal(report.reachableCombos, 18.06);
  assert.ok(report.findings.some(f => f.check === "range-capped"));
  assert.deepEqual(checkRangeBalance(spot, () => 0).findings, []);
});

test("all downstream datasets use the proper incoming source, and only the two exceptions skip b", () => {
  const data = datasets();
  const report = auditEstimates(data);
  const metric = id => report.rangeBalance.find(s => s.spot === id);
  const combos = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
  const source = (dataset, id, hand) => dataset.spots.find(s => s.id === id).hands.find(r => r.hand === hand);
  for (const spot of data.threeBets.spots) {
    const expected = spot.hands.reduce((sum, r) => sum + combos(r.hand) * source(data.opening, `${spot.opener}_open`, r.hand).open / 100, 0);
    assert.ok(Math.abs(metric(spot.id).reachableCombos - expected) < 1e-10, spot.id);
  }
  for (const spot of data.fourBets.spots) {
    const expected = spot.hands.reduce((sum, r) => sum + combos(r.hand) * source(data.responses, `${spot.hero}_vs_${spot.opener}`, r.hand).three_bet / 100, 0);
    assert.ok(Math.abs(metric(spot.id).reachableCombos - expected) < 1e-10, spot.id);
  }
  for (const spot of data.fiveBets.spots) {
    const expected = spot.hands.reduce((sum, r) => sum + combos(r.hand) * (source(data.opening, `${spot.opener}_open`, r.hand).open / 100 * source(data.threeBets, `${spot.opener}_vs_${spot.five_bettor}_three_bet`, r.hand).four_bet / 100), 0);
    assert.ok(Math.abs(metric(spot.id).reachableCombos - expected) < 1e-10, spot.id);
  }
  assert.ok(Math.abs(metric("SB_vs_BB_iso").reachableCombos - data.opening.spots.find(s => s.hero === "SB").hands.reduce((n, r) => n + combos(r.hand) * r.limp / 100, 0)) < 1e-10);
  for (const spot of report.rangeBalance) {
    const exempt = /^(UTG|HJ|CO|BTN)_open$/.test(spot.spot) || spot.spot.endsWith("_five_bet");
    assert.equal(Boolean(spot.segregationExemption), exempt, spot.spot);
  }
  // Even a pure two-action RFI is exempt, unlike SB or ordinary call/fold nodes.
  for (const row of data.opening.spots.find(s => s.hero === "UTG").hands) {
    row.open = row.open > 0 ? 100 : 0;
    row.fold = 100 - row.open;
  }
  assert.ok(!auditEstimates(data).findings.some(f => f.spot === "UTG_open" && f.check === "over-segregated"));
});

test("audit enforces zero-limp unreachable placeholders in the SB iso response", () => {
  const data = datasets();
  const sb = data.opening.spots.find(s => s.hero === "SB");
  const unreachable = data.limp.spots.find(s => s.id === "SB_vs_BB_iso").hands.find(row => sb.hands.find(r => r.hand === row.hand).limp === 0);
  Object.assign(unreachable, { fold: 0, call: 100, raise: 0 });
  assert.ok(auditEstimates(data).findings.some(f => f.check === "range-flow" && f.spot === "SB vs BB iso"));
});

test("audit covers BB facing SB's limp-reraise: placeholders, reach weighting and SB's auto-profit", () => {
  const data = datasets();
  const report = auditEstimates(data);
  const combos = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
  const iso = new Map(data.limp.spots.find(s => s.id === "BB_vs_SB_limp").hands.map(r => [r.hand, r.raise]));
  const metric = report.rangeBalance.find(m => m.spot === "BB_vs_SB_limp_reraise");
  assert.ok(Math.abs(metric.reachableCombos - [...iso].reduce((n, [hand, raise]) => n + combos(hand) * raise / 100, 0)) < 1e-10);
  const [defense] = report.limpReraiseDefense;
  assert.ok(Math.abs(defense.threshold - 9.5 / 14) < 1e-12);
  assert.ok(defense.foldRate <= defense.threshold, `BB fold ${defense.foldRate}`);
  assert.ok(!report.findings.some(f => f.spot === "BB vs SB limp-reraise" || f.spot === "BB_vs_SB_limp_reraise"));

  const placeholder = structuredClone(data);
  const spot = placeholder.limp.spots.find(s => s.id === "BB_vs_SB_limp_reraise");
  Object.assign(spot.hands.find(row => iso.get(row.hand) === 0), { fold: 0, call: 100, four_bet: 0 });
  assert.ok(auditEstimates(placeholder).findings.some(f => f.check === "range-flow" && f.spot === "BB vs SB limp-reraise"));

  // Folding every reachable hand lets SB's limp-reraise auto-profit: a blocking error, not a capacity warning.
  const overfold = structuredClone(data);
  for (const row of overfold.limp.spots.find(s => s.id === "BB_vs_SB_limp_reraise").hands) Object.assign(row, { fold: 100, call: 0, four_bet: 0, four_bet_size_bb: null });
  const found = auditEstimates(overfold).findings.filter(f => f.spot === "BB vs SB limp-reraise" && f.check === "auto-profit");
  assert.equal(found.length, 1);
  assert.ok(found.every(isBlockingAuditFinding));
});
