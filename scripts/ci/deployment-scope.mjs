import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/i;
const WORKFLOW_PATH = '.github/workflows/deploy-worker.yml';
const WORKFLOW_ID = 'deploy-worker.yml';
const DEPLOY_JOB_NAME = 'Deploy authoritative ranked API, compatible client and reviewed preflop data';
const MAIN_DEPLOY_EVENTS = new Set(['push', 'workflow_dispatch']);
const RUNS_PER_PAGE = 100;
const MAX_RUN_HISTORY_RESULTS = 1000;
const MAX_RUN_HISTORY_PAGES = MAX_RUN_HISTORY_RESULTS / RUNS_PER_PAGE;
const DATA_ROOTS = ['artifacts/', 'configs/', 'apps/frontend/scripts/data/'];
const REVIEW_RECEIPTS = [
  'configs/multiway-preflop-stage2.review.json',
  'configs/multiway-preflop-stage3.review.json',
];
const MIGRATIONS = new Map([
  ['apps/backend/migrations/0003_preflop.sql', 'preflop'],
  ['apps/backend/migrations/0009_ranked.sql', 'ranked_schema'],
  ['apps/backend/migrations/0010_fastfold.sql', 'fastfold_schema'],
  ['apps/backend/migrations/0011_human_ranked.sql', 'human_schema'],
  ['apps/backend/migrations/0012_postflop_profile_policies.sql', 'profile_schema'],
]);
const HASH_GROUPS = ['preflop', 'postflop', 'mw3', 'mw3_schema', 'ranked_schema', 'fastfold_schema', 'human_schema', 'profile_schema', 'review_receipt', 'full'];
const OUTPUT_KEYS = [
  'lineage_known', 'release_safe', 'verify_data', 'verify_preflop', 'verify_postflop', 'verify_mw3',
  'verify_backend', 'verify_frontend', 'needs_frontend_deps', 'needs_mcp_deps', 'deploy_api', 'deploy_frontend',
  'data_release', 'import_preflop', 'publish_postflop', 'import_mw3', 'apply_ranked_schema',
  'apply_fastfold_schema', 'apply_human_schema', 'apply_profile_schema', 'apply_mw3_schema',
  'mw3_live', 'fastfold_predeploy', 'fastfold_postimport', 'mode', 'reason', 'baseline_run_id',
  'baseline_sha', 'input_hashes',
];

function emptyPlan(reason = 'no relevant changes') {
  return {
    lineage_known: false, release_safe: false, verify_data: false, verify_preflop: false,
    verify_postflop: false, verify_mw3: false, verify_backend: false, verify_frontend: false,
    needs_frontend_deps: false, needs_mcp_deps: false, deploy_api: false, deploy_frontend: false,
    data_release: false, import_preflop: false, publish_postflop: false, import_mw3: false,
    apply_ranked_schema: false, apply_fastfold_schema: false, apply_human_schema: false,
    apply_profile_schema: false, apply_mw3_schema: false, mw3_live: false,
    fastfold_predeploy: false, fastfold_postimport: false, mode: 'no-op', reason,
    baseline_run_id: '', baseline_sha: '', input_hashes: '',
  };
}

function dataGroup(path) {
  if (path === '.gitattributes') return 'full';
  if (/^configs\/[^/]+\.review\.json$/.test(path)) return 'review_receipt';
  if (MIGRATIONS.has(path)) return MIGRATIONS.get(path);
  if (path === 'apps/backend/scripts/sql/mw3-schema.sql') return 'mw3_schema';
  if (path === 'apps/shared/mw3-approved.ts') return 'mw3';
  if (path.startsWith('artifacts/preflop/')) return 'preflop';
  if (path.startsWith('artifacts/postflop/')) return path.slice('artifacts/postflop/'.length).startsWith('mw3-') ? 'mw3' : 'postflop';
  if (path.startsWith('configs/')) return 'full';
  if (path.startsWith('apps/frontend/src/estimated/') && path.endsWith('.json')) return 'preflop';
  if (path.startsWith('apps/frontend/scripts/data/')) {
    const local = path.slice('apps/frontend/scripts/data/'.length);
    if (local.startsWith('mw3-authored/') || local.startsWith('mw3-')) return 'mw3';
    if (local.startsWith('postflop-ai/') || local.startsWith('postflop-ai-') || local === 'hu-after-multiway-spots.json') return 'postflop';
    return 'full';
  }
  if (DATA_ROOTS.some(root => path.startsWith(root)) || path.startsWith('apps/backend/migrations/')) return 'full';
  return null;
}

