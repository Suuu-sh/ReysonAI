// Fixed pilot1755 assignment, immutable evidence and sequential finalization only.
// Numerical generation/validation/aggregation and the 47 codec stay unchanged.
import { readFileSync, lstatSync, mkdirSync, readdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, basename, resolve, join, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph } from './audit-identity.mjs';
import { loadInputs } from './inputs.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { gateFail, same, exactKeys, resolveModel11GatePlan } from './model11-gate-contract.mjs';
import { captureModel11GateSource } from './model11-gate-source.mjs';
import { model11GateBinding, validateModel11BoardRow, runModel11AllBoards } from './model11-gate-drivers.mjs';
import { openBoardCheckpoints, writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { captureModel11AllBoardOutputSource } from './evaluate-model11-allboard-partitioned.mjs';
import { model11CheckpointIdentityHash, partitionModel11AllBoardReceipt, materializeModel11AllBoardReceipt, consumeModel11AllBoardReceipt } from './model11-allboard-partitioned-output.mjs';
import { validateModel11GateReceipt } from './evaluate-model11-audit.mjs';
import { openPilot1755ProofAdapter, persistPilot1755Board } from './model11-allboard-lane-proof.mjs';

export const PILOT1755_SPOT = 'BTN_open_SB_3bet_BB_call_BTN_fold';
export const PILOT1755_BASE = 'c8d2c8bab4eb1db886f5055e8e6396a70921dc69';
export const PILOT1755_ROOTS = ['apps/frontend/scripts/postflop-ai/evaluate-model11-allboard-lanes.mjs'];
export const PILOT1755_MANIFEST = 'apps/frontend/tests/fixtures/model11-allboard-lanes-source-graph.json';
export const PILOT1755_INTEGRATION = 'apps/frontend/tests/fixtures/model11-allboard-lanes-integration.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';
const git = args => execFileSync('git', args, { cwd: AUDIT_REPOSITORY, encoding: 'utf8' }).trim();
export function pilot1755Indices(lane) {
  if (!Number.isInteger(lane) || lane < 0 || lane > 3) gateFail('Only fixed lanes0,1,2,3 exist');
  return Array.from({ length: lane === 3 ? 438 : 439 }, (_, offset) => lane + 4 * offset);
}
function safeDirectory(path, { create = false, exclusive = false } = {}) {
  if (!isAbsolute(path)) gateFail('Absolute pilot evidence directory required');
  const chain = [];
  for (let current = resolve(path);; current = dirname(current)) { chain.push(current); if (current === dirname(current)) break; }
  for (const current of chain.reverse()) {
    let stat;
    try { stat = lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) gateFail('Unsafe pilot directory');
    if (!stat && !create) gateFail('Missing pilot evidence directory');
  }
  if (exclusive) mkdirSync(path);
  else if (create) mkdirSync(path, { recursive: true });
}
export function pilotFile(path, limit = 16 * 1024 * 1024) {
  if (!isAbsolute(path)) gateFail('Absolute pinned pilot file required');
  safeDirectory(dirname(path));
  const record = auditFileRecord(dirname(path), basename(path));
  if (record.bytes > limit) gateFail('Pilot file exceeds fixed byte bound');
  return { ...record, path: resolve(path) };
}
function pinnedBytes(path, expected = null, limit) {
  const before = pilotFile(path, limit), bytes = readFileSync(path);
  if (expected && !same(before, expected) || hash(bytes) !== before.sha256 || !same(before, pilotFile(path, limit))) gateFail('Pilot evidence changed during read');
  return bytes;
}
export const pilotJSON = (path, expected = null) => JSON.parse(pinnedBytes(path, expected).toString('utf8'));
const immutableJSON = (path, value) => writeImmutableAllBoardOutput(path, jsonBytes(value));
const requireAbsent = path => { try { lstatSync(path); gateFail('Pilot destination exists; preserve it and choose a fresh path'); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
export function capturePilot1755Source() {
  const root = resolve(AUDIT_REPOSITORY), strict = captureModel11GateSource(), output = captureModel11AllBoardOutputSource();
  const inventory = auditFileRecord(root, PILOT1755_MANIFEST), sources = captureSourceGraph({ roots: PILOT1755_ROOTS });
  if (!same(pilotJSON(join(root, PILOT1755_MANIFEST)), { kind: 'model11-pilot1755-closed-wrapper-inventory', version: 1, roots: PILOT1755_ROOTS, sources })) gateFail('Pilot wrapper differs from reviewed closed graph');
  const integration = pilotJSON(join(root, PILOT1755_INTEGRATION));
  if (integration.kind !== 'model11-pilot1755-integration' || integration.version !== 1 || integration.baseCommit !== PILOT1755_BASE || integration.codecCommit !== '47a1394a59829934d00d25e6673c9f4877980e64') gateFail('Wrong integrated numerical/codec lineage');
  for (const record of [...integration.core, ...integration.copied47, ...integration.controller]) if (!same(auditFileRecord(root, record.path), record)) gateFail('Frozen core/codec/controller integration bytes changed');
  const body = { kind: 'model11-pilot1755-execution-source', version: 1, strict, output,
    wrapper: { inventory, roots: PILOT1755_ROOTS, sources }, integration: { inventory: auditFileRecord(root, PILOT1755_INTEGRATION), ...integration } };
  return { ...body, identityHash: contentHash(body) };
}
export function loadPilot1755Context(specPath, specSha256) {
  const specRecord = pilotFile(specPath);
  if (!/^[a-f0-9]{64}$/.test(specSha256 ?? '') || specRecord.sha256 !== specSha256) gateFail('Exact reviewed pilot spec SHA required');
  const spec = pilotJSON(specPath, specRecord);
  if (!exactKeys(spec, ['kind', 'version', 'repository', 'inputs', 'runRoot', 'node', 'windowSeconds', 'source']) || spec.kind !== 'model11-pilot1755-fixed-lanes-spec' || spec.version !== 1 ||
      !exactKeys(spec.repository, ['root', 'executionCommit']) || resolve(spec.repository.root) !== resolve(AUDIT_REPOSITORY) || !/^[a-f0-9]{40}$/.test(spec.repository.executionCommit) ||
      !exactKeys(spec.inputs, ['spot', 'files']) || spec.inputs.spot !== PILOT1755_SPOT || !exactKeys(spec.inputs.files, ['flop', 'later', 'plan']) ||
      !isAbsolute(spec.runRoot) || !Number.isSafeInteger(spec.windowSeconds) || spec.windowSeconds < 1 || !exactKeys(spec.source, ['identityHash']) ||
      !exactKeys(spec.node, ['path', 'version', 'binary', 'execArgv']) || !exactKeys(spec.node.binary, ['bytes', 'sha256']) || !isAbsolute(spec.node.path) ||
      !same(spec.node.execArgv, ['--max-old-space-size=512']) || !same(process.execArgv, spec.node.execArgv) || process.version !== spec.node.version || resolve(process.execPath) !== resolve(spec.node.path)) gateFail('Malformed fixed pilot source/runtime/window specification');
  const node = pilotFile(spec.node.path, 256 * 1024 * 1024);
  if (!same({ bytes: node.bytes, sha256: node.sha256 }, spec.node.binary)) gateFail('Pinned Node binary changed');
  const runRoot = resolve(spec.runRoot), repository = resolve(AUDIT_REPOSITORY);
  if (runRoot === repository || runRoot.startsWith(repository + '/') || repository.startsWith(runRoot + '/')) gateFail('Pilot evidence must be outside its preserved source repository');
  const source = capturePilot1755Source();
  if (source.identityHash !== spec.source.identityHash) gateFail('Reviewed integrated pilot identity changed');
  const captureFiles = () => Object.fromEntries(Object.entries(spec.inputs.files).map(([key, record]) => {
    if (!exactKeys(record, ['path', 'bytes', 'sha256']) || !same(auditFileRecord(repository, record.path), record)) gateFail('Exact pilot artifact/plan bytes changed');
    return [key, record];
  }));
  const files = captureFiles(), inputs = loadInputs(PILOT1755_SPOT);
  const flop = pilotJSON(join(repository, files.flop.path)), later = pilotJSON(join(repository, files.later.path));
  const plan = resolveModel11GatePlan(inputs, pilotJSON(join(repository, files.plan.path)), { executeFull: true });
  if (plan.kind !== 'all-boards' || plan.scope !== 'full' || plan.street !== 'all' || plan.boardList.length !== 1755) gateFail('Only the original full1755 all-street plan is admitted');
  const binding = model11GateBinding(inputs, flop, later, plan, source, files), bindingHash = contentHash(binding);
  const assertUnchanged = () => {
    if (git(['rev-parse', 'HEAD']) !== spec.repository.executionCommit || git(['status', '--porcelain', '--untracked-files=no']) ||
        !same(pilotFile(specPath), specRecord) || !same(pilotFile(spec.node.path, 256 * 1024 * 1024), node) || !same(capturePilot1755Source(), source) || !same(captureFiles(), files) || loadInputs(PILOT1755_SPOT).fingerprint !== inputs.fingerprint) gateFail('Pilot source/commit/input/policy/full-plan/spec changed');
  };
  assertUnchanged();
  return { spec, specRecord, source, files, inputs, flop, later, binding, bindingHash, assertUnchanged,
    checkpointIdentityHash: model11CheckpointIdentityHash(binding), boardIds: plan.boardList.map(board => board.id) };
}
export function preparePilot1755(context) {
  const c = context; c.assertUnchanged();
  safeDirectory(c.spec.runRoot, { create: true, exclusive: true });
  const prepared = { kind: 'model11-pilot1755-prepared', version: 1, specSha256: c.specRecord.sha256,
    source: c.source, files: c.files, bindingHash: c.bindingHash, checkpointIdentityHash: c.checkpointIdentityHash,
    boardIds: c.boardIds, laneCounts: [439, 439, 439, 438], numericalWorkPerformed: false };
  immutableJSON(join(c.spec.runRoot, 'prepared.json'), prepared); return prepared;
}
function requirePrepared(c) {
  const prepared = pilotJSON(join(c.spec.runRoot, 'prepared.json'));
  if (prepared.kind !== 'model11-pilot1755-prepared' || prepared.version !== 1 || prepared.specSha256 !== c.specRecord.sha256 ||
      prepared.bindingHash !== c.bindingHash || prepared.checkpointIdentityHash !== c.checkpointIdentityHash || !same(prepared.source, c.source) ||
      !same(prepared.files, c.files) || !same(prepared.boardIds, c.boardIds) || !same(prepared.laneCounts, [439, 439, 439, 438])) gateFail('Missing matching full1755 preparation');
  return prepared;
}
// Scan the full catalog even for a lane, then reject any non-owned checkpoint.
function assertStoreFiles(c, cache, indices, { requireComplete = false } = {}) {
  if (!same(readdirSync(dirname(cache.dir)), [c.checkpointIdentityHash])) gateFail('Foreign binding or partial directory in pilot checkpoint root');
  const owned = new Set(indices.map(index => c.boardIds[index]));
  if ([...cache.rows.keys()].some(board => !owned.has(board)) || requireComplete && cache.rows.size !== indices.length) gateFail('Unowned or missing pilot board checkpoint');
  const allowed = new Set(['identity.json', ...[...cache.rows.keys()].map(board => `${board}.json`)]);
  for (const row of cache.rows.values()) for (const ref of row.modelUnreachableProofs ?? []) {
    if (!exactKeys(ref, ['proofHash', 'bytes', 'sha256']) || !/^[a-f0-9]{64}$/.test(ref.proofHash) || !/^[a-f0-9]{64}$/.test(ref.sha256) ||
        !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > 16 * 1024 * 1024) gateFail('Unbounded or malformed pilot proof reference');
    const name = `${ref.proofHash}.proof.json`, record = auditFileRecord(cache.dir, name);
    if (record.bytes !== ref.bytes || record.sha256 !== ref.sha256) gateFail('Missing/changed pilot proof file');
    allowed.add(name);
  }
  for (const name of readdirSync(cache.dir)) {
    const stat = lstatSync(join(cache.dir, name));
    if (!stat.isFile() || stat.isSymbolicLink() || !allowed.has(name)) gateFail('Unowned/partial/orphan evidence in pilot store');
  }
}
function rowRecord(cache, index, board) {
  const row = cache.rows.get(board), checkpoint = auditFileRecord(cache.dir, `${board}.json`);
  const proofs = (row.modelUnreachableProofs ?? []).map(ref => {
    const record = auditFileRecord(cache.dir, `${ref.proofHash}.proof.json`);
    if (record.bytes !== ref.bytes || record.sha256 !== ref.sha256) gateFail('Proof byte reference drift');
    return record;
  });
  return { index, board, checkpoint, proofs };
}
export function runPilot1755Lane(c, lane) {
  requirePrepared(c); c.assertUnchanged();
  const indices = pilot1755Indices(lane), laneRoot = join(c.spec.runRoot, `lane-${lane}`), checkpointRoot = join(laneRoot, 'checkpoints');
  safeDirectory(laneRoot, { create: true });
  const lockPath = join(laneRoot, 'producer.lock'), lock = openSync(lockPath, 'wx', 0o644);
  closeSync(lock); // Ownership is the exclusive path; never replace a stale producer lock.
  const attemptRoot = join(laneRoot, `attempt-${randomUUID()}`);
  let proof, provenance, failure = null;
  try {
    safeDirectory(attemptRoot, { create: true, exclusive: true });
    const processStartTicks = readFileSync(`/proc/${process.pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/)[19];
    provenance = { specSha256: c.specRecord.sha256, executionCommit: c.spec.repository.executionCommit, sourceIdentityHash: c.source.identityHash,
      bindingHash: c.bindingHash, checkpointIdentityHash: c.checkpointIdentityHash, lane, laneRoot, indices, checkpointRoot, attemptRoot,
      pid: process.pid, processStartTicks, startedAt: new Date().toISOString() };
    immutableJSON(join(attemptRoot, 'started.json'), provenance);
    const cache = openBoardCheckpoints(checkpointRoot, c.binding, c.boardIds);
    assertStoreFiles(c, cache, indices);
    proof = openPilot1755ProofAdapter(c.inputs, c.flop, c.later, c.binding, cache);
    let newlyComputedBoards = 0, reusedBoards = 0;
    for (const index of indices) {
      const board = c.binding.plan.boardList[index]; c.assertUnchanged();
      try {
        if (cache.rows.has(board.id)) { validateModel11BoardRow(c.inputs, c.binding, board, cache.rows.get(board.id), proof); reusedBoards++; }
        else persistPilot1755Board(c.inputs, c.flop, c.later, c.binding, board, cache, proof, c.assertUnchanged, () => { newlyComputedBoards++; });
      } finally { proof.release(); }
      console.log(JSON.stringify({ lane, index, board: board.id, checkpointed: cache.rows.size, requested: indices.length,
        newlyComputedBoards, reusedBoards, complete: cache.rows.get(board.id).complete }));
    }
    assertStoreFiles(c, cache, indices, { requireComplete: true }); c.assertUnchanged();
    const complete = { kind: 'model11-pilot1755-lane-completion', version: 1, provenance,
      status: 'owned-checkpoints-produced-not-accepted', completedAt: new Date().toISOString(),
      newlyComputedBoards, reusedBoards, allRowsComplete: [...cache.rows.values()].every(row => row.complete),
      completions: indices.map(index => rowRecord(cache, index, c.boardIds[index])) };
    immutableJSON(join(attemptRoot, 'completed.json'), complete); return { path: join(attemptRoot, 'completed.json'), complete };
  } catch (error) { failure = String(error); throw error; }
  finally {
    proof?.release();
    if (provenance) immutableJSON(join(attemptRoot, 'producer-returned.json'), { provenance, failure, returnedAt: new Date().toISOString(),
      note: 'This is not process-terminal evidence. The owning supervisor must reap and attest the group.' });
    unlinkSync(lockPath);
  }
}
function requireTerminalProducers(c, receiptPath, receiptSha256) {
  const receiptPin = pilotFile(receiptPath);
  if (receiptPin.sha256 !== receiptSha256 || dirname(receiptPath) === c.spec.runRoot || !resolve(receiptPath).startsWith(resolve(c.spec.runRoot) + '/supervision-')) gateFail('Exact owned supervision receipt required');
  const receipt = pilotJSON(receiptPath, receiptPin);
  if (receipt.kind !== 'model11-pilot1755-supervision-receipt' || receipt.status !== 'all-lanes-produced-not-finalized' ||
      receipt.specSha256 !== c.specRecord.sha256 || !same(receipt.sourceStart, c.source) || !same(receipt.sourceEnd, c.source) || !Array.isArray(receipt.errors) || receipt.errors.length || !Array.isArray(receipt.children) || receipt.children.length !== 4 ||
      !receipt.terminal || receipt.terminal.path !== join(dirname(receiptPath), 'terminal.json')) gateFail('All four successful terminal producers required');
  const terminal = pilotJSON(receipt.terminal.path, receipt.terminal);
  if (terminal.kind !== 'model11-pilot1755-process-terminal-before-postflight' || terminal.specSha256 !== c.specRecord.sha256 ||
      !Array.isArray(terminal.executionErrors) || terminal.executionErrors.length || terminal.allFourCreated !== true || terminal.allCreatedChildrenReaped !== true || terminal.allOwnedGroupsGone !== true || terminal.children?.length !== 4) gateFail('Missing clean terminal-before-postflight ownership evidence');
  if (!same(receipt.launcher, terminal.supervisor)) gateFail('Supervisor identity differs between terminal and receipt');
  const expectedLauncher = c.source.integration.controller.find(row => row.path.endsWith('/run-model11-pilot1755-lanes.py'));
  if (!expectedLauncher || receipt.launcher.sha256 !== expectedLauncher.sha256 || receipt.launcher.bytes !== expectedLauncher.bytes) gateFail('Unreviewed producer supervisor');
  const children = receipt.children;
  for (let lane = 0; lane < 4; lane++) {
    const child = children[lane], term = terminal.children[lane];
    const command = [c.spec.node.path, '--max-old-space-size=512', join(resolve(AUDIT_REPOSITORY), 'apps/frontend/scripts/postflop-ai/evaluate-model11-allboard-lanes.mjs'),
      '--operation', 'lane', '--lane', String(lane), '--spec', c.specRecord.path, '--spec-sha256', c.specRecord.sha256, '--execute-full', '--spot', PILOT1755_SPOT];
    if (!Number.isSafeInteger(child.pid) || child.pid < 1 || !/^[0-9]+$/.test(child.startTicks ?? '') || child.index !== lane || term.index !== lane || child.exitCode !== 0 || term.exitCode !== 0 || child.terminal !== true || term.terminal !== true ||
        child.ownedGroupGone !== true || term.ownedGroupGone !== true || child.pid !== term.pid || child.startTicks !== term.startTicks ||
        !same(child.command, command) || !same(term.command, command) || !child.completion) gateFail('Producer ownership/command/reap provenance differs');
    // Terminal/reap/group-gone evidence belongs to the pinned owning supervisor.
    // This caller may have another PID namespace; its /proc cannot attest those groups.

  }
  return { receiptPin, receipt, terminal };
}
function verifyLaneCompletion(c, child, lane) {
  const laneRoot = join(c.spec.runRoot, `lane-${lane}`), ref = child.completion;
  if (basename(ref.path) !== 'completed.json' || dirname(dirname(ref.path)) !== laneRoot || !/^attempt-[a-f0-9-]+$/.test(basename(dirname(ref.path)))) gateFail('Foreign lane completion path');
  requireAbsent(join(laneRoot, 'producer.lock'));
  const complete = pilotJSON(ref.path, { path: ref.path, bytes: ref.bytes, sha256: ref.sha256 });
  const provenance = pilotJSON(join(dirname(ref.path), 'started.json')), indices = pilot1755Indices(lane);
  if (complete.kind !== 'model11-pilot1755-lane-completion' || complete.version !== 1 || !same(complete.provenance, provenance) ||
      provenance.specSha256 !== c.specRecord.sha256 || provenance.executionCommit !== c.spec.repository.executionCommit || provenance.sourceIdentityHash !== c.source.identityHash ||
      provenance.bindingHash !== c.bindingHash || provenance.checkpointIdentityHash !== c.checkpointIdentityHash || provenance.lane !== lane || provenance.laneRoot !== laneRoot ||
      provenance.attemptRoot !== dirname(ref.path) || provenance.checkpointRoot !== join(laneRoot, 'checkpoints') || !same(provenance.indices, indices) ||
      provenance.pid !== child.pid || provenance.processStartTicks !== child.startTicks || !Array.isArray(complete.completions) || complete.completions.length !== indices.length ||
      !Number.isSafeInteger(complete.newlyComputedBoards) || complete.newlyComputedBoards < 0 || !Number.isSafeInteger(complete.reusedBoards) || complete.reusedBoards < 0 ||
      complete.newlyComputedBoards + complete.reusedBoards !== indices.length || complete.allRowsComplete !== true) gateFail('Incomplete or foreign lane provenance/coverage');
  const dir = join(provenance.checkpointRoot, c.checkpointIdentityHash);
  auditFileRecord(dir, 'identity.json'); // No creation before existing identity is established.
  const cache = openBoardCheckpoints(provenance.checkpointRoot, c.binding, c.boardIds), proof = openPilot1755ProofAdapter(c.inputs, c.flop, c.later, c.binding, cache);
  assertStoreFiles(c, cache, indices, { requireComplete: true });
  try {
    for (let offset = 0; offset < indices.length; offset++) {
      const index = indices[offset], board = c.binding.plan.boardList[index], row = cache.rows.get(board.id);
      if (!row.complete || !same(complete.completions[offset], rowRecord(cache, index, board.id))) gateFail('Partial/missing/reordered/changed lane checkpoint');
      try { validateModel11BoardRow(c.inputs, c.binding, board, row, proof); } finally { proof.release(); }
    }
  } finally { proof.release(); }
  return { complete, cache, completionPin: { path: ref.path, bytes: ref.bytes, sha256: ref.sha256 },
    startedPin: pilotFile(join(dirname(ref.path), 'started.json')) };
}
export function finalizePilot1755(c, supervisionPath, supervisionSha256) {
  requirePrepared(c); c.assertUnchanged();
  const producer = requireTerminalProducers(c, supervisionPath, supervisionSha256);
  const lanes = producer.receipt.children.map((child, lane) => verifyLaneCompletion(c, child, lane));
  const indices = lanes.flatMap(lane => lane.complete.completions.map(row => row.index)).sort((a, b) => a - b);
  if (!same(indices, Array.from({ length: 1755 }, (_, index) => index))) gateFail('Exact disjoint1755 union required');
  const pinned = [producer.receiptPin, producer.receipt.terminal, ...lanes.flatMap(lane => [lane.completionPin, lane.startedPin,
    ...[...new Set(['identity.json', ...lane.complete.completions.flatMap(row => [row.checkpoint.path, ...row.proofs.map(proof => proof.path)])])]
      .map(path => pilotFile(join(lane.cache.dir, path)))])];
  const assertProducersUnchanged = () => { c.assertUnchanged(); for (const ref of pinned) if (!same(pilotFile(ref.path), ref)) gateFail('Terminal producer evidence changed'); };
  const finalRoot = join(c.spec.runRoot, 'finalized'), checkpointRoot = join(finalRoot, 'checkpoints');
  requireAbsent(finalRoot); safeDirectory(finalRoot, { create: true, exclusive: true });
  const cache = openBoardCheckpoints(checkpointRoot, c.binding, c.boardIds);
  // Sequential immutable import. Verify every source byte; write proofs first,
  // then the exact checkpoint envelope last. Never repair or overwrite a conflict.
  for (let index = 0; index < 1755; index++) {
    const lane = lanes[index % 4], item = lane.complete.completions.find(row => row.index === index), row = lane.cache.rows.get(c.boardIds[index]);
    for (const ref of item.proofs) {
      const source = join(lane.cache.dir, ref.path), bytes = pinnedBytes(source, { ...ref, path: source });
      writeImmutableAllBoardOutput(join(cache.dir, ref.path), bytes);
      if (!same(auditFileRecord(cache.dir, ref.path), ref)) gateFail('Imported proof differs');
    }
    const source = join(lane.cache.dir, item.checkpoint.path), bytes = pinnedBytes(source, { ...item.checkpoint, path: source }, 512 * 1024);
    // cache.write preserves the unchanged canonical envelope and validates existing bytes.
    cache.write(row);
    if (!readFileSync(join(cache.dir, item.checkpoint.path)).equals(bytes)) gateFail('Imported checkpoint bytes differ');
  }
  assertStoreFiles(c, cache, indices, { requireComplete: true });
  const mergedPins = readdirSync(cache.dir).sort().map(path => pilotFile(join(cache.dir, path)));
  // Global evidence hashes belong at the two finalization boundaries, not in
  // callbacks. The unchanged consumers still verify each row/proof when read.
  const assertEvidenceUnchanged = () => {
    assertProducersUnchanged();
    for (const ref of mergedPins) if (!same(pilotFile(ref.path), ref)) gateFail('Finalization evidence bytes changed');
  };
  const requireExistingUnchanged = () => {
    c.assertUnchanged();
    safeDirectory(cache.dir);
    for (const name of ['identity.json', ...c.boardIds.map(board => `${board}.json`)]) {
      const stat = lstatSync(join(cache.dir, name));
      if (!stat.isFile() || stat.isSymbolicLink()) gateFail('Final validation requires every existing checkpoint before any generation');
    }
  };
  assertEvidenceUnchanged();
  requireExistingUnchanged();
  const startedAt = new Date().toISOString(), started = performance.now();
  const result = runModel11AllBoards(c.inputs, c.flop, c.later, c.binding, checkpointRoot, {
    assertUnchanged: requireExistingUnchanged, onBoard() { gateFail('Final validation must never generate a missing checkpoint'); } });
  requireExistingUnchanged();
  const exitCode = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(result.status) ? 1 : 0;
  const log = JSON.stringify({ spot: PILOT1755_SPOT, operation: 'all-boards', status: result.status, bindingHash: c.bindingHash,
    uniqueBoards: result.counts.requestedBoards, fullScopePassed: result.fullScopePassed, numericalGenerationDuringFinalization: 0,
    acceptance: 'Component all-board evidence only. Old full representative replay PASS is not claimed; revised common-engine/per-policy scope is separate.' }) + '\n';
  const receipt = { kind: 'model11-gate-execution-receipt', version: 1, operation: 'all-boards', startedAt, completedAt: new Date().toISOString(),
    command: process.argv, exitCode, execution: { node: process.version, platform: process.platform, arch: process.arch },
    sourceStart: c.source, sourceEnd: capturePilot1755Source(), filesStart: c.files, filesEnd: c.files, reportInput: null,
    result, resultHash: contentHash(result), log: { text: log, sha256: hash(log) },
    diagnostics: { elapsedMs: performance.now() - started, memoryAtReturn: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
      producerReceipt: producer.receiptPin, laneCompletions: lanes.map(lane => lane.completionPin), uniqueBoards: 1755,
      newlyComputedBoards: lanes.reduce((sum, lane) => sum + lane.complete.newlyComputedBoards, 0),
      reusedBoards: lanes.reduce((sum, lane) => sum + lane.complete.reusedBoards, 0),
      mergedAndValidatedBoardsAreNotAdditionalComputation: true, memoryScope: 'Finalizer process only; producer CPU/RSS are recorded in the supervised receipt.' } };
  validateModel11GateReceipt(receipt, { operation: 'all-boards', binding: c.binding });
  const saved = partitionModel11AllBoardReceipt(receipt, checkpointRoot, { outputSourceStart: c.source.output, outputSourceEnd: captureModel11AllBoardOutputSource() });
  if (!same(materializeModel11AllBoardReceipt(saved, checkpointRoot, { binding: c.binding, outputSource: c.source.output }), receipt)) gateFail('Lossless47 materialization differs');
  if (!same(consumeModel11AllBoardReceipt(saved, checkpointRoot, { inputs: c.inputs, flop: c.flop, later: c.later, binding: c.binding,
    outputSource: c.source.output, assertUnchanged: requireExistingUnchanged }), receipt)) gateFail('Original semantic consumption differs');
  requireExistingUnchanged();
  assertEvidenceUnchanged();
  immutableJSON(join(finalRoot, 'allboard-partitioned.json'), saved);
  return { path: join(finalRoot, 'allboard-partitioned.json'), exitCode, log };
}
