// Separate selected-regression operations. No old full gate is bypassed or relabeled.
import { mkdirSync, lstatSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { openCompletionRepresentativeEvidence } from './model11-completion-representative-store.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { same, exactKeys, gateFail } from './model11-gate-contract.mjs';
import { createModel11BehaviorCompletion } from './offpath-behavior-model11.mjs';
import { playModel11Hand } from './simulation-model11.mjs';
import { captureCompletionRepresentativeSource } from './model11-completion-representative-source.mjs';
import { beginFreshCellAttempt, validateCellAttempt, validateLaneDirectory } from './evaluate-model11-dual-source-audit.mjs';
import { safeAbsoluteRecord, readPinnedJSON, assertCapturedSourceRecords } from './model11-dual-source-runtime.mjs';
import { loadSelectedSpec, loadSelectedCandidate, loadSelectedOriginal } from './model11-selected-regression-runtime.mjs';
import { validateSelectedManifest, produceSelectedCell, validateSelectedCell, compareSelectedCell, runSelectedCacheControls } from './model11-selected-regression.mjs';

const eq = (a, b, label) => { if (!same(a, b)) gateFail(`Selected audit ${label} differs`); };
const exists = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const write = (path, value) => { writeImmutableAllBoardOutput(path, JSON.stringify(value, null, 2) + '\n'); return safeAbsoluteRecord(path); };
const indices = lane => Array.from({ length: 72 }, (_, i) => i).filter(i => i % 4 === lane);
function mkdirNew(path) {
  for (let parent = dirname(resolve(path));; parent = dirname(parent)) {
    const stat = lstatSync(parent); if (stat.isSymbolicLink() || !stat.isDirectory()) gateFail('Unsafe selected output ancestor');
    if (parent === dirname(parent)) break;
  }
  mkdirSync(path);
}
export function parseSelectedArguments(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--execute-targeted') { if (out.execute) gateFail('Duplicate targeted opt-in'); out.execute = true; continue; }
    if (!['--operation', '--spec', '--spec-sha256', '--lane'].includes(key) || key in out || !args[i + 1] || args[i + 1].startsWith('--')) gateFail('Explicit selected operation/spec/SHA required');
    out[key] = args[++i];
  }
  if (!out.execute || !out['--spec'] || !out['--spec-sha256'] || !['validate-original', 'cache-controls', 'selected-lane', 'compare'].includes(out['--operation']) ||
      ('--lane' in out) !== (out['--operation'] === 'selected-lane') || '--lane' in out && !/^[0-3]$/.test(out['--lane'])) gateFail('Invalid selected-regression operation');
  return out;
}
function checkReady(spec, specRecord) {
  const ready = readPinnedJSON(join(spec.runRoot, 'prepared.json'));
  if (!exactKeys(ready, ['kind', 'version', 'specSha256', 'originalValidation']) || ready.kind !== 'model11-selected-regression-prepared' ||
      ready.version !== 1 || ready.specSha256 !== specRecord.sha256 || ready.originalValidation.path !== join(spec.runRoot, 'original-validation.json')) gateFail('Wrong selected preparation marker');
  eq(safeAbsoluteRecord(ready.originalValidation.path), ready.originalValidation, 'prepared original-validation bytes');
  return ready.originalValidation;
}
function prepared(spec, specRecord) {
  const record = checkReady(spec, specRecord), receipt = readPinnedJSON(record.path, record);
  if (!exactKeys(receipt, ['kind', 'version', 'specSha256', 'originalReport', 'originalBinding', 'originalResultHash', 'validatedOriginalTrials',
        'validatedOriginalCells', 'selectedTrials', 'completionEvents', 'uniqueFullProofs', 'originalCacheControls', 'newlyGeneratedReportTrials', 'selectionHash']) ||
      receipt.kind !== 'model11-original-full-evidence-for-selected-regression' || receipt.version !== 1 || receipt.specSha256 !== specRecord.sha256 ||
      receipt.selectedTrials !== 4999 || receipt.completionEvents !== 2125 || receipt.uniqueFullProofs !== 2048 || receipt.newlyGeneratedReportTrials !== 0) gateFail('Missing exact original validation');
  return { record, receipt };
}
async function validateOriginal(spec, specRecord, selection, assertUnchanged) {
  mkdirNew(spec.runRoot);
  const ctx = await loadSelectedOriginal(spec), { a, inputs, flop, later, binding, cells } = ctx;
  validateSelectedManifest(selection, inputs, binding.plan);
  const { bindingHash, ...expectedReport } = selection.originalReport;
  const report = readPinnedJSON(spec.original.report, expectedReport);
  const saved = a.validateCompletionRepresentativeReceipt(report, { operation: 'report', binding });
  if (bindingHash !== contentHash(binding)) gateFail('Selection original binding differs');
  const restored = a.produceModel11CompletionRepresentative(inputs, flop, later, binding, spec.original.evidence,
    { assertUnchanged: () => { ctx.assertUnchanged(); assertUnchanged(); }, requireExisting: true,
      onCell: (_, count) => console.log(JSON.stringify({ operation: 'validate-original', cell: count, freshTrials: 0 })) });
  eq(restored, saved, 'whole original report');
  const store = a.openCompletionRepresentativeEvidence(spec.original.evidence, binding), proofHashes = new Set(); let selected = 0, events = 0;
  for (const row of selection.rows) {
    const cell = store.read(store.cellName(row.cellIndex)); const wanted = new Set([0, 9999]); let eventTrials = 0;
    for (let boundary = 512; boundary < 10000; boundary += 512) { wanted.add(boundary - 1); wanted.add(boundary); }
    for (const ref of cell.chunks) {
      const chunk = store.read(ref.path, { path: ref.path, bytes: ref.bytes, sha256: ref.sha256 });
      for (const trial of chunk.trials) if (trial.completionDecisions.length) {
        wanted.add(trial.index); eventTrials++; events += trial.completionDecisions.length;
        for (const event of trial.completionDecisions) proofHashes.add(event.proofHash);
      }
    }
    eq([...wanted].sort((a, b) => a - b), row.trialIndices, 'exact original boundary/completion union');
    if (eventTrials !== row.completionTrials) gateFail('Original completion selection count differs'); selected += wanted.size;
  }
  if (selected !== 4999 || events !== 2125 || proofHashes.size !== 2048) gateFail('Required original selected/proof coverage differs');
  const controls = runSelectedCacheControls(a, inputs, flop, later, binding.plan, cells);
  const controlRecord = write(join(spec.runRoot, 'original-cache-controls.json'), { source: binding.source, executionCommit: spec.original.commit, controls });
  ctx.assertUnchanged(); assertUnchanged();
  const originalValidation = write(join(spec.runRoot, 'original-validation.json'), { kind: 'model11-original-full-evidence-for-selected-regression', version: 1,
    specSha256: specRecord.sha256, originalReport: expectedReport, originalBinding: binding, originalResultHash: contentHash(saved),
    validatedOriginalTrials: 720000, validatedOriginalCells: 72, selectedTrials: selected, completionEvents: events, uniqueFullProofs: proofHashes.size,
    originalCacheControls: controlRecord, newlyGeneratedReportTrials: 0, selectionHash: contentHash(selection) });
  write(join(spec.runRoot, 'prepared.json'), { kind: 'model11-selected-regression-prepared', version: 1, specSha256: specRecord.sha256, originalValidation });
}
function provenance(ctx, spec, specRecord, lane) {
  return { kind: 'model11-selected-regression-lane-origin', version: 1, specSha256: specRecord.sha256,
    executionCommit: ctx.commit, bindingHash: contentHash(ctx.binding), selectionSha256: spec.selection.sha256,
    lane, laneRoot: join(spec.runRoot, `lane-${lane}`), indices: indices(lane),
    startedAt: new Date().toISOString(), originalNumericalResultsConsumed: false };
}
function validateOrigin(saved, ctx, spec, specRecord, lane) {
  const { startedAt, ...body } = saved, { startedAt: now, ...expected } = provenance(ctx, spec, specRecord, lane);
  eq(body, expected, 'lane source/selection provenance'); if (!Number.isFinite(Date.parse(startedAt))) gateFail('Invalid selected lane start');
}
function readCompleted(ctx, spec, specRecord, origin, index) {
  const path = join(origin.laneRoot, `${String(index).padStart(3, '0')}.receipt.json`);
  if (!exists(path)) return null;
  const record = safeAbsoluteRecord(path), receipt = readPinnedJSON(path, record), row = ctx.selection.rows[index];
  if (!exactKeys(receipt, ['kind', 'version', 'index', 'specSha256', 'bindingHash', 'originHash', 'attempt', 'cellRecord', 'cellHash']) ||
      receipt.kind !== 'model11-selected-regression-cell-completion' || receipt.version !== 1 || receipt.index !== index || receipt.specSha256 !== specRecord.sha256 ||
      receipt.bindingHash !== contentHash(ctx.binding) || receipt.originHash !== contentHash(origin)) gateFail('Wrong selected fresh completion receipt');
  const root = join(dirname(receipt.attempt.path), 'evidence'), attempt = validateCellAttempt(root, index, receipt.attempt, origin);
  const store = openCompletionRepresentativeEvidence(root, ctx.binding), saved = store.read(store.cellName(index), receipt.cellRecord);
  if (receipt.cellRecord.path !== store.cellName(index) || contentHash(saved) !== receipt.cellHash) gateFail('Selected cell marker changed');
  validateSelectedCell(ctx.inputs, ctx.flop, ctx.later, ctx.binding, store, row, saved);
  const names = ['identity.json', store.cellName(index), ...saved.chunks.map(ref => ref.path), ...saved.proofs.map(ref => ref.path)];
  eq(readdirSync(store.dir).sort(), names.sort(), 'fresh selected store ownership');
  return { record, receipt, store, saved, attempt };
}
async function selectedLane(spec, specRecord, selection, source, lane, assertUnchanged) {
  // Readiness is a hash-only check: original numerical payloads never drive fresh play.
  checkReady(spec, specRecord);
  const ctx = { ...loadSelectedCandidate(spec, selection, source), selection, a: { openCompletionRepresentativeEvidence } };
  const laneRoot = join(spec.runRoot, `lane-${lane}`); let origin;
  if (exists(laneRoot)) { origin = readPinnedJSON(join(laneRoot, 'started.json')); validateOrigin(origin, ctx, spec, specRecord, lane); }
  else { mkdirNew(laneRoot); origin = provenance(ctx, spec, specRecord, lane); write(join(laneRoot, 'started.json'), origin); }
  const receipts = [];
  for (const index of indices(lane)) {
    assertUnchanged(); const prior = readCompleted(ctx, spec, specRecord, origin, index);
    if (prior) { receipts.push(prior.record); continue; }
    const attempt = beginFreshCellAttempt(ctx, laneRoot, index, origin), row = selection.rows[index];
    const saved = produceSelectedCell(ctx.inputs, ctx.flop, ctx.later, ctx.binding, attempt.store, index, row);
    validateSelectedCell(ctx.inputs, ctx.flop, ctx.later, ctx.binding, attempt.store, row, saved); assertUnchanged();
    const cellRecord = attempt.store.write(attempt.store.cellName(index), saved);
    receipts.push(write(join(laneRoot, `${String(index).padStart(3, '0')}.receipt.json`), { kind: 'model11-selected-regression-cell-completion', version: 1,
      index, specSha256: specRecord.sha256, bindingHash: contentHash(ctx.binding), originHash: contentHash(origin), attempt: attempt.attempt, cellRecord, cellHash: contentHash(saved) }));
    console.log(JSON.stringify({ operation: 'selected-lane', lane, index, selectedTrials: row.selected, advancedRngTrials: 10000 }));
  }
  assertUnchanged(); write(join(laneRoot, 'completed.json'), { kind: 'model11-selected-regression-lane-completion', version: 1,
    origin, cellReceipts: receipts, sourceIndices: indices(lane), selectedTrials: indices(lane).reduce((n, index) => n + selection.rows[index].selected, 0) });
}
function candidateControls(spec, specRecord, selection, source, assertUnchanged) {
  prepared(spec, specRecord);
  const ctx = loadSelectedCandidate(spec, selection, source);
  const controls = runSelectedCacheControls({ playModel11Hand, createModel11BehaviorCompletion }, ctx.inputs, ctx.flop, ctx.later, ctx.originalPlan, ctx.cells);
  assertUnchanged(); write(join(spec.runRoot, 'candidate-cache-controls.json'), { source, executionCommit: ctx.commit, controls });
}
function compare(spec, specRecord, selection, source, assertUnchanged) {
  const oldValidation = prepared(spec, specRecord), old = oldValidation.receipt;
  if (old.selectionHash !== contentHash(selection) || old.validatedOriginalTrials !== 720000 || old.validatedOriginalCells !== 72) gateFail('Wrong original validation coverage');
  const report = readPinnedJSON(spec.original.report, old.originalReport), saved = report.result;
  eq(contentHash(saved), old.originalResultHash, 'original validated report hash');
  assertCapturedSourceRecords(spec.original.root, old.originalBinding.source);
  eq(old.originalBinding.source, captureCompletionRepresentativeSource({ root: spec.original.root }), 'actual original source');
  const ctx = { ...loadSelectedCandidate(spec, selection, source), selection }, originalStore = openCompletionRepresentativeEvidence(spec.original.evidence, old.originalBinding);
  for (const key of ['sourceFingerprint', 'files', 'compositeExecution', 'behaviorPolicyIdentity', 'belief', 'artifactProvenance']) eq(old.originalBinding[key], ctx.binding[key], `cross-source ${key}`);
  const compared = new Map(), laneRecords = [];
  for (let lane = 0; lane < 4; lane++) {
    const root = join(spec.runRoot, `lane-${lane}`), path = join(root, 'completed.json'), laneRecord = safeAbsoluteRecord(path), completed = readPinnedJSON(path, laneRecord);
    const origin = readPinnedJSON(join(root, 'started.json')); validateOrigin(origin, ctx, spec, specRecord, lane);
    if (!exactKeys(completed, ['kind', 'version', 'origin', 'cellReceipts', 'sourceIndices', 'selectedTrials']) || completed.kind !== 'model11-selected-regression-lane-completion' ||
        completed.version !== 1 || !same(completed.origin, origin) || !same(completed.sourceIndices, indices(lane)) || completed.cellReceipts.length !== 18 ||
        completed.selectedTrials !== indices(lane).reduce((n, index) => n + selection.rows[index].selected, 0)) gateFail('Incomplete or wrongly attributed selected lane');
    const names = ['started.json', 'completed.json'];
    for (const [at, index] of indices(lane).entries()) {
      const fresh = readCompleted(ctx, spec, specRecord, origin, index);
      if (!fresh || compared.has(index)) gateFail('Missing/duplicate selected cell');
      eq(fresh.record, completed.cellReceipts[at], 'ordered lane cell receipt');
      compared.set(index, compareSelectedCell(originalStore, old.originalBinding, saved.cellRecords[index], fresh.store, ctx.binding, selection.rows[index], fresh.saved));
      names.push(`cell-${String(index).padStart(3, '0')}`, `${String(index).padStart(3, '0')}.receipt.json`);
    }
    validateLaneDirectory(root, names); laneRecords.push(laneRecord); assertUnchanged();
  }
  const rows = [...compared.values()].sort((a, b) => a.cellIndex - b.cellIndex), proofs = new Set(rows.flatMap(row => row.proofHashes));
  if (rows.length !== 72 || rows.some((row, index) => row.cellIndex !== index) || rows.reduce((n, row) => n + row.selectedTrials, 0) !== 4999 ||
      rows.reduce((n, row) => n + row.completionTrials, 0) !== 2125 || proofs.size !== 2048) gateFail('Incomplete targeted union coverage');
  const oldControls = readPinnedJSON(old.originalCacheControls.path, old.originalCacheControls), candidatePath = join(spec.runRoot, 'candidate-cache-controls.json');
  const candidateRecord = safeAbsoluteRecord(candidatePath), freshControls = readPinnedJSON(candidatePath, candidateRecord);
  eq(oldControls.source, old.originalBinding.source, 'original cache-control source'); eq(freshControls.source, source, 'candidate cache-control source');
  if (oldControls.executionCommit !== spec.original.commit || freshControls.executionCommit !== ctx.commit) gateFail('Wrong cache-control execution version');
  eq(oldControls.controls, freshControls.controls, 'both-source cold traces and purity controls');
  assertUnchanged(); assertCapturedSourceRecords(spec.original.root, old.originalBinding.source);
  for (const record of [oldValidation.record, old.originalCacheControls, candidateRecord, ...laneRecords]) eq(safeAbsoluteRecord(record.path), record, 'receipt unchanged at result boundary');
  const result = { kind: 'model11-selected4999-regression-evidence-not-full-gate', version: 1, status: 'targeted-regression-passed-not-full-replay',
    source, binding: ctx.binding, bindingHash: contentHash(ctx.binding), specRecord, originalValidation: oldValidation.record, originalReport: old.originalReport,
    originalQualityMetrics: { sourceCommit: spec.original.commit, bindingHash: saved.bindingHash, numericalHash: saved.numericalHash, counts: saved.counts, results: saved.results, warnings: saved.warnings },
    comparison: { selectedTrials: 4999, unselectedStrategyTrials: 715001, advancedRngTrials: 720000, cells: 72, completionEvents: 2125, fullProofBodies: 2048,
      scope: 'exact stored paired returns and every completion event/full law/full proof; no original ordinary-action trace comparison',
      numericalPayloadHash: contentHash(rows), cellsCompared: rows, sourceWrapperDifference: 'own binding hashes and derived immutable wrapper/file hashes only' },
    laneReceipts: laneRecords, cacheControls: { original: old.originalCacheControls, candidate: candidateRecord, totalControlHandExecutions: 32 },
    commonControlReferences: spec.commonControls, newEvEstimate: false, fullReplayPassed: false,
    acceptance: 'Targeted regression evidence only; legality, balance, reference sanity, all-board coverage and adoption review remain separate. No full-gate or statistical-confidence claim.' };
  write(join(spec.runRoot, 'selected-regression-result.json'), { result, resultHash: contentHash(result) });
  console.log(JSON.stringify({ status: result.status, selectedTrials: 4999, fullProofBodies: 2048, fullReplayPassed: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseSelectedArguments(process.argv.slice(2)), initial = loadSelectedSpec(resolve(args['--spec']), args['--spec-sha256']);
    const { spec, specRecord, selection, source } = initial;
    const assertUnchanged = () => { const current = loadSelectedSpec(specRecord.path, specRecord.sha256); eq(current.source, source, 'source during execution'); };
    if (args['--operation'] === 'validate-original') await validateOriginal(spec, specRecord, selection, assertUnchanged);
    else if (args['--operation'] === 'selected-lane') await selectedLane(spec, specRecord, selection, source, Number(args['--lane']), assertUnchanged);
    else if (args['--operation'] === 'cache-controls') candidateControls(spec, specRecord, selection, source, assertUnchanged);
    else compare(spec, specRecord, selection, source, assertUnchanged);
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
