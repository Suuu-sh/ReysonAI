// Essential wrapper controls only. Synthetic admission receipts below are deliberately
// incomplete negative fixtures, never real process provenance or1755 numerical evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture, selection, emitFresh } from './helpers/model11-execution-fixtures.mjs';
import { AUDIT_REPOSITORY, auditFileRecord } from '../scripts/postflop-ai/audit-identity.mjs';
import { contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { resolveModel11GatePlan, expectedModel11LaterCoverage } from '../scripts/postflop-ai/model11-gate-contract.mjs';
import { model11GateBinding, model11BoardRow, validateModel11BoardRow } from '../scripts/postflop-ai/model11-gate-drivers.mjs';
import { canonicalFlop, canonicalFlops } from '../scripts/postflop-ai/flop-isomorphism.mjs';
import { openBoardCheckpoints, writeImmutableAllBoardOutput } from '../scripts/postflop-ai/all-board-checkpoints.mjs';
import { model11CheckpointIdentityHash } from '../scripts/postflop-ai/model11-allboard-partitioned-output.mjs';
import { openPilot1755ProofAdapter, persistPilot1755Board } from '../scripts/postflop-ai/model11-allboard-lane-proof.mjs';
import { parsePilot1755Arguments } from '../scripts/postflop-ai/evaluate-model11-allboard-lanes.mjs';
import { PILOT1755_SPOT, capturePilot1755Source, pilot1755Indices, pilotFile, preparePilot1755, runPilot1755Lane, finalizePilot1755 } from '../scripts/postflop-ai/model11-allboard-lanes.mjs';

const repo = resolve(AUDIT_REPOSITORY);
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function workdir(label) {
  const base = process.env.MODEL11_EVIDENCE_DIR ?? tmpdir(); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, `pilot1755-${label}-`));
  json(join(root, 'TEST-ONLY.json'), { scope: 'bounded wrapper test; never1755 numerical or real producer provenance', label });
  return root;
}
let captured;
function live() {
  if (captured) return captured;
  const { inputs, flop, later, execution } = fixture(); execution.releaseBoardCaches();
  const source = capturePilot1755Source();
  const files = Object.fromEntries(['flop', 'later'].map(key => [key, selection.files.find(row => row.path.endsWith(
    key === 'flop' ? '/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-policy.json' : '/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-later-policy.json'))]));
  files.plan = auditFileRecord(repo, 'apps/frontend/tests/fixtures/model11-all-board-full-plan.json');
  const plan = resolveModel11GatePlan(inputs, JSON.parse(readFileSync(join(repo, files.plan.path))), { executeFull: true });
  const binding = model11GateBinding(inputs, flop, later, plan, source, files);
  const assertUnchanged = () => {
    assert.deepEqual(capturePilot1755Source(), source);
    for (const record of Object.values(files)) assert.deepEqual(auditFileRecord(repo, record.path), record);
  };
  captured = { inputs, flop, later, source, files, binding, bindingHash: contentHash(binding),
    checkpointIdentityHash: model11CheckpointIdentityHash(binding), boardIds: plan.boardList.map(board => board.id), assertUnchanged };
  return captured;
}
function context(label) {
  const base = live(), root = workdir(label), specPath = join(root, 'test-spec.json');
  const spec = { kind: 'model11-pilot1755-fixed-lanes-spec', version: 1,
    repository: { root: repo, executionCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim() },
    inputs: { spot: PILOT1755_SPOT, files: base.files }, runRoot: join(root, 'run'),
    node: { path: process.execPath }, source: { identityHash: base.source.identityHash },
    testOnly: 'Direct exported-function negative fixture; this is intentionally not a launchable runtime spec.' };
  json(specPath, spec);
  const c = { ...base, spec, specRecord: pilotFile(specPath) };
  preparePilot1755(c); return c;
}
function store(c, lane) { return openBoardCheckpoints(join(c.spec.runRoot, `lane-${lane}`, 'checkpoints'), c.binding, c.boardIds); }
function rowsOnDisk(cache) { return readdirSync(cache.dir).filter(name => /^(?:[2-9TJQKA][cdhs]){3}\.json$/.test(name)).sort(); }

