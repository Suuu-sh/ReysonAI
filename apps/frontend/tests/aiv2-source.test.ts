import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { APP_DATASETS, configureDatasetSource, dataset, datasetNames, hasCompleteAiv2Source, setDatasetSource } from "../src/estimated/datasets.ts";
import { AIV2_METHOD, AIV2_PRE_FLOP_DATASETS, AIV2_PROFILE_DATASETS, AIV2_PROFILES, isCompleteAiv2Manifest } from "../src/estimated/aiv2-contract.ts";
import { preflopDatasetEntries } from "../scripts/lib/preflop-sql.ts";

test("unreviewed legacy AIv2 artifacts are absent and the source fails closed", async () => {
  assert.equal(existsSync(new URL("../src/estimated/aiv2", import.meta.url)), false);
  assert.equal(await configureDatasetSource("aiv2"), false);
  assert.equal(hasCompleteAiv2Source(), false);
  const names = await datasetNames();
  assert.ok(APP_DATASETS.every(name => names.includes(name)));
  assert.equal(names.some(name => name.startsWith("aiv2/")), false);
  const fixture = mkdtempSync(join(tmpdir(), "aiv2-publication-filter-"));
  try {
    mkdirSync(join(fixture, "aiv2"), { recursive: true });
    writeFileSync(join(fixture, "opening-ranges.json"), "{}");
    writeFileSync(join(fixture, "aiv2/manifest.json"), JSON.stringify({ source: "AIv2", status: "invalidated", method: "legacy-deterministic-not-valid-for-aiv2" }));
    writeFileSync(join(fixture, "aiv2/opening-ranges.json"), "{}");
    assert.deepEqual([...preflopDatasetEntries(fixture)].map(([name]) => name), ["opening-ranges"]);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
  setDatasetSource("ai");
  assert.equal(dataset("preflop-ranges").entry_count, 2535);
});

test("AIv2 source readiness requires full preflop/profile/reason coverage and checksums", () => {
  const datasets = AIV2_PRE_FLOP_DATASETS.map(name => `${name}.json`);
  const profiles = [...AIV2_PROFILES.flatMap(profile => AIV2_PROFILE_DATASETS.map(name => `profiles/${profile}/villain/${name}.json`)),
    ...AIV2_PROFILES.map(profile => `profiles/${profile}/villain/meta.json`)];
  const reasons = Array.from({ length: 2100 }, (_, index) => `spot-${index}.json`);
  const required = [...datasets, ...profiles, ...reasons.map(name => `reasons/${name}`)];
  const manifest = { source: "AIv2", status: "complete", method: AIV2_METHOD,
    coverage: { scope: "preflop", spots: 2116, actionable_spots: 2100, hand_classes: 357604,
      concrete_combo_instances: 2784600, reasons, datasets, profiles },
    sha256: Object.fromEntries(required.map(path => [path, "a".repeat(64)])) };
  assert.equal(isCompleteAiv2Manifest(manifest), true);
  assert.equal(isCompleteAiv2Manifest({ ...manifest, coverage: { ...manifest.coverage, reasons: reasons.slice(1) } }), false);
  const missing = { ...manifest, coverage: { ...manifest.coverage, datasets: datasets.slice(1) } };
  assert.equal(isCompleteAiv2Manifest(missing), false);
});
