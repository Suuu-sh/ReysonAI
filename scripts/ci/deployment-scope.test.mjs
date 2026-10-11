import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { classifyChangedPaths, classifyEvent, changedGroups, fingerprintsAtCommit, latestDeploymentRun } from './deployment-scope.mjs';

const workflowRun = (overrides = {}) => {
  const run = {
    id: 100, path: '.github/workflows/deploy-worker.yml@main', head_branch: 'main', event: 'push',
    status: 'completed', conclusion: 'success', head_sha: '', created_at: '2026-10-10T12:00:00Z', ...overrides,
  };
  run.updated_at ??= run.created_at;
  return run;
};

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'reysonai-scope-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'CI Scope Test']);
  git(root, ['config', 'user.email', 'ci-scope@example.invalid']);
  return root;
}

function commit(root, changes) {
  for (const [path, contents] of Object.entries(changes)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    if (contents === null) rmSync(absolute, { force: true });
    else writeFileSync(absolute, contents);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture']);
  return git(root, ['rev-parse', 'HEAD']);
}

function successFetcher(run) {
  return async url => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) return { ok: true, json: async () => ({ workflow_runs: [run] }) };
    assert.match(url, /\/actions\/runs\/\d+\/jobs\?/);
    return { ok: true, json: async () => ({ jobs: [{
      name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data',
      status: 'completed', conclusion: 'success',
    }] }) };
  };
}

function jobsFetcher(byRunId) {
  return async url => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return { ok: true, json: async () => ({ workflow_runs: byRunId.pages?.[page] ?? byRunId.runs ?? [] }) };
    }
    const match = /\/actions\/runs\/(\d+)\/jobs\?/.exec(url);
    assert.ok(match, `unexpected request ${url}`);
    return { ok: true, json: async () => ({ jobs: byRunId.jobs[match[1]] ?? [] }) };
  };
}

