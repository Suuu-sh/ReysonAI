import test from "node:test";
import assert from "node:assert/strict";
import { practicePulse } from "../src/trainer/trainer-pulse.ts";

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
