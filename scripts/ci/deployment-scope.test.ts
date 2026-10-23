import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { classifyChangedPaths, classifyEvent, changedGroups, fingerprintsAtCommit, latestDeploymentRun, assertOperatorRecoveryEvidence, assertOperatorRecoverySourceScope, assertOperatorRecoveryReceipt, assertOperatorRecoveryArchive } from './deployment-scope.ts';

const workflowRun = (overrides: any = {}): any => {
  const run = {
    id: 100, path: '.github/workflows/deploy-worker.yml@main', head_branch: 'main', event: 'push',
    status: 'completed', conclusion: 'success', run_attempt: 1, head_sha: '', created_at: '2026-10-10T12:00:00Z', ...overrides,
  };
  run.updated_at ??= run.created_at;
  return run;
};

function assertBackendVerificationDependencies(): any {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8');
  const conditions = [...workflow.matchAll(/^      - name: Install dependencies\n        if: ([^\n]+)\n        run: npm ci$/gm)]
    .map(([, condition]: any): any => condition);
  assert.equal(conditions.length, 2);
  assert.equal(conditions[0], "needs.scope.outputs.needs_frontend_deps == 'true' || needs.scope.outputs.verify_backend == 'true'");
  assert.equal(conditions[1], "needs.verify.outputs.needs_frontend_deps == 'true'");
}

function git(root?: any, args?: any): any {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function repository(t?: any): any {
  const root = mkdtempSync(join(tmpdir(), 'reysonai-scope-test-'));
  t.after((): any => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'CI Scope Test']);
  git(root, ['config', 'user.email', 'ci-scope@example.invalid']);
  return root;
}

function commit(root?: any, changes?: any): any {
  for (const [path, contents] of Object.entries<string | null>(changes)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    if (contents === null) rmSync(absolute, { force: true });
    else writeFileSync(absolute, contents);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture']);
  return git(root, ['rev-parse', 'HEAD']);
}

function successFetcher(run?: any): any {
  return async (url?: any): Promise<any> => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) return { ok: true, json: async (): Promise<any> => ({ workflow_runs: [run] }) };
    assert.match(url, /\/actions\/runs\/\d+\/jobs\?/);
    return { ok: true, json: async (): Promise<any> => ({ jobs: [{
      name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data',
      status: 'completed', conclusion: 'success',
    }] }) };
  };
}

function jobsFetcher(byRunId?: any): any {
  return async (url?: any): Promise<any> => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return { ok: true, json: async (): Promise<any> => ({ workflow_runs: byRunId.pages?.[page] ?? byRunId.runs ?? [] }) };
    }
    const match = /\/actions\/runs\/(\d+)\/jobs\?/.exec(url);
    assert.ok(match, `unexpected request ${url}`);
    return { ok: true, json: async (): Promise<any> => ({ jobs: byRunId.jobs[match[1]] ?? [] }) };
  };
}

function readinessFailureSteps(): any[] {
  const completed = 'completed';
  return [
    ['Set up job', 'success'], ['Validate deployment secrets', 'success'], ['Check out repository', 'success'],
    ['Prepare deployment log directory', 'success'], ['Set up Node.js', 'success'], ['Install dependencies', 'success'],
    ['Install MCP runtime dependencies for the composed API Worker', 'skipped'],
    ['Restore exact reviewed Git LFS payload', 'skipped'], ["Fetch this run's validated delivery SQL", 'skipped'],
    ['Recheck delivery against this exact checkout', 'skipped'],
    ['Import exact reviewed MW3 data and require full D1 readback', 'skipped'],
    ['Apply exact ranked schema', 'skipped'], ['Apply exact FastFold schema', 'skipped'],
    ['Apply exact six-human ranked schema', 'skipped'], ['Apply exact postflop profile schema', 'skipped'],
    ['Deploy ranked API before enabling the client', 'skipped'],
    ['Require live authoritative ranked readiness', 'failure'],
    ['Require live FastFold API and compatible published data before client', 'skipped'],
    ['Build', 'skipped'], ['Deploy Worker', 'skipped'], ['Import reviewed preflop snapshot into D1', 'skipped'],
    ['Require live FastFold release gate after reviewed import', 'skipped'],
    ['Publish postflop policies into D1', 'skipped'],
    ['Require live MW3 payloads and actual consumer source identities', 'skipped'],
    ['Retain MW3 delivery plan, recovery reference and exact outcomes', 'skipped'],
    ['Retain preflop recovery reference and import outcome', 'skipped'],
    ['Post Set up Node.js', 'skipped'], ['Post Check out repository', 'success'], ['Complete job', 'success'],
  ].map(([name, conclusion]) => ({ name, conclusion, status: completed }));
}

function baseFiles(): any {
  return {
    'apps/frontend/src/account/AccountPage.tsx': 'export const AccountPage = 1;\n',
    'apps/frontend/src/estimated/opening-ranges.json': '{"version":1}\n',
    'artifacts/postflop/mw3-demo.sql': 'INSERT INTO mw3_policy_deliveries VALUES (1);\n',
    'artifacts/postflop/hu-demo.sql': 'INSERT INTO postflop_policies VALUES (1);\n',
    'apps/backend/migrations/0009_ranked.sql': 'CREATE TABLE ranked (id TEXT);\n',
    'apps/backend/src/fastfold.ts': 'export const sourceVersion = 1;\n',
    'apps/backend/wrangler.jsonc': '{"name":"backend"}\n',
    'apps/frontend/package.json': '{"name":"frontend"}\n',
    'apps/frontend/package-lock.json': '{"lockfileVersion":3}\n',
    'apps/frontend/wrangler.jsonc': '{"name":"frontend"}\n',
    'configs/multiway-preflop-stage2.review.json': JSON.stringify({ sources: [
      { path: 'apps/backend/src/fastfold.ts' },
      { path: 'apps/backend/wrangler.jsonc' },
      { path: 'apps/frontend/package.json' },
      { path: 'apps/frontend/package-lock.json' },
      { path: 'apps/frontend/wrangler.jsonc' },
    ] }) + '\n',
    'configs/multiway-preflop-stage3.review.json': JSON.stringify({ sources: [
      { path: 'apps/frontend/package.json' },
      { path: 'apps/frontend/package-lock.json' },
    ] }) + '\n',
  };
}

