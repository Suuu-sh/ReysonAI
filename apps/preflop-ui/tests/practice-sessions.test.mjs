import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { grade, spotById } from "../src/trainer/trainer-data.js";
import { loadDrills, recordSession, saveDrills } from "../src/trainer/drill-store.js";
import { loadReviewSessions, newSessionRecord, practiceSessionRows, recordReviewSession } from "../src/trainer/practice-sessions.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

const answer = () => {
  const spot = spotById.get("UTG_open");
  return { spotId: spot.id, hand: "AA", cards: ["As", "Ah"], action: "open", ...grade(spot, "AA", "open") };
};

test("completed drill sessions retain exact hand history across reloads", () => {
  globalThis.window = { localStorage: memoryStorage() };
  const session = newSessionRecord([answer()], 13_000, 1000);
  saveDrills(recordSession(loadDrills(), "preset-open", session));
  const saved = loadDrills().find(drill => drill.id === "preset-open").sessions[0];
  assert.deepEqual(saved.hands, session.hands);
  assert.equal(saved.answered, 1);
  assert.equal(saved.score, 1);
  assert.equal(saved.durationMs, 13_000);
});

test("review attempts are listed but do not count toward named-drill records", () => {
  globalThis.window = { localStorage: memoryStorage() };
  const drills = loadDrills();
  const session = newSessionRecord([answer()], 12_000, 2000);
  recordReviewSession([], session);
  const reviews = loadReviewSessions();
  const rows = practiceSessionRows(drills, reviews, {});
  assert.equal(drills.every(drill => drill.sessions.length === 0), true);
  assert.deepEqual(rows.map(row => [row.kind, row.name, row.hands[0].hand]), [["review", "復習ドリル", "AA"]]);
});

test("session rows include interrupted practice and mark old summary-only attempts honestly", () => {
  const legacy = { at: 100, answered: 2, score: 1, durationMs: 5000 };
  const drills = [{ id: "one", name: "古い練習", sessions: [legacy] }];
  const drafts = { one: { drillName: "古い練習", reviewOnly: false, savedAt: 200, elapsedMs: 3000,
    session: { answered: 1, score: 1, log: [answer()] } } };
  const rows = practiceSessionRows(drills, [], drafts);
  assert.deepEqual(rows.map(row => row.status), ["draft", "completed"]);
  assert.equal(rows[0].hands.length, 1);
  assert.equal(rows[1].hands, undefined);
});

let server;
let SessionPage;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ SessionPage } = await server.ssrLoadModule("/src/trainer/SessionPage.jsx"));
});
after(async () => { await server?.close(); });

test("sessions tab renders a drill attempt with a hand-history entry point", () => {
  const session = newSessionRecord([answer()], 3000, Date.now());
  const html = renderToStaticMarkup(createElement(SessionPage, {
    drills: [{ id: "one", name: "UTG練習", sessions: [session] }], reviews: [], drafts: {}, onResume() {},
  }));
  assert.match(html, /練習セッション/);
  assert.match(html, /UTG練習/);
  assert.match(html, /1<\/td>/);
  assert.match(html, /UTG練習のハンド履歴を見る/);
  assert.doesNotMatch(html, /EV loss|GTOW Score/);
});
