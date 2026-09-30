// Monte Carlo hand-vs-range equity with a seeded RNG so generated data is reproducible.
const RANKS = "23456789TJQKA";
const deck = Array.from({ length: 52 }, (_, card) => card);
const rankOf = card => card >> 2;
const suitOf = card => card & 3;

export const comboCount = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFor(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function combosOf(hand) {
  const a = RANKS.indexOf(hand[0]);
  const b = RANKS.indexOf(hand[1]);
  const out = [];
  for (let s = 0; s < 4; s += 1) for (let t = 0; t < 4; t += 1) {
    if (hand.length === 2 ? s < t : hand[2] === "s" ? s === t : s !== t) out.push([a * 4 + s, b * 4 + t]);
  }
  return out;
}

// 5-7 card evaluator returning a comparable score. Allocation free (it ranks every combo of a board
// in the computed defence); tests/equity-evaluate.test.mjs pins it to the original
// array-based implementation, including its kicker quirks, on random hands.
const counts = new Int8Array(13);
const suitCount = new Int8Array(4);
const suitMask = new Int16Array(4);
const byCount = new Int8Array(13);

// High card of the best straight in a 13-bit rank mask (the wheel counts as 3), or -1.
function straightHighOf(mask) {
  for (let high = 12; high >= 4; high -= 1) if (((mask >> (high - 4)) & 31) === 31) return high;
  return (mask & 0x100F) === 0x100F ? 3 : -1;
}

const packed = (category, k0, k1, k2, k3, k4) => ((((category * 16 + k0) * 16 + k1) * 16 + k2) * 16 + k3) * 16 + k4;

export function evaluate(cards) {
  counts.fill(0); suitCount.fill(0); suitMask.fill(0);
  let mask = 0;
  for (let i = 0; i < cards.length; i += 1) {
    const rank = cards[i] >> 2, suit = cards[i] & 3;
    counts[rank] += 1; suitCount[suit] += 1; suitMask[suit] |= 1 << rank; mask |= 1 << rank;
  }
  let flush = -1;
  for (let suit = 0; suit < 4; suit += 1) if (suitCount[suit] >= 5) { flush = suit; break; }
  if (flush >= 0) {
    const high = straightHighOf(suitMask[flush]);
    if (high >= 0) return packed(8, high, 0, 0, 0, 0);
  }
  // Ranks by count (descending), then rank (descending).
  let n = 0;
  for (let c = 4; c >= 1; c -= 1) for (let rank = 12; rank >= 0; rank -= 1) if (counts[rank] === c) byCount[n++] = rank;
  const top = byCount[0], second = n > 1 ? byCount[1] : -1;
  if (counts[top] === 4) return packed(7, top, n > 1 ? second : 0, 0, 0, 0);
  if (counts[top] === 3 && counts[second] >= 2) return packed(6, top, second, 0, 0, 0);
  if (flush >= 0) {
    const kickers = [0, 0, 0, 0, 0];
    let k = 0;
    for (let rank = 12; rank >= 0 && k < 5; rank -= 1) if (suitMask[flush] & (1 << rank)) kickers[k++] = rank;
    return packed(5, kickers[0], kickers[1], kickers[2], kickers[3], kickers[4]);
  }
  const straight = straightHighOf(mask);
  if (straight >= 0) return packed(4, straight, 0, 0, 0, 0);
  // Singles in descending rank order (they follow the multiples in byCount).
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, singles = 0;
  for (let rank = 12; rank >= 0; rank -= 1) if (counts[rank] === 1) {
    if (singles === 0) s0 = rank; else if (singles === 1) s1 = rank; else if (singles === 2) s2 = rank; else if (singles === 3) s3 = rank; else if (singles === 4) s4 = rank;
    singles += 1;
  }
  if (counts[top] === 3) return packed(3, top, s0, s1, s2, s3);
  if (counts[top] === 2 && counts[second] === 2) return packed(2, top, second, n > 2 ? byCount[2] : 0, 0, 0);
  if (counts[top] === 2) return packed(1, top, s0, s1, s2, s3);
  return packed(0, s0, s1, s2, s3, s4);
}

// rows: [{hand, weight}] with weight in 0..1 per hand class.
export function weightedRange(rows) {
  return rows.flatMap(({ hand, weight }) => weight > 0 ? combosOf(hand).map(combo => ({ combo, weight })) : []);
}

export function equityVsRange(hand, range, samples, random) {
  if (!range.length) return null;
  const mine = combosOf(hand);
  const cumulative = [];
  let sum = 0;
  for (const item of range) { sum += item.weight; cumulative.push(sum); }
  let wins = 0;
  let total = 0;
  for (let i = 0; i < samples; i += 1) {
    const [a, b] = mine[i % mine.length];
    let villain;
    for (let tries = 0; tries < 50; tries += 1) {
      const x = random() * sum;
      let lo = 0, hi = cumulative.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < x) lo = mid + 1; else hi = mid; }
      const combo = range[lo].combo;
      if (!combo.includes(a) && !combo.includes(b)) { villain = combo; break; }
    }
    if (!villain) continue;
    const used = new Set([a, b, ...villain]);
    const board = [];
    while (board.length < 5) { const card = deck[(random() * 52) | 0]; if (!used.has(card)) { used.add(card); board.push(card); } }
    const heroScore = evaluate([a, b, ...board]);
    const villainScore = evaluate([...villain, ...board]);
    wins += heroScore > villainScore ? 1 : heroScore === villainScore ? 0.5 : 0;
    total += 1;
  }
  return total ? wins / total : null;
}

// Share of the range's weight removed by holding this hand (averaged over its combos).
export function blockedShare(hand, range) {
  const all = range.reduce((acc, item) => acc + item.weight, 0);
  if (!all) return 0;
  const mine = combosOf(hand);
  const kept = mine.reduce((acc, [a, b]) => acc + range.reduce((s, item) => s + (item.combo.includes(a) || item.combo.includes(b) ? 0 : item.weight), 0), 0) / mine.length;
  return 1 - kept / all;
}

// Hero's share of the pot against several opponents, each drawn from its own weighted range.
export function equityVsRanges(hand, ranges, samples, random) {
  if (ranges.some(range => !range.length)) return null;
  const tables = ranges.map(range => {
    const cumulative = [];
    let sum = 0;
    for (const item of range) { sum += item.weight; cumulative.push(sum); }
    return { range, cumulative, sum };
  });
  const draw = ({ range, cumulative, sum }) => {
    const x = random() * sum;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < x) lo = mid + 1; else hi = mid; }
    return range[lo].combo;
  };
  const mine = combosOf(hand);
  let share = 0, total = 0;
  for (let i = 0; i < samples; i += 1) {
    const [a, b] = mine[i % mine.length];
    const used = new Set([a, b]);
    const villains = [];
    for (const table of tables) {
      let combo;
      for (let tries = 0; tries < 50 && !combo; tries += 1) {
        const candidate = draw(table);
        if (!used.has(candidate[0]) && !used.has(candidate[1])) combo = candidate;
      }
      if (!combo) break;
      used.add(combo[0]); used.add(combo[1]);
      villains.push(combo);
    }
    if (villains.length !== tables.length) continue;
    const board = [];
    while (board.length < 5) { const card = deck[(random() * 52) | 0]; if (!used.has(card)) { used.add(card); board.push(card); } }
    const scores = [evaluate([a, b, ...board]), ...villains.map(v => evaluate([...v, ...board]))];
    const best = Math.max(...scores);
    if (scores[0] === best) share += 1 / scores.filter(score => score === best).length;
    total += 1;
  }
  return total ? share / total : null;
}
