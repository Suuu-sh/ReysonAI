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
// Recovery trusts only the reviewed workflow versions whose step provenance is
// understood. These are workflow Git blob IDs, never run- or commit-SHA bypasses.
const CODE_ONLY_RECOVERY_WORKFLOW_BLOB_SHA = 'd88a7f2730db03150e1f1423e2505c69ec60f157';
const RECOVERY_WORKFLOW_BLOB_SHAS = new Set([
  '2646a37763da1b7756e6ab6664ac4336366130514',
  '2dccb006451c6491fbb9906445d4effa0571248b',
  CODE_ONLY_RECOVERY_WORKFLOW_BLOB_SHA,
]);
const REMOTE_DATA_OPERATION_STEP_NAMES = [
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
const RECOVERY_SAFE_JOB_NAMES = new Set([
  'Classify reviewed code and data inputs',
  'Verify reviewed preflop snapshot',
  DEPLOY_JOB_NAME,
]);
const FULL_DEPLOYMENT_STEP_NAMES = [
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

function isCodeOnlyRecoveryInput(event) {
  return event?.inputs?.code_only_recovery === true || event?.inputs?.code_only_recovery === 'true';
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

async function recoveryJson(fetcher, url, label) {
  const response = await fetcher(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ReysonAI-code-only-recovery' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response?.ok) throw new Error(label + ' unavailable (' + (response?.status ?? 'no response') + ')');
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(label + ' response is malformed');
  return body;
}

function assertRecoveryRunRecord(run, workflowId) {
  if (!run || !Number.isSafeInteger(run.id) || run.id < 1 ||
      !Number.isSafeInteger(run.run_number) || run.run_number < 1 ||
      !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
      !SHA_RE.test(run.head_sha ?? '') || run.workflow_id !== workflowId ||
      !isDeploymentWorkflowPath(run.path) || run.head_branch !== 'main' ||
      !MAIN_DEPLOY_EVENTS.has(run.event) || typeof run.status !== 'string') {
    throw new Error('Actions history contains malformed or unsupported deployment workflow provenance');
  }
  if (run.status === 'completed' &&
      !['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'startup_failure'].includes(run.conclusion)) {
    throw new Error('Actions history contains an unknown completed workflow conclusion');
  }
}

async function recoveryWorkflowRuns({ fetcher, repository }) {
  const runs = [];
  let expectedTotal = null;
  let complete = false;
  for (let page = 1; page <= MAX_RUN_HISTORY_PAGES; page += 1) {
    const url = 'https://api.github.com/repos/' + repository + '/actions/workflows/' +
      encodeURIComponent(WORKFLOW_ID) + '/runs?branch=main&per_page=' + RUNS_PER_PAGE + '&page=' + page;
    const body = await recoveryJson(fetcher, url, 'GitHub Actions deployment history');
    if (!Array.isArray(body.workflow_runs) || !Number.isSafeInteger(body.total_count) || body.total_count < 0) {
      throw new Error('GitHub Actions deployment history response is malformed');
    }
    if (body.total_count >= MAX_RUN_HISTORY_RESULTS) {
      throw new Error('GitHub Actions deployment history reached the ' + MAX_RUN_HISTORY_RESULTS +
        '-run API result limit; code-only recovery is disabled until lineage can be proven');
    }
    if (expectedTotal === null) expectedTotal = body.total_count;
    else if (body.total_count !== expectedTotal) throw new Error('GitHub Actions deployment history changed while it was read');
    if (body.workflow_runs.length > RUNS_PER_PAGE) throw new Error('GitHub Actions history page exceeds its requested size');
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length < RUNS_PER_PAGE) {
      complete = true;
      break;
    }
  }
  if (!complete || runs.length !== expectedTotal) {
    throw new Error('GitHub Actions deployment history is truncated or incomplete');
  }
  return runs;
}

async function recoveryJobs({ fetcher, repository, runId }) {
  const jobs = [];
  let expectedTotal = null;
  let complete = false;
  for (let page = 1; page <= MAX_RUN_HISTORY_PAGES; page += 1) {
    const url = 'https://api.github.com/repos/' + repository + '/actions/runs/' +
      encodeURIComponent(runId) + '/jobs?per_page=' + RUNS_PER_PAGE + '&page=' + page;
    const body = await recoveryJson(fetcher, url, 'Actions job history for run ' + runId);
    if (!Array.isArray(body.jobs) || !Number.isSafeInteger(body.total_count) || body.total_count < 0) {
      throw new Error('Actions job history response for run ' + runId + ' is malformed');
    }
    if (body.total_count >= MAX_RUN_HISTORY_RESULTS) throw new Error('Actions job history is unexpectedly truncated');
    if (expectedTotal === null) expectedTotal = body.total_count;
    else if (body.total_count !== expectedTotal) throw new Error('Actions job history changed while it was read');
    if (body.jobs.length > RUNS_PER_PAGE) throw new Error('Actions job page exceeds its requested size');
    jobs.push(...body.jobs);
    if (body.jobs.length < RUNS_PER_PAGE) {
      complete = true;
      break;
    }
  }
  if (!complete || jobs.length !== expectedTotal) throw new Error('Actions job history is truncated or incomplete');
  const ids = new Set();
  const names = new Set();
  for (const job of jobs) {
    if (!job || !Number.isSafeInteger(job.id) || job.id < 1 || typeof job.name !== 'string' ||
        typeof job.status !== 'string' || !(job.conclusion === null || typeof job.conclusion === 'string') ||
        !Array.isArray(job.steps) || ids.has(job.id) || names.has(job.name)) {
      throw new Error('Actions job history contains malformed or duplicate job evidence');
    }
    ids.add(job.id);
    names.add(job.name);
    for (const step of job.steps) {
      if (!step || typeof step.name !== 'string' || typeof step.status !== 'string' ||
          !(step.conclusion === null || typeof step.conclusion === 'string')) {
        throw new Error('Actions job history contains malformed step evidence');
      }
    }
  }
  return jobs;
}

function recoveryWorkflowBlob(repoRoot, sha) {
  ensureCommit(repoRoot, sha);
  const blob = runGit(repoRoot, ['rev-parse', sha + ':' + WORKFLOW_PATH], { encoding: 'utf8' }).trim();
  if (!SHA_RE.test(blob)) throw new Error('deployment workflow blob identity is invalid at ' + sha);
  return blob;
}

function requireRecoveryAncestor(repoRoot, ancestor, head) {
  ensureCommit(repoRoot, ancestor);
  ensureCommit(repoRoot, head);
  try {
    runGit(repoRoot, ['merge-base', '--is-ancestor', ancestor, head]);
  } catch (error) {
    if (error?.status === 1) throw new Error('Actions run commit is not an ancestor of the exact current main head');
    throw error;
  }
}

function successfulFullDeployment(run, jobs) {
  if (run.status !== 'completed' || run.conclusion !== 'success') return false;
  const verify = jobs.find(job => job.name === 'Verify reviewed preflop snapshot');
  const deploy = jobs.find(job => job.name === DEPLOY_JOB_NAME);
  const scopeJobs = jobs.filter(job => job.name === 'Classify reviewed code and data inputs');
  if (!verify || verify.status !== 'completed' || verify.conclusion !== 'success' ||
      !deploy || deploy.status !== 'completed' || deploy.conclusion !== 'success' || scopeJobs.length > 1) return false;
  if (scopeJobs.length === 1 && (scopeJobs[0].status !== 'completed' || scopeJobs[0].conclusion !== 'success')) return false;
  const stepsByName = new Map();
  for (const step of deploy.steps) {
    if (stepsByName.has(step.name)) return false;
    stepsByName.set(step.name, step);
  }
  return FULL_DEPLOYMENT_STEP_NAMES.every(name => {
    const step = stepsByName.get(name);
    return step?.status === 'completed' && step.conclusion === 'success';
  });
}

function assertSafeInterveningRun(run, jobs) {
  if (run.status !== 'completed') throw new Error('An intervening main workflow run is still active');
  if (jobs.length === 0) {
    if (run.conclusion !== 'cancelled') throw new Error('A zero-job run has an unsupported conclusion');
    return;
  }
  if (jobs.some(job => !RECOVERY_SAFE_JOB_NAMES.has(job.name) || job.status !== 'completed')) {
    throw new Error('An intervening run has unknown or incomplete workflow jobs');
  }
  const deploy = jobs.find(job => job.name === DEPLOY_JOB_NAME);
  if (!deploy) throw new Error('An intervening run has no deployment-job evidence');
  if ((deploy.conclusion === 'skipped' || deploy.conclusion === 'cancelled') && deploy.steps.length === 0) return;
  if (deploy.conclusion === 'success') {
    throw new Error('An intervening deployment succeeded but is not a complete full-deployment baseline');
  }
  throw new Error('An intervening deployment job started or has an unknown outcome');
}

function completedStepMap(job) {
  const steps = new Map();
  for (const step of job.steps) {
    if (steps.has(step.name)) return null;
    steps.set(step.name, step);
  }
  return steps;
}

function successfulCodeOnlyRecovery(run, jobs) {
  if (run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success') return false;
  const scopeJobs = jobs.filter(job => job.name === 'Classify reviewed code and data inputs');
  const verifyJobs = jobs.filter(job => job.name === 'Verify reviewed preflop snapshot');
  const deployJobs = jobs.filter(job => job.name === DEPLOY_JOB_NAME);
  if (scopeJobs.length !== 1 || scopeJobs[0].status !== 'completed' || scopeJobs[0].conclusion !== 'success' ||
      verifyJobs.length !== 1 || verifyJobs[0].status !== 'completed' || verifyJobs[0].conclusion !== 'success' || deployJobs.length > 1) return false;
  const verifySteps = completedStepMap(verifyJobs[0]);
  const remoteFlagsGuard = verifySteps?.get('Keep code-only recovery free of remote data changes');
  if (!remoteFlagsGuard || remoteFlagsGuard.status !== 'completed' || remoteFlagsGuard.conclusion !== 'success') return false;
  if (deployJobs.length === 0) return true;

  const deploy = deployJobs[0];
  if (deploy.status !== 'completed' || deploy.conclusion !== 'success') return false;
  const deploySteps = completedStepMap(deploy);
  if (!deploySteps || deploySteps.get('Validate deployment secrets')?.conclusion !== 'success') return false;
  for (const name of REMOTE_DATA_OPERATION_STEP_NAMES) {
    const step = deploySteps.get(name);
    if (step?.status !== 'completed' || step.conclusion !== 'skipped') return false;
  }
  const apiDeploy = deploySteps.get('Deploy ranked API before enabling the client');
  const apiHeadGuard = deploySteps.get('Recheck main head before code-only API deployment');
  const workerDeploy = deploySteps.get('Deploy Worker');
  const workerHeadGuard = deploySteps.get('Recheck main head before code-only Worker deployment');
  if (!apiDeploy || !apiHeadGuard || !workerDeploy || !workerHeadGuard) return false;
  if (apiDeploy.status !== 'completed' || workerDeploy.status !== 'completed' ||
      apiHeadGuard.status !== 'completed' || workerHeadGuard.status !== 'completed') return false;
  if (apiDeploy.conclusion === 'success' && apiHeadGuard.conclusion !== 'success') return false;
  if (apiDeploy.conclusion === 'skipped' && apiHeadGuard.conclusion !== 'skipped') return false;
  if (workerDeploy.conclusion === 'success' && workerHeadGuard.conclusion !== 'success') return false;
  if (workerDeploy.conclusion === 'skipped' && workerHeadGuard.conclusion !== 'skipped') return false;
  return apiDeploy.conclusion === 'success' || workerDeploy.conclusion === 'success';
}

export async function latestFullDeploymentForCodeOnlyRecovery({
  repoRoot, repository, currentRunId, runAttempt = '1', sha, fetcher = fetch,
  supportedWorkflowBlobShas = RECOVERY_WORKFLOW_BLOB_SHAS,
}) {
  const safeRepo = githubRepository(repository);
  const attempt = Number(runAttempt);
  if (!Number.isInteger(attempt) || attempt !== 1) throw new Error('code-only recovery does not support workflow reruns');
  if (!SHA_RE.test(sha ?? '')) throw new Error('code-only recovery requires an exact commit SHA');
  const currentId = Number(currentRunId);
  if (!Number.isSafeInteger(currentId) || currentId < 1) throw new Error('code-only recovery requires a valid current run ID');
  const trustedWorkflowBlobs = supportedWorkflowBlobShas instanceof Set ?
    supportedWorkflowBlobShas : new Set(supportedWorkflowBlobShas ?? []);

  const workflowUrl = 'https://api.github.com/repos/' + safeRepo + '/actions/workflows/' + encodeURIComponent(WORKFLOW_ID);
  const workflow = await recoveryJson(fetcher, workflowUrl, 'deployment workflow metadata');
  if (!Number.isSafeInteger(workflow.id) || workflow.id < 1 || workflow.path !== WORKFLOW_PATH || workflow.state !== 'active') {
    throw new Error('current deployment workflow identity is unsupported');
  }
  const currentWorkflowBlob = recoveryWorkflowBlob(repoRoot, sha);
  if (!trustedWorkflowBlobs.has(currentWorkflowBlob)) throw new Error('current deployment workflow revision is unsupported');

  const refUrl = 'https://api.github.com/repos/' + safeRepo + '/git/ref/heads/main';
  const branchRef = await recoveryJson(fetcher, refUrl, 'current main branch ref');
  if (branchRef.ref !== 'refs/heads/main' || branchRef.object?.type !== 'commit' || branchRef.object?.sha !== sha) {
    throw new Error('workflow SHA is not the exact current main head');
  }

  const currentUrl = 'https://api.github.com/repos/' + safeRepo + '/actions/runs/' + encodeURIComponent(currentId);
  const currentRun = await recoveryJson(fetcher, currentUrl, 'current workflow run metadata');
  assertRecoveryRunRecord(currentRun, workflow.id);
  if (currentRun.id !== currentId || currentRun.event !== 'workflow_dispatch' ||
      currentRun.head_branch !== 'main' || currentRun.head_sha !== sha || currentRun.run_attempt !== 1 ||
      currentRun.status !== 'in_progress' || !isDeploymentWorkflowPath(currentRun.path)) {
    throw new Error('current run does not prove an exact first-attempt main workflow_dispatch');
  }

  const history = await recoveryWorkflowRuns({ fetcher, repository: safeRepo });
  const runIds = new Set();
  const runNumbers = new Set();
  for (const run of history) {
    if (!run || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_number) ||
        runIds.has(run.id) || runNumbers.has(run.run_number)) {
      throw new Error('Actions history contains duplicate or malformed run identifiers');
    }
    runIds.add(run.id);
    runNumbers.add(run.run_number);
  }
  const currentRows = history.filter(run => run.id === currentId);
  if (currentRows.length !== 1) throw new Error('current recovery run is missing or duplicated in complete Actions history');
  const listedCurrent = currentRows[0];
  for (const key of ['workflow_id', 'path', 'run_number', 'run_attempt', 'event', 'head_branch', 'head_sha', 'status', 'conclusion']) {
    if (listedCurrent[key] !== currentRun[key]) throw new Error('current run metadata changed between Actions API views');
  }
  if (history.some(run => run.run_number > currentRun.run_number)) {
    throw new Error('a newer main workflow run exists alongside the recovery run');
  }

  const ordered = [...history].sort((a, b) => b.run_number - a.run_number);
  for (const run of ordered) {
    if (run.id === currentId) continue;
    if (run.run_number >= currentRun.run_number) throw new Error('main workflow run order is ambiguous');
    assertRecoveryRunRecord(run, workflow.id);
    if (run.run_attempt !== 1) throw new Error('intervening workflow reruns are unsupported for recovery');
    if (run.status !== 'completed') throw new Error('an intervening main workflow run is still active');
    requireRecoveryAncestor(repoRoot, run.head_sha, sha);
    const workflowBlob = recoveryWorkflowBlob(repoRoot, run.head_sha);
    if (!trustedWorkflowBlobs.has(workflowBlob)) throw new Error('intervening deployment workflow revision is unsupported');
    const jobs = await recoveryJobs({ fetcher, repository: safeRepo, runId: run.id });
    if (jobs.some(job => !RECOVERY_SAFE_JOB_NAMES.has(job.name))) {
      throw new Error('an intervening run contains an unknown job');
    }
    const deployJobs = jobs.filter(job => job.name === DEPLOY_JOB_NAME);
    if (jobs.length === 0) {
      assertSafeInterveningRun(run, jobs);
      continue;
    }
    if (deployJobs.length > 1) throw new Error('an intervening run has ambiguous deployment-job evidence');
    const deploy = deployJobs[0];
    if (deploy?.status === 'completed' && deploy.conclusion === 'success') {
      if (successfulFullDeployment(run, jobs)) return run;
      if (successfulCodeOnlyRecovery(run, jobs)) continue;
      throw new Error('a production deployment started without complete successful full-deployment or code-only evidence');
    }
    if (successfulCodeOnlyRecovery(run, jobs)) continue;
    assertSafeInterveningRun(run, jobs);
  }
  throw new Error('no successful full Actions deployment baseline is present in complete supported history');
}

async function codeOnlyRecoveryPlan({ repoRoot, repository, runId, runAttempt, sha, fetcher, supportedWorkflowBlobShas }) {
  const baseline = await latestFullDeploymentForCodeOnlyRecovery({
    repoRoot, repository, currentRunId: runId, runAttempt, sha, fetcher, supportedWorkflowBlobShas,
  });
  requireRecoveryAncestor(repoRoot, baseline.head_sha, sha);
  const before = fingerprintsAtCommit(repoRoot, baseline.head_sha);
  const after = fingerprintsAtCommit(repoRoot, sha);
  const changed = changedGroups(before, after);
  const changedDataOrSchema = changed.filter(group => group !== 'review_receipt');
  if (changedDataOrSchema.length) {
    throw new Error('data or schema fingerprints changed since the successful full deployment: ' + changedDataOrSchema.join(', '));
  }
  const paths = changedPaths(repoRoot, baseline.head_sha, sha);
  const sourceChanges = changedReviewedSourcePaths(repoRoot, baseline.head_sha, sha, paths);
  const plan = emptyPlan('Actions lineage is complete and data/schema fingerprints match the full deployment baseline');
  plan.lineage_known = true;
  plan.release_safe = true;
  plan.baseline_run_id = String(baseline.id);
  plan.baseline_sha = baseline.head_sha;
  plan.input_hashes = JSON.stringify(after);
  addCodeScopes(plan, paths);
  requireReviewedSourceValidation(plan, sourceChanges);
  // Recovery can deploy changed code, but it never schedules remote data checks
  // or any import, schema, publish, or remote-readiness operation.
  plan.mode = 'manual-code-only-recovery';
  return plan;
}

function codeOnlyRecoveryRejectedPlan(reason) {
  const plan = fullValidationPlan(reason);
  plan.mode = 'manual-code-only-recovery-rejected';
  plan.mw3_live = false;
  plan.fastfold_predeploy = false;
  plan.fastfold_postimport = false;
  return plan;
}

export async function classifyEvent({
  repoRoot, eventName, ref, sha, repository, runId, runAttempt = '1', event, fetcher = fetch,
  supportedWorkflowBlobShas = RECOVERY_WORKFLOW_BLOB_SHAS,
}) {
  const codeOnlyRecovery = eventName === 'workflow_dispatch' && isCodeOnlyRecoveryInput(event);
  const attempt = Number(runAttempt);
  if (!Number.isInteger(attempt) || attempt < 1) {
    return codeOnlyRecovery ? codeOnlyRecoveryRejectedPlan('invalid workflow run attempt; code-only recovery is disabled') :
      fullValidationPlan('invalid workflow run attempt; production writes are disabled');
  }
  if (attempt > 1) {
    if (codeOnlyRecovery) return codeOnlyRecoveryRejectedPlan(`workflow attempt ${attempt} is a rerun; code-only recovery is disabled`);
    const plan = fullValidationPlan(`workflow attempt ${attempt} is a rerun; production writes are disabled`);
    plan.mode = 'rerun-verification-only';
    return plan;
  }

  const force = eventName === 'workflow_dispatch' && isForceInput(event);
  if (codeOnlyRecovery) {
    if (force) {
      return codeOnlyRecoveryRejectedPlan('force_data_release and code_only_recovery cannot be selected together');
    }
    try {
      return await codeOnlyRecoveryPlan({
        repoRoot, repository, runId, runAttempt: String(attempt), sha, fetcher,
        supportedWorkflowBlobShas,
      });
    } catch (error) {
      return codeOnlyRecoveryRejectedPlan('code-only recovery proof failed (' + error.message + '); production changes are disabled');
    }
  }
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
