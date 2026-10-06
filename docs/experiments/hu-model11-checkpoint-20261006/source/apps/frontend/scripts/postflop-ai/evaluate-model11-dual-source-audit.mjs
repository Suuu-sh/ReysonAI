// Offline, opt-in, fixed four-lane audit. Run prepare, the four lanes, then finish
// as separate bounded processes. Never regenerate the original report.
import { mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { auditFileRecord } from './audit-identity.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { exactKeys, same, gateFail } from './model11-gate-contract.mjs';
import { writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { loadDualSourceSpec, loadDualSourceContext, readPinnedJSON, safeAbsoluteRecord, assertPinnedRepository, assertCapturedSourceRecords } from './model11-dual-source-runtime.mjs';
import { validateDualSourceReport, validateDualSourceBindingPair, compareDualSourceCell, compareDualSourceReports,
  SOURCE_WRAPPER_ALLOWLIST, ORIGINAL_COMMIT, REVIEWED_MEMO_COMMIT, EQUIVALENCE_ARCHIVES } from './model11-dual-source-contract.mjs';
import { finishDualSourceQuality } from './model11-dual-source-quality.mjs';

const eq = (a, b, message) => { if (!same(a, b)) gateFail(message); };
export const indicesForLane = lane => Array.from({ length: 72 }, (_, index) => index).filter(index => index % 4 === lane);
const write = (path, value) => { writeImmutableAllBoardOutput(path, JSON.stringify(value, null, 2) + '\n'); return safeAbsoluteRecord(path); };
const timestamp = () => new Date().toISOString();
function exists(path) { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function mkdirExclusive(path) {
  for (let current = dirname(resolve(path));; current = dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) gateFail('Unsafe audit directory ancestor');
    if (current === dirname(current)) break;
  }
  mkdirSync(path); // Existing destinations, including interrupted runs, fail closed.
}
export function parseDualSourceArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--execute-full') { if (options.executeFull) gateFail('Duplicate full-execution opt-in'); options.executeFull = true; continue; }
    if (!['--operation', '--spec', '--spec-sha256', '--lane'].includes(key) || key in options || !args[i + 1] || args[i + 1].startsWith('--')) gateFail('Explicit dual-source operation/spec/SHA and --execute-full required');
    options[key] = args[++i];
  }
  if (!['prepare', 'fresh-lane', 'finish'].includes(options['--operation']) || !options['--spec'] || !options['--spec-sha256'] || !options.executeFull ||
      ('--lane' in options) !== (options['--operation'] === 'fresh-lane') || '--lane' in options && !/^[0-3]$/.test(options['--lane'])) gateFail('Invalid fixed-four-lane audit operation');
  return options;
}
function freshProvenance(ctx, specRecord, runner, lane, laneRoot) {
  return { specSha256: specRecord.sha256, originalCommit: ORIGINAL_COMMIT, reviewedMemoCommit: REVIEWED_MEMO_COMMIT,
    executionCommit: ctx.commit, bindingHash: contentHash(ctx.binding), runner,
    lane, laneRoot, indices: indicesForLane(lane), command: process.argv, node: process.version, execArgv: process.execArgv,
    startedAt: timestamp(), freshStoresRequired: true, originalNumericalResultsConsumed: false };
}
function checkPrepared(spec, specRecord) {
  const prepared = readPinnedJSON(join(spec.runRoot, 'prepared.json'));
  if (!exactKeys(prepared, ['kind', 'version', 'specSha256', 'originalValidation']) ||
      prepared.kind !== 'model11-dual-source-audit-prepared' || prepared.version !== 1 || prepared.specSha256 !== specRecord.sha256) gateFail('Original validation has not completed for this spec');
  eq(safeAbsoluteRecord(join(spec.runRoot, 'original-validation.json')), prepared.originalValidation, 'Original validation receipt changed');
  return prepared;
}
async function prepare(spec, specRecord, runner) {
  mkdirExclusive(spec.runRoot);
  write(join(spec.runRoot, 'spec.json'), spec);
  const startedAt = timestamp(), ctx = await loadDualSourceContext(spec, 'original');
  const { a, inputs, flop, later, binding, assertUnchanged } = ctx;
  const reportRecord = safeAbsoluteRecord(spec.original.report), receipt = readPinnedJSON(spec.original.report, reportRecord);
  const saved = a.validateCompletionRepresentativeReceipt(receipt, { operation: 'report', binding });
  validateDualSourceReport(saved, binding, 72);
  // The actual original module semantically reads every old cell/chunk/event and
  // complete proof under original source/binding. No new trial is counted here.
  const validated = a.produceModel11CompletionRepresentative(inputs, flop, later, binding, spec.original.evidence,
    { assertUnchanged, requireExisting: true, onCell: (row, count) => console.log(JSON.stringify({ phase: 'original-validation', cell: count, status: row.status })) });
  eq(validated, saved, 'Original report differs from its fully validated original evidence');
  assertUnchanged(); eq(safeAbsoluteRecord(spec.original.report), reportRecord, 'Original report changed during validation');
  const validation = { kind: 'model11-original-source-semantic-validation', version: 1, specSha256: specRecord.sha256,
    startedAt, completedAt: timestamp(), executionCommit: ctx.commit, runner, binding, reportRecord,
    reportResultHash: contentHash(saved), completeCellCoverage: 72, newlyComputedTrials: 0,
    status: 'all-original-cells-chunks-events-and-full-proofs-validated-under-original-source' };
  const originalValidation = write(join(spec.runRoot, 'original-validation.json'), validation);
  write(join(spec.runRoot, 'prepared.json'), { kind: 'model11-dual-source-audit-prepared', version: 1, specSha256: specRecord.sha256, originalValidation });
}
function cellEvidence(store, saved, index) {
  return [...saved.proofs, ...saved.chunks.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), store.record(store.cellName(index))];
}
export function validateFreshStore(ctx, root, index, completion, provenance, completedAt = null) {
  const { a, inputs, flop, later, binding, cells } = ctx;
  if (!exactKeys(completion, ['kind', 'version', 'index', 'cell', 'bindingHash', 'provenanceHash', 'newlyComputedTrials', 'provedUnreachableTrials', 'numericalHash', 'evidence', 'attempt']) ||
      completion.kind !== 'model11-dual-source-newly-computed-cell' || completion.version !== 1 || completion.index !== index ||
      completion.bindingHash !== contentHash(binding) || completion.provenanceHash !== contentHash(provenance) || !same(completion.cell, cells[index])) gateFail('Invalid fresh worker completion receipt');
  const attempt = validateCellAttempt(root, index, completion.attempt, provenance);
  if (completedAt !== null) validateAttemptCompletionTime(attempt, completedAt);
  const store = a.openCompletionRepresentativeEvidence(root, binding), saved = store.read(store.cellName(index));
  if (contentHash(saved) !== completion.numericalHash || !same(cellEvidence(store, saved, index), completion.evidence) ||
      completion.newlyComputedTrials !== (saved.unreachable ? 0 : cells[index].samples) ||
      completion.provedUnreachableTrials !== (saved.unreachable ? cells[index].samples : 0)) gateFail('Fresh worker receipt differs from its evidence/counts');
  const allowed = ['identity.json', ...completion.evidence.map(ref => ref.path)].sort();
  eq(readdirSync(store.dir).sort(), allowed, 'Fresh isolated cell store has unowned evidence');
  a.validateCompletionRepresentativeCell(inputs, flop, later, binding, store, cells[index], saved);
  return { store, saved, attempt };
}
export function validateAttemptCompletionTime(attempt, completedAt) {
  if (!Number.isFinite(Date.parse(attempt.startedAt)) || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) < Date.parse(attempt.startedAt)) gateFail('Lane completion predates its admitted fresh cell attempt');
}
export function validateCellAttempt(root, index, attemptRecord, provenance) {
  const attemptRoot = dirname(resolve(root)), name = attemptRoot.slice(attemptRoot.lastIndexOf('/') + 1);
  const cellRoot = dirname(attemptRoot), laneRoot = dirname(cellRoot);
  if (!/^attempt-[a-f0-9-]{36}$/.test(name) || root !== join(attemptRoot, 'evidence') ||
      attemptRecord?.path !== join(attemptRoot, 'started.json') ||
      cellRoot !== join(laneRoot, `cell-${String(index).padStart(3, '0')}`) || laneRoot !== provenance.laneRoot) gateFail('Fresh cell attempt is outside its exact lane');
  const attempt = readPinnedJSON(attemptRecord.path, attemptRecord);
  if (!exactKeys(attempt, ['kind', 'version', 'index', 'laneProvenanceHash', 'specSha256', 'executionCommit', 'bindingHash', 'startedAt', 'evidenceRoot', 'emptyStoreRequired']) ||
      attempt.kind !== 'model11-dual-source-fresh-cell-attempt' || attempt.version !== 1 || attempt.index !== index ||
      attempt.laneProvenanceHash !== contentHash(provenance) || attempt.specSha256 !== provenance.specSha256 ||
      attempt.executionCommit !== provenance.executionCommit || attempt.bindingHash !== provenance.bindingHash || attempt.evidenceRoot !== root ||
      attempt.emptyStoreRequired !== true || !Number.isFinite(Date.parse(attempt.startedAt)) || Date.parse(attempt.startedAt) < Date.parse(provenance.startedAt)) gateFail('Stale or wrongly attributed fresh cell attempt');
  return attempt;
}
export function readCompletedFreshCell(ctx, laneRoot, index, provenance) {
  const receiptPath = join(laneRoot, `${String(index).padStart(3, '0')}.receipt.json`);
  if (!exists(receiptPath)) return null; // A cell marker without its receipt is partial.
  const record = safeAbsoluteRecord(receiptPath), completion = readPinnedJSON(receiptPath, record);
  const root = join(dirname(completion.attempt.path), 'evidence');
  const { attempt } = validateFreshStore(ctx, root, index, completion, provenance);
  return { record, completion, root, attempt };
}
export function beginFreshCellAttempt(ctx, laneRoot, index, provenance) {
  if (laneRoot !== provenance.laneRoot || provenance.bindingHash !== contentHash(ctx.binding) || !provenance.indices.includes(index)) gateFail('Wrong fresh attempt lane/binding/index');
  const cellRoot = join(laneRoot, `cell-${String(index).padStart(3, '0')}`);
  if (!exists(cellRoot)) mkdirExclusive(cellRoot);
  const attemptRoot = join(cellRoot, `attempt-${randomUUID()}`); mkdirExclusive(attemptRoot);
  const root = join(attemptRoot, 'evidence');
  const attempt = write(join(attemptRoot, 'started.json'), { kind: 'model11-dual-source-fresh-cell-attempt', version: 1, index,
    laneProvenanceHash: contentHash(provenance), specSha256: provenance.specSha256, executionCommit: ctx.commit,
    bindingHash: contentHash(ctx.binding), startedAt: timestamp(), evidenceRoot: root, emptyStoreRequired: true });
  const store = ctx.a.openCompletionRepresentativeEvidence(root, ctx.binding, { fresh: true });
  return { root, attempt, store };
}
async function freshLane(spec, specRecord, runner, lane) {
  // Only readiness provenance is read. Original numeric evidence is never read.
  checkPrepared(spec, specRecord);
  const laneRoot = join(spec.runRoot, `lane-${lane}`), startedPath = join(laneRoot, 'started.json');
    const ctx = await loadDualSourceContext(spec, 'optimized'), { a, inputs, flop, later, binding, cells, assertUnchanged } = ctx;
  let provenance;
  if (exists(laneRoot)) {
    provenance = readPinnedJSON(startedPath);
    validateLaneProvenance(provenance, { specSha256: specRecord.sha256, executionCommit: ctx.commit, binding, runner, lane, node: spec.node, laneRoot });
  } else {
    mkdirExclusive(laneRoot); provenance = freshProvenance(ctx, specRecord, runner, lane, laneRoot);
    write(startedPath, provenance);
  }
  const completions = [], attemptTimes = [];
  for (const index of indicesForLane(lane)) {
    assertUnchanged(); const name = String(index).padStart(3, '0'), receiptPath = join(laneRoot, `${name}.receipt.json`);
    const retained = readCompletedFreshCell(ctx, laneRoot, index, provenance);
    if (retained) {
      assertUnchanged(); completions.push(retained.record); attemptTimes.push(retained.attempt.startedAt);
      console.log(JSON.stringify({ phase: 'fresh-lane', lane, index, retainedFreshTrials: retained.completion.newlyComputedTrials, newlyComputedThisInvocation: 0 }));
      continue;
    }
    const { root, attempt, store } = beginFreshCellAttempt(ctx, laneRoot, index, provenance);
    attemptTimes.push(validateCellAttempt(root, index, attempt, provenance).startedAt);
    const saved = a.produceCompletionRepresentativeCell(inputs, flop, later, binding, store, index, cells[index]);
    a.validateCompletionRepresentativeCell(inputs, flop, later, binding, store, cells[index], saved);
    assertUnchanged(); store.write(store.cellName(index), saved);
    const completion = { kind: 'model11-dual-source-newly-computed-cell', version: 1, index, cell: cells[index],
      bindingHash: contentHash(binding), provenanceHash: contentHash(provenance), newlyComputedTrials: saved.unreachable ? 0 : cells[index].samples,
      provedUnreachableTrials: saved.unreachable ? cells[index].samples : 0, numericalHash: contentHash(saved), evidence: cellEvidence(store, saved, index), attempt };
    completions.push(write(receiptPath, completion));
    console.log(JSON.stringify({ phase: 'fresh-lane', lane, index, newlyComputedTrials: completion.newlyComputedTrials, status: saved.row.status }));
  }
  assertUnchanged();
  const completedPath = join(laneRoot, 'completed.json');
  if (exists(completedPath)) {
    const completed = readPinnedJSON(completedPath);
    validateFixedLaneReceipt(completed, provenance, { specSha256: specRecord.sha256, executionCommit: ctx.commit, binding, runner, lane, node: spec.node, laneRoot });
    for (const startedAt of attemptTimes) validateAttemptCompletionTime({ startedAt }, completed.completedAt);
    eq(completed.completions, completions, 'Completed lane receipt changed during resume');
  } else write(completedPath, { kind: 'model11-dual-source-fixed-lane-completion', version: 1, provenance, completedAt: timestamp(), completions });
}
export function importFreshCell(ctx, target, root, index, completion, provenance, completedAt = null) {
  const { store, saved } = validateFreshStore(ctx, root, index, completion, provenance, completedAt);
  // A retry may encounter only exact bytes of this newly computed cell. The
  // immutable writer rejects changed parts and never overwrites a prior marker.
  // Only this audit's newly computed store is admitted. Original evidence never
  // enters the import path. Preserve exact fresh wrappers; marker is last.
  for (const record of cellEvidence(store, saved, index)) {
    const value = store.read(record.path, record), bytes = Buffer.from(JSON.stringify(value) + '\n');
    if (bytes.length !== record.bytes || createHash('sha256').update(bytes).digest('hex') !== record.sha256) gateFail('Noncanonical fresh evidence serialization');
    const written = target.write(record.path, value);
    eq(written, record, 'Fresh import did not preserve exact own-source bytes');
  }
}
export function validateLaneProvenance(provenance, { specSha256, executionCommit, binding, runner, lane, node, laneRoot, originalCompletedAt = null }) {
  if (!exactKeys(provenance, ['specSha256', 'originalCommit', 'reviewedMemoCommit', 'executionCommit', 'bindingHash', 'runner', 'lane', 'laneRoot', 'indices', 'command', 'node', 'execArgv', 'startedAt', 'freshStoresRequired', 'originalNumericalResultsConsumed']) ||
      provenance.specSha256 !== specSha256 || provenance.originalCommit !== ORIGINAL_COMMIT || provenance.reviewedMemoCommit !== REVIEWED_MEMO_COMMIT ||
      provenance.executionCommit !== executionCommit || provenance.bindingHash !== contentHash(binding) || !same(provenance.runner, runner) ||
      provenance.lane !== lane || provenance.laneRoot !== laneRoot || !same(provenance.indices, indicesForLane(lane)) ||
      provenance.freshStoresRequired !== true || provenance.originalNumericalResultsConsumed !== false ||
      provenance.node !== node.version || !same(provenance.execArgv, node.execArgv) ||
      !Array.isArray(provenance.command) || !provenance.command.includes('fresh-lane') ||
      !Number.isFinite(Date.parse(provenance.startedAt)) || originalCompletedAt !== null &&
        (!Number.isFinite(Date.parse(originalCompletedAt)) || Date.parse(provenance.startedAt) < Date.parse(originalCompletedAt))) gateFail('Misattributed fresh lane provenance');
  return provenance;
}
export function validateFixedLaneReceipt(completed, provenance, expected) {
  validateLaneProvenance(provenance, expected);
  if (!exactKeys(completed, ['kind', 'version', 'provenance', 'completedAt', 'completions']) ||
      completed.kind !== 'model11-dual-source-fixed-lane-completion' || completed.version !== 1 || !same(completed.provenance, provenance) ||
      !Number.isFinite(Date.parse(completed.completedAt)) || Date.parse(completed.completedAt) < Date.parse(provenance.startedAt) ||
      !Array.isArray(completed.completions) || completed.completions.length !== 18) gateFail('Missing or misattributed fixed lane completion');
  for (const [offset, record] of completed.completions.entries()) {
    const index = indicesForLane(expected.lane)[offset];
    if (!exactKeys(record, ['path', 'bytes', 'sha256']) || record.path !== join(expected.laneRoot, `${String(index).padStart(3, '0')}.receipt.json`) ||
        !Number.isSafeInteger(record.bytes) || record.bytes < 1 || !/^[a-f0-9]{64}$/.test(record.sha256)) gateFail('Missing, duplicate or reordered lane cell receipts');
  }
  return completed;
}
export function validateFullFreshCoverage(completions) {
  if (!Array.isArray(completions) || completions.length !== 72 || new Set(completions.map(row => row.index)).size !== 72 ||
      completions.some(row => !Number.isSafeInteger(row.index) || row.index < 0 || row.index >= 72)) gateFail('Fresh full72 index coverage is incomplete');
}
export function validateLaneDirectory(laneRoot, expectedNames) {
  const expected = new Set(expectedNames), actual = [];
  for (const name of readdirSync(laneRoot)) {
    if (expected.has(name)) { actual.push(name); continue; }
    // A killed immutable writer can leave a regular temporary inode after its
    // canonical link committed. Preserve it, but never read/admit/count it.
    const match = /^(started\.json|completed\.json|\d{3}\.receipt\.json)\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.tmp$/.exec(name);
    const stat = lstatSync(join(laneRoot, name));
    if (!match || !expected.has(match[1]) || stat.isSymbolicLink() || !stat.isFile()) gateFail('Unowned/nonregular file in fresh lane');
  }
  eq(actual.sort(), [...expected].sort(), 'Missing canonical fresh lane evidence');
}
export function validateFinalDualSourceReceipt(prior, { specRecord, executionCommit, runner, exitCode, result, node }) {
  if (!exactKeys(prior, ['kind', 'version', 'specRecord', 'originalExecutionCommit', 'executionCommit', 'runner', 'completedAt', 'command', 'execution', 'exitCode', 'result', 'resultHash']) ||
      prior.kind !== 'model11-dual-source-completion-representative-execution-receipt' || prior.version !== 1 ||
      !same(prior.specRecord, specRecord) || prior.originalExecutionCommit !== ORIGINAL_COMMIT || prior.executionCommit !== executionCommit || !same(prior.runner, runner) ||
      !Number.isFinite(Date.parse(prior.completedAt)) || prior.exitCode !== exitCode || prior.resultHash !== contentHash(result) || !same(prior.result, result) ||
      !same(prior.execution, { node: node.version, platform: process.platform, arch: process.arch, execArgv: node.execArgv }) ||
      !Array.isArray(prior.command) || prior.command[0] !== process.execPath || prior.command[1] !== fileURLToPath(import.meta.url)) gateFail('Prior final receipt differs from this fully revalidated audit');
  const command = parseDualSourceArguments(prior.command.slice(2));
  if (command['--operation'] !== 'finish' || resolve(command['--spec']) !== specRecord.path || command['--spec-sha256'] !== specRecord.sha256) gateFail('Prior final receipt has wrong invocation attribution');
}
async function finish(spec, specRecord, runner) {
  const prepared = checkPrepared(spec, specRecord), originalValidation = readPinnedJSON(prepared.originalValidation.path, prepared.originalValidation);
  if (!exactKeys(originalValidation, ['kind', 'version', 'specSha256', 'startedAt', 'completedAt', 'executionCommit', 'runner', 'binding', 'reportRecord', 'reportResultHash', 'completeCellCoverage', 'newlyComputedTrials', 'status']) ||
      originalValidation.kind !== 'model11-original-source-semantic-validation' || originalValidation.version !== 1 ||
      originalValidation.specSha256 !== specRecord.sha256 || originalValidation.executionCommit !== ORIGINAL_COMMIT ||
      originalValidation.completeCellCoverage !== 72 || originalValidation.newlyComputedTrials !== 0 ||
      originalValidation.status !== 'all-original-cells-chunks-events-and-full-proofs-validated-under-original-source' || !same(originalValidation.runner, runner)) gateFail('Invalid original semantic validation receipt');
  const originalReceipt = readPinnedJSON(spec.original.report, originalValidation.reportRecord), saved = originalReceipt.result;
  if (contentHash(saved) !== originalValidation.reportResultHash) gateFail('Original report payload changed');
  const ctx = await loadDualSourceContext(spec, 'optimized'), { a, inputs, flop, later, binding, cells, assertUnchanged } = ctx;
  validateDualSourceReport(saved, originalValidation.binding, 72); validateDualSourceBindingPair(saved.binding, binding);
  const assertOriginalFiles = () => {
    assertPinnedRepository(spec.original.root, ORIGINAL_COMMIT, 'original');
    const files = Object.fromEntries(Object.entries(spec.inputs.files).map(([key, path]) => [key, auditFileRecord(spec.original.root, path)]));
    eq(files, saved.binding.files, 'Original policy/plan bytes changed after original semantic validation');
    assertCapturedSourceRecords(spec.original.root, saved.binding.source);
  };
  assertOriginalFiles();
  // This is only an aggregation store. On retry every imported part must match
  // a revalidated, completed fresh-attempt receipt; it never supplies production.
  const freshEvidenceRoot = join(spec.runRoot, 'fresh-evidence'), target = a.openCompletionRepresentativeEvidence(freshEvidenceRoot, binding);
  const laneReceipts = [], actualFreshReceipts = new Map();
  for (let lane = 0; lane < 4; lane++) {
    const laneRoot = join(spec.runRoot, `lane-${lane}`), lanePath = join(laneRoot, 'completed.json'), laneRecord = safeAbsoluteRecord(lanePath);
    const completed = readPinnedJSON(lanePath, laneRecord), provenance = readPinnedJSON(join(laneRoot, 'started.json'));
    validateFixedLaneReceipt(completed, provenance, { specSha256: specRecord.sha256, executionCommit: ctx.commit, binding, runner, lane, node: spec.node, laneRoot, originalCompletedAt: originalValidation.completedAt });
    const expectedNames = ['started.json', 'completed.json'];
    for (const [offset, record] of completed.completions.entries()) {
      const index = indicesForLane(lane)[offset], name = String(index).padStart(3, '0');
      if (record.path !== join(laneRoot, `${name}.receipt.json`) || actualFreshReceipts.has(index)) gateFail('Duplicate or reordered fresh cell receipt');
      const completion = readPinnedJSON(record.path, record);
      const root = join(dirname(completion.attempt.path), 'evidence');
      importFreshCell(ctx, target, root, index, completion, provenance, completed.completedAt);
      actualFreshReceipts.set(index, completion); expectedNames.push(`cell-${name}`, `${name}.receipt.json`);
    }
    validateLaneDirectory(laneRoot, expectedNames);
    laneReceipts.push(laneRecord); assertUnchanged();
  }
  validateFullFreshCoverage([...actualFreshReceipts.values()]);
  // This is aggregation/validation of actual fresh receipts, not another report
  // production: requireExisting refuses to calculate any missing cell.
  const replay = a.produceModel11CompletionRepresentative(inputs, flop, later, binding, freshEvidenceRoot, { assertUnchanged, requireExisting: true });
  const originalStore = a.openCompletionRepresentativeEvidence(spec.original.evidence, saved.binding), neutralCells = [];
  for (let index = 0; index < 72; index++) neutralCells.push(compareDualSourceCell(originalStore, target, saved.binding, binding, index, saved.cellRecords[index], replay.cellRecords[index]));
  const numericalPayloadHash = compareDualSourceReports(saved, replay, neutralCells);
  const equivalence = { kind: 'model11-original-to-reviewed-local-law-memo-full-replay-equivalence', version: 1, pass: true,
    original: { commit: ORIGINAL_COMMIT, bindingHash: saved.bindingHash, source: saved.binding.source, report: originalValidation.reportRecord, reportResultHash: originalValidation.reportResultHash, numericalPayloadHash },
    optimized: { reviewedMemoCommit: REVIEWED_MEMO_COMMIT, executionCommit: ctx.commit, bindingHash: contentHash(binding), source: binding.source, reportResultHash: contentHash(replay), numericalPayloadHash },
    prerequisiteArchives: EQUIVALENCE_ARCHIVES, sourceWrapperAllowlist: SOURCE_WRAPPER_ALLOWLIST,
    comparison: 'every ordered persisted paired trial return, completion event/law, complete proof body, count, metric and warning; ordinary-action trajectories are not persisted by this evidence format',
    originalSemanticValidation: prepared.originalValidation, freshLaneReceipts: laneReceipts, neutralCells,
    newlyComputedTrials: [...actualFreshReceipts.values()].reduce((sum, value) => sum + value.newlyComputedTrials, 0),
    provedUnreachableTrials: [...actualFreshReceipts.values()].reduce((sum, value) => sum + value.provedUnreachableTrials, 0), validationTrialsCountedAsNew: 0 };
  if (equivalence.newlyComputedTrials + equivalence.provedUnreachableTrials !== 720000) gateFail('Fresh full trial partition differs');
  // Preserve the independently produced replay report as its own source-bound
  // audit artifact, never as a replacement for the original report.
  const replayReport = write(join(spec.runRoot, 'fresh-replay-report.json'), replay);
  equivalence.optimized.report = replayReport;
  const result = finishDualSourceQuality(inputs, flop, later, binding, saved, replay, freshEvidenceRoot, { assertUnchanged }, equivalence);
  assertUnchanged(); assertOriginalFiles(); eq(safeAbsoluteRecord(spec.original.report), originalValidation.reportRecord, 'Original report changed during audit');
  eq(safeAbsoluteRecord(prepared.originalValidation.path), prepared.originalValidation, 'Original validation receipt changed during audit');
  for (const record of laneReceipts) eq(safeAbsoluteRecord(record.path), record, 'Fresh lane receipt changed during audit');
  eq(safeAbsoluteRecord(specRecord.path), specRecord, 'Reviewed audit spec changed during execution');
  const exitCode = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(result.status) ? 1 : 0;
  const receiptPath = join(spec.runRoot, 'dual-source-audit.json');
  if (exists(receiptPath)) {
    const prior = readPinnedJSON(receiptPath);
    validateFinalDualSourceReceipt(prior, { specRecord, executionCommit: ctx.commit, runner, exitCode, result, node: spec.node });
  } else {
    const receipt = { kind: 'model11-dual-source-completion-representative-execution-receipt', version: 1,
      specRecord, originalExecutionCommit: ORIGINAL_COMMIT, executionCommit: ctx.commit, runner, completedAt: timestamp(), command: process.argv,
      execution: { node: process.version, platform: process.platform, arch: process.arch, execArgv: process.execArgv }, exitCode, result, resultHash: contentHash(result) };
    validateFinalDualSourceReceipt(receipt, { specRecord, executionCommit: ctx.commit, runner, exitCode, result, node: spec.node });
    write(receiptPath, receipt);
  }
  console.log(JSON.stringify({ phase: 'dual-source-audit', status: result.status, fullScopePassed: result.fullScopePassed, numericalPayloadHash }));
  process.exitCode = exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseDualSourceArguments(process.argv.slice(2));
    const { spec, specRecord, runner } = loadDualSourceSpec(resolve(options['--spec']), options['--spec-sha256']);
    if (options['--operation'] === 'prepare') await prepare(spec, specRecord, runner);
    else if (options['--operation'] === 'fresh-lane') await freshLane(spec, specRecord, runner, Number(options['--lane']));
    else await finish(spec, specRecord, runner);
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
