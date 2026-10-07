import type { BoardHeight, BoardShape, FlopTexture, HandTier, PreviousLine, RunoutTexture } from "./types.ts";
// Compact, deterministic flop features. Neither policy sees the other player's cards.
import { evaluate } from "../lib/equity.ts";

const ranks = "23456789TJQKA";
const suits = "cdhs";
export const TIERS: HandTier[] = ["monster", "strong", "draw", "medium", "air"];
export const SHAPES: BoardShape[] = ["dry", "wet", "monotone", "paired"];
// Board height by the top card: high = A/K/Q, mid = J/T/9, low = 8 or lower. It lets a flop policy
// treat a high board (good for the preflop raiser's range) differently from a low one.
export const HEIGHTS: BoardHeight[] = ["high", "mid", "low"];
// Flop rule textures: a shape, a height, or both ("dry_low"). Lookup goes from the most specific
// key to "any" (flopTextureKeys), so policies written with shapes only behave as before.
export const TEXTURES: FlopTexture[] = [...SHAPES, ...HEIGHTS, ...SHAPES.flatMap(shape => HEIGHTS.map((height): FlopTexture => `${shape}_${height}`))];
export const RUNOUT_TEXTURES: RunoutTexture[] = ["blank", "over", "pair", "straight", "flush"];
const cardText = (card: number): string => ranks[card >> 2] + suits[card & 3];
// From the acting player's perspective on the immediately previous completed street.
export const LINES: PreviousLine[] = ["aggressor", "defender", "checked"];

export function parseCards(text: unknown, expected: number): number[] {
  if (typeof text !== "string" || text.length !== expected * 2) throw new Error("Invalid card string");
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 2) {
    const rank = ranks.indexOf(text[i]), suit = suits.indexOf(text[i + 1]);
    if (rank < 0 || suit < 0) throw new Error(`Invalid card: ${text.slice(i, i + 2)}`);
    out.push(rank * 4 + suit);
  }
  if (new Set(out).size !== out.length) throw new Error("Duplicate cards");
  return out;
}

// A flop is any three distinct cards. Keep a canonical ID (rank descending, then suit
// descending) so the same combination has one cache key and one deterministic seed no
// matter in what order the picker selected its cards.
export function parseFlopBoard(value: unknown): { id: string; cards: number[]; split?: string } {
  const cards = parseCards(value, 3).sort((a, b) => b - a);
  return { id: cards.map(cardText).join(""), cards };
}

export function boardTexture(board: readonly number[]): BoardShape {
  if (board.length !== 3 || new Set(board).size !== 3) throw new Error("Invalid flop");
  const rs = board.map(card => card >> 2), ss = board.map(card => card & 3);
  if (new Set(rs).size < 3) return "paired";
  if (new Set(ss).size === 1) return "monotone";
  const sorted = [...rs].sort((a, b) => a - b);
  if (new Set(ss).size === 2 || sorted[2] - sorted[0] <= 4) return "wet";
  return "dry";
}

export function boardHeight(board: readonly number[]): BoardHeight {
  const top = Math.max(...board.map(card => card >> 2));
  return top >= 10 ? "high" : top >= 7 ? "mid" : "low";
}

// The flop texture keys a rule may use for this board, most specific first, ending in "any".
export function flopTextureKeys(board: readonly number[]): (FlopTexture | "any")[] {
  const shape = boardTexture(board), height = boardHeight(board);
  return [`${shape}_${height}`, shape, height, "any"];
}

// Only the newly dealt (last) card can trigger a runout feature. Priority is intentional.
export function runoutTexture(board: readonly number[]): RunoutTexture {
  if (!Array.isArray(board) || ![4, 5].includes(board.length) || new Set(board).size !== board.length ||
      board.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) throw new Error("Invalid runout board");
  const card = board.at(-1)!, rank = card >> 2, previous = board.slice(0, -1).map(value => value >> 2);
  if (board.filter(value => (value & 3) === (card & 3)).length >= 3) return "flush";
  if (previous.includes(rank)) return "pair";
  const before = new Set(previous), after = new Set([...previous, rank]);
  if (before.has(12)) before.add(-1);
  if (after.has(12)) after.add(-1); // Wheel ace counts low as well as high.
  for (let low = -1; low <= 8; low++) {
    const window = Array.from({ length: 5 }, (_, i) => low + i);
    if (window.some(value => value === rank || value === -1 && rank === 12) &&
        window.filter(value => after.has(value)).length >= 3 && window.filter(value => before.has(value)).length <= 2) return "straight";
  }
  return rank > Math.max(...previous) ? "over" : "blank";
}

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