test('frontend account-only change deploys client without data validation or D1 work', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/frontend/src/account/AccountPage.tsx': 'export const AccountPage = 2;\n' });
  const hashes = fingerprintsAtCommit(root, base);
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.lineage_known, true);
  assert.equal(plan.release_safe, true);
  assert.equal(plan.deploy_frontend, true);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.verify_data, false);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.mw3_live, false);
  assert.equal(plan.input_hashes, JSON.stringify(hashes));
});

test('MW3 artifact change imports only MW3 and keeps its live consumer acceptance', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'artifacts/postflop/mw3-demo.sql': 'INSERT INTO mw3_policy_deliveries VALUES (2);\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.data_release, true);
  assert.equal(plan.import_mw3, true);
  assert.equal(plan.mw3_live, true);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.deploy_frontend, false);
});

test('preflop source change republishes dependent postflop policies and verifies MW3 source identity', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/frontend/src/estimated/opening-ranges.json': '{"version":2}\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.import_preflop, true);
  assert.equal(plan.publish_postflop, true);
  assert.equal(plan.mw3_live, true);
  assert.equal(plan.import_mw3, false);
});

test('reviewed preflop archive-only change releases data without rebuilding unchanged Workers', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'artifacts/preflop/stage2-reviewed.tar.gz': 'reviewed archive v2\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.import_preflop, true);
  assert.equal(plan.publish_postflop, true);
  assert.equal(plan.mw3_live, true);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.deploy_frontend, false);
});

test('unknown lineage runs full verification but blocks every automatic production write', async (t?: any): Promise<any> => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200',
    fetcher: async (): Promise<any> => ({ ok: true, json: async (): Promise<any> => ({ workflow_runs: [workflowRun({ id: 90, status: 'completed', conclusion: 'failure', head_sha: 'a'.repeat(40) })] }) }),
  });
  assert.equal(plan.lineage_known, false);
  assert.equal(plan.release_safe, false);
  assert.equal(plan.verify_data, true);
  assert.equal(plan.verify_preflop, true);
  assert.equal(plan.verify_postflop, true);
  assert.equal(plan.verify_mw3, true);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.deploy_api, false);
});

test('skips only a first-attempt failure at the named read-only readiness gate after known non-writing steps', async (t?: any): Promise<any> => {
  const root = repository(t);
  const previous = commit(root, baseFiles());
  const failed = workflowRun({ id: 101, head_sha: 'b'.repeat(40), conclusion: 'failure', updated_at: '2026-10-16T00:00:00Z' });
  const success = workflowRun({ id: 100, head_sha: previous, updated_at: '2026-10-15T00:00:00Z' });
  const fetcher = async (url: string) => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) {
      return { ok: true, json: async () => ({ workflow_runs: [failed, success] }) };
    }
    const id = /\/actions\/runs\/(\d+)\/jobs\?/.exec(url)?.[1];
    assert.ok(id);
    if (id === '101') return { ok: true, json: async () => ({ total_count: 3, jobs: [
      { name: 'Classify reviewed code and data inputs', status: 'completed', conclusion: 'success' },
      { name: 'Verify reviewed preflop snapshot', status: 'completed', conclusion: 'success' },
      { name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'failure', steps: readinessFailureSteps() },
    ] }) };
    return { ok: true, json: async () => ({ jobs: [{
      name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success',
    }] }) };
  };
  const baseline = await latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '102', fetcher });
  assert.equal(baseline.id, 100);
});

test('classifies human avatar migration as isolated additive schema, not a broad data reimport', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, { ...baseFiles(), 'apps/backend/migrations/0013_human_rank_avatar.sql': 'ALTER TABLE human_rank_players ADD COLUMN avatar TEXT NOT NULL DEFAULT \'person\';\n' });
  const head = commit(root, { 'apps/backend/migrations/0013_human_rank_avatar.sql': 'ALTER TABLE human_rank_players ADD COLUMN avatar TEXT NOT NULL DEFAULT \'person\' CHECK(length(avatar)>0);\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.apply_human_avatar_schema, true);
  assert.equal(plan.data_release, true);
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.needs_frontend_deps, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
});

