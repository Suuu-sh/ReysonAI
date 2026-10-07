import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMw3AuthorArgs, MW3_GATE_FLAGS } from '../scripts/postflop-ai/mw3-author-cli.mjs';
const valid = ['--spot', 'HJ_open_BTN_call_BB_call', '--model', 'gpt-6-astra', '--source-hash', 'a'.repeat(64)];
test('non-pilot CLI requires exact explicit identity; parser never imports an author or generates', () => {
  assert.deepEqual(parseMw3AuthorArgs(valid), { spotId: 'HJ_open_BTN_call_BB_call', model: 'gpt-6-astra', sourceHash: 'a'.repeat(64), actions: [] });
  for (const values of [[], valid.slice(0, -1), [...valid, '--publish'], [...valid, '--spot', 'other'], [...valid, '--all-flops'],
    valid.map(x => x === 'HJ_open_BTN_call_BB_call' ? 'CO_open_BTN_call_BB_call' : x), valid.map(x => x === 'gpt-6-astra' ? 'other' : x),
    valid.map(x => x === 'a'.repeat(64) ? 'bad' : x), valid.map(x => x === 'HJ_open_BTN_call_BB_call' ? '../path' : x)]) assert.throws(() => parseMw3AuthorArgs(values));
});
test('each gate phase is explicit and cannot be duplicated or used as a scalar argument', () => {
  assert.throws(() => parseMw3AuthorArgs(valid, { gate: true }));
  assert.deepEqual(parseMw3AuthorArgs([...valid, ...MW3_GATE_FLAGS], { gate: true }).actions, MW3_GATE_FLAGS);
  for (const flag of MW3_GATE_FLAGS) {
    assert.deepEqual(parseMw3AuthorArgs([flag, ...valid], { gate: true }).actions, [flag]);
    assert.throws(() => parseMw3AuthorArgs([...valid, flag, flag], { gate: true }));
  }
  assert.throws(() => parseMw3AuthorArgs(['--spot', '--joint', ...valid.slice(2)], { gate: true }));
});
