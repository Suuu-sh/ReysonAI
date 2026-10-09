import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import sourceIndex from "../src/multiway-source-index.json" with { type: "json" };
import { describeSourcePart } from "../scripts/multiway-source-index-utils.mjs";
import { buildInputs } from "../../frontend/scripts/postflop-ai/browser-inputs.ts";
import { loadCandidate } from "../../frontend/scripts/postflop-ai/generate.mjs";
import { computeBoard } from "../../frontend/src/estimated/postflop-compute.ts";
import { loadPublishedMultiwayPostflopSourceDatasets, publishedMultiwaySourceSelections } from "../src/postflop-multiway-data.ts";
import { evaluatePublishedPostflopPolicy, listPostflopCoverage } from "../src/postflop-data.ts";
import { MAX_POSTFLOP_SOURCE_BYTES, McpDataError } from "../src/data.ts";

const index = sourceIndex;
const descriptors = JSON.parse(readFileSync(new URL("../../frontend/scripts/data/hu-after-multiway-spots.json", import.meta.url), "utf8")).spots;
const fingerprints = JSON.parse(readFileSync(new URL("./fixtures/postflop-multiway-fingerprints.json", import.meta.url), "utf8"));
const fixtureBytes = readFileSync(new URL("./fixtures/postflop-multiway-source-chunks.json.gz", import.meta.url));
const fixture = JSON.parse(gunzipSync(fixtureBytes).toString("utf8"));
const INDEX_SHA256 = "a35848a74fb1b159ae15c055da5e7dac179b89c2840b3f0f4a420d6a2caf83d2";
const SOURCE_ARCHIVE_SHA256 = "b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a";
const FIXTURE_SHA256 = "e35678aa9a631ba72dbc323715f2aef1ca6eb1b8c693acfba8bc57f964c40988";
const FINGERPRINTS_SHA256 = "46d005feb86550e6d23b8661f0e90380af0358a42ebe7bf662417999e151e8ae";
const SPOT = "CO_open_BTN_call_BB_squeeze_CO_fold_BTN_call";
const digest = value => createHash("sha256").update(value).digest("hex");
const expectedError = code => error => error instanceof McpDataError && error.code === code;
const pinnedDatasets = {
  "opening-ranges": [52_886, 2, "9f172583e5ef281655d3bbb9fc264de9b052c0fe82501f75d3f7edf765932b0f"],
  "preflop-ranges": [191_955, 7, "f61186b52005f184872df0d6f4a3ccf4c96b0e91180f9b0b4da4183a448fb114"],
  "multiway-responses": [241_196, 9, "46014bf93140ea3cfd81e2651b56badf6a7f6ef1f785766be9768f94dfe5981d"],
  "squeeze-responses": [745_761, 25, "9207dce4f11e0c4f885ee6d740c93005114021f09a7720d1a662b30bb7dc9f0e"],
  "cold-three-bet-responses": [248_985, 9, "a947c12d276fa2c9c769f9fe71434db73538d55a316292fb0bd1d62a06184b74"],
  "cold-four-bet-responses": [475_201, 16, "7611329b3ebc338d97be4cba500bf62e03ec3d6bb90929834a177c570188abfc"],
  "continuation-responses": [27_736_907, 925, "6f6c8b20cb65ab14bdc70dab34b053dbc5a2de67a000ab4424e712d8ca878aab"],
};

function selectedPartsByDataset() {
  const selected = new Map(Object.keys(index.datasets).map(name => [name, new Set()]));
  for (const [name, ids] of Object.entries(index.spots).flatMap(([spotId, sources]) =>
    Object.entries(sources).map(([dataset, rowIds]) => [dataset, rowIds.map(id => ({ spotId, id }))]))) {
    const target = selected.get(name);
    for (const { spotId, id } of ids) {
      const row = index.datasets[name].rows[id];
      assert.ok(row, spotId + "/" + name + "/" + id + " must be indexed");
      for (const segment of row.parts) target.add(segment.part);
    }
  }
  return selected;
}

const selectedParts = selectedPartsByDataset();