test('does not skip readiness failures if any production deploy job ran or the failure step differs', async (): Promise<any> => {
  const failed = workflowRun({ id: 101, head_sha: 'b'.repeat(40), conclusion: 'failure', updated_at: '2026-10-16T00:00:00Z' });
  const complete = readinessFailureSteps();
  const missingMutationEvidence = complete.filter(step => step.name !== 'Import reviewed preflop snapshot into D1');
  const duplicateStep = [...complete, { ...complete[0] }];
  const inProgressStep = complete.map(step => step.name === 'Build' ? { ...step, status: 'in_progress' } : step);
  const mutatingStepRan = complete.map(step => step.name === 'Apply exact six-human ranked schema' ? { ...step, conclusion: 'success' } : step);
  for (const steps of [
    complete.map(step => step.name === 'Require live authoritative ranked readiness' ? { ...step, name: 'Other failed gate' } : step),
    mutatingStepRan,
    complete.map(step => step.name === 'Require live authoritative ranked readiness' ? { ...step, name: 'Require live authoritative ranked readiness', status: 'in_progress' } : step),
    missingMutationEvidence,
    duplicateStep,
    inProgressStep,
  ]) {
    const fetcher = async (url: string) => {
      if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) return { ok: true, json: async () => ({ workflow_runs: [failed] }) };
      return { ok: true, json: async () => ({ total_count: 3, jobs: [
        { name: 'Classify reviewed code and data inputs', status: 'completed', conclusion: 'success' },
        { name: 'Verify reviewed preflop snapshot', status: 'completed', conclusion: 'success' },
        { name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'failure', steps },
      ] }) };
    };
    await assert.rejects(() => latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '102', fetcher }), /production state may be partial|production deployment requires manual recovery/);
  }
  const truncatedJobsFetcher = async (url: string) => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) return { ok: true, json: async () => ({ workflow_runs: [failed] }) };
    return { ok: true, json: async () => ({ total_count: 4, jobs: [
      { name: 'Classify reviewed code and data inputs', status: 'completed', conclusion: 'success' },
      { name: 'Verify reviewed preflop snapshot', status: 'completed', conclusion: 'success' },
      { name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'failure', steps: readinessFailureSteps() },
    ] }) };
  };
  await assert.rejects(() => latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '102', fetcher: truncatedJobsFetcher }), /production state may be partial|production deployment requires manual recovery/);
  for (const total_count of [null, '3', -1, 3.5]) {
    const malformedCountFetcher = async (url: string) => {
      if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) return { ok: true, json: async () => ({ workflow_runs: [failed] }) };
      return { ok: true, json: async () => ({ total_count, jobs: [
        { name: 'Classify reviewed code and data inputs', status: 'completed', conclusion: 'success' },
        { name: 'Verify reviewed preflop snapshot', status: 'completed', conclusion: 'success' },
        { name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'failure', steps: readinessFailureSteps() },
      ] }) };
    };
    await assert.rejects(() => latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '102', fetcher: malformedCountFetcher }), /production state may be partial|production deployment requires manual recovery/);
  }
});

test('manual force input is the only recovery path when lineage cannot be proved', async (t?: any): Promise<any> => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  let queried = false;
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'workflow_dispatch', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', event: { inputs: { force_data_release: true } },
    fetcher: async (): Promise<any> => { queried = true; throw new Error('must not query'); },
  });
  assert.equal(queried, false);
  assert.equal(plan.release_safe, true);
  assert.equal(plan.data_release, true);
  assert.equal(plan.import_preflop, true);
  assert.equal(plan.publish_postflop, true);
  assert.equal(plan.import_mw3, true);
  assert.equal(plan.apply_ranked_schema, true);
  assert.equal(plan.apply_mw3_schema, true);
});

test('workflow reruns verify fully but never repeat production writes, including force dispatch reruns', async (t?: any): Promise<any> => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'workflow_dispatch', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', runAttempt: '2',
    event: { inputs: { force_data_release: 'true' } },
  });
  assert.equal(plan.mode, 'rerun-verification-only');
  assert.equal(plan.verify_data, true);
  assert.equal(plan.verify_frontend, true);
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.release_safe, false);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.apply_ranked_schema, false);
});

test('changed data for an unknown artifact family takes the full reviewed path', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'artifacts/new-product/unknown.bin': 'source bytes\n' });
  const before = fingerprintsAtCommit(root, base);
  const after = fingerprintsAtCommit(root, head);
  assert.ok(changedGroups(before, after).includes('full'));
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.data_release, true);
  assert.equal(plan.import_preflop, true);
  assert.equal(plan.publish_postflop, true);
  assert.equal(plan.import_mw3, true);
});

test('review receipt changes run all integrity checks without re-importing reviewed data', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'configs/multiway-preflop-stage2.review.json': JSON.stringify({
    sources: [
      { path: 'apps/backend/src/fastfold.ts' },
      { path: 'apps/backend/wrangler.jsonc' },
      { path: 'apps/frontend/package.json' },
      { path: 'apps/frontend/package-lock.json' },
      { path: 'apps/frontend/wrangler.jsonc' },
    ],
    refreshed: true,
  }) + '\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.release_safe, true);
  assert.equal(plan.verify_data, true);
  assert.equal(plan.verify_preflop, true);
  assert.equal(plan.verify_postflop, true);
  assert.equal(plan.verify_mw3, true);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.apply_ranked_schema, false);
});

test('canonical reviewed-source changes run every integrity verifier without enabling D1 writes', async (t?: any): Promise<any> => {
  const paths = [
    'apps/backend/src/fastfold.ts',
    'apps/backend/wrangler.jsonc',
    'apps/frontend/package.json',
    'apps/frontend/package-lock.json',
    'apps/frontend/wrangler.jsonc',
  ];
  for (const path of paths) {
    const root = repository(t);
    const base = commit(root, baseFiles());
    const head = commit(root, { [path]: `${path} changed\n` });
    const plan = await classifyEvent({
      repoRoot: root, eventName: 'pull_request', ref: 'refs/pull/1/merge', sha: head,
      event: { pull_request: { base: { sha: base } } }, repository: 'Suuu-sh/ReysonAI', runId: '200',
      fetcher: async (): Promise<any> => { throw new Error('PR classification must not use production run history'); },
    });
    assert.equal(plan.verify_data, true, path);
    assert.equal(plan.verify_preflop, true, path);
    assert.equal(plan.verify_postflop, true, path);
    assert.equal(plan.verify_mw3, true, path);
    assert.equal(plan.needs_frontend_deps, true, path);
    assert.equal(plan.data_release, false, path);
    assert.equal(plan.import_preflop, false, path);
    assert.equal(plan.publish_postflop, false, path);
    assert.equal(plan.import_mw3, false, path);
    assert.equal(plan.apply_ranked_schema, false, path);
  }
});

