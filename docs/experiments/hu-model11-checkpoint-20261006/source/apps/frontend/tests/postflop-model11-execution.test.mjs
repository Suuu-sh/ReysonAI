import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitFresh, selection } from './helpers/model11-execution-fixtures.mjs';
import { createModel11Execution } from '../scripts/postflop-ai/execution-model11.mjs';
import { playModel11Hand, simulateModel11, model11SampleStats, summarizeModel11Trials } from '../scripts/postflop-ai/simulation-model11.mjs';
import { summarizeModel11Prefix, balanceModel11, auditModel11Boards } from '../scripts/postflop-ai/balance-model11.mjs';
import { evaluateModel11, model11AuthoringPrompt } from '../scripts/postflop-ai/evaluate-model11.mjs';
import { balancedBeliefContract, referenceExecutor, sampleEffectiveAction } from '../scripts/postflop-ai/effective-action-law.mjs';
import { EffectiveReachError } from '../scripts/postflop-ai/decision-prefix.mjs';
import { parseCards, handTier } from '../scripts/postflop-ai/model.mjs';
import { NODES, choose, opponentMix } from '../scripts/postflop-ai/policy.mjs';
import { LATER_NODES } from '../scripts/postflop-ai/later-tree.mjs';
import { referenceLaterMix, laterPolicyMix } from '../scripts/postflop-ai/later-policy.mjs';
import { Defence, comboId } from '../scripts/postflop-ai/defence.mjs';
import { equitiesVersus, equityVersus } from '../scripts/postflop-ai/range-equity.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { savedPayloadHash, contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { slowPrefixReference } from './helpers/model11-slow-reference.mjs';
const request = (board, path) => ({ board: parseCards(board, board.length / 2), path });
const cardsOf = id => [Math.floor(id / 52), id % 52];
const rawLaw = law => ({ rawMix: law.rawMix, labelMass: law.labelMass, physicalMass: law.physicalMass });
const hex = values => [...values].map(value => { const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value); return bytes.toString('hex'); });
function independentMass(raw, order, observation) {
  let sum = 0, previous = 0; const labelMass = {};
  order.forEach((label, index) => { sum += raw[label]; const cut = index === order.length - 1 ? 100 : Math.max(0, Math.min(100, sum)); labelMass[label] = cut - previous; previous = cut; });
  return { rawMix: raw, labelMass, physicalMass: Object.fromEntries(observation.classes.map(group => [group.action, group.aliases.reduce((sum, label) => sum + labelMass[label], 0)])) };
}

test('model11 adapter contracts reject private future reference-belief and unknown plan inputs', () => {
  const { inputs, flop, later, execution } = fixture(), req = request('Jc9d4h', { flop: [] });
  assert.equal(execution.belief.identity, balancedBeliefContract().identity);
  assert.ok(Object.isFrozen(execution.spot)); assert.ok(Object.isFrozen(execution.identity));
  assert.throws(() => execution.prefix({ ...req, opponentHole: [0, 1] }), /Only revealed/);
  assert.throws(() => execution.prefix({ ...req, path: { flop: [], river: ['check'] } }), /Future actions/);
  assert.throws(() => createModel11Execution(inputs, flop, later, { profile: 'passive' }), /Unknown/);
  assert.throws(() => createModel11Execution(inputs, flop, later, { belief: referenceExecutor('passive') }), /balanced/);
  assert.throws(() => evaluateModel11(inputs, flop, later, { mode: 'balance', requests: [req], profile: 'passive' }), /Unknown/);
  assert.deepEqual(model11SampleStats([7]), { mean: 7, sampleCount: 1, status: 'insufficient-samples-for-ci', ci95: null });
  assert.equal(model11SampleStats([0, 2]).sampleCount, 2); assert.ok(model11SampleStats([0, 2]).ci95[0] < 1);
  const authoring = model11AuthoringPrompt(inputs, 'flop');
  assert.match(authoring.prompt, /execution model 11/); assert.match(authoring.prompt, /balanced-vs-balanced/);
  assert.doesNotMatch(authoring.prompt, /against saved policy reach|earlier call\/fold histories by their saved/);
  assert.equal(inputs.spot.history !== undefined, true);
});