// All three cheap tests are separately selectable; importing this file never
// invokes model11BoardRow or initializes a live fixture unless a selected test asks.
test('pilot1755 arguments and assignment are explicit exact full1755 partitions', () => {
  const base = ['--operation', 'lane', '--lane', '0', '--spec', '/test/spec.json', '--spec-sha256', 'a'.repeat(64), '--spot', PILOT1755_SPOT, '--execute-full'];
  assert.equal(parsePilot1755Arguments(base)['--lane'], '0');
  for (const args of [[], base.slice(0, -1), [...base, '--lane', '1'], [...base, '--unknown', 'x'], base.map(value => value === '0' ? '4' : value)]) assert.throws(() => parsePilot1755Arguments(args));
  for (const lane of [-1, 4, .5, '0', null]) assert.throws(() => pilot1755Indices(lane));
  const boards = canonicalFlops(), lanes = [0, 1, 2, 3].map(pilot1755Indices);
  assert.equal(boards.length, 1755); assert.equal(new Set(boards.map(board => board.id)).size, 1755);
  assert.deepEqual(lanes.map(lane => lane.length), [439, 439, 439, 438]);
  assert.deepEqual(lanes.flat().sort((a, b) => a - b), boards.map((_, index) => index));
  for (let lane = 0; lane < 4; lane++) assert.ok(lanes[lane].every(index => index % 4 === lane));
  assert.equal(canonicalFlop('As7d2c').key, 'Ac7d2h');
  emitFresh('pilot1755-arguments-assignment', { checks: { exact1755: true, disjointModuloFour: true, noDefaultExecution: true }, numericBoardsComputed: 0 });
});

test('pilot1755 admission rejects unowned rows foreign bindings and partial files before computation', () => {
  for (const mode of ['unowned', 'foreign-binding', 'partial-file']) {
    const c = context(mode), cache = store(c, 0);
    if (mode === 'unowned') cache.write({ board: c.boardIds[1], findings: [] });
    else if (mode === 'foreign-binding') mkdirSync(join(c.spec.runRoot, 'lane-0', 'checkpoints', 'foreign-binding'));
    else writeFileSync(join(cache.dir, 'interrupted.tmp'), 'partial', { flag: 'wx' });
    const before = rowsOnDisk(cache), pins = before.map(name => auditFileRecord(cache.dir, name));
    assert.throws(() => runPilot1755Lane(c, 0), /Unowned|Foreign binding|partial/);
    assert.deepEqual(rowsOnDisk(cache), before);
    assert.deepEqual(before.map(name => auditFileRecord(cache.dir, name)), pins);
    assert.equal(existsSync(join(c.spec.runRoot, 'lane-0', 'producer.lock')), false);
  }
  emitFresh('pilot1755-admission', { checks: { unownedRejected: true, crossBindingRejected: true, partialRejected: true, existingBytesPreserved: true }, numericBoardsComputed: 0 });
});

