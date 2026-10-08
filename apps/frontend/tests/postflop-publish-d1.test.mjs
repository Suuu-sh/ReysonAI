import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VALUE_BYTES, buildSql } from "../scripts/postflop-ai/publish-d1.mjs";
import { postflopUrl } from "../src/estimated/postflop-api.ts";

const spot = { id: "X_open_Y_call", slug: "x-y-srp-v1", kind: "srp", tree: "oop_checks", ip: "Y", oop: "X", potBb: 5.5, stackBb: 97.5, note: "it's" };
const candidate = { metadata: { policy_hash: "h1" }, policy: {} };
const entry = { spot, candidate, laterCandidate: null, report: { ok: true } };

test("publish SQL replaces every row, escapes quotes and records the dataset version", () => {
  const sql = buildSql([entry], "2026-09-29T00:00:00Z");
  const lines = sql.trim().split("\n");
  const firstInsert = lines.findIndex(line => line.startsWith("INSERT"));
  for (const table of ["postflop_policies", "postflop_reports", "postflop_spots"]) {
    assert.ok(lines.indexOf(`DELETE FROM ${table};`) >= 0 && lines.indexOf(`DELETE FROM ${table};`) < firstInsert, table);
  }
  assert.match(sql, /it''s/);
  assert.equal(lines.filter(line => line.startsWith("INSERT INTO postflop_policies")).length, 1);
  assert.doesNotMatch(sql, /postflop_hand_ev/);
  assert.match(sql, /INSERT INTO dataset_versions .*'postflop', '[0-9a-f]{64}', '2026-09-29T00:00:00Z'/);
});

test("publish refuses a value over the D1 statement budget", () => {
  const huge = { ...entry, report: { text: "x".repeat(MAX_VALUE_BYTES) } };
  assert.throws(() => buildSql([huge]), /X_open_Y_call report/);
});

