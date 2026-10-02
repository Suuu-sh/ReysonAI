import test from "node:test";
import assert from "node:assert/strict";
import { featuresFromText } from "../scripts/postflop-ai/hand-features.mjs";
import { drawLevel, madeLevel, roleFromFeatures } from "../scripts/postflop-ai/hand-role.mjs";
import { handRole } from "../src/estimated/postflop-explanation.ts";
import { betSentences, describeHand } from "../src/estimated/postflop-hand-copy.ts";
import { evaluate } from "../scripts/lib/equity.mjs";

const F = (hole, board) => featuresFromText(hole, board);

test("A♠4♠ on 6♥5♥2♦ is a gutshot plus an overcard with no flush relevance", () => {
  const f = F("As4s", "6h5h2d");
  assert.equal(f.made.category, "highCard");
  assert.equal(f.draws.straight, "gutshot");
  assert.deepEqual(f.draws.outRanks, [1]);
  assert.equal(f.draws.flush, null);
  assert.equal(f.draws.backdoorFlush, null);
  assert.equal(f.draws.combo, false);
  assert.deepEqual(f.overcards.ranks, [12]);
  assert.equal(f.blockers.nutFlush, null);
  assert.equal(f.blockers.nutStraight, true, "the 4 blocks the nut straight (3-4)");
  assert.ok(f.draws.outs >= 3 && f.draws.outs <= 4);
  assert.deepEqual(roleFromFeatures(f, { action: "raise", facingBet: true }), { role: "semi-bluff", sub: "gutshotOvercards" });
});

test("A♥4♥ on 6♥5♥2♦ is the nut flush draw plus a gutshot (combo draw)", () => {
  const f = F("Ah4h", "6h5h2d");
  assert.equal(f.draws.flush.kind, "nut");
  assert.equal(f.draws.straight, "gutshot");
  assert.equal(f.draws.combo, true);
  assert.equal(f.draws.flushOuts, 9);
  assert.ok(f.draws.outs >= 11);
  assert.equal(f.blockers.nutFlush.rank, 12);
  assert.equal(drawLevel(f), "combo");
  assert.equal(roleFromFeatures(f, { action: "bet75" }).role, "semi-bluff");
});

test("4♥3♥ on 6♥5♥2♦ has made the nut straight", () => {
  const f = F("4h3h", "6h5h2d");
  assert.equal(f.made.category, "straight");
  assert.equal(f.made.usesHole, 2);
  assert.equal(f.made.strength, "nut");
  assert.equal(roleFromFeatures(f, { action: "raise", facingBet: true }).role, "value");
});

test("K♥Q♥ on K♠T♥4♥ is top pair with a good kicker and a non-nut flush draw", () => {
  const f = F("KhQh", "KsTh4h");
  assert.equal(f.made.kind, "topPair");
  assert.equal(f.made.kickerStrength, "strong");
  assert.equal(f.draws.flush.kind, "secondNut");
  assert.equal(f.draws.flush.oneCard, false);
  assert.equal(f.made.vulnerable, true);
  assert.equal(madeLevel(f), "strong");
  assert.equal(roleFromFeatures(f, { action: "bet75" }).role, "value");
});

