// Two official paired-board canonical-prefix controls, not full numerical evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitFresh } from './model11-execution-fixtures.mjs';
import { seatRange, boards as representativeBoards } from '../../scripts/postflop-ai/inputs.mjs';
import { contentHash, savedPayloadHash } from '../../scripts/postflop-ai/effective-law-identity.mjs';
import { createModel11BehaviorCompletion } from '../../scripts/postflop-ai/offpath-behavior-model11.mjs';
import { captureCompletionRepresentativeSource } from '../../scripts/postflop-ai/model11-completion-representative-source.mjs';
import { model11CompletionRepresentativeBinding, compactCompletionDecision, validateCompletionRepresentativeDecision } from '../../scripts/postflop-ai/model11-completion-representative-contract.mjs';

test('official KcKd4h and8c8d2h retain original plan/deal order while canonical completion prefixes validate', () => {
  const { inputs, flop, later, execution: original } = fixture(); original.releaseBoardCaches();
  const revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const boards = ['KcKd4h', '8c8d2h'].map(id => representativeBoards().find(board => board.id === id)), controls = [];
  assert.deepEqual(boards.map(board => board.cards), [[44, 45, 10], [24, 25, 2]]);
  for (const board of boards) {
    const before = structuredClone(board), plan = { kind: 'representative', scope: 'diagnostic', boardList: [board], street: 'all', authored: true,
      samples: 1, profiles: ['standard'], heroes: [inputs.spot.ip, inputs.spot.oop], cacheBatchSize: 512, seed: inputs.config.seed };
    const binding = model11CompletionRepresentativeBinding(inputs, revised, linked, plan, captureCompletionRepresentativeSource(), {});
    const execution = createModel11BehaviorCompletion(inputs, revised, linked), request = { board: board.cards, path: { flop: ['bet33'] } };
    try {
      const prefix = execution.prefix(request), ownCombo = seatRange(inputs, prefix.pending.seat, prefix.board)[0].combo;
      assert.notDeepEqual(prefix.board.slice(0, 3), board.cards); assert.deepEqual(prefix.board.slice(0, 3), [...board.cards].sort((a, b) => b - a));
      const choice = execution.sample(request, ownCombo, .5); assert.equal(choice.law.provenance.kind, 'off-model-saved-policy-behavior-completion');
      let proof;
      const event = compactCompletionDecision({ request, seat: prefix.pending.seat, node: prefix.pending.node, random: .5, label: choice.label, action: choice.action, law: choice.law }, ownCombo, 1, value => proof = value);
      const cell = { board: board.id, split: board.split, hero: prefix.pending.seat, opponent: 'standard', samples: 1, seed: plan.seed, cacheBatchSize: 512 };
      assert.equal(validateCompletionRepresentativeDecision(execution, binding, cell, event, () => proof), proof.proofHash);
      assert.deepEqual(board, before); assert.deepEqual(binding.plan.boardList[0], before);
      // A genuinely different board still fails; canonicalization is only a copy
      // at this validation boundary, never a change to seed or sampling inputs.
      const stale = structuredClone(event); stale.request.board = board.id === 'KcKd4h' ? boards[1].cards : boards[0].cards;
      assert.throws(() => validateCompletionRepresentativeDecision(execution, binding, cell, stale, () => proof));
      controls.push({ board: before, canonicalFlop: prefix.board.slice(0, 3), proofHash: proof.proofHash, lawHash: event.lawHash,
        sourceBound: true, completionValidated: true, originalPlanOrderPreserved: true });
    } finally { execution.releaseBoardCaches(); }
  }
  emitFresh('completion-official-paired-board-controls', { sourceIdentityHash: captureCompletionRepresentativeSource().identityHash, controls,
    checks: { bothOfficialPairedBoardsPassed: true, distinctBoardRejected: true, planCardsAndSeedUnchanged: true } });
});
