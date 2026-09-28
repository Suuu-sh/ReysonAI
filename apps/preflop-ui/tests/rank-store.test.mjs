import test from "node:test";
import assert from "node:assert/strict";
import { RANKED_SETTINGS, emptyRankState, playedToday, questionRating, rateMatch, recordMatch, tierFor } from "../src/trainer/rank-store.js";

const clear = { raise: 0.95, fold: 0.05 };
const mixed = { raise: 0.5, fold: 0.5 };

test("ranked matches use fixed, review-free conditions", () => {
  assert.equal(RANKED_SETTINGS.difficulty, "standard");
  assert.equal(RANKED_SETTINGS.strictness, "standard");
  assert.equal(RANKED_SETTINGS.review, false);
});

test("mixed hands are rated harder than clear hands", () => {
  assert.ok(questionRating(mixed) > questionRating(clear));
});

test("correct answers raise the rating and misses lower it", () => {
  assert.ok(rateMatch(1000, Array(20).fill({ score: 1, mix: mixed })) > 1000);
  assert.ok(rateMatch(1000, Array(20).fill({ score: 0, mix: clear })) < 1000);
});

test("a hard miss costs less than an easy miss", () => {
  const easyMiss = 1000 - rateMatch(1000, [{ score: 0, mix: clear }]);
  const hardMiss = 1000 - rateMatch(1000, [{ score: 0, mix: mixed }]);
  assert.ok(hardMiss < easyMiss);
});

test("recordMatch tracks peak and daily count", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  let state = recordMatch(emptyRankState(), Array(20).fill({ score: 1, mix: mixed }), now);
  state = recordMatch(state, Array(20).fill({ score: 0, mix: clear }), now + 1000);
  assert.equal(playedToday(state, now), 2);
  assert.equal(playedToday(state, now + 86400000), 0);
  assert.ok(state.peak > state.rating);
});

test("tiers step up with rating", () => {
  assert.equal(tierFor(1000).name, "シルバー");
  assert.equal(tierFor(1600).name, "マスター");
  assert.equal(tierFor(1600).next, null);
});

test("leaderboard ranks by rating and holds back players with too few matches", async () => {
  const { leaderboardRows, playerSummary } = await import("../src/trainer/rank-store.js");
  const rows = leaderboardRows([
    { name: "a", rating: 1100, accuracy: 0.7, matches: 5 },
    { name: "b", rating: 1300, accuracy: 0.9, matches: 1 },
    { name: "c", rating: 1200, accuracy: 0.8, matches: 3 },
  ]);
  assert.deepEqual(rows.map(row => [row.name, row.place]), [["c", 1], ["a", 2], ["b", null]]);
  const now = new Date(2026, 8, 28, 12).getTime();
  const old = { at: now - 10 * 86400000, before: 1000, after: 1050, accuracy: 0.8, answered: 20 };
  const recent = { at: now - 1000, before: 1050, after: 1030, accuracy: 0.5, answered: 20 };
  const state = { rating: 1030, peak: 1050, matches: [old, recent] };
  assert.equal(playerSummary(state, "all", now).matches, 2);
  assert.equal(playerSummary(state, "week", now).gain, -20);
  assert.equal(playerSummary({ rating: 1000, peak: 1000, matches: [] }, "week", now), null);
});
