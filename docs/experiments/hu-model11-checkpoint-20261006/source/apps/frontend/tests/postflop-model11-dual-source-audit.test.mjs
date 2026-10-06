// Bounded comparator/attribution contracts only. The preserved96 fixture is not
// relabeled as fresh evidence, and these tests do not claim a full numerical gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { compareDualSourceCell, validateDualSourceBindingPair, validateDualSourceReport, compareDualSourceReports,
  SOURCE_WRAPPER_ALLOWLIST, ORIGINAL_COMMIT, REVIEWED_MEMO_COMMIT } from '../scripts/postflop-ai/model11-dual-source-contract.mjs';
import { parseDualSourceArguments, validateFixedLaneReceipt, validateFullFreshCoverage, validateFreshStore, importFreshCell,
  readCompletedFreshCell, beginFreshCellAttempt, indicesForLane } from '../scripts/postflop-ai/evaluate-model11-dual-source-audit.mjs';
import { validateLaneDirectory, validateAttemptCompletionTime, validateFinalDualSourceReceipt } from '../scripts/postflop-ai/evaluate-model11-dual-source-audit.mjs';
import { assertCapturedSourceRecords, safeAbsoluteRecord, readPinnedJSON, assertPinnedRepository, captureDualSourceGraph,
  validateDualSourceSpecShape } from '../scripts/postflop-ai/model11-dual-source-runtime.mjs';
import { auditFileRecord } from '../scripts/postflop-ai/audit-identity.mjs';
import { openCompletionRepresentativeEvidence } from '../scripts/postflop-ai/model11-completion-representative-store.mjs';
import { writeImmutableAllBoardOutput } from '../scripts/postflop-ai/all-board-checkpoints.mjs';
import { validateCompletionRepresentativeCell } from '../scripts/postflop-ai/model11-completion-representative.mjs';
import { completionCellAccumulator, accountCompletionRepresentativeTrial, completionRepresentativeCellSummary,
  rehydrateCompletionDecision } from '../scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model11-dual-source-full-proof96.json', import.meta.url)));
