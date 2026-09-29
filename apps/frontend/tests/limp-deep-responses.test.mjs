import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.ts";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { callContexts, callFacts } from "../src/estimated/call-ev.ts";
import { findLimpDeepResponseSpot, validateLimpDeepResponses } from "../src/estimated/limp-deep-responses.ts";
import { validateLimpResponses } from "../src/estimated/limp-responses.ts";
import { raked } from "../src/estimated/rake.ts";
import { allInCallFrequency } from "../scripts/lib/all-in-call.mjs";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const opening = load("opening-ranges");
const limp = load("limp-responses");
const data = load("limp-deep-responses");
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"),
  fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"), multiway: load("multiway-responses"),
  squeezes: load("squeeze-responses"), limp: load("limp-responses"), limpDeep: load("limp-deep-responses"),
  coldThreeBets: load("cold-three-bet-responses") });
const combos = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const rows = spot => new Map(spot.hands.map(row => [row.hand, row]));
const sbOpen = rows(opening.spots.find(s => s.id === "SB_open"));
const sbIso = rows(limp.spots.find(s => s.id === "SB_vs_BB_iso"));
const bbIso = rows(limp.spots.find(s => s.id === "BB_vs_SB_limp"));
const bbReraise = rows(limp.spots.find(s => s.id === "BB_vs_SB_limp_reraise"));
const sbReach = hand => sbOpen.get(hand).limp / 100 * sbIso.get(hand).raise / 100;
const bbReach = hand => bbIso.get(hand).raise / 100 * bbReraise.get(hand).four_bet / 100;
const sb = findLimpDeepResponseSpot(data, "SB_vs_BB_limp_four_bet");
const bb = findLimpDeepResponseSpot(data, "BB_vs_SB_limp_five_bet");

test("limp deep dataset has both 169-hand spots, source ids and the 1 / 3.5 / 10.5 / 26 / 100BB sizes", () => {
  assert.equal(validateLimpDeepResponses(data, opening, limp), data);
  // The existing limp dataset and its validator stay unchanged.
  assert.equal(validateLimpResponses(limp, opening), limp);
  assert.deepEqual(data.spots.map(s => s.id), ["SB_vs_BB_limp_four_bet", "BB_vs_SB_limp_five_bet"]);
  assert.equal(data.entry_count, 338);
  assert.deepEqual(data.metadata.legal_actions, { SB_vs_BB_limp_four_bet: ["fold", "call", "all_in"], BB_vs_SB_limp_five_bet: ["fold", "call"] });
  for (const spot of data.spots) {
    assert.deepEqual(spot.hands.map(row => row.hand), hands);
    assert.deepEqual([spot.open_size_bb, spot.iso_size_bb, spot.limp_reraise_size_bb, spot.four_bet_size_bb, spot.all_in_size_bb, spot.effective_stack_bb],
      [1, 3.5, 10.5, 26, 100, 100]);
    assert.deepEqual([spot.source_opening_id, spot.source_limp_response_id, spot.source_iso_response_id, spot.source_limp_reraise_response_id],
      ["SB_open", "BB_vs_SB_limp", "SB_vs_BB_iso", "BB_vs_SB_limp_reraise"]);
  }
  assert.deepEqual([sb.hero, sb.opponent, bb.hero, bb.opponent, bb.source_four_bet_response_id], ["SB", "BB", "BB", "SB", sb.id]);
});

test("unreachable rows are fold=100 placeholders; reachable BB rows carry their equity", () => {
  for (const row of sb.hands) {
    if (!sbReach(row.hand)) assert.deepEqual([row.fold, row.call, row.all_in, row.all_in_size_bb], [100, 0, 0, null], row.hand);
    else assert.equal(row.all_in_size_bb, row.all_in ? 100 : null, row.hand);
  }
  for (const row of bb.hands) {
    if (!bbReach(row.hand)) assert.deepEqual([row.fold, row.call, row.equity_vs_shove_pct], [100, 0, null], row.hand);
    else assert.ok(Number.isFinite(row.equity_vs_shove_pct), row.hand);
  }
  assert.ok(sb.hands.filter(row => sbReach(row.hand)).length > 20);
  assert.ok(bb.hands.filter(row => bbReach(row.hand)).length >= 5);
});

test("BB's all-in response is computed from the saved shove range and raked pot odds", () => {
  const shoveCombos = sb.hands.reduce((n, row) => n + combos(row.hand) * sbReach(row.hand) * row.all_in / 100, 0);
  assert.ok(Math.abs(bb.shove_range_combos - shoveCombos) < 0.05 + 1e-9);
  const need = (100 - 26) / raked(200) * 100;
  assert.equal(bb.call_break_even_equity_pct, Math.round(need * 10) / 10);
  for (const row of bb.hands.filter(row => bbReach(row.hand))) {
    // Stored equity is rounded to 0.1pt, so allow one 5% step at a rounding boundary.
    assert.ok(Math.abs(row.call - allInCallFrequency(row.equity_vs_shove_pct - need)) <= 5, `${row.hand} ${row.call}`);
  }
  assert.equal(bb.hands.find(r => r.hand === "AA").call, 100);
  assert.equal(bb.hands.find(r => r.hand === "KK").call, 100);
  for (const hand of ["A5s", "A4s"]) assert.equal(bb.hands.find(r => r.hand === hand).fold, 100);
});

