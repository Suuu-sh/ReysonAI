import type { Inputs } from './types.ts';
import { combosOf } from '../lib/equity.ts';

// Exact existence check, not an equity estimate. A preflop-reachable AA/AA
// history cannot reach a flop containing an ace. Only the two live ranges
// block the postflop deck; folded participants are deliberately not used.
export function hasPostflopDeal(inputs: Inputs, board: readonly number[]): boolean;
export function hasPostflopDeal(inputs?: any, board?: any) : any {
  const blocked = new Set(board);
  const expand = (seat: any) : any => inputs.seatRows[seat].flatMap((row: any) : any => row.freq > 0
    ? combosOf(row.hand).filter((combo: any) : any => combo.every((card: any) : any => !blocked.has(card))) : ([] as any[]));
  const a = expand(inputs.spot.oop), b = expand(inputs.spot.ip);
  if (!a.length || !b.length) return false;
  return a.some((left: any) : any => b.some((right: any) : any => left.every((card: any) : any => !right.includes(card))));
}

export function assertPostflopDeal(inputs: Inputs, board: readonly number[]): void;
export function assertPostflopDeal(inputs?: any, board?: any) : any {
  if (!hasPostflopDeal(inputs, board)) {
    const error: any = new Error('This board is unreachable from the saved preflop ranges.');
    error.code = 'POSTFLOP_BOARD_UNREACHABLE';
    throw error;
  }
}
