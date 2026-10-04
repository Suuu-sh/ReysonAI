import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertContinuationPublication } from "../scripts/lib/continuation-publication.mjs";

test("a clean checkout cannot silently create a destructive legacy-only publication snapshot", t => {
  const dir = mkdtempSync(join(tmpdir(), "continuation-publication-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => assertContinuationPublication(dir), /Stage 2 artifacts are absent/);
  assert.deepEqual(assertContinuationPublication(dir, { allowLegacyOnly: true }), { status: "legacy-only" });
  writeFileSync(join(dir, "continuation-responses.json"), "{}");
  assert.throws(() => assertContinuationPublication(dir, { allowLegacyOnly: true }), /Partial Stage 2/);
});

test("orphan continuation reasons never qualify as an intentionally empty generation", t => {
  const dir = mkdtempSync(join(tmpdir(), "continuation-publication-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "reasons")); writeFileSync(join(dir, "reasons/sq_stale.json"), "{}");
  assert.throws(() => assertContinuationPublication(dir, { allowLegacyOnly: true }), /Partial Stage 2/);
});

const dir = new URL("../src/estimated/", import.meta.url).pathname;
test("installed Stage 2 publication passes the complete audit and compact reason freshness gate", {
  skip: existsSync(join(dir, "continuation-responses.json")) ? false : "Generated Stage 2 artifacts are not installed",
}, () => assert.deepEqual(assertContinuationPublication(dir), { status: "complete", spots: 1611, catalog: 3115 }));
