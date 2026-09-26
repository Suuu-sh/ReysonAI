// Answer history kept in this browser only. Everything here must survive storage being unavailable.
import { CATEGORY_LABELS, handCategory, spotById, spotTitle } from "./trainer-data.js";

const KEY = "solveaai.trainer.history.v1";
const LIMIT = 500;

export function loadHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(item => spotById.has(item?.spotId)) : [];
  } catch { return []; }
}

export function saveHistory(history) {
  try { window.localStorage.setItem(KEY, JSON.stringify(history.slice(-LIMIT))); } catch {}
}

export function clearHistory() {
  try { window.localStorage.removeItem(KEY); } catch {}
}

function bucket(map, key, label, entry) {
  const item = map.get(key) ?? { key, label, answered: 0, score: 0 };
  item.answered++; item.score += entry.score;
  map.set(key, item);
}

export function summarize(history) {
  const bySpot = new Map(), byCategory = new Map(), byHand = new Map();
  for (const entry of history) {
    const spot = spotById.get(entry.spotId);
    bucket(bySpot, spot.id, spotTitle(spot), entry);
    const category = handCategory(entry.hand);
    bucket(byCategory, category, CATEGORY_LABELS[category], entry);
    const key = `${entry.spotId}|${entry.hand}`;
    const hand = byHand.get(key) ?? { spotId: entry.spotId, hand: entry.hand, label: `${entry.hand}（${spotTitle(spot)}）`, answered: 0, misses: 0, last: entry.result };
    hand.answered++; if (entry.result === "miss") hand.misses++; hand.last = entry.result;
    byHand.set(key, hand);
  }
  const rate = item => ({ ...item, rate: item.answered ? item.score / item.answered : 0 });
  const answered = history.length;
  return {
    answered,
    rate: answered ? history.reduce((sum, entry) => sum + entry.score, 0) / answered : 0,
    bySpot: [...bySpot.values()].map(rate).sort((a, b) => a.rate - b.rate || b.answered - a.answered),
    byCategory: [...byCategory.values()].map(rate).sort((a, b) => a.rate - b.rate || b.answered - a.answered),
    // Hands still being missed: at least one miss and the latest answer was not "best".
    review: [...byHand.values()].filter(item => item.misses > 0 && item.last !== "best")
      .sort((a, b) => b.misses - a.misses || b.answered - a.answered),
  };
}

const SETTINGS_KEY = "solveaai.trainer.settings.v1";

export function loadSettings() {
  try { return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null"); } catch { return null; }
}

export function saveSettings(settings) {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}
