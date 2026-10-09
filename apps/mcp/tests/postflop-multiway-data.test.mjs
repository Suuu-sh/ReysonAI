import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInputs } from "../../frontend/scripts/postflop-ai/browser-inputs.ts";
import { loadInputs } from "../../frontend/scripts/postflop-ai/inputs.mjs";
import { loadCandidate } from "../../frontend/scripts/postflop-ai/generate.mjs";
import { computeBoard } from "../../frontend/src/estimated/postflop-compute.ts";
import { loadPublishedMultiwayPostflopSourceDatasets, publishedMultiwaySourceSelections } from "../src/postflop-multiway-data.ts";
import { evaluatePublishedPostflopPolicy, listPostflopCoverage } from "../src/postflop-data.ts";
import { McpDataError } from "../src/data.ts";

const index = JSON.parse(readFileSync(new URL("../src/multiway-source-index.json", import.meta.url), "utf8"));
const descriptors = JSON.parse(readFileSync(new URL("../../frontend/scripts/data/hu-after-multiway-spots.json", import.meta.url), "utf8")).spots;
const spotId = "CO_open_BTN_call_BB_squeeze_CO_fold_BTN_call";
const selection = index.spots[spotId];
const digest = value => createHash("sha256").update(value).digest("hex");
const expectedError = code => error => error instanceof McpDataError && error.code === code;

function sourceDocuments() {
  return Object.fromEntries(Object.keys(selection).map(name => [name,
    JSON.parse(readFileSync(new URL(`../../frontend/src/estimated/${name}.json`, import.meta.url), "utf8"))]));
}

function makeIndexedDb({ mutate = () => null } = {}) {
  const documents = sourceDocuments();
  const calls = [];
  return {
    calls,
    db: {
      prepare(sql) {
        assert.match(sql, /^WITH expected\(/);
        assert.match(sql, /SELECT e\.name/);
        assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
        return {
          bind(...args) {
            return {
              async all() {
                calls.push({ sql, args });
                const datasetCount = Object.keys(selection).length;
                const expected = [];
                for (let i = 0; i < datasetCount; i++) expected.push({ name: args[i * 4], contentHash: args[i * 4 + 1], bytes: args[i * 4 + 2], parts: args[i * 4 + 3] });
                const partArgs = args.slice(datasetCount * 4);
                assert.equal(partArgs.length % 2, 0);
                const requests = [];
                for (let i = 0; i < partArgs.length; i += 2) requests.push({ name: partArgs[i], part: partArgs[i + 1] });
                const rows = [];
                for (const request of requests) {
                  const meta = expected.find(item => item.name === request.name);
                  const descriptor = index.datasets[request.name];
                  const text = JSON.stringify(documents[request.name]);
                  const body = text.slice(request.part * index.partChars, (request.part + 1) * index.partChars);
                  const value = {
                    name: request.name, expected_hash: meta.contentHash, expected_bytes: meta.bytes, expected_parts: meta.parts,
                    actual_hash: meta.contentHash, actual_dataset_bytes: meta.bytes, actual_dataset_parts: meta.parts,
                    stored_parts: meta.parts, stored_bytes: meta.bytes, requested_part: request.part,
                    actual_part: request.part, body,
                  };
                  const changed = mutate({ ...request, value, descriptor, body });
                  if (Array.isArray(changed)) rows.push(...changed);
                  else rows.push(changed ?? value);
                }
                return { results: rows };
              },
            };
          },
        };
      },
    },
  };
}

function makePublishedPostflopDb() {
  const documents = sourceDocuments();
  const inputs = loadInputs(spotId);
  const candidate = loadCandidate(inputs);
  const releaseIndex = { [spotId]: { flop: candidate.metadata.policy_hash, later: null } };
  const release = { name: "postflop", content_hash: digest(JSON.stringify(releaseIndex)),
    published_at: "2026-10-09T00:00:00.000Z", detail_json: JSON.stringify({ spots: releaseIndex }) };
  const spot = inputs.spot;
  const spotRow = { spot_id: spot.id, slug: spot.slug, kind: spot.kind, tree: spot.tree, ip: spot.ip, oop: spot.oop,
    pot_bb: spot.potBb, stack_bb: spot.stackBb, spot_json: JSON.stringify(spot) };
  const policySummary = { spot_id: spotId, stage: "flop", policy_hash: candidate.metadata.policy_hash };
  const policyDocument = { spot_id: spotId, stage: "flop", policy_hash: candidate.metadata.policy_hash,
    metadata_json: JSON.stringify(candidate.metadata), policy_json: JSON.stringify(candidate) };
  const calls = [];
  const db = { prepare(sql) {
    assert.match(sql, /^(?:SELECT|WITH)\b/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
    return { bind(...args) { return { async all() {
      calls.push({ sql, args });
      if (sql.startsWith("WITH expected(")) {
        const datasetCount = Object.keys(selection).length;
        const metas = [];
        for (let i = 0; i < datasetCount; i++) metas.push({ name: args[i * 4], contentHash: args[i * 4 + 1], bytes: args[i * 4 + 2], parts: args[i * 4 + 3] });
        const partArgs = args.slice(datasetCount * 4), results = [];
        for (let i = 0; i < partArgs.length; i += 2) {
          const name = partArgs[i], part = partArgs[i + 1], meta = metas.find(row => row.name === name);
          const descriptor = index.datasets[name], text = JSON.stringify(documents[name]);
          results.push({ name, expected_hash: meta.contentHash, expected_bytes: meta.bytes, expected_parts: meta.parts,
            actual_hash: meta.contentHash, actual_dataset_bytes: meta.bytes, actual_dataset_parts: meta.parts,
            stored_parts: meta.parts, stored_bytes: meta.bytes, requested_part: part, actual_part: part,
            body: text.slice(part * index.partChars, (part + 1) * index.partChars) });
        }
        return { results };
      }
      if (sql.includes("FROM dataset_versions")) return { results: args.length === 2 ? [release] : [release] };
      if (sql.includes("FROM postflop_spots")) return { results: [spotRow] };
      if (sql.includes("FROM postflop_policies")) return { results: [sql.includes("metadata_json") ? policyDocument : policySummary] };
      if (sql.includes("FROM postflop_flop_base_br")) return { results: [] };
      throw new Error(`Unexpected query: ${sql}`);
    } }; } };
  } };
  return { db, calls, inputs, candidate, documents };
}

test("the MCP index covers exactly the 40 reviewed published HU-after-multiway spots", () => {
  assert.equal(descriptors.length, 40);
  assert.equal(index.partChars, 30_000);
  assert.equal(Object.keys(index.spots).length, 40);
  const expected = {};
  for (const spot of descriptors) {
    const grouped = new Map();
    for (const factors of Object.values(spot.ranges)) for (const [name, id] of factors) {
      const ids = grouped.get(name) ?? new Set(); ids.add(id); grouped.set(name, ids);
    }
    expected[spot.id] = Object.fromEntries([...grouped].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, ids]) => [name, [...ids].sort()]));
    assert.deepEqual(publishedMultiwaySourceSelections(spot.id), expected[spot.id]);
  }
  assert.deepEqual(index.spots, expected);
  assert.equal(Object.values(index.datasets).reduce((sum, data) => sum + Object.keys(data.rows).length, 0), 100);
  for (const dataset of Object.values(index.datasets)) {
    assert.match(dataset.contentHash, /^[a-f0-9]{64}$/);
    assert.ok(dataset.parts > 0 && dataset.bytes > 0);
    for (const row of Object.values(dataset.rows)) {
      assert.equal(row.end - row.start, row.codeUnits);
      assert.ok(row.parts.length > 0);
      for (const part of row.parts) assert.ok(dataset.chunks[String(part.part)]);
    }
    assert.ok(Object.values(dataset.chunks).every(part => !part.splitSurrogateAtEnd));
  }
});

