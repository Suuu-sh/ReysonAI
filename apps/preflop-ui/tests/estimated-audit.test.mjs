import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditEstimates } from "../src/estimated/audit.js";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const datasets = () => ({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"), multiway: load("multiway-responses") });

test("persisted estimates pass the consistency audit", () => {
  assert.deepEqual(auditEstimates(datasets()).findings, []);
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

test("audit warns when a BB squeeze range exceeds its heads-up 3bet width", () => {
  const data = datasets();
  const spot = data.multiway.spots.find(s => s.opener === "UTG" && s.callers[0] === "HJ");
  for (const row of spot.hands) Object.assign(row, { fold: 0, call: 0, squeeze: 100 });
  assert.ok(auditEstimates(data).findings.some(f => f.check === "squeeze-width" && f.spot === spot.id && f.severity === "warn"));
});
