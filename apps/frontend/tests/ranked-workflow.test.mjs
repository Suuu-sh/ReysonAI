import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
const verification = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  deploy:"));
const deployment = workflow.slice(workflow.indexOf("  deploy:"));

test("ranked source, shared rules and exact migration trigger reviewed verification", () => {
  for (const path of ["apps/backend/src/**", "apps/backend/tests/**", "apps/backend/package.json", "apps/backend/migrations/0009_ranked.sql", "apps/shared/**"]) {
    assert.ok(workflow.includes(`- '${path}'`), `${path} must trigger deployment`);
  }
  assert.match(verification, /working-directory: apps\/backend\n        run: node --experimental-strip-types --test tests\/ranked\.test\.mjs/);
  assert.match(verification, /tests\/ranked-workflow\.test\.mjs/);
  assert.doesNotMatch(verification, /secrets\.|--remote/);
});

test("reviewed main deploy applies only ranked schema before API and live readiness before client", () => {
  assert.match(deployment, /needs: verify/);
  assert.match(deployment, /github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(deployment, /working-directory: apps\/backend/);
  assert.match(deployment, /wrangler@4\.147\.0 d1 execute reysonai --remote --config wrangler\.jsonc --file migrations\/0009_ranked\.sql --yes/);
  assert.ok(deployment.indexOf("--file migrations/0009_ranked.sql") < deployment.indexOf("ranked-api-deployment.log"));
  assert.ok(deployment.indexOf("No positive ranked API deployment confirmation") < deployment.indexOf("Require live authoritative ranked readiness"));
  assert.match(deployment, /https:\/\/api\.reysonai\.com\/v1\/ranked\/status/);
  assert.match(deployment, /if \(!response\.ok \|\| \(await response\.json\(\)\)\.enabled !== true\)/);
  assert.match(deployment, /AbortSignal\.timeout\(15000\)/);
  assert.ok(deployment.indexOf("Require live authoritative ranked readiness") < deployment.indexOf("- name: Deploy Worker"));
  assert.ok(deployment.indexOf("- name: Deploy Worker") < deployment.indexOf("import-reviewed-preflop.mjs --remote"));
  assert.doesNotMatch(deployment.split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n"), /migrations apply|publish:d1|d1 (?:restore|delete)|--file migrations\/000[1-8]/);
});
