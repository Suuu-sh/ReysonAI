import type { HandTier } from "./types.ts";
import { evaluate } from "../lib/equity.ts";

// HU98 private-card classification. Kept separate from the frozen MW3 helper module.
const four = (bits: number): boolean => bits === 15 || bits === 23 || bits === 27 || bits === 29 || bits === 30;
// For every 13-rank mask, record the ranks that can belong to a four-of-five draw.
// The wheel keeps the reference's -1 ace alias. The acting hand must own a window rank.
const drawOwners = Uint16Array.from({ length: 8192 }, (_, mask) => {
  let owners = four((mask & 15) | ((mask >>> 12) << 4)) ? 0x100f : 0;
  for (let low = 0; low <= 8; low++) if (four((mask >>> low) & 31)) owners |= 31 << low;
  return owners;
});
function hasDraw(hole: readonly number[], board: readonly number[]): boolean {
  if (board.length === 5) return false;
  let mask = 0, c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  for (let i = 0; i < hole.length + board.length; i++) {
    const card = i < hole.length ? hole[i] : board[i - hole.length];
    mask |= 1 << (card >> 2);
    switch (card & 3) { case 0: c0++; break; case 1: c1++; break; case 2: c2++; break; case 3: c3++; }
  }
  const s1 = hole[0] & 3, s2 = hole[1] & 3;
  if (c0 === 4 && (s1 === 0 || s2 === 0) || c1 === 4 && (s1 === 1 || s2 === 1) ||
      c2 === 4 && (s1 === 2 || s2 === 2) || c3 === 4 && (s1 === 3 || s2 === 3)) return true;
  const own = (1 << (hole[0] >> 2)) | (1 << (hole[1] >> 2));
  const owners = drawOwners[mask];
  if (owners !== undefined) return Boolean(owners & own);
  // Keep reference semantics for non-deck inputs passed with an explicit score.
  if (four((mask & 15) | ((mask >>> 12) << 4)) && (own & 0x100f)) return true;
  for (let low = 0; low <= 8; low++) if (four((mask >>> low) & 31) && (own & (31 << low))) return true;
  return false;
}

// `score` may carry an already computed evaluate([...hole, ...board]) (the defence tables rank
// every combo once per board and reuse that value).
export function handTier(hole: readonly number[], board: readonly number[], score: number | null = null): HandTier {
  let lowCards = 0, highCards = 0, duplicate = false;
  for (let i = 0; i < hole.length + board.length; i++) {
    const card = i < hole.length ? hole[i] : board[i - hole.length];
    if (!Number.isInteger(card) || card < 0 || card >= 52) {
      // Retain the reference validation semantics for non-deck inputs.
      duplicate = new Set([...hole, ...board]).size !== hole.length + board.length;
      break;
    }
    const bit = 1 << (card & 31);
    if (card < 32) { if (lowCards & bit) duplicate = true; lowCards |= bit; }
    else { if (highCards & bit) duplicate = true; highCards |= bit; }
  }
  if (hole.length !== 2 || board.length < 3 || board.length > 5 || duplicate) {
    throw new Error("Invalid private hand or board");
  }
  const category = Math.floor((score ?? evaluate([...hole, ...board])) / 16 ** 5);
  if (category > 3) return "monster";
  let top = -Infinity;
  for (const card of board) top = Math.max(top, card >> 2);
  const a = hole[0] >> 2, b = hole[1] >> 2;
  // Pairs and trips count only when a private card is part of them: on a paired board a
  // pocket pair is one pair (QQ on KK4 is medium, not two pair) and the board pair is nobody's.
  const made = category === 0 ? [] : [...new Set([a, b])].filter(rank => {
    let count = a === b && a === rank ? 2 : 1;
    for (const card of board) if (card >> 2 === rank) count++;
    return count >= 2;
  });
  const trips = made.some(rank => (a === b && a === rank ? 2 : 1) + board.filter(card => card >> 2 === rank).length >= 3);
  if (trips || made.length >= 2) return "monster";
  if (made.length === 1) {
    const rank = made[0];
    if (a === b && a > top || rank === top) return "strong";
  }
  if (hasDraw(hole, board)) return "draw";
  return made.length === 1 ? "medium" : "air";
}
