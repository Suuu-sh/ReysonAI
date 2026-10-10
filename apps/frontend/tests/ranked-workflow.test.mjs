import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileRecord, reviewedSourcePaths, REPOSITORY, sha256 } from "../scripts/lib/reviewed-preflop.mjs";
import { reviewedStage3SourcePaths, STAGE3_REPOSITORY } from "../scripts/lib/reviewed-stage3.mjs";
import { sha256Stage3, stage3FileRecord } from "../scripts/lib/stage3-artifacts.mjs";

const workflow = readFileSync(new URL("../../../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
const verification = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  deploy:"));
const deployment = workflow.slice(workflow.indexOf("  deploy:"));

test("ranked and CI scope inputs trigger the reviewed deploy workflow", () => {
  for (const path of ["apps/backend/src/**", "apps/backend/tests/**", "apps/backend/package.json", "apps/mcp/src/**", "apps/mcp/package.json", "apps/mcp/package-lock.json", "apps/backend/migrations/0009_ranked.sql", "apps/shared/**", "apps/frontend/worker-response-json-compat.d.ts", "scripts/ci/**"]) {
    assert.ok(workflow.includes(`- '${path}'`), `${path} must trigger deployment`);
  }
  assert.match(workflow, /- codex\/backend-ddd-main-20261010/);
  assert.match(workflow, /name: Verify reviewed preflop snapshot/);
  assert.match(workflow, /  verify:\n    name: Verify reviewed preflop snapshot\n    needs: scope/);
  assert.match(verification, /working-directory: apps\/backend\n        run: node --experimental-strip-types --test tests\/ranked\.test\.mjs/);
  assert.match(verification, /tests\/ranked-workflow\.test\.mjs/);
  assert.doesNotMatch(verification, /secrets\.|--remote/);
  assert.match(verification, /Require proven release lineage before production changes/);
  assert.match(verification, /needs\.scope\.outputs\.release_safe != 'true'/);
});

test("reviewed main deploy applies only ranked schema before API and live readiness before client", () => {
  assert.match(deployment, /needs: verify/);
  assert.match(deployment, /github\.ref == 'refs\/heads\/main' &&\s+github\.event_name != 'pull_request' &&\s+github\.run_attempt == 1 &&\s+needs\.verify\.outputs\.release_safe == 'true'/);
  assert.match(deployment, /needs\.verify\.outputs\.data_release == 'true'/);
  assert.match(deployment, /working-directory: apps\/backend/);
  assert.match(deployment, /wrangler@4\.147\.0 d1 execute reysonai --remote --config wrangler\.jsonc --file migrations\/0009_ranked\.sql --yes/);
  assert.ok(deployment.indexOf("--file migrations/0009_ranked.sql") < deployment.indexOf("ranked-api-deployment.log"));
  assert.ok(deployment.indexOf("No positive ranked API deployment confirmation") < deployment.indexOf("Require live authoritative ranked readiness"));
  assert.match(deployment, /https:\/\/api\.reysonai\.com\/v1\/ranked\/status/);
  assert.match(deployment, /AbortSignal\.timeout\(15000\)/);
  assert.ok(deployment.indexOf("Require live authoritative ranked readiness") < deployment.indexOf("- name: Deploy Worker"));
  assert.ok(deployment.indexOf("- name: Deploy Worker") < deployment.indexOf("import-reviewed-preflop.mjs --remote"));
  assert.doesNotMatch(deployment.split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n"), /migrations apply|publish:d1|d1 (?:restore|delete)|--file migrations\/000[1-8]/);
});

test("live ranked readiness checks the same credentialed CORS contract as the browser", () => {
  assert.match(deployment, /const origin = 'https:\/\/app\.reysonai\.com'/);
  assert.match(deployment, /headers: \{ Accept: 'application\/json', Origin: origin \}/);
  assert.match(deployment, /get\('access-control-allow-origin'\) !== origin/);
  assert.match(deployment, /get\('access-control-allow-credentials'\) !== 'true'/);
  assert.match(deployment, /method: 'OPTIONS'/);
  assert.match(deployment, /'Access-Control-Request-Method': 'POST'/);
  assert.match(deployment, /'Access-Control-Request-Headers': 'content-type'/);
  assert.match(deployment, /assertCors\(preflight\)/);
  assert.match(deployment, /preflight\.status !== 204/);
  assert.match(deployment, /assertCors\(anonymous\)/);
  assert.match(deployment, /anonymous\.status !== 401/);
  assert.match(deployment, /error !== 'sign_in_required'/);
});

test("review receipts bind exact deployment scope classifier sources", () => {
  const stage2 = JSON.parse(readFileSync(new URL("../../../configs/multiway-preflop-stage2.review.json", import.meta.url), "utf8"));
  const stage3 = JSON.parse(readFileSync(new URL("../../../configs/multiway-preflop-stage3.review.json", import.meta.url), "utf8"));
  const stage2Sources = reviewedSourcePaths(REPOSITORY).map(path => fileRecord(REPOSITORY, path));
  const stage3Sources = reviewedStage3SourcePaths(STAGE3_REPOSITORY).map(path => stage3FileRecord(STAGE3_REPOSITORY, path));
  assert.ok(stage2Sources.some(source => source.path === "scripts/ci/deployment-scope.mjs"));
  assert.ok(stage2Sources.some(source => source.path === "scripts/ci/deployment-scope.test.mjs"));
  assert.deepEqual(stage2.sources, stage2Sources);
  assert.equal(stage2.content_sha256, sha256(JSON.stringify({ artifacts: stage2.artifacts, sources: stage2Sources, archive: stage2.archive })));
  assert.ok(stage3Sources.some(source => source.path === "scripts/ci/deployment-scope.mjs"));
  assert.ok(stage3Sources.some(source => source.path === "scripts/ci/deployment-scope.test.mjs"));
  assert.deepEqual(stage3.sources, stage3Sources);
  assert.equal(stage3.content_sha256, sha256Stage3(JSON.stringify({ artifacts: stage3.artifacts, sources: stage3Sources, archive: stage3.archive })));
});

test("MW3-only verification does not run the preflop and Stage 3 LFS suite", () => {
  const broad = verification.slice(verification.indexOf("      - name: Check continuation invariants and unchanged HU inputs"), verification.indexOf("      - name: Verify authoritative ranked service"));
  assert.match(broad, /if: needs\.scope\.outputs\.verify_preflop == 'true' \|\| needs\.scope\.outputs\.verify_postflop == 'true'/);
  assert.doesNotMatch(broad, /verify_mw3/);
  assert.match(workflow, /node --test tests\/mw3-production-delivery\.test\.mjs/);
});

test("production deploy is never cancelled and PR checkout credentials do not persist", () => {
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(verification, /name: Check out exact workflow revision[\s\S]*?persist-credentials: false/);
  assert.match(deployment, /name: Check out repository[\s\S]*?persist-credentials: false/);
});