test('model11 reference adapter preserves old actual profile label behavior', () => {
  const { execution } = fixture(); let aliasClasses = 0;
  for (const req of [request('Jc9d4h2s8c', { flop: ['check', 'check'], turn: ['bet125', 'call'], river: [] }), request('Jc9d4h', { flop: [] }), request('Jc9d4h2s8c', { flop: ['check', 'check'], turn: ['check', 'check'], river: [] })]) {
    const prefix = execution.prefix(req), combo = parseCards('AcKd', 2), { node, line, street } = prefix.pending;
    aliasClasses += prefix.pending.observation.classes.filter(group => group.aliases.length > 1).length;
    for (const profile of ['standard', 'passive', 'aggressive']) {
      const raw = street === 'flop' ? opponentMix(node, combo, prefix.board, profile) : referenceLaterMix(node, combo, prefix.board, line, profile);
      for (const random of [0, .25, .5, .9999999999999999]) {
        const actual = execution.sampleReference(req, combo, referenceExecutor(profile), random);
        assert.equal(actual.label, choose(raw, random, NODES[node] ?? LATER_NODES[node]));
        assert.equal(actual.action, prefix.pending.observation.byAction[actual.label].action);
      }
    }
  }
  assert.ok(aliasClasses > 0, 'At least one actual reference prefix must pool size aliases');
});

