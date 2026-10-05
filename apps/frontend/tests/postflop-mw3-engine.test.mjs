import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMw3Catalog, hasCompatibleMw3Hands, mw3SpotFor } from '../scripts/postflop-ai/mw3-spots.mjs';
import { applyMw3Action, assertMw3Conservation, createMw3Table, mw3Decision, replayMw3, settleMw3, startMw3Street } from '../scripts/postflop-ai/mw3-engine.mjs';
import { parseCards } from '../scripts/postflop-ai/model.ts';
const data = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const sources = { opening: data('opening-ranges'), responses: data('preflop-ranges'), multiway: data('multiway-responses') };
const catalog = buildMw3Catalog(sources);
const spot = catalog.find(spot => spot.opener === 'CO' && spot.firstCaller === 'BTN' && spot.secondCaller === 'BB');
const hand = text => parseCards(text, 2);
const board = parseCards('As7d2c3h4h', 5);
const hands = { BB: hand('KhQd'), CO: hand('AhAd'), BTN: hand('7c7h') };
function act(table, actions) { for (const action of actions) applyMw3Action(table, action); return table; }

test('mw3 catalog covers exact persisted one-caller source paths and orders the reach proxy', () => {
  assert.equal(catalog.length, 20);
  assert.equal(catalog.filter(spot => spot.reachable).length, 16);
  assert.equal(catalog.filter(spot => !spot.reachable).length, 4);
  for (const [index, item] of catalog.entries()) {
    assert.equal(item.kind, 'mw3_srp'); assert.equal(item.policyStatus, 'not_generated');
    assert.equal(item.reachPriority.method, 'product_of_marginal_action_shares_not_joint_reach');
    if (index) assert.ok(catalog[index - 1].reachPriority.score >= item.reachPriority.score);
    assert.equal(item.seats.length, 3);
    assert.equal(item.potBb, 7.5 + item.deadBlindBb);
    assert.equal(item.stackBb, 97.5);
    const row = sources.multiway.spots.find(row => row.id === item.sources.multiwayResponseId).hands.find(row => row.hand === 'AKs');
    assert.equal(item.seatRows[item.secondCaller].find(row => row.hand === 'AKs').freq, row.call);
  }
  assert.equal(mw3SpotFor(catalog, { opener: 'CO', callers: ['BTN', 'BB'], activeSeats: ['BB', 'CO', 'BTN'] }), spot);
  assert.equal(mw3SpotFor(catalog, { opener: 'CO', callers: ['BTN', 'BB'], activeSeats: ['BB', 'CO', 'BTN'], raised: true }), null);
  assert.equal(mw3SpotFor(catalog, { opener: 'UTG', callers: ['HJ', 'CO', 'BTN'], activeSeats: ['UTG', 'HJ', 'CO', 'BTN'] }), null);
});

test('catalog detects malformed sources and incompatible joint support without substituting HU calls', () => {
  const bad = structuredClone(sources); bad.multiway.spots[0].hands[0].call = 101;
  assert.throws(() => buildMw3Catalog(bad), /不正/);
  const onlyAces = { BB: [{ hand: 'AA', freq: 100 }], CO: [{ hand: 'AA', freq: 100 }], BTN: [{ hand: 'AA', freq: 100 }] };
  assert.equal(hasCompatibleMw3Hands(onlyAces), false);
  assert.equal(hasCompatibleMw3Hands({ ...onlyAces, BTN: [{ hand: 'KK', freq: 100 }] }), true);
});

test('three checks finish each street and preserve SB/BB/UTG/HJ/CO/BTN order', () => {
  const table = createMw3Table(spot);
  assert.deepEqual(table.seats, ['BB', 'CO', 'BTN']);
  for (const street of ['flop', 'turn', 'river']) {
    startMw3Street(table, street);
    for (const seat of table.seats) { assert.equal(mw3Decision(table).seat, seat); applyMw3Action(table, 'check'); }
    assert.equal(mw3Decision(table).end.type, 'street_complete');
  }
  const result = settleMw3(table, hands, board);
  assert.equal(result.winner, 'CO'); assert.equal(result.potBb, 8); assert.equal(result.rakeBb, 0.4);
  assert.throws(() => settleMw3(table, hands, board), /unfinished/);
});

