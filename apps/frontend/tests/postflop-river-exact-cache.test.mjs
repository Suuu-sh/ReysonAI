import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { defenceFor, RIVER_EXACT_CACHE_LIMIT } from '../scripts/postflop-ai/defence.ts';
import { REPRESENTATIVE, foundationPair, exactCacheFixture, exactCacheObservation } from './helpers/river-floor-regression.mjs';

const inputs = loadInputs(REPRESENTATIVE), pair = foundationPair();
const fresh = () => defenceFor({ ...inputs }, pair.candidate.policy, pair.laterCandidate.policy);

test('512 real-support contexts retain only128 exact ranges/sign maps and identical evicted revisits', () => {
  assert.equal(RIVER_EXACT_CACHE_LIMIT, 128);
  const model = fresh(), { contexts, heroes, source } = exactCacheFixture(inputs, pair, model);
  const expected = exactCacheObservation(model, contexts[0], heroes);
  for (const context of contexts) {
    assert.deepEqual(exactCacheObservation(model, context, heroes), expected);
    assert.ok(model.exactRiverContexts.size <= 128);
  }
  assert.equal(contexts.filter(context => context.exactRiverCallEv).length, 128);
  assert.equal(model.exactRiverContexts.size, 128);
  assert.equal(contexts[0].exactRiverCallEv, undefined);
  assert.deepEqual(exactCacheObservation(model, contexts[384], heroes), expected, 'touch the oldest retained context');
  assert.deepEqual(exactCacheObservation(model, contexts[0], heroes), expected, 'recompile an evicted context');
  assert.ok(contexts[384].exactRiverCallEv);
  assert.equal(contexts[385].exactRiverCallEv, undefined, 'touch updates LRU order');
  for (const index of [127, 256, 511, 0]) assert.deepEqual(exactCacheObservation(model, contexts[index], heroes), expected);
  model.releaseBoardCaches();
  assert.equal(model.exactRiverContexts.size, 0);
  assert.equal(contexts.filter(context => context.exactRiverCallEv).length, 0, 'external references retain no compiled data');
  assert.equal(model.contexts.river.size, 0);
  source.defence.releaseBoardCaches();
});

test('river trimming clears exact memoization without retaining removed ordinary contexts', () => {
  const model = fresh(), { contexts, heroes, source } = exactCacheFixture(inputs, pair, model);
  for (const context of contexts) exactCacheObservation(model, context, heroes);
  model.trimRiverCaches(512);
  assert.equal(model.exactRiverContexts.size, 128, 'no actual trim leaves the cache intact');
  model.trimRiverCaches(511);
  assert.equal(model.contexts.river.size, 0);
  assert.equal(model.exactRiverContexts.size, 0);
  assert.equal(contexts.filter(context => context.exactRiverCallEv).length, 0);
  source.defence.releaseBoardCaches();
});

test('ordinary river-context LRU eviction removes that context from the exact LRU', () => {
  const model = fresh(), { contexts, heroes, source } = exactCacheFixture(inputs, pair, model, 1);
  const old = contexts[0]; exactCacheObservation(model, old, heroes);
  for (let i = 1; i < 16000; i++) model.contexts.river.set(`placeholder-${i}`, null);
  assert.equal(model.contexts.river.size, 16000);
  model.context(source.table, source.board, source.entry.node);
  assert.equal(old.exactRiverCallEv, undefined);
  assert.equal(model.exactRiverContexts.has(old), false);
  model.releaseBoardCaches(); source.defence.releaseBoardCaches();
});
