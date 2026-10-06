// Pure guard/rejection controls. Real numerical vectors/96 output are a separate,
// source-bound parent-approved comparison; this file cannot accept a strategy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { compileDeclaredPolicyLaw } from '../scripts/postflop-ai/effective-action-law.mjs';
import { assertJsonCompatible, freezeSnapshot, contentHash } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { actionProjection } from '../scripts/postflop-ai/observable-actions.mjs';

// Read the exact private helper rather than adding a public memo API or a test
// option to the execution model. Fail closed if its declaration cannot be found.
const source = readFileSync(new URL('../scripts/postflop-ai/effective-reach.mjs', import.meta.url), 'utf8');
const declaration = source.match(/^function numericLawMemoKey\(mix, actions\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(declaration, 'The actual private memo guard must be tested');
const key = runInThisContext(`(${declaration})`);
const actions = ['fold', 'call'];

test('local numeric memo key is exact, ordered, signed-zero preserving and mutation sensitive', () => {
  assert.equal(key({ fold: 60, call: 40 }, actions), '60|40');
  assert.equal(key({ call: 40, fold: 60 }, actions), '60|40');
  assert.notEqual(key({ fold: 60, call: 40 }, actions), key({ fold: 40, call: 60 }, actions));
  assert.notEqual(key({ fold: 0, call: 100 }, actions), key({ fold: -0, call: 100 }, actions));
  assert.notEqual(key({ fold: Number.MIN_VALUE, call: 100 }, actions), key({ fold: 0, call: 100 }, actions));
  const mix = { fold: 60, call: 40 }, before = key(mix, actions);
  mix.fold = 59.99999999999999; assert.notEqual(key(mix, actions), before);
});

test('unusual raw mix shapes bypass memo without reading a getter or coercing values', () => {
  let reads = 0;
  const getter = { get fold() { reads++; return 60; }, call: 40 };
  assert.equal(key(getter, actions), null); assert.equal(reads, 0);
  for (const value of [NaN, Infinity, -Infinity, undefined, '60', null, new Number(60), { valueOf() { throw Error('coercion'); } }]) {
    assert.equal(key({ fold: value, call: 40 }, actions), null);
  }
  assert.equal(key(Object.assign(Object.create(null), { fold: 60, call: 40 }), actions), null);
  assert.equal(key(Object.create({ fold: 60, call: 40 }), actions), null);
  assert.equal(key({ fold: 60, call: 40, extra: 0 }, actions), null);
  const hidden = { fold: 60, call: 40 }; Object.defineProperty(hidden, 'fold', { enumerable: false });
  assert.equal(key(hidden, actions), null);
  const symbolic = { fold: 60, call: 40, [Symbol('extra')]: 0 }; assert.equal(key(symbolic, actions), null);
  const cyclic = { fold: 60, call: 40 }; cyclic.extra = cyclic; assert.equal(key(cyclic, actions), null);
});

test('existing public compiler semantics and rejection boundaries remain unchanged', () => {
  const observation = actionProjection({ street: 'river', node: 'river_oop_first', pot: 30, stacks: { ip: 10, oop: 10 }, committed: { ip: 0, oop: 0 } });
  const order = observation.actions, raw = Object.fromEntries(order.map(action => [action, action === 'check' ? 100 : 0]));
  const expected = compileDeclaredPolicyLaw(raw, order, observation);
  assert.deepEqual(compileDeclaredPolicyLaw(raw, order, freezeSnapshot(observation)), expected);
  assert.ok(Object.isFrozen(expected)); assert.ok(Object.isFrozen(expected.physicalMass));
  // The old compiler reads selected raw values and ignores extra raw fields.
  // Do not pretend its existing interface rejects those successful cases.
  let reads = 0; const getter = { ...raw }; Object.defineProperty(getter, 'check', { get() { reads++; return 100; }, enumerable: true });
  assert.equal(key(getter, order), null); assert.equal(reads, 0);
  assert.deepEqual(compileDeclaredPolicyLaw(getter, order, observation), expected); assert.equal(reads, 1);
  const extra = { ...raw }; extra.ignoredCycle = extra;
  assert.equal(key(extra, order), null); assert.deepEqual(compileDeclaredPolicyLaw(extra, order, observation), expected);
  assert.throws(() => compileDeclaredPolicyLaw({ ...raw, check: NaN }, order, observation));
  assert.throws(() => compileDeclaredPolicyLaw({ ...raw, check: Infinity }, order, observation));
  for (const bad of [NaN, Infinity, undefined, new Date(), Object.create({ inherited: true }), { get value() { return 1; } }, [,,]]) {
    assert.throws(() => assertJsonCompatible(bad)); assert.throws(() => freezeSnapshot(bad)); assert.throws(() => contentHash(bad));
  }
  const cycle = {}; cycle.self = cycle; assert.throws(() => assertJsonCompatible(cycle));
  assert.throws(() => assertJsonCompatible({ [Symbol('secret')]: 1 }));
});

test('memo source remains prepare-local, bounded and absent from public law path', () => {
  assert.equal((source.match(/prefixLaws = new Map\(\)/g) ?? []).length, 1);
  const prepare = source.slice(source.indexOf('  prepare(prefix) {'), source.indexOf('  law(request, combo) {'));
  assert.match(prepare, /const context = .*\n[\s\S]*const prefixLaws = new Map\(\)/);
  assert.match(prepare, /prefixLaws\.size < 256/);
  assert.match(prepare, /compileDeclaredPolicyLaw\(mix, actions, target.observation\)/);
  assert.doesNotMatch(source.slice(source.indexOf('  law(request, combo) {')), /prefixLaws/);
});