test("pair kinds, sets and two pair", () => {
  assert.equal(F("QcQd", "Jh7s2c").made.kind, "overpair");
  assert.equal(F("6c6d", "Kh7s2c").made.kind, "underpair");
  const set = F("7c7d", "7sKd2h");
  assert.equal(set.made.kind, "set");
  assert.equal(set.made.usesHole, 2);
  assert.equal(F("7c2d", "7sKd7h").made.kind, "trips");
  assert.equal(F("KcJd", "Kh7s2c").made.kind, "topPair");
  assert.equal(F("9c7d", "Kh7s2c").made.kind, "secondPair");
  assert.equal(F("3c4d", "Kh7s2c").made.kind, "highCard");
  assert.equal(F("Kc7d", "Kh7s2c").made.kind, "topTwo");
  assert.equal(F("Kc2d", "Kh7s2c").made.kind, "topAndLower");
  assert.equal(F("Kc9d", "Kh7s2c").made.kind, "topPair");
  assert.equal(F("7c2d", "KsKd7h").made.kind, "boardPairPlusOne");
  assert.equal(F("Ac3d", "KsKd7h").made.kind, "boardPair");
  // Paired board (K J 9 9): a hit on the K leaves the J-9 two pair below it; a hit on the J leaves none.
  assert.equal(F("Kc6d", "KsJd9h9s").made.kind, "boardPairPlusOne");
  assert.equal(F("Kc6d", "KsJd9h9s").made.hasLowerBoardCard, true);
  assert.equal(F("Jc6d", "KsJd9h9s").made.hasLowerBoardCard, false);
});

test("straight draws: open-ended, double-gutter, wheel gutshot and board-only straights", () => {
  const oe = F("9s8s", "7h6dKc");
  assert.equal(oe.draws.straight, "openEnded");
  assert.deepEqual([...oe.draws.outRanks].sort((a, b) => a - b), [3, 8]);
  const dg = F("2s4d", "5h6c8h");
  assert.equal(dg.draws.straight, "doubleGutter");
  assert.deepEqual(dg.draws.outRanks, [1, 5]);
  assert.equal(F("9s7s", "Th6dKc").draws.straight, "gutshot");
  const wheel = F("As2c", "3h4dKc");
  assert.equal(wheel.draws.straight, "gutshot");
  assert.deepEqual(wheel.draws.outRanks, [3]);
  assert.equal(F("As2c", "3h4h5s").made.category, "straight");
  // The straight is on the board: hole cards play no part, so there is no draw credit.
  const boardStraight = F("2c2d", "5h6h7s8d");
  assert.equal(boardStraight.draws.straight, null);
});

test("flush made hands, backdoors and blockers", () => {
  const nutFlush = F("AhKh", "9h5h2hKc3d");
  assert.equal(nutFlush.made.category, "flush");
  assert.equal(nutFlush.made.flushKind, "nut");
  const lowFlush = F("4h3c", "9h5h2hKh3d");
  assert.equal(lowFlush.made.category, "flush");
  const bd = F("Ah9h", "Kh7c2d");
  assert.deepEqual(bd.draws.backdoorFlush, { suit: 2, nut: true });
  assert.equal(bd.draws.flush, null);
  assert.equal(F("Ac9d", "Kh7c2d").draws.backdoorFlush, null);
  assert.equal(F("Ah9c", "Kh7h2d").blockers.nutFlush.rank, 12);
  assert.equal(F("Qc9d", "Kh7h2d").blockers.nutFlush, null);
});

test("river hands have no draws; ace-high showdown value", () => {
  const r = F("As9d", "Kh7c2d4s3h");
  assert.equal(r.street, "river");
  assert.equal(r.draws.any, false);
  assert.equal(r.draws.outs, 0);
  assert.equal(r.made.category, "highCard");
  assert.equal(r.aceHigh, true);
  assert.equal(F("8s6d", "Kh7c2d4s3h").aceHigh, false);
});

test("the shared role follows the features, not the equity alone", () => {
  // A wide c-bet range full of air makes ace-high plus a gutshot look strong by equity (0.6) — it is still a semi-bluff.
  const f = F("As4s", "6h5h2d");
  assert.equal(handRole(0.62, { air: 1 }, "raise", f), "semi-bluff");
  // Without cards the old tier/equity rule still applies.
  assert.equal(handRole(0.62, { air: 1 }, "raise"), "value");
  assert.equal(handRole(0.7, { strong: 1 }, "check", f), "pot-control");
  const nothing = F("Kc3d", "9h7c2d");
  assert.equal(roleFromFeatures(nothing, { action: "bet33" }).role, "bluff");
  const twoOver = F("AcKd", "9h7c2d");
  assert.deepEqual(roleFromFeatures(twoOver, { action: "bet33" }), { role: "semi-bluff", sub: "overcards" });
  const secondPair = F("Qc9d", "Kh9c2d");
  assert.equal(madeLevel(secondPair) !== "strong", true);
});

