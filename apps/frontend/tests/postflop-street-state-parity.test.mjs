import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTFLOP_SPOTS, spotById } from '../scripts/postflop-ai/spots.ts';
import { replayObservableStreet } from '../scripts/postflop-ai/observable-actions.mjs';
import { replayFlop, replayLater, laterStart, laterDecisionState, decisionOptionFacts, canRaiseNow } from '../scripts/postflop-ai/street-state.mjs';
import { flopDecision, laterDecision, replayLater as uiReplayLater, buildLaterActionBlocks } from '../src/estimated/postflop-trial.ts';

const representative = spotById('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const ctx = spot => ({ spotId: spot.id, ip: spot.ip, oop: spot.oop, potBb: spot.potBb, stackBb: spot.stackBb, tree: spot.tree, pilotAvailable: true });
const optionShape = options => options.map(({ action, amountBb, allIn, aliases }) => ({ action, amountBb, allIn, ...(aliases === undefined ? {} : { aliases }) }));
const numericDecision = ({ labels, labelsJa, history, options, ...rest }) => ({ ...rest, ...(options ? { options: optionShape(options) } : {}) });

test('all407 catalog contexts use the same observable replay facts and ordered legal options', () => {
  const spots = POSTFLOP_SPOTS.filter(spot => spot.history && spot.reachable);
  assert.equal(spots.length, 407);
  for (const spot of spots) {
    const replay = replayFlop([], ctx(spot)), expected = replayObservableStreet({ spot, street: 'flop', actions: [] });
    assert.deepEqual(replay.state, expected.state, spot.id);
    assert.equal(replay.pot, expected.pot, spot.id);
    assert.deepEqual(replay.stacks, expected.stacks, spot.id);
    assert.deepEqual(replay.invested, expected.committed, spot.id);
    assert.deepEqual(optionShape(decisionOptionFacts(replay.chipsNow, replay.state.node)), optionShape(flopDecision([], ctx(spot)).options), spot.id);
    assert.equal(replay.history, undefined);
    assert.equal(replay.trace.length, 0);
  }
});

test('known merged river geometry retains exact chips, aliases, option facts and UI history', () => {
  const context = ctx(representative), flop = laterStart(['bet33', 'call'], context);
  const turn = replayLater('turn', ['bet75', 'call'], flop, context);
  const start = { pot: turn.pot, stacks: turn.stacks, lastAggressor: turn.lastAggressor };
  assert.deepEqual(start.stacks, { ip: 41.32, oop: 41.32 });
  assert.equal(start.pot, 120.36);
  for (const alias of ['bet33', 'bet75', 'bet125', 'allin']) {
    const actions = ['check', alias], facts = laterDecisionState('river', actions, start, context), ui = laterDecision('river', actions, start, context);
    assert.equal(facts.node, 'river_oop_vs_allin');
    assert.deepEqual(facts.options.map(option => option.action), ['fold', 'call']);
    assert.deepEqual(numericDecision(facts), numericDecision(ui));
    assert.equal(facts.history, undefined); assert.equal(facts.labels, undefined);
    const { trace, ...numeric } = replayLater('river', actions, start, context), { history, ...uiNumeric } = uiReplayLater('river', actions, start, context);
    assert.deepEqual(numeric, uiNumeric);
    assert.deepEqual(history, ['BB Check', 'HJ All-in 41.32']);
    assert.equal(trace.at(-1).option.paid, 41.32);
  }
  const blocks = buildLaterActionBlocks({ flopActions: ['bet33', 'call'], turnCard: '9h', turnActions: ['bet75', 'call'],
    riverCard: 'Jd', riverActions: ['check', 'bet75', 'raise'] }, context);
  assert.deepEqual(blocks.filter(block => block.street === 'river' && block.kind === 'flop').map(block => block.chosen), ['check', 'allin', 'call']);
  assert.match(blocks.at(-1).result, /ショウダウン|ショーダウン/);
});

test('legacy replay remains outside observable alias folding and preserves the old fold settlement convention', () => {
  const spot = spotById('BTN_open_BB_call');
  assert.equal(replayFlop(['bet33', 'fold'], spot).pot, spot.potBb);
  const start = { pot: 10, stacks: { ip: 90, oop: 90 }, lastAggressor: 'ip' };
  const played = replayLater('turn', ['bet33', 'fold'], start, spot);
  assert.equal(played.pot, 13.3);
  assert.deepEqual(played.stacks, { ip: 90, oop: 86.7 });
  assert.equal(played.lastAggressor, null);
  assert.deepEqual(uiReplayLater('turn', ['bet33', 'fold'], start, spot).history, ['BB Bet 3.3 (33%)', 'BTN Fold']);
});

test('effective-call suffixes and explicit allin raises remain illegal in the shared core', () => {
  const context = ctx(representative), start = { pot: 120.36, stacks: { ip: 41.32, oop: 41.32 }, lastAggressor: 'oop' };
  assert.equal(canRaiseNow({ pot: 161.68, stacks: { ip: 0, oop: 41.32 }, committed: { ip: 41.32, oop: 0 } }, 'oop'), false);
  assert.throws(() => replayLater('river', ['check', 'allin', 'raise'], start, context), /Illegal/);
  assert.throws(() => replayLater('river', ['check', 'bet75', 'raise', 'fold'], start, context), /Illegal/);
  assert.throws(() => replayLater('turn', [], null, context), /Invalid later-street start/);
});

// Exact extraction retains this historical odd edge string. It is presentation
// compatibility, not a new action rule or a string-valued numeric betPercent.
test('zero-paid observable river allin retains exact old EN/JA suffix labels and history', () => {
  const context = ctx(representative), start = { pot: 10, stacks: { ip: 0, oop: 10 }, lastAggressor: 'oop' };
  const before = laterDecision('river', [], start, context);
  assert.equal(before.labels.allin, 'Bet 0 (in%)');
  assert.equal(before.labelsJa.allin, 'ベット 0 (in%)');
  const facts = laterDecisionState('river', [], start, context).options.find(option => option.action === 'allin');
  assert.equal(facts.betPercent, undefined);
  assert.equal(facts.allIn, false);
  const replay = uiReplayLater('river', ['allin'], start, context);
  assert.deepEqual(replay.history, ['BB Bet 0 (in%)']);
});