function memoryStore(side) {
  const files = side.files;
  const record = path => {
    assert.ok(path in files, `Missing fixture file ${path}`);
    const bytes = Buffer.from(JSON.stringify(files[path]) + '\n');
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  return { cellName: i => `${String(i).padStart(3, '0')}.cell.json`, record,
    read(path, expected) { if (expected) assert.deepEqual(record(path), expected); return files[path]; },
    readProof: hash => files[`${hash}.proof.json`].proof };
}
function fixturePair() {
  const a = structuredClone(fixture.sides.original), b = structuredClone(fixture.sides.memo7911);
  return { a, b, as: memoryStore(a), bs: memoryStore(b) };
}
const cellRecord = (store, index) => ({ ...store.record(store.cellName(index)), numericalHash: contentHash(store.read(store.cellName(index))) });
function compare(pair, index) {
  return compareDualSourceCell(pair.as, pair.bs, pair.a.binding, pair.b.binding, index, cellRecord(pair.as, index), cellRecord(pair.bs, index));
}
function refreshCellReferences(side, store, index) {
  const cell = side.files[store.cellName(index)];
  cell.chunks = cell.chunks.map(ref => ({ ...ref, ...store.record(ref.path), trialHash: contentHash(side.files[ref.path].trials) }));
  cell.proofs = cell.proofs.map(ref => store.record(ref.path));
}
test('preserved original/memo96 compares every paired return/event and the complete 84-row proof', () => {
  const pair = fixturePair();
  assert.notEqual(pair.a.bindingHash, pair.b.bindingHash);
  assert.equal(pair.a.resultPayloadSha256, pair.b.resultPayloadSha256);
  const cells = Array.from({ length: 6 }, (_, i) => compare(pair, i));
  assert.equal(cells.reduce((n, c) => n + c.trials, 0), 96);
  assert.equal(cells.reduce((n, c) => n + c.proofBodies, 0), 1);
  const proofs = Object.values(pair.a.files).filter(value => value.proof);
  assert.equal(proofs.length, 1); assert.equal(proofs[0].proof.rows.length, 84);
  for (const side of [pair.a, pair.b]) {
    const store = memoryStore(side);
    for (const saved of side.savedCells) assert.deepEqual(store.record(saved.record.path), saved.record);
  }
});
test('source comparison rejects omissions, reordering, changed returns/events and extra wrapper fields', () => {
  for (const mutate of [
    (p, cell, chunk) => chunk.trials.pop(),
    (p, cell, chunk) => chunk.trials.reverse(),
    (p, cell, chunk) => chunk.trials[0].candidateReturn += 1,
    (p, cell, chunk) => chunk.trials.find(t => t.completionDecisions.length).completionDecisions[0].random += 0.001,
    (p, cell) => cell.chunks.pop(),
    (p, cell) => cell.proofs.pop(),
    (p, cell) => cell.bindingHash = p.a.bindingHash,
    (p, cell) => cell.unlistedSourceWrapper = 'not-allowed',
    (p, cell, chunk) => chunk.unlistedSourceWrapper = 'not-allowed',
  ]) {
    const pair = fixturePair(), cell = pair.b.files['003.cell.json'], chunk = pair.b.files[cell.chunks[0].path];
    mutate(pair, cell, chunk); refreshCellReferences(pair.b, pair.bs, 3);
    assert.throws(() => compare(pair, 3));
  }
});
test('full-proof row tampering and wrong proof attribution fail even with refreshed file references', () => {
  for (const mutate of [
    envelope => envelope.proof.rows.pop(),
    envelope => envelope.proof.rows.reverse(),
    envelope => envelope.proof.rows[0].unlisted = 1,
    (envelope, pair) => envelope.bindingHash = pair.a.bindingHash,
    envelope => envelope.unlistedSourceWrapper = 'not-allowed',
  ]) {
    const pair = fixturePair(), cell = pair.b.files['003.cell.json'];
    mutate(pair.b.files[cell.proofs[0].path], pair); refreshCellReferences(pair.b, pair.bs, 3);
    assert.throws(() => compare(pair, 3));
  }
});
test('allowlist does not silently discard an unknown wrapper field present on both sides', () => {
  const pair = fixturePair();
  for (const [side, store] of [[pair.a, pair.as], [pair.b, pair.bs]]) {
    const cell = side.files['003.cell.json']; side.files[cell.proofs[0].path].sourceNote = 'same-on-both-sides';
    refreshCellReferences(side, store, 3);
  }
  assert.throws(() => compare(pair, 3));
  assert.equal(SOURCE_WRAPPER_ALLOWLIST.some(path => path.includes('proof.rows') || path.includes('trials')), false);
});
function unitBinding(sourceId) {
  const plan = { fixtureOnly: true }, files = {}, source = { strictBalance: { fixtureSource: sourceId } };
  return { kind: 'model11-strict-balance-composite-behavior-representative-binding', version: 1, spot: 'unit', sourceFingerprint: 'fixed', source, files, plan, planIdentity: contentHash(plan),
    strictBalance: { kind: 'model11-numerical-gate-binding', version: 1, spot: 'unit', sourceFingerprint: 'fixed', source: source.strictBalance,
      files, execution: {}, belief: {}, artifactProvenance: {}, plan, planIdentity: contentHash(plan) }, compositeExecution: {}, behaviorPolicyIdentity: 'fixed', belief: {}, artifactProvenance: {} };
}
function unitReport(binding) {
  const cellRecords = [{ path: '000.cell.json', bytes: 10, sha256: 'a'.repeat(64), numericalHash: 'b'.repeat(64) }], counts = { fixtureOnly: true }, results = [{}];
  return { kind: 'model11-composite-behavior-representative-for-independent-replay', version: 1, binding, bindingHash: contentHash(binding),
    status: 'unit', acceptance: 'unit', cellRecords, counts, results, numericalHash: contentHash({ cellRecords, counts, results }), warnings: [] };
}
test('binding/report contracts permit only enumerated source wrappers and keep every count/warning', () => {
  const a = unitBinding('original'), b = unitBinding('fresh');
  validateDualSourceBindingPair(a, b);
  for (const mutate of [x => x.unlisted = 1, x => x.strictBalance.unlisted = 1, x => x.plan.fixtureOnly = false, x => x.files.unlisted = 1]) {
    const wrong = structuredClone(b); mutate(wrong); assert.throws(() => validateDualSourceBindingPair(a, wrong));
  }
  const ra = unitReport(a), rb = unitReport(b), cells = [{ index: 0, numericalPayloadHash: 'c'.repeat(64), trials: 1, proofBodies: 0 }];
  assert.equal(typeof compareDualSourceReports(ra, rb, cells), 'string');
  for (const mutate of [r => r.cellRecords.pop(), r => r.cellRecords[0].path = '001.cell.json', r => r.unlisted = 1,
    r => r.warnings.push('changed'), r => r.counts.fixtureOnly = false]) {
    const wrong = structuredClone(rb); mutate(wrong);
    assert.throws(() => compareDualSourceReports(ra, wrong, cells));
  }
  assert.throws(() => validateDualSourceReport({ ...rb, bindingHash: ra.bindingHash }, b, 1));
});
test('fixed four-lane operations require explicit full opt-in and reject general scheduling options', () => {
  const args = ['--operation', 'fresh-lane', '--spec', '/unit/spec.json', '--spec-sha256', 'a'.repeat(64), '--execute-full', '--lane', '0'];
  assert.equal(parseDualSourceArguments(args)['--lane'], '0');
  for (const wrong of [args.filter(x => x !== '--execute-full'), [...args, '--workers', '8'], [...args, '--lane', '1'], args.slice(0, -1).concat('4'),
    args.map(x => x === 'fresh-lane' ? 'report' : x), args.slice(0, -2)]) assert.throws(() => parseDualSourceArguments(wrong));
});

const temp = name => mkdtempSync(join(tmpdir(), `hu-dual-${name}-`));
const persist = (path, value) => { writeImmutableAllBoardOutput(path, JSON.stringify(value, null, 2) + '\n'); return safeAbsoluteRecord(path); };
function laneFixture(laneRoot = '/unit/lane-3') {
  const binding = fixture.sides.memo7911.binding, lane = 3, runner = { fixtureOnly: true }, executionCommit = 'd'.repeat(40);
  const node = { version: process.version, execArgv: ['--max-old-space-size=512'] }, specSha256 = 'e'.repeat(64);
  const provenance = { specSha256, originalCommit: ORIGINAL_COMMIT, reviewedMemoCommit: REVIEWED_MEMO_COMMIT, executionCommit,
    bindingHash: contentHash(binding), runner, lane, laneRoot, indices: indicesForLane(lane), command: ['node', 'test-fixture', 'fresh-lane'],
    node: node.version, execArgv: node.execArgv, startedAt: '2026-01-02T00:00:00.000Z', freshStoresRequired: true, originalNumericalResultsConsumed: false };
  const expected = { specSha256, executionCommit, binding, runner, lane, node, laneRoot, originalCompletedAt: '2026-01-01T00:00:00.000Z' };
  const completed = { kind: 'model11-dual-source-fixed-lane-completion', version: 1, provenance,
    completedAt: '2026-01-03T00:00:00.000Z', completions: indicesForLane(lane).map(index => ({ path: join(laneRoot, `${String(index).padStart(3, '0')}.receipt.json`), bytes: 1, sha256: 'f'.repeat(64) })) };
  return { binding, provenance, expected, completed };
}
test('real phase admission rejects missing/duplicate/reordered18 and incomplete/duplicate full72 coverage', () => {
  const f = laneFixture(); validateFixedLaneReceipt(f.completed, f.provenance, f.expected);
  for (const mutate of [x => x.completions.pop(), x => x.completions.reverse(), x => x.completions[0] = x.completions[1],
    x => x.completions[0].path = '/another-run/003.receipt.json', x => x.unlisted = 1, x => x.completedAt = '2025-01-01T00:00:00Z']) {
    const wrong = structuredClone(f.completed); mutate(wrong); assert.throws(() => validateFixedLaneReceipt(wrong, f.provenance, f.expected));
  }
  for (const key of ['specSha256', 'executionCommit', 'bindingHash', 'laneRoot', 'runner', 'startedAt']) {
    const provenance = structuredClone(f.provenance); provenance[key] = 'wrong';
    assert.throws(() => validateFixedLaneReceipt({ ...f.completed, provenance }, provenance, f.expected));
  }
  const rows = Array.from({ length: 72 }, (_, index) => ({ index })); validateFullFreshCoverage(rows);
  for (const wrong of [rows.slice(1), [...rows, rows[0]], rows.map((row, i) => i === 71 ? rows[0] : row), rows.map((row, i) => i === 71 ? { index: 72 } : row)]) assert.throws(() => validateFullFreshCoverage(wrong));
});
test('bounded immutable reads and source pins detect changed ignored raw input and wrong source side', () => {
  const root = temp('pins'), path = join(root, 'record.json'); const record = persist(path, { value: 1 });
  assert.deepEqual(readPinnedJSON(path, record), { value: 1 });
  assert.throws(() => writeImmutableAllBoardOutput(path, '{"value":2}\n'));
  writeFileSync(path, '{"value":2}\n'); assert.throws(() => readPinnedJSON(path, record));
  const link = join(root, 'linked.json'); symlinkSync(path, link); assert.throws(() => readPinnedJSON(link));
  const raw = Array.from({ length: 12 }, (_, i) => {
    const name = `raw-${i}.json`; writeFileSync(join(root, name), JSON.stringify({ raw: i })); return auditFileRecord(root, name);
  });
  const inventory = auditFileRecord(root, 'record.json');
  const source = { strictBalance: { inventory, sources: [inventory], inputs: raw }, compositeBehavior: { inventory, sources: [inventory] }, inputs: raw };
  assertCapturedSourceRecords(root, source);
  writeFileSync(join(root, 'raw-11.json'), '{"ignored":"drift"}'); assert.throws(() => assertCapturedSourceRecords(root, source));
  const other = temp('other-side'); assert.throws(() => assertCapturedSourceRecords(other, source));
});
test('actual final source graph/commit is admitted and specs reject unrelated, unsafe or non-final versions', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url)), head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assertPinnedRepository(root, head, 'optimized'); assert.equal(captureDualSourceGraph().sources.length, 55);
  assert.throws(() => assertPinnedRepository(root, REVIEWED_MEMO_COMMIT, 'optimized'));
  assert.throws(() => assertPinnedRepository(root, head, 'original'));
  const spec = { kind: 'model11-reviewed-original-to-memo-audit-spec', version: 1,
    original: { root: '/old', commit: ORIGINAL_COMMIT, report: '/old/report.json', evidence: '/old/evidence' },
    optimized: { root, executionCommit: head }, inputs: { spot: 'unit', files: { flop: 'a.json', later: 'b.json', plan: 'c.json' } },
    runRoot: '/fresh', node: { version: process.version, binary: { bytes: 1, sha256: 'a'.repeat(64) }, execArgv: ['--max-old-space-size=512'] },
    equivalence: { fullProof96: '/proof.tar.gz', independentReview: '/review.tar.gz' } };
  validateDualSourceSpecShape(spec);
  for (const mutate of [x => x.unlisted = 1, x => x.inputs.files.plan = '../escape', x => x.runRoot = '/old/evidence/nested',
    x => x.optimized.executionCommit = REVIEWED_MEMO_COMMIT, x => x.original.commit = head, x => x.node.execArgv = []]) {
    const wrong = structuredClone(spec); mutate(wrong); assert.throws(() => validateDualSourceSpecShape(wrong));
  }
});
let phaseInputs;
function phaseContext() {
  phaseInputs ??= loadInputs('BTN_open_SB_3bet_BB_call_BTN_fold');
  return { a: { openCompletionRepresentativeEvidence, validateCompletionRepresentativeCell }, inputs: phaseInputs,
    flop: fixture.policyInputs.flop, later: fixture.policyInputs.later, binding: fixture.sides.memo7911.binding,
    cells: fixture.sides.memo7911.savedCells.map(row => row.saved.cell), commit: 'd'.repeat(40) };
}
function writeFixtureCell(attempt, side = fixture.sides.memo7911, index = 3, marker = true) {
  const saved = side.files[attempt.store.cellName(index)];
  for (const ref of [...saved.proofs, ...saved.chunks]) attempt.store.write(ref.path, side.files[ref.path]);
  if (marker) attempt.store.write(attempt.store.cellName(index), saved);
  return saved;
}
function fixtureCompletion(attempt, saved, provenance, index = 3) {
  return { kind: 'model11-dual-source-newly-computed-cell', version: 1, index, cell: saved.cell, bindingHash: saved.bindingHash,
    provenanceHash: contentHash(provenance), newlyComputedTrials: saved.cell.samples, provedUnreachableTrials: 0, numericalHash: contentHash(saved),
    evidence: [...saved.proofs, ...saved.chunks.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), attempt.store.record(attempt.store.cellName(index))], attempt: attempt.attempt };
}
test('partial chunk/marker attempts never count; exact completed fixture receipts are semantically revalidated on resume', () => {
  // This deliberately materializes preserved diagnostic fixtures, not a full-run
  // production claim. The real unchanged semantic cell validator is exercised.
  const laneRoot = join(temp('resume'), 'lane-3'); mkdirSync(laneRoot);
  const ctx = phaseContext(), { provenance } = laneFixture(laneRoot);
  const afterChunk = beginFreshCellAttempt(ctx, laneRoot, 3, provenance); writeFixtureCell(afterChunk, undefined, 3, false);
  assert.equal(readCompletedFreshCell(ctx, laneRoot, 3, provenance), null);
  assert.throws(() => openCompletionRepresentativeEvidence(afterChunk.root, ctx.binding, { fresh: true }));
  const afterMarker = beginFreshCellAttempt(ctx, laneRoot, 3, provenance); writeFixtureCell(afterMarker);
  assert.notEqual(afterMarker.root, afterChunk.root); assert.equal(readCompletedFreshCell(ctx, laneRoot, 3, provenance), null);
  const complete = beginFreshCellAttempt(ctx, laneRoot, 3, provenance), saved = writeFixtureCell(complete);
  const receipt = fixtureCompletion(complete, saved, provenance); persist(join(laneRoot, '003.receipt.json'), receipt);
  assert.equal(readCompletedFreshCell(ctx, laneRoot, 3, provenance).root, complete.root);
  for (const mutate of [x => x.attempt = afterMarker.attempt, x => x.bindingHash = 'wrong', x => x.provenanceHash = 'wrong', x => x.newlyComputedTrials++]) {
    const wrong = structuredClone(receipt); mutate(wrong); assert.throws(() => validateFreshStore(ctx, complete.root, 3, wrong, provenance));
  }
  assert.throws(() => validateFreshStore(ctx, complete.root, 3, receipt, { ...provenance, specSha256: 'wrong-run' }));
});
test('partial and fully written finalizer imports safely reuse only exact newly admitted bytes', () => {
  const laneRoot = join(temp('import'), 'lane-3'); mkdirSync(laneRoot);
  const ctx = phaseContext(), { provenance } = laneFixture(laneRoot), attempt = beginFreshCellAttempt(ctx, laneRoot, 3, provenance);
  const saved = writeFixtureCell(attempt), receipt = fixtureCompletion(attempt, saved, provenance);
  const target = openCompletionRepresentativeEvidence(join(temp('aggregate'), 'evidence'), ctx.binding, { fresh: true });
  let writes = 0;
  const interrupted = { ...target, write(path, value) { const result = target.write(path, value); if (++writes === 1) throw new Error('injected interruption after first immutable part'); return result; } };
  assert.throws(() => importFreshCell(ctx, interrupted, attempt.root, 3, receipt, provenance));
  assert.equal(target.hasCell(3), false);
  importFreshCell(ctx, target, attempt.root, 3, receipt, provenance);
  // Simulate all imports completed but the outer final receipt not yet written.
  importFreshCell(ctx, target, attempt.root, 3, receipt, provenance);
  for (const ref of receipt.evidence) assert.deepEqual(target.record(ref.path), ref);
  const ref = saved.chunks[0]; writeFileSync(join(target.dir, ref.path), '{"tampered":true}\n');
  assert.throws(() => importFreshCell(ctx, target, attempt.root, 3, receipt, provenance));
});
test('fully refreshed numeric and full-proof hashes cannot disguise changed persisted evidence', () => {
  const pair = fixturePair(), changed = pair.b.files['003.cell.json'], chunk = pair.b.files[changed.chunks[0].path];
  chunk.trials[0].candidateReturn += 1;
  const acc = completionCellAccumulator(); chunk.trials.forEach((trial, index) => accountCompletionRepresentativeTrial(acc, trial, index, changed.cell.samples));
  changed.row = completionRepresentativeCellSummary(changed.cell, acc); refreshCellReferences(pair.b, pair.bs, 3);
  assert.throws(() => compare(pair, 3));
  const proofPair = fixturePair(), cell = proofPair.b.files['003.cell.json'], proofPath = cell.proofs[0].path;
  const envelope = proofPair.b.files[proofPath], oldHash = envelope.proof.proofHash; envelope.proof.rows.pop();
  const { proofHash, ...body } = envelope.proof; const newHash = contentHash(body); envelope.proof.proofHash = newHash;
  const replacement = `${newHash}.proof.json`; delete proofPair.b.files[proofPath]; proofPair.b.files[replacement] = envelope;
  const part = proofPair.b.files[cell.chunks[0].path];
  for (const trial of part.trials) for (const event of trial.completionDecisions) {
    const replace = value => typeof value === 'string' ? value === oldHash ? newHash : value : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value;
    Object.assign(event, replace(event)); event.lawHash = contentHash(rehydrateCompletionDecision(event, envelope.proof));
  }
  cell.proofs = [proofPair.bs.record(replacement)]; refreshCellReferences(proofPair.b, proofPair.bs, 3);
  assert.throws(() => compare(proofPair, 3));
  const laneRoot = join(temp('rehashed-proof'), 'lane-3'); mkdirSync(laneRoot);
  const ctx = phaseContext(), { provenance } = laneFixture(laneRoot), attempt = beginFreshCellAttempt(ctx, laneRoot, 3, provenance);
  const saved = writeFixtureCell(attempt, proofPair.b), receipt = fixtureCompletion(attempt, saved, provenance);
  assert.throws(() => validateFreshStore(ctx, attempt.root, 3, receipt, provenance));
});
test('post-link/pre-unlink writer temporaries are preserved as non-evidence and cannot fill missing receipts', () => {
  const names = ['started.json', 'completed.json', '003.receipt.json'], uuid = '01234567-89ab-4cde-8fab-0123456789ab';
  const root = temp('orphan-temp'); for (const name of names) persist(join(root, name), { fixtureOnly: name });
  for (const name of names) writeFileSync(join(root, `${name}.${uuid}.tmp`), 'unparsed partial or linked bytes');
  validateLaneDirectory(root, names);
  // Recognition never deletes or reads these bytes as evidence.
  for (const name of names) assert.equal(readFileSync(join(root, `${name}.${uuid}.tmp`), 'utf8'), 'unparsed partial or linked bytes');
  const missing = temp('missing-canonical'); writeFileSync(join(missing, `003.receipt.json.${uuid}.tmp`), '{}');
  assert.throws(() => validateLaneDirectory(missing, ['003.receipt.json']));
  for (const [name, type] of [[`004.receipt.json.${uuid}.tmp`, 'file'], ['003.receipt.json.arbitrary.tmp', 'file'], [`started.json.${uuid}.tmp`, 'symlink'], [`completed.json.${uuid}.tmp`, 'directory']]) {
    const bad = temp('unowned-temp'); for (const canonical of names) persist(join(bad, canonical), {});
    if (type === 'symlink') symlinkSync(join(bad, 'started.json'), join(bad, name));
    else if (type === 'directory') mkdirSync(join(bad, name)); else writeFileSync(join(bad, name), '{}');
    assert.throws(() => validateLaneDirectory(bad, names));
  }
});
test('lane completion cannot predate any admitted cell attempt', () => {
  validateAttemptCompletionTime({ startedAt: '2026-01-02T00:00:00Z' }, '2026-01-03T00:00:00Z');
  assert.throws(() => validateAttemptCompletionTime({ startedAt: '2026-01-04T00:00:00Z' }, '2026-01-03T00:00:00Z'));
  assert.throws(() => validateAttemptCompletionTime({ startedAt: 'invalid' }, '2026-01-03T00:00:00Z'));
});
test('new and reused final receipts require pinned runtime and actual finish invocation metadata', () => {
  const specRecord = { path: '/unit/spec.json', bytes: 1, sha256: 'a'.repeat(64) }, executionCommit = 'b'.repeat(40), runner = { fixtureOnly: true }, result = { fixtureOnly: true };
  const node = { version: process.version, execArgv: ['--max-old-space-size=512'] };
  const prior = { kind: 'model11-dual-source-completion-representative-execution-receipt', version: 1, specRecord,
    originalExecutionCommit: ORIGINAL_COMMIT, executionCommit, runner, completedAt: '2026-01-03T00:00:00Z',
    command: [process.execPath, fileURLToPath(new URL('../scripts/postflop-ai/evaluate-model11-dual-source-audit.mjs', import.meta.url)),
      '--operation', 'finish', '--spec', specRecord.path, '--spec-sha256', specRecord.sha256, '--execute-full'],
    execution: { node: node.version, platform: process.platform, arch: process.arch, execArgv: node.execArgv }, exitCode: 0, result, resultHash: contentHash(result) };
  const expected = { specRecord, executionCommit, runner, exitCode: 0, result, node }; validateFinalDualSourceReceipt(prior, expected);
  for (const mutate of [x => x.execution.node = 'wrong', x => x.execution.execArgv = [], x => x.execution.unlisted = 1,
    x => x.command[0] = 'wrong-node', x => x.command[1] = '/wrong-entry.mjs', x => x.command[3] = 'prepare',
    x => x.command[5] = '/different-spec.json', x => x.command[7] = 'c'.repeat(64)]) {
    const wrong = structuredClone(prior); mutate(wrong); assert.throws(() => validateFinalDualSourceReceipt(wrong, expected));
  }
});
