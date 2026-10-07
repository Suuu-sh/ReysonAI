import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playHand, deal } from '../src/agent/hand.ts';
import { POSITIONS, applyPreflop, preflopOptions, situation, startPreflop } from '../src/agent/preflop.ts';
import { handRecord } from '../src/agent/agent-stats.ts';
import { playMw3AgentHand } from '../src/agent/mw3-hand.ts';
import { deliveryFixture, safeAction } from './helpers/mw3-consumer-fixture.mjs';
const fixture = await deliveryFixture(), kit = await fixture.client.load(fixture.id);
const sum = values => Object.values(values).reduce((a, b) => a + b, 0);
const forced = (opener = 'CO', callers = ['BTN', 'BB']) => ({
  preflop({ pos, offered }) {
    const key = pos === opener ? 'open' : callers.includes(pos) ? 'call' : 'fold';
    const action = offered.choices.find(choice => choice.action.key === key)?.action;
    assert.ok(action, `${pos}/${key} must be offered`); return { action, mix: {}, source: 'balanced' };
  },
  postflop() { throw Error('Dedicated MW3 must never call the HU agent'); },
});
const setup = (extra = {}) => ({ seed: 'mw3-real-six-seat-deal', human: null, agents: forced(),
  postflop() { throw Error('Dedicated MW3 must never request a HU kit'); },
  mw3: { supportsSpot: id => id === fixture.id, kit: () => kit }, ...extra });
function preflopToTwoCalls(opener = 'CO', callers = ['BTN', 'BB']) {
  let state = startPreflop();
  for (const pos of POSITIONS) state = applyPreflop(state, pos, pos === opener ? { type: 'raise', to: 2.5, key: 'open' }
    : callers.includes(pos) ? { type: 'call', key: 'call' } : { type: 'fold', key: 'fold' });
  return state;
}

