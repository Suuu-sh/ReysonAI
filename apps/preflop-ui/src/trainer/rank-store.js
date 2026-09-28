// Ranked matches: fixed conditions, a daily cap, and an Elo-style rating kept in this browser only.
// When accounts land, the same records can be sent to the server to build a leaderboard.
import { normalizeSettings } from "./trainer-data.js";

const KEY = "solveaai.trainer.ranked.v1";
// Locked in production builds until launch; only the dev server shows ranked matches and the leaderboard.
export const RANKED_ENABLED = Boolean(import.meta.env?.DEV);
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

// --- Leaderboard ---
// `others` will come from the server once accounts exist; today only this browser's player is known.
export const LEADERBOARD_MIN_MATCHES = 3;
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function playerSummary(state, period = "all", now = Date.now()) {
  const matches = period === "week" ? state.matches.filter(match => now - match.at < WEEK) : state.matches;
  if (!matches.length) return null;
  const answered = matches.reduce((sum, match) => sum + (match.answered ?? 0), 0);
  const correct = matches.reduce((sum, match) => sum + (match.accuracy ?? 0) * (match.answered ?? 0), 0);
  return {
    rating: period === "week" ? matches.at(-1).after : state.rating,
    gain: matches.at(-1).after - matches[0].before,
    matches: matches.length,
    accuracy: answered ? correct / answered : 0,
  };
}

// Players below the minimum match count are listed as unranked so a lucky first match cannot top the board.
export function leaderboardRows(players) {
  const ranked = players.filter(player => player.matches >= LEADERBOARD_MIN_MATCHES)
    .sort((a, b) => b.rating - a.rating || b.accuracy - a.accuracy)
    .map((player, index) => ({ ...player, place: index + 1 }));
  const unranked = players.filter(player => player.matches < LEADERBOARD_MIN_MATCHES).map(player => ({ ...player, place: null }));
  return [...ranked, ...unranked];
}
