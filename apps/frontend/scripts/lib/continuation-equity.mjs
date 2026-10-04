// Exact range-weight conditioning for a Monte Carlo continuation deal.
// Draw every modeled player's hand independently from its saved range, then
// reject the WHOLE tuple if cards overlap. Resampling only the later player
// would bias the earlier player's marginal range in tight multiway histories.
// Observed folded participants constrain cards but never win the pot. Forced
// outside folds have no modeled hand range and remain marginalized out.
import { combosOf } from "./equity.mjs";
import { evaluateContinuation as evaluate } from "./continuation-evaluator.mjs";

export function continuationDrawTables(ranges) {
  return ranges.map(range => {
    let sum = 0;
    return { range, cumulative: range.map(item => (sum += item.weight)), total: sum };
  });
}

// One independent proposal, not a redraw of only the collided player.
export function drawContinuationHoleCards(hero, tables, random) {
  const used = new Set(hero), villains = [];
  for (const table of tables) {
    const target = random() * table.total; let lo = 0, hi = table.range.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (table.cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    const combo = table.range[lo].combo;
    if (used.has(combo[0]) || used.has(combo[1])) return null;
    used.add(combo[0]); used.add(combo[1]); villains.push(combo);
  }
  return { used, villains };
}

export function continuationEquity(hand, liveRanges, deadRanges, samples, random) {
  const ranges = [...liveRanges, ...deadRanges];
  if (!liveRanges.length || ranges.some(range => !range.length)) return null;
  const tables = continuationDrawTables(ranges);
  if (tables.some(table => !(table.total > 0))) return null;
  const mine = combosOf(hand); let share = 0, accepted = 0, attempts = 0;
  while (accepted < samples && attempts < samples * 1000) {
    attempts++;
    const hero = mine[accepted % mine.length], deal = drawContinuationHoleCards(hero, tables, random);
    if (!deal) continue;
    const { used, villains } = deal;
    const board = [];
    while (board.length < 5) { const card = (random() * 52) | 0; if (!used.has(card)) { used.add(card); board.push(card); } }
    const heroScore = evaluate([...hero, ...board]); let best = heroScore, ties = 1;
    for (let i = 0; i < liveRanges.length; i++) {
      const score = evaluate([...villains[i], ...board]);
      if (score > best) { best = score; ties = 1; }
      else if (score === best) ties++;
    }
    if (best === heroScore) share += 1 / ties;
    accepted++;
  }
  if (accepted !== samples) throw new Error(`Joint continuation sampler accepted only ${accepted}/${samples} deals for ${hand}; refuse partial-sample equity`);
  return share / accepted;
}