test("postflop URLs expose only read-only spot and flop artifacts, no hand-EV", () => {
  assert.equal(postflopUrl("spot", { spot: "S" }), "/local-postflop-spot?spot=S");
  assert.equal(postflopUrl("spot", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/spot?spot=S");
  assert.equal(postflopUrl("flop", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/flop?spot=S");
});

// Publisher validation is offline and uses complete ordinary role policies.
import { publishableProfiles } from "../scripts/postflop-ai/publish-d1.mjs";
import { artifactPaths, config, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { generationInputOptions } from "../scripts/postflop-ai/generation-options.mjs";
import { sha as policySha } from "../scripts/postflop-ai/generate.mjs";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const registered = POSTFLOP_SPOTS.find(spot => spot.id === "BTN_open_BB_call");
const unit = (profile = "nit", selected = registered) => {
  const inputs = loadInputs(selected.id, generationInputOptions(selected.id, profile));
  const flop = {}, later = {};
  for (const role of ["villain", "exploit"]) {
    const metadata = { kind: "ai_estimate_not_gto", profile, role, spot: selected.id, tree: selected.tree,
      source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash, config_version: config.version };
    const policy = referencePolicyFor(selected.tree), laterPolicy = referenceLaterPolicy();
    flop[role] = { metadata: { ...metadata, policy_hash: policySha(policy) }, policy };
    later[role] = { metadata: { ...metadata, policy_hash: policySha(laterPolicy), flop_policy_hash: flop[role].metadata.policy_hash }, policy: laterPolicy };
  }
  return { profile, spot: selected, flop, later };
};
const artifactsFor = entries => (spot, kind, { profile, role }) => {
  const entry = entries.find(item => item.profile === profile && item.spot.id === spot.id);
  return entry?.[kind === "candidate" ? "flop" : "later"]?.[role] ?? null;
};
const validateUnits = entries => publishableProfiles(() => {}, { spots: [registered], read: artifactsFor(entries) });
const datasetHash = (sql, name) => sql.match(new RegExp(`VALUES \\('${name}', '([a-f0-9]{64})'`))[1];

test("profile SQL stores role-specific policy only, replaces all rows, and rotates both versions", () => {
  const item = unit(), at = "2026-10-08T00:00:00Z";
  const sql = buildSql([entry], at, [item]);
  assert.match(sql, /DELETE FROM postflop_profile_policies;/);
  const inserts = sql.split("\n").filter(line => line.startsWith("INSERT INTO postflop_profile_policies"));
  assert.equal(inserts.length, 4);
  for (const role of ["villain", "exploit"]) for (const stage of ["flop", "later"]) {
    const candidate = item[stage === "flop" ? "flop" : "later"][role];
    assert.ok(inserts.some(line => line.includes(`'nit', 'BTN_open_BB_call', '${role}', '${stage}'`) &&
      line.endsWith(`'${JSON.stringify(candidate.policy)}', '${at}');`)));
  }
  const changed = structuredClone(item); changed.flop.villain.metadata.policy_hash = "changed";
  for (const name of ["postflop", "postflop-profiles"]) {
    assert.notEqual(datasetHash(sql, name), datasetHash(buildSql([entry], at, [changed]), name));
  }
  const metadataOnly = structuredClone(item); metadataOnly.flop.villain.metadata.model = "new-authoring-model";
  for (const name of ["postflop", "postflop-profiles"]) {
    assert.notEqual(datasetHash(sql, name), datasetHash(buildSql([entry], at, [metadataOnly]), name));
  }
  assert.throws(() => buildSql([], at, [{ ...item, later: { ...item.later,
    exploit: { ...item.later.exploit, policy: { text: "x".repeat(MAX_VALUE_BYTES) } } } }]), /nit\/BTN_open_BB_call\/exploit\/later policy/);
});

test("publisher validates complete role pairs with no standard lookup and fails on partial, identity, stale, malformed or hash/linkage mismatch", () => {
  assert.equal(validateUnits([unit()]).length, 1);
  const missing = unit(); missing.later.exploit = null;
  assert.throws(() => validateUnits([missing]), /Incomplete generated profile policy: 3\/4/);
  for (const stage of ["flop", "later"]) for (const mutate of [
    candidate => candidate.metadata.profile = "station",
    candidate => candidate.metadata.role = "villain",
    candidate => candidate.metadata.spot = "wrong",
    candidate => candidate.metadata.structure_hash = "stale",
    candidate => candidate.metadata.source_hash = "",
    candidate => candidate.metadata.config_version = -1,
    candidate => candidate.metadata.policy_hash = "stale",
    candidate => candidate.policy = {},
  ]) {
    const item = unit(); mutate(item[stage].exploit);
    assert.throws(() => validateUnits([item]), /not publishable/);
  }
  const staleLater = unit(); staleLater.later.exploit.metadata.flop_policy_hash = "stale";
  assert.throws(() => validateUnits([staleLater]), /flop policy is stale/);
  assert.throws(() => publishableProfiles(() => {}, { spots: [registered], requireAll: true, read: () => null }), /Incomplete/);
});

test("require-all allows genuinely absent HU-after-multiway units but never partial units", () => {
  const selected = POSTFLOP_SPOTS.find(spot => "history" in spot);
  assert.deepEqual(publishableProfiles(() => {}, { spots: [selected], requireAll: true,
    read: () => null, inputsFor: () => { throw new Error("Absent multiway must not load ungeneratable inputs"); } }), []);
  const item = unit("nit", selected); item.later.exploit = null;
  assert.throws(() => publishableProfiles(() => {}, { spots: [selected], requireAll: true, read: artifactsFor([item]) }), /Incomplete/);
});

test("CI applies only exact additive profile schema before API, policy import and client deploy", () => {
  const workflow = readFileSync(new URL("../../../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
  const migration = "migrations/0012_postflop_profile_policies.sql";
  assert.ok(workflow.includes(`'apps/backend/${migration}'`));
  const step = workflow.indexOf("- name: Apply exact postflop profile schema");
  assert.ok(step >= 0);
  const command = workflow.slice(step, workflow.indexOf("\n      - name:", step + 1));
  assert.match(command, /d1 execute reysonai --remote --config wrangler.jsonc --file migrations\/0012_postflop_profile_policies.sql --yes/);
  assert.doesNotMatch(command, /migrations apply|publish:d1/);
  for (const name of ["Deploy ranked API before enabling the client", "Publish postflop policies into D1", "Deploy Worker"]) {
    assert.ok(workflow.indexOf(`- name: ${name}`) > step);
  }
});


test("a generated HU-after-multiway file containing null or false is not silently skipped", () => {
  const selected = POSTFLOP_SPOTS.find(spot => "history" in spot &&
    !existsSync(artifactPaths(spot, { profile: "nit", role: "villain" }).candidate));
  assert.ok(selected);
  const path = artifactPaths(selected, { profile: "nit", role: "villain" }).candidate;
  try {
    for (const text of ["null", "false"]) {
      writeFileSync(path, text, { flag: "wx" });
      assert.throws(() => publishableProfiles(() => {}, { requireAll: true }),
        error => error.message.includes(`nit/${selected.id} is not publishable`) && /Incomplete/.test(error.message));
      rmSync(path);
    }
  } finally { rmSync(path, { force: true }); }
});