function sourceDatasetsForSpot(spotId) {
  const selections = index.spots[spotId];
  assert.ok(selections, "fixture source selection for " + spotId);
  const output = {};
  for (const [name, ids] of Object.entries(selections)) {
    const dataset = index.datasets[name];
    const fixtureDataset = fixture.datasets[name];
    assert.equal(fixtureDataset.contentHash, dataset.contentHash);
    const spots = [];
    for (const id of ids) {
      const rowIndex = dataset.rows[id];
      assert.ok(rowIndex, "indexed exact row " + name + "/" + id);
      let text = "";
      let nextOffset = rowIndex.start;
      for (const segment of rowIndex.parts) {
        const partStart = segment.part * index.partChars;
        const body = fixtureDataset.parts[String(segment.part)];
        assert.ok(body, "fixture contains exact part " + name + "/" + segment.part);
        assert.equal(body.codeUnits, dataset.chunks[String(segment.part)].codeUnits);
        assert.equal(body.bytes, dataset.chunks[String(segment.part)].bytes);
        assert.equal(body.sha256, dataset.chunks[String(segment.part)].sha256);
        assert.equal(body.body.length, body.codeUnits);
        assert.equal(Buffer.byteLength(body.body, "utf8"), body.bytes);
        assert.equal(digest(Buffer.from(body.body, "utf8")), body.sha256);
        const from = Math.max(0, rowIndex.start - partStart);
        const to = Math.min(index.partChars, rowIndex.end - partStart);
        assert.equal(segment.from, from);
        assert.equal(segment.to, to);
        assert.equal(partStart + segment.from, nextOffset);
        text += body.body.slice(segment.from, segment.to);
        nextOffset += segment.to - segment.from;
      }
      assert.equal(nextOffset, rowIndex.end);
      assert.equal(text.length, rowIndex.codeUnits);
      assert.equal(Buffer.byteLength(text, "utf8"), rowIndex.bytes);
      assert.equal(digest(Buffer.from(text, "utf8")), rowIndex.sha256);
      const value = JSON.parse(text);
      assert.equal(value.id, id);
      assert.ok(Array.isArray(value.hands) && value.hands.length === 169);
      spots.push(value);
    }
    output[name] = { contentHash: dataset.contentHash, spots };
  }
  return output;
}

function createSourceStore() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE preflop_datasets (name TEXT NOT NULL, content_hash TEXT NOT NULL, bytes INTEGER NOT NULL, parts INTEGER NOT NULL)");
  sqlite.exec("CREATE TABLE source_parts (name TEXT NOT NULL, part INTEGER NOT NULL, body)");
  sqlite.exec("CREATE TABLE part_inventory (name TEXT NOT NULL, part INTEGER NOT NULL, bytes INTEGER NOT NULL)");
  sqlite.exec("CREATE VIEW preflop_dataset_parts AS SELECT name, part, body FROM source_parts UNION ALL SELECT name, part, zeroblob(bytes) AS body FROM part_inventory");
  const addDataset = sqlite.prepare("INSERT INTO preflop_datasets (name, content_hash, bytes, parts) VALUES (?, ?, ?, ?)");
  const addSourcePart = sqlite.prepare("INSERT INTO source_parts (name, part, body) VALUES (?, ?, ?)");
  const addInventoryPart = sqlite.prepare("INSERT INTO part_inventory (name, part, bytes) VALUES (?, ?, ?)");
  for (const [name, data] of Object.entries(index.datasets)) {
    addDataset.run(name, data.contentHash, data.bytes, data.parts);
    const selected = selectedParts.get(name);
    let selectedBytes = 0;
    for (const partNo of selected) {
      const part = fixture.datasets[name].parts[String(partNo)];
      assert.ok(part, "selected source part is fixture-pinned: " + name + "/" + partNo);
      addSourcePart.run(name, partNo, part.body);
      selectedBytes += part.bytes;
    }
    let remainingParts = data.parts - selected.size;
    let remainingBytes = data.bytes - selectedBytes;
    assert.ok(remainingParts >= 0 && remainingBytes >= 0, name + " has consistent non-fixture inventory");
    assert.ok(remainingParts === 0 ? remainingBytes === 0 : remainingBytes >= remainingParts,
      name + " has byte and part totals consistent with the indexed fixture");
    for (let partNo = 0; partNo < data.parts; partNo++) {
      if (selected.has(partNo)) continue;
      const bytes = Math.floor(remainingBytes / remainingParts);
      assert.ok(bytes > 0);
      addInventoryPart.run(name, partNo, bytes);
      remainingParts--;
      remainingBytes -= bytes;
    }
    assert.equal(remainingParts, 0);
    assert.equal(remainingBytes, 0);
  }
  return { sqlite, close: () => sqlite.close() };
}

function makeSqliteD1(sqlite) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      assert.match(sql, /^WITH expected\(/);
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
      return { bind(...args) { return { async all() {
        calls.push({ sql, args });
        return { results: sqlite.prepare(sql).all(...args) };
      } }; } };
    },
  };
}

