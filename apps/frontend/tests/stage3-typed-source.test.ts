import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import receipt from "../../../configs/typescript-policy-source.review.json" with { type: "json" };
import migration from "../../../configs/typescript-policy-source-migration-proposal.json" with { type: "json" };
import { policySourceBytes } from "../scripts/lib/typescript-policy-source.ts";
import { STAGE3_REASON_POLICY_FILES } from "../scripts/lib/stage3-reasons.ts";
import { reviewedSourcePaths } from "../scripts/lib/reviewed-preflop.ts";
import { reviewedStage3SourcePaths } from "../scripts/lib/reviewed-stage3.ts";
const digest = value => createHash("sha256").update(value).digest("hex");

test("Stage3 preserves every historical fingerprint source name and its order", () => {
  assert.equal(digest(JSON.stringify(STAGE3_REASON_POLICY_FILES)), "230d77138ef6734f8a852d564361f692c8ecfbf5aa86a43ba46676a22fa54789");
});

test("immutable historical compatibility pairs bind independently reviewed current TypeScript replacements", () => {
  for (const [name, record] of Object.entries(receipt.sources)) {
    const replacement = migration.sources.find(source => source.historical_name === name)!;
    assert.ok(replacement?.inherited, `${name}: migration must retain every existing historical pair`);
    assert.equal(replacement.baseline_path, record.path, name);
    assert.equal(replacement.baseline_sha256, record.current_sha256, name);
    assert.equal(replacement.legacy_source, record.legacy_source, name);
    assert.equal(replacement.legacy_sha256, record.legacy_sha256, name);
    const current = readFileSync(new URL(`../${replacement.current_path}`, import.meta.url));
    assert.equal(current.length, replacement.current_bytes, name);
    assert.equal(digest(current), replacement.current_sha256, name);
    assert.equal(digest(record.legacy_source), record.legacy_sha256, name);
    // This succeeds only when the separate exact-current source overlay is
    // independently approved; a proposal alone cannot renew a historical hash.
    assert.equal(digest(policySourceBytes(name)), record.legacy_sha256, name);
  }
});

test("no compatibility pair hides a changed current source or corrupted historical snapshot", () => {
  for (const [name, record] of Object.entries(receipt.sources)) {
    const replacement = migration.sources.find(source => source.historical_name === name)!;
    const current = readFileSync(new URL(`../${replacement.current_path}`, import.meta.url));
    for (const corrupt of [{ current_sha256: "0".repeat(64) }, { legacy_source: record.legacy_source + "\n// changed" }, { legacy_sha256: "0".repeat(64) }]) {
      const altered = { ...receipt, sources: { ...receipt.sources, [name]: { ...record, ...corrupt } } };
      assert.deepEqual(policySourceBytes(name, { receipt: altered }), current, name);
    }
  }
});

test("receipt source graphs bind adjacent declarations and the exact compatibility receipt", () => {
  const paths = reviewedSourcePaths();
  for (const name of ["multiway-inputs", "range-support"]) {
    assert.ok(paths.includes(`apps/frontend/scripts/postflop-ai/${name}.d.mts`), name);
  }
  // Adopted HU-v7 no longer imports the separate observable-v10 experiment.
  for (const name of ["exact-river-call-ev", "observable-actions", "observable-view-paths"]) {
    for (const extension of ["ts", "d.mts"]) assert.ok(!paths.includes(`apps/frontend/scripts/postflop-ai/${name}.${extension}`), name);
  }
  for (const graph of [paths, reviewedStage3SourcePaths()]) {
    assert.ok(graph.includes("configs/typescript-policy-source.review.json"));
    assert.ok(graph.includes("apps/frontend/src/estimated/stage3-types.ts"));
    assert.ok(!graph.includes("apps/frontend/src/estimated/continuation-responses.json"));
  }
});
