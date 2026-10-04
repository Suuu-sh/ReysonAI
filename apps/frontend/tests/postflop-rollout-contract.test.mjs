import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { compatibleOpponentSupport, compatibleRunout, weightedOpponentSampler, newMoments, addMoment,
  completedMoments, postCapRawMix } from '../scripts/postflop-ai/rollout-diagnostic-contract.mjs';
import { rolloutCall } from '../scripts/postflop-ai/rollout-low-flop-defence.mjs';
import { playFromNode } from '../scripts/postflop-ai/flop-hand-ev-core.mjs';
import { referenceLaterPolicy } from '../scripts/postflop-ai/later-policy.mjs';
import { referencePolicy } from '../scripts/postflop-ai/policy.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { spotById } from '../scripts/postflop-ai/spots.mjs';
import { rake } from '../scripts/postflop-ai/engine.mjs';

// Deterministic grid exercises the actual sampler, not a probabilistic pass/fail test.
test('known weighted support samples 1:3:6 without hand-class uniformization', () => {
  const sampler = weightedOpponentSampler([{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }, { id: 'c', weight: 6 }]);
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 1000; i++) counts[sampler.pick(() => (i + 0.5) / 1000).id]++;
  assert.deepEqual(counts, { a: 100, b: 300, c: 600 }); assert.equal(sampler.total, 10);
  for (const items of [[], [{ weight: 0 }], [{ weight: -1 }], [{ weight: Infinity }]]) assert.throws(() => weightedOpponentSampler(items));
  assert.throws(() => sampler.pick(() => 1), /Invalid uniform/);
});

test('exact hero and board blockers remove support without changing surviving weights', () => {
  const items = [{ combo: [0, 7], weight: 0.1 }, { combo: [10, 8], weight: 0.3 }, { combo: [20, 21], weight: 0.7 }];
  const before = structuredClone(items);
  assert.deepEqual(compatibleOpponentSupport(items, [0, 1, 2], [10, 11]), [items[2]]);
  assert.deepEqual(items, before);
  assert.throws(() => compatibleOpponentSupport(items, [0, 1, 2], [0, 11]), /Invalid known/);
});

test('runout rejection excludes the board, both hands and the already dealt turn', () => {
  const uniforms = [0.1, 10.1, 20.1, 7.1, 7.9, 8.1].map(card => card / 52); let used = 0;
  assert.deepEqual(compatibleRunout([0, 1, 2], [10, 11], [20, 21], () => uniforms[used++]), [7, 8]);
  assert.equal(used, 6);
  assert.throws(() => compatibleRunout([0, 1, 2], [10, 11], [10, 21], () => 0.5), /Invalid deal/);
});

test('Welford moments match a known exact sample and use n minus one', () => {
  const moments = newMoments(); for (const value of [-2, 0, 1, 5]) addMoment(moments, value);
  const result = completedMoments(moments);
  assert.equal(result.count, 4);
  // Welford is numerically stable, but intermediate division is not exact in binary64.
  for (const [actual, expected] of [[result.mean, 1], [result.m2, 26], [result.variance, 26 / 3], [result.se, Math.sqrt(26 / 3 / 4)]]) {
    assert.ok(Math.abs(actual - expected) < 1e-14, `${actual} differs from ${expected}`);
  }
  assert.equal(result.minimum, -2); assert.equal(result.maximum, 5); assert.equal(result.positive, 2);
  assert.throws(() => addMoment(moments, NaN), /Non-finite/);
  assert.throws(() => completedMoments(newMoments()), /two observations/);
});

const checkDown = () => {
  const later = structuredClone(referenceLaterPolicy());
  for (const street of ['turn', 'river']) for (const rule of later.streets[street].rules) {
    if ('check' in rule.mix) rule.mix = Object.fromEntries(Object.keys(rule.mix).map(action => [action, action === 'check' ? 100 : 0]));
  }
  return later;
};
const payoff = (flop, runout, hero, villain, forced = 'call') => playFromNode({
  flop: parseCards(flop, 3), runout: parseCards(runout, 2), hands: { BB: parseCards(hero, 2), BTN: parseCards(villain, 2) },
  history: ['bet75'], forced, policy: referencePolicy, laterPolicy: checkDown(), random: () => 0,
  spot: spotById('BTN_open_BB_call'), defence: null,
});

test('real engine incremental payoff matches checkdown win, loss, tie and fold fixtures', () => {
  const pot = 5.5 + 4.13 * 2, payout = pot - rake(pot);
  assert.ok(Math.abs(payoff('8s5d2c', 'QhJc', '2d2h', 'AcKd') - (payout - 4.13)) < 1e-12);
  assert.equal(payoff('8c8d2h', '3d4s', 'KcQh', 'AsAd'), -4.13);
  assert.ok(Math.abs(payoff('AsKsQs', 'JsTs', '2c3c', '4c5c') - (payout / 2 - 4.13)) < 1e-12);
  assert.equal(payoff('8c8d2h', '3d4s', 'KcQh', 'AsAd', 'fold'), 0);
});

const cacheArtifactsAvailable = ['btn-bb-srp-v1-policy.json', 'btn-bb-srp-v1-later-policy.json'].every(name => existsSync(new URL('../.local/postflop-ai/' + name, import.meta.url)));
if (process.env.REQUIRE_LOW_FLOP_RESEARCH === '1' && !cacheArtifactsAvailable) throw new Error('Read-only legacy artifacts are required for the cache contract');
test('fresh and warm deterministic board caches produce identical sampled moments and mixes', { skip: cacheArtifactsAvailable ? false : 'Requires explicitly restored legacy policy bytes' }, () => {
  const opts = { spot: 'BTN_open_BB_call', boardText: '8c8d2h', heroText: 'KcQh', action: 'bet75', bettorRole: 'ip',
    samples: 16, seed: 'low-flop-cold-warm-contract-v1', delta: 0.01 };
  const cold = rolloutCall(opts), warm = rolloutCall(opts);
  assert.deepEqual(cold.reach, warm.reach); assert.deepEqual(cold.initial, warm.initial);
  assert.deepEqual(cold.rollout, warm.rollout); assert.equal(cold.source_graph_sha256, warm.source_graph_sha256);
});


test('cap-active root raw diagnostic uses the post-cap base before any floor', () => {
  const hero = [44, 42], base = { fold: 30, call: 52, raise: 18 };
  const capped = { fold: 30, call: 66, raise: 4 }, expected = { fold: 80, call: 16, raise: 4 };
  let caps = 0, splits = 0;
  const context = { cap: { applyCombo(input, combo) { caps++; assert.equal(input, base); assert.equal(combo, hero); return capped; } } };
  const defence = { applyEquity(inputContext, inputBase, equity, combo, raw) {
    splits++; assert.equal(inputContext, context); assert.equal(inputBase, capped);
    assert.equal(equity, 0.2); assert.equal(combo, hero); assert.equal(raw, true); return expected;
  } };
  assert.equal(postCapRawMix(defence, context, base, 0.2, hero), expected);
  assert.equal(caps, 1); assert.equal(splits, 1);
});
