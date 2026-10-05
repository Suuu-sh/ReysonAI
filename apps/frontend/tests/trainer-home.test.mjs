import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { practicePulse } from "../src/trainer/trainer-pulse.ts";

let server;
let TrainerHome;
let SessionPage;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ TrainerHome } = await server.ssrLoadModule("/src/trainer/DrillLibrary.tsx"));
  ({ SessionPage } = await server.ssrLoadModule("/src/trainer/SessionPage.tsx"));
});
after(async () => { await server?.close(); });

test("today's practice: answers today, recent accuracy and the day streak", () => {
  const now = new Date(2026, 9, 4, 15).getTime();
  const day = 24 * 60 * 60 * 1000;
  const at = (daysAgo, hour = 10) => new Date(2026, 9, 4 - daysAgo, hour).getTime();
  const history = [
    { at: at(5), score: 1 },
    { at: at(2), score: 0 }, { at: at(1), score: 1 },
    { at: at(0, 9), score: 1 }, { at: at(0, 14), score: 0.5 },
  ];
  const pulse = practicePulse(history, now);
  assert.equal(pulse.today, 2);
  assert.equal(pulse.streak, 3);
  assert.equal(pulse.recentCount, 5);
  assert.ok(Math.abs(pulse.accuracy - 0.7) < 1e-9);
  // No answer yet today: the streak still counts up to yesterday.
  assert.equal(practicePulse(history.slice(0, 3), now).streak, 2);
  assert.deepEqual(practicePulse([], now), { today: 0, accuracy: null, recentCount: 0, streak: 0 });
  void day;
});

test("trainer landing keeps its pink eyebrow without a duplicate page title", () => {
  const html = renderToStaticMarkup(createElement(TrainerHome, {
    drills: [], reviewCount: 0, onOpenDrills() {}, onCreate() {}, onStartReview() {}, onResume() {},
  }));
  assert.match(html, /<h1 class="trainer-home-eyebrow">TRAINER<\/h1>/);
  assert.doesNotMatch(html, /<h1>練習モードを選ぶ<\/h1>/);
  assert.match(html, /ランク戦で実力を測り、Agent戦で実戦の感覚をつかみ/);
  assert.doesNotMatch(html, /trainer-pulse|今日の回答|直近\d+問の正答率|連続練習/);
});

test("ranked emblem keeps its tier but omits match history for empty and populated records", () => {
  for (const matches of [[], [{ before: 1200, after: 1215 }]]) {
    const html = renderToStaticMarkup(createElement(TrainerHome, {
      drills: [], reviewCount: 0, rank: { rating: 1200, peak: 1250, remaining: 3, matches }, rankedReady: true,
      onOpenDrills() {}, onCreate() {}, onStartReview() {}, onResume() {}, onStartRanked() {}, onOpenRanking() {},
    }));
    assert.match(html, /class="ranked-tier-name"/);
    assert.doesNotMatch(html, /まだ試合なし|No matches yet|Last match|直近5試合|ranked-pips/);
  }
});

test("sessions page keeps its session-total stats", () => {
  const html = renderToStaticMarkup(createElement(SessionPage, { drills: [], reviews: [], drafts: {}, onResume() {} }));
  assert.match(html, /class="trainer-pulse" aria-label="セッションの合計"/);
  assert.match(html, /セッション/);
  assert.match(html, /正答率/);
  assert.match(html, /練習時間/);
});
