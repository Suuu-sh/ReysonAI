// Best-five ranking for 5–7 cards, isolated from the historical evaluator so
// repairing new continuation equities never silently regenerates old ranges.
// Cards use the existing rank*4+suit encoding; rank 0=2, rank12=A.
const counts = new Int8Array(13), suitCounts = new Int8Array(4), suitMasks = new Int16Array(4);
const straightHighs = new Int8Array(8192).fill(-1);
for (let mask = 0; mask < straightHighs.length; mask++) {
  for (let high = 12; high >= 4; high--) if (((mask >> (high - 4)) & 31) === 31) { straightHighs[mask] = high; break; }
  if (straightHighs[mask] < 0 && (mask & 0x100F) === 0x100F) straightHighs[mask] = 3;
}
const packed = (category, a = 0, b = 0, c = 0, d = 0, e = 0) => ((((category * 16 + a) * 16 + b) * 16 + c) * 16 + d) * 16 + e;
const topRanks = new Int8Array(5);
function top(mask, exclude1 = -1, exclude2 = -1) {
  topRanks.fill(0); let n = 0;
  for (let rank = 12; rank >= 0 && n < 5; rank--) if (mask & (1 << rank) && rank !== exclude1 && rank !== exclude2) topRanks[n++] = rank;
}

export function evaluateContinuation(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error("Continuation evaluator requires 5–7 cards");
  counts.fill(0); suitCounts.fill(0); suitMasks.fill(0);
  let mask = 0, lowSeen = 0, highSeen = 0;
  for (const card of cards) {
    if (!Number.isInteger(card) || card < 0 || card > 51) throw new Error("Invalid continuation card");
    const bit = 1 << (card & 31);
    if (card < 32) { if (lowSeen & bit) throw new Error("Duplicate continuation card"); lowSeen |= bit; }
    else { if (highSeen & bit) throw new Error("Duplicate continuation card"); highSeen |= bit; }
    const rank = card >> 2, suit = card & 3;
    counts[rank]++; suitCounts[suit]++; suitMasks[suit] |= 1 << rank; mask |= 1 << rank;
  }
  let flush = -1;
  for (let suit = 0; suit < 4; suit++) if (suitCounts[suit] >= 5) { flush = suit; break; }
  if (flush >= 0 && straightHighs[suitMasks[flush]] >= 0) return packed(8, straightHighs[suitMasks[flush]]);
  let quad = -1, trip = -1, pair = -1, secondPair = -1;
  for (let rank = 12; rank >= 0; rank--) {
    if (counts[rank] === 4) quad = rank;
    if (counts[rank] >= 3 && trip < 0) trip = rank;
    if (counts[rank] >= 2) { if (pair < 0) pair = rank; else if (secondPair < 0) secondPair = rank; }
  }
  if (quad >= 0) {
    let kicker = 12; while (kicker === quad || !counts[kicker]) kicker--;
    return packed(7, quad, kicker);
  }
  if (trip >= 0) {
    let fullPair = 12; while (fullPair >= 0 && (fullPair === trip || counts[fullPair] < 2)) fullPair--;
    if (fullPair >= 0) return packed(6, trip, fullPair);
  }
  if (flush >= 0) { top(suitMasks[flush]); return packed(5, topRanks[0], topRanks[1], topRanks[2], topRanks[3], topRanks[4]); }
  if (straightHighs[mask] >= 0) return packed(4, straightHighs[mask]);
  if (trip >= 0) { top(mask, trip); return packed(3, trip, topRanks[0], topRanks[1]); }
  if (secondPair >= 0) { top(mask, pair, secondPair); return packed(2, pair, secondPair, topRanks[0]); }
  if (pair >= 0) { top(mask, pair); return packed(1, pair, topRanks[0], topRanks[1], topRanks[2]); }
  top(mask); return packed(0, topRanks[0], topRanks[1], topRanks[2], topRanks[3], topRanks[4]);
}