test('a bet requires both live responders; a caller can face a later raise again', () => {
  const table = createMw3Table(spot); startMw3Street(table, 'flop');
  act(table, ['bet75', 'call']);
  assert.equal(mw3Decision(table).seat, 'BTN'); assert.equal(mw3Decision(table).node, 'mw3_flop_last_vs_75_closing');
  applyMw3Action(table, 'raise');
  assert.equal(mw3Decision(table).seat, 'BB'); assert.equal(mw3Decision(table).callBb, 12);
  applyMw3Action(table, 'call');
  assert.equal(mw3Decision(table).seat, 'CO'); applyMw3Action(table, 'call');
  assert.equal(table.pot, 62); assert.deepEqual(table.invested, { BB: 18, CO: 18, BTN: 18 });
  assert.equal(table.lastAggressor, 'BTN');
  startMw3Street(table, 'turn'); assert.equal(mw3Decision(table).line, 'defender');
  applyMw3Action(table, 'check'); assert.equal(mw3Decision(table).line, 'defender');
  applyMw3Action(table, 'check'); assert.equal(mw3Decision(table).line, 'aggressor');
});

test('folds preserve the three-player-origin policy roles on later streets', () => {
  const table = replayMw3(spot, { flop: ['check', 'bet33', 'fold', 'call'], turn: [] });
  assert.deepEqual(table.folded, ['BTN']); assert.equal(mw3Decision(table).seat, 'BB');
  assert.equal(mw3Decision(table).node, 'mw3_turn_first_first');
  applyMw3Action(table, 'check'); assert.equal(mw3Decision(table).node, 'mw3_turn_middle_first');
  applyMw3Action(table, 'check'); assert.ok(mw3Decision(table).end);
  assert.throws(() => applyMw3Action(table, 'check'), /Illegal/);
});

test('maximum two raises, legal low-SPR all-ins, no pending all-in actors', () => {
  const table = createMw3Table(spot); startMw3Street(table, 'flop');
  assert.equal(mw3Decision(table).actions.includes('allin'), false);
  act(table, ['bet33', 'raise', 'raise']);
  assert.equal(mw3Decision(table).raises, 2); assert.equal(mw3Decision(table).actions.includes('raise'), false);
  assert.throws(() => applyMw3Action(table, 'raise'), /Illegal/);
  act(table, ['call', 'call']);
  startMw3Street(table, 'turn'); assert.equal(mw3Decision(table).actions.includes('allin'), true);
  applyMw3Action(table, 'allin'); assert.equal(mw3Decision(table).actions.includes('raise'), false);
  act(table, ['call', 'call']); assert.equal(mw3Decision(table).end.type, 'all_in_runout');
  startMw3Street(table, 'river'); assert.equal(mw3Decision(table).end.type, 'all_in_runout');
  assert.equal(table.pot, 300.5); assert.deepEqual(table.stacks, { BB: 0, CO: 0, BTN: 0 });
  assert.equal(settleMw3(table, hands, board).rakeBb, 3);
});

test('only uncalled excess returns, folded matching contributions stay in pot', () => {
  const table = replayMw3(spot, { flop: ['bet75', 'call', 'raise', 'fold', 'fold'] });
  assert.equal(table.winner, 'BTN');
  const result = settleMw3(table);
  assert.equal(result.refundBb, 12); assert.equal(result.potBb, 26);
  assert.deepEqual(table.invested, { BB: 6, CO: 6, BTN: 6 });
  assert.equal(result.rakeBb, 1.3); assertMw3Conservation(table);
});

