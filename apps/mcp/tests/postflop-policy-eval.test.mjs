import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadInputs } from "../../frontend/scripts/postflop-ai/inputs.mjs";
import { loadCandidate } from "../../frontend/scripts/postflop-ai/generate.mjs";
import { buildSql as buildPostflopPublicationSql } from "../../frontend/scripts/postflop-ai/publish-d1.mjs";
import { canonicalFlop } from "../../frontend/scripts/postflop-ai/flop-isomorphism.ts";
import { computeBoard } from "../../frontend/src/estimated/postflop-compute.ts";
import { flopRunouts, rankTable, rankTableCacheState } from "../src/postflop-defence.mts";
import opening from "../../frontend/src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../../frontend/src/estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../../frontend/src/estimated/three-bet-responses.json" with { type: "json" };
import fourBets from "../../frontend/src/estimated/four-bet-responses.json" with { type: "json" };
import limpResponses from "../../frontend/src/estimated/limp-responses.json" with { type: "json" };
import limpDeepResponses from "../../frontend/src/estimated/limp-deep-responses.json" with { type: "json" };
import { evaluatePublishedPostflopPolicy, listPostflopCoverage } from "../src/postflop-data.ts";
import { MCP_DEFENCE_ADAPTER_VERSION, MCP_DEFENCE_BASE_SOURCE_SHA256, projectPolicyRows } from "../src/postflop-shared.mjs";
import { MAX_POSTFLOP_SOURCE_BYTES, McpDataError } from "../src/data.ts";

const digest = value => createHash("sha256").update(value).digest("hex");
const spotId = "BTN_open_BB_call";
const timestamp = "2026-10-09T00:00:00.000Z";
const sourceFiles = {
  "opening-ranges": opening,
  "preflop-ranges": responses,
};
const familySourceFiles = { ...sourceFiles, "three-bet-responses": threeBets,
  "four-bet-responses": fourBets, "limp-responses": limpResponses, "limp-deep-responses": limpDeepResponses };
const browserDatasets = { opening, responses, threeBets, fourBets, limpResponses, limpDeepResponses };
const inputs = loadInputs(spotId);
const publishedCandidate = loadCandidate(inputs);
const projectRows = rows => rows.map(row => ({ hand: row.hand, preflopSupport: row.reachable,
  nodeReachable: row.reachWeight > 0, comboCount: row.comboCount, frequencies: row.mix,
  tierWeights: row.tiers, reachWeight: row.reachWeight }));

