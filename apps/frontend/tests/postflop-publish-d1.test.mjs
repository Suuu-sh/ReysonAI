import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { MAX_VALUE_BYTES, buildSql } from "../scripts/postflop-ai/publish-d1.mjs";
import { postflopUrl } from "../src/estimated/postflop-api.ts";

const spot = { id: "X_open_Y_call", slug: "x-y-srp-v1", kind: "srp", tree: "oop_checks", ip: "Y", oop: "X", potBb: 5.5, stackBb: 97.5, note: "it's" };
const candidate = { metadata: { policy_hash: "h1" }, policy: {} };
const entry = { spot, candidate, laterCandidate: null, report: { ok: true } };

test("publish SQL replaces only supplied spots, escapes quotes and records the patch version", () => {
  const sql = buildSql([entry], "2026-09-29T00:00:00Z");
  const lines = sql.trim().split("\n");
  const firstInsert = lines.findIndex(line => line.startsWith("INSERT"));
  for (const table of ["postflop_policies", "postflop_reports", "postflop_spots"]) {
    assert.ok(lines.indexOf(`DELETE FROM ${table} WHERE spot_id = 'X_open_Y_call';`) >= 0 && lines.indexOf(`DELETE FROM ${table} WHERE spot_id = 'X_open_Y_call';`) < firstInsert, table);
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

test("profile metadata does not contaminate the standard postflop version contract or hash", () => {
  const publishedAt = "2026-10-09T12:00:00.000Z", publicationRevision = "revision-123";
  const baseline = buildSql([entry], publishedAt, publicationRevision);
  const rolePair = { villain: candidate, exploit: candidate };
  const profileUnit = { profile: "nit", spot, opponentSeat: "oop", flop: rolePair, later: rolePair };
  const withProfiles = buildSql([entry], publishedAt, publicationRevision, [profileUnit]);
  const standardVersion = sql => sql.split("\n").find(line => line.startsWith("INSERT INTO dataset_versions") && line.includes("'postflop',"));
  const baselineVersion = standardVersion(baseline), profileVersion = standardVersion(withProfiles);
  assert.equal(profileVersion, baselineVersion, "profile metadata must not change the standard dataset row");

  const hashes = { [spot.id]: { flop: candidate.metadata.policy_hash, later: null } };
  const expectedHash = createHash("sha256").update(JSON.stringify({ publicationRevision, publishedAt, hashes })).digest("hex");
  const detail = { mode: "spot-upsert", publication_revision: publicationRevision, touched_spots: hashes };
  assert.equal(profileVersion, `INSERT INTO dataset_versions (name, content_hash, published_at, detail_json) VALUES ('postflop', '${expectedHash}', '${publishedAt}', '${JSON.stringify(detail)}');`);
  assert.doesNotMatch(profileVersion, /profilePolicies|profiles/);
});

test("postflop URLs expose only read-only spot and flop artifacts, no hand-EV", () => {
  assert.equal(postflopUrl("spot", { spot: "S" }), "/local-postflop-spot?spot=S");
  assert.equal(postflopUrl("spot", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/spot?spot=S");
  assert.equal(postflopUrl("flop", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/flop?spot=S");
});

// Publisher validation is offline and uses complete ordinary role policies.
import { publishableProfiles } from "../scripts/postflop-ai/publish-d1.mjs";
import { config, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { generationInputOptions } from "../scripts/postflop-ai/generation-options.mjs";
import { sha as policySha } from "../scripts/postflop-ai/generate.mjs";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";
import { readFileSync } from "node:fs";

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
  return { profile, spot: selected, flop, later, opponentSeat: inputs.opponentSeat };
};
const artifactsFor = entries => (spot, kind, { profile, role }) => {
  const entry = entries.find(item => item.profile === profile && item.spot.id === spot.id);
  return entry?.[kind === "candidate" ? "flop" : "later"]?.[role] ?? null;
};
const validateUnits = entries => publishableProfiles(() => {}, { spots: [registered], read: artifactsFor(entries) });
const datasetHash = (sql, name) => sql.match(new RegExp(`VALUES \\('${name}', '([a-f0-9]{64})'`))[1];

test("profile SQL stores role-specific policy only, upserts supplied units, and rotates both versions", () => {
  const item = unit(), at = "2026-10-08T00:00:00Z";
  const sql = buildSql([entry], at, "profile-publication-id", [item]);
  assert.match(sql, /DELETE FROM postflop_profile_policies WHERE profile = 'nit' AND spot_id = 'BTN_open_BB_call' AND opponent_seat = 'ip';/);
  assert.doesNotMatch(sql, /DELETE FROM postflop_\w+;/);
  const inserts = sql.split("\n").filter(line => line.startsWith("INSERT INTO postflop_profile_policies"));
  assert.equal(inserts.length, 4);
  for (const role of ["villain", "exploit"]) for (const stage of ["flop", "later"]) {
    const candidate = item[stage === "flop" ? "flop" : "later"][role];
    assert.ok(inserts.some(line => line.includes(`'nit', 'BTN_open_BB_call', 'ip', '${role}', '${stage}'`) &&
      line.endsWith(`'${JSON.stringify(candidate.policy)}', '${at}');`)));
  }
  assert.match(inserts[0], /"opponent_seat":"ip"/);
  const changed = structuredClone(item); changed.flop.villain.metadata.policy_hash = "changed";
  assert.equal(datasetHash(sql, "postflop"), datasetHash(buildSql([entry], at, "profile-publication-id", [changed]), "postflop"));
  assert.notEqual(datasetHash(sql, "postflop-profiles"), datasetHash(buildSql([entry], at, "profile-publication-id", [changed]), "postflop-profiles"));
  const metadataOnly = structuredClone(item); metadataOnly.flop.villain.metadata.model = "new-authoring-model";
  assert.equal(datasetHash(sql, "postflop"), datasetHash(buildSql([entry], at, "profile-publication-id", [metadataOnly]), "postflop"));
  assert.notEqual(datasetHash(sql, "postflop-profiles"), datasetHash(buildSql([entry], at, "profile-publication-id", [metadataOnly]), "postflop-profiles"));
  assert.throws(() => buildSql([], at, "profile-publication-id", [{ ...item, later: { ...item.later,
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
  const item = { ...unit(), spot: selected }; item.later.exploit = null;
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
  const selected = POSTFLOP_SPOTS.find(spot => "history" in spot);
  for (const value of [null, false]) {
    const isSelected = (spot, kind, { profile, role }) => spot.id === selected.id &&
      kind === "candidate" && profile === "nit" && role === "villain";
    assert.throws(() => publishableProfiles(() => {}, { spots: [selected], requireAll: true,
      read: (spot, kind, options) => isSelected(spot, kind, options) ? value : null,
      hasArtifact: isSelected,
      inputsFor: () => { throw new Error("Partial files must fail before loading inputs"); },
    }), error => error.message.includes(`nit/${selected.id} is not publishable`) && /Incomplete/.test(error.message));
  }
});

test("empty publication cannot erase old policies", () => {
  assert.doesNotMatch(buildSql([]), /DELETE|INSERT/);
  assert.doesNotMatch(buildSql([entry]), /DELETE FROM postflop_\w+;/);
});

test("partial A-to-B-to-A publications never reuse an old cache revision", () => {
  const token = sql => /VALUES \('postflop', '([a-f0-9]+)'/.exec(sql)[1];
  const a1=buildSql([entry],'2026-10-04T00:00:00Z');
  const b=buildSql([{...entry,spot:{...spot,id:'B'}}],'2026-10-04T00:00:00Z');
  const a2=buildSql([entry],'2026-10-04T00:00:00Z');
  assert.equal(new Set([token(a1),token(b),token(a2)]).size,3);
  assert.equal(buildSql([entry],'2026-10-04T00:00:00Z','reviewed-publication-id'),buildSql([entry],'2026-10-04T00:00:00Z','reviewed-publication-id'));
});

test("duplicate publication tuples fail before generating SQL", () => {
  assert.throws(()=>buildSql([entry,entry]),/Duplicate published postflop spot/);
  const item = unit();
  assert.throws(() => buildSql([], undefined, undefined, [item, item]), /Duplicate published postflop profile\/spot/);
});

test("both policy stages and report attribution are preserved within spot-scoped SQL", () => {
  const policy={metadata:{policy_hash:'flop-hash',model:'gpt-6.1-sol',reasoning_effort:'high'},policy:{}};
  const later={metadata:{policy_hash:'later-hash',flop_policy_hash:'flop-hash',model:'gpt-6.1-sol',reasoning_effort:'high'},policy:{}};
  const report={kind:'ai_estimate_not_gto',defence_version:7,policy_hash:'flop-hash',later_policy_hash:'later-hash'};
  const sql=buildSql([{spot,candidate:policy,laterCandidate:later,report}]);
  assert.equal(sql.split('\n').filter(line=>line.startsWith('INSERT INTO postflop_policies')).length,2);
  assert.match(sql,/"model":"gpt-6.1-sol"/);
  assert.match(sql,/"defence_version":7/);
  assert.doesNotMatch(sql,/gpt-6-astra|action_model_version/);
  for(const line of sql.split('\n').filter(line=>line.startsWith('DELETE FROM postflop_'))) {
    assert.match(line,/ WHERE spot_id = 'X_open_Y_call';$/);
  }
});

test("profile partial A-to-B-to-A publication never reuses a cache revision", () => {
  const at = "2026-10-08T00:00:00Z";
  const a1 = buildSql([], at, undefined, [unit("nit")]);
  const b = buildSql([], at, undefined, [unit("station")]);
  const a2 = buildSql([], at, undefined, [unit("nit")]);
  assert.ok([a1, b, a2].every(sql => !sql.includes("'postflop',")), "profile-only writes leave the standard version row untouched");
  assert.equal(new Set([a1, b, a2].map(sql => datasetHash(sql, "postflop-profiles"))).size, 3);
  assert.doesNotMatch(buildSql([entry]), /'postflop-profiles'/, "standard publication must preserve the profile revision");
});

test("SQLite partial imports preserve other profile units and standard histories", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  try {
    for (const name of ["0001_postflop.sql", "0002_postflop_reports.sql", "0012_postflop_profile_policies.sql"]) {
      db.exec(readFileSync(new URL(`../../backend/migrations/${name}`, import.meta.url), "utf8"));
    }
    const first = unit("nit"), other = unit("station");
    const otherSpot = { ...registered, id: "preserved_profile_spot" };
    const third = { ...unit("nit"), spot: otherSpot };
    db.exec(buildSql([entry], undefined, undefined, [first, other, third]));
    const standardBefore = db.prepare("SELECT * FROM postflop_policies").all();
    const standardVersionBefore = db.prepare("SELECT * FROM dataset_versions WHERE name = 'postflop'").get();
    const untouchedBefore = db.prepare("SELECT * FROM postflop_profile_policies WHERE profile = 'station' OR spot_id = 'preserved_profile_spot' ORDER BY profile, spot_id, opponent_seat, role, stage").all();
    const changed = structuredClone(first);
    changed.flop.villain.metadata.model = "new-authoring-model";
    const patch = buildSql([], undefined, undefined, [changed]);
    db.exec(patch); db.exec(patch); db.exec(buildSql([]));
    assert.deepEqual(db.prepare("SELECT * FROM postflop_policies").all(), standardBefore);
    assert.deepEqual(db.prepare("SELECT * FROM dataset_versions WHERE name = 'postflop'").get(), standardVersionBefore);
    assert.deepEqual(db.prepare("SELECT * FROM postflop_profile_policies WHERE profile = 'station' OR spot_id = 'preserved_profile_spot' ORDER BY profile, spot_id, opponent_seat, role, stage").all(), untouchedBefore);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM postflop_profile_policies").get().n, 12);
    assert.equal(JSON.parse(db.prepare("SELECT metadata_json FROM postflop_profile_policies WHERE profile = 'nit' AND spot_id = 'BTN_open_BB_call' AND role = 'villain' AND stage = 'flop'").get().metadata_json).model, "new-authoring-model");
    const profileBefore = db.prepare("SELECT * FROM postflop_profile_policies ORDER BY profile, spot_id, opponent_seat, role, stage").all();
    const versionBefore = db.prepare("SELECT * FROM dataset_versions WHERE name = 'postflop-profiles'").get();
    db.exec(buildSql([entry]));
    assert.deepEqual(db.prepare("SELECT * FROM postflop_profile_policies ORDER BY profile, spot_id, opponent_seat, role, stage").all(), profileBefore);
    assert.deepEqual(db.prepare("SELECT * FROM dataset_versions WHERE name = 'postflop-profiles'").get(), versionBefore);
  } finally { db.close(); }
});

test("a profile pair generated for a non-default (SB) opponent seat publishes with that seat", () => {
  const selected = POSTFLOP_SPOTS.find(spot => spot.id === "UTG_open_SB_call");
  assert.throws(() => loadInputs(selected.id, generationInputOptions(selected.id, "nit")), /unreachable/);
  const inputs = loadInputs(selected.id, generationInputOptions(selected.id, "nit", "oop"));
  const flop = {}, later = {};
  for (const role of ["villain", "exploit"]) {
    const metadata = { kind: "ai_estimate_not_gto", profile: "nit", role, spot: selected.id, tree: selected.tree, opponent_seat: "oop",
      source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash, config_version: config.version };
    const policy = referencePolicyFor(selected.tree), laterPolicy = referenceLaterPolicy();
    flop[role] = { metadata: { ...metadata, policy_hash: policySha(policy) }, policy };
    later[role] = { metadata: { ...metadata, policy_hash: policySha(laterPolicy), flop_policy_hash: flop[role].metadata.policy_hash }, policy: laterPolicy };
  }
  const item = { profile: "nit", spot: selected, flop, later, opponentSeat: "oop" };
  const published = publishableProfiles(() => {}, { spots: [selected], read: artifactsFor([item]) });
  assert.equal(published.length, 1);
  const mixed = structuredClone(item); mixed.later.exploit.metadata.opponent_seat = "ip";
  assert.throws(() => publishableProfiles(() => {}, { spots: [selected], read: artifactsFor([mixed]) }), /mixes opponent seats/);
});