test("SB keeps premiums in both the call and the all-in; calls pass the EV gate", () => {
  for (const hand of ["AA", "KK", "AKs"]) {
    const row = sb.hands.find(r => r.hand === hand);
    assert.equal(row.fold, 0, hand);
    assert.ok(row.call > 0 && row.all_in > 0, hand);
  }
  const context = callContexts(datasets()).find(c => c.spot.id === "SB_vs_BB_limp_four_bet");
  assert.equal(context.type, "limp_four_bet");
  assert.deepEqual([context.input.cost_to_call, context.input.total_pot_after_call, context.input.all_in], [15.5, 52, false]);
  const equities = load("call-equities").spots[sb.id].equities;
  for (const row of sb.hands.filter(r => sbReach(r.hand) && r.call > 0)) {
    assert.ok(callFacts(context, row.hand, equities[row.hand]).call_ev_bb >= -0.05, row.hand);
  }
});

test("audit covers the deep limp spots: no findings, fold rates within both break-evens", () => {
  const report = auditEstimates(datasets());
  assert.deepEqual(report.findings.filter(isBlockingAuditFinding), []);
  const ids = ["SB_vs_BB_limp_four_bet", "BB_vs_SB_limp_five_bet", "SB vs BB limp 4bet", "BB vs SB limp all-in"];
  assert.deepEqual(report.findings.filter(f => ids.includes(f.spot)), []);
  const [sbDefense, bbDefense] = report.limpDeepDefense;
  assert.ok(Math.abs(sbDefense.threshold - 22.5 / 36.5) < 1e-12);
  assert.ok(Math.abs(bbDefense.threshold - 89.5 / 126) < 1e-12);
  assert.ok(sbDefense.foldRate <= sbDefense.threshold, `SB fold ${sbDefense.foldRate}`);
  assert.ok(bbDefense.foldRate <= bbDefense.threshold, `BB fold ${bbDefense.foldRate}`);
  const metric = id => report.rangeBalance.find(m => m.spot === id);
  const expected = reach => hands.reduce((n, hand) => n + combos(hand) * reach(hand), 0);
  assert.ok(Math.abs(metric(sb.id).reachableCombos - expected(sbReach)) < 1e-10);
  assert.ok(Math.abs(metric(bb.id).reachableCombos - expected(bbReach)) < 1e-10);
  assert.equal(metric(sb.id).segregationExemption, null);
  assert.equal(metric(bb.id).segregationExemption, "5bet all-in response");
});

test("audit blocks broken placeholders and overfolding in the deep limp spots", () => {
  const placeholder = datasets();
  const deepSb = placeholder.limpDeep.spots[0];
  Object.assign(deepSb.hands.find(row => !sbReach(row.hand)), { fold: 0, call: 100, all_in: 0 });
  assert.ok(auditEstimates(placeholder).findings.some(f => f.check === "range-flow" && f.spot === "SB vs BB limp 4bet" && isBlockingAuditFinding(f)));

  const overfold = datasets();
  for (const row of overfold.limpDeep.spots[0].hands) Object.assign(row, { fold: 100, call: 0, all_in: 0, all_in_size_bb: null });
  for (const row of overfold.limpDeep.spots[1].hands) Object.assign(row, { fold: 100, call: 0 });
  const found = auditEstimates(overfold).findings.filter(f => f.check === "auto-profit");
  assert.ok(found.some(f => f.spot === "SB vs BB limp 4bet" && isBlockingAuditFinding(f)));
  assert.ok(found.some(f => f.spot === "BB vs SB limp all-in" && isBlockingAuditFinding(f)));
});

test("validator rejects wrong sizes, frequencies and reachability", () => {
  const broken = mutate => { const copy = structuredClone(data); mutate(copy); return () => validateLimpDeepResponses(copy, opening, limp); };
  assert.throws(broken(d => { d.spots[0].four_bet_size_bb = 24; }), /局面/);
  assert.throws(broken(d => { d.spots[1].all_in_size_bb = 90; }), /局面/);
  assert.throws(broken(d => { d.spots[0].hands[0].call += 5; }), /SB_vs_BB_limp_four_bet/);
  assert.throws(broken(d => { d.spots[0].hands[0].call = 12.5; d.spots[0].hands[0].fold -= 12.5; }), /SB_vs_BB_limp_four_bet/);
  assert.throws(broken(d => { Object.assign(d.spots[0].hands.find(r => !sbReach(r.hand)), { fold: 90, call: 10 }); }), /SB_vs_BB_limp_four_bet/);
  assert.throws(broken(d => { d.spots[1].hands.find(r => !bbReach(r.hand)).equity_vs_shove_pct = 30; }), /BB_vs_SB_limp_five_bet/);
  assert.throws(broken(d => { d.spots.reverse(); }), /局面/);
  assert.throws(broken(d => { d.metadata.legal_actions.BB_vs_SB_limp_five_bet = ["fold", "call", "all_in"]; }), /メタデータ/);
});
