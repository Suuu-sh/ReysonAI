import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedFlopContext } from '../src/estimated/postflop-trial.ts';
import { mw3OriginForEvents, mw3OriginForSelection } from '../src/estimated/mw3-context.ts';
import { buildMw3RangeNavigation, canonicalMw3RangeSelection, currentMw3PotBb } from '../src/estimated/mw3-range-state.ts';
import { mw3ActionLabel, mw3Copy } from '../src/estimated/mw3-copy.ts';
import { buildActionBlocks, decodeRangeUrl, encodeRangeUrl, defaultRangeSelection } from '../src/estimated/range-url.ts';
import { defaultFormat } from '../src/estimated/game-formats.ts';
import { DEFAULT_PROFILE } from '../src/estimated/table-profile.ts';
import { postflopSpotFor } from '../src/agent/hand.ts';
import { cardText } from '../scripts/postflop-ai/flop-isomorphism.ts';
import { mw3DecisionView } from '../scripts/postflop-ai/mw3-runtime.mjs';
import { deliveryFixture } from './helpers/mw3-consumer-fixture.mjs';
const fixture = await deliveryFixture(), kit = await fixture.client.load(fixture.id), spot = kit.inputs.spot;
const selection = extra => ({ flopCards: ['As', '7d', '2c'], flopActions: [], turnCard: '', turnActions: [], riverCard: '', riverActions: [], ...extra });
const origin = (opener = 'CO', callers = ['BTN', 'BB']) => mw3OriginForSelection({ rangeType: 'response', opener, callers });
const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('MW3 board pot display prefers a settled pot and falls back to the live table pot', () => {
  assert.equal(currentMw3PotBb({ settledPotBb: 7.5, table: { pot: 9.98 } }), 7.5);
  assert.equal(currentMw3PotBb({ settledPotBb: null, table: { pot: 9.98 } }), 9.98);
  assert.equal(currentMw3PotBb(null), null);
});

