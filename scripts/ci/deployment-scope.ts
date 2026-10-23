import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/i;
const WORKFLOW_PATH = '.github/workflows/deploy-worker.yml';
const WORKFLOW_ID = 'deploy-worker.yml';
const SCOPE_JOB_NAME = 'Classify reviewed code and data inputs';
const VERIFY_JOB_NAME = 'Verify reviewed preflop snapshot';
const DEPLOY_JOB_NAME = 'Deploy authoritative ranked API, compatible client and reviewed preflop data';
const READ_ONLY_RANKED_READINESS_STEP = 'Require live authoritative ranked readiness';
const EXPECTED_DEPLOYMENT_JOB_NAMES = new Set([SCOPE_JOB_NAME, VERIFY_JOB_NAME, DEPLOY_JOB_NAME]);
const KNOWN_NON_WRITING_DEPLOY_STEPS = new Set([
  'Set up job', 'Validate deployment secrets', 'Check out repository', 'Prepare deployment log directory',
  'Set up Node.js', 'Install dependencies', 'Install MCP runtime dependencies for the composed API Worker',
  'Restore exact reviewed Git LFS payload', 'Fetch this run\'s validated delivery SQL',
  'Recheck delivery against this exact checkout', 'Post Set up Node.js', 'Post Check out repository', 'Complete job',
]);
const REQUIRED_SKIPPED_PRODUCTION_WRITE_STEPS = new Set([
  'Import exact reviewed MW3 data and require full D1 readback',
  'Apply exact ranked schema', 'Apply exact FastFold schema', 'Apply exact six-human ranked schema',
  'Apply exact postflop profile schema', 'Deploy ranked API before enabling the client',
  'Deploy Worker', 'Import reviewed preflop snapshot into D1', 'Publish postflop policies into D1',
]);
const OPTIONAL_NEW_PRODUCTION_WRITE_STEPS = new Set([
  'Ensure exact human avatar schema and require D1 readback',
  'Apply exact AIv2 on-demand broker schema',
  'Ensure exact AIv2 operator batch schema and require D1 readback',
]);
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
  ['apps/backend/migrations/0013_human_rank_avatar.sql', 'human_avatar_schema'],
  ['apps/backend/migrations/0014_aiv2_ondemand.sql', 'ondemand_schema'],
  ['apps/backend/migrations/0015_aiv2_operator_batches.sql', 'operator_schema'],
]);
const HASH_GROUPS = ['preflop', 'postflop', 'mw3', 'mw3_schema', 'ranked_schema', 'fastfold_schema', 'human_schema', 'human_avatar_schema', 'ondemand_schema', 'operator_schema', 'profile_schema', 'review_receipt', 'full'];
const OUTPUT_KEYS = [
  'lineage_known', 'release_safe', 'verify_data', 'verify_preflop', 'verify_postflop', 'verify_mw3',
  'verify_backend', 'verify_frontend', 'needs_frontend_deps', 'needs_mcp_deps', 'deploy_api', 'deploy_frontend',
  'data_release', 'import_preflop', 'publish_postflop', 'import_mw3', 'apply_ranked_schema',
  'apply_fastfold_schema', 'apply_human_schema', 'apply_human_avatar_schema', 'apply_ondemand_schema', 'apply_operator_schema', 'apply_profile_schema', 'apply_mw3_schema',
  'mw3_live', 'fastfold_predeploy', 'fastfold_postimport', 'mode', 'reason', 'baseline_run_id',
  'baseline_sha', 'input_hashes', 'recovery_run_id', 'recovery_sha', 'recovery_proof_hash',
];

function emptyPlan(reason: any = 'no relevant changes'): any {
  return {
    lineage_known: false, release_safe: false, verify_data: false, verify_preflop: false,
    verify_postflop: false, verify_mw3: false, verify_backend: false, verify_frontend: false,
    needs_frontend_deps: false, needs_mcp_deps: false, deploy_api: false, deploy_frontend: false,
    data_release: false, import_preflop: false, publish_postflop: false, import_mw3: false,
    apply_ranked_schema: false, apply_fastfold_schema: false, apply_human_schema: false,
    apply_human_avatar_schema: false, apply_ondemand_schema: false, apply_operator_schema: false, apply_profile_schema: false, apply_mw3_schema: false, mw3_live: false,
    fastfold_predeploy: false, fastfold_postimport: false, mode: 'no-op', reason,
    baseline_run_id: '', baseline_sha: '', input_hashes: '', recovery_run_id:'',recovery_sha:'',recovery_proof_hash:'',
  };
}

