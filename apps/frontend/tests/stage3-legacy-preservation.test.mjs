import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isStage3ArtifactPath, sha256Stage3, stage3FileRecord } from "../scripts/lib/stage3-artifacts.mjs";
import { policySourceBytes } from "../scripts/lib/typescript-policy-source.mjs";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const bytes = readFileSync(new URL("./fixtures/stage3-legacy-baseline.json", import.meta.url));
const baseline = JSON.parse(bytes);
const fiveBetPath = "apps/frontend/src/estimated/five-bet-responses.json";
const historicalFiveBet = "4f1b78b45e364c14f93cbe19cb7bef6e4ecfbc9076fd79d0834d2dd3b4b91d7c";
const approvedFiveBet = "86a34ea4c482b9987c77112f6e64ba0940234ae262c6c460b0ad086c6a40476b";
// These five exact changes were independently approved in PR86; this test is
// not a new approval or a generic historical/current-hash alternative.
const amendment = Object.freeze([
  { path: fiveBetPath, bytes: 871890, historical: historicalFiveBet, approved: approvedFiveBet,
    normalized: "41203415b625e3dedb0d2444e8b3d78afd70d57bd1dac443cbc4ed74ee59a619" },
  { path: "apps/frontend/src/estimated/profiles/nit/villain/meta.json", bytes: 4679,
    historical: "a5fe39ff5aaf11ad558544ec14a6ecc7da90c17a2f71261ca220fb9d72b4997f", approved: "e7f937fc1c1b7ebb9381886a71ca4a7782499652c75321f06367bcb005853249",
    normalized: "9a7962ef4d9a1c2bc0e4d027f2ebbee0b8bd25d5e84c9604f2c5044cb8f7bbcf" },
  { path: "apps/frontend/src/estimated/profiles/station/villain/meta.json", bytes: 4767,
    historical: "139041bd129507aefa5d6703ba2b2662982b3ae90d0f1787acf08ebb5181c3c9", approved: "05443e075c6ec95e9d19441a9ffe655ed9f6e8a9bae040e69184c0134dd8ce77",
    normalized: "7994406f62cd10b062b7ba826c2256ee870eaf5bf699c59e46df85936968a07a" },
  { path: "apps/frontend/src/estimated/profiles/lag/villain/meta.json", bytes: 4504,
    historical: "9b2c390fb9f14aa5f9f457993ab56e27c3cd298c0dd23c990a97f83c0b5a1b26", approved: "12cbf7299d4b63c56e51e676327ae3a272b155d407139b0792be93bc480192f7",
    normalized: "8183cde25679148fb7844e102a843965d455ed61a5c38ac58e8fde698455f20b" },
  { path: "apps/frontend/src/estimated/profiles/maniac/villain/meta.json", bytes: 4755,
    historical: "f6bf5ba0b64922c4bc96f12eb5b7f917c5f668db6677b51f68abb899f48c16a0", approved: "35991dc4f545e893c060aef5196bbf4e840f4f68c6e73884f9a1d716015731d9",
    normalized: "ffb8ef91d3fd17d6fc9b2baab57573386a2b05380411de7724535ac2f06b4630" },
].map(Object.freeze));
const approvalBytes = readFileSync(resolve(root, "apps/frontend/docs/pr86-independent-copy-approval.json"));
assert.equal(sha256Stage3(approvalBytes), "ad5c2ada8e117bbe59a58c8d59588367e2a70016ccc069b0f3a46397a40a4e53");
const approval = JSON.parse(approvalBytes);
function assertAmendment(entries = amendment) {
  assert.deepEqual(entries, amendment, "Only the exact five PR86 amendments are permitted");
  assert.equal(approval.decision, "APPROVE_NARROW_COPY_AND_EXACT_METADATA_AMENDMENT");
  assert.deepEqual(approval.artifact_change.before, { bytes: 871890, sha256: historicalFiveBet });
  assert.deepEqual(approval.artifact_change.after, { bytes: 871890, sha256: approvedFiveBet });
  assert.equal(approval.artifact_change.path, fiveBetPath);
  assert.equal(approval.approved_profile_reference_amendments.length, 4);
  for (const entry of entries) {
    assert.deepEqual(baseline.artifacts.find(item => item.path === entry.path), { path: entry.path, bytes: entry.bytes, sha256: entry.historical });
    if (entry.path !== fiveBetPath) {
      assert.deepEqual(approval.approved_profile_reference_amendments.find(item => item.path === entry.path), {
        path: entry.path, bytes: entry.bytes, before_sha256: entry.historical, after_sha256: entry.approved,
        field: "balanced_source_sha256.five-bet-responses", before_value: historicalFiveBet, after_value: approvedFiveBet,
      });
    }
  }
}
function assertArtifact(item, body) {
  const entry = amendment.find(entry => entry.path === item.path);
  if (!entry) {
    assert.deepEqual({ path: item.path, bytes: body.length, sha256: sha256Stage3(body) }, item, item.path);
    return;
  }
  assert.equal(body.length, entry.bytes, item.path);
  assert.equal(sha256Stage3(body), entry.approved, item.path);
  const value = JSON.parse(body);
  if (item.path === fiveBetPath) {
    for (const spot of value.spots) for (const hand of spot.hands) delete hand.reason;
  } else {
    assert.equal(value.balanced_source_sha256["five-bet-responses"], approvedFiveBet);
    value.balanced_source_sha256["five-bet-responses"] = historicalFiveBet;
  }
  // Profile hashes are fixed JSON.stringify hashes of the original Git blobs
  // at baseline61e457f4, never calculated from the current candidate as expectations.
  assert.equal(sha256Stage3(JSON.stringify(value)), entry.normalized, item.path);
}
const jsonPaths = directory => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
  const path = `${directory}/${entry.name}`;
  return entry.isDirectory() ? jsonPaths(path) : entry.name.endsWith(".json") ? [path] : [];
});
test("Stage 3 immutable baseline is the independently captured development snapshot", () => {
  assert.equal(sha256Stage3(bytes), "4f8dfddc112fb879b665fcdd337a53c72272c09dfc50baa1d61d328b586c32b8");
  assert.equal(baseline.baseline_commit, "61e457f4e35d8e28b2476b304a118b89dbf4be1f");
  assert.equal(baseline.baseline_tree, "1387907dae53f1f63c09f3ac200641726f17b267");
  assert.equal(baseline.artifacts.length, 1888);
  assert.equal(baseline.protected_sources.length, 19);
});
test("all1888 legacy records retain1883 exact bytes and only five independently approved PR86 copy references", () => {
  assertAmendment();
  assert.equal(baseline.artifacts.filter(item => !amendment.some(entry => entry.path === item.path)).length, 1883);
  for (const item of baseline.artifacts) assertArtifact(item, readFileSync(resolve(root, item.path)));
  assert.deepEqual(jsonPaths("apps/frontend/src/estimated").filter(path => !isStage3ArtifactPath(path)).sort(), baseline.artifacts.map(item => item.path));
});
test("PR86 exception inventory rejects extra, missing, wrong historical and wrong approved hashes", () => {
  for (const entries of [
    [...amendment, { ...amendment[0], path: "unrelated.json" }], amendment.slice(1),
    amendment.map((entry, index) => index ? entry : { ...entry, historical: "0".repeat(64) }),
    amendment.map((entry, index) => index ? entry : { ...entry, approved: "0".repeat(64) }),
  ]) assert.throws(() => assertAmendment(entries));
});
test("equity/call/fold and any extra explanation edits cannot borrow the PR86 amendment", () => {
  const item = baseline.artifacts.find(item => item.path === fiveBetPath);
  const original = JSON.parse(readFileSync(resolve(root, item.path)));
  for (const field of ["equity_vs_shove_pct", "call", "fold", "reason"]) {
    const value = structuredClone(original), hand = value.spots[0].hands[0];
    assert.equal(typeof hand[field], field === "reason" ? "string" : "number");
    hand[field] = field === "reason" ? hand[field] + " arbitrary extra explanation" : hand[field] + 1;
    assert.throws(() => assertArtifact(item, Buffer.from(JSON.stringify(value))), field);
  }
});
test("profile fields outside the exact five-bet reference and unrelated legacy files remain protected", () => {
  for (const entry of amendment.slice(1)) {
    const item = baseline.artifacts.find(item => item.path === entry.path);
    const value = JSON.parse(readFileSync(resolve(root, item.path)));
    value.unapproved_extra_field = 1;
    assert.throws(() => assertArtifact(item, Buffer.from(JSON.stringify(value))));
  }
  const item = baseline.artifacts.find(item => item.path === "apps/frontend/src/estimated/opening-ranges.json");
  assert.throws(() => assertArtifact(item, Buffer.concat([readFileSync(resolve(root, item.path)), Buffer.from(" ")])));
});
test("Stage 2 historical policy identities and raw archive bytes remain unchanged", () => {
  for (const item of baseline.protected_sources) {
    const bytes = item.path.startsWith("apps/frontend/")
      ? policySourceBytes(item.path.slice("apps/frontend/".length)) : readFileSync(resolve(root, item.path));
    assert.deepEqual({ path: item.path, bytes: bytes.length, sha256: sha256Stage3(bytes) }, item, item.path);
  }
  const { format, ...archive } = baseline.stage2_archive;
  assert.equal(format, "ustar+gzip");
  assert.deepEqual(stage3FileRecord(root, archive.path), archive);
  assert.equal(sha256Stage3(readFileSync(resolve(root, archive.path))), "b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a");
});