function firstRequestedPart(call, spotId = SPOT) {
  const datasetCount = Object.keys(index.spots[spotId]).length;
  const offset = datasetCount * 4;
  return { name: call.args[offset], part: call.args[offset + 1], bytes: call.args[offset + 2] };
}

function makeSpotRow(inputs) {
  const spot = inputs.spot;
  return { spot_id: spot.id, slug: spot.slug, kind: spot.kind, tree: spot.tree, ip: spot.ip, oop: spot.oop,
    pot_bb: spot.potBb, stack_bb: spot.stackBb, spot_json: JSON.stringify(spot) };
}

function makePublishedD1(sqlite, sources) {
  const candidates = {};
  const inputsBySpot = {};
  const spots = {};
  const policyDocuments = {};
  const policyHashes = {};
  for (const spotId of Object.keys(index.spots).sort()) {
    const datasets = sourceDatasetsForSpot(spotId);
    const inputs = buildInputs(spotId, datasets);
    assert.equal(inputs.fingerprint, fingerprints.fingerprints[spotId], "pinned Web fingerprint for " + spotId);
    const candidate = loadCandidate(inputs);
    assert.equal(candidate.metadata.source_hash, inputs.fingerprint, "published policy source hash for " + spotId);
    candidates[spotId] = candidate;
    inputsBySpot[spotId] = inputs;
    spots[spotId] = makeSpotRow(inputs);
    const hashes = { flop: candidate.metadata.policy_hash, later: null };
    policyHashes[spotId] = hashes;
    policyDocuments[spotId] = {
      summary: { spot_id: spotId, stage: "flop", policy_hash: hashes.flop },
      document: { spot_id: spotId, stage: "flop", policy_hash: hashes.flop,
        metadata_json: JSON.stringify(candidate.metadata), policy_json: JSON.stringify(candidate) },
    };
  }
  const release = { name: "postflop", content_hash: digest(JSON.stringify(policyHashes)),
    published_at: "2026-10-09T00:00:00.000Z", detail_json: JSON.stringify({ spots: policyHashes }) };
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      assert.match(sql, /^(?:SELECT|WITH)\b/);
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
      if (sql.startsWith("WITH expected(")) {
        return { bind(...args) { return { async all() {
          calls.push({ sql, args });
          return { results: sqlite.prepare(sql).all(...args) };
        } }; } };
      }
      return { bind(...args) { return { async all() {
        calls.push({ sql, args });
        if (sql.includes("FROM dataset_versions")) {
          if (sql.includes("name IN")) return { results: [release] };
          return { results: args[0] === "postflop" ? [release] : [] };
        }
        if (sql.includes("FROM postflop_spots")) {
          if (sql.includes("WHERE spot_id = ?")) return { results: spots[args[0]] ? [spots[args[0]]] : [] };
          return { results: Object.values(spots) };
        }
        if (sql.includes("FROM postflop_policies")) {
          if (sql.includes("metadata_json, policy_json")) {
            const row = policyDocuments[args[0]]?.document;
            return { results: row && row.stage === args[1] ? [row] : [] };
          }
          if (sql.includes("WHERE spot_id = ?")) {
            const row = policyDocuments[args[0]]?.summary;
            return { results: row ? [row] : [] };
          }
          return { results: Object.values(policyDocuments).map(item => item.summary) };
        }
        if (sql.includes("FROM postflop_flop_base_br")) return { results: [] };
        throw new Error("Unexpected published-data query: " + sql);
      } }; } };
    },
  };
  return { db, candidates, inputsBySpot, release };
}