function dataGroup(path?: any): any {
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
  if (DATA_ROOTS.some((root?: any): any => path.startsWith(root)) || path.startsWith('apps/backend/migrations/')) return 'full';
  return null;
}

function dataPathChanged(path?: any): any {
  return dataGroup(path) !== null;
}

function isDatasetValidationCode(path?: any): any {
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

function addCodeScopes(plan?: any, paths?: any): any {
  for (const path of paths) {
    if (/^configs\/[^/]+\.review\.json$/.test(path)) {
      plan.verify_data = true;
      plan.verify_preflop = true;
      plan.verify_postflop = true;
      plan.verify_mw3 = true;
      plan.needs_frontend_deps = true;
    }

    // Repository-wide type tooling is code verification only, never a data release.
    if (path === 'tsconfig.tooling.json' || path.startsWith('types/') ||
        path === '.github/workflows/verify-typescript.yml') {
      plan.verify_frontend = true;
      plan.verify_backend = true;
      plan.needs_frontend_deps = true;
      plan.needs_mcp_deps = true;
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
    if (path.startsWith('apps/frontend/tests/mw3-') || path === 'apps/frontend/tests/mw3-production-delivery.test.ts' ||
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
      if (!['ranked_schema', 'fastfold_schema', 'human_schema', 'human_avatar_schema'].includes(group)) plan.needs_frontend_deps = true;
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

function runGit(repoRoot?: any, args?: any, options: any = {}): any {
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: repoRoot, ...options });
}

function ensureCommit(repoRoot?: any, sha?: any): any {
  if (!SHA_RE.test(sha)) throw new Error(`invalid commit SHA: ${sha}`);
  try {
    runGit(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]);
  } catch {
    runGit(repoRoot, ['fetch', '--no-tags', '--depth=1', 'origin', sha], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout:20000, stdio:'pipe' });
    runGit(repoRoot, ['cat-file', '-e', `${sha}^{commit}`]);
  }
}

// A depth-one checkout can contain both commits but still hide every connecting
// parent. Hydrate only the exact candidate, with a fixed depth/time budget; never
// treat missing ancestry, an API comparison or a failed fetch as proof.
export function ensureScopedRecoveryAncestor(repoRoot:string,ancestor:string,candidate:string){
 if(!SHA_RE.test(ancestor)||!SHA_RE.test(candidate))throw Error('invalid recovery ancestry identity');
 ensureCommit(repoRoot,ancestor);ensureCommit(repoRoot,candidate);
 const proven=()=>{try{runGit(repoRoot,['merge-base','--is-ancestor',ancestor,candidate],{timeout:10000,stdio:'pipe'});return true;}catch{return false;}};
 if(proven())return;
 if(String(runGit(repoRoot,['rev-parse','--is-shallow-repository'],{encoding:'utf8'})).trim()!=='true')throw Error('recovery candidate is not descendant of failed release');
 for(const depth of [64,256]){
  try{runGit(repoRoot,['fetch','--no-tags',`--depth=${depth}`,'origin',candidate],{timeout:20000,maxBuffer:8*1024*1024,stdio:'pipe'});}catch{throw Error('bounded recovery ancestry fetch unavailable');}
  if(proven())return;
  if(String(runGit(repoRoot,['rev-parse','--is-shallow-repository'],{encoding:'utf8'})).trim()!=='true')break;
 }
 throw Error('bounded recovery ancestry remains unproven');
}

function treeEntries(repoRoot?: any, sha?: any): any {
  if (!SHA_RE.test(sha)) throw new Error(`invalid commit SHA: ${sha}`);
  const raw = runGit(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', sha], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  const entries: any[] = [];
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
  return entries.sort((a?: any, b?: any): any => a.path.localeCompare(b.path));
}

function readBlobBatch(repoRoot?: any, entries?: any): any {
  const oids = [...new Set(entries.map((entry?: any): any => entry.oid))];
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

export function fingerprintEntries(entries?: any, blobs?: any): any {
  const byGroup = Object.fromEntries(HASH_GROUPS.map((group?: any): any => [group, createHash('sha256')]));
  const counts = Object.fromEntries(HASH_GROUPS.map((group?: any): any => [group, 0]));
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
  return Object.fromEntries(HASH_GROUPS.map((group?: any): any => [group, { sha256: byGroup[group].digest('hex'), files: counts[group] }]));
}

export function fingerprintsAtCommit(repoRoot?: any, sha?: any): any {
  ensureCommit(repoRoot, sha);
  const entries = treeEntries(repoRoot, sha);
  return fingerprintEntries(entries, readBlobBatch(repoRoot, entries));
}

export function changedGroups(before?: any, after?: any): any {
  return HASH_GROUPS.filter((group?: any): any => before[group]?.sha256 !== after[group]?.sha256);
}

export function changedPaths(repoRoot?: any, beforeSha?: any, afterSha?: any): any {
  if (!SHA_RE.test(beforeSha) || !SHA_RE.test(afterSha)) throw new Error('invalid tree comparison SHA');
  // PR checkouts may contain only the head. Materialize both exact validated
  // commit objects before any diff or reviewed-source/tree comparison.
  ensureCommit(repoRoot, beforeSha);
  ensureCommit(repoRoot, afterSha);
  const raw = runGit(repoRoot, ['diff', '--name-only', '-z', '--no-renames', beforeSha, afterSha], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  return raw.toString('utf8').split('\0').filter(Boolean);
}

function reviewedSourcePathsAtCommit(repoRoot?: any, sha?: any): any {
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

function changedReviewedSourcePaths(repoRoot?: any, beforeSha?: any, afterSha?: any, changed?: any): any {
  const sources = new Set([
    ...reviewedSourcePathsAtCommit(repoRoot, beforeSha),
    ...reviewedSourcePathsAtCommit(repoRoot, afterSha),
  ]);
  return changed.filter((path?: any): any => sources.has(path));
}

function requireReviewedSourceValidation(plan?: any, changedSources?: any): any {
  if (changedSources.length === 0) return;
  plan.verify_data = true;
  plan.verify_preflop = true;
  plan.verify_postflop = true;
  plan.verify_mw3 = true;
  plan.needs_frontend_deps = true;
}

function schemaOutput(plan?: any, group?: any, changed?: any, allowed?: any): any {
  if (changed && allowed) plan[`apply_${group}`] = true;
}

function applyDataChanges(plan?: any, groups?: any, allowed?: any): any {
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
  const hasSchema = groups.some((group?: any): any => group.endsWith('_schema'));
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
  schemaOutput(plan, 'human_avatar_schema', groups.includes('human_avatar_schema'), allowed);
  schemaOutput(plan, 'ondemand_schema', groups.includes('ondemand_schema'), allowed);
  schemaOutput(plan, 'operator_schema', groups.includes('operator_schema'), allowed);
  schemaOutput(plan, 'profile_schema', groups.includes('profile_schema'), allowed);
  schemaOutput(plan, 'mw3_schema', groups.includes('mw3_schema'), allowed);
  plan.mw3_live ||= plan.import_mw3 || preflop;
  plan.fastfold_predeploy ||= plan.data_release;
  plan.fastfold_postimport ||= allowed && (preflop || postflop);
  return plan;
}

function fullValidationPlan(reason?: any, { lineageKnown = false, releaseAllowed = false, baselineRunId = '', baselineSha = '' }: any = {}): any {
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

function outputPlan(plan?: any, outputFile?: any): any {
  const serial: any = {};
  for (const key of OUTPUT_KEYS) {
    const value = plan[key] ?? '';
    serial[key] = value;
    if (outputFile) appendFileSync(outputFile, `${key}=${typeof value === 'boolean' ? String(value) : String(value).replace(/[\r\n]/g, ' ')}\n`);
  }
  console.log(`Deployment scope: ${JSON.stringify(serial)}`);
  return plan;
}

export function classifyChangedPaths(paths?: any, { dataGroups = [] }: any = {}): any {
  const plan = emptyPlan();
  addCodeScopes(plan, paths);
  if (dataGroups.length) applyDataChanges(plan, dataGroups, false);
  if (plan.data_release) plan.data_release = false;
  plan.release_safe = false;
  plan.mode = 'pull-request';
  return plan;
}

function isForceInput(event?: any): any {
  return event?.inputs?.force_data_release === true || event?.inputs?.force_data_release === 'true';
}

function githubRepository(value?: any): any {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('invalid GITHUB_REPOSITORY');
  return value;
}

function isDeploymentWorkflowPath(value?: any): any {
  if (typeof value !== 'string') return false;
  // The Actions workflow-runs API returns `path@ref` (for example,
  // `.github/workflows/deploy-worker.yml@main`). Accept the bare path too
  // for compatibility with older API records and local fixtures.
  return value === WORKFLOW_PATH || value.startsWith(`${WORKFLOW_PATH}@`);
}

const OPERATOR_RECOVERY_PATH='configs/operator-schema-recovery-39925016206.json';
const OPERATOR_FAILED_RUN='39925016206',OPERATOR_FAILED_SHA='f234b942eb6f3f86c40ea6a80a13e3f4315e0c68';
const sha256=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
const jobEvidence=(jobs:any[])=>jobs.map(j=>({name:j.name,status:j.status,conclusion:j.conclusion,steps:j.steps?.map((s:any)=>({name:s.name,status:s.status,conclusion:s.conclusion}))}));
// This is not a generic partial-release exemption: the sole accepted failed run,
// schema absence, completed MW3 readback and exact fixes are separately reviewed.
export function assertOperatorRecoveryEvidence(policy:any,run:any,jobsBody:any,artifactsBody:any,proofBytes:any){
 if(policy?.schema_version!==1||policy.kind!=='single-failed-operator-schema-scoped-recovery'||policy.failed_run_id!==OPERATOR_FAILED_RUN||policy.failed_sha!==OPERATOR_FAILED_SHA||policy.baseline_run_id!=='39909085961'||policy.baseline_sha!=='1dc784f5a606d5f9d9523ae0d393ab9961aabcf6'||String(run.id)!==policy.failed_run_id||run.head_sha!==policy.failed_sha||run.head_branch!=='main'||run.event!=='push'||run.status!=='completed'||run.conclusion!=='failure'||run.run_attempt!==1)throw Error('unreviewed operator recovery identity');
 if(jobsBody.total_count!==3||jobsBody.jobs?.length!==3||sha256(JSON.stringify(jobEvidence(jobsBody.jobs)))!==policy.jobs_sha256)throw Error('operator recovery job evidence drift');
 const jobs=jobsBody.jobs;
 if(jobs.filter((j:any)=>j.name===SCOPE_JOB_NAME&&j.conclusion==='success').length!==1||jobs.filter((j:any)=>j.name===VERIFY_JOB_NAME&&j.conclusion==='success').length!==1)throw Error('operator recovery verification incomplete');
 const deploy=jobs.find((j:any)=>j.name===DEPLOY_JOB_NAME),failures=deploy?.steps?.filter((s:any)=>s.conclusion==='failure');
 if(deploy?.conclusion!=='failure'||failures?.length!==1||failures[0].name!=='Ensure exact AIv2 operator batch schema and require D1 readback'||deploy.steps.find((s:any)=>s.name==='Import exact reviewed MW3 data and require full D1 readback')?.conclusion!=='success')throw Error('operator recovery step outcome invalid');
 const artifact=artifactsBody.artifacts?.filter((a:any)=>a.id===policy.artifact?.id);
 if(!Number.isInteger(artifactsBody.total_count)||artifactsBody.total_count!==artifactsBody.artifacts?.length||artifact?.length!==1||artifact[0].name!==policy.artifact.name||artifact[0].digest!==policy.artifact.digest||artifact[0].expired!==false)throw Error('operator recovery retained artifact invalid');
 if(sha256(proofBytes)!==policy.proof?.sha256)throw Error('operator recovery readonly proof drift');
 const proof=JSON.parse(String(proofBytes)),schema=proof.schema_readback,results=schema?.response?.result,outcome=proof.mw3_outcome;
 if(proof.failed_run_id!==policy.failed_run_id||proof.failed_sha!==policy.failed_sha||sha256(JSON.stringify(proof.jobs))!==policy.jobs_sha256||schema?.kind!=='read-only-d1-schema-observation'||schema.failed_run_id!==policy.failed_run_id||schema.failed_sha!==policy.failed_sha||schema.response?.success!==true||results?.length!==3||results.some((r:any)=>r.success!==true||r.meta?.rows_written!==0||r.meta?.changed_db!==false)||results[0].results?.length!==0||results[1].results?.length!==13||results[1].results.some((c:any)=>c.name==='operator_batch_id')||results[2].results?.length!==1||results[2].results[0].from!=='creator'||results[2].results[0].table!=='account_users')throw Error('operator recovery schema absence not proven');
 if(outcome?.status!=='published-mw3-full-d1-payload-verified'||outcome.github_sha!==policy.failed_sha||outcome.imported_spots!==0||outcome.verified_deliveries!==32||outcome.verified_parts!==1552||outcome.sql?.length!==16)throw Error('operator recovery full MW3 readback not proven');
 return proof;
}
export function assertOperatorRecoveryArchive(policy:any,proof:any,bytes:Uint8Array){
 if(bytes.byteLength>1_000_000||'sha256:'+sha256(bytes)!==policy.artifact.digest)throw Error('operator recovery artifact bytes differ');
 const outcome=execFileSync('python3',['-c',"import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert sorted(z.namelist())==['delivery-plan.json','import-outcome.json']; i=z.getinfo('import-outcome.json'); assert i.file_size<=1000000; sys.stdout.buffer.write(z.read(i))"],{input:bytes,maxBuffer:1_000_000});
 if(sha256(outcome)!==proof.mw3_outcome_raw_sha256||JSON.stringify(JSON.parse(String(outcome)))!==JSON.stringify(proof.mw3_outcome))throw Error('operator recovery retained readback bytes differ');
}
export function assertOperatorRecoverySourceScope(policy:any,paths:string[],before:any,after:any,readBlob:(path:string)=>any){
 const allowed=['apps/backend/scripts/ensure-aiv2-operator-schema.ts','apps/backend/tests/aiv2-operator-schema.test.ts','scripts/ci/deployment-scope.ts','scripts/ci/deployment-scope.test.ts',WORKFLOW_PATH,OPERATOR_RECOVERY_PATH,policy.proof.path,...REVIEW_RECEIPTS,'docs/qa/operator-schema-recovery-source-renewal.json','docs/qa/operator-schema-recovery-shallow-source-renewal.json'];
 if(JSON.stringify(policy.allowed_paths)!==JSON.stringify(allowed)||paths.some((p:string)=>!allowed.includes(p)))throw Error('operator recovery source scope exceeded');
 const expectedFixes=['apps/backend/scripts/ensure-aiv2-operator-schema.ts','apps/backend/tests/aiv2-operator-schema.test.ts'];
 if(JSON.stringify(Object.keys(policy.source_fix_hashes??{}).sort())!==JSON.stringify(expectedFixes)||expectedFixes.some(p=>!paths.includes(p)||sha256(readBlob(p))!==policy.source_fix_hashes[p]))throw Error('operator recovery exact source fix missing');
 if(HASH_GROUPS.filter(g=>!['full','review_receipt'].includes(g)).some(g=>JSON.stringify(before[g])!==JSON.stringify(after[g])))throw Error('operator recovery numerical/schema fingerprints changed');
 }
export function assertOperatorRecoveryReceipt(before:any,after:any){
 const prior={...before},next={...after};
 delete prior.sources;delete prior.content_sha256;delete prior.operator_schema_recovery_source_renewals;
 delete next.sources;delete next.content_sha256;delete next.operator_schema_recovery_source_renewals;
 if(JSON.stringify(prior)!==JSON.stringify(next)||!Array.isArray(after.operator_schema_recovery_source_renewals)||after.operator_schema_recovery_source_renewals.length!==(before.operator_schema_recovery_source_renewals?.length??0)+1||JSON.stringify(after.operator_schema_recovery_source_renewals.slice(0,-1))!==JSON.stringify(before.operator_schema_recovery_source_renewals??[])||JSON.stringify(before.sources?.map((r:any)=>r.path))!==JSON.stringify(after.sources?.map((r:any)=>r.path)))throw Error('operator recovery historical receipt changed');
}
async function reviewedOperatorRecovery({repoRoot,sha,run,jobsBody,matches,repository,headers,fetcher}:any){
 if(String(run.id)!==OPERATOR_FAILED_RUN||!repoRoot||!SHA_RE.test(sha??''))return null;
 const blob=(path:string)=>runGit(repoRoot,['show',`${sha}:${path}`],{maxBuffer:32*1024*1024});
 const policy=JSON.parse(String(blob(OPERATOR_RECOVERY_PATH)));
 if(policy.proof?.path!=='docs/qa/operator-schema-recovery-39925016206.json')throw Error('unexpected recovery proof path');
 const response=await fetcher(`https://api.github.com/repos/${repository}/actions/runs/${OPERATOR_FAILED_RUN}/artifacts?per_page=100`,{headers,signal:AbortSignal.timeout(10000)});
 if(!response?.ok)throw Error('operator recovery artifact history unavailable');
 const proof=assertOperatorRecoveryEvidence(policy,run,jobsBody,await response.json(),blob(policy.proof.path));
 const archiveResponse=await fetcher(`https://api.github.com/repos/${repository}/actions/artifacts/${policy.artifact.id}/zip`,{headers,signal:AbortSignal.timeout(20000)});
 if(!archiveResponse?.ok||Number(archiveResponse.headers?.get('content-length'))>1_000_000)throw Error('operator recovery retained archive unavailable');
 assertOperatorRecoveryArchive(policy,proof,new Uint8Array(await archiveResponse.arrayBuffer()));
 const baseline=matches.find((r:any)=>String(r.id)===policy.baseline_run_id);
 if(!baseline||baseline.head_sha!==policy.baseline_sha||baseline.status!=='completed'||baseline.conclusion!=='success'||baseline.run_attempt!==1)throw Error('operator recovery original success unavailable');
 const baselineResponse=await fetcher(`https://api.github.com/repos/${repository}/actions/runs/${baseline.id}/jobs?per_page=100`,{headers,signal:AbortSignal.timeout(10000)});
 if(!baselineResponse?.ok)throw Error('operator recovery baseline job unavailable');
 const baselineJobs=await baselineResponse.json();
 if(baselineJobs.total_count!==3||baselineJobs.jobs?.length!==3||baselineJobs.jobs.some((j:any)=>j.status!=='completed'||j.conclusion!=='success')||new Set(baselineJobs.jobs.map((j:any)=>j.name)).size!==3||baselineJobs.jobs.some((j:any)=>!EXPECTED_DEPLOYMENT_JOB_NAMES.has(j.name)))throw Error('operator recovery baseline job incomplete');
 ensureScopedRecoveryAncestor(repoRoot,policy.failed_sha,sha);
 const paths=changedPaths(repoRoot,policy.failed_sha,sha);
 assertOperatorRecoverySourceScope(policy,paths,fingerprintsAtCommit(repoRoot,policy.failed_sha),fingerprintsAtCommit(repoRoot,sha),blob);
 if(policy.receipt_baseline_sha!=='cdee4b447eaf993bbbe7999ea0f129dc05389000'||JSON.stringify(Object.keys(policy.receipt_baseline_hashes??{}))!==JSON.stringify(REVIEW_RECEIPTS))throw Error('unreviewed recovery receipt baseline');
 ensureCommit(repoRoot,policy.receipt_baseline_sha);ensureScopedRecoveryAncestor(repoRoot,policy.receipt_baseline_sha,sha);
 for(const path of REVIEW_RECEIPTS){
  const prior=runGit(repoRoot,['show',`${policy.receipt_baseline_sha}:${path}`]);
  if(sha256(prior)!==policy.receipt_baseline_hashes[path])throw Error('recovery prior receipt bytes drift');
  assertOperatorRecoveryReceipt(JSON.parse(String(prior)),JSON.parse(String(blob(path))));
 }
 const priorReport='docs/qa/operator-schema-recovery-source-renewal.json';
 if(sha256(runGit(repoRoot,['show',`${policy.receipt_baseline_sha}:${priorReport}`]))!==policy.prior_source_report_sha256||sha256(blob(priorReport))!==policy.prior_source_report_sha256)throw Error('recovery historical source report changed');
 // Bind the retained readback's exact SQL identities to committed blobs as well.
 if(proof.mw3_outcome.sql.some((r:any)=>sha256(blob(r.path))!==r.sha256||blob(r.path).length!==r.bytes))throw Error('operator recovery MW3 SQL bytes changed');
 return {...baseline,recovery:{run_id:policy.failed_run_id,sha:policy.failed_sha,proof_hash:policy.proof.sha256}};
}

export async function latestDeploymentRun({ repository, currentRunId, token, fetcher = fetch, recoveryContext }: any): Promise<any> {
  const safeRepo = githubRepository(repository);
  const matches: any[] = [];
  let historyComplete = false;
  for (let page = 1; page <= MAX_RUN_HISTORY_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${safeRepo}/actions/workflows/${WORKFLOW_ID}/runs?branch=main&per_page=${RUNS_PER_PAGE}&page=${page}`;
    const response = await fetcher(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ReysonAI-deployment-scope', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    if (!response?.ok) throw new Error(`public GitHub Actions history unavailable (${response?.status ?? 'no response'})`);
    const body = await response.json();
    if (!Array.isArray(body?.workflow_runs)) throw new Error('GitHub Actions history response is malformed');
    if (Number.isInteger(body.total_count) && body.total_count >= MAX_RUN_HISTORY_RESULTS) {
      throw new Error(`GitHub Actions deployment history reached the ${MAX_RUN_HISTORY_RESULTS}-run API result limit; production writes are disabled until lineage can be proven`);
    }
    matches.push(...body.workflow_runs.filter((run?: any): any => run && String(run.id) !== String(currentRunId) &&
      isDeploymentWorkflowPath(run.path) && run.head_branch === 'main' && MAIN_DEPLOY_EVENTS.has(run.event)));
    if (body.workflow_runs.length < RUNS_PER_PAGE) {
      historyComplete = true;
      break;
    }
  }
  if (!historyComplete) throw new Error(`GitHub Actions deployment history reached at least ${MAX_RUN_HISTORY_PAGES * RUNS_PER_PAGE} runs; production writes are disabled until lineage can be proven`);

  const latestActivity = (run?: any): any => run.updated_at ?? run.run_started_at ?? run.created_at ?? '';
  matches.sort((a?: any, b?: any): any => String(latestActivity(b)).localeCompare(String(latestActivity(a))));
  for (const run of matches) {
    if (!SHA_RE.test(run.head_sha ?? '')) throw new Error(`latest main deployment run ${run.id} has no valid commit SHA`);
    if (run.status !== 'completed') {
      throw new Error(`latest main deployment run ${run.id} is ${run.status}/${run.conclusion ?? 'unknown'}; production state may be partial`);
    }
    const response = await fetcher(`https://api.github.com/repos/${safeRepo}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ReysonAI-deployment-scope', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    if (!response?.ok) throw new Error(`deployment job history unavailable for run ${run.id} (${response?.status ?? 'no response'})`);
    const body = await response.json();
    if (!Array.isArray(body?.jobs)) throw new Error(`deployment job response for run ${run.id} is malformed`);
    const deployJob = body.jobs.find((job: any): any => job?.name === DEPLOY_JOB_NAME);
    if (!deployJob) throw new Error(`deployment job is missing from main run ${run.id}`);
    if (deployJob.status === 'completed' && deployJob.conclusion === 'success' && run.conclusion === 'success') return run;
    if (deployJob.status === 'completed' && deployJob.conclusion === 'skipped' && run.run_attempt === 1) continue;
    // A single named read-only readiness failure is safely recoverable only if
    // this first attempt executed no unrecognized step successfully. Since every
    // known D1/Worker write is intentionally absent from the benign allowlist,
    // any executed write (or newly-added unknown step) keeps lineage fail-closed.
    if (run.run_attempt === 1 && run.conclusion === 'failure' &&
        deployJob.status === 'completed' && deployJob.conclusion === 'failure') {
      const verifyJob = body.jobs.find((job: any) => job?.name === VERIFY_JOB_NAME);
      const steps = deployJob.steps;
      const failedReadiness = Array.isArray(steps) ? steps.filter((step: any) => step?.conclusion === 'failure') : [];
      const stepNames = Array.isArray(steps) ? steps.map((step: any) => step?.name) : [];
      const uniqueNamedSteps = stepNames.every((name: any) => typeof name === 'string' && name.length > 0) &&
        new Set(stepNames).size === stepNames.length;
      const requiredWritesSkipped = [...REQUIRED_SKIPPED_PRODUCTION_WRITE_STEPS].every(name => {
        const matching = steps?.filter((step: any) => step?.name === name) ?? [];
        return matching.length === 1 && matching[0].status === 'completed' && matching[0].conclusion === 'skipped';
      });
      const optionalWritesSkipped = [...OPTIONAL_NEW_PRODUCTION_WRITE_STEPS].every(name => {
        const matching = steps?.filter((step: any) => step?.name === name) ?? [];
        return matching.length === 0 || (matching.length === 1 && matching[0].status === 'completed' && matching[0].conclusion === 'skipped');
      });
      const onlyKnownReadOnlyExecution = Array.isArray(steps) && steps.every((step: any) => {
        if (step?.status !== 'completed') return false;
        if (step?.conclusion === 'skipped') return true;
        if (step?.conclusion === 'failure' && step?.name === READ_ONLY_RANKED_READINESS_STEP) return true;
        return step?.conclusion === 'success' && KNOWN_NON_WRITING_DEPLOY_STEPS.has(step?.name);
      });
      const jobNames = body.jobs.map((job: any) => job?.name);
      const completeJobsPage = body.total_count === undefined
        ? body.jobs.length < 100
        : Number.isInteger(body.total_count) && body.total_count >= 0 && body.total_count === body.jobs.length;
      const completeUniqueJobList = completeJobsPage &&
        body.jobs.length === EXPECTED_DEPLOYMENT_JOB_NAMES.size &&
        jobNames.every((name: string) => EXPECTED_DEPLOYMENT_JOB_NAMES.has(name)) && new Set(jobNames).size === jobNames.length;
      const verifyJobs = body.jobs.filter((job: any) => job?.name === VERIFY_JOB_NAME);
      const scopeJobs = body.jobs.filter((job: any) => job?.name === SCOPE_JOB_NAME);
      const otherJobsSafe = completeUniqueJobList && verifyJobs.length === 1 && scopeJobs.length === 1 &&
        verifyJobs[0].status === 'completed' && verifyJobs[0].conclusion === 'success' &&
        scopeJobs[0].status === 'completed' && scopeJobs[0].conclusion === 'success';
      if (verifyJob?.status === 'completed' && verifyJob.conclusion === 'success' &&
          failedReadiness.length === 1 && failedReadiness[0].name === READ_ONLY_RANKED_READINESS_STEP &&
          uniqueNamedSteps && requiredWritesSkipped && optionalWritesSkipped &&
          onlyKnownReadOnlyExecution && otherJobsSafe) continue;
    }
    if(recoveryContext){
      const recovery=await reviewedOperatorRecovery({...recoveryContext,run,jobsBody:body,matches,repository:safeRepo,headers:{Accept:'application/vnd.github+json','User-Agent':'ReysonAI-deployment-scope',...(token?{Authorization:`Bearer ${token}`}:{})},fetcher});
      if(recovery)return recovery;
    }
    throw new Error(`deployment job in latest main run ${run.id} is ${deployJob.status}/${deployJob.conclusion ?? 'unknown'}; production state may be partial`);
  }
  return null;
}

export async function classifyEvent({ repoRoot, eventName, ref, sha, repository, runId, runAttempt = '1', event, token, fetcher = fetch }: any): Promise<any> {
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
      plan.verify_preflop ||= groups.includes('preflop') || groups.includes('full') || paths.some((path?: any): any => isDatasetValidationCode(path));
      plan.verify_postflop ||= groups.includes('postflop') || groups.includes('profile_schema') || groups.includes('preflop') || groups.includes('full') || paths.some((path?: any): any => isDatasetValidationCode(path));
      plan.verify_mw3 ||= groups.includes('mw3') || groups.includes('preflop') || groups.includes('full') || paths.some((path?: any): any => isDatasetValidationCode(path));
    }
    requireReviewedSourceValidation(plan, sourceChanges);
    plan.input_hashes = JSON.stringify(after);
    return plan;
  }

  if (ref !== 'refs/heads/main' || !MAIN_DEPLOY_EVENTS.has(eventName)) {
    return fullValidationPlan(`untrusted deployment event/ref ${eventName}:${ref}; fail-closed full validation`);
  }

  try {
    const baseline = await latestDeploymentRun({ repository, currentRunId: runId, token, fetcher, ...(eventName==='push'?{recoveryContext:{repoRoot,sha}}:{}) });
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
    if(baseline.recovery){
      plan.mode='scoped-partial-recovery';plan.reason='reviewed exact failed operator schema release; prior successful baseline retained, completed MW3 readback reused';
      plan.recovery_run_id=baseline.recovery.run_id;plan.recovery_sha=baseline.recovery.sha;plan.recovery_proof_hash=baseline.recovery.proof_hash;
      plan.import_mw3=false;plan.mw3_live=true;
    }
    return plan;
  } catch (error: any) {
    return fullValidationPlan(`deployment lineage/hash could not be proven (${error.message}); production deployment requires manual recovery`);
  }
}

async function main(): Promise<any> {
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
    token: process.env.GITHUB_TOKEN,
    event,
  });
  outputPlan(plan, process.env.GITHUB_OUTPUT);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error?: any): any => {
    const plan = fullValidationPlan(`scope classifier failed (${error.message}); no production D1 action is allowed`);
    outputPlan(plan, process.env.GITHUB_OUTPUT);
  });
}
