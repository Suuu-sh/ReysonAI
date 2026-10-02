import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, seededRandom } from "../scripts/lib/equity.mjs";

// The original array-based evaluator, kept verbatim as the reference the allocation-free
// evaluate() must reproduce (including its kicker quirks: the quads kicker and the third two-pair
// rank are the next entry by count, not the highest remaining rank).
function referenceEvaluate(cards) {
  const rankOf = card => card >> 2;
  const suitOf = card => card & 3;
  const counts = new Array(13).fill(0);
  const suits = [[], [], [], []];
  for (const card of cards) { counts[rankOf(card)] += 1; suits[suitOf(card)].push(rankOf(card)); }
  const straightHigh = ranks => {
    const has = new Set(ranks);
    for (let high = 12; high >= 4; high -= 1) if ([0, 1, 2, 3, 4].every(i => has.has(high - i))) return high;
    return has.has(12) && [0, 1, 2, 3].every(r => has.has(r)) ? 3 : -1;
  };
  const score = (category, kickers) => {
    let value = category;
    for (let i = 0; i < 5; i += 1) value = value * 16 + (kickers[i] ?? 0);
    return value;
  };
  const flushSuit = suits.find(s => s.length >= 5);
  if (flushSuit) {
    const high = straightHigh(flushSuit);
    if (high >= 0) return score(8, [high]);
  }
  const byCount = [...counts.keys()].filter(r => counts[r]).sort((a, b) => counts[b] - counts[a] || b - a);
  const [top, second] = byCount;
  if (counts[top] === 4) return score(7, [top, byCount.filter(r => r !== top)[0]]);
  if (counts[top] === 3 && counts[second] >= 2) return score(6, [top, second]);
  if (flushSuit) return score(5, flushSuit.sort((a, b) => b - a));
  const straight = straightHigh([...counts.keys()].filter(r => counts[r]));
  if (straight >= 0) return score(4, [straight]);
  const singles = byCount.filter(r => counts[r] === 1);
  if (counts[top] === 3) return score(3, [top, ...singles]);
  if (counts[top] === 2 && counts[second] === 2) return score(2, [top, second, byCount.filter(r => r !== top && r !== second)[0]]);
  if (counts[top] === 2) return score(1, [top, ...singles]);
  return score(0, singles);
}

test("evaluate matches the original implementation on random 5-7 card hands", () => {
  const random = seededRandom(20260930);
  for (let round = 0; round < 400000; round++) {
    const size = 5 + (round % 3);
    const cards = new Set();
    while (cards.size < size) cards.add(Math.floor(random() * 52));
    const hand = [...cards];
    assert.equal(evaluate(hand), referenceEvaluate(hand), hand.join(","));
  }
});

test("evaluate matches on paired-heavy hands (quads, full houses, three pairs)", () => {
  const random = seededRandom(7);
  for (let round = 0; round < 200000; round++) {
    // Draw from only 5 ranks (often adjacent, sometimes with the ace) so multiples are common.
    const start = Math.floor(random() * 9), ranks = [start, start + 1, start + 2, start + 3, random() < 0.5 ? 12 : start + 4];
    const cards = new Set();
    while (cards.size < 7) cards.add(ranks[Math.floor(random() * ranks.length)] * 4 + Math.floor(random() * 4));
    const hand = [...cards];
    assert.equal(evaluate(hand), referenceEvaluate(hand), hand.join(","));
  }
});