function makeFixture({ candidate = publishedCandidate, missingSource = null, corruptSourceHash = false,
  spotData = inputs.spot, fixtureSpotId = spotId, sourceFiles: fixtureSources = sourceFiles,
  sourceByteOverrides = {}, sourcePaddingChars = {}, beforeQuery = null, postflopRelease = null, extraPublishedSpots = [] } = {}) {
  const releaseIndex = { [fixtureSpotId]: { flop: candidate.metadata.policy_hash, later: null } };
  const release = { name: "postflop", content_hash: digest(JSON.stringify(releaseIndex)), published_at: timestamp,
    detail_json: JSON.stringify({ spots: releaseIndex }) };
  const versions = [postflopRelease ?? release];
  const spots = [{ spot_id: fixtureSpotId, slug: spotData.slug, kind: spotData.kind, tree: spotData.tree,
    ip: spotData.ip, oop: spotData.oop, pot_bb: spotData.potBb, stack_bb: spotData.stackBb,
    spot_json: JSON.stringify(spotData) }];
  const policyRows = [{ spot_id: fixtureSpotId, stage: "flop", policy_hash: candidate.metadata.policy_hash,
    metadata_json: JSON.stringify(candidate.metadata), policy_json: JSON.stringify(candidate.policy ? candidate : { ...candidate, policy: publishedCandidate.policy }) }];
  // `candidate` is an artifact envelope; retain its exact policy object in the serialized D1 row.
  policyRows[0].policy_json = JSON.stringify(candidate);
  for (const extra of extraPublishedSpots) {
    const extraSpot = extra.inputs.spot, extraCandidate = extra.candidate;
    spots.push({ spot_id: extraSpot.id, slug: extraSpot.slug, kind: extraSpot.kind, tree: extraSpot.tree,
      ip: extraSpot.ip, oop: extraSpot.oop, pot_bb: extraSpot.potBb, stack_bb: extraSpot.stackBb,
      spot_json: JSON.stringify(extraSpot) });
    policyRows.push({ spot_id: extraSpot.id, stage: "flop", policy_hash: extraCandidate.metadata.policy_hash,
      metadata_json: JSON.stringify(extraCandidate.metadata), policy_json: JSON.stringify(extraCandidate) });
  }
  const datasets = new Map();
  for (const [name, value] of Object.entries(fixtureSources)) {
    if (name === missingSource) continue;
    const text = JSON.stringify(value) + " ".repeat(sourcePaddingChars[name] ?? 0), hash = digest(text), body = corruptSourceHash && name === "preflop-ranges" ? "0".repeat(64) : hash;
    const parts = [];
    for (let offset = 0, part = 0; offset < text.length; offset += 28_000, part++) {
      parts.push({ name, part, body: text.slice(offset, offset + 28_000) });
    }
    datasets.set(name, { metadata: { name, content_hash: body, bytes: sourceByteOverrides[name] ?? new TextEncoder().encode(text).length, parts: parts.length }, parts });
  }
  const calls = [];
  const db = { prepare(sql) {
    assert.match(sql, /^SELECT /, "policy evaluation must remain read-only");
    return { bind(...args) { return { async all() {
      calls.push({ sql, args });
      await beforeQuery?.(sql, args);
      if (sql.includes("FROM dataset_versions")) return { results: versions.filter(row => args.includes(row.name)) };
      if (sql.includes("FROM postflop_spots")) {
        const rows = sql.includes("WHERE spot_id = ?") ? spots.filter(row => row.spot_id === args[0])
          : spots.slice().sort((a, b) => a.spot_id.localeCompare(b.spot_id));
        return { results: rows.slice(0, sql.includes("WHERE spot_id = ?") ? 2 : args[0]) };
      }
      if (sql.includes("FROM postflop_policies")) {
        const rows = sql.includes("WHERE spot_id = ? AND stage = ?")
          ? policyRows.filter(row => row.spot_id === args[0] && row.stage === args[1])
          : sql.includes("WHERE spot_id = ?") ? policyRows.filter(row => row.spot_id === args[0])
            : policyRows.slice().sort((a, b) => a.spot_id.localeCompare(b.spot_id) || a.stage.localeCompare(b.stage)).slice(0, args[0]);
        return { results: rows.slice(0, sql.includes("WHERE spot_id = ?") ? 3 : args[0]) };
      }
      if (sql.includes("FROM postflop_flop_base_br")) return { results: [] };
      if (sql.includes("FROM preflop_datasets")) {
        const rows = [...datasets.values()].map(item => item.metadata).filter(row => args.includes(row.name));
        return { results: rows.slice(0, args.length) };
      }
      if (sql.includes("SUM(length(CAST(body AS BLOB)))")) {
        return { results: [...datasets].filter(([name]) => args.includes(name)).map(([name, item]) => ({ name,
          parts: item.parts.length, bytes: item.parts.reduce((sum, part) => sum + new TextEncoder().encode(part.body).length, 0) })) };
      }
      if (sql.includes("FROM preflop_dataset_parts")) {
        const selected = datasets.get(args[0]);
        return { results: selected?.parts.slice(0, 161) ?? [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    } }; } };
  } };
  return { db, calls, versions, spots, policyRows };
}

function versionFromPublisherSql(sql) {
  const statement = sql.split("\n").find(line => line.startsWith("INSERT INTO dataset_versions "));
  const match = statement?.match(/VALUES \('postflop', '([0-9a-f]{64})', '([^']+)', '((?:''|[^'])*)'\);/);
  assert.ok(match, "publisher emits one parseable postflop version row");
  return { name: "postflop", content_hash: match[1], published_at: match[2], detail_json: match[3].replaceAll("''", "'") };
}

const hasCode = expected => error => error instanceof McpDataError && error.code === expected;

test("policy coverage discloses bounded head-up node evaluation separately from saved bases", async () => {
  const { db } = makeFixture();
  const coverage = await listPostflopCoverage(db);
  assert.deepEqual(coverage.spots[0].policyNodeEvaluation, {
    status: "head_up_sources_supported", street: "flop", maxHandClasses: 169,
    requirement: "exact published spot, three-card flop, legal action history, and complete saved policy rules for the path",
  });
  assert.equal(coverage.spots[0].savedFlopCoverage.status, "no_saved_boards");
});

test("natural-language flop example evaluates a published policy with no saved base and exact action history", async () => {
  const { db } = makeFixture();
  const coverage = await listPostflopCoverage(db, { limit: 50 });
  const match = coverage.spots.find(item => item.id === spotId);
  assert.ok(match, "coverage discovery resolves the actual published spot");
  assert.equal(match.policyNodeEvaluation.status, "head_up_sources_supported");
  assert.equal(match.savedFlopCoverage.status, "no_saved_boards");
  assert.equal(match.savedFlopCoverage.lookupSupported, false);

  const firstDecision = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "2c9s5h", history: [] });
  assert.equal(firstDecision.node, "btn_first", "oop_checks already accounts for BB's opening check");
  assert.equal(firstDecision.actingSeat, "BTN");
  assert.equal(firstDecision.calculation.savedBaseUsed, false);
  assert.equal(firstDecision.calculation.referenceFallbackUsed, false);
  const aa = firstDecision.hands.find(row => row.hand === "AA");
  assert.ok(aa?.nodeReachable);
  assert.deepEqual(aa.frequencies, { check: 0.3, bet33: 0.35, bet75: 0.3, bet125: 0.05 });

  const bbFacing = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "2c9s5h", history: ["bet33"] });
  assert.equal(bbFacing.node, "bb_vs_33");
  assert.equal(bbFacing.actingSeat, "BB");
  await assert.rejects(evaluatePublishedPostflopPolicy(db, { spotId, flop: "2c9s5h", history: ["check"] }), hasCode("not_found"),
    "adding a second check ends the oop_checks line instead of reaching BTN's first decision");
  await assert.rejects(evaluatePublishedPostflopPolicy(db, { spotId, flop: "2c9s5h", history: ["bet40"] }), hasCode("invalid_argument"),
    "an unsupported bet size is rejected rather than rounded to bet33");
});

