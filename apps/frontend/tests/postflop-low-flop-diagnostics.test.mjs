import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { empiricalBernsteinInterval } from '../scripts/postflop-ai/rollout-low-flop-defence.mjs';

const valid = { mean: -3, variance: 800, samples: 8192, payoffRange: 200.5, delta: 0.01 / 7 };

test('fixed-sample diagnostic uses two-sided Maurer-Pontil radius and unrounded payoff variance', () => {
  const result = empiricalBernsteinInterval(valid);
  const log = Math.log(4 / valid.delta);
  const expected = Math.sqrt(2 * valid.variance * log / valid.samples) + 7 * valid.payoffRange * log / (3 * (valid.samples - 1));
  assert.equal(result.radius, expected);
  assert.equal(result.lower, valid.mean - expected);
  assert.equal(result.upper, valid.mean + expected);
  assert.match(result.independence_assumption, /Nominal.*IID.*PRNG/);
});

test('interval respects scale and confidence; zero observed variance does not erase uncertainty', () => {
  const a = empiricalBernsteinInterval(valid);
  const b = empiricalBernsteinInterval({ ...valid, mean: valid.mean * 2, variance: valid.variance * 4, payoffRange: valid.payoffRange * 2 });
  assert.equal(b.radius, a.radius * 2);
  assert.ok(empiricalBernsteinInterval({ ...valid, delta: valid.delta / 2 }).radius > a.radius);
  assert.ok(empiricalBernsteinInterval({ ...valid, variance: 0 }).radius > 0);
});

test('invalid sample, range, delta and variance values fail closed', () => {
  for (const bad of [{ samples: 1 }, { samples: 2.5 }, { variance: -1 }, { variance: NaN }, { payoffRange: 0 }, { delta: 0 }, { delta: 1 }, { mean: Infinity }]) {
    assert.throws(() => empiricalBernsteinInterval({ ...valid, ...bad }), /Invalid/);
  }
});

test('diagnostic baseline explicitly distinguishes raw logistic and MDF promotion without approval claims', () => {
  const data = JSON.parse(readFileSync(new URL('../docs/specs/low-flop-overcall.baseline.json', import.meta.url), 'utf8'));
  assert.equal(data.kind, 'historical_diagnostic_not_acceptance');
  assert.equal(data.nodes.length, 48);
  const promoted = data.regression_cases.find(x => x.spot === 'BTN_open_BB_call' && x.board === '8d8c2h' && x.node === 'bb_vs_75');
  assert.equal(promoted.cards, 'KcQh');
  assert.equal(promoted.raw.call, 0);
  assert.equal(promoted.actual.call, 98);
  assert.equal(promoted.raw.raise, promoted.actual.raise);
  const untouched = data.regression_cases.find(x => x.cards === 'AcKh');
  assert.deepEqual(untouched.raw, untouched.actual);
});
