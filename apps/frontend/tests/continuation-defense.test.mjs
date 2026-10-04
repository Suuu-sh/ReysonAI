import test from "node:test";
import assert from "node:assert/strict";
import { hands } from "../src/data.ts";
import { sampleJointDefense, validJointDefenseRecord, jointDefenseSaturated, jointDefenseBounds, evaluateJointDefenseHistogram, jointDefenseRepairView, jointDefenseInput,
  JOINT_DEFENSE_VERSION, JOINT_DEFENSE_SEED, JOINT_DEFENSE_DELTA, JOINT_DEFENSE_MAX_SAMPLES, jointDefenseTolerance } from "../src/estimated/continuation-defense.ts";
import { seedFor } from "../scripts/lib/equity.mjs";

function eventFixture() {
  const weights = { UTG: new Map([["AA", 1]]), HJ: new Map([["AA", 0.9], ["KK", 0.1]]), BB: new Map([["22", 1]]) };
  const rows = hands.map(hand => ({ hand, fold: hand === "AA" ? 0 : 100, call: hand === "AA" ? 100 : 0, four_bet: 0, all_in: 0 }));
  const maxCalls = new Map(hands.map(hand => [hand, hand === "AA" ? 100 : hand === "KK" ? 50 : 0]));
  return { id: "joint-unit", risk_bb: 1, pot_before_raise_bb: 3, threshold: 0.25,
    group: [{ node: { id: "unit-response", hero: "HJ", participants: ["UTG", "HJ", "BB"] }, spot: { hands: rows },
      context: { weights, reach: hand => weights.HJ.get(hand) ?? 0 }, capacity: { maxCalls } }] };
}

test("joint defense catches a false marginal pass and pairs capacity on identical deals", () => {
  const event = eventFixture(), { record, histogram } = sampleJointDefense(event, { withHistogram: true });
  // Marginal KK=.1 falsely passes .25. Given UTG's AA, HJ has KK=.4:
  // AA proposals survive only1/6 as often, so .1/(.9/6+.1)=.4.
  assert.ok(Math.abs(record.fold.mean - 0.4) < 0.02);
  assert.ok(record.fold.lower > event.threshold);
  assert.ok(Math.abs(record.capacity.mean - 0.2) < 0.01);
  assert.ok(record.capacity.upper < event.threshold);
  assert.ok(Math.abs(record.fold.mean - 2 * record.capacity.mean) < 1e-12);
  assert.ok(validJointDefenseRecord(record, event));
  assert.equal([...histogram.values()].reduce((sum, item) => sum + item.count, 0), record.samples);
  const repeated = sampleJointDefense(event, { withHistogram: true });
  assert.deepEqual(repeated.record, record);
  const fromHistogram = evaluateJointDefenseHistogram(event, histogram, record.samples);
  assert.ok(Math.abs(fromHistogram.fold.mean - record.fold.mean) < 1e-12);
});

test("multiple responders multiply folds within each legal tuple, not after separate averaging", () => {
  const weights = { UTG: new Map([["22", 1]]), HJ: new Map([["AA", 0.9], ["KK", 0.1]]), CO: new Map([["AA", 0.9], ["KK", 0.1]]) };
  const group = ["HJ", "CO"].map(hero => ({
    node: { id: `joint-${hero}`, hero, participants: ["UTG", "HJ", "CO"] },
    spot: { hands: hands.map(hand => ({ hand, fold: hand === "AA" ? 0 : 100, call: hand === "AA" ? 100 : 0, four_bet: 0, all_in: 0 })) },
    context: { weights, reach: hand => weights[hero].get(hand) ?? 0 },
    capacity: { maxCalls: new Map(hands.map(hand => [hand, hand === "AA" ? 100 : hand === "KK" ? 50 : 0])) },
  }));
  const event = { id: "joint-two-responders", risk_bb: 1, pot_before_raise_bb: 99, threshold: 0.01, group };
  const { record } = sampleJointDefense(event);
  // Both KK survive each other only1/6; normalization is .81/6+.18+.01/6.
  assert.ok(Math.abs(record.fold.mean - 1 / 190) < 0.0015, String(record.fold.mean));
  assert.ok(Math.abs(record.capacity.mean - record.fold.mean / 4) < 1e-12);
  assert.ok(record.fold.upper < 0.01);
  const wrongMarginalProduct = (55 / 190) ** 2;
  assert.ok(Math.abs(record.fold.mean - wrongMarginalProduct) > 0.07);
});

