import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRiverCallEv, exactRiverCallEv, positiveDyadic } from '../scripts/postflop-ai/exact-river-call-ev.mjs';

const board = [40, 41, 42, 43, 44], hero = [0, 1];
function fixture(weights = [3, 7], ranks = [1, 3], call = 3, net = 10) {
  const score = new Float64Array(52 * 52).fill(-1); score[1] = 2;
  const combos = [[2, 3], [4, 5]], ids = combos.map(([a, b]) => a * 52 + b);
  ids.forEach((id, i) => score[id] = ranks[i]);
  return { score, context: { street: 'river', board, call, finalPot: net, rake: 0,
    bettorRange: { ids, w: weights, lo: combos.map(x => x[0]), hi: combos.map(x => x[1]) } } };
}
const result = f => exactRiverCallEv(compileRiverCallEv(f.context, f.score), hero);
const bits = new DataView(new ArrayBuffer(8));
function adjacent(value, direction) {
  bits.setFloat64(0, value, false);
  bits.setBigUint64(0, bits.getBigUint64(0, false) + BigInt(direction), false);
  return bits.getFloat64(0, false);
}

test('exact zero, strict signs, ties and adjacent weight/cost/net-pot ULPs', () => {
  assert.equal(result(fixture()).sign, 0);
  assert.equal(result(fixture([2, 8])).sign, -1);
  assert.equal(result(fixture([4, 6])).sign, 1);
  assert.equal(result(fixture([1, 0], [2, 3], 5, 10)).sign, 0);
  assert.equal(result(fixture([1, 0], [2, 3], 4, 10)).sign, 1);
  assert.equal(result(fixture([1, 0], [2, 3], 6, 10)).sign, -1);
  for (const direction of [-1, 1]) {
    assert.equal(result(fixture([adjacent(3, direction), 7])).sign, direction);
    assert.equal(result(fixture([3, 7], [1, 3], adjacent(3, direction), 10)).sign, -direction);
    assert.equal(result(fixture([3, 7], [1, 3], 3, adjacent(10, direction))).sign, direction);
  }
});

test('subnormal weights/costs and exact order/scaling preserve the sign without underflow', () => {
  assert.deepEqual(positiveDyadic(Number.MIN_VALUE), { n: 1n, e: -1074 });
  const tiny = result(fixture([Number.MIN_VALUE, 1]));
  assert.equal(tiny.sign, -1); assert.equal(tiny.win_combos, 1, 'a true tiny win may still be negative EV');
  assert.equal(result(fixture([1, 0], [1, 3], Number.MIN_VALUE, 1)).sign, 1);
  assert.equal(result(fixture([1, 0], [2, 3], Number.MIN_VALUE, Number.MIN_VALUE * 2)).sign, 0);
  for (const scale of [2 ** 100, 2 ** -100, Number.MIN_VALUE]) {
    assert.equal(result(fixture([3 * scale, 7 * scale])).sign, 0);
  }
  const reversed = fixture();
  for (const key of ['ids', 'w', 'lo', 'hi']) reversed.context.bettorRange[key].reverse();
  assert.equal(result(reversed).sign, 0);
  assert.equal(result(fixture([Number.MAX_VALUE, Number.MAX_VALUE], [2, 3], 1, 4)).sign, 0, 'sum cannot overflow');
});

test('net pot is the existing rounded Float64 subtraction, never exact chip subtraction or cents', () => {
  // 1 - 2^-54 rounds to 1 in Number. Exact subtraction would classify
  // this tie as negative; preserving the saved subtraction gives exactly EV0.
  const f = fixture([1, 0], [2, 3], 0.5, 1); f.context.rake = 2 ** -54;
  assert.equal(f.context.finalPot - f.context.rake, 1);
  assert.equal(result(f).sign, 0);
  const decimal = fixture([1, 0], [2, 3], 0.05, 0.3); decimal.context.rake = 0.2;
  assert.equal(result(decimal).sign, -1, 'saved 0.3 - 0.2 is below saved 0.1');
  decimal.context.call = (decimal.context.finalPot - decimal.context.rake) / 2;
  assert.equal(result(decimal).sign, 0);
});

test('unknown, invalid and empty support never proves negative call EV', () => {
  for (const weights of [[0, 0], [NaN, 1], [Infinity, 1], [-1, 1]]) assert.equal(result(fixture(weights)).status, 'unknown');
  for (const rank of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(result(fixture([1, 1], [rank, 3])).status, 'unknown');
    const f = fixture(); f.score[1] = rank; assert.equal(result(f).status, 'unknown');
  }
  for (const [pot, rake, call] of [[-1, 0, 1], [1, -1, 1], [1, 2, 1], [Infinity, 0, 1], [1, 0, 0], [1, 0, NaN]]) {
    const f = fixture(); Object.assign(f.context, { finalPot: pot, rake, call }); assert.equal(result(f).status, 'unknown');
  }
  const malformed = fixture(); malformed.context.bettorRange.w = [1]; assert.equal(result(malformed).status, 'unknown');
  const badCombo = fixture(); badCombo.context.bettorRange.ids[0] = 0; assert.equal(result(badCombo).status, 'unknown');
  const duplicate = fixture();
  for (const key of ['ids', 'lo', 'hi']) duplicate.context.bettorRange[key][1] = duplicate.context.bettorRange[key][0];
  assert.equal(result(duplicate).status, 'unknown');
  for (const cards of [[0, 0], [0, 40], [-1, 1], [0, 52], [0]]) {
    assert.equal(exactRiverCallEv(compileRiverCallEv(fixture().context, fixture().score), cards).status, 'unknown');
  }
  for (const changed of [{ street: 'turn' }, { board: [40, 41, 42, 43] }, { board: [40, 41, 42, 43, 43] }]) {
    const f = fixture(); Object.assign(f.context, changed); assert.equal(result(f).status, 'unknown');
  }
});

test('zero-weight, board-blocked and hero-blocked invalid ranks are irrelevant outcomes', () => {
  assert.equal(result(fixture([0, 1], [-1, 3])).sign, -1);
  for (const blockedCard of [0, 40]) {
    const f = fixture(), range = f.context.bettorRange;
    range.lo[0] = blockedCard; range.hi[0] = 3;
    range.ids[0] = Math.min(blockedCard, 3) * 52 + Math.max(blockedCard, 3);
    f.score[range.ids[0]] = NaN;
    assert.equal(result(f).sign, -1);
    range.w[1] = 0; assert.equal(result(f).status, 'unknown');
  }
});