test('three-origin dispatch is explicit and distinct from HU-origin multiway catalog', () => {
  assert.equal(origin().id, fixture.id); assert.deepEqual(origin().seats, ['BB', 'CO', 'BTN']);
  assert.deepEqual(origin().roles, { BB: 'first', CO: 'middle', BTN: 'last' });
  assert.equal(origin('HJ', ['CO', 'BTN']).potBb, 9);
  assert.deepEqual(origin('HJ', ['CO', 'BTN']).roles, { HJ: 'first', CO: 'middle', BTN: 'last' });
  assert.equal(mw3OriginForSelection({ rangeType: 'response', opener: 'CO', callers: ['BTN', 'SB', 'BB'] }), null);
  assert.equal(mw3OriginForSelection({ rangeType: 'response', opener: 'CO', callers: ['BTN', 'BB'], pendingRaise: 'squeeze' }), null);
  const events = [{ pos: 'CO', type: 'raise', key: 'open' }, { pos: 'BTN', type: 'call', key: 'call' }, { pos: 'SB', type: 'fold', key: 'fold' }, { pos: 'BB', type: 'call', key: 'call' }];
  assert.equal(postflopSpotFor(events).kind, 'mw3_srp');
  const hu = postflopSpotFor([{ pos: 'UTG', type: 'raise', key: 'open' }, { pos: 'HJ', type: 'call', key: 'call' }, { pos: 'BB', type: 'raise', key: 'squeeze' }, { pos: 'UTG', type: 'fold', key: 'fold' }, { pos: 'HJ', type: 'call', key: 'call' }]);
  assert.notEqual(hu.kind, 'mw3_srp'); assert.equal(hu.id, 'UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
  assert.equal(mw3OriginForEvents([...events, { pos: 'CO', type: 'fold', key: 'fold' }]), null);
  assert.equal(mw3OriginForEvents([null]), null); assert.equal(mw3OriginForEvents([{}]), null);
});
test('completed three-player context cannot enter HU pilot even when a candidate is absent', () => {
  const state = { rangeType: 'response', opener: 'CO', hero: 'BB', callers: ['BTN', 'BB'], foldedHero: true };
  const blocks = buildActionBlocks(state), context = completedFlopContext({ ...state, actionBlocks: blocks, isDefaultTable: true });
  assert.equal(context.kind, 'mw3_srp'); assert.equal(context.spotId, fixture.id); assert.equal(context.pilotAvailable, false); assert.equal(context.mw3Available, true);
  assert.doesNotThrow(() => encodeRangeUrl({ ...defaultRangeSelection, ...state }));
  assert.equal(completedFlopContext({ ...state, actionBlocks: blocks, isDefaultTable: false }).mw3Available, false);
  const unavailable = completedFlopContext({ ...state, callers: ['BTN', 'SB', 'BB'], actionBlocks: [{ kind: 'end', result: '4人でフロップへ', pot: 'ポット 10bb' }], isDefaultTable: true });
  assert.equal(unavailable.kind, 'multiway_unavailable'); assert.equal(unavailable.spotId, null);
});
test('three tables preserve original roles, own reach and exact saved combo mixes', () => {
  const navigation = buildMw3RangeNavigation(spot, selection());
  const view = mw3DecisionView(kit.inputs, kit.policies, navigation);
  assert.deepEqual(view.participants.map(part => part.seat), ['BB', 'CO', 'BTN']);
  assert.deepEqual(view.participants.map(part => part.originalRole), ['first', 'middle', 'last']);
  assert.equal(view.participants.filter(part => part.acting).length, 1);
  assert.ok(view.participants[0].rows.some(row => row.combos.length > 1 && row.combos.every(combo => combo.actions.check === 1)));
  assert.ok(view.participants.slice(1).every(part => part.actions === null));
});
test('common chronological action blocks use actual chip amounts and retain MW3 after 3→2', () => {
  const navigation = buildMw3RangeNavigation(spot, selection({ flopActions: ['bet33', 'fold', 'call'], turnCard: '3h' }));
  assert.equal(navigation.table.kind, 'mw3_srp'); assert.deepEqual(navigation.table.folded, ['CO']);
  assert.equal(navigation.table.seats.length, 3); assert.equal(navigation.table.street, 'turn');
  const flop = navigation.blocks.filter(block => block.kind === 'flop' && !block.street);
  assert.deepEqual(flop.map(block => block.position), ['BB', 'CO', 'BTN']);
  assert.equal(flop[0].options.find(option => option.action === 'bet33').amountBb, 2.64);
  assert.match(flop[0].options.find(option => option.action === 'bet33').label, /2\.64BB/);
  const turn = navigation.blocks.find(block => block.street === 'turn' && block.kind === 'flop');
  assert.equal(turn.position, 'BB'); assert.equal(turn.originalRole, 'first');
  assert.deepEqual(navigation.paths, { flop: ['bet33', 'fold', 'call'], turn: [] });
});
test('merged all-ins have one physical option, aliases and truthful labels in four languages', () => {
  const navigation = buildMw3RangeNavigation(spot, selection({ flopActions: ['bet33', 'raise', 'raise', 'call', 'call'], turnCard: '3h' }));
  const turn = navigation.blocks.find(block => block.street === 'turn' && block.kind === 'flop'), allin = turn.options.find(option => option.action === 'allin');
  assert.ok(allin.aliases.includes('bet125')); assert.ok(allin.aliases.includes('allin'));
  const amounts = new Set(turn.options.filter(option => option.allIn).map(option => option.toBb)); assert.equal(amounts.size, 1);
  for (const locale of ['en', 'ja', 'zh-CN', 'es']) {
    const label = mw3ActionLabel({ ...allin, action: allin.action }, locale);
    assert.ok(label.startsWith(mw3Copy(locale).allin)); assert.ok(!label.includes('%'));
    assert.ok(mw3Copy(locale).unavailable.length > 4); assert.notEqual(mw3Copy(locale).unavailable, locale === 'en' ? '' : mw3Copy('en').unavailable);
  }
});
test('street transitions, board duplicates, illegal suffixes and partial paths fail closed', () => {
  assert.equal(buildMw3RangeNavigation(spot, selection({ flopCards: ['', '', ''] })), null);
  assert.throws(() => buildMw3RangeNavigation(spot, selection({ turnCard: 'As' })), /board/);
  assert.throws(() => buildMw3RangeNavigation(spot, selection({ riverCard: '4h' })), /board/);
  assert.throws(() => buildMw3RangeNavigation(spot, selection({ flopActions: ['check', 'check', 'check', 'check'] })), /completion/);
  const pending = buildMw3RangeNavigation(spot, selection({ flopActions: ['check', 'check', 'check'] }));
  assert.equal(pending.pendingStreet, 'turn'); assert.equal(pending.table.street, 'flop');
  const folded = buildMw3RangeNavigation(spot, selection({ flopActions: ['bet125', 'fold', 'fold'] }));
  assert.equal(folded.table.pot, 18); assert.equal(folded.settledPotBb, 8); assert.match(folded.blocks.at(-1).pot, /8BB/);
  const canonical = canonicalMw3RangeSelection(spot, selection({ flopActions: ['bet33', 'fold', 'fold', 'call'], turnCard: '3h', riverCard: '4h' }));
  assert.deepEqual(canonical.flopActions, ['bet33', 'fold', 'fold']); assert.equal(canonical.turnCard, ''); assert.equal(canonical.riverCard, '');
});
test('three-player URL roundtrips full streets without invoking HU geometry or authorizing a delivery', () => {
  const state = { ...defaultRangeSelection, rangeType: 'response', opener: 'CO', hero: 'BB', callers: ['BTN', 'BB'], foldedHero: true,
    format: { ...defaultFormat }, tableProfile: { ...DEFAULT_PROFILE }, showFlop: true,
    ...selection({ flopActions: ['check', 'check', 'check'], turnCard: '3h', turnActions: ['check', 'check', 'check'], riverCard: '4h', riverActions: ['check', 'check', 'check'] }) };
  const url = encodeRangeUrl(state), decoded = decodeRangeUrl(url);
  for (const key of ['flopActions', 'turnActions', 'riverActions', 'flopCards', 'turnCard', 'riverCard']) assert.deepEqual(decoded[key], state[key]);
  assert.equal(encodeRangeUrl(decoded), url);
  const rewound = decodeRangeUrl(url.replace('flop_actions=X-X-X', 'flop_actions=X'));
  assert.deepEqual(rewound.flopActions, ['check']); assert.equal(rewound.turnCard, ''); assert.equal(rewound.riverCard, '');
  const clientCode = source('estimated/mw3-browser.ts');
  assert.doesNotMatch(clientCode.replace(/^\s*\/\/.*$/gm, ""), /localStorage|window\.location|searchParams\.get/);
});

test('Range board IDs use the shared cdhs convention for every physical card', () => {
  for (let card = 0; card < 52; card++) {
    const ids = [card, (card + 1) % 52, (card + 2) % 52];
    const navigation = buildMw3RangeNavigation(spot, selection({ flopCards: ids.map(cardText) }));
    assert.deepEqual(navigation.board, ids);
    assert.deepEqual(navigation.board.map(cardText), ids.map(cardText));
  }
});
test('visible flop/turn/river cards block those exact suit combinations in all participant tables', () => {
  for (const extra of [{}, { flopActions: ['check', 'check', 'check'], turnCard: '3h' },
    { flopActions: ['check', 'check', 'check'], turnCard: '3h', turnActions: ['check', 'check', 'check'], riverCard: '4s' }]) {
    const state = selection(extra), visible = [...state.flopCards, ...[state.turnCard, state.riverCard].filter(Boolean)];
    const navigation = buildMw3RangeNavigation(spot, state);
    assert.deepEqual(navigation.board, [51, 21, 0, 6, 11].slice(0, visible.length));
    assert.deepEqual(navigation.board.map(cardText), visible);
    const view = mw3DecisionView(kit.inputs, kit.policies, navigation);
    assert.equal(view.participants.length, 3);
    for (const participant of view.participants) for (const row of participant.rows) for (const combo of row.combos) {
      assert.ok(combo.cards.every(card => !visible.includes(cardText(card))), `${participant.seat}: displayed board card reappeared in hole combo`);
    }
  }
});