test('model11 actual sampling and following reach use identical computed call factor', () => {
  const { execution } = fixture(), req = request('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] });
  const next = request('Jc9d4h2s8c', { flop: ['check', 'check'], turn: ['bet125', 'call'], river: [] });
  const combo = parseCards('QcAd', 2), id = comboId(...combo), actor = execution.prefix(req).pending.seat;
  const law = execution.law(req, combo), before = execution.rangeState(req, actor), after = execution.rangeState(next, actor);
  assert.ok(law.physicalMass.call > 0); assert.ok(before.weights[id] > 0);
  assert.equal(after.weights[id], before.weights[id] * (law.physicalMass.call / 100));
  for (const random of [0, .1, .25, .5, .9, .9999999999999999]) {
    const choice = execution.sample(req, combo, random); assert.deepEqual(choice.law, law);
    assert.deepEqual({ label: choice.label, action: choice.action }, sampleEffectiveAction(law, random));
  }
  emitFresh('actual-sampling-effective-factor', { execution: execution.identity, req, next, combo, law,
    before: before.weights[id], after: after.weights[id], checks: { positiveComputedCall: true, exactFactor: true } });
});

test('model11 hand executor hides opponent cards and future board at first actual decision', () => {
  const { inputs, execution } = fixture(), flop = parseCards('Jc9d4h', 3), hero = inputs.spot.oop;
  const own = comboRange(inputs.seatRows[hero], 'freq', flop)[0].combo;
  const other = comboRange(inputs.seatRows[inputs.spot.ip], 'freq', [...flop, ...own]).slice(0, 2).map(row => row.combo);
  const decisions = [];
  for (let index = 0; index < 2; index++) {
    const used = new Set([...flop, ...own, ...other[index]]), available = Array.from({ length: 52 }, (_, card) => card).filter(card => !used.has(card));
    const runout = available.slice(index * 2, index * 2 + 2), sentinel = new Error('stop-after-first-observation');
    assert.throws(() => playModel11Hand({ execution, hands: { [hero]: own, [inputs.spot.ip]: other[index] }, flop, runout, hero,
      profile: index ? 'aggressive' : 'passive', randoms: Array(24).fill(.5), onDecision: row => { decisions.push(row); throw sentinel; } }), error => error === sentinel);
  }
  assert.deepEqual(decisions[0], decisions[1]); assert.deepEqual(Object.keys(decisions[0].request).sort(), ['board', 'path']);
  assert.equal(decisions[0].request.board.length, 3);
});

test('model11 balance and selected-board consumers share complete prefix summary', () => {
  const { inputs, flop, later, execution } = fixture(), req = request('Jc9d4h', { flop: [] });
  const direct = summarizeModel11Prefix(execution, req), balance = balanceModel11(inputs, flop, later, { requests: [req] });
  const boardPlan = [{ id: 'Jc9d4h', cards: req.board, requests: [req] }];
  const boards = auditModel11Boards(inputs, flop, later, { boardPlan });
  assert.deepEqual(balance.results[0], direct); assert.deepEqual(boards.results[0].diagnostics[0], direct);
  assert.equal(boards.execution.identity, balance.execution.identity); assert.equal(direct.acceptance, 'not-evaluated; heuristic quality thresholds require a separate model11 gate');
  assert.throws(() => auditModel11Boards(inputs, flop, later, { boardPlan: [{ ...boardPlan[0], requests: [req, req] }] }), /Duplicate physical/);
  emitFresh('balanced-consumer-parity', { direct, checks: { exactPrefixSummary: true }, execution: execution.identity });
});

test('model11 actual reference off-model continuation is unresolved without survivor EV', () => {
  const { inputs, flop, later } = fixture(), revised = structuredClone(flop), linked = structuredClone(later);
  for (const rule of revised.policy.rules) if (rule.node.endsWith('_first')) for (const action of Object.keys(rule.mix)) rule.mix[action] = action === 'check' ? 100 : 0;
  revised.metadata.policy_hash = savedPayloadHash(revised.policy); linked.metadata.flop_policy_hash = revised.metadata.policy_hash;
  const execution = createModel11Execution(inputs, revised, linked), req = request('Jc9d4h', { flop: [] });
  const actor = execution.prefix(req).pending.seat, combo = comboRange(inputs.seatRows[actor], 'freq', req.board)[0].combo;
  const reference = execution.sampleReference(req, combo, referenceExecutor('aggressive'), .9999999999999999);
  assert.notEqual(reference.action, 'check'); assert.equal(execution.law(req, combo).physicalMass[reference.action], 0);
  assert.throws(() => execution.rangeState({ board: req.board, path: { flop: [reference.action] } }, inputs.spot.ip), error => error.status === 'off-model-observed-action');
  const hero = inputs.spot.ip, heroCombo = comboRange(inputs.seatRows[hero], 'freq', [...req.board, ...combo])[0].combo;
  const used = new Set([...req.board, ...combo, ...heroCombo]);
  const runout = Array.from({ length: 52 }, (_, card) => card).filter(card => !used.has(card)).slice(0, 2);
  assert.throws(() => playModel11Hand({ execution, hands: { [actor]: combo, [hero]: heroCombo }, flop: req.board, runout, hero,
    profile: 'aggressive', randoms: Array(24).fill(.9999999999999999) }), error => error.status === 'off-model-observed-action');
  const incomplete = summarizeModel11Trials({ attempted: 2, candidate: [50], baseline: [0], unresolved: [{ index: 1, status: 'off-model-observed-action' }] });
  assert.equal(incomplete.completed, 1); assert.equal(incomplete.status, 'unresolved-off-model');
  assert.equal(incomplete.candidate_ev_bb, null); assert.equal(incomplete.baseline_ev_bb, null); assert.equal(incomplete.delta_bb, null);
  // The separate fixed-seed one-trial smoke records its actual status rather than requiring an
  // accidental random reference action. Non-vacuous off-model and reporting proofs are above.
  const result = simulateModel11(inputs, revised, linked, { boardList: [{ id: 'Jc9d4h', cards: req.board }], samples: 1,
    profiles: ['aggressive'], heroes: [inputs.spot.ip] });
  assert.equal(result.counts.attempted, 1); assert.equal(result.counts.completed + result.counts.offModel, 1);
  for (const row of result.results) if (row.status === 'unresolved-off-model') {
    assert.equal(row.candidate_ev_bb, null); assert.equal(row.baseline_ev_bb, null); assert.equal(row.delta_bb, null);
  }
  emitFresh('off-model-actual-reference', { result, checks: { exactZeroBeliefReferenceActionPreserved: true,
    forcedOffModelHandExercised: true, mixedSampleEvNullingExercised: true, fixedSeedOffModel: result.counts.offModel } });
});

for (const spec of selection.cases) test(`fresh adapter tiny case ${spec.caseNumber} matches full eager current laws and both reach vectors`, () => {
  const { inputs, flop, later, execution } = fixture(spec.caseNumber), req = request(spec.board, spec.path);
  const summary = summarizeModel11Prefix(execution, req, { includeRows: true }), eager = slowPrefixReference(inputs, flop.policy, later.policy, req);
  const seats = [inputs.spot.ip, inputs.spot.oop]; assert.equal(summary.prefix.pending.node, spec.node);
  for (const seat of seats) assert.deepEqual(summary.ranges[seat].weights, Array.from(eager.weights[seat]));
  // Include base-supported zero-own-realization laws as well as positive summary rows.
  const allLaws = [...eager.laws].map(([id, expected]) => { const law = execution.law(req, cardsOf(id)); assert.deepEqual(rawLaw(law), expected); return { comboId: id, law, eager: expected }; });
  emitFresh(`tiny-adapter-${spec.caseNumber}`, { spec, summary, allLaws,
    rangesHex: Object.fromEntries(seats.map(seat => [seat, hex(eager.weights[seat])])),
    checks: { fullLawMismatches: 0, fullVectorMismatches: 0, currentAllinOwnMass: summary.actionWeights.allin ?? null },
    limitation: 'Fresh adapter current-prefix parity only. Does not establish post-allin unavailable-equity/sign or terminal-call coverage.' });
});

test('fresh positive reroute ratio adapter control has strictly positive mass before caps', () => {
  const { inputs, flop, later, execution } = fixture(2), req = request('7c6d4s2hQc', { flop: ['check', 'check'], turn: ['check', 'check'], river: [] });
  const summary = summarizeModel11Prefix(execution, req, { includeRows: true }), eager = slowPrefixReference(inputs, flop.policy, later.policy, req);
  const prefix = summary.prefix, actor = prefix.pending.seat, round6 = value => Math.round(value * 1e6) / 1e6;
  assert.equal(prefix.geometry.pot, 29); assert.equal(prefix.geometry.stacks[actor], 87);
  assert.ok(prefix.geometry.stacks[actor] / prefix.geometry.pot > inputs.config.river_allin_max_pot_ratio);
  class CurrentRaw extends Defence {
    reach(seat) { return eager.weights[seat]; }
    queryEquity(range, id, tables) { return equityVersus(range, id, tables, { wasm: false }); }
    queryEquities(range, ids, tables) { return equitiesVersus(range, ids, tables, { wasm: false }); }
  }
  const raw = new CurrentRaw(inputs, flop.policy, later.policy), cap = raw.betting(eager.table, prefix.board, prefix.pending.node);
  assert.deepEqual(cap.caps.map(row => row.action), ['bet33', 'bet75', 'bet125', 'allin']);
  const rows = [...eager.laws.keys()].map(id => {
    const combo = cardsOf(id), weight = eager.weights[actor][id], source = laterPolicyMix(later.policy, prefix.pending.node, combo, prefix.board, prefix.pending.line);
    const rerouted = source.allin > 0 ? { ...source, allin: 0, bet125: round6(source.bet125 + source.allin) } : { ...source };
    let expected = { ...rerouted }; const transfers = [];
    for (const item of cap.caps) if (cap.kind[id] === 2 && item.factor < 1) {
      const before = expected[item.action], passiveBefore = expected.check, after = round6(before * item.factor);
      if (after !== before) expected = { ...expected, [item.action]: after, check: round6(passiveBefore + before - after) };
      assert.equal(round6(expected.check + expected[item.action]), round6(passiveBefore + before));
      transfers.push({ action: item.action, before, after, passiveBefore, passiveAfter: expected.check });
    }
    const law = execution.law(req, combo), independent = independentMass(expected, law.actions, prefix.pending.observation);
    assert.deepEqual(rawLaw(law), independent); assert.deepEqual(rawLaw(law), eager.laws.get(id));
    return { comboId: id, combo, tier: handTier(combo, prefix.board), weight, classification: cap.kind[id], source, rerouted, transfers, law, independent };
  });
  const positive = rows.filter(row => row.weight > 0 && row.source.allin > 0), mass = positive.reduce((sum, row) => sum + row.weight * (row.source.allin / 100), 0);
  assert.ok(positive.length > 0 && mass > 0, 'Zero reroute is not coverage');
  for (const seat of [inputs.spot.ip, inputs.spot.oop]) assert.deepEqual(summary.ranges[seat].weights, Array.from(eager.weights[seat]));
  emitFresh('positive-reroute-ratio-fresh', { summary, caps: cap.caps, observedCaps: cap.observedCaps, rows,
    checks: { positiveRerouteCombos: positive.length, positiveRerouteMass: mass, completeLawMismatches: 0, vectorMismatches: 0 },
    limitation: 'Above-ratio reroute only; within-limit medium-tier reroute remains separate. No historical numeric result is a target.' });
  raw.releaseBoardCaches(); execution.releaseBoardCaches();
});

test('model11 adapter cache warm cold and zero-retention preserve exact current law', () => {
  const { inputs, flop, later, execution } = fixture(), req = request('Jc9d4h', { flop: [] }), combo = parseCards('AcKd', 2);
  const cold = execution.law(req, combo); assert.deepEqual(execution.law(req, combo), cold);
  execution.releaseBoardCaches(); assert.deepEqual(execution.law(req, combo), cold);
  const zero = createModel11Execution(inputs, flop, later, { cache: { entries: 0, numericBytes: 0, metadataBytes: 0 } });
  assert.deepEqual(zero.law(req, combo), cold); assert.equal(zero.cacheStats().entries, 0);
  execution.releaseBoardCaches(); zero.releaseBoardCaches();
});
