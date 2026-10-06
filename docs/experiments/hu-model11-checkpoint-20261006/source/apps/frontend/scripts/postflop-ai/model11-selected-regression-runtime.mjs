// Fixed reviewed source assembly for the separate4999 regression contract.
import { execFileSync } from 'node:child_process';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph } from './audit-identity.mjs';
import { captureCompletionRepresentativeSource } from './model11-completion-representative-source.mjs';
import { loadInputs } from './inputs.mjs';
import { resolveModel11GatePlan, exactKeys, same, gateFail } from './model11-gate-contract.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { loadDualSourceContext, readPinnedJSON, safeAbsoluteRecord } from './model11-dual-source-runtime.mjs';
import { EQUIVALENCE_ARCHIVES, ORIGINAL_COMMIT } from './model11-dual-source-contract.mjs';
import { selectedBinding, validateSelectedManifest } from './model11-selected-regression.mjs';

export const SELECTED_BASE = '58570ffce3419d8973e08f0dee344be095f33f03';
export const PREFIX_PATCH = '87a768fdcf4e986d2a4a2e175c3fad76e1e09567';
export const VECTOR_PATCH = 'e3e4a29b20240bc727094b71d52f6d4f93b07839';
export const SELECTION_SHA = '062706986a35fb5dc106468fab155373b3db40ebdf874f8f22df18488e31d58f';
const PREFIX = 'apps/frontend/scripts/postflop-ai/';
export const SELECTED_ROOTS = [PREFIX + 'evaluate-model11-selected-regression.mjs', PREFIX + 'evaluate-model11-completion-representative.mjs'];
export const SELECTED_MANIFEST = 'apps/frontend/tests/fixtures/model11-selected-regression-source-graph.json';
const patchPins = {
  'effective-reach.mjs': 'b24146403ddd487a645d3b9408a7abc3f2d93a0d9ef0f84723fdc785196db7b2',
  'execution-model11.mjs': '9c63d825e8c66aa9fe76b733905a543c540b84613d1fd7f03bce7000aaa84f4d',
  'gate-model11.mjs': '8a5d7d2547c97fdb3db050a93c6ac06fef19a87fb88b33c0154f93f8abe1949c',
};
const additions = ['evaluate-model11-selected-regression.mjs', 'model11-selected-regression.mjs', 'model11-selected-regression-runtime.mjs',
  'perf/verify-model11-selected-regression.py'].map(path => PREFIX + path).concat([SELECTED_MANIFEST,
  'apps/frontend/tests/postflop-model11-selected-regression.test.mjs', 'apps/frontend/tests/test_model11_selected_regression.py',
  'apps/frontend/tests/fixtures/model11-selected-regression-selection-v2.json',
  'apps/frontend/tests/postflop-model11-prepared-prefix.test.mjs', 'docs/model11-selected-regression.md']);
