import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import baseline from "./fixtures/stage2-legacy-baseline.json" with { type: "json" };
import { gameConfig } from "../src/estimated/sizing.ts";
import { artifactPaths, config, loadInputs, useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { buildInputs } from "../scripts/postflop-ai/browser-inputs.ts";
import { loadCandidate, loadLaterCandidate, sha } from "../scripts/postflop-ai/generate.mjs";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";

// Pinned from development 9a787954, before stage two. Keeping file hashes and
// source identities in a small fixture makes this guard work without Git or
// the optional, private .local policy artifacts. Do not refresh it from stage2
// output to bless an unrelated legacy change. The one explicit independently
// reviewed copy-only amendment below requires both exact raw and non-reason hashes.
const legacyRoot = new URL("../src/estimated/", import.meta.url);
const bytesHash = bytes => createHash("sha256").update(bytes).digest("hex");

// These constants bind the narrow independent approval, never current file bytes.
const approvedCopyAmendment = {
  "file": "five-bet-responses.json",
  "original_sha256": "4f1b78b45e364c14f93cbe19cb7bef6e4ecfbc9076fd79d0834d2dd3b4b91d7c",
  "approved_sha256": "86a34ea4c482b9987c77112f6e64ba0940234ae262c6c460b0ad086c6a40476b",
  "non_reason_json_sha256": "41203415b625e3dedb0d2444e8b3d78afd70d57bd1dac443cbc4ed74ee59a619",
  "reviewed_commit": "e024e78065c50ee1396758580576d173fd614546",
  "review_report": "apps/frontend/docs/pr86-independent-copy-approval.json",
  "scope": "83 explanation-only changes: 81 displayed-margin tokens, 2 displayed-equity tokens; all 2535 non-reason rows unchanged."
};
function assertAmendmentInventory(fixture) {
  assert.deepEqual(fixture.copy_only_amendments, [approvedCopyAmendment]);
  assert.equal(fixture.legacy_json_sha256[approvedCopyAmendment.file], approvedCopyAmendment.original_sha256);
}
function assertFiveBetNonReason(data) {
  const copy = structuredClone(data);
  for (const spot of copy.spots) for (const row of spot.hands) delete row.reason;
  assert.equal(bytesHash(JSON.stringify(copy)), approvedCopyAmendment.non_reason_json_sha256, "five-bet non-reason fields changed");
}
function assertLegacyBytes(name, bytes) {
  if (name === approvedCopyAmendment.file) {
    assert.equal(bytesHash(bytes), approvedCopyAmendment.approved_sha256, "five-bet approved raw bytes changed");
    assertFiveBetNonReason(JSON.parse(bytes));
  } else {
    assert.equal(bytesHash(bytes), baseline.legacy_json_sha256[name], name);
  }
}

const ranges = Object.fromEntries([
  "opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "limp-responses", "limp-deep-responses",
].map(name => [name, JSON.parse(readFileSync(new URL(`${name}.json`, legacyRoot), "utf8"))]));
// This immutable fixture is the original HU boundary. New history families
// have separate product/fingerprint coverage in postflop-multiway.test.mjs.
const spots = POSTFLOP_SPOTS.filter(spot => spot.reachable && Object.hasOwn(baseline.hu_source_hashes, spot.id));

test("stage two leaves the shared game configuration byte-identical to development", () => {
  assert.equal(bytesHash(readFileSync(new URL("../../../configs/cash-6max-100bb.json", import.meta.url))), baseline.shared_config_sha256);
  assert.equal(Object.hasOwn(gameConfig.sizing.fixed_raise_to_bb, "four_bet_after_two_caller_squeeze"), false);
});

test("241 historical files retain bytes and one reviewed copy amendment retains every non-reason field", () => {
  assertAmendmentInventory(baseline);
  assert.equal(Object.keys(baseline.legacy_json_sha256).length, 242);
  for (const name of Object.keys(baseline.legacy_json_sha256)) {
    assertLegacyBytes(name, readFileSync(new URL(name, legacyRoot)));
  }
});

test("copy amendment rejects extra paths, numeric drift, further copy edits and other legacy changes", () => {
  const fixture = structuredClone(baseline);
  fixture.copy_only_amendments.push({ ...approvedCopyAmendment, file: "opening-ranges.json" });
  assert.throws(() => assertAmendmentInventory(fixture));
  fixture.copy_only_amendments = [{ ...approvedCopyAmendment, file: "opening-ranges.json" }];
  assert.throws(() => assertAmendmentInventory(fixture));
  for (const key of ["original_sha256", "approved_sha256", "non_reason_json_sha256"]) {
    const changed = structuredClone(baseline);
    changed.copy_only_amendments[0][key] = "0".repeat(64);
    assert.throws(() => assertAmendmentInventory(changed));
  }
  const bytes = readFileSync(new URL(approvedCopyAmendment.file, legacyRoot));
  const data = JSON.parse(bytes);
  for (const mutate of [
    row => { row.equity_vs_shove_pct += 0.1; },
    row => { row.call -= 5; row.fold += 5; },
  ]) {
    const changed = structuredClone(data);
    const row = changed.spots.flatMap(spot => spot.hands).find(row => row.equity_vs_shove_pct !== null && row.call >= 5);
    mutate(row);
    assert.throws(() => assertFiveBetNonReason(changed), /non-reason fields changed/);
  }
  const copyChanged = structuredClone(data);
  copyChanged.spots[0].hands[0].reason += "追加文。";
  assert.doesNotThrow(() => assertFiveBetNonReason(copyChanged));
  assert.throws(() => assertLegacyBytes(approvedCopyAmendment.file, Buffer.from(JSON.stringify(copyChanged))), /approved raw bytes changed/);
  assert.throws(() => assertLegacyBytes("opening-ranges.json", Buffer.concat([
    readFileSync(new URL("opening-ranges.json", legacyRoot)), Buffer.from("\n"),
  ])), /opening-ranges.json/);
});

test("every existing HU source fingerprint remains fresh in Node and browser inputs", () => {
  // 44 original published spots plus the already catalogued limp 4bet call.
  assert.equal(spots.length, 45);
  assert.deepEqual(spots.map(spot => spot.id).sort(), Object.keys(baseline.hu_source_hashes).sort());
  for (const spot of spots) {
    const expected = baseline.hu_source_hashes[spot.id];
    assert.equal(loadInputs(spot.id).fingerprint, expected, `${spot.id}: Node`);
    assert.equal(buildInputs(spot.id, ranges).fingerprint, expected, `${spot.id}: browser`);
  }
});

// These test-only envelopes contain reference rules, not published strategies.
// Their source hashes are independently pinned to the pre-stage-two baseline,
// so the real saved-policy loaders reproduce the stale-source failure even on
// a clean checkout that has no private .local artifacts.
function baselineCandidates(spot) {
  const source_hash = baseline.hu_source_hashes[spot.id], policy = referencePolicyFor(spot.tree);
  const candidate = { policy, metadata: { source_hash, config_version: config.version,
    spot: spot.id, tree: spot.tree, policy_hash: sha(policy) } };
  const laterPolicy = referenceLaterPolicy();
  return { candidate, laterCandidate: { policy: laterPolicy, metadata: { source_hash,
    flop_policy_hash: candidate.metadata.policy_hash, policy_hash: sha(laterPolicy) } } };
}

test("saved flop and later-policy loaders accept all baseline-pinned HU policy fixtures", () => {
  const previous = useArtifactSource({ ranges, artifact: (spot, kind) => baselineCandidates(spot)[kind] });
  try {
    for (const spot of spots) {
      const inputs = loadInputs(spot.id), candidate = loadCandidate(inputs);
      assert.equal(candidate.metadata.source_hash, baseline.hu_source_hashes[spot.id], spot.id);
      assert.equal(loadLaterCandidate(inputs, candidate).metadata.source_hash, baseline.hu_source_hashes[spot.id], spot.id);
    }
  } finally { useArtifactSource(previous); }
});

test("an unrelated stage-two key in the shared config still fails closed for baseline policies", () => {
  const fixed = gameConfig.sizing.fixed_raise_to_bb;
  const original = Object.getOwnPropertyDescriptor(fixed, "four_bet_after_two_caller_squeeze");
  const previous = useArtifactSource({ ranges, artifact: (spot, kind) => baselineCandidates(spot)[kind] });
  try {
    fixed.four_bet_after_two_caller_squeeze = 30;
    for (const spot of spots) {
      const inputs = loadInputs(spot.id), { candidate } = baselineCandidates(spot);
      assert.notEqual(inputs.fingerprint, baseline.hu_source_hashes[spot.id]);
      assert.throws(() => loadCandidate(inputs), /AI policy source is stale/, spot.id);
      assert.throws(() => loadLaterCandidate(inputs, candidate), /Later AI policy source or flop policy is stale/, spot.id);
    }
  } finally {
    if (original) Object.defineProperty(fixed, "four_bet_after_two_caller_squeeze", original);
    else delete fixed.four_bet_after_two_caller_squeeze;
    useArtifactSource(previous);
  }
});

const savedSpots = spots.filter(spot => {
  const paths = artifactPaths(spot);
  return existsSync(paths.candidate) || existsSync(paths.laterCandidate);
});
test("available local saved HU policy artifacts remain fresh without regeneration", {
  skip: !savedSpots.length && "private .local policy artifacts are unavailable; baseline-pinned loader checks run above",
}, () => {
  for (const spot of savedSpots) {
    const inputs = loadInputs(spot.id), candidate = loadCandidate(inputs);
    if (existsSync(artifactPaths(spot).laterCandidate)) assert.ok(loadLaterCandidate(inputs, candidate), spot.id);
  }
});
