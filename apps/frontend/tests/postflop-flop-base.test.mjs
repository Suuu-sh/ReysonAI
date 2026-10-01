import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { canonicalFlop, canonicalFlops, comboKey, mapCards, suitPermutations } from "../scripts/postflop-ai/flop-isomorphism.mjs";
import { packFrame, unpackFrame } from "../scripts/postflop-ai/flop-base-codec.mjs";
import { buildFlopBase, FLOP_BASE_EV_SAMPLES, isFreshFlopBase, storedFlopNodes, storedFlopExplanation, storedFlopHandEv } from "../scripts/postflop-ai/flop-base-core.mjs";
import { flopNodes, flopNodesCanonical } from "../scripts/postflop-ai/views.mjs";
import { flopUiFacts } from "../scripts/postflop-ai/flop-ui-facts.mjs";
import { referencePolicy } from "../scripts/postflop-ai/policy.mjs";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { sha } from "../scripts/postflop-ai/browser-inputs.mjs";
import { seededRandom } from "../scripts/lib/equity.mjs";
import { treeHistories } from "../scripts/postflop-ai/tree.mjs";
import { computeBoard, computeExplain, computeFlopHandEv, storedFlopHandEvInput } from "../src/estimated/postflop-compute.ts";
import { handEvForBoard, flopHandEvForHand } from "../scripts/postflop-ai/flop-hand-ev-core.mjs";
import { computeBoardBatch } from "../scripts/postflop-ai/board-batch.mjs";
import { flopBaseTextParts, buildFlopBaseSql } from "../scripts/postflop-ai/flop-base-d1.mjs";
import { readFreshFlopBase } from "../scripts/postflop-ai/flop-base-files.mjs";
import opening from "../src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../src/estimated/preflop-ranges.json" with { type: "json" };

const inputs = loadInputs("BTN_open_BB_call"), datasets = { opening, responses };
const candidate = { policy: referencePolicy, metadata: { source_hash: inputs.fingerprint, policy_hash: sha(referencePolicy) } };
const laterCandidate = { policy: referenceLaterPolicy(), metadata: {} };
laterCandidate.metadata = { source_hash: inputs.fingerprint, flop_policy_hash: candidate.metadata.policy_hash, policy_hash: sha(laterCandidate.policy) };
const options = { inputs, candidate, laterCandidate };
const request = { spotId: inputs.spot.id, datasets, flopCandidate: candidate, laterCandidate };

test("all 22,100 flops map to exactly 1,755 suit classes, with full card/holes round trips", () => {
  const keys = new Set(); let count = 0;
  for (let a = 0; a < 50; a++) for (let b = a + 1; b < 51; b++) for (let c = b + 1; c < 52; c++) {
    const actual = [a, b, c], canonical = canonicalFlop(actual);
    keys.add(canonical.key); count++;
    assert.deepEqual(mapCards(mapCards(actual, canonical.toCanonical), canonical.fromCanonical), actual);
    const holes = [0, 51];
    assert.deepEqual(mapCards(mapCards(holes, canonical.toCanonical), canonical.fromCanonical), holes);
    assert.equal(canonicalFlop([...actual].reverse()).key, canonical.key);
  }
  assert.equal(count, 22100); assert.equal(keys.size, 1755); assert.equal(canonicalFlops().length, 1755);
  for (const flop of canonicalFlops()) for (const permutation of suitPermutations) {
    assert.equal(canonicalFlop(mapCards(flop.cards, permutation)).key, flop.id);
  }
  assert.throws(() => canonicalFlop("AcAc2d"));
});

test("columnar frames preserve nullable classes, nested arrays, precise f64 weights and order", () => {
  const records = [null, { a: 1 / 7, b: [{ value: .32, constant: "flop" }], reach: .1 + .2 }, { a: .24, b: [{ value: .37, constant: "flop" }], reach: .8 }];
  assert.deepEqual(unpackFrame(packFrame(records)), records);
});

