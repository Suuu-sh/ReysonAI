import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadInputs } from "../../frontend/scripts/postflop-ai/inputs.mjs";
import { loadCandidate } from "../../frontend/scripts/postflop-ai/generate.mjs";
import { canonicalFlop } from "../../frontend/scripts/postflop-ai/flop-isomorphism.ts";
import { computeBoard } from "../../frontend/src/estimated/postflop-compute.ts";
import opening from "../../frontend/src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../../frontend/src/estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../../frontend/src/estimated/three-bet-responses.json" with { type: "json" };
import { evaluatePublishedPostflopPolicy, listPostflopCoverage } from "../src/postflop-data.ts";
import { McpDataError } from "../src/data.ts";

const digest = value => createHash("sha256").update(value).digest("hex");
const spotId = "BTN_open_BB_call";
const timestamp = "2026-10-09T00:00:00.000Z";
const sourceFiles = {
  "opening-ranges": opening,
  "preflop-ranges": responses,
};
const inputs = loadInputs(spotId);
const publishedCandidate = loadCandidate(inputs);

function makeFixture({ candidate = publishedCandidate, missingSource = null, corruptSourceHash = false, spotData = inputs.spot } = {}) {
  const releaseIndex = { [spotId]: { flop: candidate.metadata.policy_hash, later: null } };
  const release = { name: "postflop", content_hash: digest(JSON.stringify(releaseIndex)), published_at: timestamp,
    detail_json: JSON.stringify({ spots: releaseIndex }) };
  const versions = [release];
  const spots = [{ spot_id: spotId, slug: spotData.slug, kind: spotData.kind, tree: spotData.tree,
    ip: spotData.ip, oop: spotData.oop, pot_bb: spotData.potBb, stack_bb: spotData.stackBb,
    spot_json: JSON.stringify(spotData) }];
  const policyRows = [{ spot_id: spotId, stage: "flop", policy_hash: candidate.metadata.policy_hash,
    metadata_json: JSON.stringify(candidate.metadata), policy_json: JSON.stringify(candidate.policy ? candidate : { ...candidate, policy: publishedCandidate.policy }) }];
  // `candidate` is an artifact envelope; retain its exact policy object in the serialized D1 row.
  policyRows[0].policy_json = JSON.stringify(candidate);
  const datasets = new Map();
  for (const [name, value] of Object.entries(sourceFiles)) {
    if (name === missingSource) continue;
    const text = JSON.stringify(value), hash = digest(text), body = corruptSourceHash && name === "preflop-ranges" ? "0".repeat(64) : hash;
    const parts = [];
    for (let offset = 0, part = 0; offset < text.length; offset += 28_000, part++) {
      parts.push({ name, part, body: text.slice(offset, offset + 28_000) });
    }
    datasets.set(name, { metadata: { name, content_hash: body, bytes: new TextEncoder().encode(text).length, parts: parts.length }, parts });
  }
  const calls = [];
  const db = { prepare(sql) {
    assert.match(sql, /^SELECT /, "policy evaluation must remain read-only");
    return { bind(...args) { return { async all() {
      calls.push({ sql, args });
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
        return { results: rows.slice(0, 2) };
      }
      if (sql.includes("FROM preflop_dataset_parts")) {
        const selected = datasets.get(args[0]);
        return { results: selected?.parts.slice(0, 161) ?? [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    } }; } };
  } };
  return { db, calls };
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

test("one-node evaluation matches the frontend projection and is deterministic without exposing combos", async () => {
  const { db, calls } = makeFixture();
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
  assert.equal(first.handClassCount, 169);
  assert.equal(first.hands.length, 169);
  assert.ok(first.hands.every(row => !("combos" in row)));
  const browser = computeBoard({ spotId, board: "As7d2c", datasets: { opening, responses, threeBets },
    flopCandidate: publishedCandidate }).nodes.btn_first;
  assert.deepEqual(first.hands, browser.rows.map(row => ({ hand: row.hand, reachable: row.reachable,
    comboCount: row.comboCount, frequencies: row.mix, tierWeights: row.tiers, reachWeight: row.reachWeight })));
  assert.equal(first.source.policy.contentHash, publishedCandidate.metadata.policy_hash);
  assert.deepEqual(Object.keys(first.source.inputDatasets).sort(), Object.keys(sourceFiles).sort());
  assert.ok(new TextEncoder().encode(JSON.stringify(first)).length < 80_000, "one-node response stays within the MCP response cap");
  assert.ok(calls.length > 0 && calls.every(call => /^SELECT /.test(call.sql)));

  const facing = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c", history: ["bet33"] });
  const browserFacing = computeBoard({ spotId, board: "As7d2c", history: ["bet33"],
    datasets: { opening, responses, threeBets }, flopCandidate: publishedCandidate }).nodes.bb_vs_33;
  assert.equal(facing.node, "bb_vs_33");
  assert.equal(facing.actingSeat, "BB");
  assert.deepEqual(facing.hands, browserFacing.rows.map(row => ({ hand: row.hand, reachable: row.reachable,
    comboCount: row.comboCount, frequencies: row.mix, tierWeights: row.tiers, reachWeight: row.reachWeight })));

  const raised = await evaluatePublishedPostflopPolicy(db, { spotId, flop: "As7d2c", history: ["bet33", "raise"] });
  const browserRaised = computeBoard({ spotId, board: "As7d2c", history: ["bet33", "raise"],
    datasets: { opening, responses, threeBets }, flopCandidate: publishedCandidate }).nodes.btn_vs_raise;
  assert.equal(raised.node, "btn_vs_raise");
  assert.equal(raised.actingSeat, "BTN");
  assert.deepEqual(raised.hands, browserRaised.rows.map(row => ({ hand: row.hand, reachable: row.reachable,
    comboCount: row.comboCount, frequencies: row.mix, tierWeights: row.tiers, reachWeight: row.reachWeight })));
});

test("invalid, missing, ended, and unreachable policy contexts fail closed", async () => {
  const fixture = makeFixture();
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId: "not_published", flop: "As7d2c" }), hasCode("not_found"));
  await assert.rejects(evaluatePublishedPostflopPolicy(fixture.db, { spotId, flop: "AsAs2h" }), hasCode("invalid_argument"));
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