test("one bounded D1 snapshot reads and reconstructs only the exact indexed source rows", async () => {
  const { db, calls } = makeIndexedDb();
  const datasets = await loadPublishedMultiwayPostflopSourceDatasets(db, spotId);
  assert.equal(calls.length, 1, "dataset metadata, stored parts, and selected bodies share one SQL snapshot");
  assert.ok(calls[0].args.length < 90);
  for (const [name, ids] of Object.entries(selection)) {
    const document = JSON.parse(readFileSync(new URL(`../../frontend/src/estimated/${name}.json`, import.meta.url), "utf8"));
    assert.equal(datasets[name].contentHash, index.datasets[name].contentHash);
    assert.deepEqual(datasets[name].spots, ids.map(id => document.spots.find(row => row.id === id)));
    assert.ok(datasets[name].spots.every(row => row.hands.length === 169));
  }
  const fullInputs = buildInputs(spotId, sourceDocuments());
  const selectedInputs = buildInputs(spotId, datasets);
  assert.deepEqual(selectedInputs, fullInputs, "selected saved rows reproduce the current Web input fingerprint and geometry");
  assert.ok(new TextEncoder().encode(JSON.stringify(datasets)).length < 2_000_000);
  assert.ok(calls[0].sql.includes("stored_stats AS"));
  assert.ok(calls[0].sql.includes("preflop_dataset_parts"));
});