test("the reviewed index and compact CI fixture pin all current source metadata without parsing source JSON files", () => {
  assert.equal(descriptors.length, 40);
  assert.equal(index.partChars, 30_000);
  assert.equal(Object.keys(index.spots).length, 40);
  const expectedSelections = {};
  for (const spot of descriptors) {
    const grouped = new Map();
    for (const factors of Object.values(spot.ranges)) for (const [name, id] of factors) {
      const ids = grouped.get(name) ?? new Set();
      ids.add(id);
      grouped.set(name, ids);
    }
    expectedSelections[spot.id] = Object.fromEntries([...grouped].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, ids]) => [name, [...ids].sort()]));
    assert.deepEqual(publishedMultiwaySourceSelections(spot.id), expectedSelections[spot.id]);
  }
  assert.deepEqual(index.spots, expectedSelections);
  assert.equal(Object.values(index.datasets).reduce((sum, data) => sum + Object.keys(data.rows).length, 0), 100);
  assert.deepEqual(Object.fromEntries(Object.entries(index.datasets).map(([name, data]) =>
    [name, [data.bytes, data.parts, data.contentHash]])), pinnedDatasets);
  assert.equal(digest(readFileSync(new URL("../src/multiway-source-index.json", import.meta.url), "utf8").trimEnd()), INDEX_SHA256);
  assert.equal(digest(fixtureBytes), FIXTURE_SHA256);
  assert.equal(digest(readFileSync(new URL("./fixtures/postflop-multiway-fingerprints.json", import.meta.url))), FINGERPRINTS_SHA256);
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.sourceArchiveSha256, SOURCE_ARCHIVE_SHA256);
  assert.equal(fixture.indexSha256, INDEX_SHA256);
  assert.equal(fingerprints.sourceArchiveSha256, SOURCE_ARCHIVE_SHA256);
  assert.equal(fingerprints.indexSha256, INDEX_SHA256);
  assert.equal(Object.keys(fingerprints.fingerprints).length, 40);
  assert.equal(Object.keys(fixture.datasets).length, 7);
  assert.equal(Object.values(fixture.datasets).reduce((sum, data) => sum + Object.keys(data.parts).length, 0), 69);
  assert.equal(Object.values(fixture.datasets).flatMap(data => Object.values(data.parts))
    .reduce((sum, part) => sum + part.bytes, 0), 2_038_891);
  for (const name of ["continuation-responses", "cold-three-bet-responses", "cold-four-bet-responses"]) {
    assert.ok(Object.values(index.spots).some(sources => sources[name]?.length), name + " is covered by reviewed postflop sources");
  }
  assert.ok(Object.values(index.datasets).every(dataset =>
    Object.values(dataset.chunks).every(part => part.splitSurrogateAtEnd === false)));
});

test("all 40 published spots read exact SQLite-published source rows and match Web fingerprints and policy output", async () => {
  const store = createSourceStore();
  try {
    const published = makePublishedD1(store.sqlite);
    const coverage = await listPostflopCoverage(published.db, { limit: 50 });
    assert.equal(coverage.publicationStatus, "published");
    assert.equal(coverage.total, 40);
    assert.equal(coverage.spots.length, 40);
    assert.ok(coverage.spots.every(spot => spot.policyNodeEvaluation.status === "multiway_sources_supported"));
    assert.ok(coverage.spots.every(spot => spot.savedFlopCoverage.status === "no_saved_boards"
      && spot.savedFlopCoverage.lookupSupported === false));

    const sourceDb = makeSqliteD1(store.sqlite);
    for (const spotId of Object.keys(index.spots).sort()) {
      const expectedDatasets = sourceDatasetsForSpot(spotId);
      const actualDatasets = await loadPublishedMultiwayPostflopSourceDatasets(sourceDb, spotId);
      assert.deepEqual(actualDatasets, expectedDatasets, "SQLite loader returns exact saved rows for " + spotId);
      const inputs = buildInputs(spotId, actualDatasets);
      assert.equal(inputs.fingerprint, fingerprints.fingerprints[spotId], "SQLite source → Web fingerprint for " + spotId);
      const candidate = published.candidates[spotId];
      assert.equal(candidate.metadata.source_hash, inputs.fingerprint);
      const result = await evaluatePublishedPostflopPolicy(published.db, { spotId, flop: "As7d2c" });
      assert.equal(result.lookupMode, "published_flop_policy_evaluation");
      assert.equal(result.source.policy.inputHash, fingerprints.fingerprints[spotId]);
      assert.equal(result.calculation.savedBaseUsed, false);
      assert.equal(result.calculation.referenceFallbackUsed, false);
      assert.deepEqual(result.source.inputDatasets,
        Object.fromEntries(Object.keys(index.spots[spotId]).sort().map(name => [name, index.datasets[name].contentHash])));
      const browser = computeBoard({ spotId, board: "As7d2c", datasets: expectedDatasets, flopCandidate: candidate });
      const node = browser.nodes[result.node];
      assert.ok(node, "Web has the exact evaluated node for " + spotId);
      const projected = node.rows.map(row => ({ hand: row.hand, preflopSupport: row.reachable,
        nodeReachable: row.reachWeight > 0, comboCount: row.comboCount, frequencies: row.mix,
        tierWeights: row.tiers, reachWeight: row.reachWeight }));
      assert.deepEqual(result.hands, projected, "MCP and Web published-policy parity for " + spotId);
    }
    assert.equal(sourceDb.calls.length, 40, "each supported spot uses one D1 statement snapshot");
  } finally {
    store.close();
  }
});

