export const FASTFOLD_SEASON = 'fastfold-v1';
// Results, not action volume. Prior-hand evidence shrinkage keep short runs small.
// Rating-only returns are robustly clipped to +/-10BB; raw results stay in Stats.
// Experimental coefficients require simulation calibration before production activation.
// Neutral net always maps to 1000 regardless of hands. This is a practice rating, not EV/GTO.
export function fastfoldRating(hands: number, netBb: number, squaredBb: number): number {
  if (!Number.isInteger(hands) || hands < 0 || !Number.isFinite(netBb) || !Number.isFinite(squaredBb) || squaredBb < 0) throw new Error('invalid_rating_evidence');
  return 1000 + Math.max(-800, Math.min(1200, Math.round(4000 * netBb / (hands + 10_000))));
}
export const uncertainty = (hands:number, squaredBb:number) => Math.round(Math.sqrt((1_000_000 + squaredBb) / Math.max(1,hands)) * 100) / 100;
