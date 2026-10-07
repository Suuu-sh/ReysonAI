import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hands } from "../src/data.ts";
import { stage3Spots } from "../src/estimated/stage3-tree.ts";
import { displayedMix, mix, rangeCheckPlan } from "../scripts/range.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
test("range check for only s3_ IDs selects isolated authoring and never external references", () => {
  assert.deepEqual(rangeCheckPlan(["s3_first", "s3_second"]), { stage3Only: true, buildArgs: ["--stage3-only"], compareExternalReferences: false });
  assert.deepEqual(rangeCheckPlan(["BTN_open"]), { stage3Only: false, buildArgs: [], compareExternalReferences: true });
  assert.throws(() => rangeCheckPlan(["s3_first", "BTN_open"]), /must not regenerate legacy/);
});
test("range Stage 3 display uses exact Hero own-action reach rather than all 1,326 combos", t => {
  const directory = mkdtempSync(join(tmpdir(), "stage3-cli-mix-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const node = stage3Spots.find(node => node.bet_level === 3 && node.source_factors[node.hero].length);
  const datasets = {};
  for (const factor of Object.values(node.source_factors).flat()) {
    const dataset = datasets[factor.dataset] ??= { spots: [] };
    let spot = dataset.spots.find(spot => spot.id === factor.spot_id);
    if (!spot) dataset.spots.push(spot = { id: factor.spot_id, hands: hands.map(hand => ({ hand })) });
    for (const row of spot.hands) row[factor.action] = 100;
  }
  const own = node.source_factors[node.hero][0];
  for (const row of datasets[own.dataset].spots.find(spot => spot.id === own.spot_id).hands) row[own.action] = row.hand === "AA" ? 100 : row.hand === "KK" ? 50 : 0;
  const spot = { ...structuredClone(node), unreachable: false, hands: hands.map(hand => ({ hand, call: hand === "AA" ? 100 : 0,
    fold: hand === "AA" ? 0 : 100, squeeze: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })) };
  (datasets["stage3-responses"] ??= { spots: [] }).spots.push(spot);
  for (const [name, data] of Object.entries(datasets)) writeFileSync(join(directory, `${name}.json`), JSON.stringify(data));
  const weighted = displayedMix(spot, directory);
  assert.ok(Math.abs(weighted.call - 100 * 6 / 9) < 1e-12);
  assert.ok(Math.abs(weighted.fold - 100 * 3 / 9) < 1e-12);
  assert.ok(Math.abs(mix(spot).call - weighted.call) > 60);
});
test("audit CLI rejects partial Stage 3 datasets and orphan reasons before legacy audit", t => {
  const directory = mkdtempSync(join(tmpdir(), "stage3-cli-audit-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const check = () => {
    const result = spawnSync(process.execPath, ["scripts/audit-estimates.mjs", "--dir", directory, "--json"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 20 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Partial Stage 3 artifacts/);
    assert.doesNotMatch(result.stderr, /call-equities.json.*ENOENT/);
  };
  writeFileSync(join(directory, "stage3-call-equities.json"), "{}"); check();
  rmSync(join(directory, "stage3-call-equities.json"));
  mkdirSync(join(directory, "reasons")); writeFileSync(join(directory, "reasons/s3_orphan.json"), "{}"); check();
});
