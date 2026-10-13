import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { artifactPaths, loadInputs, readArtifact } from "../scripts/postflop-ai/inputs.mjs";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";
import { buildSql, isFreshSimulationReport, publishableSingleSpots, spotArtifacts } from "../scripts/postflop-ai/publish-d1.mjs";

// Frozen outputs of the original buildSql captured before Single publication was
// added. Fixed inputs, timestamp and revision also cover profile-only behavior.
const baseline = JSON.parse(readFileSync(new URL("./fixtures/postflop-standard-publish-baseline.json", import.meta.url), "utf8"));
const pilot = POSTFLOP_SPOTS.find(spot => spot.slug === "btn-bb-srp-v1");
const at = baseline.publishedAt, revision = baseline.revision;
const standardVersion = sql => sql.split("\n").filter(line => line.includes("dataset_versions") && /'postflop'[,;]/.test(line));

test("fixed standard/profile SQL is byte-identical to the frozen original buildSql output", () => {
  for (const [name, published, profiles] of [
    ["empty", [], []], ["standard", baseline.published, []],
    ["profiles", [], baseline.profiles], ["combined", baseline.published, baseline.profiles],
  ]) {
    assert.equal(buildSql(published, at, revision, profiles), baseline.outputs[name], name);
    assert.equal(buildSql(published, at, revision, profiles, []), baseline.outputs[name], `${name}: explicit empty singles`);
  }
});

test("real BTN/BB Single publishes flop/later/report into isolated spot-scoped tables and version", () => {
  const item = spotArtifacts(pilot, { sizing: "single" });
  assert.equal(item.skip, undefined);
  assert.equal(item.candidate.metadata.sizing, "single");
  assert.equal(item.laterCandidate.metadata.sizing, "single");
  const singleOnly = buildSql([], at, revision, [], [item]);
  assert.match(singleOnly, /DELETE FROM postflop_single_policies WHERE spot_id = 'BTN_open_BB_call';/);
  assert.match(singleOnly, /DELETE FROM postflop_single_reports WHERE spot_id = 'BTN_open_BB_call';/);
  const policyLines = singleOnly.split("\n").filter(line => line.startsWith("INSERT INTO postflop_single_policies"));
  assert.equal(policyLines.length, 2);
  for (const [stage, candidate] of [["flop", item.candidate], ["later", item.laterCandidate]]) {
    assert.ok(policyLines.some(line => line.includes(`'BTN_open_BB_call', '${stage}', '${candidate.metadata.policy_hash}'`) &&
      line.endsWith(`'${JSON.stringify(candidate)}');`)), stage);
  }
  assert.ok(singleOnly.includes(`INSERT INTO postflop_single_reports (spot_id, payload_json) VALUES ('BTN_open_BB_call', '${JSON.stringify(item.report)}');`));
  assert.equal(standardVersion(singleOnly).length, 0);
  assert.doesNotMatch(singleOnly, /DELETE FROM postflop_single_\w+;|INSERT INTO postflop_(?:policies|reports|spots|profile_policies) /);
  const hashes = { [pilot.id]: { flop: item.candidate.metadata.policy_hash, later: item.laterCandidate.metadata.policy_hash } };
  const hash = createHash("sha256").update(JSON.stringify({ publicationRevision: revision, publishedAt: at, hashes })).digest("hex");
  assert.match(singleOnly, /DELETE FROM dataset_versions WHERE name = 'postflop-single';/);
  assert.ok(singleOnly.includes(`VALUES ('postflop-single', '${hash}', '${at}'`));
  const combined = buildSql(baseline.published, at, revision, baseline.profiles, [item]);
  assert.ok(combined.startsWith(baseline.outputs.combined), "all standard/profile statements remain an exact prefix");
  assert.deepEqual(standardVersion(combined), standardVersion(baseline.outputs.combined));
  assert.throws(() => buildSql([], at, revision, [], [item, item]), /Duplicate published single-size/);
  assert.throws(() => buildSql([], at, revision, [], [{ ...item, laterCandidate: null }]), /incomplete single-size/);
});

test("Single collection silently skips absent canonical candidates, including with require-all", () => {
  const absent = POSTFLOP_SPOTS.find(spot => !existsSync(artifactPaths(spot, { sizing: "single" }).candidate));
  assert.ok(absent);
  const logs = [];
  for (const requireAll of [false, true]) {
    assert.deepEqual(publishableSingleSpots(message => logs.push(message), { spots: [absent], requireAll,
      artifactsFor: () => { throw new Error("absent candidate must not load inputs or artifacts"); } }), []);
  }
  assert.deepEqual(logs, []);
  const items = publishableSingleSpots(() => {}, { spots: [absent, pilot] });
  assert.deepEqual(items.map(item => item.spot.id), [pilot.id]);
});

test("present stale/incomplete Single units fail hard irrespective of require-all without editing artifacts", () => {
  const inputs = loadInputs(pilot.id, { sizing: "single" });
  const item = spotArtifacts(pilot, { sizing: "single" });
  assert.equal(isFreshSimulationReport(inputs, item.candidate, item.laterCandidate, item.report), true);
  assert.equal(isFreshSimulationReport(inputs, item.candidate, null, { ...item.report, later_policy_hash: null }), false);
  assert.equal(isFreshSimulationReport(inputs, item.candidate, item.laterCandidate, { ...item.report, defence_version: 7 }), false);
  const failures = [
    ["stale source", options => spotArtifacts(pilot, { ...options,
      inputsFor: (id, opts) => ({ ...loadInputs(id, opts), fingerprint: "0".repeat(64) }) })],
    ["missing report", options => spotArtifacts(pilot, { ...options, read: () => null })],
    ["incomplete report", options => spotArtifacts(pilot, { ...options,
      read: (spot, kind, opts) => { const saved = readArtifact(spot, kind, opts); return { ...saved, results: saved.results.slice(1) }; } })],
    ["stale defence", options => spotArtifacts(pilot, { ...options,
      read: (spot, kind, opts) => ({ ...readArtifact(spot, kind, opts), defence_version: 7 }) })],
    ["missing later", () => ({ ...item, laterCandidate: null })],
  ];
  for (const requireAll of [false, true]) for (const [label, artifactsFor] of failures) {
    assert.throws(() => publishableSingleSpots(() => {}, { spots: [pilot], requireAll,
      artifactsFor: (spot, options) => { assert.equal(spot.id, pilot.id); assert.equal(options.sizing, "single"); return artifactsFor(options); } }), /single-size is not publishable/, label);
  }
  assert.equal(spotArtifacts(pilot, { sizing: "single" }).skip, undefined, "canonical files remain unchanged");
});

test("both publisher CLI paths share an exported main and include Single in postflop output", async () => {
  // No CLI execution, D1 write, generation or artifact rewrite in this test.
  const wrapper = await import("../scripts/publish-d1.mjs");
  assert.equal(typeof wrapper.main, "function");
  const source = readFileSync(new URL("../scripts/publish-d1.mjs", import.meta.url), "utf8");
  assert.match(source, /const singles = publishableSingleSpots\(console\.log\)/);
  assert.match(source, /buildPostflopSql\(spots, undefined, undefined, profiles, singles\)/);
  const alias = readFileSync(new URL("../scripts/postflop-ai/publish-d1.mjs", import.meta.url), "utf8");
  assert.match(alias, /import\("\.\.\/publish-d1\.mjs"\)\.then\(\(\{ main \}\) => main\(process\.argv\.slice\(2\)\)\)/);
});
