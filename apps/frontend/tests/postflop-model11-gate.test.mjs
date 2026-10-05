import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitFresh } from './helpers/model11-execution-fixtures.mjs';
import { createModel11BalanceFacade, checkModel11Balance } from '../scripts/postflop-ai/gate-model11.mjs';
import { replayDecision, comboId } from '../scripts/postflop-ai/defence.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { savedPayloadHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
const req = (text, path) => ({ board: parseCards(text, text.length / 2), path });

test('model11 gate facade preserves public prefix own-range order and actual law', () => {
  const { inputs, flop, later } = fixture(), bridge = createModel11BalanceFacade(inputs, flop, later);
  const request = req('Jc9d4h', { flop: [] }), table = replayDecision(inputs, request.board, request.path, inputs.config), pending = table.log.at(-1);
  const state = bridge.execution.rangeState(request, pending.seat);
  const expected = comboRange(inputs.seatRows[pending.seat], 'freq', request.board)
    .map(row => ({ combo: row.combo, weight: state.weights[comboId(...row.combo)] })).filter(row => row.weight > 0);
  assert.deepEqual(bridge.facade.rangeItems(table, request.board, pending.seat), expected);
  const combo = expected[0].combo;
  assert.deepEqual(bridge.facade.observableMix(table, request.board, pending.node, combo, { check: 0 }), bridge.execution.law(request, combo).physicalMass);
  assert.equal(bridge.facade.requirement(table, request.board, pending.node), null);
  assert.throws(() => bridge.facade.rangeItems({ ...table, pot: table.pot + 1 }, request.board, pending.seat), error => error.status === 'invalid-gate-adapter');
  emitFresh('gate-facade-public-contract', { coverage: bridge.coverage(), checks: { sameLaw: true, sameSavedAggregationOrder: true, staleGeometryRejected: true } });
  bridge.execution.releaseBoardCaches();
});

test('model11 gate requirements are derived from effective facing context and geometry', () => {
  const { inputs, flop, later } = fixture(), bridge = createModel11BalanceFacade(inputs, flop, later);
  const request = req('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] });
  const table = replayDecision(inputs, request.board, request.path, inputs.config), pending = table.log.at(-1), prior = table.log.at(-2);
  const state = bridge.execution.requirementState(request), requirement = bridge.facade.requirement(table, request.board, pending.node);
  assert.ok(requirement); assert.deepEqual(bridge.facade.context(table, request.board, pending.node), requirement);
  assert.equal(requirement.potBefore, prior.pot); assert.equal(requirement.mdf, prior.pot / (prior.pot + requirement.wager));
  assert.equal(requirement.required, requirement.call / (requirement.finalPot - requirement.rake));
  assert.equal(state.support.ownTotal, bridge.execution.rangeState(request, pending.seat).total);
  assert.equal(state.support.opponentTotal, bridge.execution.rangeState(request, prior.seat).total);
  assert.deepEqual(requirement, state.requirement);
  emitFresh('gate-effective-requirement', { state, coverage: bridge.coverage(), checks: { effectiveSupport: true, exactGeometry: true } });
  bridge.execution.releaseBoardCaches();
});

test('model11 gate certifies exact-zero enumerated prefix without changing actual off-model errors', () => {
  const { inputs, flop, later } = fixture(), revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const bridge = createModel11BalanceFacade(inputs, revised, linked), request = req('Jc9d4h', { flop: ['bet33'] });
  const table = replayDecision(inputs, request.board, request.path, inputs.config);
  assert.equal(bridge.facade.context(table, request.board, table.log.at(-1).node), null);
  assert.ok(bridge.coverage().some(row => row.state === 'proved-model-unreachable' && row.zeroLikelihoodProof));
  assert.throws(() => bridge.execution.rangeState(request, inputs.spot.ip), error => error.status === 'off-model-observed-action');
  bridge.execution.releaseBoardCaches();
  const result = checkModel11Balance(inputs, revised, linked, { boardList: [{ id: 'Jc9d4h', cards: request.board }], street: 'flop' });
  assert.equal(result.complete, true);
  assert.ok(result.prefixCoverage.some(row => row.state === 'proved-model-unreachable'));
  assert.equal(result.results[0].complete, true);
  emitFresh('gate-proved-model-unreachable', { result, checks: { exactZeroCertifiedBeforeSkip: true, actualObservationRemainsOffModel: true } });
});