test('main deploy verifies reviewed source-only changes without repeating any D1 import', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/backend/src/fastfold.ts': 'export const sourceVersion = 2;\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.release_safe, true);
  assert.equal(plan.verify_data, true);
  assert.equal(plan.verify_preflop, true);
  assert.equal(plan.verify_postflop, true);
  assert.equal(plan.verify_mw3, true);
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.deploy_api, true);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
});

test('PR code changes use the base/head hashes and never enable production writes', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/backend/src/worker.ts': 'export default {};\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'pull_request', ref: 'refs/pull/1/merge', sha: head,
    event: { pull_request: { base: { sha: base } } }, repository: 'Suuu-sh/ReysonAI', runId: '200',
    fetcher: async (): Promise<any> => { throw new Error('PR classification must not use production run history'); },
  });
  assert.equal(plan.mode, 'pull-request');
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.deploy_api, true);
  assert.equal(plan.mw3_live, false);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.release_safe, false);
});

test('data files changed in a PR run scoped review but do not permit D1 writes', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'artifacts/postflop/hu-demo.sql': 'INSERT INTO postflop_policies VALUES (2);\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'pull_request', ref: 'refs/pull/1/merge', sha: head,
    event: { pull_request: { base: { sha: base } } }, repository: 'Suuu-sh/ReysonAI', runId: '200',
  });
  assert.equal(plan.verify_data, true);
  assert.equal(plan.verify_postflop, true);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.data_release, false);
});

test('run lookup accepts the Actions API path@ref form, ignores unrelated workflows, then picks newest deploy-worker run', async (): Promise<any> => {
  const found = await latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [
      workflowRun({ id: 300, created_at: '2026-10-10T13:00:00Z' }),
      workflowRun({ id: 299, path: '.github/workflows/verify-fastfold.yml', created_at: '2026-10-10T12:59:00Z' }),
      workflowRun({ id: 298, created_at: '2026-10-10T12:58:00Z', head_sha: 'b'.repeat(40) }),
    ],
    jobs: { '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
  }) });
  assert.equal(found.id, 298);
});

test('run lookup remains compatible with a bare workflow path', async (): Promise<any> => {
  const found = await latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [workflowRun({ id: 298, path: '.github/workflows/deploy-worker.yml', head_sha: 'b'.repeat(40) })],
    jobs: { '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
  }) });
  assert.equal(found.id, 298);
});

test('a rerun is ordered by latest activity so an old SHA can never hide a later production write', async (): Promise<any> => {
  const found = await latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [
      workflowRun({ id: 299, head_sha: 'a'.repeat(40), created_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-10T13:10:00Z', run_attempt: 2 }),
      workflowRun({ id: 298, head_sha: 'b'.repeat(40), created_at: '2026-10-10T12:30:00Z', updated_at: '2026-10-10T12:45:00Z' }),
    ],
    jobs: {
      '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }],
      '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }],
    },
  }) });
  assert.equal(found.id, 299);
  assert.equal(found.head_sha, 'a'.repeat(40));
});

test('deployment history pages are combined before choosing the latest rerun activity', async (): Promise<any> => {
  const unrelatedRuns = Array.from({ length: 99 }, (_?: any, index?: any): any => workflowRun({
    id: 1000 + index, path: '.github/workflows/verify-fastfold.yml',
    created_at: '2026-10-10T12:59:00Z', updated_at: '2026-10-10T12:59:00Z',
  }));
  const pageOneBaseline = workflowRun({ id: 298, head_sha: 'b'.repeat(40), created_at: '2026-10-10T12:30:00Z', updated_at: '2026-10-10T12:45:00Z' });
  const pageTwoRerun = workflowRun({ id: 299, head_sha: 'a'.repeat(40), created_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-10T13:10:00Z', run_attempt: 2, conclusion: 'failure' });
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    pages: { 1: [...unrelatedRuns, pageOneBaseline], 2: [pageTwoRerun] },
    jobs: { '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }], '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
  }) }), /deployment job/);
});

test('the 1,000-result Actions history cap fails closed instead of trusting a truncated page', async (): Promise<any> => {
  const requestedPages: any[] = [];
  const fetcher = async (url?: any): Promise<any> => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      requestedPages.push(page);
      const workflow_runs = page <= 10 ? Array.from({ length: 100 }, (_?: any, index?: any): any => workflowRun({
        id: page * 100 + index, path: '.github/workflows/verify-fastfold.yml',
      })) : [];
      return { ok: true, json: async (): Promise<any> => ({ workflow_runs }) };
    }
    assert.fail(`truncated history must not be used to fetch jobs: ${url}`);
  };
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher }),
    /reached at least 1000 runs/);
  assert.deepEqual(requestedPages, Array.from({ length: 10 }, (_?: any, index?: any): any => index + 1));

  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: async (url?: any): Promise<any> => {
    assert.match(url, /page=1$/);
    return { ok: true, json: async (): Promise<any> => ({ total_count: 1000, workflow_runs: [workflowRun()] }) };
  } }), /reached the 1000-run API result limit/);
});

