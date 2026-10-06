import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitFresh } from './helpers/model11-execution-fixtures.mjs';
import { createModel11BehaviorCompletion } from '../scripts/postflop-ai/offpath-behavior-model11.mjs';
import { summarizeModel11CompletionTrials } from '../scripts/postflop-ai/simulation-model11-completion.mjs';
import { evaluateModel11Completion } from '../scripts/postflop-ai/evaluate-model11-completion.mjs';
import { balancedBeliefContract, compileDeclaredPolicyLaw } from '../scripts/postflop-ai/effective-action-law.mjs';
import { multiplyDeclaredMass } from '../scripts/postflop-ai/effective-reach.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { comboId } from '../scripts/postflop-ai/defence.mjs';
import { raiseDepth } from '../scripts/postflop-ai/tree.mjs';
import { policyMix, effectiveMix } from '../scripts/postflop-ai/policy.mjs';
import { laterPolicyMix } from '../scripts/postflop-ai/later-policy.mjs';
import { parseCards, handTier } from '../scripts/postflop-ai/model.mjs';
import { savedPayloadHash, contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
const board = parseCards('Jc9d4h', 3), rootRequest = { board, path: { flop: [] } };
function forcedZero() {
  const { inputs, flop, later, execution: original } = fixture(); original.releaseBoardCaches();
  const revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const execution = createModel11BehaviorCompletion(inputs, revised, linked), request = { board, path: { flop: ['bet33'] } };
  const prefix = execution.prefix(request), combo = comboRange(inputs.seatRows[prefix.pending.seat], 'freq', board)[0].combo;
  let proof;
  assert.throws(() => execution.law(request, combo), error => { proof = error.zeroLikelihoodProof; return error.status === 'off-model-observed-action' && proof?.rows.length > 0; });
  return { inputs, revised, linked, execution, request, prefix, combo, proof };
}
function resign(proof) { const { proofHash, ...body } = proof; return { ...body, proofHash: contentHash(body) }; }

test('completion v1 has distinct behavior identity and exact onpath/warm/cold/rewind equality', () => {
  const { inputs, flop, later, execution: strict } = fixture();
  const execution = createModel11BehaviorCompletion(inputs, flop, later), actor = strict.prefix(rootRequest).pending.seat;
  const combo = comboRange(inputs.seatRows[actor], 'freq', board)[0].combo, expected = strict.law(rootRequest, combo);
  assert.equal(execution.belief.identity, balancedBeliefContract().identity);
  assert.deepEqual(execution.identity.model, strict.identity.model); assert.notEqual(execution.identity.identity, strict.identity.identity);
  assert.equal(execution.identity.normalExecutionIdentity, strict.identity.identity);
  assert.deepEqual(execution.behaviorLaw(rootRequest, combo), expected); assert.deepEqual(execution.behaviorLaw(rootRequest, combo), expected);
  execution.releaseBoardCaches(); assert.deepEqual(execution.behaviorLaw(rootRequest, combo), expected);
  for (const random of [0, .25, .9, .9999999999999999]) assert.deepEqual(execution.sample(rootRequest, combo, random), strict.sample(rootRequest, combo, random));
  assert.throws(() => createModel11BehaviorCompletion(inputs, flop, later, { profile: 'passive' }), /Unknown/);
  assert.throws(() => evaluateModel11Completion(inputs, flop, later, { mode: 'simulation', boardList: [{ id: 'test', cards: board }], samples: 1 }), /Explicit/);
  const forced = forcedZero(); forced.execution.behaviorLaw(forced.request, forced.combo);
  const rootCombo = comboRange(forced.inputs.seatRows[forced.execution.prefix(rootRequest).pending.seat], 'freq', board)[0].combo;
  assert.deepEqual(forced.execution.behaviorLaw(rootRequest, rootCombo), forced.execution.law(rootRequest, rootCombo));
  strict.releaseBoardCaches(); execution.releaseBoardCaches(); forced.execution.releaseBoardCaches();
});

test('completion v1 validates whole support and preserves strict offmodel without fake facts', () => {
  const { execution, request, prefix, combo, proof, revised } = forcedZero();
  const law = execution.behaviorLaw(request, combo), direct = execution.complete(request, combo, JSON.parse(JSON.stringify(proof)));
  assert.deepEqual(law, direct); assert.equal(law.provenance.zeroLikelihoodVerification.eligible, true);
  const saved = effectiveMix(policyMix(revised.policy, prefix.pending.node, combo, prefix.board), prefix.pending.canRaise);
  const expected = compileDeclaredPolicyLaw(saved, prefix.pending.observation.actions, prefix.pending.observation);
  for (const field of ['rawMix', 'actions', 'labelMass', 'physicalMass', 'classes']) assert.deepEqual(law[field], expected[field]);
  assert.equal(law.provenance.beliefStatus, 'off-model-observed-action'); assert.equal(law.provenance.equity, 'unknown-off-model');
  for (const field of ['posterior', 'equity', 'rangeFloor', 'rangeCeiling', 'valueBluff', 'blockers', 'inferredMdfAdjustment']) assert.equal(law.provenance.facts[field], null);
  assert.ok(law.provenance.facts.geometry.required > 0);
  assert.throws(() => execution.rangeState(request, prefix.pending.seat), error => error.status === 'off-model-observed-action');
  execution.releaseBoardCaches(); assert.deepEqual(execution.behaviorLaw(request, combo), law);
  emitFresh('offpath-completion-contract', { execution: execution.identity, request, combo, law,
    checks: { fullSupportValidated: true, strictStillOffModel: true, noPosterior: true, warmColdParity: true } });
  execution.releaseBoardCaches();
});

test('completion v1 rejects forged zero wrong ancestors illegal hands hidden inputs and underflow', () => {
  const { execution, inputs, request, combo, proof } = forcedZero();
  for (const edit of [p => p.rows.pop(), p => p.rows[0].beforeWeight *= 2, p => p.rows[0].physicalMass = 1e-8,
      p => p.underflow = true, p => p.beliefIdentity = 'wrong', p => p.actionOrder.reverse()]) {
    const altered = structuredClone(proof); edit(altered);
    assert.throws(() => execution.complete(request, combo, resign(altered)), error => error.status === 'invalid-zero-likelihood-proof');
  }
  assert.throws(() => execution.complete({ board, path: { flop: ['bet75'] } }, combo, proof), /descend/);
  assert.throws(() => execution.complete(rootRequest, combo, proof), /earlier/);
  assert.throws(() => execution.behaviorLaw({ ...request, opponentHole: [1, 2] }, combo), /Only revealed/);
  assert.throws(() => execution.behaviorLaw({ ...request, profile: 'passive' }, combo), /Only revealed/);
  assert.throws(() => execution.behaviorLaw({ ...request, path: { ...request.path, river: ['check'] } }, combo), /Future actions/);
  assert.throws(() => execution.behaviorLaw(request, [board[0], combo[1]]), error => error.status === 'invalid-private-combo');
  const actor = execution.prefix(request).pending.seat, support = new Set(comboRange(inputs.seatRows[actor], 'freq', board).map(row => comboId(...row.combo)));
  const outside = Array.from({ length: 52 }, (_, a) => Array.from({ length: 52 - a - 1 }, (_, i) => [a, a + i + 1])).flat().find(cards => cards.every(card => !board.includes(card)) && !support.has(comboId(...cards)));
  assert.ok(outside); assert.throws(() => execution.behaviorLaw(request, outside), error => error.status === 'outside-base-support');
  assert.throws(() => execution.complete(request, outside, proof), error => error.status === 'outside-base-support');
  assert.throws(() => execution.complete(request, combo, null), error => error.status === 'invalid-zero-likelihood-proof');
  assert.throws(() => multiplyDeclaredMass(Number.MIN_VALUE, 1), error => error.status === 'numerical-underflow');
  // A raw allin=0 can still carry the final-label remainder. Compilation must keep it.
  const req = { board: parseCards('Jc9d4h2s8c', 5), path: { flop: ['check', 'check'], turn: ['check', 'check'], river: [] } };
  const prefix = execution.prefix(req), actions = prefix.pending.observation.actions;
  const raw = Object.fromEntries(actions.map(action => [action, action === 'check' ? 99.999999 : 0]));
  const remainder = compileDeclaredPolicyLaw(raw, actions, prefix.pending.observation);
  assert.equal(raw.allin, 0); assert.ok(remainder.physicalMass.allin > 0);
  execution.releaseBoardCaches();
});

test('completion v1 paired accounting includes completed-by-policy returns and nulls unresolved cells', () => {
  const unitLaw = { kind: 'synthetic-unit-law-not-source-evidence' };
  const evidence = { random: .5, law: unitLaw, lawHash: contentHash(unitLaw), originalStatus: 'off-model-observed-action', zeroLikelihoodProof: { proofHash: 'unit-proof' }, verification: { eligible: true, proofHash: 'unit-proof' } };
  const trials = [ { index: 0, status: 'complete', candidateReturn: 10, baselineReturn: 0, completionDecisions: [] },
    { index: 1, status: 'complete', candidateReturn: -20, baselineReturn: 4, completionDecisions: [evidence] } ];
  const complete = summarizeModel11CompletionTrials({ attempted: 2, candidate: [10, -20], baseline: [0, 4], unresolved: [], trials });
  assert.equal(complete.completedByPolicy, 1); assert.equal(complete.completionDecisions, 1); assert.equal(complete.validatedProofs, 1);
  assert.equal(complete.offModelTrials, 1); assert.equal(complete.unresolvedCount, 0); assert.equal(complete.candidate_ev_bb.mean, -5); assert.equal(complete.delta_bb.mean, -7);
  assert.throws(() => summarizeModel11CompletionTrials({ attempted: 2, candidate: [10, 10], baseline: [0, 4], unresolved: [], trials }), /All completed/);
  const unresolved = summarizeModel11CompletionTrials({ attempted: 2, candidate: [10], baseline: [0], unresolved: [{ index: 1, status: 'off-model-observed-action' }],
    trials: [trials[0], { index: 1, status: 'unresolved-off-model', baselineReturn: 4, completionDecisions: [] }] });
  assert.throws(() => summarizeModel11CompletionTrials({ attempted: 2, candidate: [10], baseline: [0], unresolved: [{ index: 0, status: 'off-model-observed-action' }],
    trials: [trials[0], { index: 1, status: 'unresolved-off-model', baselineReturn: 4, completionDecisions: [] }] }), /index references/);
  assert.equal(unresolved.candidate_ev_bb, null); assert.equal(unresolved.baseline_ev_bb, null); assert.equal(unresolved.delta_bb, null); assert.equal(unresolved.unresolvedCount, 1);
});


test('completion v1 reroutes only public SPR tier rules before physical alias pooling', () => {
  const { inputs, flop, later, execution: original } = fixture(); original.releaseBoardCaches();
  const revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'bet33' ? 100 : 0;
  for (const rule of linked.policy.streets.river.rules) if (rule.node.endsWith('_first')) rule.mix = { check: 50, bet33: 10, bet75: 10, bet125: 10, allin: 20 };
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  linked.metadata.policy_hash = savedPayloadHash(linked.policy);
  const execution = createModel11BehaviorCompletion(inputs, revised, linked), early = { board, path: { flop: ['check'] } };
  let proof; assert.throws(() => execution.rangeState(early, inputs.spot.ip), error => { proof = error.zeroLikelihoodProof; return error.status === 'off-model-observed-action'; });
  const revealed = parseCards('Jc9d4h2s8c', 5), requests = [
    { board: revealed, path: { flop: ['check', 'check'], turn: ['check', 'check'], river: [] } },
    { board: revealed, path: { flop: ['check', 'check'], turn: ['bet33', 'call'], river: [] } },
    { board: revealed, path: { flop: ['check', 'check'], turn: ['bet125', 'call'], river: [] } },
  ];
  let above = 0, medium = 0, unchanged = 0, aliases = 0;
  for (const [index, request] of requests.entries()) {
    const prefix = execution.prefix(request), actor = prefix.pending.seat;
    const ratio = Math.round((prefix.pending.observation.byAction.allin.pot - prefix.geometry.pot) * 100) / 100 / prefix.geometry.pot;
    assert.equal(ratio > inputs.config.river_allin_max_pot_ratio, index === 0);
    if (index === 2) { assert.equal(prefix.pending.observation.byAction.bet125.action, 'allin'); aliases++; }
    const seen = new Set();
    for (const row of comboRange(inputs.seatRows[actor], 'freq', prefix.board)) {
      const tier = handTier(row.combo, prefix.board); if (seen.has(tier)) continue; seen.add(tier);
      const source = effectiveMix(laterPolicyMix(linked.policy, prefix.pending.node, row.combo, prefix.board, prefix.pending.line), prefix.pending.canRaise);
      assert.equal(source.allin, 20);
      const reroute = ratio > inputs.config.river_allin_max_pot_ratio || ['medium', 'draw'].includes(tier);
      const expectedRaw = reroute ? { ...source, allin: 0, bet125: 30 } : source;
      const expected = compileDeclaredPolicyLaw(expectedRaw, prefix.pending.observation.actions, prefix.pending.observation);
      const actual = execution.complete(request, row.combo, proof);
      for (const field of ['rawMix', 'actions', 'labelMass', 'physicalMass', 'classes']) assert.deepEqual(actual[field], expected[field]);
      if (index === 0) above++; else if (tier === 'medium') medium++; else unchanged++;
      if (index === 2 && tier === 'medium') { assert.equal(actual.rawMix.allin, 0); assert.ok(actual.physicalMass.allin > 0); }
    }
    assert.ok(seen.has('medium') && seen.size > 1);
  }
  assert.ok(above > 1 && medium > 0 && unchanged > 0 && aliases > 0);
  emitFresh('offpath-public-reroute-controls', { checks: { aboveRatioTiers: above, withinLimitMedium: medium, unchangedOtherTiers: unchanged, lowSprAliasPrefixes: aliases } });
  execution.releaseBoardCaches();
});


test('completion v1 keeps saved missing-raise normalization and deep-raise fixed behavior', () => {
  const { inputs, flop, later, execution: original } = fixture(); original.releaseBoardCaches();
  const revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'bet33' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const execution = createModel11BehaviorCompletion(inputs, revised, linked), early = { board, path: { flop: ['check'] } };
  let proof; assert.throws(() => execution.rangeState(early, inputs.spot.ip), error => { proof = error.zeroLikelihoodProof; return error.status === 'off-model-observed-action'; });
  for (const path of [['check', 'bet33', 'raise'], ['check', 'bet33', 'raise', 'raise']]) {
    const request = { board, path: { flop: path } }, prefix = execution.prefix(request);
    assert.equal(raiseDepth(prefix.pending.node), path.length - 2);
    const combo = comboRange(inputs.seatRows[prefix.pending.seat], 'freq', prefix.board)[0].combo;
    const raw = effectiveMix(policyMix(revised.policy, prefix.pending.node, combo, prefix.board), prefix.pending.canRaise);
    const expected = compileDeclaredPolicyLaw(raw, prefix.pending.observation.actions, prefix.pending.observation);
    const actual = execution.complete(request, combo, proof);
    for (const field of ['rawMix', 'actions', 'labelMass', 'physicalMass', 'classes']) assert.deepEqual(actual[field], expected[field]);
    if (raiseDepth(prefix.pending.node) >= 2) assert.equal(revised.policy.rules.some(rule => rule.node === prefix.pending.node), false);
    if (!prefix.pending.canRaise) assert.equal(actual.rawMix.raise ?? 0, 0);
  }
  execution.releaseBoardCaches();
});
