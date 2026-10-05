import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { fixture } from './helpers/model11-execution-fixtures.mjs';
import { createModel11Execution } from '../scripts/postflop-ai/execution-model11.mjs';
import { createModel11BalanceFacade } from '../scripts/postflop-ai/gate-model11.mjs';
import { replayDecision, comboId } from '../scripts/postflop-ai/defence.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { requestBeforeEntry } from '../scripts/postflop-ai/decision-prefix.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { contentHash, savedPayloadHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
const request = (cards, path) => ({ board: parseCards(cards, cards.length / 2), path });
const ownCombo = (inputs, prefix) => comboRange(inputs.seatRows[prefix.pending.seat], 'freq', prefix.board)[0].combo;
const errorOf = operation => {
  try { operation(); assert.fail('Expected failure'); }
  catch (error) { if (error.code === 'ERR_ASSERTION') throw error; return { name: error.name, status: error.status, message: error.message }; }
};

// Test the real private reuse guard without exposing it as a public cache API.
const source = readFileSync(new URL('../scripts/postflop-ai/gate-model11.mjs', import.meta.url), 'utf8');
const declaration = source.match(/^function gateRequestKey\(request\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(declaration);
const key = runInThisContext(`(${declaration})`);

test('gate reuse key includes every board/path value and bypasses unusual derived arrays', () => {
  const req = { board: [40, 29, 10], path: { flop: ['check', 'check'], turn: [], river: [] } }, expected = key(req);
  assert.equal(key(structuredClone(req)), expected);
  for (const change of [value => value.board.reverse(), value => value.board[0]++, value => value.path.flop[0] = 'bet33',
    value => value.path.turn.push('check'), value => value.path.river.push('check')]) {
    const next = structuredClone(req); change(next); assert.notEqual(key(next), expected);
  }
  for (const array of [[40,,10], Object.assign([40,29,10], { extra: true }), Object.assign([40,29,10], { [Symbol()]: true }),
    [40,29,NaN], [40,29,undefined], [40,29,29], new (class extends Array {})(40,29,10)]) assert.equal(key({ ...req, board: array }), null);
  let reads = 0; const getter = [40,29,10];
  Object.defineProperty(getter, 0, { enumerable: true, get() { reads++; return 40; } });
  assert.equal(key({ ...req, board: getter }), null); assert.equal(reads, 0);
  const hidden = [40,29,10]; Object.defineProperty(hidden, 0, { enumerable: false });
  assert.equal(key({ ...req, board: hidden }), null);
  assert.equal(key({ ...req, path: { ...req.path, flop: [new String('check')] } }), null);
});

test('prepared execution keeps full laws/provenance, mutable input isolation and per-combo errors', () => {
  const { inputs, flop, later, execution } = fixture(), rawBefore = contentHash({ inputs, flop, later });
  for (const req of [request('Jc9d4h', { flop: [] }), request('Jc9d4h', { flop: ['check'] }),
    request('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] })]) {
    const original = structuredClone(req), prepared = execution.prepareRequest(req), combo = ownCombo(inputs, prepared.prefix);
    const law = execution.law(original, combo);
    assert.deepEqual(prepared.prefix, execution.prefix(original)); assert.deepEqual(prepared.law(combo), law);
    assert.ok(Object.isFrozen(prepared)); assert.ok(Object.isFrozen(prepared.prefix.board));
    assert.ok(Object.isFrozen(prepared.law(combo).provenance.prefix.geometry.stacks));
    req.board[0] = req.board[1]; req.path.flop.push('invalid-after-preparation');
    assert.deepEqual(prepared.law(combo), law);
    assert.deepEqual(errorOf(() => execution.law(req, combo)), errorOf(() => execution.prepareRequest(req)));
    for (const bad of [null, [0], [combo[0], combo[0]], [original.board[0], combo[1]], [NaN, combo[1]]]) {
      assert.deepEqual(errorOf(() => prepared.law(bad)), errorOf(() => execution.law(original, bad)));
    }
    execution.releaseBoardCaches(); assert.deepEqual(prepared.law(combo), law);
    assert.throws(() => execution.law(prepared, combo), /Only revealed/);
    assert.throws(() => { prepared.prefix.board[0] = 0; }, TypeError);
  }
  assert.equal(contentHash({ inputs, flop, later }), rawBefore);
  execution.releaseBoardCaches();
});

test('prepared requests retain public rejection contracts and per-execution policy identity', () => {
  const { inputs, flop, later, execution } = fixture(), req = request('Jc9d4h', { flop: [] });
  for (const invalid of [{ ...req, opponentHole: [0,1] }, { ...req, path: { flop: [], river: ['check'] } },
    { ...req, board: [0,0,1] }, { ...req, path: { flop: [12] } }, { ...req, path: { flop: ['unknown'] } }]) {
    assert.deepEqual(errorOf(() => execution.prepareRequest(invalid)), errorOf(() => execution.prefix(invalid)));
  }
  const revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const other = createModel11Execution(inputs, revised, linked), left = execution.prepareRequest(req), right = other.prepareRequest(req);
  const combo = ownCombo(inputs, left.prefix);
  assert.notDeepEqual(execution.identity, other.identity);
  assert.deepEqual(left.law(combo), execution.law(req, combo)); assert.deepEqual(right.law(combo), other.law(req, combo));
  assert.notDeepEqual(left.law(combo).provenance.modelIdentity, right.law(combo).provenance.modelIdentity);
  execution.releaseBoardCaches(); other.releaseBoardCaches();
});

test('warm gate reuse still rejects live geometry/pending mutations and invalid history', () => {
  const { inputs, flop, later } = fixture(), bridge = createModel11BalanceFacade(inputs, flop, later);
  const req = request('Jc9d4h', { flop: ['check'] }), table = replayDecision(inputs, req.board, req.path, inputs.config);
  const pending = table.log.at(-1), combo = ownCombo(inputs, bridge.execution.prefix(req));
  const inspect = () => bridge.facade.observableMix(table, req.board, pending.node, combo);
  const expected = inspect(); assert.deepEqual(inspect(), expected);
  for (const [object, property, value] of [[table, 'pot', table.pot + 1], [table.stacks, pending.seat, table.stacks[pending.seat] - 1],
    [table.invested, pending.seat, table.invested[pending.seat] + 1], [pending, 'seat', 'invalid'],
    [pending, 'node', 'invalid'], [pending, 'action', 'check'], [pending, 'boardLen', 4], [pending, 'index', 0]]) {
    const before = object[property]; object[property] = value;
    assert.throws(inspect, error => error.status === 'invalid-gate-adapter');
    object[property] = before; assert.deepEqual(inspect(), expected);
  }
  const before = table.path.flop[0]; table.path.flop[0] = 'invalid';
  assert.throws(inspect, error => error.status === 'invalid-public-prefix');
  table.path.flop[0] = before; assert.deepEqual(inspect(), expected);
  const card = req.board[0]; req.board[0] = req.board[1];
  assert.throws(inspect, error => error.status === 'invalid-public-prefix');
  req.board[0] = card; assert.deepEqual(inspect(), expected);
  bridge.facade.releaseBoardCaches(); assert.equal(bridge.execution.cacheStats().entries, 0); assert.deepEqual(inspect(), expected);
  assert.equal(bridge.coverage().length, 1);
  bridge.facade.releaseBoardCaches();
});

test('gate reuse separates same-geometry board/history changes and preserves saved combo order', () => {
  const { inputs, flop, later } = fixture(), before = contentHash({ inputs, flop, later }), bridge = createModel11BalanceFacade(inputs, flop, later);
  const root = request('Jc9d4h', { flop: [] }), table = replayDecision(inputs, root.board, root.path, inputs.config);
  const inspect = (req, liveTable = table) => {
    const prefix = bridge.execution.prefix(req), combo = ownCombo(inputs, prefix);
    assert.deepEqual(bridge.facade.observableMix(liveTable, req.board, prefix.pending.node, combo), bridge.execution.law(req, combo).physicalMass);
    const items = bridge.facade.rangeItems(liveTable, req.board, prefix.pending.seat);
    const state = bridge.execution.rangeState(req, prefix.pending.seat);
    assert.deepEqual(items.map(row => row.combo), comboRange(inputs.seatRows[prefix.pending.seat], 'freq', req.board)
      .filter(row => state.weights[comboId(...row.combo)] > 0).map(row => row.combo));
  };
  inspect(root); inspect(root);
  const changedBoard = request('Jc9d5h', { flop: [] }); inspect(changedBoard); inspect(root);
  const checked = request('Jc9d4h', { flop: ['check'] }), next = replayDecision(inputs, checked.board, checked.path, inputs.config);
  // Reuse the same mutable table object with a different, valid public history.
  for (const property of ['path', 'log', 'pot', 'stacks', 'invested']) table[property] = next[property];
  inspect(checked); inspect(checked);
  assert.equal(bridge.coverage().length, 3);
  assert.equal(contentHash({ inputs, flop, later }), before);
  bridge.facade.releaseBoardCaches();
});


test('unusual derived requests retain both original public prefix validations', () => {
  const { inputs, flop, later } = fixture(), bridge = createModel11BalanceFacade(inputs, flop, later);
  const req = request('Jc9d4h', { flop: [] }), table = replayDecision(inputs, req.board, req.path, inputs.config);
  const pending = table.log.at(-1), combo = ownCombo(inputs, bridge.execution.prefix(req));
  let reads = 0;
  class Board extends Array { static get [Symbol.species]() { reads++; return Board; } }
  const board = new Board(...req.board);
  const baselineRequest = requestBeforeEntry(table, board, pending);
  bridge.execution.prefix(baselineRequest);
  const expected = bridge.execution.law(baselineRequest, combo).physicalMass, baselineReads = reads;
  reads = 0;
  assert.deepEqual(bridge.facade.observableMix(table, board, pending.node, combo), expected);
  assert.equal(reads, baselineReads); assert.ok(reads > 1);
  reads = 0;
  assert.deepEqual(bridge.facade.observableMix(table, board, pending.node, combo), expected);
  assert.equal(reads, baselineReads);
  bridge.facade.releaseBoardCaches();
});

test('prepared off-model failures preserve complete proofs on flop and later streets', () => {
  const { inputs, flop, later } = fixture(), revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const execution = createModel11Execution(inputs, revised, linked);
  const failed = operation => {
    try { operation(); assert.fail('Expected off-model failure'); }
    catch (error) {
      assert.equal(error.status, 'off-model-observed-action'); assert.ok(error.zeroLikelihoodProof);
      return { status: error.status, message: error.message, proof: error.zeroLikelihoodProof };
    }
  };
  for (const req of [request('Jc9d4h', { flop: ['bet33'] }), request('Jc9d4h2s', { flop: ['bet33', 'call'], turn: [] })]) {
    const prepared = execution.prepareRequest(req), combo = ownCombo(inputs, prepared.prefix);
    const direct = failed(() => execution.law(req, combo));
    assert.deepEqual(failed(() => prepared.law(combo)), direct);
    execution.releaseBoardCaches(); assert.deepEqual(failed(() => prepared.law(combo)), direct);
  }
  execution.releaseBoardCaches();
});