function dataPathChanged(path) {
  return dataGroup(path) !== null;
}

function isDatasetValidationCode(path) {
  return path === WORKFLOW_PATH || path === '.gitattributes' ||
    path.startsWith('artifacts/') || path.startsWith('configs/') ||
    path.startsWith('apps/frontend/scripts/data/') ||
    path.startsWith('apps/frontend/scripts/postflop-ai/') ||
    path.startsWith('apps/frontend/scripts/lib/') ||
    /^apps\/frontend\/scripts\/(?:restore-reviewed-|verify-reviewed-|import-reviewed-|publish-d1|mw3-production-delivery|verify-preflop|verify-mw3)/.test(path) ||
    path.startsWith('apps/frontend/src/estimated/') ||
    path.startsWith('apps/backend/migrations/') || path === 'apps/backend/scripts/sql/mw3-schema.sql' ||
    path === 'apps/shared/mw3-approved.ts';
}

function addCodeScopes(plan, paths) {
  for (const path of paths) {
    if (/^configs\/[^/]+\.review\.json$/.test(path)) {
      plan.verify_data = true;
      plan.verify_preflop = true;
      plan.verify_postflop = true;
      plan.verify_mw3 = true;
      plan.needs_frontend_deps = true;
    }

    if (path === WORKFLOW_PATH || path.startsWith('scripts/ci/')) {
      plan.verify_data = true;
      plan.verify_preflop = true;
      plan.verify_postflop = true;
      plan.verify_mw3 = true;
      plan.verify_backend = true;
      plan.needs_frontend_deps = true;
    }

    if (path.startsWith('apps/backend/src/') || path === 'apps/backend/package.json' ||
        path === 'apps/backend/package-lock.json' || path === 'apps/backend/wrangler.jsonc' ||
        path.startsWith('apps/backend/migrations/') || path.startsWith('apps/backend/tests/') ||
        path.startsWith('apps/backend/scripts/')) {
      plan.verify_backend = true;
    }
    if (path.startsWith('apps/backend/src/') || path === 'apps/backend/package.json' ||
        path === 'apps/backend/package-lock.json' || path === 'apps/backend/wrangler.jsonc' ||
        path.startsWith('apps/mcp/') || path.startsWith('apps/shared/')) plan.deploy_api = true;
    if (path.startsWith('apps/mcp/')) plan.needs_mcp_deps = true;

    if (path.startsWith('apps/frontend/src/') || path.startsWith('apps/frontend/public/') ||
        path.startsWith('apps/frontend/worker/') || path === 'apps/frontend/index.html' ||
        path === 'apps/frontend/package.json' || path === 'apps/frontend/package-lock.json' ||
        path === 'apps/frontend/vite.config.ts' || path === 'apps/frontend/vite.config.js' ||
        path.startsWith('apps/frontend/vite.config.') || path === 'apps/frontend/wrangler.jsonc' ||
        path === 'apps/frontend/.openai/hosting.json' || path === 'apps/frontend/.env.production' ||
        path === 'apps/frontend/.npmrc' || path.startsWith('apps/frontend/tests/')) {
      plan.verify_frontend = true;
      plan.needs_frontend_deps = true;
    }
    if (path.startsWith('apps/frontend/src/') || path.startsWith('apps/frontend/public/') ||
        path.startsWith('apps/frontend/worker/') || path === 'apps/frontend/index.html' ||
        path === 'apps/frontend/package.json' || path === 'apps/frontend/package-lock.json' ||
        path.startsWith('apps/frontend/vite.config.') || path === 'apps/frontend/wrangler.jsonc' ||
        path === 'apps/frontend/.openai/hosting.json' || path === 'apps/frontend/.env.production' ||
        path === 'apps/frontend/.npmrc' || path.startsWith('apps/shared/')) plan.deploy_frontend = true;
    if (path.startsWith('apps/frontend/src/estimated/') || path.startsWith('apps/frontend/src/agent/')) {
      plan.verify_mw3 = true;
    }

    if (path.startsWith('apps/frontend/tsconfig') || path === 'apps/frontend/worker-response-json-compat.d.ts') {
      plan.verify_frontend = true;
      plan.needs_frontend_deps = true;
    }
    if (path.startsWith('apps/frontend/scripts/')) {
      plan.verify_frontend = true;
      plan.needs_frontend_deps = true;
      if (isDatasetValidationCode(path)) {
        plan.verify_data = true;
        plan.verify_preflop = true;
        plan.verify_postflop = true;
        plan.verify_mw3 = true;
      }
    }
    if (path.startsWith('apps/frontend/tests/mw3-') || path === 'apps/frontend/tests/mw3-production-delivery.test.mjs' ||
        path.startsWith('apps/backend/tests/mw3-')) plan.verify_mw3 = true;
    if (path.startsWith('apps/frontend/tests/postflop-') || path.startsWith('apps/frontend/tests/continuation-') ||
        path.startsWith('apps/frontend/tests/stage3-')) plan.verify_postflop = true;

    if (path.startsWith('apps/shared/')) {
      plan.verify_backend = true;
      plan.verify_frontend = true;
      plan.needs_frontend_deps = true;
    }
    if (isDatasetValidationCode(path)) plan.verify_data = true;
    if (dataPathChanged(path)) {
      plan.verify_data = true;
      const group = dataGroup(path);
      if (!['ranked_schema', 'fastfold_schema', 'human_schema'].includes(group)) plan.needs_frontend_deps = true;
      if (group === 'preflop') plan.verify_preflop = true;
      else if (group === 'postflop' || group === 'profile_schema') plan.verify_postflop = true;
      else if (group === 'mw3' || group === 'mw3_schema') plan.verify_mw3 = true;
      else if (group === 'full') {
        plan.verify_preflop = true;
        plan.verify_postflop = true;
        plan.verify_mw3 = true;
      }
    }
  }
  return plan;
}