// ---- board-structure regressions (audit 2026-10-02) ------------------------------------------------------------
const D = (hole, board, en = true) => describeHand(F(hole, board), hole, en, "", "BB");

test("counterfeited two pair reads the pairs actually played, not the hole ranks that match the board", () => {
  const a = F("Kc3c", "Kh8h8c3h");
  assert.notEqual(a.made.kind, "topAndLower");
  assert.equal(a.made.kind, "boardPairPlusOne");
  assert.deepEqual(a.made.pairRanks, [11, 6]);
  for (const en of [true, false]) assert.doesNotMatch(D("Kc3c", "Kh8h8c3h", en).worse, /top pair|トップペア/);
  const b = F("2d3c", "KdKs9c9h2c");
  assert.equal(b.made.kind, "boardTwoPair");
  assert.equal(b.made.usesHole, 0);
  assert.equal(madeLevel(b), "none");
});

test("hands that play the board are not made hands", () => {
  const boat = F("2c2d", "KhKdKc5s5d");
  assert.equal(boat.made.usesHole, 0);
  assert.equal(boat.made.playsBoard, true);
  assert.equal(madeLevel(boat), "none");
  for (const [h, b] of [["2c2d", "Th9d8c7s6h"], ["Ac2c", "Ah7h2h5hKh"], ["2c2d", "KhKdKc5s5d"], ["2c3d", "TdJdQdKdAd"]]) {
    const f = F(h, b);
    assert.equal(f.made.playsBoard, true, `${h} on ${b}`);
    assert.equal(madeLevel(f), "none");
    assert.match(D(h, b).made, /only the board's/);
    assert.match(D(h, b, false).made, /ボードの.*だけ/);
  }
  assert.equal(F("Ac2c", "Ah7h2h5hKh").made.playsBoard, true);
  assert.notEqual(F("Qh2c", "Ah7h2h5hKh").made.playsBoard, true, "the queen of hearts improves the flush");
});

test("worse hands never name a class that beats us on paired or flushy boards", () => {
  for (const en of [true, false]) {
    assert.doesNotMatch(D("5c5d", "KdJs9c9h", en).worse, /top pair|トップペア/);
    assert.doesNotMatch(D("QcTd", "KdJs9c9h", en).worse, /\bsets\b|セット/);
    assert.doesNotMatch(D("2h4h", "Kh8h8c3h", en).worse, /\bsets\b|セット/);
  }
  assert.doesNotMatch(D("TdTh", "8c7c6c5c").worse, /top pair|underpairs/);
  assert.doesNotMatch(D("4c2d", "3sKcKd2c").worse, /top pair/, "trips with no worse-kicker top pair");
});

test("dirty outs do not name a straight draw", () => {
  const a = F("2c4c", "9h8d7c6s");
  assert.equal(a.draws.straight, null);
  assert.equal(a.draws.outs, 0);
  for (const en of [true, false]) assert.doesNotMatch(D("2c4c", "9h8d7c6s", en).draw, /five|\b5\b|で完成/);
  const b = F("TcJd", "QsQd9s2s");
  assert.equal(b.draws.outs, 0);
  assert.ok(b.draws.dirtyOuts > 0);
  assert.notEqual(drawLevel(b), "strong");
});

test("the overpair copy says two pair beats it, not sets", () => {
  const f = F("JcJd", "9h8d7c6s");
  const ctx = { en: true, o: "BB" };
  const d = describeHand(f, "JcJd", true, "", "BB");
  const text = betSentences(d, "bet75", { role: "value", sub: "plain" }, { en: true, o: "BB", street: "flop", ip: true, st: null, bettorMix: null }).join(" ");
  assert.match(text, /loses to two pair and better/);
  assert.doesNotMatch(text, /only to sets/);
  const ja = betSentences(describeHand(f, "JcJd", false, "", "BB"), "bet75", { role: "value", sub: "plain" }, { en: false, o: "BB", street: "flop", ip: true, st: null, bettorMix: null }).join(" ");
  assert.match(ja, /ツーペア以上/);
  void ctx;
});

// Deterministic property test: every class named in the worse-hands text has more losing than beating/tying combos.
test("every class named in the worse text really loses more often than it beats or ties us", () => {
  let seed = 20261002;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const R = "23456789TJQKA", S = "cdhs";
  const txt = cs => cs.map(c => R[c >> 2] + S[c & 3]).join("");
  const boards = ["Kh8h8c3h", "KdJs9c9h", "KdKs9c9h2c", "9h8d7c6s", "Th9d8c7s6h", "KhKdKc5s5d", "Ah7h2h5hKh", "8c7c6c5c", "7h7d2c2s"];
  for (let i = 0; i < 12; i++) { const d = [...Array(52).keys()].sort(() => rand() - .5); boards.push(txt(d.slice(0, 3 + (i % 3)))); }
  const parse = t => t.match(/../g).map(x => R.indexOf(x[0]) * 4 + S.indexOf(x[1]));
  for (const bt of boards) {
    const board = parse(bt), bset = new Set(board), topB = Math.max(...board.map(c => c >> 2));
    const free = [...Array(52).keys()].filter(c => !bset.has(c));
    const holesFor = dead => { const out = []; for (const a of free) if (!dead.has(a)) for (const b of free) if (b > a && !dead.has(b)) out.push([a, b]); return out; };
    for (let n = 0; n < 8; n++) {
      const hole = [free[Math.floor(rand() * free.length)], free[Math.floor(rand() * free.length)]];
      if (hole[0] === hole[1]) continue;
      const f = featuresFromText(txt(hole), bt), w = describeHand(f, txt(hole), true, "", "BB").worse;
      if (madeLevel(f) === "none") continue;
      const me = evaluate([...hole, ...board]);
      const opp = holesFor(new Set([...hole, ...board])).map(h => ({ h, v: evaluate([...h, ...board]) }));
      const cat = v => Math.floor(v / 16 ** 5);
      const check = (label, pred) => {
        const xs = opp.filter(o => pred(o.h, o.v)), lose = xs.filter(o => o.v < me).length;
        assert.ok(xs.length && lose > xs.length - lose, `${txt(hole)} on ${bt}: "${w}" names ${label} (${lose}/${xs.length} lose)`);
      };
      const pocket = h => (h[0] >> 2) === (h[1] >> 2);
      if (/top pair/.test(w)) check("top pair", h => !pocket(h) && h.some(c => (c >> 2) === topB));
      if (/overpairs/.test(w)) check("overpairs", h => pocket(h) && (h[0] >> 2) > topB);
      if (/underpairs/.test(w)) check("underpairs", h => pocket(h) && (h[0] >> 2) < topB && !board.some(c => (c >> 2) === (h[0] >> 2)));
      if (/\bsets\b|\btrips\b/.test(w)) check("sets/trips", (h, v) => cat(v) === 3);
      if (/two pair/.test(w)) check("two pair", (h, v) => cat(v) === 2);
      if (/one-pair/.test(w)) check("one pair", (h, v) => cat(v) === 1);
      if (/straights/.test(w)) check("straights", (h, v) => cat(v) === 4);
      if (/flushes/.test(w)) check("flushes", (h, v) => cat(v) === 5);
      if (/full houses/.test(w)) check("full houses", (h, v) => cat(v) === 6);
    }
  }
});