test('three-way tie splits post-rake pot and folded players never win', () => {
  const tieBoard = parseCards('AsKsQsJsTs', 5);
  const tieHands = { BB: hand('2c3c'), CO: hand('4c5c'), BTN: hand('6c7c') };
  const table = replayMw3(spot, { flop: ['check', 'check', 'check'], turn: ['check', 'check', 'check'], river: ['check', 'check', 'check'] });
  const result = settleMw3(table, tieHands, tieBoard);
  assert.equal(result.winners.length, 3); assert.equal(result.payouts.BB, 7.6 / 3);
  const fold = replayMw3(spot, { flop: ['bet33', 'fold', 'call'], turn: ['check', 'check'], river: ['check', 'check'] });
  assert.deepEqual(settleMw3(fold, tieHands, tieBoard).winners, ['BB', 'BTN']);
});

test('invalid cards, uneven starting stacks, and premature street/settlement fail closed', () => {
  assert.throws(() => createMw3Table({ ...spot, stacks: { BB: 80, CO: 97.5, BTN: 97.5 } }), /equal stacks/);
  const table = createMw3Table(spot); startMw3Street(table, 'flop');
  assert.throws(() => startMw3Street(table, 'turn'), /transition/);
  assert.throws(() => settleMw3(table), /unfinished/);
  act(table, ['check', 'check', 'check']); startMw3Street(table, 'turn'); act(table, ['check', 'check', 'check']);
  startMw3Street(table, 'river'); act(table, ['check', 'check', 'check']);
  assert.throws(() => settleMw3(table, { ...hands, CO: hands.BB }, board), /cards/);
});

test('full flop state graph probes all legal branches with unambiguous nodes', async () => {
  const { probeMw3Flop, describeMw3Node } = await import('../scripts/postflop-ai/mw3-tree.mjs');
  for (const potBb of [8, 8.5, 9]) {
    const probe = probeMw3Flop({ ...spot, potBb });
    assert.equal(probe.uniqueStates, 373); assert.equal(probe.decisions.length, 156); assert.equal(probe.terminals.length, 217);
    for (const row of Object.values(probe.nodes)) assert.deepEqual(describeMw3Node(row.node).actions, row.actions);
    for (const end of probe.terminals) assertMw3Conservation(end);
  }
  assert.throws(() => probeMw3Flop(spot, { maxStates: 10 }), /incomplete/);
  assert.throws(() => describeMw3Node('btn_first'), /Invalid/);
});

test('replay rejects every trailing, skipped or unknown street instead of ignoring it', () => {
  assert.throws(() => replayMw3(spot, { flop: ['check'], turn: ['check'] }), /later street/);
  assert.throws(() => replayMw3(spot, { flop: ['bet33', 'fold', 'fold'], turn: ['check'] }), /later street/);
  assert.throws(() => replayMw3(spot, { turn: ['check'] }), /Non-contiguous/);
  assert.throws(() => replayMw3(spot, { flop: [], river: [] }), /Non-contiguous/);
  assert.throws(() => replayMw3(spot, { flop: [], extra: [] }), /Invalid/);
});

test('cent rounding never offers an impossible raise into a matched all-in and rejection is atomic', () => {
  const table = replayMw3(spot, { flop: ['check', 'check', 'check'],
    turn: ['check', 'check', 'bet33', 'call', 'raise', 'call', 'call'],
    river: ['check', 'check', 'bet75', 'call', 'raise'] });
  assert.equal(mw3Decision(table).actions.includes('raise'), false);
  const before = JSON.stringify(table);
  assert.throws(() => applyMw3Action(table, 'raise'), /Illegal/);
  assert.equal(JSON.stringify(table), before);
});

