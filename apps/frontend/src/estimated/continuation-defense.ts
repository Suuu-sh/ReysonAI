// Joint card-conditioned raise-defense audit. Range mixes may still report
// traditional own-reach combo weights, but publication never uses their product
// as a substitute for this complete-deal probability.
import { hands } from "../data.ts";
import { seedFor, seededRandom, weightedRange } from "../../scripts/lib/equity.mjs";
import { continuationDrawTables, drawContinuationHoleCards } from "../../scripts/lib/continuation-equity.mjs";

export const JOINT_DEFENSE_VERSION = 1;
export const JOINT_DEFENSE_SEED = "continuation-joint-defense-v1|exact-input";
export const JOINT_DEFENSE_MIN_SAMPLES = 20000;
export const JOINT_DEFENSE_MAX_SAMPLES = 1280000;
export const JOINT_DEFENSE_DELTA = 1e-9;
export const JOINT_DEFENSE_EXACT_LIMIT = 2000000;
export const jointDefenseTolerance = record => record?.method === "exact" ? 1e-12 : 0;
const rankNames = "23456789TJQKA";
const handName = ([a, b]) => (a >> 2) === (b >> 2) ? rankNames[a >> 2].repeat(2)
  : rankNames[Math.max(a >> 2, b >> 2)] + rankNames[Math.min(a >> 2, b >> 2)] + ((a & 3) === (b & 3) ? "s" : "o");
const handIndices = new Map(hands.map((hand, i) => [hand, i]));

export function jointDefenseInput(event) {
  const first = event.group[0];
  if (!first) throw new Error(`No joint defense responders: ${event.id}`);
  return {
    event_id: event.id, participants: first.node.participants,
    ranges: first.node.participants.map(seat => [...first.context.weights[seat]].filter(([, weight]) => weight > 0)),
    responders: event.group.map(({ node, spot, capacity }) => {
      if (!capacity) throw new Error(`Missing joint-defense call capacity: ${node.id}`);
      return { seat: node.hero, spot_id: node.id, rows: spot.hands.map(row => {
        const maximumFold = (100 - row.four_bet - row.all_in - capacity.maxCalls.get(row.hand)) / 100;
        if (maximumFold > row.fold / 100 + 1e-12) throw new Error(`Saved continuation exceeds computed capacity: ${node.id}/${row.hand}`);
        return [row.hand, row.fold / 100, Math.max(0, maximumFold)];
      }) };
    }),
    risk_bb: event.risk_bb, pot_before_raise_bb: event.pot_before_raise_bb, threshold: event.threshold,
    conditioning: "complete participant tuple at the first response; prior observed folds condition dead cards; future responder fold policies multiplied within each tuple",
  };
}

// Two-sided empirical Bernstein bound for bounded [0,1] observations. Delta
// is deliberately small for the many inspected events/adaptive repair passes.
// This is a Monte Carlo confidence bound, not a solver/equilibrium guarantee.
export function jointDefenseBounds(sum, squares, samples) {
  if (!Number.isInteger(samples) || samples < 2 || !Number.isFinite(sum) || !Number.isFinite(squares) || sum < 0 || sum > samples + 1e-7 || squares < 0 || squares > sum + 1e-7) throw new Error("Invalid joint-defense moments");
  const mean = sum / samples;
  const variance = Math.max(0, (squares - sum * sum / samples) / (samples - 1));
  // Union allocation across both paired estimates and all seven possible
  // adaptive looks keeps the stated per-event confidence budget conservative.
  const looks = 1 + Math.log2(JOINT_DEFENSE_MAX_SAMPLES / JOINT_DEFENSE_MIN_SAMPLES);
  const log = Math.log(4 * looks / JOINT_DEFENSE_DELTA);
  const radius = Math.sqrt(2 * variance * log / samples) + 7 * log / (3 * (samples - 1));
  return { mean, lower: Math.max(0, mean - radius), upper: Math.min(1, mean + radius), radius };
}

export function jointDefenseSaturated(event) {
  return event.group.every(({ spot, context, capacity }) => capacity && spot.hands.every(row =>
    context.reach(row.hand) <= 0 || row.call === capacity.maxCalls.get(row.hand)));
}