test('baseline must have a successful production deploy job, not just a successful workflow', async (): Promise<any> => {
  const run = (id?: any, created_at?: any): any => workflowRun({ id, created_at, head_sha: `${id}`.padStart(40, '0') });
  const found = await latestDeploymentRun({
    repository: 'Suuu-sh/ReysonAI', currentRunId: '300',
    fetcher: jobsFetcher({
      runs: [run(299, '2026-10-10T12:59:00Z'), run(298, '2026-10-10T12:58:00Z')],
      jobs: {
        '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }],
        '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }],
      },
    }),
  });
  assert.equal(found.id, 298);
});

test('completed first-attempt failed workflows with skipped deploy jobs are ignored before the successful baseline', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/frontend/src/account/AccountPage.tsx': 'export const AccountPage = 2;\n' });
  const run = (id?: any, sha?: any, created_at?: any, overrides: any = {}): any => workflowRun({ id, head_sha: sha, created_at, ...overrides });
  const fetcher = jobsFetcher({
    runs: [
      run(299, head, '2026-10-10T12:59:00Z', { conclusion: 'failure' }),
      run(298, head, '2026-10-10T12:58:00Z', { conclusion: 'cancelled' }),
      run(297, base, '2026-10-10T12:57:00Z'),
    ],
    jobs: {
      '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }],
      '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }],
      '297': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }],
    },
  });
  const found = await latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher });
  assert.equal(found.id, 297);
  const plan = await classifyEvent({ repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '300', fetcher });
  assert.equal(plan.release_safe, true);
  assert.equal(plan.deploy_frontend, true);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
});

test('rerun skipped deploy remains blocked and authorization is sent on history and jobs requests', async (): Promise<any> => {
  const seen: any[] = [];
  const fetcher = async (url?: any, options?: any): Promise<any> => {
    seen.push(options.headers.Authorization);
    if (url.includes('/workflows/')) return { ok: true, json: async (): Promise<any> => ({ workflow_runs: [workflowRun({ id: 299, run_attempt: 2, conclusion: 'failure', head_sha: 'b'.repeat(40) })] }) };
    return { ok: true, json: async (): Promise<any> => ({ jobs: [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }] }) };
  };
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', token: 'test-token', fetcher }), /deployment job in latest main run 299/);
  assert.deepEqual(seen, ['Bearer test-token', 'Bearer test-token']);
});

test('successful workflow with missing deployment job fails closed', async (): Promise<any> => {
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [workflowRun({ id: 299, head_sha: 'b'.repeat(40) })], jobs: { '299': [] },
  }) }), /deployment job is missing/);
});

test('missing run_attempt does not prove a skipped deployment was a first attempt', async (): Promise<any> => {
  const run = workflowRun({ id: 299, head_sha: 'b'.repeat(40) });
  delete run.run_attempt;
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [run], jobs: { '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }] },
  }) }), /deployment job in latest main run 299/);
});

test('scope workflow grants the history token only to its read-only classifier job', (): any => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8');
  const scopeJob = workflow.split('\n  verify:')[0];
  assert.match(scopeJob, /permissions:\n      actions: read\n      contents: read/);
  assert.match(scopeJob, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});

test('failed workflow with a successful deploy job is not accepted as a baseline', async (): Promise<any> => {
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [workflowRun({ id: 299, conclusion: 'failure', head_sha: 'b'.repeat(40) })],
    jobs: { '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
  }) }), /deployment job in latest main run 299/);
});

test('successful no-op workflow with no successful deploy job is not a release baseline', async (): Promise<any> => {
  const found = await latestDeploymentRun({
    repository: 'Suuu-sh/ReysonAI', currentRunId: '300',
    fetcher: jobsFetcher({
      runs: [workflowRun({ id: 299, created_at: '2026-10-10T12:59:00Z', head_sha: 'c'.repeat(40) })],
      jobs: { '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }] },
    }),
  });
  assert.equal(found, null);
});

test('a newer failed main deployment blocks fallback to an older successful baseline', async (t?: any): Promise<any> => {
  const run = (id?: any, created_at?: any, overrides: any = {}): any => workflowRun({ id, created_at, head_sha: `${id}`.padStart(40, '0'), ...overrides });
  await assert.rejects(latestDeploymentRun({
    repository: 'Suuu-sh/ReysonAI', currentRunId: '300',
    fetcher: jobsFetcher({
      runs: [
        run(299, '2026-10-10T12:59:00Z', { status: 'completed', conclusion: 'failure' }),
        run(298, '2026-10-10T12:58:00Z'),
      ],
      jobs: { '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'failure' }], '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
    }),
  }), /deployment job/);

  const root = repository(t);
  const head = commit(root, baseFiles());
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '300', fetcher: jobsFetcher({
      runs: [run(299, '2026-10-10T12:59:00Z', { status: 'completed', conclusion: 'failure' })],
      jobs: {},
    }),
  });
  assert.equal(plan.lineage_known, false);
  assert.equal(plan.release_safe, false);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.import_mw3, false);
});