test('only approved dedicated SRPs unlock third calls; fourth and 3bet/squeeze callers remain blocked', () => {
  let state = startPreflop();
  for (const [pos, action] of [['UTG', { type: 'fold', key: 'fold' }], ['HJ', { type: 'fold', key: 'fold' }],
    ['CO', { type: 'raise', to: 2.5, key: 'open' }], ['BTN', { type: 'call', key: 'call' }], ['SB', { type: 'fold', key: 'fold' }]]) state = applyPreflop(state, pos, action);
  assert.ok(!preflopOptions(state, 'BB', 'AA').choices.some(choice => choice.action.key === 'call'));
  const allowed = preflopOptions(state, 'BB', 'AA', { allowThreePlayer: id => id === fixture.id });
  assert.ok(allowed.choices.some(choice => choice.action.key === 'call')); assert.equal(allowed.tableRule, null);
  let stage3 = startPreflop();
  stage3 = applyPreflop(stage3, 'UTG', { type: 'raise', to: 2.5, key: 'open' });
  stage3 = applyPreflop(stage3, 'HJ', { type: 'call', key: 'call' });
  stage3 = applyPreflop(stage3, 'CO', { type: 'call', key: 'call' });
  const remaining = preflopOptions(stage3, 'BTN', 'AA', { allowThreePlayer: () => true });
  assert.equal(situation(stage3, 'BTN').source, 'multiway2-responses/BTN_vs_UTG_HJcall_COcall');
  assert.ok(!remaining.choices.some(choice => choice.action.key === 'call')); assert.equal(remaining.callBlocked, true);
  stage3 = applyPreflop(stage3, 'BTN', { type: 'raise', to: 14, key: 'squeeze' });
  assert.equal(preflopOptions(stage3, 'UTG', 'AA', { allowThreePlayer: () => true }).callBlocked, true);
});
test('real deal retains all six legal hole pairs while the dedicated runtime sees exactly its three original keys', () => {
  const dealt = deal('mw3-real-six-seat-deal');
  assert.equal(Object.keys(dealt.hole).length, 6); assert.equal(new Set([...Object.values(dealt.hole).flat(), ...dealt.board]).size, 17);
  const hand = playHand(setup());
  assert.equal(hand.status, 'done'); assert.equal(hand.postflopKind, 'mw3_srp'); assert.equal(hand.spotId, fixture.id);
  assert.equal(Object.keys(hand.holeCards).length, 6); assert.equal(hand.board.length, 5); assert.equal(hand.log.filter(entry => entry.street !== 'preflop').length, 9);
  assert.equal(hand.returns.SB, -.5); assert.equal(hand.returns.UTG, 0); assert.ok(Math.abs(sum(hand.returns) + hand.rake) < 1e-8);
  assert.deepEqual(playHand(setup()), hand);
  assert.throws(() => playMw3AgentHand({ kit: { ...kit }, state: preflopToTwoCalls(), ...dealt, human: null, humanActions: [], random: () => .5 }), /verified/);
});
test('human actions pause and replay through all streets; a preflop-folded human outside the original three never reaches a postflop prompt', () => {
  const initial = playHand(setup({ human: 'CO', humanActions: ['open'] }));
  assert.equal(initial.status, 'awaiting'); assert.equal(initial.pending.street, 'flop'); assert.equal(initial.pending.pos, 'CO');
  const done = playHand(setup({ human: 'CO', humanActions: ['open', 'check', 'check', 'check'] }));
  assert.equal(done.status, 'done'); assert.equal(done.board.length, 5); assert.ok(Math.abs(sum(done.returns) + done.rake) < 1e-8);
  const outside = playHand(setup({ human: 'UTG', humanActions: ['fold'] }));
  assert.equal(outside.status, 'done'); assert.equal(outside.postflopKind, 'mw3_srp'); assert.equal(outside.returns.UTG, 0);
  assert.equal(outside.log.filter(entry => entry.pos === 'UTG').length, 1);
});
test('a human folding from the original three leaves a dedicated two-live-player path with unchanged roles', async () => {
  const betting = await deliveryFixture({ choose: descriptor => descriptor.street === 'flop' && descriptor.role === 'first' && descriptor.actions.includes('check') ? 'bet33' : safeAction(descriptor) });
  const bettingKit = await betting.client.load(betting.id);
  const base = setup({ mw3: { supportsSpot: id => id === betting.id, kit: () => bettingKit } });
  const paused = playHand({ ...base, human: 'CO', humanActions: ['open'] });
  assert.equal(paused.status, 'awaiting'); assert.equal(paused.pending.pos, 'CO'); assert.equal(paused.pending.toCall, 2.64);
  const done = playHand({ ...base, human: 'CO', humanActions: ['open', 'fold'] });
  assert.equal(done.status, 'done'); assert.equal(done.postflopKind, 'mw3_srp'); assert.equal(done.showdown, true);
  assert.ok(done.log.filter(entry => entry.street !== 'preflop').every(entry => entry.source.startsWith(`mw3:${fixture.id}:`)));
  assert.ok(done.log.filter(entry => entry.street === 'turn').every(entry => ['BB', 'BTN'].includes(entry.pos)));
  assert.equal(done.log.find(entry => entry.street === 'turn' && entry.pos === 'BTN').originalRole, 'last');
  assert.ok(Math.abs(sum(done.returns) + done.rake) < 1e-8);
});
test('uncalled wagers refund exactly before six-seat pot/rake settlement', async () => {
  const folding = await deliveryFixture({ choose: descriptor => descriptor.actions.includes('check') ? 'bet125' : 'fold' });
  const foldingKit = await folding.client.load(folding.id);
  const hand = playHand(setup({ mw3: { supportsSpot: () => true, kit: () => foldingKit } }));
  assert.equal(hand.status, 'done'); assert.equal(hand.showdown, false); assert.deepEqual(hand.winners, ['BB']);
  assert.equal(hand.pot, 8); assert.equal(hand.rake, .4); assert.ok(Math.abs(hand.returns.BB - 5.1) < 1e-9);
  assert.equal(hand.returns.CO, -2.5); assert.equal(hand.returns.BTN, -2.5); assert.equal(hand.returns.SB, -.5);
  assert.ok(Math.abs(sum(hand.returns) + hand.rake) < 1e-8);
});
test('all-in aliases run out the board without invented river decisions and conserve all six seats', async () => {
  const allin = await deliveryFixture({ choose(descriptor) {
    if (descriptor.actions.includes('allin')) return 'allin';
    if (descriptor.street === 'flop' && descriptor.actions.includes('check')) return 'bet33';
    if (descriptor.street === 'flop' && descriptor.role === 'middle' && descriptor.facing === '33') return 'raise';
    if (descriptor.street === 'flop' && descriptor.role === 'last' && descriptor.facing === 'raise1') return 'raise';
    return safeAction(descriptor);
  } });
  const allinKit = await allin.client.load(allin.id);
  const base = setup({ mw3: { supportsSpot: () => true, kit: () => allinKit }, human: 'BB', humanActions: ['call', 'bet33', 'call', 'allin'] });
  const hand = playHand(base);
  assert.equal(hand.status, 'done'); assert.equal(hand.board.length, 5); assert.equal(hand.showdown, true);
  assert.equal(hand.log.filter(entry => entry.street === 'river').length, 0);
  assert.equal(hand.pot, 300.5); assert.equal(hand.rake, 3); assert.equal(hand.returns.SB, -.5);
  assert.ok(Math.abs(sum(hand.returns) + hand.rake) < 1e-8); assert.deepEqual(playHand(base), hand);
});
test('nonblind three-player origins retain both folded blinds and all six settlement keys', async () => {
  const nonblind = await deliveryFixture({ id: 'HJ_open_CO_call_BTN_call' }), nonblindKit = await nonblind.client.load(nonblind.id);
  const hand = playHand(setup({ agents: forced('HJ', ['CO', 'BTN']), mw3: { supportsSpot: id => id === nonblind.id, kit: () => nonblindKit } }));
  assert.equal(hand.status, 'done'); assert.equal(hand.pot, 9); assert.equal(hand.returns.SB, -.5); assert.equal(hand.returns.BB, -1);
  assert.deepEqual(Object.keys(hand.returns), [...POSITIONS]); assert.ok(Math.abs(sum(hand.returns) + hand.rake) < 1e-8);
});
test('missing, unapproved, malformed or unsupported multiway hands stop before settlement and history writes', () => {
  const pending = playHand(setup({ mw3: { supportsSpot: () => true, kit: () => undefined } }));
  assert.equal(pending.status, 'needs_postflop'); assert.equal(pending.postflopKind, 'mw3_srp'); assert.equal(pending.returns, undefined);
  assert.throws(() => handRecord(pending, 'test', 'CO'), /unfinished/);
  for (const missing of [null, { ...kit }]) {
    const hand = playHand(setup({ mw3: { supportsSpot: () => true, kit: () => missing } }));
    assert.equal(hand.status, 'unavailable'); assert.equal(hand.returns, undefined); assert.equal(hand.winners, undefined); assert.equal(hand.board.length, 0);
    assert.ok(hand.log.every(entry => entry.street === 'preflop')); assert.throws(() => handRecord(hand, 'test', 'CO'), /unfinished/);
  }
  // A malicious/test decider cannot turn a 4+ or 3bet-three-way deal into HU.
  const unchecked = keys => ({ preflop({ pos }) { const key = keys[pos] ?? 'fold'; return { action: { key, type: ['open', 'three_bet'].includes(key) ? 'raise' : key, ...(key === 'open' ? { to: 2.5 } : key === 'three_bet' ? { to: 12 } : {}) }, mix: {}, source: 'balanced' }; }, postflop() { throw Error('must not call'); } });
  for (const agents of [unchecked({ CO: 'open', BTN: 'call', SB: 'call', BB: 'call' }), unchecked({ CO: 'open', BTN: 'three_bet', BB: 'call' })]) {
    // Original opener must call its reopened 3bet decision once.
    let co = 0; const original = agents.preflop; agents.preflop = query => query.pos === 'CO' && ++co > 1 ? { action: { key: 'call', type: 'call' }, mix: {}, source: 'balanced' } : original(query);
    const hand = playHand(setup({ agents })); assert.equal(hand.status, 'unavailable'); assert.equal(hand.returns, undefined); assert.equal(hand.winners, undefined);
  }
  const ui = readFileSync(new URL('../src/agent/AgentTable.tsx', import.meta.url), 'utf8');
  assert.match(ui, /if \(!done \|\| recorded\.current === session\.handNo\) return/);
  assert.match(ui, /if \(!result \|\| result\.status !== "done"\) return/);
  assert.match(ui, /result\?\.status === "unavailable"/);
});
test('Agent consumer retains at most two recent kits and never invalidates an active hand reference', async () => {
  const { rememberMw3AgentKit, touchMw3AgentKit } = await import('../src/agent/mw3-kit-cache.ts');
  let cache = rememberMw3AgentKit(new Map(), 'first', kit);
  cache = rememberMw3AgentKit(cache, 'second', { marker: 2 });
  cache = touchMw3AgentKit(cache, 'first');
  assert.equal(touchMw3AgentKit(cache, 'first'), cache);
  cache = rememberMw3AgentKit(cache, 'third', { marker: 3 });
  assert.deepEqual([...cache.keys()], ['first', 'third']); assert.equal(cache.size, 2); assert.equal(cache.get('first'), kit);
});
