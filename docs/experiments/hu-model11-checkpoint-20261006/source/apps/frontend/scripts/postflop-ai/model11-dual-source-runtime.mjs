// Explicit process boundaries: one original validator, four independent fresh
// lanes, one finalizer. This module never schedules or starts another process.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, basename, resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph } from './audit-identity.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { exactKeys, same, gateFail } from './model11-gate-contract.mjs';
import { ORIGINAL_COMMIT, REVIEWED_MEMO_COMMIT, EQUIVALENCE_ARCHIVES } from './model11-dual-source-contract.mjs';

const PREFIX = 'apps/frontend/scripts/postflop-ai/';
export const DUAL_SOURCE_ROOTS = [PREFIX + 'evaluate-model11-dual-source-audit.mjs', PREFIX + 'evaluate-model11-completion-representative.mjs'];
export const DUAL_SOURCE_MANIFEST = 'apps/frontend/tests/fixtures/model11-dual-source-audit-source-graph.json';
export const DYNAMIC_API_FILES = ['inputs', 'model11-gate-source', 'model11-gate-contract', 'effective-law-identity',
  'all-board-checkpoints', 'model11-completion-representative-source', 'model11-completion-representative-contract',
  'model11-completion-representative-store', 'model11-completion-representative', 'evaluate-model11-completion-representative'];