test("current publisher spot-upsert metadata reads a complete catalog and rejects partial or inconsistent revisions", async () => {
  const publicationRevision = "local-new-hu-verification";
  const touchedSpotId = "UTG_open_SB_3bet_call";
  const touchedInputs = loadInputs(touchedSpotId);
  const touchedCandidate = loadCandidate(touchedInputs);
  const extraPublishedSpots = [{ inputs: touchedInputs, candidate: touchedCandidate }];
  const published = [
    { spot: inputs.spot, candidate: publishedCandidate, laterCandidate: null, report: {} },
    { spot: touchedInputs.spot, candidate: touchedCandidate, laterCandidate: null, report: {} },
  ];
  const fullRelease = versionFromPublisherSql(buildPostflopPublicationSql(published, timestamp, publicationRevision));
  const detail = JSON.parse(fullRelease.detail_json);
  assert.deepEqual(Object.keys(detail).sort(), ["mode", "publication_revision", "touched_spots"]);
  assert.equal(detail.mode, "spot-upsert");
  assert.equal(detail.publication_revision, publicationRevision);
  assert.deepEqual(Object.keys(detail.touched_spots).sort(), [spotId, touchedSpotId].sort());
  assert.equal(fullRelease.content_hash, digest(JSON.stringify({ publicationRevision, publishedAt: timestamp,
    hashes: detail.touched_spots })), "content hash uses the current publisher's revision + timestamp + touched hashes formula");
  assert.notEqual(fullRelease.content_hash, digest(JSON.stringify(detail.touched_spots)),
    "new-format releases are not mistaken for the legacy hash formula");

  const current = makeFixture({ postflopRelease: fullRelease, extraPublishedSpots });
  current.policyRows.splice(0, current.policyRows.length, ...current.policyRows.filter(row => row.stage === "flop"));
  const coverage = await listPostflopCoverage(current.db, { limit: 50 });
  assert.equal(coverage.total, 2);
  assert.deepEqual(coverage.spots.map(row => row.id).sort(), [spotId, touchedSpotId].sort());
  const untouchedSpot = await evaluatePublishedPostflopPolicy(current.db, { spotId, flop: "As7d2c" });
  assert.equal(untouchedSpot.node, "btn_first", "the complete touched set includes every current catalog row");

  const legacyHashTampered = makeFixture();
  legacyHashTampered.versions[0].content_hash = "0".repeat(64);
  await assert.rejects(listPostflopCoverage(legacyHashTampered.db), hasCode("invalid_saved_data"),
    "the legacy complete-index hash formula remains verified");

  const partialRelease = versionFromPublisherSql(buildPostflopPublicationSql([
    { spot: touchedInputs.spot, candidate: touchedCandidate, laterCandidate: null, report: {} },
  ], timestamp, publicationRevision));
  const partial = makeFixture({ postflopRelease: partialRelease, extraPublishedSpots });
  partial.policyRows.splice(0, partial.policyRows.length, ...partial.policyRows.filter(row => row.stage === "flop"));
  await assert.rejects(listPostflopCoverage(partial.db), hasCode("invalid_saved_data"),
    "spot-upsert deltas are rejected until partial-catalog preservation is explicitly supported");
  await assert.rejects(evaluatePublishedPostflopPolicy(partial.db, { spotId, flop: "As7d2c" }), hasCode("invalid_saved_data"),
    "one touched spot cannot bypass the full-catalog guard");

  const tamperedHash = makeFixture({ postflopRelease: { ...fullRelease, content_hash: "0".repeat(64) }, extraPublishedSpots });
  await assert.rejects(listPostflopCoverage(tamperedHash.db), hasCode("invalid_saved_data"));

  const missingTouchedRow = makeFixture({ postflopRelease: fullRelease });
  await assert.rejects(listPostflopCoverage(missingTouchedRow.db), hasCode("invalid_saved_data"),
    "metadata cannot name a touched spot missing from the current D1 tables");

  const extraDetail = JSON.parse(fullRelease.detail_json);
  extraDetail.touched_spots.unpublished_spot = { flop: "a".repeat(64), later: null };
  const extraHash = digest(JSON.stringify({ publicationRevision, publishedAt: timestamp, hashes: extraDetail.touched_spots }));
  const extraMetadata = makeFixture({ postflopRelease: { ...fullRelease, content_hash: extraHash,
    detail_json: JSON.stringify(extraDetail) }, extraPublishedSpots });
  await assert.rejects(listPostflopCoverage(extraMetadata.db), hasCode("invalid_saved_data"),
    "a correctly rehashed but unpublished metadata entry still fails catalog comparison");

  const intermediate = makeFixture({ postflopRelease: fullRelease, extraPublishedSpots });
  intermediate.policyRows.splice(0, intermediate.policyRows.length, ...intermediate.policyRows.filter(row => row.stage === "flop"));
  intermediate.policyRows.find(row => row.spot_id === touchedSpotId).policy_hash = "f".repeat(64);
  await assert.rejects(listPostflopCoverage(intermediate.db), hasCode("invalid_saved_data"),
    "a publication revision that lands before matching policy rows is rejected");
});

