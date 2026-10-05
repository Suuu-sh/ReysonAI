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
test("every 1888 pre-existing JSON artifact stays byte-identical and no legacy file disappears", () => {
  for (const item of baseline.artifacts) assert.deepEqual(stage3FileRecord(root, item.path), item, item.path);
  assert.deepEqual(jsonPaths("apps/frontend/src/estimated").filter(path => !isStage3ArtifactPath(path)).sort(), baseline.artifacts.map(item => item.path));
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
