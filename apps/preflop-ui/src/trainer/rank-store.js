// Ranked matches: fixed conditions, a daily cap, and an Elo-style rating kept in this browser only.
// When accounts land, the same records can be sent to the server to build a leaderboard.
import { normalizeSettings } from "./trainer-data.js";

const KEY = "solveaai.trainer.ranked.v1";
export const RANKED_LENGTH = 20;
export const RANKED_DAILY_LIMIT = 3;
export const START_RATING = 1000;
const K = 12; // rating points at stake per question
const MATCH_LIMIT = 100;

// Same conditions for everyone: every spot and seat, standard difficulty and grading, no review mix-in.
export const RANKED_SETTINGS = Object.freeze(normalizeSettings({ difficulty: "standard", strictness: "standard", review: false }));

export const TIERS = Object.freeze([
  { name: "ブロンズ", min: 0 },
  { name: "シルバー", min: 950 },
  { name: "ゴールド", min: 1100 },
  { name: "プラチナ", min: 1250 },
  { name: "ダイヤモンド", min: 1400 },
  { name: "マスター", min: 1550 },
]);

export const TIER_EN = { ブロンズ: "Bronze", シルバー: "Silver", ゴールド: "Gold", プラチナ: "Platinum", ダイヤモンド: "Diamond", マスター: "Master" };

export function tierFor(rating) {
  const index = TIERS.findLastIndex(tier => rating >= tier.min);
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  return { ...tier, next, progress: next ? (rating - tier.min) / (next.min - tier.min) : 1 };
}

// Clear-cut hands are easy to get right, mixed-frequency hands are hard.
export function questionRating(mix) {
  const top = Math.max(...Object.values(mix ?? {}), 0);
  return top >= 0.9 ? 850 : top >= 0.7 ? 1050 : 1250;
}

export function rateMatch(rating, log) {
  let current = rating;
  for (const item of log) {
    const expected = 1 / (1 + 10 ** ((questionRating(item.mix) - current) / 400));
    current += K * (item.score - expected);
  }
  return Math.round(current);
}

const dayKey = at => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function playedToday(state, now = Date.now()) {
  return state.matches.filter(match => dayKey(match.at) === dayKey(now)).length;
}

export function recordMatch(state, log, now = Date.now()) {
  const before = state.rating;
  const after = rateMatch(before, log);
  const score = log.reduce((sum, item) => sum + item.score, 0);
  const match = { at: now, before, after, accuracy: log.length ? score / log.length : 0, answered: log.length };
  return { rating: after, peak: Math.max(state.peak, after), matches: [...state.matches, match].slice(-MATCH_LIMIT) };
}

export function emptyRankState() {
  return { rating: START_RATING, peak: START_RATING, matches: [] };
}

export function loadRankState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || !Number.isFinite(raw.rating)) return emptyRankState();
    const matches = Array.isArray(raw.matches) ? raw.matches.filter(m => Number.isFinite(m?.at) && Number.isFinite(m?.after)) : [];
    return { rating: raw.rating, peak: Number.isFinite(raw.peak) ? raw.peak : raw.rating, matches: matches.slice(-MATCH_LIMIT) };
  } catch { return emptyRankState(); }
}

export function saveRankState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