test('a newer in-progress main deployment blocks any automatic production writes', async (): Promise<any> => {
  const run = (id?: any, created_at?: any, overrides: any = {}): any => workflowRun({ id, created_at, head_sha: `${id}`.padStart(40, '0'), ...overrides });
  await assert.rejects(latestDeploymentRun({
    repository: 'Suuu-sh/ReysonAI', currentRunId: '300',
    fetcher: jobsFetcher({
      runs: [
        run(299, '2026-10-10T12:59:00Z', { status: 'in_progress', conclusion: null }),
        run(298, '2026-10-10T12:58:00Z'),
      ],
      jobs: { '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
    }),
  }), /latest main deployment run 299 is in_progress\/unknown/);
});

test('GitHub history/API errors choose the fail-closed full path', async (t?: any): Promise<any> => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: async (): Promise<any> => ({ ok: false, status: 403 }),
  });
  assert.equal(plan.release_safe, false);
  assert.equal(plan.verify_data, true);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_mw3, false);
});

test('deployment workflow and classifier changes retain the FastFold runtime verifier', (): any => {
  for (const path of ['.github/workflows/deploy-worker.yml', 'scripts/ci/deployment-scope.ts']) {
    const plan = classifyChangedPaths([path]);
    assert.equal(plan.verify_backend, true, path);
    assert.equal(plan.verify_data, true, path);
    assert.equal(plan.data_release, false, path);
  }
});

test('standalone scope paths keep code-only changes apart from data roots', (): any => {
  const plan = classifyChangedPaths(['apps/frontend/src/account/AccountPage.tsx']);
  assert.equal(plan.deploy_frontend, true);
  assert.equal(plan.verify_data, false);
  assert.equal(plan.data_release, false);
});


test('backend-only verification installs frontend test dependencies without enabling frontend build or data work', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, {
    'apps/backend/tests/fastfold-do.test.ts': 'test("fastfold", () => {});\n',
    'apps/backend/tests/human-rank-do.test.ts': 'test("human rank", () => {});\n',
  });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.lineage_known, true);
  assert.equal(plan.release_safe, true);
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.needs_frontend_deps, false);
  assert.equal(plan.verify_frontend, false);
  assert.equal(plan.deploy_frontend, false);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.verify_data, false);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
  assertBackendVerificationDependencies();
});

test('schema-only migrations install backend verify dependencies without frontend build, LFS or Worker deploy', async (t?: any): Promise<any> => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/backend/migrations/0009_ranked.sql': 'CREATE TABLE ranked (id TEXT, version INTEGER);\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: base })),
  });
  assert.equal(plan.release_safe, true);
  assert.equal(plan.data_release, true);
  assert.equal(plan.verify_data, true);
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.apply_ranked_schema, true);
  assert.equal(plan.needs_frontend_deps, false);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.deploy_frontend, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(plan.publish_postflop, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.verify_preflop, false);
  assert.equal(plan.verify_postflop, false);
  assert.equal(plan.verify_mw3, false);
  assert.equal(plan.verify_frontend, false);
  assert.equal(plan.deploy_api, false);
  assertBackendVerificationDependencies();
});


test('repository TypeScript tooling changes verify code without numerical publication or deployment', () => {
  for (const path of ['tsconfig.tooling.json', 'types/tooling-runtime.d.ts', '.github/workflows/verify-typescript.yml']) {
    const plan = classifyChangedPaths([path]);
    for (const key of ['verify_frontend', 'verify_backend', 'needs_frontend_deps', 'needs_mcp_deps']) assert.equal(plan[key], true, `${path}: ${key}`);
    for (const key of ['verify_data', 'verify_preflop', 'verify_postflop', 'verify_mw3', 'data_release', 'import_preflop', 'publish_postflop', 'import_mw3', 'deploy_api', 'deploy_frontend']) assert.equal(plan[key], false, `${path}: ${key}`);
  }
});

test('on-demand broker schema has a dedicated additive release scope', async (t: any) => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, {'apps/backend/migrations/0014_aiv2_ondemand.sql':'CREATE TABLE IF NOT EXISTS broker_fixture(id TEXT PRIMARY KEY);'});
  const plan = await classifyEvent({repoRoot:root,eventName:'push',ref:'refs/heads/main',sha:head,repository:'Suuu-sh/ReysonAI',runId:'200',fetcher:successFetcher(workflowRun({head_sha:base}))});
  assert.equal(plan.lineage_known,true);
  assert.equal(plan.apply_ondemand_schema,true);
  assert.equal(plan.import_preflop,false);
  assert.equal(plan.publish_postflop,false);
  assert.equal(plan.import_mw3,false);
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-worker.yml', import.meta.url),'utf8');
  assert.match(workflow,/name: Apply exact AIv2 on-demand broker schema\n        if: needs.verify.outputs.apply_ondemand_schema == 'true'/);
});


test('shallow PR checkout fetches the exact absent baseline before tree comparison', async t => {
  const remote = repository(t);
  const base = commit(remote, baseFiles());
  const head = commit(remote, { 'apps/frontend/src/account/AccountPage.tsx': 'export const AccountPage = 2;\n' });
  const checkout = mkdtempSync(join(tmpdir(), 'reysonai-scope-shallow-'));
  t.after(() => rmSync(checkout, { recursive: true, force: true }));
  execFileSync('git', ['clone', '--quiet', '--depth=1', '--no-local', pathToFileURL(remote).href, checkout]);
  assert.equal(git(checkout, ['rev-parse', '--is-shallow-repository']), 'true');
  assert.throws(() => execFileSync('git', ['-C', checkout, 'cat-file', '-e', `${base}^{commit}`], { stdio: 'ignore' }));
  const plan = await classifyEvent({ repoRoot: checkout, eventName: 'pull_request', ref: 'refs/pull/1/merge', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', event: { pull_request: { base: { sha: base } } },
    fetcher: async () => { throw Error('PR comparison must not infer production lineage'); } });
  assert.equal(plan.mode, 'pull-request');
  assert.equal(plan.verify_frontend, true);
  assert.equal(plan.verify_data, false);
  assert.equal(plan.release_safe, false);
  assert.equal(plan.lineage_known, false);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.deploy_frontend, true);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_preflop, false);
  assert.equal(git(checkout, ['rev-parse', 'HEAD']), head);
  assert.equal(git(checkout, ['rev-parse', `${base}^{commit}`]), base);
});

