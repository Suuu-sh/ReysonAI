import type { AnswerEntry, RankState, RankedMatch, LeaderboardPlayer } from "./types.ts";
// Legacy local records remain exportable, but are never imported into server rankings.
import { normalizeSettings } from "./trainer-data.ts";

const KEY = "reysonai.trainer.ranked.v1";
// The UI additionally requires the live authenticated server readiness response.
export const RANKED_ENABLED = true;
import { RANKED_LENGTH, RANKED_DAILY_LIMIT, START_RATING, TIERS, TIER_EN, LEGEND, LEGEND_TOP_N, isLegend, displayTier, tierFor, questionRating, rateMatch, LEADERBOARD_MIN_MATCHES } from "../../../shared/ranked-rules.ts";
export { TIER_EN };
export { RANKED_LENGTH, RANKED_DAILY_LIMIT, START_RATING, TIERS, LEGEND, LEGEND_TOP_N, isLegend, displayTier, tierFor, questionRating, rateMatch, LEADERBOARD_MIN_MATCHES };
const MATCH_LIMIT = 100;
export const RANKED_SETTINGS = Object.freeze(normalizeSettings({ difficulty: "standard", strictness: "standard", review: false }));

const dayKey = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function playedToday(state: RankState, now = Date.now()) {
  return state.matches.filter(match => dayKey(match.at) === dayKey(now)).length;
}

export function recordMatch(state: RankState, log: (AnswerEntry & { mix: Record<string, number> })[], now = Date.now()) {
  const before = state.rating;
  const after = rateMatch(before, log);
  const score = log.reduce((sum, item) => sum + item.score, 0);
  const match = { at: now, before, after, accuracy: log.length ? score / log.length : 0, answered: log.length };
  return { rating: after, peak: Math.max(state.peak, after), matches: [...state.matches, match].slice(-MATCH_LIMIT) };
}

export function emptyRankState(): RankState {
  return { rating: START_RATING, peak: START_RATING, matches: [] };
}

export function loadRankState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    if (!raw || !Number.isFinite(raw.rating)) return emptyRankState();
    const matches = Array.isArray(raw.matches) ? raw.matches.filter((m: Partial<RankedMatch>) => Number.isFinite(m?.at) && Number.isFinite(m?.after)) : [];
    return { rating: raw.rating, peak: Number.isFinite(raw.peak) ? raw.peak : raw.rating, matches: matches.slice(-MATCH_LIMIT) };
  } catch { return emptyRankState(); }
}

export function saveRankState(state: RankState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

// --- Leaderboard ---
// `others` will come from the server once accounts exist; today only this browser's player is known.

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function playerSummary(state: RankState, period = "all", now = Date.now()) {
  const matches = period === "week" ? state.matches.filter(match => now - match.at < WEEK) : state.matches;
  if (!matches.length) return null;
  const answered = matches.reduce((sum, match) => sum + (match.answered ?? 0), 0);
  const correct = matches.reduce((sum, match) => sum + (match.accuracy ?? 0) * (match.answered ?? 0), 0);
  return {
    rating: period === "week" ? matches.at(-1)!.after : state.rating,
    gain: matches.at(-1)!.after - matches[0].before,
    matches: matches.length,
    accuracy: answered ? correct / answered : 0,
  };
}

// Players below the minimum match count are listed as unranked so a lucky first match cannot top the board.
export function leaderboardRows(players: LeaderboardPlayer[]) {
  const ranked = players.filter(player => player.matches >= LEADERBOARD_MIN_MATCHES)
    .sort((a, b) => b.rating - a.rating || b.accuracy - a.accuracy)
    .map((player, index) => ({ ...player, place: index + 1 }));
  const unranked = players.filter(player => player.matches < LEADERBOARD_MIN_MATCHES).map(player => ({ ...player, place: null }));
  return [...ranked, ...unranked];
}