test("one-node evaluation matches the frontend projection and is deterministic without exposing combos", async () => {
  const { db, calls } = makeFixture();
  assert.equal(rankTableCacheState().limit, 600, "MCP uses its fixed bounded adapter cache");
  const first = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c" });
  const repeated = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c" });
  assert.deepEqual(first, repeated);
  assert.equal(first.lookupMode, "published_flop_policy_evaluation");
  assert.equal(first.canonicalFlop, canonicalFlop("As7d2c").key);
  assert.equal(first.node, "btn_first");
  assert.equal(first.actingSeat, "BTN");
  assert.equal(first.calculation.savedBaseUsed, false);
  assert.equal(first.calculation.referenceFallbackUsed, false);
  assert.equal(first.calculation.defenceAdjustmentApplied, true);
  assert.equal(first.calculation.evaluatorVersion, 2);
  assert.equal(first.calculation.defenceVersion, 7);
  assert.equal(first.calculation.adapterVersion, MCP_DEFENCE_ADAPTER_VERSION);
  assert.equal(first.calculation.adapterVersion, "mcp-postflop-defence-v1");
  assert.equal(first.calculation.baseSourceSha256, MCP_DEFENCE_BASE_SOURCE_SHA256);
  assert.equal(first.calculation.baseSourceSha256, "6b76dbbfb541c1de35d3355aad313db83623a81b9bcc33a8d37b637611f14ad0");
  assert.equal(first.frequencyBasis, "preflop_range_weighted_projection");
  assert.equal(first.handClassCount, 169);
  assert.equal(first.hands.length, 169);
  assert.equal(rankTableCacheState().limit, 600, "MCP cache budget is fixed and request-independent");
  assert.ok(rankTableCacheState().size <= 600, "MCP leaves no more than its fixed rank cache budget");
  assert.ok(first.hands.every(row => !("combos" in row)));
  assert.equal(flopRunouts(canonicalFlop("As7d2c").cards).tables, null,
    "MCP evaluation releases large shared runout tables after completing the projection");
  const browser = computeBoard({ spotId, board: "As7d2c", datasets: { opening, responses, threeBets },
    flopCandidate: publishedCandidate }).nodes;
  assert.deepEqual(first.hands, projectRows(browser.btn_first.rows));
  assert.equal(first.source.policy.contentHash, publishedCandidate.metadata.policy_hash);
  assert.deepEqual(Object.keys(first.source.inputDatasets).sort(), Object.keys(sourceFiles).sort());
  assert.ok(new TextEncoder().encode(JSON.stringify(first)).length < 80_000, "one-node response stays within the MCP response cap");
  assert.ok(calls.length > 0 && calls.every(call => /^SELECT /.test(call.sql)));

  const facing = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c", history: ["bet33"] });
  assert.equal(facing.node, "bb_vs_33");
  assert.equal(facing.actingSeat, "BB");
  assert.deepEqual(facing.hands, projectRows(browser.bb_vs_33.rows));

  const raised = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c", history: ["bet33", "raise"] });
  assert.equal(raised.node, "btn_vs_raise");
  assert.equal(raised.actingSeat, "BTN");
  assert.deepEqual(raised.hands, projectRows(browser.btn_vs_raise.rows));

  const deep = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c",
    history: ["bet33", "raise", "raise", "raise"] });
  assert.equal(deep.node, "btn_vs_raise3");
  assert.deepEqual(deep.hands, projectRows(browser.btn_vs_raise3.rows));

});

