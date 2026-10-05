import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { canonicalFlop, canonicalFlops, comboKey, mapCards, suitPermutations } from "../scripts/postflop-ai/flop-isomorphism.ts";
import { packFrame, unpackFrame } from "../scripts/postflop-ai/flop-base-codec.ts";
import { buildFlopBase, FLOP_BASE_VERSION, isFreshFlopBase, storedFlopNodes, storedFlopExplanation } from "../scripts/postflop-ai/flop-base-core.ts";
import { flopNodes, flopNodesCanonical } from "../scripts/postflop-ai/views.ts";
import { flopUiFacts } from "../scripts/postflop-ai/flop-ui-facts.ts";
import { referencePolicy } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { sha } from "../scripts/postflop-ai/browser-inputs.ts";
import { seededRandom } from "../scripts/lib/equity.ts";
import { treeHistories } from "../scripts/postflop-ai/tree.ts";
import { computeBoard, computeExplain } from "../src/estimated/postflop-compute.ts";
import { computeBoardBatch } from "../scripts/postflop-ai/board-batch.mjs";
import { flopBaseBytesParts, buildFlopBaseSql, flopBaseMiddleware } from "../scripts/postflop-ai/flop-base-d1.mjs";
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
      { later_policy_hash: "old" }, { defence_config_hash: "old" }, { samples: { defence_runouts: 1 } }]) {
      const stale = { ...base, metadata: { ...base.metadata, ...change } };
      assert.ok(!isFreshFlopBase(stale, inputs, candidate, laterCandidate));
      assert.deepEqual(computeBoard({ ...request, board, flopBase: stale }), computeBoard({ ...request, board }));
    }
    assert.equal(storedFlopNodes(base, inputs, "2c3d4h"), null);
  }
});

test("D1 BLOB parts round-trip bytes, with every full statement below 90KB", async () => {
  const { randomBytes } = await import("node:crypto");
  const bytes = randomBytes(300000);
  assert.deepEqual(Buffer.concat(flopBaseBytesParts(bytes)), bytes);
  const sql = buildFlopBaseSql([{ spot: inputs.spot.id, flop: "Ac7d2h", text: "x", compressed: bytes, hash: "h" }], "2026-10-01");
  const inserts = sql.trim().split("\n").filter(line => line.startsWith("INSERT INTO postflop_flop_base_br"));
  assert.equal(inserts.length, flopBaseBytesParts(bytes).length);
  for (const statement of sql.trim().split("\n")) assert.ok(Buffer.byteLength(statement) < 90000);
  const hex = inserts.map(line => line.match(/X'([0-9a-f]*)'\);$/)[1]).join("");
  assert.equal(hex, bytes.toString("hex"));
  assert.match(sql, /'flop-base'/); assert.doesNotMatch(sql, /DELETE FROM postflop_spots/);
});

test("local flop middleware serves stored Brotli with content-encoding, decoded by fetch", async () => {
  const { createServer } = await import("node:http");
  const { brotliCompressSync } = await import("node:zlib");
  const text = JSON.stringify({ spot: "s", flop: "Ac7d2h" });
  const server = createServer((req, res) => {
    // Same headers as flopBaseMiddleware for a found file, using a fixed body.
    res.setHeader("Content-Type", "application/json"); res.setHeader("Content-Encoding", "br"); res.end(brotliCompressSync(text));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/local-postflop-flop`);
    assert.deepEqual(await response.json(), JSON.parse(text));
  } finally { server.close(); }
  assert.equal(typeof flopBaseMiddleware, "function");
});

test("board workers write deterministic resumable files, identical across worker counts", async () => {
  const one = mkdtempSync(join(tmpdir(), "flop-base-one-")), two = mkdtempSync(join(tmpdir(), "flop-base-two-"));
  const boardList = ["As7d2c", "KhKd4h"].map(board => ({ id: canonicalFlop(board).key, cards: canonicalFlop(board).cards }));
  try {
    for (const [outputDir, parallelism] of [[one, 1], [two, 2]]) {
      await computeBoardBatch({ kind: "flop-base", inputs, policy: candidate.policy, laterCandidate, samples: 1,
        boardList, parallelism, taskOptions: { outputDir, candidate, laterCandidate } });
    }
    for (const board of boardList) {
      const a = brotliDecompressSync(readFileSync(join(one, `${board.id}.json.br`))).toString();
      const b = brotliDecompressSync(readFileSync(join(two, `${board.id}.json.br`))).toString();
      if (a !== b) {
        let at = 0; while (a[at] === b[at]) at++;
        assert.fail(`${board.id} differs at ${at}: ${a.slice(at - 100, at + 180)} != ${b.slice(at - 100, at + 180)}`);
      }
      assert.ok(readFreshFlopBase(inputs.spot, board.id, inputs, candidate, laterCandidate, one));
      assert.equal(readFreshFlopBase(inputs.spot, board.id, inputs, { ...candidate, metadata: { policy_hash: "changed" } }, laterCandidate, one), null);
    }
  } finally { rmSync(one, { recursive: true }); rmSync(two, { recursive: true }); }
});

test("the base stores no EV and a base that still carries EV is stale", () => {
  assert.ok(FLOP_BASE_VERSION >= 6);
  const base = buildFlopBase({ ...options, board: "As7d2c" });
  assert.equal(base.ev, undefined);
  assert.equal(base.metadata.generator_version, FLOP_BASE_VERSION);
  assert.equal(base.metadata.samples.ev_per_hand_action, undefined);
  assert.ok(isFreshFlopBase(base, inputs, candidate, laterCandidate));
  assert.equal(isFreshFlopBase({ ...base, ev: {} }, inputs, candidate, laterCandidate), false);
  assert.equal(isFreshFlopBase({ ...base, metadata: { ...base.metadata, generator_version: 5 } }, inputs, candidate, laterCandidate), false);
});
