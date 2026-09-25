// Compact, deterministic flop features. Neither policy sees the other player's cards.
import { evaluate } from "../lib/equity.mjs";

const ranks = "23456789TJQKA";
const suits = "cdhs";
export const TIERS = ["monster", "strong", "draw", "medium", "air"];
export const TEXTURES = ["dry", "wet", "monotone", "paired"];

export function parseCards(text, expected) {
  if (typeof text !== "string" || text.length !== expected * 2) throw new Error("Invalid card string");
  const out = [];
  for (let i = 0; i < text.length; i += 2) {
    const rank = ranks.indexOf(text[i]), suit = suits.indexOf(text[i + 1]);
    if (rank < 0 || suit < 0) throw new Error(`Invalid card: ${text.slice(i, i + 2)}`);
    out.push(rank * 4 + suit);
  }
  if (new Set(out).size !== out.length) throw new Error("Duplicate cards");
  return out;
}

export function boardTexture(board) {
  if (board.length !== 3 || new Set(board).size !== 3) throw new Error("Invalid flop");
  const rs = board.map(card => card >> 2), ss = board.map(card => card & 3);
  if (new Set(rs).size < 3) return "paired";
  if (new Set(ss).size === 1) return "monotone";
  const sorted = [...rs].sort((a, b) => a - b);
  if (new Set(ss).size === 2 || sorted[2] - sorted[0] <= 4) return "wet";
  return "dry";
}

function hasDraw(hole, board) {
  if (board.length === 5) return false;
  const all = [...hole, ...board];
  for (let suit = 0; suit < 4; suit++) {
    if (all.filter(card => (card & 3) === suit).length === 4 && hole.some(card => (card & 3) === suit)) return true;
  }
  const ownRanks = new Set(hole.map(card => card >> 2));
  const allRanks = new Set(all.map(card => card >> 2));
  if (allRanks.has(12)) allRanks.add(-1); // Wheel ace.
  for (let low = -1; low <= 8; low++) {
    const window = Array.from({ length: 5 }, (_, i) => low + i);
    if (window.filter(rank => allRanks.has(rank)).length === 4 && window.some(rank => ownRanks.has(rank) || rank === -1 && ownRanks.has(12))) return true;
  }
  return false;
}

export function handTier(hole, board) {
  if (hole.length !== 2 || board.length < 3 || board.length > 5 || new Set([...hole, ...board]).size !== hole.length + board.length) {
    throw new Error("Invalid private hand or board");
  }
  const category = Math.floor(evaluate([...hole, ...board]) / 16 ** 5);
  if (category >= 2) return "monster";
  const boardRanks = board.map(card => card >> 2);
  const holeRanks = hole.map(card => card >> 2);
  if (category === 1) {
    const top = Math.max(...boardRanks);
    if (holeRanks[0] === holeRanks[1] && holeRanks[0] > top || holeRanks.includes(top)) return "strong";
  }
  if (hasDraw(hole, board)) return "draw";
  return category === 1 ? "medium" : "air";
}
