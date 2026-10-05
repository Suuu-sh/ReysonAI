import test from "node:test";
import assert from "node:assert/strict";
import { weightedRange, seededRandom, combosOf } from "../scripts/lib/equity.ts";
import { continuationDrawTables, drawContinuationHoleCards, continuationEquity } from "../scripts/lib/continuation-equity.ts";

test("whole-tuple rejection conditions the earlier range instead of preserving its biased marginal", () => {
  const live = weightedRange([{ hand: "AA", weight: 0.9 }, { hand: "KK", weight: 0.1 }]);
  const dead = weightedRange([{ hand: "AA", weight: 1 }]);
  const tables = continuationDrawTables([live, dead]), hero = combosOf("22")[0], random = seededRandom(713);
  let accepted = 0, aces = 0;
  for (let attempts = 0; attempts < 100000 && accepted < 12000; attempts++) {
    const deal = drawContinuationHoleCards(hero, tables, random);
    if (!deal) continue;
    assert.equal(deal.used.size, 6);
    assert.equal(new Set([...hero, ...deal.villains.flat()]).size, 6);
    accepted++;
    if (deal.villains[0][0] >> 2 === 12) aces++;
  }
  assert.equal(accepted, 12000);
  // AA survives the other AA only 1/6 as often as KK: (.9/6)/(.9/6+.1)=.6.
  assert.ok(Math.abs(aces / accepted - 0.6) < 0.02, `${aces / accepted} should approach .6, not the sequential sampler's .9`);
});

test("known folded cards are removed from deals and never compete for the pot", () => {
  const live = weightedRange([{ hand: "22", weight: 1 }]), dead = weightedRange([{ hand: "AA", weight: 1 }]);
  const withDead = continuationEquity("KK", [live], [dead], 3000, seededRandom(10));
  const competing = continuationEquity("KK", [live, dead], [], 3000, seededRandom(10));
  assert.ok(withDead > 0.7);
  assert.ok(competing < 0.3);
  assert.equal(withDead, continuationEquity("KK", [live], [dead], 3000, seededRandom(10)));
});

test("empty live/dead support fails closed rather than generating zero or invented equity", () => {
  assert.equal(continuationEquity("AA", [[]], [], 100, seededRandom(1)), null);
  assert.equal(continuationEquity("AA", [weightedRange([{ hand: "KK", weight: 1 }])], [[]], 100, seededRandom(1)), null);
});
