import assert from "node:assert/strict";
import { test } from "node:test";
import { SPOTS, compareAcross, filterSpots, grade, handCategory, pickQuestion, randomSuits, spotById, studyNote } from "../src/trainer/trainer-data.js";
import { summarize } from "../src/trainer/trainer-store.js";

const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test("drill covers 5 open spots and 15 open-response spots", () => {
  assert.equal(filterSpots({ kind: "open" }).length, 5);
  assert.equal(filterSpots({ kind: "response" }).length, 15);
  assert.deepEqual(filterSpots({ position: "BB" }).map(spot => spot.id).sort(), ["BB_vs_BTN", "BB_vs_CO", "BB_vs_HJ", "BB_vs_SB", "BB_vs_UTG"]);
  for (const spot of SPOTS) assert.equal(spot.byHand.size, 169, spot.id);
});

test("grading gives best to the top action, mixed from 20% and miss below", () => {
  const spot = spotById.get("UTG_open");
  assert.equal(grade(spot, "AA", "open").result, "best");
  assert.equal(grade(spot, "AA", "fold").result, "miss");
  const mixed = [...spot.byHand].find(([, mix]) => mix.open >= 0.2 && mix.open <= 0.4);
  assert.ok(mixed, "UTG has a mixed hand");
  const [hand, mix] = mixed;
  const minority = mix.open < mix.fold ? "open" : "fold";
  assert.equal(grade(spot, hand, minority).result, "mixed");
  assert.equal(grade(spot, hand, minority).score, 0.5);
});

test("questions favour borderline hands and review items come from the allowed spots", () => {
  const random = seeded(7);
  const spots = filterSpots({ kind: "open" });
  const picks = Array.from({ length: 300 }, () => pickQuestion(spots, random));
  const trashFolds = picks.filter(({ spot, hand }) => spot.byHand.get(hand).fold === 1 && ["72o", "83o", "92o", "32o"].includes(hand));
  assert.ok(trashFolds.length < 6, `too many trash hands: ${trashFolds.length}`);
  const reviewed = pickQuestion(spots, () => 0, [{ spotId: "BB_vs_BTN", hand: "AKo" }, { spotId: "UTG_open", hand: "A9s" }]);
  assert.deepEqual([reviewed.spot.id, reviewed.hand, reviewed.review], ["UTG_open", "A9s", true]);
});

test("suits match the hand class", () => {
  const random = seeded(3);
  for (let i = 0; i < 50; i++) {
    const [a, b] = randomSuits("AKs", random); assert.equal(a[1], b[1]);
    const [c, d] = randomSuits("AKo", random); assert.notEqual(c[1], d[1]);
    const [e, f] = randomSuits("QQ", random); assert.notEqual(e[1], f[1]);
  }
});

test("categories, notes and cross-spot comparison", () => {
  assert.equal(handCategory("QQ"), "pair_high");
  assert.equal(handCategory("A5s"), "suited_ace");
  assert.equal(handCategory("76s"), "suited_connector");
  assert.equal(handCategory("KJo"), "offsuit_broadway");
  assert.match(studyNote("three_bet", "A5s"), /ブロッカー/);
  assert.equal(compareAcross(spotById.get("BTN_open"), "K9o").length, 5);
  assert.deepEqual(compareAcross(spotById.get("BB_vs_BTN"), "K9o").map(row => row.spot.opener), ["UTG", "HJ", "CO", "BTN", "SB"]);
});

test("weakness summary ranks low scores first and keeps unresolved misses for review", () => {
  const history = [
    { spotId: "UTG_open", hand: "A9s", result: "miss", score: 0 },
    { spotId: "UTG_open", hand: "A9s", result: "best", score: 1 },
    { spotId: "BB_vs_BTN", hand: "K9o", result: "miss", score: 0 },
    { spotId: "BB_vs_BTN", hand: "Q5s", result: "mixed", score: 0.5 },
  ];
  const stats = summarize(history);
  assert.equal(stats.answered, 4);
  assert.equal(stats.rate, 1.5 / 4);
  assert.equal(stats.bySpot[0].key, "BB_vs_BTN");
  assert.deepEqual(stats.review.map(item => item.hand), ["K9o"]);
});

test("study notes name the hero's actual seat", () => {
  assert.match(studyNote("call", "K7s", spotById.get("BB_vs_BTN")), /BB/);
  assert.doesNotMatch(studyNote("call", "K7s", spotById.get("CO_vs_HJ")), /BB/);
  assert.doesNotMatch(studyNote("fold", "A4s", spotById.get("BTN_open")), /前のポジション/);
  assert.match(studyNote("fold", "A4s", spotById.get("UTG_open")), /前のポジション/);
});

test("settings are normalised and drive spot choice, difficulty and strictness", async () => {
  const { normalizeSettings, spotsForSettings } = await import("../src/trainer/trainer-data.js");
  const fallback = normalizeSettings({ kinds: [], positions: ["XX"], count: 7, difficulty: "?", review: "yes" });
  assert.deepEqual([fallback.kinds, fallback.positions.length, fallback.count, fallback.difficulty, fallback.review], [["open", "response"], 6, 20, "standard", true]);
  assert.equal(normalizeSettings({}, "beginner").strictness, "lenient");
  assert.deepEqual(spotsForSettings(normalizeSettings({ kinds: ["open"], positions: ["BTN", "BB"] })).map(spot => spot.id), ["BTN_open"]);
  assert.equal(spotsForSettings(normalizeSettings({ kinds: ["response"], positions: ["UTG"] })).length, 0);

  const random = seeded(11);
  const spots = filterSpots({ kind: "open" });
  for (let i = 0; i < 100; i++) {
    const { spot, hand } = pickQuestion(spots, random, [], 0, "hard");
    assert.ok(Math.max(...Object.values(spot.byHand.get(hand))) < 0.95, `${spot.id} ${hand} is not mixed`);
  }
  const utg = spotById.get("UTG_open");
  const [hand, mix] = [...utg.byHand].find(([, item]) => item.open >= 0.2 && item.open <= 0.4);
  const minority = mix.open < mix.fold ? "open" : "fold";
  assert.equal(grade(utg, hand, minority, { strictness: "strict" }).result, "miss");
  assert.equal(grade(utg, hand, minority, { strictness: "lenient" }).result, "mixed");
});