function runGit(repoRoot, args, options = {}) {
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: repoRoot, ...options });
}

function ensureCommit(repoRoot, sha) {
  if (!SHA_RE.test(sha)) throw new Error(`invalid commit SHA: ${sha}`);
  try {
    runGit(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]);
  } catch {
    runGit(repoRoot, ['fetch', '--no-tags', '--depth=1', 'origin', sha], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    runGit(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]);
  }
}

function treeEntries(repoRoot, sha) {
  if (!SHA_RE.test(sha)) throw new Error(`invalid commit SHA: ${sha}`);
  const raw = runGit(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', sha], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  const entries = [];
  for (const record of raw.toString('utf8').split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('invalid git tree entry');
    const match = /^(\d+) blob ([0-9a-f]{40})$/i.exec(record.slice(0, tab));
    if (!match) continue;
    const path = record.slice(tab + 1);
    const group = dataGroup(path);
    if (group) entries.push({ path, oid: match[2], group });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function readBlobBatch(repoRoot, entries) {
  const oids = [...new Set(entries.map(entry => entry.oid))];
  if (!oids.length) return new Map();
  const output = runGit(repoRoot, ['cat-file', '--batch'], {
    input: `${oids.join('\n')}\n`, encoding: null, maxBuffer: 512 * 1024 * 1024,
  });
  let offset = 0;
  const blobs = new Map();
  for (const expected of oids) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new Error('truncated git blob batch header');
    const header = output.subarray(offset, headerEnd).toString('ascii').split(' ');
    if (header[0] !== expected || header[1] !== 'blob' || !/^\d+$/.test(header[2] ?? '')) throw new Error('invalid git blob batch response');
    const size = Number(header[2]);
    const start = headerEnd + 1;
    const end = start + size;
    if (end >= output.length || output[end] !== 0x0a) throw new Error('truncated git blob content');
    blobs.set(expected, output.subarray(start, end));
    offset = end + 1;
  }
  if (offset !== output.length) throw new Error('unexpected trailing git blob data');
  return blobs;
}

export function fingerprintEntries(entries, blobs) {
  const byGroup = Object.fromEntries(HASH_GROUPS.map(group => [group, createHash('sha256')]));
  const counts = Object.fromEntries(HASH_GROUPS.map(group => [group, 0]));
  for (const entry of entries) {
    const hash = byGroup[entry.group];
    const bytes = blobs.get(entry.oid);
    if (!hash || !bytes) throw new Error(`missing fingerprint input for ${entry.path}`);
    const pathBytes = Buffer.from(entry.path, 'utf8');
    hash.update(`${pathBytes.byteLength}:`);
    hash.update(pathBytes);
    hash.update(`:${bytes.byteLength}:`);
    hash.update(bytes);
    hash.update('\0');
    counts[entry.group] += 1;
  }
  return Object.fromEntries(HASH_GROUPS.map(group => [group, { sha256: byGroup[group].digest('hex'), files: counts[group] }]));
}

export function fingerprintsAtCommit(repoRoot, sha) {
  ensureCommit(repoRoot, sha);
  const entries = treeEntries(repoRoot, sha);
  return fingerprintEntries(entries, readBlobBatch(repoRoot, entries));
}

export function changedGroups(before, after) {
  return HASH_GROUPS.filter(group => before[group]?.sha256 !== after[group]?.sha256);
}

export function changedPaths(repoRoot, beforeSha, afterSha) {
  if (!SHA_RE.test(beforeSha) || !SHA_RE.test(afterSha)) throw new Error('invalid tree comparison SHA');
  const raw = runGit(repoRoot, ['diff', '--name-only', '-z', '--no-renames', beforeSha, afterSha], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  return raw.toString('utf8').split('\0').filter(Boolean);
}

function reviewedSourcePathsAtCommit(repoRoot, sha) {
  const paths = new Set();
  for (const receiptPath of REVIEW_RECEIPTS) {
    const source = runGit(repoRoot, ['show', `${sha}:${receiptPath}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const receipt = JSON.parse(source);
    if (!Array.isArray(receipt.sources)) throw new Error(`reviewed source list is missing in ${receiptPath} at ${sha}`);
    for (const record of receipt.sources) {
      const path = record?.path;
      if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
        throw new Error(`invalid reviewed source path in ${receiptPath} at ${sha}`);
      }
      paths.add(path);
    }
  }
  return paths;
}

function changedReviewedSourcePaths(repoRoot, beforeSha, afterSha, changed) {
  const sources = new Set([
    ...reviewedSourcePathsAtCommit(repoRoot, beforeSha),
    ...reviewedSourcePathsAtCommit(repoRoot, afterSha),
  ]);
  return changed.filter(path => sources.has(path));
}

function requireReviewedSourceValidation(plan, changedSources) {
  if (changedSources.length === 0) return;
  plan.verify_data = true;
  plan.verify_preflop = true;
  plan.verify_postflop = true;
  plan.verify_mw3 = true;
  plan.needs_frontend_deps = true;
}

function schemaOutput(plan, group, changed, allowed) {
  if (changed && allowed) plan[`apply_${group}`] = true;
}

function applyDataChanges(plan, groups, allowed) {
  if (groups.includes('review_receipt')) {
    plan.verify_data = true;
    plan.verify_preflop = true;
    plan.verify_postflop = true;
    plan.verify_mw3 = true;
    plan.needs_frontend_deps = true;
  }
  const full = groups.includes('full');
  if (full) {
    plan.verify_data = true;
    plan.verify_preflop = true;
    plan.verify_postflop = true;
    plan.verify_mw3 = true;
  }
  const preflop = full || groups.includes('preflop');
  const postflop = full || groups.includes('postflop') || preflop || groups.includes('profile_schema');
  const mw3 = full || groups.includes('mw3') || groups.includes('mw3_schema');
  const hasSchema = groups.some(group => group.endsWith('_schema'));
  const hasData = preflop || postflop || mw3;
  plan.verify_data ||= hasData || hasSchema;
  if (hasData || hasSchema) {
    plan.verify_preflop ||= preflop || full;
    plan.verify_postflop ||= postflop || full;
    plan.verify_mw3 ||= mw3 || preflop || full;
    if (hasData) plan.needs_frontend_deps = true;
  }
  plan.data_release = allowed && (hasData || hasSchema);
  plan.import_preflop = allowed && preflop;
  plan.publish_postflop = allowed && postflop;
  plan.import_mw3 = allowed && mw3;
  schemaOutput(plan, 'ranked_schema', groups.includes('ranked_schema'), allowed);
  schemaOutput(plan, 'fastfold_schema', groups.includes('fastfold_schema'), allowed);
  schemaOutput(plan, 'human_schema', groups.includes('human_schema'), allowed);
  schemaOutput(plan, 'profile_schema', groups.includes('profile_schema'), allowed);
  schemaOutput(plan, 'mw3_schema', groups.includes('mw3_schema'), allowed);
  plan.mw3_live ||= plan.import_mw3 || preflop;
  plan.fastfold_predeploy ||= plan.data_release;
  plan.fastfold_postimport ||= allowed && (preflop || postflop);
  return plan;
}

function fullValidationPlan(reason, { lineageKnown = false, releaseAllowed = false, baselineRunId = '', baselineSha = '' } = {}) {
  const plan = emptyPlan(reason);
  plan.lineage_known = lineageKnown;
  plan.release_safe = releaseAllowed;
  plan.verify_data = true;
  plan.verify_preflop = true;
  plan.verify_postflop = true;
  plan.verify_mw3 = true;
  plan.verify_backend = true;
  plan.verify_frontend = true;
  plan.needs_frontend_deps = true;
  plan.needs_mcp_deps = true;
  plan.deploy_api = releaseAllowed;
  plan.deploy_frontend = releaseAllowed;
  plan.baseline_run_id = baselineRunId;
  plan.baseline_sha = baselineSha;
  return applyDataChanges(plan, HASH_GROUPS, releaseAllowed);
}

function outputPlan(plan, outputFile) {
  const serial = {};
  for (const key of OUTPUT_KEYS) {
    const value = plan[key] ?? '';
    serial[key] = value;
    if (outputFile) appendFileSync(outputFile, `${key}=${typeof value === 'boolean' ? String(value) : String(value).replace(/[\r\n]/g, ' ')}\n`);
  }
  console.log(`Deployment scope: ${JSON.stringify(serial)}`);
  return plan;
}

export function classifyChangedPaths(paths, { dataGroups = [] } = {}) {
  const plan = emptyPlan();
  addCodeScopes(plan, paths);
  if (dataGroups.length) applyDataChanges(plan, dataGroups, false);
  if (plan.data_release) plan.data_release = false;
  plan.release_safe = false;
  plan.mode = 'pull-request';
  return plan;
}

function isForceInput(event) {
  return event?.inputs?.force_data_release === true || event?.inputs?.force_data_release === 'true';
}

function githubRepository(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('invalid GITHUB_REPOSITORY');
  return value;
}

function isDeploymentWorkflowPath(value) {
  if (typeof value !== 'string') return false;
  // The Actions workflow-runs API returns `path@ref` (for example,
  // `.github/workflows/deploy-worker.yml@main`). Accept the bare path too
  // for compatibility with older API records and local fixtures.
  return value === WORKFLOW_PATH || value.startsWith(`${WORKFLOW_PATH}@`);
}

export async function latestDeploymentRun({ repository, currentRunId, fetcher = fetch }) {
  const safeRepo = githubRepository(repository);
  const matches = [];
  let historyComplete = false;
  for (let page = 1; page <= MAX_RUN_HISTORY_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${safeRepo}/actions/workflows/${WORKFLOW_ID}/runs?branch=main&per_page=${RUNS_PER_PAGE}&page=${page}`;
    const response = await fetcher(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ReysonAI-deployment-scope' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response?.ok) throw new Error(`public GitHub Actions history unavailable (${response?.status ?? 'no response'})`);
    const body = await response.json();
    if (!Array.isArray(body?.workflow_runs)) throw new Error('GitHub Actions history response is malformed');
    if (Number.isInteger(body.total_count) && body.total_count >= MAX_RUN_HISTORY_RESULTS) {
      throw new Error(`GitHub Actions deployment history reached the ${MAX_RUN_HISTORY_RESULTS}-run API result limit; production writes are disabled until lineage can be proven`);
    }
    matches.push(...body.workflow_runs.filter(run => run && String(run.id) !== String(currentRunId) &&
      isDeploymentWorkflowPath(run.path) && run.head_branch === 'main' && MAIN_DEPLOY_EVENTS.has(run.event)));
    if (body.workflow_runs.length < RUNS_PER_PAGE) {
      historyComplete = true;
      break;
    }
  }
  if (!historyComplete) throw new Error(`GitHub Actions deployment history reached at least ${MAX_RUN_HISTORY_PAGES * RUNS_PER_PAGE} runs; production writes are disabled until lineage can be proven`);

  const latestActivity = run => run.updated_at ?? run.run_started_at ?? run.created_at ?? '';
  matches.sort((a, b) => String(latestActivity(b)).localeCompare(String(latestActivity(a))));
  for (const run of matches) {
    if (!SHA_RE.test(run.head_sha ?? '')) throw new Error(`latest main deployment run ${run.id} has no valid commit SHA`);
    if (run.status !== 'completed' || run.conclusion !== 'success') {
      throw new Error(`latest main deployment run ${run.id} is ${run.status}/${run.conclusion ?? 'unknown'}; production state may be partial`);
    }
    const response = await fetcher(`https://api.github.com/repos/${safeRepo}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ReysonAI-deployment-scope' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response?.ok) throw new Error(`deployment job history unavailable for run ${run.id} (${response?.status ?? 'no response'})`);
    const body = await response.json();
    if (!Array.isArray(body?.jobs)) throw new Error(`deployment job response for run ${run.id} is malformed`);
    const deployJob = body.jobs.find(job => job?.name === DEPLOY_JOB_NAME);
    if (!deployJob) throw new Error(`deployment job is missing from successful main run ${run.id}`);
    if (deployJob.status === 'completed' && deployJob.conclusion === 'success') return run;
    if (deployJob.status === 'completed' && deployJob.conclusion === 'skipped') continue;
    throw new Error(`deployment job in latest main run ${run.id} is ${deployJob.status}/${deployJob.conclusion ?? 'unknown'}; production state may be partial`);
  }
  return null;
}

export async function classifyEvent({ repoRoot, eventName, ref, sha, repository, runId, runAttempt = '1', event, fetcher = fetch }) {
  const attempt = Number(runAttempt);
  if (!Number.isInteger(attempt) || attempt < 1) {
    return fullValidationPlan('invalid workflow run attempt; production writes are disabled');
  }
  if (attempt > 1) {
    const plan = fullValidationPlan(`workflow attempt ${attempt} is a rerun; production writes are disabled`);
    plan.mode = 'rerun-verification-only';
    return plan;
  }

  const force = eventName === 'workflow_dispatch' && isForceInput(event);
  if (force) {
    const plan = fullValidationPlan('manual force_data_release input', { lineageKnown: true, releaseAllowed: true });
    plan.mode = 'manual-full-release';
    plan.input_hashes = JSON.stringify(fingerprintsAtCommit(repoRoot, sha));
    return plan;
  }

  if (eventName === 'pull_request') {
    const baseSha = event?.pull_request?.base?.sha;
    if (!SHA_RE.test(baseSha ?? '') || !SHA_RE.test(sha ?? '')) return fullValidationPlan('invalid pull request base; fail-closed full validation');
    const paths = changedPaths(repoRoot, baseSha, sha);
    const sourceChanges = changedReviewedSourcePaths(repoRoot, baseSha, sha, paths);
    const before = fingerprintsAtCommit(repoRoot, baseSha);
    const after = fingerprintsAtCommit(repoRoot, sha);
    const groups = changedGroups(before, after);
    const plan = classifyChangedPaths(paths, { dataGroups: groups });
    if (groups.length || paths.some(isDatasetValidationCode) || sourceChanges.length) {
      plan.verify_data = true;
      plan.verify_preflop ||= groups.includes('preflop') || groups.includes('full') || paths.some(path => isDatasetValidationCode(path));
      plan.verify_postflop ||= groups.includes('postflop') || groups.includes('profile_schema') || groups.includes('preflop') || groups.includes('full') || paths.some(path => isDatasetValidationCode(path));
      plan.verify_mw3 ||= groups.includes('mw3') || groups.includes('preflop') || groups.includes('full') || paths.some(path => isDatasetValidationCode(path));
    }
    requireReviewedSourceValidation(plan, sourceChanges);
    plan.input_hashes = JSON.stringify(after);
    return plan;
  }

  if (ref !== 'refs/heads/main' || !MAIN_DEPLOY_EVENTS.has(eventName)) {
    return fullValidationPlan(`untrusted deployment event/ref ${eventName}:${ref}; fail-closed full validation`);
  }

  try {
    const baseline = await latestDeploymentRun({ repository, currentRunId: runId, fetcher });
    if (!baseline) {
      return fullValidationPlan('latest main deployment is missing or not successful; production deployment requires manual recovery', {
        baselineRunId: Number.isInteger(baseline?.id) ? String(baseline.id) : '',
        baselineSha: SHA_RE.test(baseline?.head_sha ?? '') ? baseline.head_sha : '',
      });
    }
    const before = fingerprintsAtCommit(repoRoot, baseline.head_sha);
    const after = fingerprintsAtCommit(repoRoot, sha);
    const groups = changedGroups(before, after);
    const paths = changedPaths(repoRoot, baseline.head_sha, sha);
    const plan = emptyPlan('data input hashes match latest successful production deployment');
    plan.lineage_known = true;
    plan.release_safe = true;
    plan.baseline_run_id = String(baseline.id);
    plan.baseline_sha = baseline.head_sha;
    plan.input_hashes = JSON.stringify(after);
    addCodeScopes(plan, paths);
    const sourceChanges = changedReviewedSourcePaths(repoRoot, baseline.head_sha, sha, paths);
    requireReviewedSourceValidation(plan, sourceChanges);
    if (groups.length) applyDataChanges(plan, groups, true);
    if (groups.includes('full')) plan.reason = 'unclassified or global data input changed; full reviewed release';
    else if (sourceChanges.length && !groups.length) plan.reason = `reviewed source changed: ${sourceChanges.join(', ')}`;
    else if (groups.length) plan.reason = `data input hashes changed: ${groups.join(', ')}`;
    plan.fastfold_predeploy ||= plan.deploy_api || plan.deploy_frontend || plan.data_release;
    return plan;
  } catch (error) {
    return fullValidationPlan(`deployment lineage/hash could not be proven (${error.message}); production deployment requires manual recovery`);
  }
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath ? JSON.parse(readFileSync(eventPath, 'utf8')) : {};
  const repoRoot = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  const plan = await classifyEvent({
    repoRoot,
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    sha: process.env.GITHUB_SHA ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
    runId: process.env.GITHUB_RUN_ID ?? '',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
    event,
  });
  outputPlan(plan, process.env.GITHUB_OUTPUT);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const plan = fullValidationPlan(`scope classifier failed (${error.message}); no production D1 action is allowed`);
    outputPlan(plan, process.env.GITHUB_OUTPUT);
  });
}
