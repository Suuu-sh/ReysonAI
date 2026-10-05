import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertStage3ReviewRecord, reviewedStage3SourcePaths } from "../scripts/lib/reviewed-stage3.mjs";
import { isStage3ArtifactPath, STAGE3_DATASETS, STAGE3_ARCHIVE_FORMAT, sha256Stage3 } from "../scripts/lib/stage3-artifacts.mjs";
import { reviewedSourcePaths } from "../scripts/lib/reviewed-preflop.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const workflow = readFileSync(new URL("../../../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
const actual = { artifacts: STAGE3_DATASETS.map(name => ({ path: `apps/frontend/src/estimated/${name}.json`, bytes: 2, sha256: sha256Stage3("{}") })),
  sources: [], archive: { path: "artifacts/preflop/stage3-reviewed.tar.gz", bytes: 100, sha256: "a".repeat(64), format: STAGE3_ARCHIVE_FORMAT }, content_sha256: sha256Stage3("fixture") };
const record = { schema_version: 1, ...actual, review: { status: "independently-reviewed", generator: "local-only", reviewer: "isolated test fixture", scope: "receipt guards", baseline_commit: "a".repeat(40) } };
test("Stage 3 review gate rejects unapproved candidates and changed artifact/source/archive identities", () => {
  assert.doesNotThrow(() => assertStage3ReviewRecord(record, structuredClone(actual)));
  assert.throws(() => assertStage3ReviewRecord({ ...record, archive: { ...record.archive, format: "ustar+gzip" } }, actual), /Unsupported Stage 3 archive format/);
  for (const changed of [
    { ...actual, artifacts: [] }, { ...actual, artifacts: [...actual.artifacts, actual.artifacts[0]] },
    { ...actual, sources: [{ path: "config.json", bytes: 2, sha256: "b".repeat(64) }] },
    { ...actual, archive: { ...actual.archive, sha256: "c".repeat(64) } }, { ...actual, content_sha256: "d".repeat(64) },
  ]) assert.throws(() => assertStage3ReviewRecord(record, changed), /changed|missing/);
  for (const review of [{ ...record.review, status: "pending-independent-review" }, { ...record.review, reviewer: "" }, { ...record.review, generator: "CI" }])
    assert.throws(() => assertStage3ReviewRecord({ ...record, review }, actual), /independent Stage 3 review/);
});
test("Stage 3 storage namespace cannot absorb any legacy artifact or traversing filename", () => {
  for (const name of STAGE3_DATASETS) assert.equal(isStage3ArtifactPath(`apps/frontend/src/estimated/${name}.json`), true);
  assert.equal(isStage3ArtifactPath("apps/frontend/src/estimated/reasons/s3_valid_ID.json"), true);
  for (const path of ["apps/frontend/src/estimated/preflop-ranges.json", "apps/frontend/src/estimated/continuation-responses.json",
    "apps/frontend/src/estimated/reasons/sq_old.json", "apps/frontend/src/estimated/reasons/s3_../evil.json", "/apps/frontend/src/estimated/stage3-responses.json"])
    assert.equal(isStage3ArtifactPath(path), false, path);
});
test("both review source graphs bind isolated Stage 3 authoring and safe delivery dependencies", () => {
  const stage3 = reviewedStage3SourcePaths(), stage2 = reviewedSourcePaths();
  for (const path of ["configs/multiway-preflop-stage3.json", "apps/frontend/src/estimated/stage3-catalog.ts",
    "apps/frontend/scripts/generate-stage3-responses.mjs", "apps/frontend/scripts/lib/stage3-profiles.mjs",
    "apps/frontend/src/estimated/stage3-tree.ts", "apps/frontend/src/estimated/stage3-model.ts", "apps/frontend/src/estimated/stage3-call-ev.ts",
    "apps/frontend/src/estimated/stage3-audit.ts", "apps/frontend/src/estimated/stage3-coverage.ts", "apps/frontend/src/estimated/stage3-reason-format.ts",
    "apps/frontend/scripts/lib/continuation-evaluator.mjs", "apps/frontend/scripts/lib/equity.mjs",
    "apps/frontend/scripts/package-reviewed-stage3.py", "apps/frontend/scripts/restore-reviewed-stage3.mjs", ".github/workflows/deploy-worker.yml"])
    for (const paths of [stage2, stage3]) assert.ok(paths.includes(path), path);
  assert.ok(stage3.includes("configs/multiway-preflop-stage2.review.json"));
  assert.ok(stage3.includes("apps/frontend/tests/fixtures/stage3-legacy-baseline.json"));
});
test("review source graphs follow static-literal dynamic imports and their recursive dependencies", t => {
  const fixture = mkdtempSync(join(tmpdir(), "stage3-review-source-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const repository = fileURLToPath(new URL("../../..", import.meta.url));
  for (const path of new Set([...reviewedSourcePaths(), ...reviewedStage3SourcePaths()])) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true }); copyFileSync(join(repository, path), join(fixture, path));
  }
  writeFileSync(join(fixture, "apps/frontend/scripts/build-stage3.mjs"), 'export const load = () => import("./lib/stage3-dynamic-fixture.mjs");\n');
  writeFileSync(join(fixture, "apps/frontend/scripts/lib/stage3-dynamic-fixture.mjs"), 'export { child } from "./stage3-dynamic-child.mjs";\n');
  writeFileSync(join(fixture, "apps/frontend/scripts/lib/stage3-dynamic-child.mjs"), 'export const child = true;\n');
  for (const paths of [reviewedSourcePaths(fixture), reviewedStage3SourcePaths(fixture)]) {
    assert.ok(paths.includes("apps/frontend/scripts/lib/stage3-dynamic-fixture.mjs"));
    assert.ok(paths.includes("apps/frontend/scripts/lib/stage3-dynamic-child.mjs"));
    assert.ok(paths.includes("apps/frontend/scripts/generate-stage3-responses.mjs"));
    assert.ok(paths.includes("apps/frontend/scripts/lib/stage3-profiles.mjs"));
  }
});
test("Actions restores both reviewed archives before full verification and never authors Stage 3", () => {
  assert.match(workflow, /name: Verify reviewed preflop snapshot/);
  const verification = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  deploy:"));
  assert.match(verification, /lfs: true/);
  assert.ok(verification.indexOf("restore-reviewed-preflop.mjs") < verification.indexOf("restore-reviewed-stage3.mjs"));
  assert.ok(verification.indexOf("restore-reviewed-stage3.mjs") < verification.indexOf("verify-reviewed-preflop.mjs"));
  assert.match(verification, /tests\/stage3-\*\.test\.mjs/);
  assert.doesNotMatch(verification, /secrets\./);
  for (const line of workflow.split("\n").filter(line => !line.trimStart().startsWith("#")))
    assert.doesNotMatch(line, /build-stage3|generate-stage3|package-reviewed-stage3|record-stage3-review|stage3-only|build:estimates|\bpipeline\b/);
});
test("explicit Stage 3-only build and pipeline routes refuse authoring in CI before any generator", () => {
  for (const [script, args] of [["build-estimates.mjs", []], ["pipeline.mjs", ["--max-iterations", "1"]]]) {
    const run = spawnSync(process.execPath, [`scripts/${script}`, "--stage3-only", ...args], {
      cwd: root, encoding: "utf8", env: { ...process.env, CI: "true" }, maxBuffer: 1 << 20,
    });
    assert.equal(run.status, 1);
    const output = `${run.stdout}${run.stderr}`;
    assert.match(output, script === "pipeline.mjs" ? /status: blocked/ : /Stage 3 authoring is local-only/);
    assert.doesNotMatch(output, /Stage 3 staging:|Installed local Stage 3/);
  }
});

