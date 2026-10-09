import { combosOf } from '../lib/equity.ts';

// Exact existence check, not an equity estimate. A preflop-reachable AA/AA
// history cannot reach a flop containing an ace. Only the two live ranges
// block the postflop deck; folded participants are deliberately not used.
export function hasPostflopDeal(inputs, board) {
  const blocked = new Set(board);
  const expand = seat => inputs.seatRows[seat].flatMap(row => row.freq > 0
    ? combosOf(row.hand).filter(combo => combo.every(card => !blocked.has(card))) : []);
  const a = expand(inputs.spot.oop), b = expand(inputs.spot.ip);
  if (!a.length || !b.length) return false;
  return a.some(left => b.some(right => left.every(card => !right.includes(card))));
}

export function assertPostflopDeal(inputs, board) {
  if (!hasPostflopDeal(inputs, board)) {
    const error = new Error('This board is unreachable from the saved preflop ranges.');
    error.code = 'POSTFLOP_BOARD_UNREACHABLE';
    throw error;
  }
}