// Deliberately fictitious historical ownership reaches only negative admission.
// Reuse the caller group/session leader number, not the node --test child PID.
function incompleteProducerFixture(c, { reuseCurrentPid = false, omitTerminal = false } = {}) {
  const root = join(c.spec.runRoot, 'supervision-synthetic-negative'); mkdirSync(root);
  const maxPid = Number(readFileSync('/proc/sys/kernel/pid_max', 'utf8'));
  const launcherRecord = c.source.integration.controller.find(row => row.path.endsWith('/run-model11-pilot1755-lanes.py'));
  const launcher = { ...launcherRecord, path: join(repo, launcherRecord.path) };
  const children = [0, 1, 2, 3].map(lane => {
    const cache = store(c, lane), laneRoot = join(c.spec.runRoot, `lane-${lane}`), attemptRoot = join(laneRoot, `attempt-${lane.toString(16).repeat(8)}`);
    mkdirSync(attemptRoot);
    const reused = reuseCurrentPid && lane === 0;
    let pid = maxPid + lane + 1, processStartTicks = '0';
    if (reused) {
      const caller = readFileSync(`/proc/${process.pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
      assert.equal(caller[2], caller[3], 'Run this control in its approved owned session');
      pid = Number(caller[2]);
      const leader = readFileSync(`/proc/${pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
      assert.equal(Number(leader[2]), pid); assert.equal(Number(leader[3]), pid);
      processStartTicks = (BigInt(leader[19]) - 1n).toString();
      assert.notEqual(processStartTicks, leader[19]);
      // The removed caller-/proc group scan would reject this exact collision.
    } else assert.equal(existsSync(`/proc/${pid}`), false);
    const indices = pilot1755Indices(lane), provenance = { specSha256: c.specRecord.sha256, executionCommit: c.spec.repository.executionCommit,
      sourceIdentityHash: c.source.identityHash, bindingHash: c.bindingHash, checkpointIdentityHash: c.checkpointIdentityHash,
      lane, laneRoot, indices, checkpointRoot: join(laneRoot, 'checkpoints'), attemptRoot, pid, processStartTicks, testOnly: true };
    json(join(attemptRoot, 'started.json'), provenance);
    const complete = { kind: 'model11-pilot1755-lane-completion', version: 1, provenance, allRowsComplete: true,
      newlyComputedBoards: 0, reusedBoards: indices.length,
      completions: indices.map(index => ({ index, board: c.boardIds[index], checkpoint: { path: `${c.boardIds[index]}.json`, bytes: 1, sha256: '0'.repeat(64) }, proofs: [] })),
      testOnly: 'Intentionally false coverage declarations: all checkpoints are absent and must be rejected.' };
    json(join(attemptRoot, 'completed.json'), complete); assert.deepEqual(rowsOnDisk(cache), []);
    const command = [c.spec.node.path, '--max-old-space-size=512', join(repo, 'apps/frontend/scripts/postflop-ai/evaluate-model11-allboard-lanes.mjs'),
      '--operation', 'lane', '--lane', String(lane), '--spec', c.specRecord.path, '--spec-sha256', c.specRecord.sha256, '--execute-full', '--spot', PILOT1755_SPOT];
    return { index: lane, pid, startTicks: processStartTicks, command, exitCode: 0, terminal: true, ownedGroupGone: true, completion: pilotFile(join(attemptRoot, 'completed.json')) };
  });
  if (!omitTerminal) json(join(root, 'terminal.json'), { kind: 'model11-pilot1755-process-terminal-before-postflight', specSha256: c.specRecord.sha256,
    executionErrors: [], allFourCreated: true, allCreatedChildrenReaped: true, allOwnedGroupsGone: true, children, supervisor: launcher, testOnly: true });
  const path = join(root, 'receipt.json');
  json(path, { kind: 'model11-pilot1755-supervision-receipt', status: 'all-lanes-produced-not-finalized', specSha256: c.specRecord.sha256,
    sourceStart: c.source, sourceEnd: c.source, errors: [], children, launcher,
    terminal: omitTerminal ? { path: join(root, 'terminal.json'), bytes: 1, sha256: '0'.repeat(64) } : pilotFile(join(root, 'terminal.json')), testOnly: true });
  return pilotFile(path);
}

test('pilot1755 missing checkpoints fail finalizer admission with zero generated rows', () => {
  for (const options of [{}, { reuseCurrentPid: true }, { omitTerminal: true }]) {
    const c = context('missing-checkpoints'), receipt = incompleteProducerFixture(c, options);
    assert.throws(() => finalizePilot1755(c, receipt.path, receipt.sha256),
      options.omitTerminal ? error => error.code === 'ENOENT' : /Unowned or missing pilot board checkpoint/);
    for (const lane of [0, 1, 2, 3]) assert.deepEqual(rowsOnDisk(store(c, lane)), []);
    assert.equal(existsSync(join(c.spec.runRoot, 'finalized')), false);
  }
  emitFresh('pilot1755-missing-checkpoint-no-generation', { checks: { syntheticIncompleteProvenanceRejected: true, missingCheckpointGeneratedZero: true,
    reusedCallerGroupLeaderDoesNotImplyRemoteLiveness: true, missingTerminalRejected: true, finalizedOutputAbsent: true }, numericBoardsComputed: 0 });
});

test('pilot1755 real all-street parity and proof persistence', () => {
  const c = live(), root = workdir('real-Ac7d2h'), board = c.binding.plan.boardList.find(row => row.id === 'Ac7d2h');
  assert.ok(board); assert.equal(c.binding.plan.scope, 'full'); assert.equal(c.binding.plan.street, 'all'); assert.equal(c.binding.plan.boardList.length, 1755);
  c.assertUnchanged();
  // Exactly two independent numerical board calls: unchanged producer, then the
  // extracted persistence adapter. No lane loop/full1755 computation is invoked.
  const direct = model11BoardRow(c.inputs, c.flop, c.later, c.binding, board);
  assert.equal(direct.complete, true); assert.ok(direct.modelUnreachableProofs.length > 0, 'Chosen fixed board must exercise real proof persistence; do not expand the selection');
  assert.deepEqual(direct.stages, [{ street: 'flop', complete: true }, { street: 'later', complete: true }]);
  assert.deepEqual(direct.later_coverage, expectedModel11LaterCoverage(c.inputs, board));
  const checkpointRoot = join(root, 'checkpoint'), cache = openBoardCheckpoints(checkpointRoot, c.binding, c.boardIds);
  const adapter = openPilot1755ProofAdapter(c.inputs, c.flop, c.later, c.binding, cache); let callbacks = 0;
  try {
    persistPilot1755Board(c.inputs, c.flop, c.later, c.binding, board, cache, adapter, c.assertUnchanged, row => {
      callbacks++; assert.equal(cache.rows.has(board.id), true);
      for (const ref of row.modelUnreachableProofs) assert.ok(existsSync(join(cache.dir, `${ref.proofHash}.proof.json`)));
    });
    assert.equal(callbacks, 1); assert.equal(cache.rows.size, 1);
    const saved = cache.rows.get(board.id), expanded = { ...saved, modelUnreachableProofs: saved.modelUnreachableProofs.map(adapter.readProof) };
    assert.deepEqual(expanded, direct);
    validateModel11BoardRow(c.inputs, c.binding, board, saved, adapter);
  } finally { adapter.release(); }
  const saved = cache.rows.get(board.id), before = readdirSync(cache.dir).sort().map(name => auditFileRecord(cache.dir, name));
  const reopened = openBoardCheckpoints(checkpointRoot, c.binding, c.boardIds), fresh = openPilot1755ProofAdapter(c.inputs, c.flop, c.later, c.binding, reopened);
  try { validateModel11BoardRow(c.inputs, c.binding, board, reopened.rows.get(board.id), fresh); } finally { fresh.release(); }
  assert.deepEqual(readdirSync(cache.dir).sort().map(name => auditFileRecord(cache.dir, name)), before);
  for (const mode of ['missing-proof', 'cross-binding', 'rehashed-omitted-support']) {
    const row = structuredClone(saved), first = row.modelUnreachableProofs[0];
    const altered = openBoardCheckpoints(join(root, mode), c.binding, c.boardIds);
    // Copy only untouched proofs. The target is absent or written afresh under
    // its intended name; positive evidence and original prefix mappings survive.
    for (const ref of saved.modelUnreachableProofs.slice(1)) {
      const name = `${ref.proofHash}.proof.json`;
      copyFileSync(join(cache.dir, name), join(altered.dir, name));
    }
    if (mode !== 'missing-proof') {
      const envelope = JSON.parse(readFileSync(join(cache.dir, `${first.proofHash}.proof.json`)));
      if (mode === 'cross-binding') envelope.bindingHash = '0'.repeat(64);
      else {
        const previous = envelope.proof.proofHash; assert.ok(envelope.proof.rows.length > 1); envelope.proof.rows.pop();
        const { proofHash: _old, ...body } = envelope.proof; envelope.proof.proofHash = contentHash(body);
        for (const item of row.modelUnreachablePrefixes) if (item.proofHash === previous) item.proofHash = envelope.proof.proofHash;
      }
      const name = `${envelope.proof.proofHash}.proof.json`;
      writeImmutableAllBoardOutput(join(altered.dir, name), JSON.stringify(envelope) + '\n');
      const ref = auditFileRecord(altered.dir, name);
      Object.assign(first, { proofHash: envelope.proof.proofHash, bytes: ref.bytes, sha256: ref.sha256 });
    }
    if (mode !== 'rehashed-omitted-support') {
      assert.equal(first.proofHash, saved.modelUnreachableProofs[0].proofHash);
      assert.deepEqual(row.modelUnreachablePrefixes, saved.modelUnreachablePrefixes);
    }
    altered.write(row); // Recompute the checkpoint envelope and row hash too.
    const verifier = openPilot1755ProofAdapter(c.inputs, c.flop, c.later, c.binding, altered);
    try {
      assert.throws(() => validateModel11BoardRow(c.inputs, c.binding, board, altered.rows.get(board.id), verifier),
        mode === 'rehashed-omitted-support' ? error => error.status === 'invalid-zero-likelihood-proof'
          : mode === 'cross-binding' ? /belongs to another gate/ : error => error.code === 'ENOENT');
    } finally { verifier.release(); }
  }
  c.assertUnchanged();
  emitFresh('pilot1755-real-Ac7d2h-parity', { scope: 'one canonical board/all streets, computed twice; not1755 acceptance', checkpointRoot,
    board: board.id, boardIndex: c.boardIds.indexOf(board.id), numericalBoardComputations: 2, savedRowHash: contentHash(saved), proofCount: saved.modelUnreachableProofs.length,
    checks: { exactUnchangedProducerParity: true, proofFirstCheckpointLast: true, allStreetCoverage: true, resumeChangedNoBytes: true,
      missingProofRejected: true, crossBindingRejected: true, fullyRehashedOmittedSupportRejected: true } });
});
