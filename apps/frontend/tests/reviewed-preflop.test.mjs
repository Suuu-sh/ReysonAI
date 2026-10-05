import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertReviewRecord, reviewedFiles, reviewedSourcePaths, assertDeliveryBundle, assertPublishedMetadata, sha256, REPOSITORY, REVIEW_FILE } from "../scripts/lib/reviewed-preflop.mjs";
import { isBlockingAuditFinding } from "../src/estimated/profile-audit-policy.ts";
const actual = { artifacts: [{ path: "data.json", bytes: 2, sha256: sha256("{}") }], sources: [], content_sha256: sha256("fixture") };
const record = { schema_version: 1, ...actual, review: { status: "independently-reviewed", generator: "local-only", reviewer: "fixture", scope: "test", baseline_commit: "a".repeat(40) } };
test("review gate rejects changed/missing/extra data and changed source identities", () => {
  assert.doesNotThrow(() => assertReviewRecord(record, structuredClone(actual)));
  for (const changed of [
    { ...actual, artifacts: [] },
    { ...actual, artifacts: [...actual.artifacts, actual.artifacts[0]] },
    { ...actual, artifacts: [{ ...actual.artifacts[0], sha256: "b".repeat(64) }] },
    { ...actual, sources: [{ path: "config.json", sha256: "c".repeat(64), bytes: 5 }] },
    { ...actual, content_sha256: "d".repeat(64) },
  ]) assert.throws(() => assertReviewRecord(record, changed), /changed/);
  assert.throws(() => assertReviewRecord({ ...record, review: { ...record.review, status: "generated" } }, actual), /independent/);
});
test("source graph binds sampler/RNG, dedicated evaluator, configs and scoped schema", () => {
  const paths = reviewedSourcePaths();
  for (const path of ["apps/frontend/scripts/lib/equity.ts", "apps/frontend/scripts/lib/continuation-evaluator.ts",
    "apps/frontend/src/estimated/continuation-defense.ts", "configs/cash-6max-100bb.json",
    "configs/multiway-preflop-stage2.json", "apps/backend/migrations/0003_preflop.sql",
    "apps/frontend/scripts/lib/typescript-policy-source.mjs", "configs/typescript-policy-source.review.json"])
    assert.ok(paths.includes(path), path);
});
test("committed review manifest matches every artifact and source byte", () => {
  const saved = JSON.parse(readFileSync(`${REPOSITORY}/${REVIEW_FILE}`, "utf8"));
  assertReviewRecord(saved, reviewedFiles());
  assert.deepEqual(saved.counts, { catalog: 3115, saved: 1611, unreachable: 1504, hands: 272259 });
});
test("delivery verification rejects substituted SQL or metadata", () => {
  const sql = "SELECT 1;\n", manifest = { schema_version: 1, sql: { sha256: sha256(sql), bytes: Buffer.byteLength(sql) }, datasets: [] };
  const expected = { sql, manifest };
  assert.doesNotThrow(() => assertDeliveryBundle(sql, structuredClone(manifest), expected));
  assert.throws(() => assertDeliveryBundle(sql + "--changed", manifest, expected), /differs/);
  assert.throws(() => assertDeliveryBundle(sql, { ...manifest, datasets: [{ name: "extra" }] }, expected), /differs/);
});
test("published metadata must match names, hashes, bytes and parts exactly", () => {
  const expected = { datasets: [{ name: "a", sha256: "h", bytes: 10, parts: 1 }] };
  const row = { name: "a", content_hash: "h", bytes: 10, parts: 1 };
  assert.doesNotThrow(() => assertPublishedMetadata([row], expected));
  for (const rows of [[], [row, row], [{ ...row, bytes: 11 }], [{ ...row, content_hash: "other" }], [{ ...row, parts: 2 }]])
    assert.throws(() => assertPublishedMetadata(rows, expected), /differ/);
});
test("merged profile warnings remain advisory without weakening Stage 2 errors", () => {
  assert.equal(isBlockingAuditFinding({ severity: "warn", check: "profile-strength-order" }), false);
  assert.equal(isBlockingAuditFinding({ severity: "error", check: "profile-strength-order" }), true);
  assert.equal(isBlockingAuditFinding({ severity: "error", check: "auto-profit" }), true);
  assert.equal(isBlockingAuditFinding({ severity: "warn", check: "ev-capacity-conflict" }), false);
});