test("legacy and profile-only build paths do not eagerly import the Stage 3 catalog", () => {
  const source = readFileSync(new URL("../scripts/build-estimates.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import\s+.*from\s+["']\.\/build-stage3\.mjs["']/m);
  const branch = source.indexOf('if (process.argv.includes("--stage3-only"))');
  const lazyImport = source.indexOf('await import("./build-stage3.mjs")');
  assert.ok(branch >= 0 && lazyImport > branch);
  assert.ok(source.indexOf('} else {', branch) > lazyImport);
});

test("legacy-only audits and postflop-only publication do not eagerly load Stage 3 validators", () => {
  const audit = readFileSync(new URL("../scripts/audit-estimates.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(audit, /^import\s+.*from\s+["'][^"']*stage3-(?:responses|coverage|audit|publication)[^"']*["']/m);
  assert.ok(audit.indexOf('await import("../src/estimated/stage3-audit.ts")') > audit.indexOf('if (stage3Present.length) {'));
  const publish = readFileSync(new URL("../scripts/publish-d1.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(publish, /^import\s+.*from\s+["']\.\/lib\/stage3-publication\.mjs["']/m);
  assert.ok(publish.indexOf('await import("./lib/stage3-publication.mjs")') > publish.indexOf('if (!only || only === "preflop") {'));
});
