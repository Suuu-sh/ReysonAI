import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fiveBetEquityLead } from "../scripts/lib/five-bet-reason.mjs";
const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
function check(text, equity, need, label) {
  const match = text.match(/(?:SB|BB|UTG|HJ|CO|BTN)のオールインレンジに対する勝率は([\d.]+)%で、必要勝率([\d.]+)%(?:を([\d.]+)pt上回ります|に([\d.]+)pt届きません)。/);
  assert.ok(match, label);
  assert.equal(Number(match[1]), equity, label);
  assert.equal(Number(match[2]), need, label);
  // Independent arithmetic in integer tenths of a percentage point.
  const expected = Math.round(equity * 10) - Math.round(need * 10);
  assert.equal(Math.round(Number(match[3] ?? match[4]) * 10), Math.abs(expected), label);
  assert.equal(match[3] !== undefined, expected >= 0, label);
  return match[0];
}
test("5bet copy subtracts rounded facts, including both signs and zero", () => {
  for (const [equity, need, shownEquity, shownNeed] of [
    [28.94, 37.36, 28.9, 37.4], // raw shortage 8.4; displayed shortage 8.5
    [45.04, 37.36, 45.0, 37.4], // raw excess 7.7; displayed excess 7.6
    [29.65, 37.5, 29.7, 37.5], // raw toFixed gives 29.6; saved round1 gives 29.7
    [32.05, 37.4, 32.1, 37.4], // same rounding discrepancy for A4s
    [37.36, 37.44, 37.4, 37.4],
    [37.44, 37.36, 37.4, 37.4],
  ]) check(fiveBetEquityLead({ equity, need, fiveBettor: "SB" }), shownEquity, shownNeed, `${equity}/${need}`);
});
test("all 15 saved 5bet spots agree with displayed arithmetic and detailed reasons", () => {
  const data = load("five-bet-responses");
  assert.equal(data.spots.length, 15);
  let reachable = 0;
  for (const spot of data.spots) {
    const detail = load(`reasons/${spot.id}`);
    assert.equal(detail.spot_facts.call_break_even_equity_pct, spot.call_break_even_equity_pct);
    for (const row of spot.hands) {
      const facts = detail.hands[row.hand];
      assert.equal(facts.facts.equity_vs_shove_pct, row.equity_vs_shove_pct);
      if (row.equity_vs_shove_pct === null) continue;
      reachable++;
      const label = `${spot.id}/${row.hand}`;
      const inline = check(row.reason, row.equity_vs_shove_pct, spot.call_break_even_equity_pct, label);
      assert.equal(check(facts.reason, row.equity_vs_shove_pct, spot.call_break_even_equity_pct, label), inline, label);
      assert.equal(fiveBetEquityLead({ equity: row.equity_vs_shove_pct, need: spot.call_break_even_equity_pct, fiveBettor: spot.five_bettor }), inline, label);
    }
  }
  assert.ok(reachable > 0);
});
