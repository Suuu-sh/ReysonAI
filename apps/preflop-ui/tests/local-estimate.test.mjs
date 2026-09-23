import test from 'node:test';
import assert from 'node:assert/strict';
import { hands } from '../src/data.js';
import { validateRequest, validateEstimate } from '../scripts/local-estimate.mjs';
const request = validateRequest({ opener: 'BTN', callers: ['SB'], hero: 'BB' });
test('only reachable caller-before-hero paths are accepted', () => {
  assert.deepEqual(request, { opener: 'BTN', callers: ['SB'], hero: 'BB' });
  assert.throws(() => validateRequest({ opener: 'BTN', callers: ['BB'], hero: 'SB' }));
  assert.throws(() => validateRequest({ opener: 'BTN', callers: ['SB', 'SB'], hero: 'BB' }));
});
test('AI estimate validates all 169 integer frequencies and identity', () => {
  const data = { kind: 'ai_estimate_not_gto', effective_stack_bb: 100, open_size_bb: 2.5, ...request, ranges: ['SB', 'BB'].map(position => ({ position, raise_to_bb: 12.5, rows: hands.map(hand => [hand, 70, 20, 10]) })) };
  assert.equal(validateEstimate(data, request), data);
  data.ranges[0].rows[0][2] = 21;
  assert.throws(() => validateEstimate(data, request));
});

test('5bet all-in response is a separate, context-bound local estimate with call and fold only', () => {
  const fiveBet = validateRequest({ scenario: 'five_bet_all_in_response', opener: 'UTG', hero: 'HJ', callers: [], three_bet_size_bb: 8, four_bet_size_bb: 20, all_in_size_bb: 100 });
  assert.deepEqual(fiveBet, { scenario: 'five_bet_all_in_response', opener: 'UTG', hero: 'HJ', callers: [], three_bet_size_bb: 8, four_bet_size_bb: 20, all_in_size_bb: 100 });
  const data = {
    kind: 'ai_estimate_not_gto', scenario: fiveBet.scenario, effective_stack_bb: 100, open_size_bb: 2.5,
    opener: fiveBet.opener, hero: fiveBet.hero, callers: [], three_bet_size_bb: 8, four_bet_size_bb: 20, all_in_size_bb: 100,
    ranges: [{ position: 'UTG', raise_to_bb: null, available_actions: ['call', 'fold'], rows: hands.map(hand => [hand, 80, 20, 0]) }],
  };
  assert.equal(validateEstimate(data, fiveBet), data);
  const invalidFrequency = structuredClone(data);
  invalidFrequency.ranges[0].rows[0][3] = 1;
  assert.throws(() => validateEstimate(invalidFrequency, fiveBet));
  const invalidActions = structuredClone(data);
  invalidActions.ranges[0].available_actions = ['raise', 'call', 'fold'];
  assert.throws(() => validateEstimate(invalidActions, fiveBet));
  const invalidHistory = structuredClone(data);
  invalidHistory.four_bet_size_bb = 26;
  assert.throws(() => validateEstimate(invalidHistory, fiveBet));
});

test('5bet response request rejects impossible positions, callers and sizes', () => {
  const base = { scenario: 'five_bet_all_in_response', opener: 'UTG', hero: 'HJ', callers: [], three_bet_size_bb: 8, four_bet_size_bb: 20, all_in_size_bb: 100 };
  assert.throws(() => validateRequest({ ...base, opener: 'BB' }));
  assert.throws(() => validateRequest({ ...base, callers: ['CO'] }));
  assert.throws(() => validateRequest({ ...base, four_bet_size_bb: 8 }));
  assert.throws(() => validateRequest({ ...base, all_in_size_bb: 99 }));
});
