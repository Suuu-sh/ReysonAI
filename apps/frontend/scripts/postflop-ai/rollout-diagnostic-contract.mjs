// Pure helpers for the offline research harness. No strategy, model or product imports.
export function uniformDraw(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid uniform draw');
  return value;
}

export function weightedOpponentSampler(items) {
  if (!Array.isArray(items) || !items.length || items.some(item => !Number.isFinite(item.weight) || item.weight <= 0)) {
    throw new Error('Empty or invalid weighted support');
  }
  let total = 0;
  const cumulative = items.map(item => (total += item.weight));
  if (!Number.isFinite(total) || !(total > 0)) throw new Error('Invalid total support');
  return { total, pick(random) {
    const target = uniformDraw(random) * total;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    return items[lo];
  } };
}

export function compatibleOpponentSupport(items, board, hero) {
  const known = [...board, ...hero];
  if (board.length !== 3 || hero.length !== 2 || new Set(known).size !== 5 ||
      known.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) throw new Error('Invalid known cards');
  if (items.some(item => !Array.isArray(item.combo) || item.combo.length !== 2 || new Set(item.combo).size !== 2 ||
      item.combo.some(card => !Number.isInteger(card) || card < 0 || card >= 52) ||
      !Number.isFinite(item.weight) || item.weight <= 0)) throw new Error('Invalid opponent support');
  return items.filter(item => item.combo.every(card => !known.includes(card)));
}

export function compatibleRunout(board, hero, opponent, random) {
  const known = [...board, ...hero, ...opponent];
  if (board.length !== 3 || hero.length !== 2 || opponent.length !== 2 || new Set(known).size !== 7 ||
      known.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) throw new Error('Invalid deal');
  const used = new Set(known), runout = [];
  while (runout.length < 2) {
    const card = Math.floor(uniformDraw(random) * 52);
    if (!used.has(card)) { used.add(card); runout.push(card); }
  }
  return runout;
}

export const newMoments = () => ({ count: 0, mean: 0, m2: 0, minimum: Infinity, maximum: -Infinity, positive: 0 });
export function addMoment(state, value) {
  if (!Number.isFinite(value)) throw new Error('Non-finite payoff');
  state.count++;
  const difference = value - state.mean;
  state.mean += difference / state.count;
  state.m2 += difference * (value - state.mean);
  state.minimum = Math.min(state.minimum, value); state.maximum = Math.max(state.maximum, value);
  if (value > 0) state.positive++;
}
export function completedMoments(state) {
  if (!Number.isSafeInteger(state.count) || state.count < 2) throw new Error('At least two observations required');
  return { ...state, variance: state.m2 / (state.count - 1), se: Math.sqrt(state.m2 / (state.count - 1) / state.count) };
}

export function empiricalBernsteinInterval({ mean, variance, samples, payoffRange, delta }) {
  if (!Number.isFinite(mean) || !Number.isFinite(variance) || variance < 0 ||
      !Number.isSafeInteger(samples) || samples < 2 || !Number.isFinite(payoffRange) || payoffRange <= 0 ||
      !Number.isFinite(delta) || !(delta > 0 && delta < 1)) throw new Error('Invalid empirical-Bernstein inputs');
  const log = Math.log(4 / delta);
  const radius = Math.sqrt(2 * variance * log / samples) + 7 * payoffRange * log / (3 * (samples - 1));
  return { lower: mean - radius, upper: mean + radius, radius, delta, bound_range_bb: payoffRange,
    formula: 'sqrt(2*s2*log(4/delta)/n)+7*range*log(4/delta)/(3*(n-1))',
    source: 'https://www.cs.mcgill.ca/~colt2009/papers/012.pdf',
    independence_assumption: 'Nominal statistical coverage under IID Monte Carlo draws; deterministic seeded PRNG approximation is not a formal random-source guarantee.' };
}


export function postCapRawMix(defence, context, base, equity, hero) {
  const capped = context.cap ? context.cap.applyCombo(base, hero) : base;
  return defence.applyEquity(context, capped, equity, hero, true);
}
