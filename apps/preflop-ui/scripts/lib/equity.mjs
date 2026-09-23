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

// 7-card evaluator returning a comparable score.
export function evaluate(cards) {
  const counts = new Array(13).fill(0);
  const suits = [[], [], [], []];
  for (const card of cards) { counts[rankOf(card)] += 1; suits[suitOf(card)].push(rankOf(card)); }
  const straightHigh = ranks => {
    const has = new Set(ranks);
    for (let high = 12; high >= 4; high -= 1) if ([0, 1, 2, 3, 4].every(i => has.has(high - i))) return high;
    return has.has(12) && [0, 1, 2, 3].every(r => has.has(r)) ? 3 : -1;
  };
  const score = (category, kickers) => {
    let value = category;
    for (let i = 0; i < 5; i += 1) value = value * 16 + (kickers[i] ?? 0);
    return value;
  };
  const flushSuit = suits.find(s => s.length >= 5);
  if (flushSuit) {
    const high = straightHigh(flushSuit);
    if (high >= 0) return score(8, [high]);
  }
  const byCount = [...counts.keys()].filter(r => counts[r]).sort((a, b) => counts[b] - counts[a] || b - a);
  const [top, second] = byCount;
  if (counts[top] === 4) return score(7, [top, byCount.filter(r => r !== top)[0]]);
  if (counts[top] === 3 && counts[second] >= 2) return score(6, [top, second]);
  if (flushSuit) return score(5, flushSuit.sort((a, b) => b - a));
  const straight = straightHigh([...counts.keys()].filter(r => counts[r]));
  if (straight >= 0) return score(4, [straight]);
  const singles = byCount.filter(r => counts[r] === 1);
  if (counts[top] === 3) return score(3, [top, ...singles]);
  if (counts[top] === 2 && counts[second] === 2) return score(2, [top, second, byCount.filter(r => r !== top && r !== second)[0]]);
  if (counts[top] === 2) return score(1, [top, ...singles]);
  return score(0, singles);
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
