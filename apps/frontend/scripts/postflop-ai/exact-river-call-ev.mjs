// Exact sign against the current saved Float64 support. Browser/edge/Node safe.
// Chip bookkeeping stays in Number: only its completed net-pot subtraction and
// call cost are converted to dyadic rationals, without epsilon or decimal rounding.
const bits = new DataView(new ArrayBuffer(8));
const FRACTION = (1n << 52n) - 1n;
export function positiveDyadic(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Finite nonnegative number required');
  if (value === 0) return { n: 0n, e: 0 };
  bits.setFloat64(0, value, false);
  const raw = bits.getBigUint64(0, false), exponent = Number(raw >> 52n & 2047n), fraction = raw & FRACTION;
  return exponent ? { n: (1n << 52n) + fraction, e: exponent - 1023 - 52 } : { n: fraction, e: -1074 };
}
const units = (value, exponent) => value.n << BigInt(value.e - exponent);
const unknown = reason => ({ status: 'unknown', reason });
const validCards = cards => Array.isArray(cards) && cards.every(c => Number.isInteger(c) && c >= 0 && c < 52) && new Set(cards).size === cards.length;
const validRank = rank => Number.isSafeInteger(rank) && rank >= 0;

export function compileRiverCallEv(context, score) {
  if (context?.street !== 'river' || !validCards(context.board) || context.board.length !== 5) return unknown('not-valid-river');
  if (!(context.call > 0) || !Number.isFinite(context.call) || !Number.isFinite(context.finalPot) || !Number.isFinite(context.rake)) return unknown('no-positive-known-call-cost');
  if (!(context.finalPot > 0) || context.rake < 0 || context.rake > context.finalPot) return unknown('invalid-pot-or-rake');
  // This Number result, not exact(finalPot) - exact(rake), is the existing model contract.
  const netPot = context.finalPot - context.rake;
  if (!Number.isFinite(netPot) || !(netPot > 0)) return unknown('invalid-net-pot');
  const range = context.bettorRange;
  if (!range || !range.ids || !range.w || !range.lo || !range.hi || [range.w, range.lo, range.hi].some(a => a.length !== range.ids.length)) return unknown('invalid-range-shape');
  const board = new Set(context.board), rows = [], seen = new Set();
  for (let i = 0; i < range.ids.length; i++) {
    const weight = range.w[i];
    if (!Number.isFinite(weight) || weight < 0) return unknown('invalid-support-weight');
    if (weight === 0) continue;
    const lo = range.lo[i], hi = range.hi[i], id = range.ids[i];
    if (![lo, hi].every(c => Number.isInteger(c) && c >= 0 && c < 52) || lo === hi || id !== Math.min(lo, hi) * 52 + Math.max(lo, hi)) return unknown('invalid-support-combo');
    if (board.has(lo) || board.has(hi)) continue;
    if (seen.has(id)) return unknown('duplicate-positive-support');
    seen.add(id);
    // Validate ranks after hero blockers: incompatible outcomes do not contribute.
    rows.push({ lo, hi, rank: score?.[id], weight: positiveDyadic(weight) });
  }
  if (!rows.length) return unknown('empty-positive-board-compatible-support');
  const weightExponent = Math.min(...rows.map(row => row.weight.e));
  const cost = positiveDyadic(context.call), net = positiveDyadic(netPot), chipExponent = Math.min(cost.e, net.e);
  return { status: 'compiled', board, score, netPot, call: context.call,
    rows: rows.map(({ weight, ...row }) => ({ ...row, units: units(weight, weightExponent) })),
    netUnits: units(net, chipExponent), callUnits: units(cost, chipExponent) };
}

export function exactRiverCallEv(compiled, hero) {
  if (compiled?.status !== 'compiled') return compiled ?? unknown('missing-compiled-context');
  if (!validCards(hero) || hero.length !== 2 || hero.some(c => compiled.board.has(c))) return unknown('invalid-or-blocked-hero');
  const id = Math.min(...hero) * 52 + Math.max(...hero), rank = compiled.score?.[id];
  if (!validRank(rank)) return unknown('invalid-hero-rank');
  let total = 0n, wins = 0n, ties = 0n, count = 0, winCount = 0, tieCount = 0;
  for (const row of compiled.rows) {
    if (hero.includes(row.lo) || hero.includes(row.hi)) continue;
    if (!validRank(row.rank)) return unknown('invalid-compatible-support-rank');
    count++; total += row.units;
    if (rank > row.rank) { wins += row.units; winCount++; }
    else if (rank === row.rank) { ties += row.units; tieCount++; }
  }
  if (!count || total === 0n) return unknown('empty-hero-compatible-support');
  // EV = ((wins + ties/2) / total) * savedNetPot - savedCall.
  // Every factor is an exact integer in shared binary units; only the sign is used.
  const numerator = (2n * wins + ties) * compiled.netUnits - 2n * total * compiled.callUnits;
  return { status: 'known', sign: numerator < 0n ? -1 : numerator > 0n ? 1 : 0,
    compatible_combos: count, win_combos: winCount, tie_combos: tieCount };
}