test("confidence intervals straddling a threshold cannot be accepted as a safe pass", () => {
  const bound = jointDefenseBounds(10000, 5000, 20000); // Every observation=.5.
  assert.equal(bound.mean, 0.5);
  assert.ok(bound.lower < 0.5 && bound.upper > 0.5);
  assert.throws(() => jointDefenseBounds(20001, 20001, 20000), /Invalid/);
});

test("a small saturated boundary is resolved by exact legal-tuple enumeration", () => {
  const event = eventFixture(); event.threshold = 0.5;
  for (const hand of ["AA", "KK"]) {
    const row = event.group[0].spot.hands.find(row => row.hand === hand);
    row.call = 50; row.fold = 50; event.group[0].capacity.maxCalls.set(hand, 50);
  }
  const input = jointDefenseInput(event), samples = JOINT_DEFENSE_MAX_SAMPLES;
  // Every possible observation is exactly .5: these moments are analytic,
  // rather than a claim that a test performed1.28m random draws.
  const bound = jointDefenseBounds(samples / 2, samples / 4, samples);
  const cached = { version: JOINT_DEFENSE_VERSION, seed_tag: JOINT_DEFENSE_SEED,
    seed: seedFor(`${JOINT_DEFENSE_SEED}|${JSON.stringify(input)}`), confidence_delta: JOINT_DEFENSE_DELTA,
    input, samples, fold_sum: samples / 2, fold_squares: samples / 4,
    capacity_sum: samples / 2, capacity_squares: samples / 4, fold: bound, capacity: bound };
  assert.ok(validJointDefenseRecord(cached, event));
  const { record } = sampleJointDefense(event, { cached });
  assert.equal(record.method, "exact");
  assert.equal(record.accepted_deals, 252);
  assert.ok(Math.abs(record.normalizing_weight - 54) < 1e-12);
  assert.equal(record.fold.mean, 0.5);
  assert.equal(record.capacity.mean, 0.5);
  assert.equal(record.samples, 0);
  assert.ok(record.fold.upper <= event.threshold + jointDefenseTolerance(record));
  assert.ok(validJointDefenseRecord(record, event));
});

test("exact supported-hand saturation does not depend on whether sampling observed a rare hand", () => {
  const event = eventFixture(), item = event.group[0];
  item.spot.hands.find(row => row.hand === "KK").call = 50;
  item.spot.hands.find(row => row.hand === "KK").fold = 50;
  assert.equal(jointDefenseSaturated(event), true);
  item.context.weights.HJ.set("QJs", 1e-12);
  item.capacity.maxCalls.set("QJs", 50);
  assert.equal(jointDefenseSaturated(event), false);
});

test("repair views cannot mutate predecessor policies while later event inputs are being read", () => {
  const original = eventFixture(), view = jointDefenseRepairView(original);
  const sourceRow = original.group[0].spot.hands.find(row => row.hand === "KK");
  const adjusted = view.group[0].spot.hands.find(row => row.hand === "KK");
  adjusted.call += 5; adjusted.fold -= 5;
  assert.equal(sourceRow.call, 0);
  assert.equal(sourceRow.fold, 100);
  assert.equal(view.group[0].context.spot, view.group[0].spot);
  assert.notEqual(view.group[0].spot, original.group[0].spot);
});

test("joint audit evidence rejects changed source ranges, fold policies, capacity and moments", () => {
  const event = eventFixture(), { record } = sampleJointDefense(event);
  assert.ok(validJointDefenseRecord(record, event));
  assert.equal(sampleJointDefense(event, { cached: record }).record, record);
  const changedPolicy = eventFixture(); changedPolicy.group[0].spot.hands.find(row => row.hand === "KK").fold = 95;
  assert.equal(validJointDefenseRecord(record, changedPolicy), false);
  const changedRange = eventFixture(); changedRange.group[0].context.weights.HJ.set("KK", 0.2);
  assert.equal(validJointDefenseRecord(record, changedRange), false);
  const changedCapacity = eventFixture(); changedCapacity.group[0].capacity.maxCalls.set("KK", 55);
  assert.equal(validJointDefenseRecord(record, changedCapacity), false);
  assert.equal(validJointDefenseRecord({ ...record, fold_sum: record.fold_sum + 1 }, event), false);
  assert.equal(validJointDefenseRecord({ ...record, samples: record.samples + 1 }, event), false);
});