// A repair pass may inspect thousands of events lazily. Keep its source data
// immutable until the next topological regeneration, otherwise an early call
// edit changes a later event's range while its equity table still describes
// the old policy. Only the per-event working view may be adjusted in place.
export function jointDefenseRepairView(event) {
  return { ...event, group: event.group.map(item => {
    const spot = { ...item.spot, hands: item.spot.hands.map(row => ({ ...row })) };
    return { ...item, spot, context: { ...item.context, spot } };
  }) };
}

export function validJointDefenseRecord(record, event) {
  if (!record || record.version !== JOINT_DEFENSE_VERSION || record.seed_tag !== JOINT_DEFENSE_SEED) return false;
  const input = jointDefenseInput(event);
  if (JSON.stringify(record.input) !== JSON.stringify(input)) return false;
  if (record.method === "exact") {
    const potential = input.ranges.reduce((product, range) => product * range.reduce((sum, [hand]) => sum + (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12), 0), 1);
    if (record.seed !== null || record.samples !== 0 || record.confidence_delta !== 0 || record.potential_deals !== potential ||
        potential > JOINT_DEFENSE_EXACT_LIMIT || !Number.isInteger(record.accepted_deals) || record.accepted_deals < 1 || record.accepted_deals > potential ||
        !(record.normalizing_weight > 0) || !Number.isFinite(record.normalizing_weight) ||
        ![record.fold_weight, record.capacity_weight].every(value => Number.isFinite(value) && value >= 0 && value <= record.normalizing_weight + 1e-10)) return false;
    return JSON.stringify(record.fold) === JSON.stringify(exactBounds(record.fold_weight / record.normalizing_weight)) &&
      JSON.stringify(record.capacity) === JSON.stringify(exactBounds(record.capacity_weight / record.normalizing_weight));
  }
  if (record.method !== undefined && record.method !== "monte_carlo") return false;
  if (
      record.confidence_delta !== JOINT_DEFENSE_DELTA || !Number.isInteger(record.samples) ||
      record.samples < JOINT_DEFENSE_MIN_SAMPLES || record.samples > JOINT_DEFENSE_MAX_SAMPLES ||
      !Number.isInteger(Math.log2(record.samples / JOINT_DEFENSE_MIN_SAMPLES))) return false;
  if (record.seed !== seedFor(`${JOINT_DEFENSE_SEED}|${JSON.stringify(input)}`)) return false;
  try {
    return JSON.stringify(record.fold) === JSON.stringify(jointDefenseBounds(record.fold_sum, record.fold_squares, record.samples)) &&
      JSON.stringify(record.capacity) === JSON.stringify(jointDefenseBounds(record.capacity_sum, record.capacity_squares, record.samples));
  } catch { return false; }
}

const exactBounds = value => ({ mean: value, lower: value, upper: value, radius: 0 });
function exactJointDefense(event, input) {
  const potential = input.ranges.reduce((product, range) => product * range.reduce((sum, [hand]) => sum + (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12), 0), 1);
  if (potential > JOINT_DEFENSE_EXACT_LIMIT) return null;
  const tables = input.ranges.map((range, index) => ({ index,
    values: weightedRange(range.map(([hand, weight]) => ({ hand, weight }))).map(item => ({ ...item, hand: handName(item.combo) })) }))
    .sort((a, b) => a.values.length - b.values.length);
  const tuple = [], used = new Set(); let accepted = 0;
  // Compensated sums keep the exact finite-deal calculation stable even when
  // deep source-action products make some tuple weights very small.
  const sums = [0, 0, 0], compensation = [0, 0, 0];
  const add = (index, value) => { const y = value - compensation[index], next = sums[index] + y; compensation[index] = (next - sums[index]) - y; sums[index] = next; };
  function visit(depth, weight) {
    if (depth === tables.length) {
      accepted++; add(0, weight);
      add(1, weight * productFor(tuple, input.responders, input.participants, 1));
      add(2, weight * productFor(tuple, input.responders, input.participants, 2));
      return;
    }
    const table = tables[depth];
    for (const item of table.values) {
      const [a, b] = item.combo;
      if (used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b); tuple[table.index] = item.hand;
      visit(depth + 1, weight * item.weight);
      used.delete(a); used.delete(b);
    }
  }
  visit(0, 1);
  if (!accepted || !(sums[0] > 0)) throw new Error(`No exact joint support: ${event.id}`);
  return { version: JOINT_DEFENSE_VERSION, method: "exact", seed_tag: JOINT_DEFENSE_SEED, seed: null,
    confidence_delta: 0, samples: 0, potential_deals: potential, accepted_deals: accepted,
    input, normalizing_weight: sums[0], fold_weight: sums[1], capacity_weight: sums[2],
    fold: exactBounds(sums[1] / sums[0]), capacity: exactBounds(sums[2] / sums[0]) };
}