test("zero-path-reach rows are not represented as reachable-node recommendations", () => {
  const [row] = projectPolicyRows([{ hand: "KK", reachable: true, comboCount: 6,
    mix: { fold: 0.97, call: 0.03, raise: 0 }, tiers: { monster: 1 }, combos: [], reachWeight: 0 }]);
  assert.equal(row.preflopSupport, true);
  assert.equal(row.nodeReachable, false);
  assert.equal(row.reachWeight, 0);
  assert.ok(!("reachable" in row));
  assert.deepEqual(row.frequencies, { fold: 0.97, call: 0.03, raise: 0 });
});

test("MCP rank-table cache stays within its fixed adapter budget", () => {
  assert.equal(rankTableCacheState().limit, 600);
  const boards = [];
  for (let a = 0; a < 52 && boards.length < 601; a++) {
    for (let b = a + 1; b < 52 && boards.length < 601; b++) {
      for (let c = b + 1; c < 52 && boards.length < 601; c++) boards.push([a, b, c]);
    }
  }
  assert.equal(boards.length, 601);
  for (const board of boards) rankTable(board);
  assert.equal(rankTableCacheState().limit, 600);
  assert.ok(rankTableCacheState().size <= 600);
});

test("policy source bytes are aggregated and capped before any large source rows are read", async () => {
  const { db, calls } = makeFixture({ sourceByteOverrides: {
    "opening-ranges": 1_100_000,
    "preflop-ranges": 1_100_000,
  } });
  await assert.rejects(evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c" }), hasCode("data_unavailable"));
  assert.ok(calls.some(call => call.sql.includes("FROM preflop_datasets")));
  assert.ok(!calls.some(call => call.sql.includes("FROM preflop_dataset_parts")), "budget rejects before source body reads");
  assert.ok(MAX_POSTFLOP_SOURCE_BYTES < 2_200_000);

  const underreported = makeFixture({ sourceByteOverrides: { "opening-ranges": 1, "preflop-ranges": 1 },
    sourcePaddingChars: { "opening-ranges": 1_000_000, "preflop-ranges": 1_000_000 } });
  await assert.rejects(evaluatePublishedPostflopPolicy(underreported.db, { spotId, flop: "As7d2c" }), hasCode("data_unavailable"));
  assert.ok(underreported.calls.some(call => call.sql.includes("SUM(length(CAST(body AS BLOB)))")), "stored part byte counts are checked without selecting bodies");
  assert.ok(!underreported.calls.some(call => call.sql.includes("FROM preflop_dataset_parts") && call.sql.includes("SELECT part, body")));
});

test("in-flight policy evaluation is capped before the first D1 read and the slot is released", async () => {
  let announceFirstRead;
  const firstRead = new Promise(resolve => { announceFirstRead = resolve; });
  let releaseRead;
  const blockedRead = new Promise(resolve => { releaseRead = resolve; });
  let blocked = false;
  const fixture = makeFixture({ beforeQuery: async () => {
    if (!blocked) { blocked = true; announceFirstRead(); await blockedRead; }
  } });
  const first = evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "As7d2c" });
  await firstRead;
  const callsBeforeRejected = fixture.calls.length;
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "KsJh3d" }), hasCode("data_unavailable"));
  assert.equal(fixture.calls.length, callsBeforeRejected, "busy request performs no D1 reads");
  releaseRead();
  assert.equal((await first).node, "btn_first");
  assert.equal((await evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "KsJh3d" })).node, "btn_first");
});

