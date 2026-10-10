import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    'configs/multiway-preflop-stage2.review.json': '{"source":"old"}\n',
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
  const head = commit(root, { 'configs/multiway-preflop-stage2.review.json': '{"source":"refreshed"}\n' });
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
