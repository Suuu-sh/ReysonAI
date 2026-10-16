// Frozen, allocation-heavy W1 reference (test-only).
import { evaluate } from "../../scripts/lib/equity.ts";
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

// `score` may carry an already computed evaluate([...hole, ...board]) (the defence tables rank
// every combo once per board and reuse that value).
export function handTier(hole, board, score = null) {
  if (hole.length !== 2 || board.length < 3 || board.length > 5 || new Set([...hole, ...board]).size !== hole.length + board.length) {
    throw new Error("Invalid private hand or board");
  }
  const category = Math.floor((score ?? evaluate([...hole, ...board])) / 16 ** 5);
  if (category > 3) return "monster";
  const boardRanks = board.map(card => card >> 2);
  const holeRanks = hole.map(card => card >> 2);
  const top = Math.max(...boardRanks);
  const count = rank => [...holeRanks, ...boardRanks].filter(r => r === rank).length;
  const made = category === 0 ? [] : [...new Set(holeRanks)].filter(rank => count(rank) >= 2);
  if (made.some(rank => count(rank) >= 3) || made.length >= 2) return "monster";
  if (made.length === 1 && (holeRanks[0] === holeRanks[1] && holeRanks[0] > top || made[0] === top)) return "strong";
  if (hasDraw(hole, board)) return "draw";
  return made.length === 1 ? "medium" : "air";
}
