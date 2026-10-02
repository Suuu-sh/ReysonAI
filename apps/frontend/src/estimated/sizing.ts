import config from "../../../../configs/cash-6max-100bb.json" with { type: "json" };

export const gameConfig = config;
export const positions = config.positions;
export const sizing = config.sizing;
export const effectiveStackBb = config.stack_bb;
export const openSizeBb = sizing.open_sizes_bb[0];
export function openSizeFor(opener) {
  if (!positions.includes(opener)) throw new Error(`オープナーの位置が不正です: ${opener}`);
  return sizing.open_sizes_by_position?.[opener] ?? openSizeBb;
}
export const sbCompleteToBb = sizing.limp.sb_complete_to_bb;
export const isoVsLimpToBb = sizing.fixed_raise_to_bb.iso_vs_limp;
export const limpReraiseToBb = sizing.fixed_raise_to_bb.limp_reraise;
export const postflopOrder = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

export function isInPosition(position, opponent) {
  return postflopOrder.indexOf(position) > postflopOrder.indexOf(opponent);
}

const fixed = sizing.fixed_raise_to_bb;

function cappedRaiseTo(sizeBb) {
  return Math.min(effectiveStackBb, sizeBb);
}

// Raise-to sizes are fixed BB amounts from the config, not multiples of the previous bet.
export function threeBetToSize(opener, raiser, callerCount = 0) {
  if (!positions.includes(opener) || !positions.includes(raiser) || raiser === opener || callerCount < 0) {
    throw new Error("3bet／スクイーズの位置またはコーラー数が不正です。");
  }
  if (opener === "SB" && callerCount === 0) return cappedRaiseTo(fixed.three_bet_vs_sb_open);
  const side = isInPosition(raiser, opener) ? "ip" : "oop";
  return cappedRaiseTo(callerCount > 0
    ? fixed.squeeze[side] + (callerCount - 1) * fixed.squeeze.per_additional_caller
    : fixed.three_bet[side]);
}

export function fourBetToSize(fourBettor, threeBettor) {
  if (![threeBettor, fourBettor].every(position => positions.includes(position)) || fourBettor === threeBettor) {
    throw new Error("4betの位置が不正です。");
  }
  if (fourBettor === "SB" && threeBettor === "BB") {
    return cappedRaiseTo(fixed.four_bet_vs_bb_three_bet_from_sb);
  }
  return cappedRaiseTo(fixed.four_bet[isInPosition(fourBettor, threeBettor) ? "ip" : "oop"]);
}

export function fiveBetToSize() {
  return sizing.five_bet_all_in ? effectiveStackBb : null;
}