test("20 seeded random flops have identical remapped and directly computed mixes", () => {
  const random = seededRandom(20261001);
  for (let at = 0; at < 20; at++) {
    const actual = [];
    while (actual.length < 3) { const card = Math.floor(random() * 52); if (!actual.includes(card)) actual.push(card); }
    const canonical = canonicalFlop(actual), raw = flopNodesCanonical(inputs, candidate.policy, canonical.cards);
    const direct = flopNodes(inputs, candidate.policy, actual);
    for (const [name, node] of Object.entries(raw)) {
      assert.deepEqual(direct[name].rows.map(row => row.mix), node.rows.map(row => row.mix));
      for (let index = 0; index < node.rows.length; index++) {
        assert.deepEqual(direct[name].rows[index].combos, node.rows[index].combos.map(combo => ({ ...combo, cards: comboKey(combo.cards, canonical.fromCanonical) })));
      }
    }
  }
});

test("5 flops: JSON stored/remapped views and combo/class UI facts deep-equal the direct path", () => {
  for (const board of ["As7d2c", "KhKd4h", "9s7s3s", "Th9h8c", "8d8h8s"]) {
    const base = JSON.parse(JSON.stringify(buildFlopBase({ ...options, board })));
    assert.ok(isFreshFlopBase(base, inputs, candidate, laterCandidate));
    assert.deepEqual(Object.keys(base.histories), Object.keys(treeHistories(inputs.spot.tree)));
    for (const [history, state] of Object.entries(treeHistories(inputs.spot.tree))) {
      const path = history ? history.split(",") : [];
      const stored = storedFlopNodes(base, inputs, board, path);
      assert.deepEqual(stored, flopNodes(inputs, candidate.policy, board.match(/../g).map(text => "23456789TJQKA".indexOf(text[0]) * 4 + "cdhs".indexOf(text[1])), path));
      const row = stored[state.node].rows.find(row => row.hand === "AA" && row.reachable) ?? stored[state.node].rows.find(row => row.reachable);
      const boardCards = board.match(/../g).map(text => "23456789TJQKA".indexOf(text[0]) * 4 + "cdhs".indexOf(text[1]));
      const explain = { inputs, policy: candidate.policy, boardCards, node: state.node, history: path, cards: row.combos[0].cards };
      assert.deepEqual(storedFlopExplanation(base, explain), flopUiFacts(explain));
      const average = { ...explain, combos: row.combos.map(({ cards, weight }) => ({ cards, weight })) };
      assert.deepEqual(storedFlopExplanation(base, average), flopUiFacts(average));
    }
    assert.deepEqual(computeBoard({ ...request, board, flopBase: base }), computeBoard({ ...request, board }));
    const node = "bb_vs_75", row = storedFlopNodes(base, inputs, board)[node].rows.find(row => row.reachable);
    const explain = { ...request, board, node, cards: row.combos[0].cards };
    assert.deepEqual(computeExplain({ ...explain, flopBase: base }), computeExplain(explain));
    for (const change of [{ defence_version: -1 }, { generator_version: -1 }, { source_hash: "old" }, { policy_hash: "old" },
      { later_policy_hash: "old" }, { defence_config_hash: "old" }, { samples: { defence_runouts: 1, ev_per_hand_action: 1 } }]) {
      const stale = { ...base, metadata: { ...base.metadata, ...change } };
      assert.ok(!isFreshFlopBase(stale, inputs, candidate, laterCandidate));
      assert.deepEqual(computeBoard({ ...request, board, flopBase: stale }), computeBoard({ ...request, board }));
    }
    assert.equal(storedFlopNodes(base, inputs, "2c3d4h"), null);
  }
});

test("D1 text splits round-trip UTF-8 and quotes, with every full statement below 90KB", () => {
  const text = JSON.stringify({ value: "a'日本語♠🃏".repeat(18000) });
  assert.equal(flopBaseTextParts(text).join(""), text);
  const sql = buildFlopBaseSql([{ spot: inputs.spot.id, flop: "Ac7d2h", text, hash: "h" }], "2026-10-01");
  for (const statement of sql.trim().split("\n")) assert.ok(Buffer.byteLength(statement) < 90000);
  assert.match(sql, /'flop-base'/); assert.doesNotMatch(sql, /DELETE FROM postflop_spots/);
});