test("unknown postflop IDs and missing or stale published sources fail closed", async () => {
  assert.equal(publishedMultiwaySourceSelections("guess_a_spot"), null);
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(undefined, spotId), expectedError("data_unavailable"));
  const missing = makeIndexedDb({ mutate: ({ value }) => ({ ...value, actual_hash: null, actual_dataset_bytes: null,
    actual_dataset_parts: null, stored_parts: null, stored_bytes: null, actual_part: null, body: null }) });
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(missing.db, spotId), expectedError("not_found"));
  const stale = makeIndexedDb({ mutate: ({ value }) => ({ ...value, actual_hash: "0".repeat(64) }) });
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(stale.db, spotId), expectedError("data_unavailable"));
  assert.equal(stale.calls.length, 1);
});

test("missing, duplicate, incomplete, or corrupt selected parts are rejected", async () => {
  const missing = makeIndexedDb({ mutate: ({ value }) => ({ ...value, body: null, actual_part: null }) });
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(missing.db, spotId), expectedError("invalid_saved_data"));
  const incomplete = makeIndexedDb({ mutate: ({ value }) => ({ ...value, stored_parts: value.stored_parts - 1 }) });
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(incomplete.db, spotId), expectedError("data_unavailable"));
  const corrupt = makeIndexedDb({ mutate: ({ value }) => ({ ...value, body: `${value.body}x` }) });
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(corrupt.db, spotId), expectedError("invalid_saved_data"));
  const duplicate = makeIndexedDb({ mutate: ({ value }) => [value, value] });
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(duplicate.db, spotId), expectedError("invalid_saved_data"));
});

test("source index pins the exact current published D1 metadata", () => {
  const expected = {
    "opening-ranges": [52_886, 2, "9f172583e5ef281655d3bbb9fc264de9b052c0fe82501f75d3f7edf765932b0f"],
    "preflop-ranges": [191_955, 7, "f61186b52005f184872df0d6f4a3ccf4c96b0e91180f9b0b4da4183a448fb114"],
    "multiway-responses": [241_196, 9, "46014bf93140ea3cfd81e2651b56badf6a7f6ef1f785766be9768f94dfe5981d"],
    "squeeze-responses": [745_761, 25, "9207dce4f11e0c4f885ee6d740c93005114021f09a7720d1a662b30bb7dc9f0e"],
    "cold-three-bet-responses": [248_985, 9, "a947c12d276fa2c9c769f9fe71434db73538d55a316292fb0bd1d62a06184b74"],
    "cold-four-bet-responses": [475_201, 16, "7611329b3ebc338d97be4cba500bf62e03ec3d6bb90929834a177c570188abfc"],
    "continuation-responses": [27_736_907, 925, "6f6c8b20cb65ab14bdc70dab34b053dbc5a2de67a000ab4424e712d8ca878aab"],
  };
  assert.deepEqual(Object.fromEntries(Object.entries(index.datasets).map(([name, data]) => [name,
    [data.bytes, data.parts, data.contentHash]])), expected);
  const raw = readFileSync(new URL("../src/multiway-source-index.json", import.meta.url), "utf8").trimEnd();
  assert.equal(digest(raw), "a35848a74fb1b159ae15c055da5e7dac179b89c2840b3f0f4a420d6a2caf83d2");
});

test("published HU-after-multiway policy evaluation uses saved indexed inputs and reports their provenance", async () => {
  const { db, calls, inputs, candidate, documents } = makePublishedPostflopDb();
  const coverage = await listPostflopCoverage(db);
  const publishedSpot = coverage.spots.find(item => item.id === spotId);
  assert.equal(publishedSpot.policyNodeEvaluation.status, "multiway_sources_supported");
  assert.equal(publishedSpot.savedFlopCoverage.status, "no_saved_boards");

  const result = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c" });
  assert.equal(result.lookupMode, "published_flop_policy_evaluation");
  assert.equal(result.calculation.savedBaseUsed, false);
  assert.equal(result.calculation.referenceFallbackUsed, false);
  assert.equal(result.source.policy.contentHash, candidate.metadata.policy_hash);
  assert.deepEqual(Object.keys(result.source.inputDatasets).sort(), Object.keys(selection).sort());
  for (const [name, hash] of Object.entries(result.source.inputDatasets)) assert.equal(hash, index.datasets[name].contentHash);
  const browser = computeBoard({ spotId, board: "As7d2c", datasets: documents, flopCandidate: candidate });
  const projected = browser.nodes["oop_first"].rows.map(row => ({ hand: row.hand,
    preflopSupport: row.reachable, nodeReachable: row.reachWeight > 0, comboCount: row.comboCount,
    frequencies: row.mix, tierWeights: row.tiers, reachWeight: row.reachWeight }));
  assert.equal(result.node, "oop_first");
  assert.deepEqual(result.hands, projected);
  assert.equal(inputs.spot.id, spotId);
  assert.ok(calls.filter(call => call.sql.startsWith("WITH expected(")).length >= 1);
  assert.ok(calls.every(call => /^(?:SELECT|WITH)\b/.test(call.sql)));
});
