import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompletionRepresentativeArguments } from '../scripts/postflop-ai/evaluate-model11-completion-representative.mjs';
import { completionCellAccumulator, accountCompletionRepresentativeTrial, completionRepresentativeCellSummary } from '../scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { resolveModel11GatePlan } from '../scripts/postflop-ai/model11-gate-contract.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCompletionRepresentativeEvidence, persistCompletionRepresentativeBalance, readCompletionRepresentativeBalance } from '../scripts/postflop-ai/model11-completion-representative-store.mjs';
import { contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
test('new explicit gate arguments preserve separate operation and full opt-in boundaries', () => {
  const base = ['--operation', 'report', '--spot', 'S', '--flop', 'F', '--later', 'L', '--plan', 'P', '--output', 'O', '--evidence', 'E'];
  assert.equal(parseCompletionRepresentativeArguments(base)['--operation'], 'report');
  for (const args of [[], [...base, '--report', 'R'], [...base, '--execute-full', '--execute-full'], [...base, '--unknown', 'X']]) assert.throws(() => parseCompletionRepresentativeArguments(args));
  const audit = base.map((item, index) => index === 1 ? 'audit' : item);
  assert.throws(() => parseCompletionRepresentativeArguments(audit));
  assert.equal(parseCompletionRepresentativeArguments([...audit, '--report', 'R', '--report-evidence', 'RE'])['--operation'], 'audit');
  const inputs = loadInputs('BTN_open_SB_3bet_BB_call_BTN_fold'), full = { kind: 'representative', scope: 'full', cacheBatchSize: 512 };
  assert.throws(() => resolveModel11GatePlan(inputs, full));
  const plan = resolveModel11GatePlan(inputs, full, { executeFull: true });
  assert.equal(plan.boardList.length * plan.profiles.length * plan.heroes.length * plan.samples, 720000);
  assert.equal(plan.street, 'all'); assert.equal(plan.samples, 10000); assert.equal(plan.cacheBatchSize, 512);
  assert.throws(() => resolveModel11GatePlan(inputs, { kind: 'representative', scope: 'diagnostic', boardIds: ['As7d2c'], street: 'all', samples: 16, profiles: ['passive'], heroes: ['SB'], cacheBatchSize: 512 }));
});
test('all paired returns contribute and unresolved cells suppress survivor EV', () => {
  const cell = { board: 'board', split: null, hero: 'SB', opponent: 'passive', samples: 2 };
  const acc = completionCellAccumulator(), event = { proofHash: 'unit-proof', randomIndex: 1 };
  accountCompletionRepresentativeTrial(acc, { index: 0, status: 'complete', candidateReturn: 10, baselineReturn: 0, completionDecisions: [] }, 0, 2);
  accountCompletionRepresentativeTrial(acc, { index: 1, status: 'complete', candidateReturn: -20, baselineReturn: 4, completionDecisions: [event] }, 1, 2);
  const row = completionRepresentativeCellSummary(cell, acc); assert.equal(row.candidate_ev_bb.mean, -5); assert.equal(row.delta_bb.mean, -7);
  assert.equal(row.completedByPolicy, 1); assert.equal(row.offModelOccurrences, 1); assert.equal(row.validatedProofs, 1);
  assert.throws(() => accountCompletionRepresentativeTrial(completionCellAccumulator(), { index: 1, status: 'complete', candidateReturn: 1, baselineReturn: 0, completionDecisions: [] }, 0, 2));
  const stopped = completionCellAccumulator();
  accountCompletionRepresentativeTrial(stopped, { index: 0, status: 'complete', candidateReturn: 10, baselineReturn: 0, completionDecisions: [] }, 0, 2);
  accountCompletionRepresentativeTrial(stopped, { index: 1, status: 'unresolved-off-model', baselineReturn: 2, completionDecisions: [],
    unresolved: { index: 1, status: 'off-model-observed-action', message: 'typed', decision: { request: {}, randomIndex: 1 }, zeroLikelihoodProof: null } }, 1, 2);
  const blocked = completionRepresentativeCellSummary(cell, stopped); assert.equal(blocked.candidate_ev_bb, null); assert.equal(blocked.delta_bb, null); assert.equal(blocked.unresolvedCount, 1);
});

test('bounded strict balance parts exactly rehydrate and reject missing/tampered rows', () => {
  // Storage-only fixture, not a strategy-quality or full-board numerical claim.
  const binding = { kind: 'unit-storage-only', identity: 'unit' }, root = mkdtempSync(join(tmpdir(), 'model11-balance-parts-'));
  const store = openCompletionRepresentativeEvidence(root, binding);
  const balance = { kind: 'unit-original-aggregate', version: 2, complete: true, selectedBoards: 12, findings: [], results: [],
    prefixCoverage: Array.from({ length: 300 }, (_, index) => ({ prefixIdentity: String(index), exactCoverage: 'x'.repeat(1000) })) };
  const saved = persistCompletionRepresentativeBalance(store, balance);
  assert.equal(saved.prefixChunks.length, 3); assert.equal(saved.prefixCoverageCount, 300);
  assert.deepEqual(readCompletionRepresentativeBalance(store, saved), balance);
  assert.equal(saved.balanceHash, contentHash(balance)); assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 16 * 1024 * 1024);
  for (const edit of [r => r.bindingHash = 'stale', r => r.prefixChunks.pop(), r => r.prefixChunks[0].count--,
      r => r.prefixChunks[0].sha256 = 'tampered', r => r.findings.push({ check: 'injected' }), r => r.balanceHash = 'tampered']) {
    const altered = structuredClone(saved); edit(altered); assert.throws(() => readCompletionRepresentativeBalance(store, altered));
  }
});
