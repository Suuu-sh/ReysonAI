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
