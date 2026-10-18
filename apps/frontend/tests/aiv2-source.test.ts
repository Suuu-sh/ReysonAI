import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_DATASETS, dataset, datasetNames, hasCompleteAiv2Source, setDatasetSource } from "../src/estimated/datasets.ts";

const root = new URL("../src/estimated/aiv2/", import.meta.url);
const path = (name: string) => new URL(name, root);

test("AIv2 generation is complete, independently addressable, and checksum-covered", async () => {
  const manifest = JSON.parse(readFileSync(path("manifest.json"), "utf8"));
  assert.equal(manifest.source, "AIv2");
  assert.equal(manifest.strategy_identity, "ai_estimate_not_gto");
  assert.equal(manifest.coverage.scope, "preflop");
  assert.deepEqual(manifest.excluded, ["postflop strategies and board policies"]);
  assert.ok(APP_DATASETS.every(name => manifest.sha256[`${name}.json`]));
  assert.ok(manifest.coverage.profiles.length > 0);
  assert.ok(manifest.coverage.reasons.length > 0);
  for (const [name, hash] of Object.entries(manifest.sha256) as [string, string][]) {
    assert.equal(createHash("sha256").update(readFileSync(path(name))).digest("hex"), hash, name);
  }
  await datasetNames();
  assert.equal(hasCompleteAiv2Source(), true);
});

test("AIv2 is independently selected and preserves authored preflop rows", () => {
  setDatasetSource("ai");
  const original = dataset("preflop-ranges");
  setDatasetSource("aiv2");
  const rebuilt = dataset("preflop-ranges");
  assert.equal(rebuilt.entry_count, 2535);
  assert.deepEqual(rebuilt.spots.map(spot => ({ id: spot.id, hands: spot.hands })), original.spots.map(spot => ({ id: spot.id, hands: spot.hands })));
  setDatasetSource("ai");
});