test('an unavailable exact production baseline stays fail-closed after fetch failure', async t => {
  const remote = repository(t);
  const head = commit(remote, baseFiles());
  const checkout = mkdtempSync(join(tmpdir(), 'reysonai-scope-missing-baseline-'));
  t.after(() => rmSync(checkout, { recursive: true, force: true }));
  execFileSync('git', ['clone', '--quiet', '--depth=1', '--no-local', pathToFileURL(remote).href, checkout]);
  const plan = await classifyEvent({ repoRoot: checkout, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: successFetcher(workflowRun({ head_sha: 'f'.repeat(40) })) });
  assert.equal(plan.lineage_known, false);assert.equal(plan.release_safe, false);
  assert.equal(plan.verify_data, true);assert.equal(plan.verify_preflop, true);
  assert.equal(plan.deploy_api, false);assert.equal(plan.deploy_frontend, false);
  assert.equal(plan.data_release, false);assert.equal(plan.import_preflop, false);
  assert.match(plan.reason, /could not be proven/);
});

test('operator schema fingerprints and exact deployment gate do not publish strategy data', async t => {
 const root=repository(t),base=commit(root,baseFiles());
 const head=commit(root,{'apps/backend/migrations/0015_aiv2_operator_batches.sql':'CREATE TABLE IF NOT EXISTS operator_fixture(id TEXT PRIMARY KEY);'});
 assert.deepEqual(changedGroups(fingerprintsAtCommit(root,base),fingerprintsAtCommit(root,head)),['operator_schema']);
 const options={repoRoot:root,eventName:'push',ref:'refs/heads/main',sha:head,repository:'Suuu-sh/ReysonAI',runId:'200',fetcher:successFetcher(workflowRun({head_sha:base}))};
 const plan=await classifyEvent(options);
 for(const key of ['lineage_known','release_safe','verify_backend','data_release','apply_operator_schema'])assert.equal(plan[key],true,key);
 for(const key of ['apply_ondemand_schema','import_preflop','publish_postflop','import_mw3','deploy_api','deploy_frontend'])assert.equal(plan[key],false,key);
 for(const overrides of [{runAttempt:'2'},{fetcher:async()=>{throw Error('unavailable');}},{eventName:'pull_request',event:{pull_request:{base:{sha:base}}}}]){
  const blocked=await classifyEvent({...options,...overrides});assert.equal(blocked.release_safe,false);assert.equal(blocked.apply_operator_schema,false);
 }
 const workflow=readFileSync(new URL('../../.github/workflows/deploy-worker.yml',import.meta.url),'utf8');
 assert.match(workflow,/apply_operator_schema: \$\{\{ steps.scope.outputs.apply_operator_schema \}\}/);
 assert.match(workflow,/apply_operator_schema: \$\{\{ needs.scope.outputs.apply_operator_schema \}\}/);
 assert.match(workflow,/name: Ensure exact AIv2 operator batch schema and require D1 readback\n        if: needs.verify.outputs.apply_operator_schema == 'true'[\s\S]*?run: node scripts\/ensure-aiv2-operator-schema.ts/);
 assert.ok(workflow.indexOf('name: Ensure exact AIv2 operator batch schema')<workflow.indexOf('name: Deploy ranked API before enabling the client'));
 assert.match(workflow,/node --experimental-strip-types --test tests\/aiv2-ondemand.test.ts tests\/aiv2-operator-schema.test.ts/);
 assert.match(workflow,/node --experimental-strip-types --test --test-concurrency=1 tests\/aiv2-postflop-ondemand-bridge.test.ts tests\/aiv2-postflop-operator-batch.test.ts/);
});

test('executed operator schema write never becomes a benign readiness-failure lineage', async t => {
 const root=repository(t),base=commit(root,baseFiles());
 const previous=workflowRun({id:99,head_sha:base}),failed=workflowRun({id:100,head_sha:base,conclusion:'failure'});
 for(const conclusion of ['skipped','success']){
  const steps=readinessFailureSteps();steps.push({name:'Ensure exact AIv2 operator batch schema and require D1 readback',status:'completed',conclusion});
  const fetcher=jobsFetcher({runs:[failed,previous],jobs:{100:[{name:'Classify reviewed code and data inputs',status:'completed',conclusion:'success'},{name:'Verify reviewed preflop snapshot',status:'completed',conclusion:'success'},{name:'Deploy authoritative ranked API, compatible client and reviewed preflop data',status:'completed',conclusion:'failure',steps}],99:[{name:'Deploy authoritative ranked API, compatible client and reviewed preflop data',status:'completed',conclusion:'success'}]}});
  if(conclusion==='skipped')assert.equal((await latestDeploymentRun({repository:'Suuu-sh/ReysonAI',currentRunId:'200',fetcher})).id,99);
  else await assert.rejects(latestDeploymentRun({repository:'Suuu-sh/ReysonAI',currentRunId:'200',fetcher}),/partial/);
 }
});

