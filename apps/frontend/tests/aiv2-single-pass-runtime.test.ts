import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { singlePassConcurrency, runtimeCompatibleSource, runtimeCompatibilityReceipt } from "../scripts/aiv2-single-pass-runtime.ts";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const runnerName = "aiv2-single-pass-runner.ts";
const runner = readFileSync(new URL("../scripts/" + runnerName, import.meta.url), "utf8");
function sources() {
  const old = runtimeCompatibleSource(runnerName, runner);
  let updated = old;
  for (const { before, after } of runtimeCompatibilityReceipt.changes) updated = updated.replace(before, after);
  return { old, updated };
}
test("runtime concurrency supports gradual 4/6/8/10 without changing source identity", () => {
  assert.equal(singlePassConcurrency([]), 4);
  for (const concurrency of [1, 4, 6, 8, 10]) assert.equal(singlePassConcurrency([`--concurrency=${concurrency}`]), concurrency);
  for (const invalid of ["0", "11", "16", "1.5", "NaN", "", "-1"]) assert.throws(() => singlePassConcurrency([`--concurrency=${invalid}`]));
});
test("only exact reviewed runner patch preserves original full implementation hash", () => {
  const { old, updated } = sources();
  assert.equal(digest(old), runtimeCompatibilityReceipt.oldRunnerSha256);
  assert.equal(digest(updated), runtimeCompatibilityReceipt.newRunnerSha256);
  assert.equal(runtimeCompatibleSource(runnerName, updated), old);
  assert.equal(runtimeCompatibleSource(runnerName, old), old);
  const filenames = ["aiv2-single-pass.ts", runnerName, "aiv2-preflop.ts", "aiv2-preflop-graph.ts", "aiv2-preflop-consistency.ts", "aiv2-preflop-codec.ts", "aiv2-preflop-run-state.ts"];
  const oldSources = filenames.map(file => file === runnerName ? old : readFileSync(new URL("../scripts/" + file, import.meta.url), "utf8"));
  const currentSources = filenames.map(file => runtimeCompatibleSource(file, file === runnerName ? updated : readFileSync(new URL("../scripts/" + file, import.meta.url), "utf8")));
  assert.equal(digest(JSON.stringify(currentSources)), digest(JSON.stringify(oldSources)));
  // Other strategic source edits are never canonicalized away.
  const changedPrompt = [...currentSources]; changedPrompt[0] += "\nstrategy change";
  assert.notEqual(digest(JSON.stringify(changedPrompt)), digest(JSON.stringify(oldSources)));
});
test("unreviewed runner changes fail closed, including scheduling/model/provenance changes", () => {
  const { updated } = sources();
  for (const changed of [updated + "\n", updated.replace("singlePassConcurrency(argv)", "6"), updated.replace("AIV2_MODEL", "UNREVIEWED_MODEL"), updated.replace("source_hash", "other_hash")]) {
    assert.throws(() => runtimeCompatibleSource(runnerName, changed), /compatibility refused/);
  }
  assert.equal(runtimeCompatibleSource("aiv2-single-pass.ts", "any prompt source"), "any prompt source");
});
