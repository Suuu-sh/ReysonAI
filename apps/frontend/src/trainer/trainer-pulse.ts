// Trainer home summary from the local answer history ({ score, at } per answer).
const DAY = 24 * 60 * 60 * 1000;
const dayKey = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// Today's practice at a glance: answers today, accuracy over the latest 50, and the day streak.
export function practicePulse(history: { score?: number; at: number }[], now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const today = history.filter(entry => entry.at >= start.getTime()).length;
  const recent = history.slice(-50);
  const accuracy = recent.length ? recent.reduce((sum, entry) => sum + (entry.score ?? 0), 0) / recent.length : null;
  const days = new Set(history.map(entry => dayKey(entry.at)));
  let streak = 0;
  for (let at = days.has(dayKey(now)) ? now : now - DAY; days.has(dayKey(at)); at -= DAY) streak++;
  return { today, accuracy, recentCount: recent.length, streak };
}

