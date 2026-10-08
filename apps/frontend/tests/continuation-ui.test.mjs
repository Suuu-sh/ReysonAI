import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { continuationRoots, continuationTerminals, continuationDecisions } from '../src/estimated/continuation-tree.ts';
import { buildRangeUrlActionBlocks, decodeRangeUrl, encodeRangeUrl } from '../src/estimated/range-url.ts';
import { chooseContinuationAction, continuationLiveSeats } from '../src/estimated/continuation-flow.ts';
import { continuationSourceNames, createContinuationUiLoader, createContinuationUiRuntime, withContinuationAvailability } from '../src/estimated/continuation-ranges.ts';
import { completedFlopContext } from '../src/estimated/postflop-trial.ts';
import { POSTFLOP_SPOTS, MULTIWAY_POSTFLOP_CATALOG } from '../scripts/postflop-ai/spots.ts';
import { postflopAvailabilityError } from '../src/estimated/continuation-copy.ts';
const data = Object.fromEntries(continuationSourceNames.map(name => [name, JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), 'utf8'))]));
const runtime = createContinuationUiRuntime(data);
const token = step => step.action === 'fold' ? 'F' : step.action === 'call' ? 'C' : step.action === 'all_in' ? 'RAI' : `R${step.to_size_bb}`;
const query = history => `preflop_actions=${history.map(token).join('-')}`;
const context = (state, blocks = buildRangeUrlActionBlocks(state)) => completedFlopContext({ ...state, actionBlocks: blocks, isDefaultTable: true });

test('all 40 selected HU endpoints replay exact folds, sizes, sources and URL history', () => {
  const spots = POSTFLOP_SPOTS.filter(spot => spot.history);
  assert.equal(spots.length, 40);
  for (const spot of spots) {
    const terminal = continuationTerminals.find(node => node.id === spot.terminalId);
    const state = decodeRangeUrl(query(terminal.history));
    const blocks = buildRangeUrlActionBlocks(state);
    assert.deepEqual(blocks.at(-1).postflopEvents, terminal.history, spot.id);
    assert.deepEqual(continuationLiveSeats(blocks), terminal.live_participants);
    assert.equal(runtime.selectTerminal(terminal).status, 'saved', spot.id);
    assert.equal(context(state, blocks)?.spotId, spot.id);
    assert.equal(context(state, blocks)?.potBb, spot.potBb);
    const restored = decodeRangeUrl(encodeRangeUrl(state));
    assert.deepEqual(restored.continuationActions, state.continuationActions);
    assert.deepEqual(restored.squeezeResponse, state.squeezeResponse);
    assert.equal(context(restored)?.spotId, spot.id);
  }
});

test('each bounded family uses its exact saved current strategy and hand reach', () => {
  for (const family of ['squeeze', 'cold_four_bet', 'two_caller_squeeze', 'three_bet_cold_call']) {
    const node = continuationDecisions.find(node => node.family === family);
    const result = runtime.select({ kind: 'bounded', id: node.id });
    assert.equal(result.status, 'saved');
    assert.equal(result.spot.id, node.id);
    assert.equal(result.model.aggregates.size, 169);
    const row = result.spot.hands.find(row => row.call > 0);
    assert.equal(result.model.aggregates.get(row.hand).actions.call, row.call / 100);
    assert.ok([...result.model.aggregates.values()].some(row => row.unreachable));
  }
});

test('missing current/ancestor policy stays missing; exact zero support stays unreachable', () => {
  const first = data['continuation-responses'].spots[0];
  const missing = createContinuationUiRuntime({ ...data, 'continuation-responses': null });
  assert.equal(missing.select({ kind: 'bounded', id: first.id }).status, 'missing');
  const impossible = continuationDecisions.find(node => node.family === 'squeeze' && node.callers[0] === 'SB');
  assert.equal(runtime.select({ kind: 'bounded', id: impossible.id }).status, 'unreachable');
  const impossibleRoot = continuationRoots.find(node => node.family === 'squeeze' && node.callers[0] === 'SB');
  const impossibleEnd = continuationTerminals.find(node => node.root_id === impossibleRoot.id);
  assert.equal(runtime.selectTerminal(impossibleEnd).status, 'unreachable');
  const missingAncestor = createContinuationUiRuntime({ ...data, 'preflop-ranges': null });
  assert.equal(missingAncestor.select({ kind: 'bounded', id: first.id }).status, 'missing');
  const broken = structuredClone(data['squeeze-responses']);
  broken.spots[0].hands[0].fold = 101;
  assert.throws(() => createContinuationUiRuntime({ ...data, 'squeeze-responses': broken }), /不正|Invalid/);
});

test('pending or absent source data disables new choices and cannot offer a flop', () => {
  const spot = POSTFLOP_SPOTS.find(spot => spot.history);
  const terminal = continuationTerminals.find(node => node.id === spot.terminalId);
  const state = decodeRangeUrl(query(terminal.history));
  const blocks = buildRangeUrlActionBlocks(state);
  assert.equal(context(state, withContinuationAvailability(blocks, null)), null);
  assert.equal(context(state, withContinuationAvailability(blocks, runtime))?.spotId, spot.id);
  const current = buildRangeUrlActionBlocks(decodeRangeUrl(query(terminal.history.slice(0, -1))));
  assert.ok(withContinuationAvailability(current, null).at(-1).options.every(option => option.disabled));
  assert.ok(withContinuationAvailability(current, runtime).at(-1).options.some(option => !option.disabled));
});