const ALLOWED_MEMO_ADDITIONS = [
  'model11-dual-source-contract.mjs', 'model11-dual-source-runtime.mjs', 'model11-dual-source-quality.mjs', 'evaluate-model11-dual-source-audit.mjs',
  'perf/verify-model11-dual-source-audit.py',
].map(name => PREFIX + name).concat([
  DUAL_SOURCE_MANIFEST, 'apps/frontend/tests/postflop-model11-dual-source-audit.test.mjs',
  'apps/frontend/tests/test_model11_dual_source_audit.py',
  'apps/frontend/tests/fixtures/model11-dual-source-full-proof96.json',
  'docs/model11-dual-source-audit.md',
]);
const REFRESHED_INVENTORIES = ['apps/frontend/tests/fixtures/model11-gate-source-graph.json', 'apps/frontend/tests/fixtures/model11-completion-representative-source-graph.json'];
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export function safeAbsoluteRecord(path, limit = 16 * 1024 * 1024) {
  if (!isAbsolute(path)) gateFail('An explicit absolute evidence path is required');
  for (let current = resolve(path);; current = dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (current === resolve(path) ? !stat.isFile() : !stat.isDirectory())) gateFail('Unsafe dual-source file path');
    if (current === dirname(current)) break;
  }
  const record = auditFileRecord(dirname(path), basename(path));
  if (record.bytes > limit) gateFail('Dual-source file exceeds its read bound');
  return { ...record, path: resolve(path) };
}
export function readPinnedJSON(path, expected = null) {
  const before = safeAbsoluteRecord(path), bytes = readFileSync(path);
  if (expected && !same(before, expected) || !same(before, safeAbsoluteRecord(path)) || bytes.length !== before.bytes) gateFail('Dual-source JSON changed during bounded read');
  // Check the bytes actually parsed as well as both filesystem observations.
  if (createHash('sha256').update(bytes).digest('hex') !== before.sha256) gateFail('Changed dual-source JSON bytes');
  return JSON.parse(bytes.toString('utf8'));
}
export function captureDualSourceGraph() {
  const root = resolve(AUDIT_REPOSITORY), sources = captureSourceGraph({ root, roots: DUAL_SOURCE_ROOTS });
  const expected = { kind: 'model11-dual-source-audit-closed-source-inventory', version: 1, roots: DUAL_SOURCE_ROOTS, sources };
  if (!same(readPinnedJSON(join(root, DUAL_SOURCE_MANIFEST)), expected)) gateFail('Dual-source runner differs from reviewed closed inventory');
  // Every nonliteral API import is an explicit, closed entry in the inventory.
  if (DYNAMIC_API_FILES.some(name => !sources.some(record => record.path === `${PREFIX}${name}.mjs`))) gateFail('Dynamic API is missing from the closed graph');
  return { inventory: auditFileRecord(root, DUAL_SOURCE_MANIFEST), ...expected };
}
export function assertPinnedRepository(root, commit, side) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') || git(root, ['rev-parse', 'HEAD']) !== commit || git(root, ['status', '--porcelain', '--untracked-files=no'])) gateFail('Execution commit or tracked worktree changed');
  if (side === 'original') {
    if (commit !== ORIGINAL_COMMIT) gateFail('Only original1e417 is admitted');
  } else {
    if (resolve(root) !== resolve(AUDIT_REPOSITORY) || commit === REVIEWED_MEMO_COMMIT) gateFail('Explicit final audit execution commit is required');
    git(root, ['merge-base', '--is-ancestor', REVIEWED_MEMO_COMMIT, commit]);
    const changes = git(root, ['diff', '--name-status', REVIEWED_MEMO_COMMIT, commit]);
    for (const line of changes.split('\n').filter(Boolean)) {
      const [status, path, extra] = line.split('\t');
      if (extra || !(status === 'A' && ALLOWED_MEMO_ADDITIONS.includes(path) || status === 'M' && REFRESHED_INVENTORIES.includes(path))) gateFail('Changes outside the reviewed memo audit lineage');
    }
  }
}
export function validateDualSourceSpecShape(spec) {
  if (!exactKeys(spec, ['kind', 'version', 'original', 'optimized', 'inputs', 'runRoot', 'node', 'equivalence']) ||
      spec.kind !== 'model11-reviewed-original-to-memo-audit-spec' || spec.version !== 1 ||
      !exactKeys(spec.original, ['root', 'commit', 'report', 'evidence']) || !exactKeys(spec.optimized, ['root', 'executionCommit']) ||
      !exactKeys(spec.inputs, ['spot', 'files']) || !exactKeys(spec.inputs.files, ['flop', 'later', 'plan']) ||
      !exactKeys(spec.node, ['version', 'binary', 'execArgv']) || !exactKeys(spec.node.binary, ['bytes', 'sha256']) ||
      !exactKeys(spec.equivalence, ['fullProof96', 'independentReview']) || !isAbsolute(spec.runRoot) ||
      [spec.original.root, spec.original.report, spec.original.evidence, spec.optimized.root].some(path => !isAbsolute(path)) ||
      typeof spec.inputs.spot !== 'string' || !spec.inputs.spot ||
      Object.values(spec.inputs.files).some(path => typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..'))) gateFail('Malformed fixed dual-source audit spec');
  const runRoot = resolve(spec.runRoot), originalEvidence = resolve(spec.original.evidence);
  if (runRoot === originalEvidence || runRoot.startsWith(originalEvidence + '/') || originalEvidence.startsWith(runRoot + '/') ||
      runRoot === resolve(spec.original.root) || runRoot.startsWith(resolve(spec.original.root) + '/')) gateFail('Fresh audit destination overlaps preserved original evidence/source');
  if (spec.original.commit !== ORIGINAL_COMMIT || !/^[a-f0-9]{40}$/.test(spec.optimized.executionCommit ?? '') ||
      spec.optimized.executionCommit === REVIEWED_MEMO_COMMIT || !same(spec.node.execArgv, ['--max-old-space-size=512']) ||
      !Number.isSafeInteger(spec.node.binary.bytes) || spec.node.binary.bytes < 1 || !/^[a-f0-9]{64}$/.test(spec.node.binary.sha256 ?? '')) gateFail('Invalid exact source/runtime spec identity');
  return spec;
}
export function assertCapturedSourceRecords(root, source) {
  // Includes ignored raw12 files; Git cleanliness is intentionally insufficient.
  const records = [source.strictBalance.inventory, ...source.strictBalance.sources, ...source.strictBalance.inputs,
    source.compositeBehavior.inventory, ...source.compositeBehavior.sources, ...source.inputs];
  const checked = new Map();
  for (const expected of records) {
    if (checked.has(expected.path)) {
      if (!same(checked.get(expected.path), expected)) gateFail('Conflicting captured source/input pins');
    } else {
      if (!same(auditFileRecord(root, expected.path), expected)) gateFail('Captured source/inventory/raw12 bytes changed');
      checked.set(expected.path, expected);
    }
  }
}
export function loadDualSourceSpec(path, sha256) {
  const specRecord = safeAbsoluteRecord(path);
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '') || specRecord.sha256 !== sha256) gateFail('Explicit reviewed spec SHA-256 required');
  const spec = readPinnedJSON(path, specRecord);
  validateDualSourceSpecShape(spec);
  for (const key of Object.keys(EQUIVALENCE_ARCHIVES)) {
    if (safeAbsoluteRecord(spec.equivalence[key], 64 * 1024 * 1024).sha256 !== EQUIVALENCE_ARCHIVES[key]) gateFail('Missing exact reviewed equivalence prerequisite');
  }
  const node = safeAbsoluteRecord(realpathSync(process.execPath), 256 * 1024 * 1024);
  if (process.version !== spec.node.version || !same({ bytes: node.bytes, sha256: node.sha256 }, spec.node.binary) ||
      !same(spec.node.execArgv, ['--max-old-space-size=512']) || !same(process.execArgv, spec.node.execArgv)) gateFail('Pinned Node version, binary and 512MiB heap flag required');
  assertPinnedRepository(spec.original.root, spec.original.commit, 'original');
  assertPinnedRepository(spec.optimized.root, spec.optimized.executionCommit, 'optimized');
  const runner = captureDualSourceGraph();
  return { spec, specRecord, runner };
}
export async function loadDualSourceContext(spec, side) {
  const root = side === 'original' ? spec.original.root : spec.optimized.root;
  const commit = side === 'original' ? spec.original.commit : spec.optimized.executionCommit;
  assertPinnedRepository(root, commit, side);
  // Fixed, enumerated names only. Original validators are loaded from the actual
  // original checkout, in a process that never loads optimized input objects.
  const a = Object.assign({}, ...await Promise.all(DYNAMIC_API_FILES.map(name => import(pathToFileURL(join(root, `${PREFIX}${name}.mjs`))))));
  const source = a.captureCompletionRepresentativeSource({ root });
  const captureFiles = () => Object.fromEntries(Object.entries(spec.inputs.files).map(([key, path]) => [key, auditFileRecord(root, path)]));
  const files = captureFiles(), inputs = a.loadInputs(spec.inputs.spot);
  const flop = readPinnedJSON(join(root, spec.inputs.files.flop)), later = readPinnedJSON(join(root, spec.inputs.files.later));
  const plan = a.resolveModel11GatePlan(inputs, readPinnedJSON(join(root, spec.inputs.files.plan)), { executeFull: true });
  const binding = a.model11CompletionRepresentativeBinding(inputs, flop, later, plan, source, files), cells = a.completionRepresentativeCells(inputs, plan);
  if (plan.kind !== 'representative' || plan.scope !== 'full' || plan.street !== 'all' || cells.length !== 72 ||
      plan.samples !== 10000 || plan.cacheBatchSize !== 512 || plan.boardList.length !== 12 || plan.profiles.length !== 3 || plan.heroes.length !== 2) gateFail('Only the unchanged full72/720000/cache512 plan is admitted');
  const assertUnchanged = () => {
    assertPinnedRepository(root, commit, side);
    if (!same(source, a.captureCompletionRepresentativeSource({ root })) || !same(files, captureFiles()) ||
        a.loadInputs(inputs.spot.id).fingerprint !== inputs.fingerprint) gateFail('Source/input/policy/full-plan changed');
  };
  assertUnchanged();
  return { a, inputs, flop, later, binding, cells, assertUnchanged, commit, root };
}
