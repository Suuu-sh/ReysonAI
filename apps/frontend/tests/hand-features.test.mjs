import test from "node:test";
import assert from "node:assert/strict";
import { featuresFromText } from "../scripts/postflop-ai/hand-features.mjs";
import { drawLevel, madeLevel, roleFromFeatures } from "../scripts/postflop-ai/hand-role.mjs";
import { handRole } from "../src/estimated/postflop-explanation.ts";

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