additions.push('apps/frontend/tests/postflop-model11-gate-vector.test.mjs');
const modified = Object.keys(patchPins).map(path => PREFIX + path).concat(['apps/frontend/tests/fixtures/model11-gate-source-graph.json',
  'apps/frontend/tests/fixtures/model11-completion-representative-source-graph.json', 'apps/frontend/tests/fixtures/model11-dual-source-audit-source-graph.json']);
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export function assertSelectedSource(spec) {
  const root = resolve(AUDIT_REPOSITORY), candidate = spec.candidate;
  if (resolve(candidate.root) !== root || candidate.baseCommit !== SELECTED_BASE || candidate.preparedPrefixPatch !== PREFIX_PATCH || candidate.preparedVectorPatch !== VECTOR_PATCH ||
      !/^[a-f0-9]{40}$/.test(candidate.executionCommit) || git(root, ['rev-parse', 'HEAD']) !== candidate.executionCommit ||
      git(root, ['status', '--porcelain', '--untracked-files=no'])) gateFail('Selected execution commit/worktree differs');
  git(root, ['merge-base', '--is-ancestor', SELECTED_BASE, candidate.executionCommit]);
  for (const line of git(root, ['diff', '--name-status', SELECTED_BASE, candidate.executionCommit]).split('\n').filter(Boolean)) {
    const [status, path, extra] = line.split('\t');
    if (extra || !(status === 'A' && additions.includes(path) || status === 'M' && modified.includes(path))) gateFail('Unreviewed selected source assembly');
  }
  for (const [path, hash] of Object.entries(patchPins)) if (auditFileRecord(root, PREFIX + path).sha256 !== hash) gateFail('Prepared-prefix patch bytes differ from reviewed87a');
  const implementation = captureCompletionRepresentativeSource({ root });
  const sources = captureSourceGraph({ root, roots: SELECTED_ROOTS });
  const expected = { kind: 'model11-selected-regression-closed-source-inventory', version: 1, roots: SELECTED_ROOTS, sources };
  if (!same(readPinnedJSON(join(root, SELECTED_MANIFEST)), expected)) gateFail('Selected source graph differs');
  return { implementation, targetedAdapter: { ...expected, inventory: auditFileRecord(root, SELECTED_MANIFEST) },
    executionCommit: candidate.executionCommit, literalBaseCommit: SELECTED_BASE, reviewedPreparedPrefixPatch: PREFIX_PATCH, reviewedPreparedVectorPatch: VECTOR_PATCH };
}
export function loadSelectedSpec(path, digest) {
  const specRecord = safeAbsoluteRecord(path);
  if (specRecord.sha256 !== digest) gateFail('Explicit exact selected spec SHA required');
  const spec = readPinnedJSON(path, specRecord);
  if (!exactKeys(spec, ['kind', 'version', 'original', 'candidate', 'inputs', 'selection', 'runRoot', 'node', 'prerequisites', 'commonControls']) ||
      spec.kind !== 'model11-reviewed-selected-regression-spec' || spec.version !== 1 ||
      !exactKeys(spec.original, ['root', 'commit', 'report', 'evidence']) || spec.original.commit !== ORIGINAL_COMMIT ||
      !exactKeys(spec.candidate, ['root', 'baseCommit', 'preparedPrefixPatch', 'preparedVectorPatch', 'executionCommit']) ||
      !exactKeys(spec.inputs, ['spot', 'files']) || !exactKeys(spec.inputs.files, ['flop', 'later', 'plan']) ||
      !exactKeys(spec.selection, ['path', 'bytes', 'sha256']) || spec.selection.sha256 !== SELECTION_SHA ||
      !exactKeys(spec.node, ['version', 'binary', 'execArgv']) || !exactKeys(spec.node.binary, ['bytes', 'sha256']) ||
      !exactKeys(spec.prerequisites, ['fullProof96', 'independentReview', 'preparedPrefixReview', 'preparedVectorReview']) ||
      !Array.isArray(spec.commonControls) || !same(spec.commonControls.map(row => row.label).sort(), ['paired-board-ordering', 'positive-reroute', 'six-real-controls']) ||
      [spec.original.root, spec.original.report, spec.original.evidence, spec.candidate.root, spec.runRoot, spec.selection.path].some(path => typeof path !== 'string' || !isAbsolute(path))) gateFail('Malformed selected-regression spec');
  const run = resolve(spec.runRoot), old = resolve(spec.original.root), oldEvidence = resolve(spec.original.evidence);
  if (run === old || run.startsWith(old + '/') || run === oldEvidence || run.startsWith(oldEvidence + '/')) gateFail('Selected run overlaps preserved original');
  for (const record of Object.values(spec.inputs.files)) {
    if (!exactKeys(record, ['path', 'bytes', 'sha256'])) gateFail('Exact named input file records required');
    for (const root of [spec.original.root, spec.candidate.root]) if (!same(auditFileRecord(root, record.path), record)) gateFail('Policy/plan input bytes differ');
  }
  for (const key of Object.keys(EQUIVALENCE_ARCHIVES)) if (safeAbsoluteRecord(spec.prerequisites[key], 64 * 1024 * 1024).sha256 !== EQUIVALENCE_ARCHIVES[key]) gateFail('Full-proof prerequisite differs');
  if (safeAbsoluteRecord(spec.prerequisites.preparedPrefixReview).sha256 !== '2f41ecb2e7441ea2261b267c922ca4b875e81f37fac196f0e9831b1a63e994fa') gateFail('Prepared-prefix independent review differs');
  if (safeAbsoluteRecord(spec.prerequisites.preparedVectorReview).sha256 !== '47ada84ea38ad11bf935d7863a6d438e03f9af3289aa7cbe855e115aabfae119') gateFail('Prepared-vector independent review differs');
  for (const record of spec.commonControls) {
    if (!exactKeys(record, ['label', 'path', 'bytes', 'sha256']) || !same(safeAbsoluteRecord(record.path), { path: record.path, bytes: record.bytes, sha256: record.sha256 })) gateFail('Pinned common-control receipt differs');
  }
  const node = safeAbsoluteRecord(realpathSync(process.execPath), 256 * 1024 * 1024);
  if (process.version !== spec.node.version || !same(spec.node.binary, { bytes: node.bytes, sha256: node.sha256 }) ||
      !same(spec.node.execArgv, ['--max-old-space-size=512']) || !same(process.execArgv, spec.node.execArgv)) gateFail('Pinned Node runtime differs');
  if (git(spec.original.root, ['rev-parse', 'HEAD']) !== ORIGINAL_COMMIT || git(spec.original.root, ['status', '--porcelain', '--untracked-files=no'])) gateFail('Original source commit/worktree differs');
  const selection = readPinnedJSON(spec.selection.path, spec.selection);
  if (selection.version !== 2 || selection.originalCommit !== ORIGINAL_COMMIT || selection.optimizedBaseCommit !== SELECTED_BASE ||
      selection.sourceAssembly?.requiredPreparedPrefixPatch !== PREFIX_PATCH || selection.originalReport.path !== spec.original.report) gateFail('Wrong authorized selection lineage');
  const { bindingHash, ...originalReportRecord } = selection.originalReport;
  if (!same(safeAbsoluteRecord(spec.original.report), originalReportRecord)) gateFail('Original completed report bytes changed');
  captureCompletionRepresentativeSource({ root: spec.original.root }); // Includes ignored original raw12, not only Git status.
  const source = assertSelectedSource(spec);
  return { spec, specRecord, selection, source };
}
export function loadSelectedCandidate(spec, selection, source) {
  const inputs = loadInputs(spec.inputs.spot), flop = readPinnedJSON(join(spec.candidate.root, spec.inputs.files.flop.path)),
    later = readPinnedJSON(join(spec.candidate.root, spec.inputs.files.later.path));
  // Interpret the unchanged original plan; it is never retagged as a smaller full run.
  const originalPlan = resolveModel11GatePlan(inputs, readPinnedJSON(join(spec.candidate.root, spec.inputs.files.plan.path)), { executeFull: true });
  const cells = validateSelectedManifest(selection, inputs, originalPlan);
  const binding = selectedBinding(inputs, flop, later, originalPlan, source, spec.inputs.files, selection, spec.selection);
  return { inputs, flop, later, originalPlan, cells, binding, commit: spec.candidate.executionCommit };
}
export async function loadSelectedOriginal(spec) {
  const oldSpec = { original: spec.original, inputs: { spot: spec.inputs.spot, files: Object.fromEntries(Object.entries(spec.inputs.files).map(([key, value]) => [key, value.path])) } };
  const context = await loadDualSourceContext(oldSpec, 'original');
  // These two fixed original-source APIs are already inside the explicit closed roots.
  const extra = Object.assign({}, ...await Promise.all(['offpath-behavior-model11', 'simulation-model11'].map(name => import(pathToFileURL(join(spec.original.root, `${PREFIX}${name}.mjs`))))));
  return { ...context, a: { ...context.a, ...extra } };
}