function operatorRecoveryFixture(){
 const policy=JSON.parse(readFileSync(new URL('../../configs/operator-schema-recovery-39925016206.json',import.meta.url),'utf8'));
 const proofBytes=readFileSync(new URL('../../'+policy.proof.path,import.meta.url));
 const proof=JSON.parse(String(proofBytes));
 const run=workflowRun({id:Number(policy.failed_run_id),head_sha:policy.failed_sha,conclusion:'failure'});
 const jobs={total_count:3,jobs:structuredClone(proof.jobs)},artifacts={total_count:1,artifacts:[{...policy.artifact,expired:false}]};
 return {policy,proofBytes,run,jobs,artifacts};
}
test('exact operator recovery evidence binds failed identity, full readback, absent schema and artifact digest',()=>{
 const f=operatorRecoveryFixture();assert.equal(assertOperatorRecoveryEvidence(f.policy,f.run,f.jobs,f.artifacts,f.proofBytes).mw3_outcome.verified_deliveries,32);
 for(const patch of [{id:39925016207},{head_sha:'a'.repeat(40)},{run_attempt:2},{conclusion:'success'},{event:'workflow_dispatch'},{head_branch:'development'}])assert.throws(()=>assertOperatorRecoveryEvidence(f.policy,{...f.run,...patch},f.jobs,f.artifacts,f.proofBytes));
 for(const mutate of [(j:any)=>j.jobs.pop(),(j:any)=>j.total_count=4,(j:any)=>j.jobs[2].steps.push({name:'unexpected-write',status:'completed',conclusion:'success'}),(j:any)=>j.jobs[2].steps.find((s:any)=>s.name==='Deploy ranked API before enabling the client').conclusion='success']){
  const jobs=structuredClone(f.jobs);mutate(jobs);assert.throws(()=>assertOperatorRecoveryEvidence(f.policy,f.run,jobs,f.artifacts,f.proofBytes));
 }
 for(const patch of [{expired:true},{digest:'sha256:'+'0'.repeat(64)},{id:1}])assert.throws(()=>assertOperatorRecoveryEvidence(f.policy,f.run,f.jobs,{total_count:1,artifacts:[{...f.artifacts.artifacts[0],...patch}]},f.proofBytes));
 assert.throws(()=>assertOperatorRecoveryEvidence(f.policy,f.run,f.jobs,f.artifacts,Buffer.concat([f.proofBytes,Buffer.from(' ')])));
});
test('operator recovery source scope cannot widen fixes, numerical/schema groups or arbitrary code',()=>{
 const f=operatorRecoveryFixture(),paths=Object.keys(f.policy.source_fix_hashes),readBlob=(p:string)=>readFileSync(new URL('../../'+p,import.meta.url)),before:any={};
 for(const g of ['preflop','postflop','mw3','mw3_schema','ranked_schema','fastfold_schema','human_schema','human_avatar_schema','ondemand_schema','operator_schema','profile_schema','review_receipt','full'])before[g]={sha256:'x',files:1};
 assert.doesNotThrow(()=>assertOperatorRecoverySourceScope(f.policy,paths,before,{...before,full:{sha256:'new',files:2}},readBlob));
 assert.throws(()=>assertOperatorRecoverySourceScope(f.policy,[...paths,'apps/backend/src/aiv2-ondemand.ts'],before,before,readBlob));
 assert.throws(()=>assertOperatorRecoverySourceScope({...f.policy,allowed_paths:[...f.policy.allowed_paths,'apps/backend/src/aiv2-ondemand.ts']},paths,before,before,readBlob));
 assert.throws(()=>assertOperatorRecoverySourceScope(f.policy,paths.slice(1),before,before,readBlob));
 assert.throws(()=>assertOperatorRecoverySourceScope(f.policy,paths,before,before,()=>Buffer.from('drift')));
 for(const group of Object.keys(before).filter(g=>!['full','review_receipt'].includes(g)))assert.throws(()=>assertOperatorRecoverySourceScope(f.policy,paths,before,{...before,[group]:{sha256:'changed',files:1}},readBlob));
 const workflow=readFileSync(new URL('../../.github/workflows/deploy-worker.yml',import.meta.url),'utf8');
 for(const key of ['recovery_run_id','recovery_sha','recovery_proof_hash']){assert.ok(workflow.includes(key+': ${{ steps.scope.outputs.'+key+' }}'));assert.ok(workflow.includes(key+': ${{ needs.scope.outputs.'+key+' }}'));}
});

test('operator recovery preserves every historical receipt field and source path',()=>{
 const before={sources:[{path:'source',sha256:'old'}],content_sha256:'old',artifacts:[{sha256:'immutable'}],review:{approved:false},old_amendments:[{keep:true}]};
 const after={...before,sources:[{path:'source',sha256:'new'}],content_sha256:'new',operator_schema_recovery_source_renewals:[{scope:'source-only'}]};
 assert.doesNotThrow(()=>assertOperatorRecoveryReceipt(before,after));
 for(const patch of [{artifacts:[]},{review:{approved:true}},{old_amendments:[]},{sources:[{path:'replacement'}]},{operator_schema_recovery_source_renewals:[]},{unknown_review_override:true}])assert.throws(()=>assertOperatorRecoveryReceipt(before,{...after,...patch}));
});

test('operator recovery refuses unbound archive bytes before readback extraction',()=>{
 const f=operatorRecoveryFixture(),proof=JSON.parse(String(f.proofBytes));
 assert.throws(()=>assertOperatorRecoveryArchive(f.policy,proof,Buffer.from('unbound archive bytes')));
});