test("board workers write deterministic resumable files, identical across worker counts", async () => {
  const one = mkdtempSync(join(tmpdir(), "flop-base-one-")), two = mkdtempSync(join(tmpdir(), "flop-base-two-"));
  const boardList = ["As7d2c", "KhKd4h"].map(board => ({ id: canonicalFlop(board).key, cards: canonicalFlop(board).cards }));
  try {
    for (const [outputDir, parallelism] of [[one, 1], [two, 2]]) {
      await computeBoardBatch({ kind: "flop-base", inputs, policy: candidate.policy, laterCandidate, samples: FLOP_BASE_EV_SAMPLES,
        boardList, parallelism, taskOptions: { outputDir, candidate, laterCandidate } });
    }
    for (const board of boardList) {
      const a = brotliDecompressSync(readFileSync(join(one, `${board.id}.json.br`))).toString();
      const b = brotliDecompressSync(readFileSync(join(two, `${board.id}.json.br`))).toString();
      if (a !== b) {
        let at = 0; while (a[at] === b[at]) at++;
        assert.fail(`${board.id} differs at ${at}: ${a.slice(at - 100, at + 180)} != ${b.slice(at - 100, at + 180)}`);
      }
      assert.ok(readFreshFlopBase(inputs.spot, board.id, inputs, candidate, laterCandidate, FLOP_BASE_EV_SAMPLES, one));
      assert.equal(readFreshFlopBase(inputs.spot, board.id, inputs, { ...candidate, metadata: { policy_hash: "changed" } }, laterCandidate, FLOP_BASE_EV_SAMPLES, one), null);
    }
  } finally { rmSync(one, { recursive: true }); rmSync(two, { recursive: true }); }
});

test("missing stored EV stays on demand; stored class rows never claim combo-specific EV", () => {
  assert.equal(storedFlopHandEv({ ev: null }, [], "AA"), null);
  const row = { mix: { call: 100 }, ev_bb: { call: 2.5 } };
  assert.deepEqual(storedFlopHandEv({ ev: { "bet75": { node: "bb_vs_75", actor: "BB", pot_bb: 9.63, rows: { AA: row } } } }, ["bet75"], "AA"),
    { node: "bb_vs_75", actor: "BB", pot_bb: 9.63, street: "flop", row });
});

test("paired-SE diagnostics preserve the deterministic common-random-number EV rows", () => {
  const canonical = canonicalFlop("8d8h8s"), board = { id: canonical.key, cards: canonical.cards };
  const plain = handEvForBoard(board, inputs, candidate.policy, 3, laterCandidate.policy);
  const measured = handEvForBoard(board, inputs, candidate.policy, 3, laterCandidate.policy, { uncertainty: true });
  for (const [key, { uncertainty, ...result }] of Object.entries(measured)) {
    assert.deepEqual(result, plain[key]);
    for (const diagnostic of Object.values(uncertainty ?? {})) {
      assert.equal(diagnostic.samples, 3);
      assert.ok(Number.isFinite(diagnostic.se_bb) && diagnostic.se_bb >= 0);
      assert.equal(diagnostic.actions.length, 2);
    }
  }
});

test("fresh stored class EV skips the core; stale policies and custom sampling use on-demand", () => {
  const board = "As7d2c", canonical = canonicalFlop(board), history = ["bet75"];
  const result = flopHandEvForHand({ flop: canonical.key, history, hand: "AA", samples: 3,
    inputs, flopPolicy: candidate.policy, laterPolicy: laterCandidate.policy });
  // A small synthetic row tests delivery, not the production precision audit.
  const base = buildFlopBase({ ...options, board, ev: { bet75: {
    node: result.node, actor: result.actor, pot_bb: result.pot_bb, rows: { AA: result.row },
  } } });
  const query = { ...request, board, history, hand: "AA", flopBase: base };
  const expected = { spot: inputs.spot.id, hand: "AA", kind: "ai_estimate_not_gto", ...result };
  assert.deepEqual(storedFlopHandEvInput(query), expected);
  assert.deepEqual(computeFlopHandEv(query), expected);
  assert.equal(storedFlopHandEvInput({ ...query, samples: 3 }), null);
  assert.equal(storedFlopHandEvInput({ ...query, seed: 1 }), null);
  assert.equal(storedFlopHandEvInput({ ...query, flopCandidate: { ...candidate, metadata: { ...candidate.metadata, policy_hash: "stale" } } }), null);
});
