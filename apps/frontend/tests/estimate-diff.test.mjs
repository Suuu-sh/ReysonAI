import { test } from "node:test";
import assert from "node:assert/strict";
import { diffDatasets, isUnchanged, parseFindings, summarizeFindings } from "../scripts/lib/estimate-diff.mjs";

const spot = (id, hands) => ({ id, hands });
const data = spots => ({ spots });

test("unchanged datasets report nothing", () => {
  const a = data([spot("X", [{ hand: "AA", fold: 0, call: 10, three_bet: 90, three_bet_size_bb: 8 }])]);
  assert.ok(isUnchanged(diffDatasets(a, structuredClone(a))));
});

test("frequency changes are counted per hand with the largest delta; size fields ignored", () => {
  const a = data([spot("X", [{ hand: "AA", call: 10, three_bet: 90, three_bet_size_bb: 8 }, { hand: "KK", call: 50, fold: 50 }])]);
  const b = data([spot("X", [{ hand: "AA", call: 10, three_bet: 90, three_bet_size_bb: 9 }, { hand: "KK", call: 20, fold: 80 }])]);
  const d = diffDatasets(a, b);
  assert.equal(d.spots.length, 1);
  assert.equal(d.spots[0].changedHands, 1);
  assert.deepEqual(d.spots[0].max, { delta: -30, hand: "KK", action: "call" });
});

test("added and removed spots are listed", () => {
  const d = diffDatasets(data([spot("A", [])]), data([spot("B", [])]));
  assert.deepEqual(d.added, ["B"]);
  assert.deepEqual(d.removed, ["A"]);
});

test("findings are parsed from build logs and summarized", () => {
  const f = parseFindings("noise\n- [error] overfold · BB_vs_BTN: too tight\n- [warn] ev-capacity-conflict · BB_vs_SB: x: y\n");
  assert.equal(f.length, 2);
  assert.equal(f[1].detail, "x: y");
  assert.deepEqual(summarizeFindings(f), { total: 2, bySeverity: { error: 1, warn: 1 }, byCheck: { overfold: 1, "ev-capacity-conflict": 1 } });
});
