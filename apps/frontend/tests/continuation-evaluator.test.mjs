import test from "node:test";
import assert from "node:assert/strict";
import { evaluateContinuation } from "../scripts/lib/continuation-evaluator.ts";
import { seededRandom } from "../scripts/lib/equity.ts";

const ranks = "23456789TJQKA", suits = "shdc";
const cards = text => text.split(/\s+/).map(card => ranks.indexOf(card[0]) * 4 + suits.indexOf(card[1]));
const score = text => evaluateContinuation(cards(text));
const pack = values => [...values, ...Array(6 - values.length).fill(0)].reduce((n, value) => n * 16 + value, 0);

// Independent, deliberately simple five-card reference. Enumerate all 21
// subsets to check seven-card results instead of blessing legacy evaluator
// output (which historically compared sixth/seventh-card kickers).
function fiveReference(hand) {
  const sorted = hand.map(card => card >> 2).sort((a, b) => b - a);
  const counts = new Map(); sorted.forEach(rank => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = hand.every(card => (card & 3) === (hand[0] & 3));
  const unique = [...new Set(sorted)];
  const straight = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0]
    : unique.join() === "12,3,2,1,0" ? 3 : -1;
  if (flush && straight >= 0) return pack([8, straight]);
  if (groups[0][1] === 4) return pack([7, groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack([6, groups[0][0], groups[1][0]]);
  if (flush) return pack([5, ...sorted]);
  if (straight >= 0) return pack([4, straight]);
  if (groups[0][1] === 3) return pack([3, ...groups.map(([rank]) => rank)]);
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack([2, ...groups.map(([rank]) => rank)]);
  if (groups[0][1] === 2) return pack([1, ...groups.map(([rank]) => rank)]);
  return pack([0, ...sorted]);
}
function bestFive(hand) {
  let best = -1;
  for (let a = 0; a < hand.length - 4; a++) for (let b = a + 1; b < hand.length - 3; b++)
    for (let c = b + 1; c < hand.length - 2; c++) for (let d = c + 1; d < hand.length - 1; d++) for (let e = d + 1; e < hand.length; e++) {
      best = Math.max(best, fiveReference([hand[a], hand[b], hand[c], hand[d], hand[e]]));
    }
  return best;
}

test("board-playing pair, trips, two-pair and quads tie regardless of discarded holecards", () => {
  for (const [board, a, b] of [
    ["7s 7h 7d As Ks", "2c 3c", "4c 5c"],
    ["7s 7h 7d 7c As", "2c 2d", "3c 3d"],
    ["As Ah Kd Qc Js", "2c 3c", "4c 5c"],
    ["Ks Kh Qd Qc As", "2c 2d", "3c 3d"],
  ]) assert.equal(score(`${board} ${a}`), score(`${board} ${b}`));
});

test("highest remaining card supplies quads/two-pair kicker, including above a third pair", () => {
  assert.equal(score("7s 7h 7d 7c As 2c 2d"), pack([7, 5, 12]));
  assert.equal(score("Ks Kh Qd Qc As 2c 2d"), pack([2, 11, 10, 12]));
  assert.equal(score("As Ah Kd Kc Qs Qh 2c"), pack([2, 12, 11, 10]));
});

test("wheel, multiple trips, flush truncation and straight-flush ordering match best five", () => {
  for (const text of ["As 2h 3d 4c 5s Kh Qh", "As Ah Ad Ks Kh Kd 2c", "As Ks Qs Js 9s 3s 2h", "9s Ts Js Qs Ks Ah Ad"])
    assert.equal(score(text), bestFive(cards(text)));
});

test("2,000 seeded distinct 5/6/7-card hands match independent exact best-of-five enumeration", () => {
  const random = seededRandom(4093);
  for (let iteration = 0; iteration < 2000; iteration++) {
    const hand = new Set(), size = 5 + iteration % 3;
    while (hand.size < size) hand.add((random() * 52) | 0);
    assert.equal(evaluateContinuation([...hand]), bestFive([...hand]), [...hand].join());
  }
});

test("invalid and duplicate cards fail closed", () => {
  assert.throws(() => evaluateContinuation([0, 0, 1, 2, 3]), /Duplicate/);
  assert.throws(() => evaluateContinuation([0, 1, 2, 3, 52]), /Invalid/);
  assert.throws(() => evaluateContinuation([0, 1, 2, 3]), /5–7/);
});
