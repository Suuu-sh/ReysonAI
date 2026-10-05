import test from "node:test";
import assert from "node:assert/strict";
import { makeRange, equityVersus, equitiesVersus, releaseRangeTables } from "../scripts/postflop-ai/range-equity.ts";
import { makeRange as referenceRange, equityVersus as referenceEquity } from "./reference/range-equity.mjs";
import { rankTable, comboId, defenceFor, replayOrNull } from "../scripts/postflop-ai/defence.ts";
import { equityKernel } from "../scripts/postflop-ai/equity-kernel.ts";
import { handTier, parseCards, parseFlopBoard } from "../scripts/postflop-ai/model.ts";
import { handTier as referenceTier } from "./reference/hand-tier.mjs";
import { seededRandom } from "../scripts/lib/equity.ts";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { simulate } from "../scripts/postflop-ai/simulation.mjs";
import { simulateParallel } from "../scripts/postflop-ai/simulation-parallel.mjs";
import { boardWorkOrder, computeBoardBatch } from "../scripts/postflop-ai/board-batch.mjs";
import { handEvForBoard } from "../scripts/postflop-ai/flop-hand-ev-core.mjs";
import { packEquities, packWeights, unpackWeights } from "../scripts/postflop-ai/cached-values.ts";

test("packed caches preserve exact values, missing/null states, updates and sparse reach weights", () => {
  const map = new Map(Array.from({ length: 500 }, (_, i) => [i, i / 777]));
  for (const [id, value] of [[0, -0], [1, null], [2, undefined], [3, NaN], [4, Infinity]]) map.set(id, value);
  const cache = packEquities(map);
  assert.notEqual(cache, map);
  for (let id = 0; id < 600; id++) { assert.equal(cache.has(id), map.has(id)); assert.equal(cache.get(id), map.get(id)); }
  for (const [id, value] of [[0, null], [1, -0], [501, NaN], [501, undefined], ["1", 42], [-1, 4]]) {
    assert.equal(cache.set(id, value), cache);
    map.set(id, value);
    assert.equal(cache.size, map.size);
    assert.equal(cache.get(id), map.get(id));
    assert.equal(cache.has(id), map.has(id));
  }
  const dense = new Float64Array(52 * 52);
  for (const [id, value] of [[0, -0], [23, 0.01234567890123], [88, NaN], [112, Infinity], [2200, -2]]) dense[id] = value;
  assert.deepEqual(unpackWeights(packWeights(dense)), dense);
  assert.equal(unpackWeights(dense), dense);
});

test("batched and point range equity match the frozen reference bit-for-bit, including blockers and query transitions", () => {
  assert.equal(typeof equityKernel()?.prepare, "function", "exercise the real native path, not a silent fallback");
  const random = seededRandom(20261001), ids = [];
  const dense = new Float64Array(52 * 52);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    const id = comboId(a, b);
    ids.push(id);
    if (random() < 0.55) dense[id] = random();
  }
  // Repeat a table: sampled flop runouts may contain the same final board more than once.
  const tables = ["As7d2c3s5s", "As7d2cKhTh", "As7d2c3s5s", "KhTh4s2c9s"]
    .map(board => rankTable(parseCards(board, 5)));
  for (const weights of [dense, new Float64Array(dense.length), Float64Array.from(dense, value => value > 0.9 ? value : 0)]) {
    for (const finalTables of [tables, [tables[0]]]) {
      const ref = referenceRange(weights), point = makeRange(weights), batch = makeRange(weights);
      for (const id of ids.slice(0, 2)) {
        const expected = referenceEquity(ref, id, finalTables);
        assert.equal(equityVersus(point, id, finalTables), expected);
        assert.equal(equityVersus(batch, id, finalTables), expected);
      }
      const requested = ids.slice(2).reverse();
      const expected = requested.map(id => referenceEquity(ref, id, finalTables));
      assert.deepEqual(requested.map(id => equityVersus(point, id, finalTables)), expected);
      assert.deepEqual(equitiesVersus(batch, requested, finalTables), expected);
      const js = makeRange(weights);
      // Exercise the CSP/no-WebAssembly fallback with the same reference query sequence.
      const jsRef = referenceRange(weights);
      assert.deepEqual(equitiesVersus(js, ids, finalTables, { wasm: false }), ids.map(id => referenceEquity(jsRef, id, finalTables)));
      releaseRangeTables(batch);
      assert.equal(batch.dense, null);
      assert.equal(batch.byCard, null);
      for (const id of ids.slice(0, 10)) assert.equal(equityVersus(batch, id, finalTables), referenceEquity(ref, id, finalTables));
    }
  }
  // Non-contiguous first-card groups exercise native memo generations; repeated queries
  // exercise the river fallback, and alternating batch sizes expose stale scratch values.
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const requested of [shuffled, ids.slice(0, 20), [...shuffled.slice(0, 40), ...shuffled.slice(0, 10)]]) {
    for (const finalTables of [tables, [tables[0]]]) {
      const ref = referenceRange(dense);
      assert.deepEqual(equitiesVersus(makeRange(dense), requested, finalTables), requested.map(id => referenceEquity(ref, id, finalTables)));
    }
  }
});