test('policy context distinguishes live position, response commitment and exact price/SPR boundaries', async () => {
  const { mw3PriceBand, mw3SprBand } = await import('../scripts/postflop-ai/mw3-engine.mjs');
  assert.equal(mw3PriceBand(0.20), 'cheap'); assert.equal(mw3PriceBand(0.20 + 1e-12), 'standard');
  assert.equal(mw3PriceBand(1 / 3), 'standard'); assert.equal(mw3PriceBand(1 / 3 + 1e-12), 'expensive');
  assert.equal(mw3SprBand(1), 'shallow'); assert.equal(mw3SprBand(1 + 1e-12), 'medium');
  assert.equal(mw3SprBand(3), 'medium'); assert.equal(mw3SprBand(3 + 1e-12), 'deep');
  const middleOop = replayMw3(spot, { flop: ['check', 'bet33', 'raise', 'fold', 'call'], turn: [] });
  const middleIp = replayMw3(spot, { flop: ['bet33', 'call', 'fold'], turn: ['check'] });
  assert.equal(mw3Decision(middleOop).role, 'middle'); assert.equal(mw3Decision(middleOop).activePosition, 'first');
  assert.equal(mw3Decision(middleIp).role, 'middle'); assert.equal(mw3Decision(middleIp).activePosition, 'last');
  const response = replayMw3(spot, { flop: ['bet33'] });
  const decision = mw3Decision(response);
  assert.equal(decision.responseType, 'cold'); assert.ok(Math.abs(decision.callPrice - 2.64 / ((10.64 + 2.64) * 0.95)) < 1e-14);
  act(response, ['call', 'raise']); assert.equal(mw3Decision(response).responseType, 'invested');
});

test('identical low-SPR wagers aggregate their saved policy probabilities as one observable action', async () => {
  const { mw3ActionGroups, mw3ObservableMix, mw3ObservedProbability } = await import('../scripts/postflop-ai/mw3-actions.mjs');
  const table = replayMw3(spot, { flop: ['bet33', 'raise', 'raise', 'call', 'call'], turn: [] });
  const groups = mw3ActionGroups(table), allin = groups.find(group => group.action === 'allin');
  assert.ok(allin.actions.includes('bet125')); assert.ok(allin.actions.includes('allin'));
  const mix = { check: 40, bet33: 10, bet75: 15, bet125: 20, allin: 15 };
  const effective = mw3ObservableMix(table, mix);
  assert.equal(effective.allin, allin.actions.reduce((sum, action) => sum + mix[action], 0));
  assert.equal(mw3ObservedProbability(groups, mix, 'bet125'), effective.allin / 100);
  assert.equal(mw3ObservedProbability(groups, mix, 'allin'), effective.allin / 100);
  assert.equal(Object.values(effective).reduce((a, b) => a + b, 0), 100);
});

test('source ordering uses exact joint card removal while excluding unmodeled forced-fold probabilities', async () => {
  const { mw3JointActionShare } = await import('../scripts/postflop-ai/mw3-spots.mjs');
  const aa = [{ hand: 'AA', freq: 100 }], kk = [{ hand: 'KK', freq: 100 }];
  assert.equal(mw3JointActionShare({ A: aa, B: aa, C: aa }).weightedLegalTuples, 0);
  assert.equal(mw3JointActionShare({ A: aa, B: aa, C: kk }).weightedLegalTuples, 36);
  for (const [i, item] of catalog.entries()) {
    assert.equal(item.jointActionShare.method, 'exact_card_conditioned_three_active_action_share_forced_folds_unmodeled');
    if (i) assert.ok(catalog[i - 1].jointActionShare.probability >= item.jointActionShare.probability);
  }
});

test('Agent preflop history mapping requires one exact open plus two calls', async () => {
  const { mw3SpotForEvents } = await import('../scripts/postflop-ai/mw3-spots.mjs');
  const events = [{ pos: 'UTG', type: 'fold', key: 'fold' }, { pos: 'HJ', type: 'fold', key: 'fold' },
    { pos: 'CO', type: 'raise', key: 'open' }, { pos: 'BTN', type: 'call', key: 'call' },
    { pos: 'SB', type: 'fold', key: 'fold' }, { pos: 'BB', type: 'call', key: 'call' }];
  assert.equal(mw3SpotForEvents(catalog, events), spot);
  assert.equal(mw3SpotForEvents(catalog, events.map(event => event.pos === 'BTN' ? { ...event, type: 'raise', key: 'three_bet' } : event)), null);
  assert.equal(mw3SpotForEvents(catalog, [...events, { pos: 'CO', type: 'fold', key: 'fold' }]), null);
});
