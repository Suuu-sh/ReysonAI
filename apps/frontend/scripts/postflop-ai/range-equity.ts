export type ScoreTable = { score: Int32Array; sortedIds: Int16Array | Int32Array | number[]; sortedScores: Int32Array | number[] };
type CardList = { scores: Int32Array; prefix: Float64Array };
type Bounds = { first: Int16Array; last: Int16Array };
type RangePlan = Bounds & { prefix: Float64Array; offsets: Int16Array; ids: Int16Array; scores: Int32Array; weights: Float64Array; score: Int32Array };
export type WeightedRange = {
 ids: Int16Array; lo: Uint8Array; hi: Uint8Array; w: Float64Array; total: number; queries: number;
 dense: Float64Array | null; byCard: number[][] | null; prefix: Map<ScoreTable, Float64Array> | null;
 cards?: Map<ScoreTable, CardList[]>; plans?: Map<ScoreTable, RangePlan>;
};
// Exact weighted-range queries. Browser-safe; keeps the original addition/subtraction order.
import { equityKernel } from "./equity-kernel.ts";
const NUM_IDS = 52 * 52;
const PREFIX_AFTER = 3;

export function makeRange(dense: ArrayLike<number>): WeightedRange {
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

// Batches only need dense weights, not the per-card JS arrays used by point queries.
function denseOf(range: WeightedRange) {
  if (!range.dense) {
    range.dense = new Float64Array(NUM_IDS);
    range.prefix = new Map();
    for (let i = 0; i < range.ids.length; i++) range.dense![range.ids[i]] = range.w[i];
  }
  return range;
}
export function indexOf(range: WeightedRange) {
  denseOf(range);
  if (!range.byCard) {
    range.byCard = Array.from({ length: 52 }, (): number[] => []);
    for (let i = 0; i < range.ids.length; i++) {
      const id = range.ids[i];
      range.byCard[range.lo[i]].push(id); range.byCard[range.hi[i]].push(id);
    }
  }
  return range;
}
export const weightOf = (range: WeightedRange, id: number) => indexOf(range).dense![id];

function prefixFor(range: WeightedRange, table: ScoreTable) {
  let prefix = range.prefix!.get(table);
  if (!prefix) {
    const { sortedIds } = table, dense = range.dense!;
    prefix = new Float64Array(sortedIds.length + 1);
    let sum = 0;
    for (let i = 0; i < sortedIds.length; i++) { sum += dense[sortedIds[i]]; prefix[i + 1] = sum; }
    range.prefix!.set(table, prefix);
  }
  return prefix;
}

const lowerBound = (values: ArrayLike<number>, target: number) => {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] < target) lo = mid + 1; else hi = mid; }
  return lo;
};
const upperBound = (values: ArrayLike<number>, target: number) => {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] <= target) lo = mid + 1; else hi = mid; }
  return lo;
};

// Equity of the combo `id` against `range` over `tables` (ties half); null when nothing is left.
// Combos of the range that share a card with the hero combo are removed, so blockers count.
export function equityVersus(range: WeightedRange, id: number, tables: readonly ScoreTable[], { wasm = true } = {}) {
  return ++range.queries > PREFIX_AFTER ? equityIndexed(range, id, tables) : equityScan(range, id, tables, wasm);
}

