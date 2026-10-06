// Internal exact96 parity only; public diagnostic cap remains the original12 per cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, emitFresh } from './model11-execution-fixtures.mjs';
import { simulateModel11Completion } from '../../scripts/postflop-ai/simulation-model11-completion.mjs';
import { createModel11BehaviorCompletion } from '../../scripts/postflop-ai/offpath-behavior-model11.mjs';
import { contentHash } from '../../scripts/postflop-ai/effective-law-identity.mjs';
import { captureCompletionRepresentativeSource } from '../../scripts/postflop-ai/model11-completion-representative-source.mjs';
import { model11CompletionRepresentativeBinding, rehydrateCompletionDecision, validateCompletionRepresentativeDecision } from '../../scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { openCompletionRepresentativeEvidence } from '../../scripts/postflop-ai/model11-completion-representative-store.mjs';
import { produceModel11CompletionRepresentative, validateCompletionRepresentativeCell } from '../../scripts/postflop-ai/model11-completion-representative.mjs';
const board = { id: 'As7d2c', cards: [51, 21, 0], split: 'design' };

test('new stream exactly preserves85 detailed96 returns/events/laws/order and rejects persisted forgeries', () => {
  const { inputs, flop, later, execution: strict } = fixture(); strict.releaseBoardCaches();
  const plan = { kind: 'representative', scope: 'diagnostic', boardList: [board], street: 'all', authored: true,
    samples: 16, profiles: ['standard', 'passive', 'aggressive'], heroes: [inputs.spot.ip, inputs.spot.oop], cacheBatchSize: 512, seed: inputs.config.seed };
  const binding = model11CompletionRepresentativeBinding(inputs, flop, later, plan, captureCompletionRepresentativeSource(), {});
  assert.equal(binding.strictBalance.execution.identity, binding.compositeExecution.normalExecutionIdentity);
  assert.equal(binding.strictBalance.belief.identity, binding.belief.identity); assert.notEqual(binding.compositeExecution.identity, binding.strictBalance.execution.identity);
  const original = simulateModel11Completion(inputs, flop, later, { boardList: [board], samples: 16, profiles: plan.profiles, heroes: plan.heroes, cacheBatchSize: 512 });
  const evidenceBase = process.env.MODEL11_EVIDENCE_DIR ?? tmpdir(); mkdirSync(evidenceBase, { recursive: true });
  const root = mkdtempSync(join(evidenceBase, 'model11-stream96-')), replayRoot = mkdtempSync(join(evidenceBase, 'model11-stream96-fresh-'));
  const options = { assertUnchanged() { assert.deepEqual(captureCompletionRepresentativeSource(), binding.source); } };
  const saved = produceModel11CompletionRepresentative(inputs, flop, later, binding, root, options);
  const replay = produceModel11CompletionRepresentative(inputs, flop, later, binding, replayRoot, { ...options, fresh: true });
  assert.deepEqual(replay, saved); assert.equal(saved.counts.requestedTrials, 96); assert.equal(saved.counts.completed, 96);
  assert.equal(saved.counts.completedByPolicy, 1); assert.equal(saved.counts.unresolvedCount, 0); assert.equal(saved.cellRecords.length, 6);
  const store = openCompletionRepresentativeEvidence(root, binding); let event, eventCell, eventSaved, paired = 0;
  for (const [index, ref] of saved.cellRecords.entries()) {
    const cell = store.read(ref.path), old = original.results[index], { trials, ...row } = old;
    assert.deepEqual(cell.row, row); const streamed = cell.chunks.flatMap(chunk => store.read(chunk.path).trials);
    assert.equal(streamed.length, 16);
    for (const [i, trial] of streamed.entries()) {
      assert.equal(trial.index, i); assert.equal(trial.candidateReturn, trials[i].candidateReturn); assert.equal(trial.baselineReturn, trials[i].baselineReturn);
      const decisions = trial.completionDecisions.map(item => {
        const proof = store.readProof(item.proofHash), law = rehydrateCompletionDecision(item, proof);
        assert.equal(contentHash(law), item.lawHash);
        if (!event) { event = item; eventCell = cell.cell; eventSaved = cell; }
        return { request: item.request, seat: item.seat, node: item.node, random: item.random, label: item.label, action: item.action,
          law, lawHash: item.lawHash, originalStatus: item.originalStatus, zeroLikelihoodProof: proof, verification: item.verification,
          behaviorIdentity: item.behaviorPolicyIdentity, compositeExecutionIdentity: item.compositeExecutionIdentity };
      });
      assert.deepEqual(decisions, trials[i].completionDecisions); paired++;
    }
  }
  assert.equal(paired, 96); assert.ok(event);
  const execution = createModel11BehaviorCompletion(inputs, flop, later);
  const valid = decision => validateCompletionRepresentativeDecision(execution, binding, eventCell, decision, store.readProof);
  assert.equal(valid(event), event.proofHash);
  for (const edit of [e => e.behaviorPolicyIdentity = 'stale', e => e.compositeExecutionIdentity = 'stale', e => e.lawHash = 'tampered',
      e => e.random = 1, e => e.action = 'invented', e => e.ownCombo = [e.request.board[0], e.ownCombo[1]], e => e.request.path.river = ['check']]) {
    const altered = structuredClone(event); edit(altered); assert.throws(() => valid(altered));
  }
  const proof = structuredClone(store.readProof(event.proofHash)); proof.rows.pop(); const { proofHash, ...body } = proof; proof.proofHash = contentHash(body);
  const forged = structuredClone(event); forged.proofHash = proof.proofHash; forged.verification.proofHash = proof.proofHash;
  forged.lawHash = contentHash(rehydrateCompletionDecision(forged, proof));
  assert.throws(() => validateCompletionRepresentativeDecision(execution, binding, eventCell, forged, () => proof), error => error.status === 'invalid-zero-likelihood-proof');
  execution.releaseBoardCaches();
  // Actual persisted-cell boundary with every outer digest legitimately rehashed:
  // a self-consistent forged file still must reach and fail the live support replay.
  const marker = structuredClone(eventSaved), virtual = new Map();
  const digestRecord = (path, value) => {
    const bytes = JSON.stringify(value) + '\n'; virtual.set(path, value);
    return { path, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const forgedProofPath = `${proof.proofHash}.proof.json`;
  marker.proofs = [digestRecord(forgedProofPath, { bindingHash: marker.bindingHash, proof })];
  marker.chunks = marker.chunks.map(ref => {
    const chunk = store.read(ref.path);
    for (const trial of chunk.trials) trial.completionDecisions = trial.completionDecisions.map(item => item.proofHash === event.proofHash ? forged : item);
    return { ...digestRecord(ref.path, chunk), startIndex: ref.startIndex, count: ref.count, trialHash: contentHash(chunk.trials) };
  });
  const fake = { ...store,
    record(path) { if (virtual.has(path)) return digestRecord(path, virtual.get(path)); return store.record(path); },
    read(path, expected) { const value = virtual.has(path) ? structuredClone(virtual.get(path)) : store.read(path, expected);
      if (expected) assert.deepEqual(this.record(path), expected); return value; },
    readProof(hash) { return hash === proof.proofHash ? structuredClone(proof) : store.readProof(hash); } };
  assert.throws(() => validateCompletionRepresentativeCell(inputs, flop, later, binding, fake, eventCell, marker), error => error.status === 'invalid-zero-likelihood-proof');
  const validate = marker => validateCompletionRepresentativeCell(inputs, flop, later, binding, store, eventCell, marker);
  for (const edit of [c => c.bindingHash = 'stale', c => c.cellIdentity = 'stale', c => c.chunks = [], c => c.proofs = [],
      c => c.proofs.push(c.proofs[0]), c => c.row.completedByPolicy = 0, c => c.row.candidate_ev_bb.mean += 1,
      c => c.chunks[0].count--, c => c.chunks[0].sha256 = 'tampered']) {
    const altered = structuredClone(eventSaved); edit(altered); assert.throws(() => validate(altered));
  }
  const read = store.read;
  for (const edit of [chunk => chunk.trials.pop(), chunk => chunk.trials[1].index = 0, chunk => chunk.bindingHash = 'mixed']) {
    const broken = { ...store, read(path, record) { const chunk = read(path, record); if (path.endsWith('.trials.json')) edit(chunk); return chunk; } };
    assert.throws(() => validateCompletionRepresentativeCell(inputs, flop, later, binding, broken, eventCell, eventSaved));
  }
  assert.throws(() => produceModel11CompletionRepresentative(inputs, flop, later, binding, root, { ...options, fresh: true }));
  const missing = mkdtempSync(join(evidenceBase, 'model11-missing-cell-'));
  assert.throws(() => produceModel11CompletionRepresentative(inputs, flop, later, binding, missing, { ...options, requireExisting: true }));
  emitFresh('completion96-stream-parity-and-negatives', { bindingHash: contentHash(binding), detailedNumericalHash: contentHash(Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'diagnostics'))),
    evidenceDirectories: { report: root, freshReplay: replayRoot }, counts: saved.counts, cellRecords: saved.cellRecords, checks: { pairedTrialsCompared: paired, completeEventsAndLawsCompared: true,
      freshReplayEqual: true, identityProofLawRowAccountingNegatives: true, rehashedIncompleteSupportRejectedThroughPersistedCell: true, partialAndMixedChunksRejected: true } });
});
