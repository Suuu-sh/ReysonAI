import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const workflow = readFileSync(new URL("../../../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
const importer = readFileSync(new URL("../scripts/import-reviewed-preflop.mjs", import.meta.url), "utf8");
test("PR verification has no production credentials or strategy-generation commands", () => {
  const verification = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  deploy:"));
  assert.match(workflow, /pull_request:\n    branches:\n      - development\n      - main/);
  assert.doesNotMatch(verification, /secrets\./);
  for (const line of workflow.split("\n").filter(line => !line.trimStart().startsWith("#")))
    assert.doesNotMatch(line, /build-continuations|build:estimates|generate-continuation|compose-reasons|migrations apply|publish:d1/);
  assert.match(verification, /verify-reviewed-preflop\.mjs/);
  assert.match(verification, /verify-preflop-local-d1\.mjs/);
});
test("main deployment requires verification and deploys compatible client before data", () => {
  const deployment = workflow.slice(workflow.indexOf("  deploy:"));
  assert.match(deployment, /needs: verify/);
  assert.match(deployment, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deployment, /github\.event_name != 'pull_request'/);
  assert.match(deployment, /needs\.verify\.outputs\.release_safe == 'true'/);
  assert.ok(deployment.indexOf("deploy --config wrangler.jsonc") < deployment.indexOf("import-reviewed-preflop.mjs --remote"));
  assert.match(deployment, /--check-bundle/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(workflow, /apps\/backend\/migrations\/0003_preflop.sql/);
  assert.match(workflow, /configs\/\*\*/);
});
test("production entry point is pinned, explicit, main-only, preflop-only and has no rewind/retry", () => {
  assert.match(importer, /process\.argv\[2\] !== "--remote"/);
  assert.match(importer, /GITHUB_REF !== "refs\/heads\/main"/);
  assert.match(importer, /wrangler@4\.147\.0/);
  assert.doesNotMatch(importer, /"migrations"|"restore"|"publish-d1"|"postflop"/);
  assert.match(importer, /verifyPublishedPreflop/);
  assert.match(importer, /if \(needsImport\)/);
});

test("postflop publication waits for reviewed preflop import and the strict release gate", () => {
  const deployment = workflow.slice(workflow.indexOf("  deploy:"));
  const steps = deployment.split(/\n      - name: /).slice(1);
  const index = name => steps.findIndex(step => step.startsWith(`${name}\n`));
  const preflop = index("Import reviewed preflop snapshot into D1");
  const gate = index("Require live FastFold release gate after reviewed import");
  const postflop = index("Publish postflop policies into D1");
  assert.ok(preflop >= 0 && preflop < gate && gate < postflop);
  assert.match(steps[preflop], /import-reviewed-preflop\.mjs --remote/);
  assert.match(steps[gate], /verify-fastfold-readiness\.mjs --configured\n/);
  assert.match(steps[postflop], /--only postflop --require-all .*--execute remote/);
  assert.doesNotMatch(steps[postflop], /continue-on-error|if: always\(\)|predeploy-compatible/);
  const verification = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  deploy:"));
  const check = verification.split(/\n      - name: /).find(step => step.startsWith("Check postflop policy delivery\n"));
  assert.match(check, /--only postflop --require-all/);
  assert.doesNotMatch(check, /--execute|secrets\./);
});
