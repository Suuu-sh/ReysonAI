import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, seededRandom } from "../scripts/lib/equity.mjs";
import { fiveCardScore, bestFiveScore } from "./reference/best-five.mjs";
import { parseCards } from "../scripts/postflop-ai/model.mjs";

// The former test compared to the original evaluator including its known bugs.
// Correctness is now checked independently, not against historical output.
test("all 2,598,960 five-card hands match an independent oracle and category counts", () => {
  const counts = Array(9).fill(0), ranks = new Set(), hand = Array(5);
  let total = 0;
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++)
    for (let c = b + 1; c < 50; c++) for (let d = c + 1; d < 51; d++)
      for (let e = d + 1; e < 52; e++) {
        hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
        const expected = fiveCardScore(hand), actual = evaluate(hand);
        if (actual !== expected) assert.equal(actual, expected, hand.join(","));
        counts[Math.floor(actual / 16 ** 5)]++; ranks.add(actual); total++;
      }
  assert.equal(total, 2598960);
  assert.equal(ranks.size, 7462);
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
});

test("seeded six/seven-card hands match exhaustive five-card-subset enumeration", () => {
  const random = seededRandom(20261004);
  for (let round = 0; round < 30000; round++) {
    const cards = new Set(), size = 6 + round % 2;
    while (cards.size < size) cards.add(Math.floor(random() * 52));
    const hand = [...cards], expected = bestFiveScore(hand);
    assert.equal(evaluate(hand), expected, hand.join(","));
    if (round % 100 === 0) {
      assert.equal(evaluate([...hand].reverse()), expected, "card order does not break ties");
      for (let suitShift = 1; suitShift < 4; suitShift++)
        assert.equal(evaluate(hand.map(card => (card & ~3) + ((card + suitShift) & 3))), expected, "suits have equal rank");
    }
  }
});

test("paired-heavy hands choose kickers by rank and ignore cards outside the best five", () => {
  const random = seededRandom(7);
  for (let round = 0; round < 12000; round++) {
    const start = Math.floor(random() * 9), ranks = [start, start + 1, start + 2, start + 3, 12];
    const cards = new Set();
    while (cards.size < 7) cards.add(ranks[Math.floor(random() * ranks.length)] * 4 + Math.floor(random() * 4));
    const hand = [...cards];
    assert.equal(evaluate(hand), bestFiveScore(hand), hand.join(","));
  }
});

test("best-five edge cases cover a second trip, third pair, flush, wheel and quads", () => {
  for (const text of ["AsAhAdKsKhKd2c", "AsAhKsKhQsQh2c", "7s7h7d7c2s2hAs", "KsKhQdQc2c2dAs",
    "AsAhAdKsQsJs2c", "AsAhKsQsJs9c2d", "As2s3s4s5sKdQh", "AsKsQsJs9s8s2s", "AsKdQhJcTs2c3d"]) {
    const cards = parseCards(text, text.length / 2);
    assert.equal(evaluate(cards), bestFiveScore(cards), text);
  }
});
