import config from "../../../../configs/cash-6max-100bb.json" with { type: "json" };
import continuationConfig from "../../../../configs/multiway-preflop-stage2.json" with { type: "json" };

export const gameConfig = config;
export const positions = config.positions;
export const sizing = config.sizing;
export const effectiveStackBb = config.stack_bb;
export const openSizeBb = sizing.open_sizes_bb[0];
export function openSizeFor(opener: string) {
  if (!positions.includes(opener)) throw new Error(`オープナーの位置が不正です: ${opener}`);
  return (sizing.open_sizes_by_position as Record<string, number>)?.[opener] ?? openSizeBb;
}
export const sbCompleteToBb = sizing.limp.sb_complete_to_bb;
export const isoVsLimpToBb = sizing.fixed_raise_to_bb.iso_vs_limp;
export const limpReraiseToBb = sizing.fixed_raise_to_bb.limp_reraise;
export const postflopOrder = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

export function isInPosition(position: string, opponent: string) {
  return postflopOrder.indexOf(position) > postflopOrder.indexOf(opponent);
}

const fixed = sizing.fixed_raise_to_bb;

function cappedRaiseTo(sizeBb: number) {
  return Math.min(effectiveStackBb, sizeBb);
}

// Raise-to sizes are fixed BB amounts from the config, not multiples of the previous bet.
export function threeBetToSize(opener: string, raiser: string, callerCount = 0) {
  if (!positions.includes(opener) || !positions.includes(raiser) || raiser === opener || callerCount < 0) {
    throw new Error("3bet／スクイーズの位置またはコーラー数が不正です。");
  }
  if (opener === "SB" && callerCount === 0) return cappedRaiseTo(fixed.three_bet_vs_sb_open);
  const side = isInPosition(raiser, opener) ? "ip" : "oop";
  return cappedRaiseTo(callerCount > 0
    ? fixed.squeeze[side] + (callerCount - 1) * fixed.squeeze.per_additional_caller
    : fixed.three_bet[side]);
}

// Open plus exactly two calls. Keep heads-up and one-caller sizes unchanged.
export function twoCallerSqueezeToSize(opener: string, hero: string) {
  return threeBetToSize(opener, hero, 2);
}

// User-approved exception for these new branches only: 26BB is below the
// 26.5/28.5BB minimum after a 14.5/15.5BB two-caller squeeze.
// Keep it outside gameConfig/sizing: saved HU postflop policies fingerprint
// the complete legacy configuration, even fields their geometry never uses.
export const twoCallerSqueezeFourBetToBb = cappedRaiseTo(continuationConfig.fixed_raise_to_bb.four_bet_after_two_caller_squeeze);

export function fourBetToSize(fourBettor: string, threeBettor: string) {
  if (![threeBettor, fourBettor].every(position => positions.includes(position)) || fourBettor === threeBettor) {
    throw new Error("4betの位置が不正です。");
  }
  if (fourBettor === "SB" && threeBettor === "BB") {
    return cappedRaiseTo(fixed.four_bet_vs_bb_three_bet_from_sb);
  }
  return cappedRaiseTo(fixed.four_bet[isInPosition(fourBettor, threeBettor) ? "ip" : "oop"]);
}

export function squeezeFourBetToSize(fourBettor: string, squeezer: string) {
  // A CO/BTN squeeze to 12BB raises the 2.5BB open by 9.5BB, so the
  // ordinary OOP 20BB 4bet is below the full-raise minimum. Use the approved
  // fixed 26BB size only here; keep heads-up and blind-squeeze sizes intact.
  const standard = fourBetToSize(fourBettor, squeezer);
  return ["CO", "BTN"].includes(squeezer) ? cappedRaiseTo(fixed.four_bet.ip) : standard;
}

export function fiveBetToSize() {
  return sizing.five_bet_all_in ? effectiveStackBb : null;
}
