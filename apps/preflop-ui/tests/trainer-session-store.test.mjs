import assert from "node:assert/strict";
import { test } from "node:test";
import { grade, normalizeSettings, spotById } from "../src/trainer/trainer-data.ts";
import { loadDrillDrafts, removeDrillDraft, restoreDrillDraft, saveDrillDraft } from "../src/trainer/drill-session-store.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test("an interrupted drill is saved and restored with its answer, score, and current question", () => {
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };
  const spot = spotById.get("UTG_open");
  const graded = grade(spot, "AA", "open");
  const draft = {
    key: "preset-open", drillId: "preset-open", drillName: "オープン", reviewOnly: false,
    settings: normalizeSettings({ kinds: ["open"], positions: ["UTG"], count: 10 }), savedAt: 123,
    elapsedMs: 45_000, question: { spotId: spot.id, hand: "AA", cards: ["As", "Ah"], review: false },
    answerAction: "open", session: { log: [{ spotId: spot.id, hand: "AA", cards: ["As", "Ah"], action: "open", ...graded }] },
  };

  const saved = saveDrillDraft({}, draft);
  const loaded = loadDrillDrafts();
  const restored = restoreDrillDraft(loaded["preset-open"]);

  assert.equal(saved["preset-open"].session.answered, 1);
  assert.equal(restored.question.spot, spot);
  assert.deepEqual(restored.question.cards, ["As", "Ah"]);
  assert.equal(restored.answer.action, "open");
  assert.equal(restored.session.score, 1);
  assert.equal(restored.elapsedMs, 45_000);
  assert.ok(JSON.parse(storage.getItem("solveaai.trainer.drafts.v1"))["preset-open"]);
});

test("invalid or out-of-scope draft questions are ignored, and finished sessions can be removed", () => {
  globalThis.window = { localStorage: memoryStorage() };
  const invalid = { key: "preset-open", drillId: "preset-open", drillName: "オープン", reviewOnly: false,
    settings: normalizeSettings({ kinds: ["open"], positions: ["UTG"] }),
    question: { spotId: "BB_vs_BTN", hand: "AA", cards: ["As", "Ah"] }, session: { log: [] } };

  assert.deepEqual(saveDrillDraft({}, invalid), {});
  const draft = { ...invalid, question: { spotId: "UTG_open", hand: "AA", cards: ["As", "Ah"] } };
  const drafts = saveDrillDraft({}, draft);
  assert.deepEqual(removeDrillDraft(drafts, "preset-open"), {});
  assert.deepEqual(loadDrillDrafts(), {});
});

test("an unanswered next question resumes after earlier answers in the same session", () => {
  globalThis.window = { localStorage: memoryStorage() };
  const firstSpot = spotById.get("UTG_open");
  const currentSpot = spotById.get("HJ_open");
  const graded = grade(firstSpot, "AA", "open");
  const draft = {
    key: "preset-open", drillId: "preset-open", drillName: "オープン", reviewOnly: false,
    settings: normalizeSettings({ kinds: ["open"], positions: ["UTG", "HJ"], count: 10 }),
    question: { spotId: currentSpot.id, hand: "AJo", cards: ["As", "Jh"], review: false }, answerAction: null,
    session: { log: [{ spotId: firstSpot.id, hand: "AA", cards: ["As", "Ah"], action: "open", ...graded }] },
  };

  const saved = saveDrillDraft({}, draft)["preset-open"];
  const restored = restoreDrillDraft(saved);

  assert.equal(restored.question.spot, currentSpot);
  assert.equal(restored.question.hand, "AJo");
  assert.equal(restored.answer, null);
  assert.equal(restored.session.answered, 1);
  assert.equal(restored.session.score, 1);
});