function baseFiles() {
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

test('frontend account-only change deploys client without data validation or D1 work', async t => {
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

test('MW3 artifact change imports only MW3 and keeps its live consumer acceptance', async t => {
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

test('preflop source change republishes dependent postflop policies and verifies MW3 source identity', async t => {
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

test('reviewed preflop archive-only change releases data without rebuilding unchanged Workers', async t => {
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

test('unknown lineage runs full verification but blocks every automatic production write', async t => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200',
    fetcher: async () => ({ ok: true, json: async () => ({ workflow_runs: [workflowRun({ id: 90, status: 'completed', conclusion: 'failure', head_sha: 'a'.repeat(40) })] }) }),
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

test('manual force input is the only recovery path when lineage cannot be proved', async t => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  let queried = false;
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'workflow_dispatch', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', event: { inputs: { force_data_release: true } },
    fetcher: async () => { queried = true; throw new Error('must not query'); },
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

test('workflow reruns verify fully but never repeat production writes, including force dispatch reruns', async t => {
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

test('changed data for an unknown artifact family takes the full reviewed path', async t => {
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

test('review receipt changes run all integrity checks without re-importing reviewed data', async t => {
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

test('canonical reviewed-source changes run every integrity verifier without enabling D1 writes', async t => {
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
      fetcher: async () => { throw new Error('PR classification must not use production run history'); },
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

test('main deploy verifies reviewed source-only changes without repeating any D1 import', async t => {
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

test('PR code changes use the base/head hashes and never enable production writes', async t => {
  const root = repository(t);
  const base = commit(root, baseFiles());
  const head = commit(root, { 'apps/backend/src/worker.ts': 'export default {};\n' });
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'pull_request', ref: 'refs/pull/1/merge', sha: head,
    event: { pull_request: { base: { sha: base } } }, repository: 'Suuu-sh/ReysonAI', runId: '200',
    fetcher: async () => { throw new Error('PR classification must not use production run history'); },
  });
  assert.equal(plan.mode, 'pull-request');
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.deploy_api, true);
  assert.equal(plan.mw3_live, false);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_mw3, false);
  assert.equal(plan.release_safe, false);
});

test('data files changed in a PR run scoped review but do not permit D1 writes', async t => {
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

test('run lookup accepts the Actions API path@ref form, ignores unrelated workflows, then picks newest deploy-worker run', async () => {
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

test('run lookup remains compatible with a bare workflow path', async () => {
  const found = await latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    runs: [workflowRun({ id: 298, path: '.github/workflows/deploy-worker.yml', head_sha: 'b'.repeat(40) })],
    jobs: { '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
  }) });
  assert.equal(found.id, 298);
});

test('a rerun is ordered by latest activity so an old SHA can never hide a later production write', async () => {
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

test('deployment history pages are combined before choosing the latest rerun activity', async () => {
  const unrelatedRuns = Array.from({ length: 99 }, (_, index) => workflowRun({
    id: 1000 + index, path: '.github/workflows/verify-fastfold.yml',
    created_at: '2026-10-10T12:59:00Z', updated_at: '2026-10-10T12:59:00Z',
  }));
  const pageOneBaseline = workflowRun({ id: 298, head_sha: 'b'.repeat(40), created_at: '2026-10-10T12:30:00Z', updated_at: '2026-10-10T12:45:00Z' });
  const pageTwoRerun = workflowRun({ id: 299, head_sha: 'a'.repeat(40), created_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-10T13:10:00Z', run_attempt: 2, conclusion: 'failure' });
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: jobsFetcher({
    pages: { 1: [...unrelatedRuns, pageOneBaseline], 2: [pageTwoRerun] },
    jobs: { '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
  }) }), /latest main deployment run 299 is completed\/failure/);
});

test('the 1,000-result Actions history cap fails closed instead of trusting a truncated page', async () => {
  const requestedPages = [];
  const fetcher = async url => {
    if (/\/actions\/workflows\/deploy-worker\.yml\/runs\?branch=main/.test(url)) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      requestedPages.push(page);
      const workflow_runs = page <= 10 ? Array.from({ length: 100 }, (_, index) => workflowRun({
        id: page * 100 + index, path: '.github/workflows/verify-fastfold.yml',
      })) : [];
      return { ok: true, json: async () => ({ workflow_runs }) };
    }
    assert.fail(`truncated history must not be used to fetch jobs: ${url}`);
  };
  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher }),
    /reached at least 1000 runs/);
  assert.deepEqual(requestedPages, Array.from({ length: 10 }, (_, index) => index + 1));

  await assert.rejects(latestDeploymentRun({ repository: 'Suuu-sh/ReysonAI', currentRunId: '300', fetcher: async url => {
    assert.match(url, /page=1$/);
    return { ok: true, json: async () => ({ total_count: 1000, workflow_runs: [workflowRun()] }) };
  } }), /reached the 1000-run API result limit/);
});

test('baseline must have a successful production deploy job, not just a successful workflow', async () => {
  const run = (id, created_at) => workflowRun({ id, created_at, head_sha: `${id}`.padStart(40, '0') });
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

test('successful no-op workflow with no successful deploy job is not a release baseline', async () => {
  const found = await latestDeploymentRun({
    repository: 'Suuu-sh/ReysonAI', currentRunId: '300',
    fetcher: jobsFetcher({
      runs: [workflowRun({ id: 299, created_at: '2026-10-10T12:59:00Z', head_sha: 'c'.repeat(40) })],
      jobs: { '299': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'skipped' }] },
    }),
  });
  assert.equal(found, null);
});

test('a newer failed main deployment blocks fallback to an older successful baseline', async t => {
  const run = (id, created_at, overrides = {}) => workflowRun({ id, created_at, head_sha: `${id}`.padStart(40, '0'), ...overrides });
  await assert.rejects(latestDeploymentRun({
    repository: 'Suuu-sh/ReysonAI', currentRunId: '300',
    fetcher: jobsFetcher({
      runs: [
        run(299, '2026-10-10T12:59:00Z', { status: 'completed', conclusion: 'failure' }),
        run(298, '2026-10-10T12:58:00Z'),
      ],
      jobs: { '298': [{ name: 'Deploy authoritative ranked API, compatible client and reviewed preflop data', status: 'completed', conclusion: 'success' }] },
    }),
  }), /latest main deployment run 299 is completed\/failure/);

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

test('a newer in-progress main deployment blocks any automatic production writes', async () => {
  const run = (id, created_at, overrides = {}) => workflowRun({ id, created_at, head_sha: `${id}`.padStart(40, '0'), ...overrides });
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

test('GitHub history/API errors choose the fail-closed full path', async t => {
  const root = repository(t);
  const head = commit(root, baseFiles());
  const plan = await classifyEvent({
    repoRoot: root, eventName: 'push', ref: 'refs/heads/main', sha: head,
    repository: 'Suuu-sh/ReysonAI', runId: '200', fetcher: async () => ({ ok: false, status: 403 }),
  });
  assert.equal(plan.release_safe, false);
  assert.equal(plan.verify_data, true);
  assert.equal(plan.data_release, false);
  assert.equal(plan.import_mw3, false);
});

test('deployment workflow and classifier changes retain the FastFold runtime verifier', () => {
  for (const path of ['.github/workflows/deploy-worker.yml', 'scripts/ci/deployment-scope.mjs']) {
    const plan = classifyChangedPaths([path]);
    assert.equal(plan.verify_backend, true, path);
    assert.equal(plan.verify_data, true, path);
    assert.equal(plan.data_release, false, path);
  }
});

test('standalone scope paths keep code-only changes apart from data roots', () => {
  const plan = classifyChangedPaths(['apps/frontend/src/account/AccountPage.tsx']);
  assert.equal(plan.deploy_frontend, true);
  assert.equal(plan.verify_data, false);
  assert.equal(plan.data_release, false);
});


test('schema-only migrations keep backend checks without frontend install, LFS or Worker deploy', async t => {
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
});

const RECOVERY_WORKFLOW_PATH = '.github/workflows/deploy-worker.yml';
const RECOVERY_WORKFLOW_ID = 374187090;
const RECOVERY_DEPLOY_JOB = 'Deploy authoritative ranked API, compatible client and reviewed preflop data';
const RECOVERY_VERIFY_JOB = 'Verify reviewed preflop snapshot';
const RECOVERY_SCOPE_JOB = 'Classify reviewed code and data inputs';
const RECOVERY_FULL_STEP_NAMES = [
  'Validate deployment secrets',
  'Restore exact reviewed Git LFS payload',
  'Import exact reviewed MW3 data and require full D1 readback',
  'Apply exact ranked schema',
  'Apply exact FastFold schema',
  'Apply exact six-human ranked schema',
  'Apply exact postflop profile schema',
  'Deploy ranked API before enabling the client',
  'Require live authoritative ranked readiness',
  'Require live FastFold API and compatible published data before client',
  'Build',
  'Deploy Worker',
  'Import reviewed preflop snapshot into D1',
  'Require live FastFold release gate after reviewed import',
  'Publish postflop policies into D1',
  'Require live MW3 payloads and actual consumer source identities',
];
const RECOVERY_WRITE_FLAGS = [
  'data_release', 'import_preflop', 'publish_postflop', 'import_mw3',
  'apply_ranked_schema', 'apply_fastfold_schema', 'apply_human_schema', 'apply_profile_schema', 'apply_mw3_schema',
  'mw3_live', 'fastfold_predeploy', 'fastfold_postimport',
];

function recoveryRun(overrides = {}) {
  return {
    id: 100, workflow_id: RECOVERY_WORKFLOW_ID, run_number: 1, run_attempt: 1,
    path: `${RECOVERY_WORKFLOW_PATH}@main`, head_branch: 'main', event: 'push',
    status: 'completed', conclusion: 'success', head_sha: '',
    created_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-10T12:00:00Z', ...overrides,
  };
}

function recoveryStep(name, conclusion = 'success') {
  return { name, status: 'completed', conclusion };
}

function recoveryJob(id, name, conclusion = 'success', steps = []) {
  return { id, name, status: 'completed', conclusion, steps };
}

function recoveryFullJobs(firstId = 1000) {
  return [
    recoveryJob(firstId, RECOVERY_SCOPE_JOB),
    recoveryJob(firstId + 1, RECOVERY_VERIFY_JOB),
    recoveryJob(firstId + 2, RECOVERY_DEPLOY_JOB, 'success', RECOVERY_FULL_STEP_NAMES.map(name => recoveryStep(name))),
  ];
}

function recoverySafeJobs(firstId, deployConclusion) {
  return [
    recoveryJob(firstId, RECOVERY_SCOPE_JOB),
    recoveryJob(firstId + 1, RECOVERY_VERIFY_JOB),
    recoveryJob(firstId + 2, RECOVERY_DEPLOY_JOB, deployConclusion),
  ];
}

function codeOnlyFixture(t) {
  const root = repository(t);
  const files = baseFiles();
  files[RECOVERY_WORKFLOW_PATH] = 'name: supported recovery workflow\n';
  files['apps/backend/migrations/0010_fastfold.sql'] = 'CREATE TABLE fastfold (id TEXT);\n';
  files['apps/backend/migrations/0011_human_ranked.sql'] = 'CREATE TABLE human_ranked (id TEXT);\n';
  files['apps/backend/migrations/0012_postflop_profile_policies.sql'] = 'CREATE TABLE postflop_profiles (id TEXT);\n';
  files['apps/backend/scripts/sql/mw3-schema.sql'] = 'CREATE TABLE mw3_schema (id TEXT);\n';
  files['artifacts/preflop/demo.json'] = '{"version":1}\n';
  files['configs/other-reviewed-data.json'] = '{"version":1}\n';
  files['apps/backend/src/fastfold.ts'] = 'export const sourceVersion = 1;\n';
  const base = commit(root, files);
  const head = commit(root, { 'apps/backend/src/fastfold.ts': 'export const sourceVersion = 2;\n' });
  const supportedBlob = git(root, ['rev-parse', `${head}:${RECOVERY_WORKFLOW_PATH}`]);

  const baseline = recoveryRun({ id: 101, run_number: 1, head_sha: base });
  const cancelledWithoutJobs = recoveryRun({
    id: 102, run_number: 2, head_sha: base, conclusion: 'cancelled',
  });
  const cancelledBeforeDeploy = recoveryRun({
    id: 103, run_number: 3, head_sha: head, conclusion: 'cancelled',
  });
  const deploySkipped = recoveryRun({ id: 104, run_number: 4, head_sha: head });
  const current = recoveryRun({
    id: 105, run_number: 5, head_sha: head,
    event: 'workflow_dispatch', status: 'in_progress', conclusion: null,
  });
  const runs = [current, deploySkipped, cancelledBeforeDeploy, cancelledWithoutJobs, baseline];
  const jobs = {
    101: recoveryFullJobs(1000),
    102: [],
    103: recoverySafeJobs(2000, 'cancelled'),
    104: recoverySafeJobs(3000, 'skipped'),
  };
  return { root, base, head, supportedBlob, baseline, current, runs, jobs };
}

function recoveryFetcher(fixture, {
  runs = fixture.runs,
  jobs = fixture.jobs,
  currentRun = runs.find(run => run.id === fixture.current.id),
  refSha = fixture.head,
  historyTotalCount = runs.length,
  jobTotalCounts = {},
  badUrl = null,
  historyResponse = null,
  workflowMetadata = { id: RECOVERY_WORKFLOW_ID, path: RECOVERY_WORKFLOW_PATH, state: 'active' },
} = {}) {
  return async url => {
    const parsed = new URL(url);
    if (badUrl && badUrl(parsed)) return { ok: false, status: 503, json: async () => ({}) };
    if (parsed.pathname.endsWith(`/actions/workflows/${RECOVERY_WORKFLOW_PATH.split('/').at(-1)}`) && !parsed.search) {
      return { ok: true, json: async () => workflowMetadata };
    }
    if (parsed.pathname.endsWith('/git/ref/heads/main')) {
      return { ok: true, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: refSha } }) };
    }
    const currentMatch = /\/actions\/runs\/(\d+)$/.exec(parsed.pathname);
    if (currentMatch) return { ok: true, json: async () => currentRun };
    if (parsed.pathname.endsWith(`/actions/workflows/${RECOVERY_WORKFLOW_PATH.split('/').at(-1)}/runs`)) {
      const page = Number(parsed.searchParams.get('page') ?? '1');
      const offset = (page - 1) * 100;
      return { ok: true, json: async () => historyResponse ?? ({
        workflow_runs: runs.slice(offset, offset + 100), total_count: historyTotalCount,
      }) };
    }
    const jobsMatch = /\/actions\/runs\/(\d+)\/jobs$/.exec(parsed.pathname);
    if (jobsMatch) {
      const id = jobsMatch[1];
      const page = Number(parsed.searchParams.get('page') ?? '1');
      const allJobs = jobs[id] ?? [];
      const offset = (page - 1) * 100;
      return { ok: true, json: async () => ({
        jobs: allJobs.slice(offset, offset + 100),
        total_count: jobTotalCounts[id] ?? allJobs.length,
      }) };
    }
    throw new Error(`unexpected recovery API request ${url}`);
  };
}

async function classifyCodeOnlyRecovery(fixture, overrides = {}) {
  const runs = overrides.runs ?? fixture.runs;
  return classifyEvent({
    repoRoot: fixture.root,
    eventName: overrides.eventName ?? 'workflow_dispatch',
    ref: overrides.ref ?? 'refs/heads/main',
    sha: overrides.sha ?? fixture.head,
    repository: 'Suuu-sh/ReysonAI',
    runId: String(overrides.runId ?? fixture.current.id),
    runAttempt: String(overrides.runAttempt ?? '1'),
    event: overrides.event ?? { inputs: { code_only_recovery: true } },
    fetcher: overrides.fetcher ?? recoveryFetcher(fixture, overrides),
    supportedWorkflowBlobShas: overrides.supportedWorkflowBlobShas ?? new Set([fixture.supportedBlob]),
  });
}

function assertCodeOnlyRejected(plan) {
  assert.equal(plan.mode, 'manual-code-only-recovery-rejected');
  assert.equal(plan.lineage_known, false);
  assert.equal(plan.release_safe, false);
  assert.equal(plan.deploy_api, false);
  assert.equal(plan.deploy_frontend, false);
  for (const key of RECOVERY_WRITE_FLAGS) assert.equal(plan[key], false, `${key} must remain false`);
}

test('code-only recovery accepts complete lineage and keeps all remote data operations disabled', async t => {
  const fixture = codeOnlyFixture(t);
  const plan = await classifyCodeOnlyRecovery(fixture);
  assert.equal(plan.mode, 'manual-code-only-recovery');
  assert.equal(plan.lineage_known, true);
  assert.equal(plan.release_safe, true);
  assert.equal(plan.baseline_run_id, String(fixture.baseline.id));
  assert.equal(plan.baseline_sha, fixture.base);
  assert.equal(plan.deploy_api, true);
  assert.equal(plan.verify_backend, true);
  assert.equal(plan.verify_preflop, true);
  assert.equal(plan.verify_postflop, true);
  assert.equal(plan.verify_mw3, true);
  assert.equal(plan.needs_frontend_deps, true);
  for (const key of RECOVERY_WRITE_FLAGS) assert.equal(plan[key], false, `${key} must remain false`);
});

test('code-only recovery accepts a newer proven full deployment as its baseline', async t => {
  const fixture = codeOnlyFixture(t);
  const external = recoveryRun({ id: 106, run_number: 5, head_sha: fixture.head, event: 'workflow_dispatch' });
  const current = { ...fixture.current, run_number: 6 };
  const runs = [current, external, ...fixture.runs.slice(1)];
  const jobs = { ...fixture.jobs, 106: recoveryFullJobs(6000) };
  const plan = await classifyCodeOnlyRecovery(fixture, {
    runs, jobs, currentRun: current,
    fetcher: recoveryFetcher(fixture, { runs, jobs, currentRun: current }),
  });
  assert.equal(plan.mode, 'manual-code-only-recovery');
  assert.equal(plan.baseline_run_id, '106');
  assert.equal(plan.baseline_sha, fixture.head);
  for (const key of RECOVERY_WRITE_FLAGS) assert.equal(plan[key], false, `${key} must remain false`);
});

test('code-only recovery allows receipt-only renewal while preserving data fingerprints', async t => {
  const fixture = codeOnlyFixture(t);
  const next = commit(fixture.root, {
    'configs/multiway-preflop-stage2.review.json': JSON.stringify({
      sources: [{ path: 'apps/backend/src/fastfold.ts' }], renewal: 2,
    }) + '\n',
  });
  const current = { ...fixture.current, head_sha: next };
  const runs = fixture.runs.map(run => run.id === fixture.current.id ? current : run);
  const plan = await classifyCodeOnlyRecovery(fixture, {
    sha: next, runs, currentRun: current,
    fetcher: recoveryFetcher(fixture, { runs, currentRun: current, refSha: next }),
  });
  assert.equal(plan.mode, 'manual-code-only-recovery');
  assert.equal(plan.release_safe, true);
  for (const key of RECOVERY_WRITE_FLAGS) assert.equal(plan[key], false, `${key} must remain false`);
});

test('every data and schema fingerprint must match the successful baseline', async t => {
  const dataGroups = [
    ['preflop', 'artifacts/preflop/demo.json'],
    ['postflop', 'artifacts/postflop/hu-demo.sql'],
    ['mw3', 'artifacts/postflop/mw3-demo.sql'],
    ['mw3_schema', 'apps/backend/scripts/sql/mw3-schema.sql'],
    ['ranked_schema', 'apps/backend/migrations/0009_ranked.sql'],
    ['fastfold_schema', 'apps/backend/migrations/0010_fastfold.sql'],
    ['human_schema', 'apps/backend/migrations/0011_human_ranked.sql'],
    ['profile_schema', 'apps/backend/migrations/0012_postflop_profile_policies.sql'],
    ['full', 'configs/other-reviewed-data.json'],
  ];
  for (const [group, path] of dataGroups) {
    const fixture = codeOnlyFixture(t);
    const next = commit(fixture.root, { [path]: `changed for ${group}\n` });
    const current = { ...fixture.current, head_sha: next };
    const runs = fixture.runs.map(run => run.id === fixture.current.id ? current : run);
    const plan = await classifyCodeOnlyRecovery(fixture, {
      sha: next, runs, currentRun: current,
      fetcher: recoveryFetcher(fixture, { runs, currentRun: current, refSha: next }),
    });
    assertCodeOnlyRejected(plan);
    assert.match(plan.reason, /data or schema fingerprints changed/);
  }
});

test('code-only recovery rejects missing, stale, malformed, or incomplete lineage evidence', async t => {
  const fixture = codeOnlyFixture(t);
  const scenarios = [
    ['main advanced beyond the requested SHA', opts => ({ ...opts, refSha: fixture.base })],
    ['current run omitted from complete history', opts => ({ ...opts, runs: opts.runs.filter(run => run.id !== fixture.current.id), historyTotalCount: opts.runs.length - 1 })],
    ['history pagination is truncated', opts => ({ ...opts, historyTotalCount: opts.runs.length + 1 })],
    ['history hit the API result cap', opts => ({ ...opts, historyTotalCount: 1000 })],
    ['no full successful baseline', opts => ({ ...opts, runs: opts.runs.filter(run => run.id !== 101), historyTotalCount: opts.runs.length - 1 })],
    ['duplicate run number', opts => ({ ...opts, runs: opts.runs.map(run => run.id === 104 ? { ...run, run_number: 2 } : run) })],
    ['current run duplicated', opts => ({ ...opts, runs: [...opts.runs, fixture.current], historyTotalCount: opts.runs.length + 1 })],
    ['history response is malformed', opts => ({ ...opts, historyResponse: { workflow_runs: [] } })],
    ['history API unavailable', opts => ({ ...opts, badUrl: parsed => parsed.pathname.endsWith('/runs') })],
    ['job evidence is truncated', opts => ({ ...opts, jobTotalCounts: { 101: fixture.jobs[101].length + 1 } })],
    ['job API unavailable', opts => ({ ...opts, badUrl: parsed => /\/actions\/runs\/\d+\/jobs$/.test(parsed.pathname) })],
  ];
  for (const [label, transform] of scenarios) {
    const opts = transform({ runs: structuredClone(fixture.runs) });
    const plan = await classifyCodeOnlyRecovery(fixture, { ...opts, fetcher: recoveryFetcher(fixture, opts) });
    assertCodeOnlyRejected(plan);
    assert.ok(plan.reason, label);
  }
});

test('code-only recovery rejects incorrect current-run identity and unsupported workflow revisions', async t => {
  const fixture = codeOnlyFixture(t);
  const scenarios = [
    ['wrong event', { currentRun: { ...fixture.current, event: 'push' } }],
    ['wrong run id', { runId: 999 }],
    ['workflow API returned wrong id', { workflowMetadata: { id: RECOVERY_WORKFLOW_ID + 1, path: RECOVERY_WORKFLOW_PATH, state: 'active' } }],
    ['workflow API returned disabled workflow', { workflowMetadata: { id: RECOVERY_WORKFLOW_ID, path: RECOVERY_WORKFLOW_PATH, state: 'disabled_manually' } }],
    ['wrong branch', { currentRun: { ...fixture.current, head_branch: 'codex/other' } }],
    ['wrong workflow id', { currentRun: { ...fixture.current, workflow_id: RECOVERY_WORKFLOW_ID + 1 } }],
    ['wrong workflow path', { currentRun: { ...fixture.current, path: '.github/workflows/other.yml@main' } }],
    ['rerun', { currentRun: { ...fixture.current, run_attempt: 2 } }],
    ['wrong exact SHA', { currentRun: { ...fixture.current, head_sha: fixture.base } }],
    ['unsupported workflow blob', { supportedWorkflowBlobShas: new Set() }],
    ['rerun attempt input', { runAttempt: 2 }],
    ['invalid attempt input', { runAttempt: 0 }],
  ];
  for (const [label, overrides] of scenarios) {
    const current = overrides.currentRun ?? fixture.current;
    const runs = fixture.runs.map(run => run.id === fixture.current.id ? current : run);
    const fetcher = recoveryFetcher(fixture, { ...overrides, runs, currentRun: current });
    const plan = await classifyCodeOnlyRecovery(fixture, { ...overrides, runs, fetcher });
    assertCodeOnlyRejected(plan);
    assert.ok(plan.reason, label);
  }
});

test('code-only recovery rejects unrelated commits and unknown workflow provenance in history', async t => {
  const fixture = codeOnlyFixture(t);
  const tree = git(fixture.root, ['rev-parse', `${fixture.base}^{tree}`]);
  const orphan = execFileSync('git', ['-C', fixture.root, 'commit-tree', tree, '-m', 'unrelated history fixture'], { encoding: 'utf8' }).trim();
  const scenarios = [
    ['non-ancestor run SHA', runs => runs.map(run => run.id === 103 ? { ...run, head_sha: orphan } : run)],
    ['active intervening run', runs => runs.map(run => run.id === 103 ? { ...run, status: 'in_progress', conclusion: null } : run)],
    ['unknown workflow id in history', runs => runs.map(run => run.id === 103 ? { ...run, workflow_id: RECOVERY_WORKFLOW_ID + 1 } : run)],
    ['unknown path in history', runs => runs.map(run => run.id === 103 ? { ...run, path: '.github/workflows/unknown.yml@main' } : run)],
    ['unsupported run attempt in history', runs => runs.map(run => run.id === 103 ? { ...run, run_attempt: 2 } : run)],
    ['unknown completed conclusion', runs => runs.map(run => run.id === 103 ? { ...run, conclusion: 'unrecognized' } : run)],
  ];
  for (const [label, mutate] of scenarios) {
    const runs = mutate(structuredClone(fixture.runs));
    const plan = await classifyCodeOnlyRecovery(fixture, { runs, fetcher: recoveryFetcher(fixture, { runs }) });
    assertCodeOnlyRejected(plan);
    assert.ok(plan.reason, label);
  }

  git(fixture.root, ['reset', '--hard', fixture.base]);
  const untrustedWorkflowCommit = commit(fixture.root, { [RECOVERY_WORKFLOW_PATH]: 'name: unapproved workflow revision\n' });
  const safeHead = commit(fixture.root, {
    [RECOVERY_WORKFLOW_PATH]: 'name: supported recovery workflow\n',
    'apps/backend/src/fastfold.ts': 'export const sourceVersion = 2;\n',
  });
  const current = { ...fixture.current, head_sha: safeHead };
  const runs = fixture.runs.map(run => {
    if (run.id === 103) return { ...run, head_sha: untrustedWorkflowCommit };
    if (run.id === 104) return { ...run, head_sha: safeHead };
    if (run.id === fixture.current.id) return current;
    return run;
  });
  const unsupportedIntermediate = await classifyCodeOnlyRecovery(fixture, {
    sha: safeHead, runs, currentRun: current,
    fetcher: recoveryFetcher(fixture, { runs, currentRun: current, refSha: safeHead }),
  });
  assertCodeOnlyRejected(unsupportedIntermediate);
  assert.match(unsupportedIntermediate.reason, /workflow revision is unsupported/);
});

test('code-only recovery rejects partial or incompletely evidenced deployments', async t => {
  const fixture = codeOnlyFixture(t);
  const scenarios = [
    ['deployment started before cancellation', jobs => ({ ...jobs, 103: recoverySafeJobs(2000, 'cancelled').map(job =>
      job.name === RECOVERY_DEPLOY_JOB ? { ...job, steps: [recoveryStep('Validate deployment secrets')] } : job) })],
    ['failed deployment', jobs => ({ ...jobs, 103: recoverySafeJobs(2000, 'failure') })],
    ['successful but not full deployment', jobs => ({ ...jobs, 103: [
      recoveryJob(2000, RECOVERY_SCOPE_JOB), recoveryJob(2001, RECOVERY_VERIFY_JOB),
      recoveryJob(2002, RECOVERY_DEPLOY_JOB, 'success', [recoveryStep('Build')]),
    ] })],
    ['unknown job in history', jobs => ({ ...jobs, 103: [...recoverySafeJobs(2000, 'cancelled'), recoveryJob(2003, 'Unexpected job')] })],
    ['new external run is still in progress', jobs => jobs],
  ];
  for (const [label, mutateJobs] of scenarios) {
    let runs = structuredClone(fixture.runs);
    let jobs = structuredClone(fixture.jobs);
    if (label === 'new external run is still in progress') {
      const active = recoveryRun({ id: 106, run_number: 5, head_sha: fixture.head, status: 'in_progress', conclusion: null });
      const current = { ...fixture.current, run_number: 6 };
      runs = [current, active, ...runs.slice(1)];
    }
    jobs = mutateJobs(jobs);
    const current = runs.find(run => run.id === fixture.current.id);
    const plan = await classifyCodeOnlyRecovery(fixture, { runs, fetcher: recoveryFetcher(fixture, { runs, jobs, currentRun: current }) });
    assertCodeOnlyRejected(plan);
    assert.ok(plan.reason, label);
  }
});

test('default dispatch remains fail-closed and conflicting recovery inputs cannot deploy or write', async t => {
  const fixture = codeOnlyFixture(t);
  let recoveryApiCalled = false;
  const failureFetcher = async url => {
    if (url.endsWith('/git/ref/heads/main') || /\/actions\/runs\/\d+$/.test(new URL(url).pathname)) recoveryApiCalled = true;
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const defaultPlan = await classifyEvent({
    repoRoot: fixture.root, eventName: 'workflow_dispatch', ref: 'refs/heads/main', sha: fixture.head,
    repository: 'Suuu-sh/ReysonAI', runId: '999', event: { inputs: { code_only_recovery: false, force_data_release: false } },
    fetcher: failureFetcher,
  });
  assert.equal(recoveryApiCalled, false);
  assert.equal(defaultPlan.release_safe, false);
  assert.equal(defaultPlan.deploy_api, false);
  assert.equal(defaultPlan.deploy_frontend, false);
  assert.notEqual(defaultPlan.mode, 'manual-code-only-recovery-rejected');
  for (const key of RECOVERY_WRITE_FLAGS.slice(0, 9)) assert.equal(defaultPlan[key], false, `${key} must remain false`);

  const conflict = await classifyCodeOnlyRecovery(fixture, {
    event: { inputs: { code_only_recovery: true, force_data_release: true } },
    fetcher: async () => { throw new Error('conflicting inputs must be rejected before API lookup'); },
  });
  assertCodeOnlyRejected(conflict);
});

test('workflow gates recovery inputs, remote operations, and deployment freshness checks', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8');
  assert.match(workflow, /code_only_recovery:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(workflow, /fetch-depth: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.code_only_recovery == true && '0' \|\| '1' \}\}/);
  assert.match(workflow, /Keep code-only recovery free of remote data changes/);
  assert.match(workflow, /Recheck main head before code-only API deployment/);
  assert.match(workflow, /Recheck main head before code-only Worker deployment/);
  assert.match(workflow, /Code-only recovery unexpectedly enabled/);
});

function successfulCodeOnlyJobs(firstId, deployment = 'api') {
  const remoteSteps = [
    'Import exact reviewed MW3 data and require full D1 readback',
    'Apply exact ranked schema',
    'Apply exact FastFold schema',
    'Apply exact six-human ranked schema',
    'Apply exact postflop profile schema',
    'Require live authoritative ranked readiness',
    'Require live FastFold API and compatible published data before client',
    'Import reviewed preflop snapshot into D1',
    'Require live FastFold release gate after reviewed import',
    'Publish postflop policies into D1',
    'Require live MW3 payloads and actual consumer source identities',
  ];
  const verify = recoveryJob(firstId, RECOVERY_VERIFY_JOB, 'success', [
    recoveryStep('Keep code-only recovery free of remote data changes'),
  ]);
  const scope = recoveryJob(firstId + 1, RECOVERY_SCOPE_JOB);
  if (deployment === 'none') return [scope, verify];
  const api = deployment === 'api';
  const worker = deployment === 'worker';
  const steps = [
    recoveryStep('Validate deployment secrets'),
    ...remoteSteps.map(name => recoveryStep(name, 'skipped')),
    recoveryStep('Recheck main head before code-only API deployment', api ? 'success' : 'skipped'),
    recoveryStep('Deploy ranked API before enabling the client', api ? 'success' : 'skipped'),
    recoveryStep('Recheck main head before code-only Worker deployment', worker ? 'success' : 'skipped'),
    recoveryStep('Deploy Worker', worker ? 'success' : 'skipped'),
  ];
  return [scope, verify, recoveryJob(firstId + 2, RECOVERY_DEPLOY_JOB, 'success', steps)];
}

test('later recovery accepts a prior successful code-only run only with explicit no-data evidence', async t => {
  for (const deployment of ['api', 'worker', 'none']) {
    await t.test(`${deployment} deployment`, async t2 => {
      const fixture = codeOnlyFixture(t2);
      const prior = recoveryRun({ id: 104, run_number: 4, head_sha: fixture.head, event: 'workflow_dispatch' });
      const current = { ...fixture.current, run_number: 5 };
      const runs = [current, prior, ...fixture.runs.slice(2)];
      const jobs = { ...fixture.jobs, 104: successfulCodeOnlyJobs(4000, deployment) };
      const plan = await classifyCodeOnlyRecovery(fixture, {
        runs, jobs, currentRun: current,
        fetcher: recoveryFetcher(fixture, { runs, jobs, currentRun: current }),
      });
      assert.equal(plan.mode, 'manual-code-only-recovery');
      assert.equal(plan.baseline_run_id, String(fixture.baseline.id));
      for (const key of RECOVERY_WRITE_FLAGS) assert.equal(plan[key], false, `${key} must remain false`);
    });
  }
});
