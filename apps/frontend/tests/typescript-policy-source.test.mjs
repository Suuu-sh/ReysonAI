import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { policySourceBytes } from "../scripts/lib/typescript-policy-source.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "typescript-policy-source-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const legacy = "export const twice = n => n * 2;\n";
  const current = "export const twice = (n: number) => n * 2;\n";
  writeFileSync(join(directory, "policy.ts"), current);
  const receipt = { schema_version: 1, sources: { "policy.mjs": {
    path: "policy.ts", current_sha256: digest(current), legacy_sha256: digest(legacy), legacy_source: legacy,
  } } };
  return { root: pathToFileURL(`${directory}/`), receipt, directory, legacy, current };
}

test("only the exact reviewed current and historical source pair retains the historical identity", t => {
  const f = fixture(t);
  assert.equal(policySourceBytes("policy.mjs", f).toString(), f.legacy);
  writeFileSync(join(f.directory, "policy.ts"), `${f.current}// unreviewed change\n`);
  assert.notEqual(digest(policySourceBytes("policy.mjs", f)), digest(f.legacy));
});

test("altered historical snapshot cannot bypass source freshness", t => {
  const f = fixture(t);
  f.receipt.sources["policy.mjs"].legacy_source += "// changed snapshot\n";
  assert.equal(policySourceBytes("policy.mjs", f).toString(), f.current);
});

test("unmapped policy sources are still hashed byte-for-byte and missing files fail closed", t => {
  const f = fixture(t);
  writeFileSync(join(f.directory, "other.ts"), "export const value = 1;\n");
  assert.equal(policySourceBytes("other.ts", f).toString(), "export const value = 1;\n");
  assert.throws(() => policySourceBytes("missing.ts", f), /ENOENT/);
});
