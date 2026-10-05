import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from './helpers/model11-execution-fixtures.mjs';
import { createModel11Execution } from '../scripts/postflop-ai/execution-model11.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { contentHash, savedPayloadHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
const request = (cards, path) => ({ board: parseCards(cards, cards.length / 2), path });
const observe = law => ({ physicalMass: law.physicalMass, equity: law.provenance.equity });
const failure = operation => {
  try { operation(); assert.fail('Expected failure'); }
  catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    return { name: error.name, status: error.status, message: error.message,
      ...(error.zeroLikelihoodProof ? { zeroLikelihoodProof: error.zeroLikelihoodProof } : {}) };
  }
};

test('gate vector view exactly matches full compiler law across every base combo and street', () => {
  const { inputs, execution } = fixture(), statuses = new Set(), realization = new Set();
  let combos = 0, aliases = 0;
  for (const req of [request('As7d2c', { flop: [] }), request('Jc9d4h', { flop: ['check'] }),
    request('Jc9d4h', { flop: ['bet33'] }), request('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] }),
    request('Jc9d4h2s8c', { flop: ['check', 'check'], turn: ['bet125', 'call'], river: [] }),
    request('Jc9d4h2s8c', { flop: ['check', 'check'], turn: ['check', 'check'], river: ['bet33'] })]) {
    const prepared = execution.prepareRequest(req);
    aliases += prepared.prefix.pending.observation.classes.filter(row => row.aliases.length > 1).length;
    for (const row of comboRange(inputs.seatRows[prepared.prefix.pending.seat], 'freq', req.board)) {
      const full = prepared.law(row.combo), view = prepared.gateObservation(row.combo);
      assert.deepEqual(view, observe(full)); assert.deepEqual(Object.keys(view.physicalMass), Object.keys(full.physicalMass));
      assert.ok(Object.isFrozen(view)); assert.ok(Object.isFrozen(view.physicalMass));
      statuses.add(view.equity); realization.add(full.provenance.ownRealization); combos++;
    }
  }
  assert.ok(combos > 100); assert.ok(aliases > 0); assert.ok(statuses.has('known')); assert.ok(statuses.has('not-facing'));
  assert.ok(realization.has('positive')); assert.ok(realization.has('zero-model-reach'));
  execution.releaseBoardCaches();
});

test('gate view retains per-combo errors, immutable snapshots and cache-clear lifecycle', () => {
  const { inputs, flop, later, execution } = fixture(), raw = contentHash({ inputs, flop, later });
  const req = request('Jc9d4h', { flop: [] }), saved = structuredClone(req), prepared = execution.prepareRequest(req);
  const combo = comboRange(inputs.seatRows[prepared.prefix.pending.seat], 'freq', req.board)[0].combo;
  const expected = observe(prepared.law(combo));
  assert.deepEqual(prepared.gateObservation(combo), expected);
  for (const invalid of [null, [0], [combo[0],combo[0]], [req.board[0],combo[1]], [NaN,combo[1]], [52,combo[1]], ['0',combo[1]]]) {
    assert.deepEqual(failure(() => prepared.gateObservation(invalid)), failure(() => prepared.law(invalid)));
  }
  const supported = new Set(comboRange(inputs.seatRows[prepared.prefix.pending.seat], 'freq', req.board).map(row => row.combo.slice().sort((a,b)=>a-b).join(',')));
  let outside = null;
  for (let a = 0; a < 52 && !outside; a++) for (let b = a + 1; b < 52; b++) {
    if (!req.board.includes(a) && !req.board.includes(b) && !supported.has(`${a},${b}`)) { outside = [a,b]; break; }
  }
  assert.ok(outside); assert.equal(failure(() => prepared.gateObservation(outside)).status, 'outside-base-support');
  assert.deepEqual(failure(() => prepared.gateObservation(outside)), failure(() => prepared.law(outside)));
  req.board[0] = req.board[1]; req.path.flop.push('invalid');
  assert.deepEqual(prepared.gateObservation(combo), expected);
  execution.releaseBoardCaches(); assert.equal(execution.cacheStats().entries, 0);
  assert.deepEqual(prepared.gateObservation(combo), expected); assert.equal(execution.cacheStats().active, 0);
  assert.throws(() => { prepared.gateObservation(combo).physicalMass.check = 0; }, TypeError);
  const zero = createModel11Execution(inputs, flop, later, { cache: { entries: 0, numericBytes: 0, metadataBytes: 0 } });
  assert.deepEqual(zero.prepareRequest(saved).gateObservation(combo), expected); assert.equal(zero.cacheStats().entries, 0);
  assert.equal(contentHash({ inputs, flop, later }), raw);
  execution.releaseBoardCaches(); zero.releaseBoardCaches();
});

test('gate view preserves full off-model proofs instead of fabricating a physical mix', () => {
  const { inputs, flop, later } = fixture(), revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const execution = createModel11Execution(inputs, revised, linked);
  for (const req of [request('Jc9d4h', { flop: ['bet33'] }), request('Jc9d4h2s', { flop: ['bet33', 'call'], turn: [] })]) {
    const prepared = execution.prepareRequest(req), combo = comboRange(inputs.seatRows[prepared.prefix.pending.seat], 'freq', req.board)[0].combo;
    const full = failure(() => prepared.law(combo)); assert.equal(full.status, 'off-model-observed-action'); assert.ok(full.zeroLikelihoodProof);
    assert.deepEqual(failure(() => prepared.gateObservation(combo)), full);
    execution.releaseBoardCaches(); assert.deepEqual(failure(() => prepared.gateObservation(combo)), full);
  }
  execution.releaseBoardCaches();
});

test('full law compiler body and proof implementation remain byte-identical to reviewed 87a', () => {
  const read = name => readFileSync(new URL(`../scripts/postflop-ai/${name}`, import.meta.url), 'utf8');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex'), source = read('effective-reach.mjs');
  const start = source.indexOf('  law(request, combo) {'), end = source.indexOf('  // Gate-only projection', start);
  assert.ok(start > 0 && end > start);
  assert.equal(hash(source.slice(start,end)), '0f3d2728a2ad5528e44be43c156eb5b79bda8138e7fd249105f3285c3b560209');
  assert.equal(hash(read('effective-action-law.mjs')), '7c229ea339eae16bd390dde5e758f626ad3fd2a262c8615c76fb52632c2f851c');
  assert.equal(hash(read('model11-zero-proof.mjs')), '3a6a36e343cc313e9ff1efdcd625fcbeb855e0613e9c0f1fec612d7c284e10ab');
  const view = source.slice(source.indexOf('  gateObservationAtPrefix(prefix, combo) {'), source.indexOf('  rangeState(request, seat) {'));
  assert.match(view, /const vector = this\.prepare\(prefix\)/); assert.match(view, /vector\.physical\[i\]\[id\]/);
  assert.doesNotMatch(view, /compileDeclaredPolicyLaw|playedActionMass|provenance/);
});