test("unknown IDs, absent storage, and unpublished source releases fail closed", async () => {
  assert.equal(publishedMultiwaySourceSelections("invented_spot"), null);
  await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(undefined, SPOT), expectedError("data_unavailable"));
  const store = createSourceStore();
  try {
    const d1 = makeSqliteD1(store.sqlite);
    const callPromise = loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT);
    await callPromise;
    store.sqlite.exec("DELETE FROM preflop_datasets");
    const call = d1.calls.at(-1);
    const rows = store.sqlite.prepare(call.sql).all(...call.args);
    assert.ok(rows.every(row => row.actual_hash === null && row.body === null),
      "the query masks all payloads when the expected dataset release is absent");
    await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT), expectedError("not_found"));
    assert.equal(d1.calls.length, 2);
  } finally {
    store.close();
  }
});

test("SQLite body CASE masks oversized, stale, partial, and switched releases before returning payload text", async () => {
  const scenarios = ["oversized", "metadata_mismatch", "partial_publish", "atomic_switch"];
  for (const scenario of scenarios) {
    const store = createSourceStore();
    try {
      const d1 = makeSqliteD1(store.sqlite);
      await loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT);
      const call = d1.calls[0];
      const requested = firstRequestedPart(call);
      const sourcePart = store.sqlite.prepare("SELECT body FROM source_parts WHERE name = ? AND part = ?").get(requested.name, requested.part);
      assert.ok(sourcePart && typeof sourcePart.body === "string");
      if (scenario === "oversized") {
        store.sqlite.prepare("UPDATE source_parts SET body = zeroblob(?) WHERE name = ? AND part = ?")
          .run(2_000_001, requested.name, requested.part);
      } else if (scenario === "metadata_mismatch") {
        store.sqlite.prepare("UPDATE preflop_datasets SET content_hash = ? WHERE name = ?")
          .run("0".repeat(64), requested.name);
      } else if (scenario === "partial_publish") {
        store.sqlite.prepare("DELETE FROM source_parts WHERE name = ? AND part = ?").run(requested.name, requested.part);
      } else {
        const replacement = sourcePart.body.startsWith("[") ? "{" + sourcePart.body.slice(1) : "[" + sourcePart.body.slice(1);
        assert.equal(Buffer.byteLength(replacement, "utf8"), Buffer.byteLength(sourcePart.body, "utf8"));
        store.sqlite.exec("BEGIN");
        store.sqlite.prepare("UPDATE preflop_datasets SET content_hash = ? WHERE name = ?").run("1".repeat(64), requested.name);
        store.sqlite.prepare("UPDATE source_parts SET body = ? WHERE name = ? AND part = ?").run(replacement, requested.name, requested.part);
        store.sqlite.exec("COMMIT");
      }
      const rows = store.sqlite.prepare(call.sql).all(...call.args);
      const affected = rows.filter(row => row.name === requested.name);
      assert.ok(affected.length > 0);
      assert.ok(affected.every(row => row.body === null), scenario + " returns no payload for the affected dataset");
      if (scenario === "oversized") {
        const oversized = affected.find(row => row.requested_part === requested.part);
        assert.equal(oversized.actual_part_bytes, 2_000_001);
        assert.equal(oversized.body, null, "the oversized body is masked inside SQL, before Worker memory receives it");
      }
      if (scenario === "partial_publish") {
        const missing = affected.find(row => row.requested_part === requested.part);
        assert.equal(missing.actual_part, null);
        assert.equal(missing.body, null);
      }
      await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT),
        expectedError(scenario === "oversized" || scenario === "metadata_mismatch" || scenario === "partial_publish" || scenario === "atomic_switch"
          ? "data_unavailable" : "invalid_saved_data"));
    } finally {
      store.close();
    }
  }
});