test('rewinding a saved continuation clears only its later actions and preserves the cold root', () => {
  for (const family of ['squeeze', 'cold_four_bet', 'two_caller_squeeze', 'three_bet_cold_call']) {
    const terminal = continuationTerminals.find(node => node.family === family && node.terminal === 'flop' && node.history.length >= 8);
    const original = decodeRangeUrl(query(terminal.history));
    const blocks = buildRangeUrlActionBlocks(original);
    const selected = blocks.filter(block => block.continuationNode)[1];
    const rewound = { ...original, ...chooseContinuationAction(original, selected, null) };
    const replay = buildRangeUrlActionBlocks(rewound);
    assert.equal(replay.at(-1).continuationNode.id, selected.continuationNode.id);
    assert.equal(replay.at(-1).chosen, null);
    assert.deepEqual(rewound.coldAction, original.coldAction);
    assert.equal(context(rewound), null);
  }
});

test('outside folds remain explicit, two-caller 4bets stay 30BB and profiles remain gated', () => {
  const root = continuationRoots.find(node => node.family === 'two_caller_squeeze');
  const state = decodeRangeUrl(query(root.history));
  const blocks = buildRangeUrlActionBlocks(state);
  assert.ok(blocks.at(-1).options.some(option => option.label === 'Raise 30'));
  assert.deepEqual(blocks.slice(0, 6).map(block => block.position), ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  const outsider = blocks.find(block => block.position === 'SB');
  assert.equal(outsider.kind, 'stage3-entry');
  assert.equal(outsider.chosen, 'fold');
  assert.ok(outsider.options.some(option => option.action === 'call'));
  assert.equal(outsider.stage3Node.hero, 'SB');
  const terminal = continuationTerminals.find(node => node.family === 'cold_four_bet' && node.terminal === 'flop' && node.live_participants.length === 2);
  const complete = decodeRangeUrl(query(terminal.history));
  assert.equal(completedFlopContext({ ...complete, actionBlocks: buildRangeUrlActionBlocks(complete), isDefaultTable: false }).pilotAvailable, false);
});

test('board-impossible error offers another board without a guessed range', () => {
  const message = postflopAvailabilityError({ code: 'POSTFLOP_BOARD_UNREACHABLE', message: 'x' });
  assert.match(message, /別のボード/);
  assert.equal(postflopAvailabilityError(new Error('Missing policy')), 'Missing policy');
});


test('an unrelated absent dataset never waives present-source geometry validation', () => {
  const badSqueeze = structuredClone(data['squeeze-responses']);
  const spot = badSqueeze.spots.find(spot => spot.id === 'UTG_vs_BB_squeeze_HJcall');
  spot.four_bet_size_bb = 99;
  for (const row of spot.hands) if (row.four_bet > 0) row.four_bet_size_bb = 99;
  assert.throws(() => createContinuationUiRuntime({ ...data, 'squeeze-responses': badSqueeze }), /不正|Invalid/);
  assert.throws(() => createContinuationUiRuntime({ ...data, 'squeeze-responses': badSqueeze, 'cold-four-bet-responses': null }), /不正|Invalid/);
  const independent = createContinuationUiRuntime({ ...data, 'multiway-responses': null });
  const cold = continuationDecisions.find(node => node.family === 'cold_four_bet');
  assert.equal(independent.select({ kind: 'bounded', id: cold.id }).status, 'saved');
  assert.equal(independent.select({ kind: 'saved-source', dataset: 'squeeze-responses', id: spot.id }).status, 'missing');
});

test('a transient source fetch failure retries without refetching successful datasets', async () => {
  const calls = new Map();
  const load = createContinuationUiLoader(async name => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
    if (name === 'squeeze-responses' && calls.get(name) === 1) throw new Error('temporary fetch failure');
    return data[name];
  });
  const firstPromise = load();
  assert.equal(load(), firstPromise, 'concurrent reads share one in-flight request');
  const first = await firstPromise;
  const ref = { kind: 'bounded', id: 'UTG_vs_BB_squeeze_HJcall' };
  assert.equal(first.select(ref).status, 'missing');
  assert.deepEqual(first.missingSources, ['squeeze-responses']);
  const recovered = await load();
  assert.equal(recovered.select(ref).status, 'saved');
  assert.deepEqual(recovered.missingSources, []);
  assert.equal(await load(), recovered, 'a complete runtime remains cached');
  for (const name of continuationSourceNames) assert.equal(calls.get(name), name === 'squeeze-responses' ? 2 : 1, name);
});

// All 407 reachable histories remain recognized by the bounded preflop tree,
// but the 367 deferred histories must never borrow a selected HU policy.
test('all 367 deferred HU endpoints retain exact history and remain unavailable', () => {
  assert.equal(MULTIWAY_POSTFLOP_CATALOG.deferred.length, 367);
  for (const item of MULTIWAY_POSTFLOP_CATALOG.deferred) {
    const terminal = continuationTerminals.find(node => node.id === item.terminalId);
    assert.ok(terminal, item.id);
    const state = decodeRangeUrl(query(terminal.history));
    assert.ok(state, item.id);
    const blocks = buildRangeUrlActionBlocks(state);
    assert.deepEqual(blocks.at(-1).postflopEvents, terminal.history, item.id);
    assert.deepEqual(continuationLiveSeats(blocks), terminal.live_participants);
    const result = context(state, blocks);
    assert.equal(result?.spotId, null, item.id);
    assert.equal(result?.pilotAvailable, false, item.id);
  }
});
