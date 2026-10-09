import assert from "node:assert/strict";
import test from "node:test";
import { brotliCompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import { canonicalFlop } from "../../frontend/scripts/postflop-ai/flop-isomorphism.ts";
import { compactFlopBase, packFrame, packView } from "../../frontend/scripts/postflop-ai/flop-base-codec.ts";
import { getSavedPostflopRange, listPostflopCoverage } from "../src/postflop-data.ts";
import { McpDataError } from "../src/data.ts";

const digest = value => createHash("sha256").update(value).digest("hex");
const board = "Kc7d2h";
const boardKey = canonicalFlop(board).key;
const spotId = "BTN_open_BB_call";
const sourceHash = "a".repeat(64);
const timestamp = "2026-10-08T12:35:57.000Z";
const ranks = "AKQJT98765432";
const hands = ranks.split("").flatMap((a, i) => ranks.split("").map((b, j) => i === j ? a + b : i < j ? a + b + "s" : b + a + "o"));

const flopPolicy = { kind: "ai_estimate_not_gto", version: 1, rules: [] };
const flopHash = digest(JSON.stringify(flopPolicy));
const flopMetadata = { source_hash: sourceHash, policy_hash: flopHash };
const laterPolicy = { kind: "ai_estimate_not_gto", version: 1, streets: { turn: { rules: [] }, river: { rules: [] } } };
const laterHash = digest(JSON.stringify(laterPolicy));
const laterMetadata = { source_hash: sourceHash, policy_hash: laterHash, flop_policy_hash: flopHash };
const spot = { id: spotId, kind: "srp", slug: "btn-bb-srp-v1", tree: "oop_checks", ip: "BTN", oop: "BB", opener: "BTN",
  caller: "BB", aggressor: "BTN", potBb: 5.5, stackBb: 97.5, reachable: true };

function combo(cards, reachWeight, mix) { return { cards, tier: "strong", weight: 1, reachWeight, mix }; }
const liveCombos = [
  combo("AcAd", 1, { check: 0.25, bet33: 0.25, bet75: 0.25, bet125: 0.25 }),
  combo("AcAh", 3, { check: 0.5, bet33: 0.25, bet75: 0.125, bet125: 0.125 }),
  combo("AcAs", 0, { check: 1, bet33: 0, bet75: 0, bet125: 0 }),
  combo("AdAh", 0, { check: 1, bet33: 0, bet75: 0, bet125: 0 }),
  combo("AdAs", 0, { check: 1, bet33: 0, bet75: 0, bet125: 0 }),
  combo("AhAs", 0, { check: 1, bet33: 0, bet75: 0, bet125: 0 }),
];

function makeView(node, seat, actions) {
  const rows = hands.map(hand => hand === "AA" ? {
    hand, comboCount: liveCombos.length, reachable: true, mix: Object.fromEntries(actions.map(action => [action, 1 / actions.length])),
    tiers: { monster: 0, strong: 1, draw: 0, medium: 0, air: 0 }, combos: liveCombos.map(item => ({ ...item,
      mix: Object.fromEntries(actions.map(action => [action, item.mix[action] ?? (action === "fold" ? 1 : 0)])),
    })), reachWeight: liveCombos.reduce((sum, item) => sum + item.reachWeight, 0),
  } : {
    hand, comboCount: 0, reachable: false, mix: Object.fromEntries(actions.map(action => [action, 0])),
    tiers: { monster: 0, strong: 0, draw: 0, medium: 0, air: 0 }, combos: [], reachWeight: 0,
  });
  return packView({ node, seat, actions, rows });
}

function makeFixture({ corruptHash = false, missingPart = false, oversizedPart = false, corruptColumnIndex = false, corruptPolicy = false, count = 1 } = {}) {
  const rootView = makeView("btn_first", "BTN", ["check", "bet33", "bet75", "bet125"]);
  const facingView = makeView("bb_vs_33", "BB", ["fold", "call", "raise"]);
  const baseMetadata = { generator_version: 6, isomorphism_version: 1, evaluator_version: 1, source_hash: sourceHash,
    policy_hash: flopHash, later_policy_hash: laterHash, later_sizing_hash: "b".repeat(64), defence_version: 1,
    defence_config_hash: "c".repeat(64), seed: 20261009, explanation_precision: 4, samples: { defence_runouts: 300 } };
  const rawBase = compactFlopBase({ kind: "ai_estimate_not_gto", mode: "balanced", spot: spotId, flop: boardKey, metadata: baseMetadata,
    histories: Object.fromEntries([["", rootView], ["bet33", facingView]].map(([key, view]) => [key, {
      view, combo_facts: packFrame([]), class_facts: packFrame([]),
    }])) });
  if (corruptColumnIndex) rawBase.histories[""].view.rows.columns[0] = rawBase.columns.length;
  const json = JSON.stringify(rawBase), zipped = brotliCompressSync(json);
  const cut = Math.ceil(zipped.length / 2);
  const baseHash = digest(json);
  const flopRows = [
    { spot_id: spotId, flop_key: boardKey, part: 0, parts: 2, content_hash: corruptHash ? "0".repeat(64) : baseHash,
      body: oversizedPart ? new Uint8Array(45_001) : [...zipped.subarray(0, cut)] },
    { spot_id: spotId, flop_key: boardKey, part: 1, parts: 2, content_hash: corruptHash ? "0".repeat(64) : baseHash, body: [...zipped.subarray(cut)] },
  ].slice(0, missingPart ? 1 : 2);
  const policyHashes = { [spotId]: { flop: flopHash, later: laterHash } };
  const versions = [
    { name: "postflop", content_hash: digest(JSON.stringify(policyHashes)), published_at: timestamp, detail_json: JSON.stringify({ spots: policyHashes }) },
    { name: "flop-base", content_hash: digest("published flop-base index"), published_at: timestamp,
      detail_json: JSON.stringify({ spots: { [spotId]: count } }) },
  ];
  const policyRows = [
    { spot_id: spotId, stage: "flop", policy_hash: flopHash, metadata_json: JSON.stringify(flopMetadata),
      policy_json: JSON.stringify({ metadata: flopMetadata, policy: corruptPolicy ? { ...flopPolicy, rules: [{ corrupt: true }] } : flopPolicy }) },
    { spot_id: spotId, stage: "later", policy_hash: laterHash, metadata_json: JSON.stringify(laterMetadata),
      policy_json: JSON.stringify({ metadata: laterMetadata, policy: laterPolicy }) },
  ];
  const tables = { versions, spots: [{ ...spot, spot_id: spotId, pot_bb: spot.potBb, stack_bb: spot.stackBb, spot_json: JSON.stringify(spot) }], policyRows, flopRows };
  const calls = [];
  const db = { prepare(sql) {
    assert.match(sql, /^SELECT /, "MCP postflop adapter may only issue SELECTs");
    return { bind(...args) { return { async all() {
      calls.push({ sql, args });
      if (sql.includes("FROM dataset_versions")) return { results: tables.versions.filter(row => args.includes(row.name)) };
      if (sql.includes("FROM postflop_spots")) return { results: tables.spots.slice().sort((a, b) => a.spot_id.localeCompare(b.spot_id)).slice(0, args[0]) };
      if (sql.includes("FROM postflop_policies")) {
        let rows = tables.policyRows;
        if (sql.includes("WHERE spot_id = ? AND stage = ?")) rows = rows.filter(row => row.spot_id === args[0] && row.stage === args[1]);
        rows = rows.slice().sort((a, b) => a.spot_id.localeCompare(b.spot_id) || a.stage.localeCompare(b.stage));
        return { results: sql.includes("WHERE spot_id = ? AND stage = ?") ? rows.slice(0, 2) : rows.slice(0, args[0]) };
      }
      if (sql.includes("COUNT(DISTINCT flop_key)")) {
        const counts = new Map();
        for (const row of tables.flopRows) counts.set(row.spot_id, new Set([...(counts.get(row.spot_id) ?? []), row.flop_key]));
        return { results: [...counts].map(([id, keys]) => ({ spot_id: id, flop_count: keys.size })).slice(0, args[0]) };
      }
      if (sql.includes("FROM postflop_flop_base_br")) {
        let rows = tables.flopRows;
        if (sql.includes("WHERE spot_id = ? AND flop_key = ?")) rows = rows.filter(row => row.spot_id === args[0] && row.flop_key === args[1]).sort((a, b) => a.part - b.part);
        else if (sql.includes("part = 0")) return { results: rows.filter(row => row.spot_id === args[0] && row.part === 0)
          .sort((a, b) => a.flop_key.localeCompare(b.flop_key)).slice(args[2], args[2] + args[1]) };
        else return { results: rows.slice(0, args.at(-1)) };
        return { results: rows.slice(0, args.at(-1)) };
      }
      throw new Error(`Unexpected query: ${sql}`);
    } }; } };
  } };
  return { db, calls, tables };
}

const code = expected => error => error instanceof McpDataError && error.code === expected;

test("coverage discovers only released spots, saved boards, and histories from actual D1 rows", async () => {
  const { db } = makeFixture();
  const spots = await listPostflopCoverage(db);
  assert.equal(spots.publicationStatus, "published");
  assert.equal(spots.total, 1);
  assert.equal(spots.spots[0].id, spotId);
  assert.equal(spots.spots[0].savedFlopCoverage.boardClasses, 1);
  assert.equal(spots.spots[0].policies.turnRiver.status, "policy_published_range_not_materialized");
  const boards = await listPostflopCoverage(db, { spotId });
  assert.deepEqual(boards.boards.map(item => item.flop), [boardKey]);
  const histories = await listPostflopCoverage(db, { spotId, flop: "Ks7h2c", limit: 10 });
  assert.equal(histories.canonicalFlop, boardKey);
  assert.deepEqual(histories.histories.map(item => [item.history, item.node, item.seat]), [[[], "btn_first", "BTN"], [["bet33"], "bb_vs_33", "BB"]]);
  assert.equal(histories.histories[0].actions[0], "check");
});

test("range retrieval returns exact saved combo mixes with path weights and does not leak all combos by default", async () => {
  const { db } = makeFixture();
  const allHands = await getSavedPostflopRange(db, { spotId, flop: "Ks7h2c" });
  assert.equal(allHands.street, "flop");
  assert.equal(allHands.node, "btn_first");
  assert.equal(allHands.actingSeat, "BTN");
  assert.equal(allHands.frequencyUnit, "fraction");
  assert.equal(allHands.rangeStatus, "available");
  assert.equal(allHands.hands.length, 169);
  const aa = allHands.hands.find(item => item.hand === "AA");
  assert.equal(aa.rangeReachWeight, 4);
  assert.equal(aa.reachedComboCount, 2);
  assert.deepEqual(aa.frequencies, { check: 0.4375, bet33: 0.25, bet75: 0.15625, bet125: 0.15625 });
  assert.equal("combos" in aa, false);
  assert.equal(allHands.hands.find(item => item.hand === "KK").frequencies, null);
  assert.equal(allHands.source.flopBaseHash, digest(JSON.stringify((await (async () => {
    const compressedRows = makeFixture().tables.flopRows;
    const { brotliDecompressSync } = await import("node:zlib");
    return JSON.parse(brotliDecompressSync(Buffer.from(compressedRows[0].body.concat(compressedRows[1].body))).toString());
  })()))));

  const oneHand = await getSavedPostflopRange(db, { spotId, flop: "Ks7h2c", history: ["bet33"], hand: "AA" });
  assert.equal(oneHand.node, "bb_vs_33");
  assert.equal(oneHand.actingSeat, "BB");
  assert.equal(oneHand.hands.length, 1);
  assert.equal(oneHand.hands[0].hand, "AA");
  assert.equal(oneHand.hands[0].combos.length, 2);
  assert.ok(oneHand.hands[0].combos.every(item => item.reachWeight > 0));
  assert.ok(oneHand.hands[0].combos.every(item => ![..."Ks7h2c".match(/../g)].some(card => item.cards.includes(card))));
});

test("missing, unsupported, malformed, and unreachable states do not substitute a strategy", async () => {
  const fixture = makeFixture();
  for (const change of [{ spotId: "not_published" }, { spotId, flop: board, history: ["fold"] }]) {
    await assert.rejects(getSavedPostflopRange(fixture.db, { spotId, flop: board, ...change }), code("not_found"));
  }
  await assert.rejects(getSavedPostflopRange(fixture.db, { spotId, flop: "AsAs2h" }), code("invalid_argument"));
  await assert.rejects(getSavedPostflopRange(fixture.db, { spotId, flop: "bad" }), code("invalid_argument"));
  await assert.rejects(getSavedPostflopRange(fixture.db, { spotId, flop: board, hand: "AK" }), code("invalid_argument"));
  await assert.rejects(listPostflopCoverage(fixture.db, { flop: board }), code("invalid_argument"));
  await assert.rejects(listPostflopCoverage(fixture.db, { spotId, offset: -1 }), code("invalid_argument"));
  await assert.rejects(getSavedPostflopRange(makeFixture({ missingPart: true }).db, { spotId, flop: board }), code("invalid_saved_data"));
  await assert.rejects(getSavedPostflopRange(makeFixture({ oversizedPart: true }).db, { spotId, flop: board }), code("invalid_saved_data"));
  await assert.rejects(getSavedPostflopRange(makeFixture({ corruptColumnIndex: true }).db, { spotId, flop: board }), code("invalid_saved_data"));
  await assert.rejects(getSavedPostflopRange(makeFixture({ corruptHash: true }).db, { spotId, flop: board }), code("invalid_saved_data"));
  await assert.rejects(getSavedPostflopRange(makeFixture({ corruptPolicy: true }).db, { spotId, flop: board }), code("invalid_saved_data"));
});

test("empty publication is reported as missing and no unlisted D1 spot is exposed", async () => {
  const { db, tables } = makeFixture();
  tables.versions = [];
  assert.deepEqual(await listPostflopCoverage(db), {
    kind: "ai_estimate_not_gto",
    notice: "Saved independent AI estimates for study; not solver GTO, live-game assistance, or a guarantee of profit. Missing, unreachable, or unpublished paths have no substitute strategy.",
    publicationStatus: "not_published", total: 0, spots: [], nextOffset: null,
  });
  await assert.rejects(getSavedPostflopRange(db, { spotId, flop: board }), code("not_found"));
});
