import assert from 'node:assert/strict';
import test from 'node:test';
import { dataset } from '../src/estimated/datasets.ts';
import { createPostflopSpots } from '../scripts/postflop-ai/spots-core.ts';
import { MULTIWAY_POSTFLOP_SPOTS, multiwaySpotFor } from '../scripts/postflop-ai/multiway-spots.ts';
import { POSTFLOP_SPOTS } from '../scripts/postflop-ai/spots.ts';
import { buildInputs } from '../scripts/postflop-ai/browser-inputs.ts';
import { postflopSpotFor } from '../src/agent/hand.ts';
import { startPreflop, applyPreflop, situation, preflopOptions } from '../src/agent/preflop.ts';

const baseNames = ['opening-ranges', 'preflop-ranges', 'three-bet-responses', 'limp-responses'];
const sources = () => Object.fromEntries(baseNames.map(name => [name, dataset(name)]));
const eventsOf = spot => spot.history.map(step => ({ pos: step.seat, key: step.action, to: step.to_size_bb,
  type: ['fold', 'check', 'call'].includes(step.action) ? step.action : 'raise' }));

test('ordinary registry preserves exact scoped legacy descriptors followed by reviewed HU descriptors', () => {
  const legacy = createPostflopSpots(sources()).POSTFLOP_SPOTS;
  assert.equal(legacy.length, 49);
  assert.equal(MULTIWAY_POSTFLOP_SPOTS.length, 407);
  assert.equal(JSON.stringify(POSTFLOP_SPOTS), JSON.stringify([...legacy, ...MULTIWAY_POSTFLOP_SPOTS]));
});

test('ordinary Agent retains exact HU histories while injected or absent server data never expands FastFold coverage', () => {
  const representatives = new Map();
  for (const spot of MULTIWAY_POSTFLOP_SPOTS) if (!representatives.has(spot.kind)) representatives.set(spot.kind, spot);
  assert.equal(representatives.size, 3);
  const scoped = sources();
  for (const spot of representatives.values()) {
    const events = eventsOf(spot);
    assert.equal(multiwaySpotFor(events)?.id, spot.id);
    assert.equal(postflopSpotFor(events)?.id, spot.id);
    assert.equal(postflopSpotFor(events, name => scoped[name]), null);
    assert.equal(postflopSpotFor(events, () => undefined), null);
  }
});

test('interleaved injected legacy scopes cannot fall back to or mutate the ordinary registry', () => {
  const original = sources();
  const changedResponses = structuredClone(original['preflop-ranges']);
  for (const row of changedResponses.spots.find(spot => spot.id === 'BB_vs_BTN').hands) row.call = 0;
  const changed = { ...original, 'preflop-ranges': changedResponses };
  const events = [{ pos: 'BTN', type: 'raise', key: 'open', to: 2.5 }, { pos: 'BB', type: 'call', key: 'call', to: 2.5 }];
  const first = JSON.stringify(buildInputs('BTN_open_BB_call', original));
  assert.equal(postflopSpotFor(events, name => changed[name]).reachable, false);
  assert.throws(() => buildInputs('BTN_open_BB_call', changed), /unreachable/);
  assert.equal(postflopSpotFor(events, () => undefined), null);
  assert.equal(JSON.stringify(buildInputs('BTN_open_BB_call', original)), first);
  assert.equal(postflopSpotFor(events).reachable, true);
});

test('same squeeze history keeps ordinary Stage2 continuation while injected FastFold stays legacy-only', () => {
  const history = [['UTG', 'open', 2.5], ['HJ', 'call', 2.5], ['CO', 'fold'], ['BTN', 'fold'], ['SB', 'fold'],
    ['BB', 'squeeze', 13], ['UTG', 'fold'], ['HJ', 'four_bet', 26]];
  let state = startPreflop();
  for (const [seat, key, to] of history) state = applyPreflop(state, seat, {
    type: ['fold', 'check', 'call'].includes(key) ? key : 'raise', key, ...(to === undefined ? {} : { to }),
  });
  const expected = 'continuation-responses/sq_UTGo2p5_HJc2p5_COf_BTNf_SBf_BBs13__UTGf_HJr26__to_BB';
  assert.equal(situation(state, 'BB').source, expected);
  assert.equal(situation(state, 'BB', name => dataset(name)).source, null);
  assert.equal(situation(state, 'BB', () => undefined).source, null);
  for (const hand of ['AA', 'AKs', '72o']) {
    assert.equal(preflopOptions(state, 'BB', hand).source, expected);
    const injected = preflopOptions(state, 'BB', hand, name => dataset(name));
    assert.equal(injected.source, null);
    assert.equal(injected.tableRule, 'no_data');
  }
});
