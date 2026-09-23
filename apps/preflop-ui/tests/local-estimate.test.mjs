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
