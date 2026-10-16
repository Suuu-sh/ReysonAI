// Independent, deliberately simple oracle: classify exactly five cards with sorted
// multiplicities, then enumerate every five-card subset of a six/seven-card hand.
// No production evaluator, lookup tables, or shared score helpers are imported.
const pack = (category, ranks) => ranks.concat(Array(5).fill(0)).slice(0, 5)
  .reduce((score, rank) => score * 16 + rank, category);

export function fiveCardScore(cards) {
  if (cards.length !== 5) throw new Error("The reference requires exactly five cards");
  const ranks = cards.map(card => Math.floor(card / 4)).sort((a, b) => b - a);
  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(card => card % 4 === cards[0] % 4);
  const unique = [...counts.keys()];
  const straight = unique.length === 5
    ? (ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join(",") === "12,3,2,1,0" ? 3 : -1) : -1;
  if (flush && straight >= 0) return pack(8, [straight]);
  if (groups[0][1] === 4) return pack(7, groups.map(([rank]) => rank));
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, groups.map(([rank]) => rank));
  if (flush) return pack(5, ranks);
  if (straight >= 0) return pack(4, [straight]);
  if (groups[0][1] === 3) return pack(3, groups.map(([rank]) => rank));
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(2, groups.map(([rank]) => rank));
  if (groups[0][1] === 2) return pack(1, groups.map(([rank]) => rank));
  return pack(0, ranks);
}

export function bestFiveScore(cards) {
  let best = -1;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++)
        best = Math.max(best, fiveCardScore([cards[a], cards[b], cards[c], cards[d], cards[e]]));
  return best;
}
