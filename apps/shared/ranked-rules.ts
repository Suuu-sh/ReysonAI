// Shared server/client rating bands. Scores reflect AI-estimate alignment, not GTO or win rate.
export const RANKED_LENGTH = 20;
export const RANKED_DAILY_LIMIT = 3;
export const START_RATING = 1000;
const K = 12; // rating points at stake per question




export const TIERS = Object.freeze([
  { name: "ブロンズ", min: 0 },
  { name: "シルバー", min: 950 },
  { name: "ゴールド", min: 1100 },
  { name: "プラチナ", min: 1250 },
  { name: "ダイヤモンド", min: 1400 },
  { name: "マスター", min: 1550 },
]);

export const TIER_EN = { ブロンズ: "Bronze", シルバー: "Silver", ゴールド: "Gold", プラチナ: "Platinum", ダイヤモンド: "Diamond", マスター: "Master", レジェンド: "Legend" };

// Legend is not a rating band: it is the top LEGEND_TOP_N placed players who are in Master
// (2026-10-04 user decision). It needs everyone's placement, so it only exists on the leaderboard.
export const LEGEND = "レジェンド";
export const LEGEND_TOP_N = 10;
export const isLegend = (rating: number, place: number | null) => place != null && place <= LEGEND_TOP_N && rating >= TIERS.at(-1)!.min;
export const displayTier = (rating: number, place: number | null = null) => isLegend(rating, place) ? LEGEND : tierFor(rating).name;

export function tierFor(rating: number) {
  const index = Math.max(0, TIERS.filter(tier => rating >= tier.min).length - 1);
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  return { ...tier, next, progress: next ? (rating - tier.min) / (next.min - tier.min) : 1 };
}

// Clear-cut hands are easy to get right, mixed-frequency hands are hard.
export function questionRating(mix: Record<string, number>) {
  const top = Math.max(...Object.values(mix ?? {}), 0);
  return top >= 0.9 ? 850 : top >= 0.7 ? 1050 : 1250;
}

export function rateMatch(rating: number, log: Array<{mix: Record<string, number>; score: number}>) {
  let current = rating;
  for (const item of log) {
    const expected = 1 / (1 + 10 ** ((questionRating(item.mix) - current) / 400));
    current += K * (item.score - expected);
  }
  return Math.round(current);
}


export const LEADERBOARD_MIN_MATCHES = 3;
