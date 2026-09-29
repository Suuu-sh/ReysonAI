// Shared rule for calling a 100BB all-in: every chip is in, so the call is decided by
// equity versus the saved shove range against the raked pot odds (no EQR, no later play).
// Used by generate-five-bet-responses.mjs and generate-limp-deep-responses.mjs.
export const ALL_IN_CALL_SAMPLES = 20000;
export const MIX_BAND_PCT = 2; // equity margin (pt) over which call frequency ramps from 0 to 100

// Linear 0→100 mix across ±MIX_BAND_PCT around the break-even equity, in 5% steps.
export function allInCallFrequency(marginPct) {
  const raw = 50 + marginPct / MIX_BAND_PCT * 50;
  return Math.max(0, Math.min(100, Math.round(raw / 5) * 5));
}
