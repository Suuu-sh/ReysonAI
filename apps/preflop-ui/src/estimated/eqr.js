import { isInPosition, positions } from "./sizing.js";

// Assumed equity-realization ratios, NOT solver results. Replace after a solver
// is implemented. Ordered classification: the first matching category wins.
// Keep scripts/eqr.py in sync; exhaustive parity is covered by tests.
export const EQR = Object.freeze({
  pair: [1.05, 0.90],
  suited_connected: [1.10, 0.92],
  suited_broadway: [1.08, 0.92],
  suited_ace: [1.05, 0.88],
  suited_other: [1.00, 0.80],
  offsuit_broadway: [1.05, 0.85],
  offsuit_connected: [0.95, 0.75],
  offsuit_other: [0.92, 0.70],
});
export const MULTIWAY_EQR = 0.90;
// SB calling an open plus a cold call still has BB left to act behind it.
// Assumed discount, not solver output: BB squeezes roughly 3–5% there, which
// forfeits SB's whole call (×~0.95), and BB overcalls roughly 15–20%, turning
// SB's one-pair-type calls into four-way pots OOP to everyone (×~0.95). The
// extra margin to 0.85 covers SB's narrow, capped-looking flat inviting more
// BB squeezes than the BB-vs-open+1 data implies.
export const BB_BEHIND_EQR = 0.85;
// The opener facing a squeeze with the original cold caller still to act.
// Assumed discount, not solver output: the caller can overcall into a
// three-way pot (the opener's one-pair calls lose value there) and, rarely,
// back-raise (cold 4bet), which forfeits the whole call.
export const CALLER_BEHIND_EQR = 0.90;
const ranks = "23456789TJQKA";
export function eqrCategory(hand) {
  if (!/^(?:([2-9TJQKA])\1|[2-9TJQKA]{2}[so])$/.test(hand)) throw new Error(`Invalid hand: ${hand}`);
  if (hand.length === 2) return "pair";
  const a = ranks.indexOf(hand[0]), b = ranks.indexOf(hand[1]);
  if (a <= b) throw new Error(`Non-canonical hand: ${hand}`);
  const gap = a - b, broadway = b >= ranks.indexOf("T");
  if (hand.endsWith("s")) {
    if (gap <= 2) return "suited_connected";
    if (broadway) return "suited_broadway";
    if (hand[0] === "A") return "suited_ace";
    return "suited_other";
  }
  if (broadway) return "offsuit_broadway";
  return gap <= 1 ? "offsuit_connected" : "offsuit_other";
}
export function equityRealization(hand, hero, opponents, { allIn = false, bbBehind = false, callerBehind = false } = {}) {
  const category = eqrCategory(hand);
  if (!positions.includes(hero) || !Array.isArray(opponents) || ![1, 2].includes(opponents.length) ||
      new Set([hero, ...opponents]).size !== opponents.length + 1 || opponents.some(p => !positions.includes(p))) {
    throw new Error("EQR requires two or three distinct valid positions");
  }
  if (bbBehind && (hero !== "SB" || opponents.includes("BB"))) throw new Error("BB behind applies only to SB before BB acts");
  if (callerBehind && (bbBehind || opponents.length !== 1)) throw new Error("Caller behind applies only to a heads-up squeeze response");
  if (allIn) return 1;
  const ip = opponents.every(opponent => isInPosition(hero, opponent));
  return EQR[category][ip ? 0 : 1] * (opponents.length === 2 ? MULTIWAY_EQR : 1) * (bbBehind ? BB_BEHIND_EQR : 1) *
    (callerBehind ? CALLER_BEHIND_EQR : 1);
}