function resolveSaturatedBoundary(event, record) {
  if (record.method === "exact" || record.samples < JOINT_DEFENSE_MAX_SAMPLES ||
      record.fold.upper <= event.threshold || record.fold.lower > event.threshold || !jointDefenseSaturated(event)) return record;
  return exactJointDefense(event, record.input) ?? record;
}

function productFor(tuple, responders, participants, column) {
  let product = 1;
  for (const responder of responders) {
    const hand = tuple[participants.indexOf(responder.seat)];
    product *= responder.rows[handIndices.get(hand)][column];
  }
  return product;
}

export function evaluateJointDefenseHistogram(event, histogram, samples) {
  const input = jointDefenseInput(event); let foldSum = 0, foldSquares = 0, capacitySum = 0, capacitySquares = 0;
  for (const { tuple, count } of histogram.values()) {
    const fold = productFor(tuple, input.responders, input.participants, 1), capacity = productFor(tuple, input.responders, input.participants, 2);
    foldSum += count * fold; foldSquares += count * fold * fold;
    capacitySum += count * capacity; capacitySquares += count * capacity * capacity;
  }
  return { fold: jointDefenseBounds(foldSum, foldSquares, samples), capacity: jointDefenseBounds(capacitySum, capacitySquares, samples) };
}

export function sampleJointDefense(event, { cached, withHistogram = false } = {}) {
  if (validJointDefenseRecord(cached, event) && (!withHistogram || cached.method === "exact")) return { record: resolveSaturatedBoundary(event, cached), histogram: null };
  const input = jointDefenseInput(event), seed = seedFor(`${JOINT_DEFENSE_SEED}|${JSON.stringify(input)}`), random = seededRandom(seed);
  const tables = continuationDrawTables(input.ranges.map(range => weightedRange(range.map(([hand, weight]) => ({ hand, weight })))));
  if (tables.some(table => !table.range.length || table.total <= 0)) throw new Error(`Empty joint defense range ${event.id}`);
  const histogram = new Map(); let samples = 0, attempts = 0, foldSum = 0, foldSquares = 0, capacitySum = 0, capacitySquares = 0;
  let target = withHistogram && validJointDefenseRecord(cached, event) ? cached.samples : JOINT_DEFENSE_MIN_SAMPLES;
  let fold, capacity;
  while (true) {
    while (samples < target) {
      attempts++;
      if (attempts > JOINT_DEFENSE_MAX_SAMPLES * 1000) throw new Error(`Joint defense could not fill its accepted sample count: ${event.id}`);
      const deal = drawContinuationHoleCards([], tables, random);
      if (!deal) continue;
      const tuple = deal.villains.map(handName), f = productFor(tuple, input.responders, input.participants, 1), c = productFor(tuple, input.responders, input.participants, 2);
      samples++; foldSum += f; foldSquares += f * f; capacitySum += c; capacitySquares += c * c;
      if (withHistogram) {
        const key = tuple.reduce((value, hand) => value * 169 + handIndices.get(hand), 0);
        const item = histogram.get(key);
        if (item) item.count++; else histogram.set(key, { tuple, count: 1 });
      }
    }
    fold = jointDefenseBounds(foldSum, foldSquares, samples); capacity = jointDefenseBounds(capacitySum, capacitySquares, samples);
    if (fold.upper <= event.threshold || fold.lower > event.threshold || target >= JOINT_DEFENSE_MAX_SAMPLES) break;
    target *= 2;
  }
  const record = resolveSaturatedBoundary(event, { version: JOINT_DEFENSE_VERSION, method: "monte_carlo", seed_tag: JOINT_DEFENSE_SEED, seed, confidence_delta: JOINT_DEFENSE_DELTA,
    samples, attempts, input, fold_sum: foldSum, fold_squares: foldSquares, capacity_sum: capacitySum, capacity_squares: capacitySquares, fold, capacity },
  );
  return { record, histogram: withHistogram ? histogram : null };
}