test("a published action path marks base-supported zero-reach classes as unreachable", async () => {
  const { db } = makeFixture();
  const result = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c",
    history: ["bet33", "raise", "raise", "raise"] });
  assert.equal(result.node, "btn_vs_raise3");
  const zeroReach = result.hands.filter(row => row.preflopSupport && row.reachWeight === 0);
  assert.equal(zeroReach.length, 32);
  assert.ok(zeroReach.every(row => row.nodeReachable === false && !("reachable" in row)));
  assert.deepEqual(result.hands.find(row => row.hand === "KK").frequencies, { fold: 0.97, call: 0.03, raise: 0 });
});

test("three-bet, four-bet, limp and low-SPR OOP-lead fixtures match the Web projection", async () => {
  const cases = [
    { spotId: "UTG_open_SB_3bet_call", kind: "3bp", expectedSources: ["opening-ranges", "preflop-ranges", "three-bet-responses"] },
    { spotId: "HJ_open_BTN_4bp_call", kind: "4bp", expectedSources: ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses"] },
    { spotId: "SB_limp_BB_check", kind: "limp", expectedSources: ["opening-ranges", "limp-responses"] },
  ];
  for (const item of cases) {
    const familyInputs = loadInputs(item.spotId), candidate = loadCandidate(familyInputs);
    assert.equal(familyInputs.spot.kind, item.kind);
    assert.equal(familyInputs.spot.tree, "oop_leads");
    const { db } = makeFixture({ candidate, spotData: familyInputs.spot, fixtureSpotId: item.spotId,
      sourceFiles: familySourceFiles });
    const result = await evaluatePublishedPostflopPolicy(db, { spotId: item.spotId, flop: "As7d2c" });
    assert.equal(result.node, "oop_first");
    assert.equal(result.actingSeat, familyInputs.spot.oop);
    assert.deepEqual(Object.keys(result.source.inputDatasets).sort(), item.expectedSources.sort());
    assert.equal(result.hands.length, 169);
    assert.equal(result.frequencyBasis, "preflop_range_weighted_projection");
    const browser = computeBoard({ spotId: item.spotId, board: "As7d2c", datasets: browserDatasets,
      flopCandidate: candidate }).nodes;
    assert.deepEqual(result.hands, projectRows(browser[result.node].rows));
    if (item.kind === "4bp") assert.ok(familyInputs.spot.stackBb / familyInputs.spot.potBb < 2,
      "the four-bet fixture exercises a low-SPR published spot");
  }
});

test("paired and trips boards use the current Web hand-tier implementation for root and facing nodes", async () => {
  for (const flop of ["KcKd4h", "AsAdAc"]) {
    const { db } = makeFixture();
    const result = await evaluatePublishedPostflopPolicy(db, { spotId, flop });
    const browser = computeBoard({ spotId, board: flop, datasets: browserDatasets,
      flopCandidate: publishedCandidate }).nodes;
    assert.deepEqual(result.hands, projectRows(browser[result.node].rows), `${flop} root parity`);
    const facing = await evaluatePublishedPostflopPolicy(db, { spotId, flop, history: ["bet33"] });
    assert.deepEqual(facing.hands, projectRows(browser[facing.node].rows), `${flop} facing parity`);
  }
});

test("invalid, missing, ended, and unreachable policy contexts fail closed", async () => {
  const fixture = makeFixture();
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId: "not_published", flop: "As7d2c" }), hasCode("not_found"));
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "AsAs2h" }), hasCode("invalid_argument"));
  const invalidBoard = makeFixture();
  await assert.rejects(evaluatePublishedPostflopPolicy(invalidBoard.db, { spotId, flop: "AsAs2h" }), hasCode("invalid_argument"));
  assert.equal(invalidBoard.calls.length, 0, "invalid board input is rejected before reading published data");
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "As7d2c", history: ["all_in"] }), hasCode("invalid_argument"));
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "As7d2c", history: Array(21).fill("check") }), hasCode("invalid_argument"));
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "As7d2c", history: ["bet33", "fold"] }), hasCode("not_found"));
  await assert.rejects(evaluatePublishedPostflopPolicy(makeFixture({ missingSource: "preflop-ranges" }).db,
    { spotId, flop: "As7d2c" }), hasCode("not_found"));
  await assert.rejects(evaluatePublishedPostflopPolicy(makeFixture({ corruptSourceHash: true }).db,
    { spotId, flop: "As7d2c" }), hasCode("invalid_saved_data"));
  const stale = { ...publishedCandidate, metadata: { ...publishedCandidate.metadata, source_hash: "f".repeat(64) } };
  await assert.rejects(evaluatePublishedPostflopPolicy(makeFixture({ candidate: stale }).db,
    { spotId, flop: "As7d2c" }), hasCode("invalid_saved_data"));

  const zeroBetPolicy = { ...publishedCandidate.policy, rules: publishedCandidate.policy.rules.map(rule => rule.node === "btn_first"
    ? { ...rule, mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 } } : rule) };
  const zeroBet = { ...publishedCandidate, policy: zeroBetPolicy,
    metadata: { ...publishedCandidate.metadata, policy_hash: digest(JSON.stringify(zeroBetPolicy)) } };
  await assert.rejects(evaluatePublishedPostflopPolicy(makeFixture({ candidate: zeroBet }).db,
    { spotId, flop: "As7d2c", history: ["bet33"] }), hasCode("not_found"));

  const unsupportedSpot = { ...inputs.spot, kind: "sqp", history: [{ seat: "BTN", action: "check", to_size_bb: null }] };
  const unsupported = makeFixture({ spotData: unsupportedSpot });
  assert.equal((await listPostflopCoverage(unsupported.db)).spots[0].policyNodeEvaluation.status, "source_family_not_supported");
  await assert.rejects(evaluatePublishedPostflopPolicy(unsupported.db, { spotId, flop: "As7d2c" }), hasCode("unsupported_dataset"));
});

test("incomplete deep policy coverage does not use the shared reference fallback", async () => {
  const policy = { ...publishedCandidate.policy,
    rules: publishedCandidate.policy.rules.filter(rule => rule.node !== "bb_vs_raise2") };
  const candidate = { ...publishedCandidate, policy,
    metadata: { ...publishedCandidate.metadata, policy_hash: digest(JSON.stringify(policy)) } };
  const { db } = makeFixture({ candidate });
  await assert.rejects(evaluatePublishedPostflopPolicy(db,
    { spotId, flop: "As7d2c", history: ["bet33", "raise", "raise"] }), hasCode("not_found"));
});