test("large runs cache counterfactual continuation hands without retaining point prefix tables", () => {
  const inputs = loadInputs("BTN_open_BB_call"), policy = referencePolicyFor(inputs.spot.tree), later = referenceLaterPolicy();
  const reference = defenceFor(inputs, policy, later), fast = defenceFor({ ...inputs }, policy, later);
  fast.largeRun = true;
  const board = parseCards("As7d2c3s", 4), path = { flop: ["bet75", "call"], turn: ["bet75"] };
  const table = replayOrNull(inputs, board, path);
  assert.ok(table);
  const node = table.log.at(-1).node, first = parseCards("AcKd", 2), counterfactual = parseCards("9d9h", 2);
  assert.deepEqual(fast.mix(table, board, node, first, fast.baseMix(table, board, node, first)),
    reference.mix(table, board, node, first, reference.baseMix(table, board, node, first)));
  const refContext = reference.context(table, board, node), fastContext = fast.context(table, board, node);
  const id = comboId(...counterfactual);
  assert.equal(refContext.equities.has(id), false, "saved bet75 reach excludes medium 99");
  assert.equal(fastContext.equities.has(id), true, "cached exact equity includes the counterfactual hand");
  assert.deepEqual(fast.mix(table, board, node, counterfactual, fast.baseMix(table, board, node, counterfactual)),
    reference.mix(table, board, node, counterfactual, reference.baseMix(table, board, node, counterfactual)));
  assert.equal(fast.equity(fastContext, counterfactual), reference.equity(refContext, counterfactual));
  assert.ok(refContext.bettorRange.plans?.size, "reference point query rebuilt final-board indexes");
  assert.equal(fastContext.bettorRange.dense, null);
  assert.equal(fastContext.bettorRange.plans, undefined);
  const beforeRelease = fast.mix(table, board, node, first, fast.baseMix(table, board, node, first));
  const baseWeights = fast.baseWeights(fastContext.defender), ruleCount = fast.rules.size;
  fast.releaseBoardCaches();
  assert.equal(fast.largeRun, true, "board release keeps the exact large-run storage mode");
  assert.equal(fast.baseWeights(fastContext.defender), baseWeights);
  assert.equal(fast.rules.size, ruleCount);
  assert.equal(fast.stages.size, 0);
  for (const group of [fast.contexts, fast.bets, fast.bettingFactRanges]) {
    for (const cache of Object.values(group)) assert.equal(cache.size, 0);
  }
  assert.deepEqual(fast.mix(table, board, node, first, fast.baseMix(table, board, node, first)), beforeRelease);
});

test("allocation-free draw detection keeps every reference tier (including wheel and suit ownership)", () => {
  const random = seededRandom(44);
  for (let i = 0; i < 3000; i++) {
    const cards = [];
    while (cards.length < 7) { const card = Math.floor(random() * 52); if (!cards.includes(card)) cards.push(card); }
    const hole = cards.slice(0, 2);
    for (const length of [3, 4, 5]) {
      const board = cards.slice(2, 2 + length);
      assert.equal(handTier(hole, board), referenceTier(hole, board));
    }
  }
});

test("board workers preserve simulation seeds, board order and both heads-up trees", async () => {
  const boardList = [parseFlopBoard("As7d2c"), parseFlopBoard("KhTh4s")].map(board => ({ ...board, split: "design" }));
  for (const spot of ["BTN_open_BB_call", "SB_limp_BB_check"]) {
    const inputs = loadInputs(spot), policy = referencePolicyFor(inputs.spot.tree), later = referenceLaterPolicy();
    const expected = simulate(inputs, policy, 2, later, { boardList });
    const actual = await simulateParallel(inputs, policy, 2, later, { boardList, parallelism: 2 });
    assert.deepEqual(actual, expected);
  }
});

test("hand-EV scheduling leaves the source order intact and sends expensive boards first", () => {
  const source = ["KcKd4h", "8c8d2h", "customA", "AhKh4h", "5s5d4c", "customB"]
    .map(id => ({ id }));
  const original = source.slice();
  assert.deepEqual(boardWorkOrder("hand-ev", source).map(board => board.id),
    ["customA", "customB", "8c8d2h", "5s5d4c", "AhKh4h", "KcKd4h"]);
  assert.deepEqual(source, original);
  assert.equal(boardWorkOrder("simulate", source), source);
});

test("hand-EV board workers use exactly the shared browser core despite reordered tasks and handle failures", async () => {
  const inputs = loadInputs("BTN_open_BB_call"), policy = referencePolicyFor(inputs.spot.tree), later = referenceLaterPolicy();
  const board = parseFlopBoard("As7d2c");
  // Deliberately put the short board first in the input and use one worker: it
  // must process the reverse work order, but restore the input object order.
  const boardList = [parseFlopBoard("KcKd4h"), board];
  const expected = Object.fromEntries(boardList.map(item => [item.id, handEvForBoard(item, inputs, policy, 1, later)]));
  const actual = await computeBoardBatch({ kind: "hand-ev", inputs, policy, laterCandidate: later,
    samples: 1, boardList, parallelism: 1 });
  assert.deepEqual(actual, expected);
  assert.deepEqual(Object.keys(actual), boardList.map(item => item.id));
  await assert.rejects(computeBoardBatch({ kind: "invalid", inputs, policy, samples: 1,
    boardList: [board], parallelism: 1 }), /Unknown board task/);
});