test("SQLite duplicate rows and same-byte Unicode corruption are rejected", async () => {
  {
    const store = createSourceStore();
    try {
      const d1 = makeSqliteD1(store.sqlite);
      await loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT);
      const call = d1.calls[0];
      const requested = firstRequestedPart(call);
      const body = store.sqlite.prepare("SELECT body FROM source_parts WHERE name = ? AND part = ?").get(requested.name, requested.part).body;
      store.sqlite.prepare("INSERT INTO source_parts (name, part, body) VALUES (?, ?, ?)").run(requested.name, requested.part, body);
      const rows = store.sqlite.prepare(call.sql).all(...call.args);
      const duplicates = rows.filter(row => row.name === requested.name && row.requested_part === requested.part);
      assert.equal(duplicates.length, 2);
      assert.ok(duplicates.every(row => row.body === null), "duplicate publication stats hide both copies");
      await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT), expectedError("invalid_saved_data"));
    } finally {
      store.close();
    }
  }
  {
    const store = createSourceStore();
    try {
      const d1 = makeSqliteD1(store.sqlite);
      await loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT);
      const call = d1.calls[0];
      const requested = firstRequestedPart(call);
      const original = store.sqlite.prepare("SELECT body FROM source_parts WHERE name = ? AND part = ?").get(requested.name, requested.part).body;
      const match = original.match(/[A-Za-z0-9]{4}/);
      assert.ok(match, "selected JSON source contains a four-byte ASCII run for Unicode-boundary validation");
      const replacement = original.replace(match[0], "😀");
      assert.equal(Buffer.byteLength(replacement, "utf8"), requested.bytes,
        "emoji contributes four UTF-8 bytes while occupying two UTF-16 code units");
      store.sqlite.prepare("UPDATE source_parts SET body = ? WHERE name = ? AND part = ?").run(replacement, requested.name, requested.part);
      const rows = store.sqlite.prepare(call.sql).all(...call.args);
      const row = rows.find(value => value.name === requested.name && value.requested_part === requested.part);
      assert.equal(row.actual_part_bytes, requested.bytes);
      assert.equal(Buffer.byteLength(row.body, "utf8"), requested.bytes);
      assert.equal(row.body.length, index.datasets[requested.name].chunks[String(requested.part)].codeUnits - 2);
      await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(d1, SPOT), expectedError("invalid_saved_data"));
    } finally {
      store.close();
    }
  }
});

test("the indexed selected-byte budget rejects before preparing a D1 query", async () => {
  const [name, ids] = Object.entries(index.spots[SPOT])[0];
  const part = index.datasets[name].rows[ids[0]].parts[0].part;
  const chunk = index.datasets[name].chunks[String(part)];
  const originalBytes = chunk.bytes;
  let reads = 0;
  const forbiddenDb = { prepare() { reads++; throw new Error("D1 must not be queried over the static read budget"); } };
  try {
    chunk.bytes = MAX_POSTFLOP_SOURCE_BYTES + 1;
    await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(forbiddenDb, SPOT), expectedError("data_unavailable"));
    assert.equal(reads, 0);
  } finally {
    chunk.bytes = originalBytes;
  }
});

test("UTF-16 code-unit and UTF-8 byte metadata are distinct, and split-surrogate indexes fail before D1 reads", async () => {
  const wholeEmoji = "a".repeat(29_998) + "😀" + "z";
  const wholePart = describeSourcePart(wholeEmoji, 0, 30_000);
  assert.equal(wholePart.body.length, 30_000);
  assert.equal(wholePart.metadata.codeUnits, 30_000);
  assert.equal(wholePart.metadata.bytes, 30_002);
  assert.equal(wholePart.metadata.splitSurrogateAtEnd, false);
  const splitEmoji = "a".repeat(29_999) + "😀" + "z";
  const first = describeSourcePart(splitEmoji, 0, 30_000);
  const second = describeSourcePart(splitEmoji, 30_000, 30_000);
  assert.equal(first.metadata.codeUnits, 30_000);
  assert.equal(first.metadata.bytes, 30_002);
  assert.equal(first.metadata.splitSurrogateAtEnd, true);
  assert.equal(second.body.length, 2);
  assert.equal(second.metadata.bytes, 4);

  const [name, ids] = Object.entries(index.spots[SPOT])[0];
  const part = index.datasets[name].rows[ids[0]].parts[0].part;
  const metadata = index.datasets[name].chunks[String(part)];
  const original = metadata.splitSurrogateAtEnd;
  try {
    metadata.splitSurrogateAtEnd = true;
    let reads = 0;
    const forbiddenDb = { prepare() { reads++; throw new Error("D1 must not be queried for a split-surrogate index"); } };
    await assert.rejects(loadPublishedMultiwayPostflopSourceDatasets(forbiddenDb, SPOT), expectedError("invalid_saved_data"));
    assert.equal(reads, 0);
  } finally {
    metadata.splitSurrogateAtEnd = original;
  }
});