function equityScan(range: WeightedRange, id: number, tables: readonly ScoreTable[], wasm: boolean) {
  const c1 = Math.floor(id / 52), c2 = id % 52, { ids, lo, hi, w } = range;
  const kernel = wasm ? equityKernel() : null;
  if (kernel) {
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
      if (lo[i] === c1 || lo[i] === c2 || hi[i] === c1 || hi[i] === c2) continue;
      kernel.ids[count] = ids[i]; kernel.weights[count++] = w[i];
    }
    kernel.numerator[0] = 0; kernel.denominator[0] = 0;
    for (const { score } of tables) {
      const own = score[id];
      if (own < 0) continue;
      kernel.score.set(score); kernel.scan(count, own);
    }
    return kernel.denominator[0] > 1e-12 ? kernel.numerator[0] / kernel.denominator[0] : null;
  }
  // Card removal is identical on every final board; filter once, in saved combo-id order.
  const compatible = [], weights = [];
  for (let i = 0; i < ids.length; i++) {
    if (lo[i] === c1 || lo[i] === c2 || hi[i] === c1 || hi[i] === c2) continue;
    compatible.push(ids[i]); weights.push(w[i]);
  }
  let numerator = 0, denominator = 0;
  for (const table of tables) {
    const score = table.score, own = score[id];
    if (own < 0) continue;
    let win = 0, tie = 0, total = 0;
    for (let i = 0; i < compatible.length; i++) {
      const other = score[compatible[i]];
      if (other < 0) continue;
      const weight = weights[i];
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
function cardLists(range: WeightedRange, table: ScoreTable) {
  let lists = range.cards?.get(table);
  if (!lists) {
    const scores = Array.from({ length: 52 }, (): number[] => []), weights = Array.from({ length: 52 }, (): number[] => []);
    const dense = range.dense!;
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

function equityIndexedSingle(range: WeightedRange, id: number, table: ScoreTable) {
  indexOf(range);
  const own = table.score[id];
  if (own < 0) return null;
  const prefix = prefixFor(range, table), c1 = (id / 52) | 0, c2 = id % 52;
  const bounds = boundsFor(table), first = bounds.first[id], last = bounds.last[id];
  let total = prefix[prefix.length - 1], win = prefix[first], tie = prefix[last] - prefix[first];
  const lists = cardLists(range, table), self = range.dense![id];
  for (const card of [c1, c2]) {
    const { scores, prefix: sums } = lists[card];
    const lo = lowerBound(scores, own), hi = upperBound(scores, own);
    total -= sums[sums.length - 1]; win -= sums[lo]; tie -= sums[hi] - sums[lo];
  }
  // The hero's own combo holds both cards: it was removed twice.
  if (self > 0) { total += self; tie += self; }
  return total > 1e-12 ? (win + 0.5 * tie) / total : null;
}

const boundsCache = new WeakMap<ScoreTable, Bounds>();
function boundsFor(table: ScoreTable) {
  let bounds = boundsCache.get(table);
  if (bounds) return bounds;
  const first = new Int16Array(NUM_IDS), last = new Int16Array(NUM_IDS);
  const { sortedIds, sortedScores } = table;
  for (let i = 0; i < sortedIds.length;) {
    let j = i + 1;
    while (j < sortedIds.length && sortedScores[j] === sortedScores[i]) j++;
    for (let k = i; k < j; k++) { const id = sortedIds[k]; first[id] = i; last[id] = j; }
    i = j;
  }
  bounds = { first, last };
  boundsCache.set(table, bounds);
  return bounds;
}
function planFor(range: WeightedRange, table: ScoreTable) {
  let plan = range.plans?.get(table);
  if (plan) return plan;
  const prefix = prefixFor(range, table), { first, last } = boundsFor(table);
  const offsets = new Int16Array(53), score = table.score;
  let count = 0;
  for (const id of range.ids) if (score[id] >= 0) { offsets[(id / 52) | 0]++; offsets[id % 52]++; count += 2; }
  let start = 0;
  for (let card = 0; card < 52; card++) { const n = offsets[card]; offsets[card] = start; start += n; }
  offsets[52] = start;
  const at = offsets.slice(), ids = new Int16Array(count), scores = new Int32Array(count), weights = new Float64Array(count);
  for (let i = 0; i < range.ids.length; i++) {
    const id = range.ids[i], s = score[id];
    if (s < 0) continue;
    const a = range.lo[i], b = range.hi[i], w = range.w[i];
    let j = at[a]++; ids[j] = id; scores[j] = s; weights[j] = w;
    j = at[b]++; ids[j] = id; scores[j] = s; weights[j] = w;
  }
  plan = { prefix, first, last, offsets, ids, scores, weights, score };
  (range.plans ??= new Map()).set(table, plan);
  return plan;
}
function equityIndexed(range: WeightedRange, id: number, tables: readonly ScoreTable[]) {
  if (tables.length === 1) return equityIndexedSingle(range, id, tables[0]);
  indexOf(range);
  const c1 = (id / 52) | 0, c2 = id % 52;
  let numerator = 0, denominator = 0;
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t], own = table.score[id];
    if (own < 0) continue;
    const { prefix, first, last, offsets, ids, scores, weights } = planFor(range, table);
    let total = prefix[prefix.length - 1], win = prefix[first[id]], tie = prefix[last[id]] - prefix[first[id]];
    for (let i = offsets[c1], n = offsets[c1 + 1]; i < n; i++) {
      const other = scores[i], weight = weights[i];
      total -= weight;
      if (other < own) win -= weight; else if (other === own) tie -= weight;
    }
    for (let i = offsets[c2], n = offsets[c2 + 1]; i < n; i++) {
      if (ids[i] === id) continue;
      const other = scores[i], weight = weights[i];
      total -= weight;
      if (other < own) win -= weight; else if (other === own) tie -= weight;
    }
    numerator += win + 0.5 * tie;
    denominator += total;
  }
  return denominator > 1e-12 ? numerator / denominator : null;
}
// Scratch buffers are synchronous and worker-local, like the hand evaluator's scratch arrays.
const firstSeen = new Int32Array(52 * 1082), firstWins = new Float64Array(firstSeen.length), firstTies = new Float64Array(firstSeen.length);
const firstTotals = new Float64Array(52);
const riverPositions = new Int16Array(NUM_IDS), riverOffsets = new Int16Array(53), riverAt = new Int16Array(53);
const riverQueries = new Int16Array(NUM_IDS * 2), riverWins = new Float64Array(NUM_IDS * 2), riverTies = new Float64Array(NUM_IDS * 2);
const riverBlockOffsets = new Int16Array(53), riverBlockAt = new Int16Array(52);
const riverBlockScores = new Int32Array(NUM_IDS), riverBlockWeights = new Float64Array(NUM_IDS), riverBlockSums = new Float64Array(NUM_IDS);
let batchGeneration = 0;
export function releaseRangeTables(range: WeightedRange) {
  // Floors/ceilings have saved every reachable equity. Release the dense index too;
  // an uncommon later point/facts query reconstructs it exactly from ids/w.
  range.plans = undefined; range.prefix = null; range.cards = undefined;
  range.dense = null; range.byCard = null;
}

// River: merge rank-sorted hero queries with the two per-card blocker prefix lists.
// Prefix values and the order of the two subtractions are the original single-table path.
function riverEquities(range: WeightedRange, ids: ArrayLike<number>, offset: number, table: ScoreTable, values: (number | null)[]) {
  if (ids.length > NUM_IDS) {
    for (let j = offset; j < ids.length; j++) values[j] = equityVersus(range, ids[j], [table]);
    return values;
  }
  const { score } = table, { first, last } = boundsFor(table);
  const positions = riverPositions.fill(-1), offsets = riverOffsets.fill(0);
  for (let j = offset; j < ids.length; j++) {
    const id = ids[j];
    if (score[id] < 0) continue;
    if (positions[id] >= 0) {
      // Preserve the general API for duplicate queries, not used by the whole-range callers.
      for (let k = offset; k < ids.length; k++) values[k] = equityVersus(range, ids[k], [table]);
      return values;
    }
    positions[id] = j;
    offsets[(id / 52) | 0]++; offsets[id % 52]++;
  }
  let count = 0;
  for (let card = 0; card < 52; card++) { const n = offsets[card]; offsets[card] = count; count += n; }
  offsets[52] = count;
  const at = riverAt, queries = riverQueries;
  at.set(offsets);
  for (const id of table.sortedIds) {
    const j = positions[id];
    if (j < 0) continue;
    queries[at[(id / 52) | 0]++] = j; queries[at[id % 52]++] = j;
  }
  const prefix = prefixFor(range, table), blockOffsets = riverBlockOffsets.fill(0), dense = range.dense!;
  for (const id of table.sortedIds) if (dense[id] > 0) { blockOffsets[(id / 52) | 0]++; blockOffsets[id % 52]++; }
  let start = 0;
  for (let card = 0; card < 52; card++) { const n = blockOffsets[card]; blockOffsets[card] = start; start += n + 1; }
  blockOffsets[52] = start;
  const blockAt = riverBlockAt, blockScores = riverBlockScores, blockWeights = riverBlockWeights, blockSums = riverBlockSums;
  blockAt.set(blockOffsets.subarray(0, 52));
  for (const id of table.sortedIds) {
    const weight = dense[id];
    if (!(weight > 0)) continue;
    const a = (id / 52) | 0, b = id % 52;
    let k = blockAt[a]++; blockScores[k] = score[id]; blockWeights[k] = weight;
    k = blockAt[b]++; blockScores[k] = score[id]; blockWeights[k] = weight;
  }
  const wins = riverWins, ties = riverTies;
  for (let card = 0; card < 52; card++) {
    const begin = blockOffsets[card], blockEnd = blockOffsets[card + 1] - 1;
    blockSums[begin] = 0;
    for (let k = begin; k < blockEnd; k++) blockSums[k + 1] = blockSums[k] + blockWeights[k];
    let lo = begin, hi = begin;
    for (let k = offsets[card], end = offsets[card + 1]; k < end; k++) {
      const j = queries[k], id = ids[j], own = score[id];
      while (lo < blockEnd && blockScores[lo] < own) lo++;
      if (hi < lo) hi = lo;
      while (hi < blockEnd && blockScores[hi] <= own) hi++;
      const slot = 2 * j + (card === ((id / 52) | 0) ? 0 : 1);
      wins[slot] = blockSums[lo]; ties[slot] = blockSums[hi] - blockSums[lo];
    }
  }
  for (let j = offset; j < ids.length; j++) {
    const id = ids[j];
    if (score[id] < 0) { values[j] = null; continue; }
    let total = prefix[prefix.length - 1], win = prefix[first[id]], tie = prefix[last[id]] - prefix[first[id]];
    const c1 = (id / 52) | 0, c2 = id % 52;
    for (let k = 0; k < 2; k++) {
      const card = k === 0 ? c1 : c2;
      total -= blockSums[blockOffsets[card + 1] - 1]; win -= wins[2 * j + k]; tie -= ties[2 * j + k];
    }
    const self = range.dense![id];
    if (self > 0) { total += self; tie += self; }
    values[j] = total > 1e-12 ? (win + 0.5 * tie) / total : null;
  }
  range.queries += ids.length - offset;
  return values;
}

export function equitiesVersus(range: WeightedRange, ids: ArrayLike<number>, tables: readonly ScoreTable[], { wasm = true } = {}) {
  const values = new Array(ids.length);
  let offset = 0;
  while (offset < ids.length && range.queries < PREFIX_AFTER) {
    values[offset] = equityVersus(range, ids[offset], tables, { wasm }); offset++;
  }
  if (offset === ids.length) return values;
  denseOf(range);
  if (tables.length === 1) return riverEquities(range, ids, offset, tables[0], values);
  const kernel = wasm && ids.length - offset <= NUM_IDS && tables.every(table => table.sortedIds.length <= 1081) ? equityKernel() : null;
  if (kernel) {
    const count = ids.length - offset;
    for (let j = 0; j < count; j++) kernel.ids[j] = ids[offset + j];
    kernel.numerator.fill(0, 0, count); kernel.denominator.fill(0, 0, count);
    kernel.dense.set(range.dense!); kernel.bettors.set(range.ids);
    for (const table of tables) {
      const { first, last } = boundsFor(table), score = table.score;
      kernel.score.set(score); kernel.first.set(first); kernel.last.set(last);
      kernel.sorted.set(table.sortedIds);
      kernel.prepare(table.sortedIds.length, range.ids.length);
      kernel.memoSeen.fill(0);
      kernel.accumulate(count);
    }
    range.queries += count;
    for (let j = 0; j < count; j++) values[offset + j] = kernel.denominator[j] > 1e-12 ? kernel.numerator[j] / kernel.denominator[j] : null;
    return values;
  }
  const numerators = new Float64Array(ids.length), denominators = new Float64Array(ids.length);
  const lo = new Uint8Array(ids.length), hi = new Uint8Array(ids.length);
  for (let j = offset; j < ids.length; j++) { lo[j] = (ids[j] / 52) | 0; hi[j] = ids[j] % 52; }
  const seen = firstSeen, firstWin = firstWins, firstTie = firstTies, cardTotal = firstTotals;
  for (let t = 0; t < tables.length; t++) {
    if (++batchGeneration === 2147483647) { firstSeen.fill(0); batchGeneration = 1; }
    const generation = batchGeneration;
    const table = tables[t];
    const { prefix, first, last, offsets, ids: blockers, scores, weights } = planFor(range, table);
    const score = table.score, all = prefix[prefix.length - 1];
    for (let card = 0; card < 52; card++) {
      let total = all;
      for (let i = offsets[card], n = offsets[card + 1]; i < n; i++) total -= weights[i];
      cardTotal[card] = total;
    }
    for (let j = offset; j < ids.length; j++) {
      const id = ids[j], own = score[id];
      if (own < 0) continue;
      const c1 = lo[j], c2 = hi[j];
      const key = first[id] * 52 + c1;
      let total = cardTotal[c1], win, tie;
      if (seen[key] === generation) { win = firstWin[key]; tie = firstTie[key]; }
      else {
        win = prefix[first[id]]; tie = prefix[last[id]] - prefix[first[id]];
        for (let i = offsets[c1], n = offsets[c1 + 1]; i < n; i++) {
          const other = scores[i], weight = weights[i];
          win -= other < own ? weight : 0; tie -= other === own ? weight : 0;
        }
        seen[key] = generation; firstWin[key] = win; firstTie[key] = tie;
      }
      for (let i = offsets[c2], n = offsets[c2 + 1]; i < n; i++) {
        if (blockers[i] === id) continue;
        const other = scores[i], weight = weights[i]; total -= weight;
        win -= other < own ? weight : 0; tie -= other === own ? weight : 0;
      }
      numerators[j] += win + 0.5 * tie; denominators[j] += total;
    }
  }
  range.queries += ids.length - offset;
  for (let j = offset; j < ids.length; j++) values[j] = denominators[j] > 1e-12 ? numerators[j] / denominators[j] : null;
  return values;
}
