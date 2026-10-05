import { isInPosition, positions } from "./sizing.ts";

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
// A cold call of a 3bet (the original opener and any later seats still to act).
// Assumed discount, not solver output: the opener's range is uncapped — it can
// 4bet, which forfeits the whole cold call (×~0.93 at a few % squeeze-style
// back-raises), or overcall into a three-way pot where one-pair and dominated
// calls realize less (×~0.95). The extra margin to 0.85 covers seats behind the
// cold caller that can still wake up, and the cold caller's capped-looking flat.
export const OPENER_BEHIND_EQR = 0.85;
// Original 3bettor may back-raise or overcall after the opener flats a cold 4bet.
export const THREE_BETTOR_BEHIND_EQR = 0.85;
// A non-blind seat (HJ / CO / BTN) cold-calling an open with every later seat
// still to act. Assumed discounts, not solver output; the heads-up EQR table
// alone ignores the seats behind and overstates cold calls.
// Squeeze: each later seat squeezes roughly 3%, forfeiting the whole flat
// (×0.97 per seat), keyed by seats behind: 2 (BTN) 0.94, 3 (CO) 0.91, 4 (HJ) 0.885.
export const COLD_CALL_SQUEEZE_EQR: Readonly<Record<number, number>> = Object.freeze({ 2: 0.94, 3: 0.91, 4: 0.885 });
// Overcalls: the blinds overcall often, and offsuit flats (one-pair, often
// dominated, no flush) realize less in three-way pots (×0.95). Suited hands and
// pairs keep their multiway implied odds, so only offsuit hands take this.
export const COLD_CALL_OFFSUIT_EQR = 0.95;
export function seatsBehind(hero: string) {
  return positions.length - 1 - positions.indexOf(hero);
}
const ranks = "23456789TJQKA";
export function eqrCategory(hand: string) {
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
export function equityRealization(hand: string, hero: string, opponents: string[], { allIn = false, bbBehind = false, callerBehind = false, openerBehind = false, coldCallBehind = false, threeBettorBehind = false } = {}) {
  const category = eqrCategory(hand);
  if (!positions.includes(hero) || !Array.isArray(opponents) || ![1, 2, 3].includes(opponents.length) ||
      new Set([hero, ...opponents]).size !== opponents.length + 1 || opponents.some(p => !positions.includes(p))) {
    throw new Error("EQR requires two to four distinct valid positions");
  }
  if (bbBehind && (hero !== "SB" || opponents.includes("BB"))) throw new Error("BB behind applies only to SB before BB acts");
  if (callerBehind && (bbBehind || opponents.length !== 1)) throw new Error("Caller behind applies only to a heads-up squeeze response");
  if (openerBehind && (bbBehind || callerBehind || opponents.length !== 1)) throw new Error("Opener behind applies only to a heads-up cold call of a 3bet");
  if (coldCallBehind && (bbBehind || callerBehind || openerBehind || ![1, 2, 3].includes(opponents.length) ||
      !Object.hasOwn(COLD_CALL_SQUEEZE_EQR, seatsBehind(hero)) || opponents.some(p => positions.indexOf(p) > positions.indexOf(hero)))) {
    throw new Error("Cold call behind applies only to HJ / CO / BTN calling earlier open / calls");
  }
  if (threeBettorBehind && (bbBehind || callerBehind || openerBehind || coldCallBehind || opponents.length !== 1)) throw new Error("3bettor behind applies only to the opener facing a cold 4bet");
  if (allIn) return 1;
  const ip = opponents.every(opponent => isInPosition(hero, opponent));
  return EQR[category][ip ? 0 : 1] * (MULTIWAY_EQR ** (opponents.length - 1)) * (bbBehind ? BB_BEHIND_EQR : 1) *
    (callerBehind ? CALLER_BEHIND_EQR : 1) * (openerBehind ? OPENER_BEHIND_EQR : 1) * (threeBettorBehind ? THREE_BETTOR_BEHIND_EQR : 1) *
    (coldCallBehind ? COLD_CALL_SQUEEZE_EQR[seatsBehind(hero)] : 1) *
    (coldCallBehind && category.startsWith("offsuit") ? COLD_CALL_OFFSUIT_EQR : 1);
}
