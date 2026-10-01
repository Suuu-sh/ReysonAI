// Frozen W1 reference from defence.mjs before optimisation (test-only).
const NUM_IDS = 52 * 52;
const PREFIX_AFTER = 3;

export function makeRange(dense) {
  let count = 0;
  for (let id = 0; id < NUM_IDS; id++) if (dense[id] > 0) count++;
  const ids = new Int16Array(count), lo = new Uint8Array(count), hi = new Uint8Array(count), w = new Float64Array(count);
  let total = 0, index = 0;
  for (let id = 0; id < NUM_IDS; id++) {
    const weight = dense[id];
    if (!(weight > 0)) continue;
    ids[index] = id; lo[index] = Math.floor(id / 52); hi[index] = id % 52; w[index++] = weight;
    total += weight;
  }
  return { ids, lo, hi, w, total, queries: 0, dense: null, byCard: null, prefix: null };
}

// Dense weights by combo id and the per-card lists of the indexed mode.
function indexOf(range) {
  if (!range.byCard) {
    range.dense = new Float64Array(NUM_IDS);
    range.byCard = Array.from({ length: 52 }, () => []);
    range.prefix = new Map();
    for (let i = 0; i < range.ids.length; i++) {
      const id = range.ids[i];
      range.dense[id] = range.w[i];
      range.byCard[range.lo[i]].push(id); range.byCard[range.hi[i]].push(id);
    }
  }
  return range;
}
const weightOf = (range, id) => indexOf(range).dense[id];

function prefixFor(range, table) {
  let prefix = range.prefix.get(table);
  if (!prefix) {
    const { sortedIds } = table, dense = range.dense;
    prefix = new Float64Array(sortedIds.length + 1);
    let sum = 0;
    for (let i = 0; i < sortedIds.length; i++) { sum += dense[sortedIds[i]]; prefix[i + 1] = sum; }
    range.prefix.set(table, prefix);
  }
  return prefix;
}

const lowerBound = (values, target) => {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] < target) lo = mid + 1; else hi = mid; }
  return lo;
};
const upperBound = (values, target) => {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] <= target) lo = mid + 1; else hi = mid; }
  return lo;
};

// Equity of the combo `id` against `range` over `tables` (ties half); null when nothing is left.
// Combos of the range that share a card with the hero combo are removed, so blockers count.
export function equityVersus(range, id, tables) {
  return ++range.queries > PREFIX_AFTER ? equityIndexed(range, id, tables) : equityScan(range, id, tables);
}

function equityScan(range, id, tables) {
  const c1 = Math.floor(id / 52), c2 = id % 52, { ids, lo, hi, w } = range, n = ids.length;
  let numerator = 0, denominator = 0;
  for (const table of tables) {
    const score = table.score, own = score[id];
    if (own < 0) continue;
    let win = 0, tie = 0, total = 0;
    for (let i = 0; i < n; i++) {
      const other = score[ids[i]];
      if (other < 0) continue;
      const x = lo[i], y = hi[i];
      if (x === c1 || x === c2 || y === c1 || y === c2) continue;
      const weight = w[i];
      total += weight;
      if (other < own) win += weight; else if (other === own) tie += weight;
    }
    numerator += win + 0.5 * tie;
    denominator += total;
  }
  return denominator > 1e-12 ? numerator / denominator : null;
}

// Per-card sorted score lists with prefix sums of one range on one table (river contexts): the blockers of
// a hero combo are then two binary searches instead of a loop over every range combo holding its cards.
function cardLists(range, table) {
  let lists = range.cards?.get(table);
  if (!lists) {
    const scores = Array.from({ length: 52 }, () => []), weights = Array.from({ length: 52 }, () => []);
    const dense = range.dense;
    for (const id of table.sortedIds) {
      const weight = dense[id];
      if (!(weight > 0)) continue;
      const a = (id / 52) | 0, b = id - a * 52, score = table.score[id];
      scores[a].push(score); weights[a].push(weight); scores[b].push(score); weights[b].push(weight);
    }
    lists = scores.map((list, card) => {
      const prefix = new Float64Array(list.length + 1);
      for (let i = 0; i < list.length; i++) prefix[i + 1] = prefix[i] + weights[card][i];
      return { scores: Int32Array.from(list), prefix };
    });
    (range.cards ??= new Map()).set(table, lists);
  }
  return lists;
}

function equityIndexedSingle(range, id, table) {
  indexOf(range);
  const own = table.score[id];
  if (own < 0) return null;
  const prefix = prefixFor(range, table), c1 = (id / 52) | 0, c2 = id % 52;
  const first = lowerBound(table.sortedScores, own), last = upperBound(table.sortedScores, own);
  let total = prefix[prefix.length - 1], win = prefix[first], tie = prefix[last] - prefix[first];
  const lists = cardLists(range, table), self = range.dense[id];
  for (const card of [c1, c2]) {
    const { scores, prefix: sums } = lists[card];
    const lo = lowerBound(scores, own), hi = upperBound(scores, own);
    total -= sums[sums.length - 1]; win -= sums[lo]; tie -= sums[hi] - sums[lo];
  }
  // The hero's own combo holds both cards: it was removed twice.
  if (self > 0) { total += self; tie += self; }
  return total > 1e-12 ? (win + 0.5 * tie) / total : null;
}

function equityIndexed(range, id, tables) {
  if (tables.length === 1) return equityIndexedSingle(range, id, tables[0]);
  indexOf(range);
  const c1 = Math.floor(id / 52), c2 = id % 52, dense = range.dense;
  let numerator = 0, denominator = 0;
  for (const table of tables) {
    const own = table.score[id];
    if (own < 0) continue;
    const prefix = prefixFor(range, table);
    const first = lowerBound(table.sortedScores, own), last = upperBound(table.sortedScores, own);
    let total = prefix[prefix.length - 1], win = prefix[first], tie = prefix[last] - prefix[first];
    for (const blocker of range.byCard[c1]) {
      const other = table.score[blocker];
      if (other < 0) continue;
      const weight = dense[blocker];
      total -= weight;
      if (other < own) win -= weight; else if (other === own) tie -= weight;
    }
    for (const blocker of range.byCard[c2]) {
      if (Math.floor(blocker / 52) === c1 || blocker % 52 === c1) continue; // already removed above
      const other = table.score[blocker];
      if (other < 0) continue;
      const weight = dense[blocker];
      total -= weight;
      if (other < own) win -= weight; else if (other === own) tie -= weight;
    }
    numerator += win + 0.5 * tie;
    denominator += total;
  }
  return denominator > 1e-12 ? numerator / denominator : null;
}

