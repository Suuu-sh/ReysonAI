import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/model11-execution-fixtures.mjs';
import { createModel11Execution } from '../scripts/postflop-ai/execution-model11.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
const request = (text, path) => ({ board: parseCards(text, text.length / 2), path });
const ownCombo = (inputs, prefix) => comboRange(inputs.seatRows[prefix.pending.seat], 'freq', prefix.board)[0].combo;

test('historical reuse leaves public accessor and Array subclass reads unchanged', () => {
  const { inputs, execution } = fixture();
  const plain = request('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] });
  const combo = ownCombo(inputs, execution.prefix(plain));
  const counted = () => {
    const reads = { board: 0, path: 0, species: 0 };
    class Board extends Array { static get [Symbol.species]() { reads.species++; return Board; } }
    const cards = new Board(...plain.board), path = structuredClone(plain.path);
    return { reads, request: { get board() { reads.board++; return cards; }, get path() { reads.path++; return path; } } };
  };
  const prefixOnly = counted(); execution.prefix(prefixOnly.request);
  for (let repeat = 0; repeat < 2; repeat++) {
    const lawCall = counted(); execution.law(lawCall.request, combo);
    assert.deepEqual(lawCall.reads, prefixOnly.reads);
  }
  execution.releaseBoardCaches();
  const afterRelease = counted(); execution.law(afterRelease.request, combo);
  assert.deepEqual(afterRelease.reads, prefixOnly.reads);
  execution.releaseBoardCaches();
});

test('history and revealed turn/river order remain distinct across calls and explicit release', () => {
  const { inputs, flop, later, execution } = fixture();
  const requests = [
    request('Jc9d4h2s8c', { flop: ['check', 'check'], turn: ['check', 'check'], river: [] }),
    request('Jc9d4h8c2s', { flop: ['check', 'check'], turn: ['check', 'check'], river: [] }),
    request('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] }),
  ];
  for (const req of [...requests, ...requests.slice().reverse()]) {
    const fresh = createModel11Execution(inputs, flop, later), prefix = fresh.prefix(req), combo = ownCombo(inputs, prefix);
    const expected = fresh.law(req, combo);
    assert.deepEqual(execution.law(req, combo), expected);
    execution.releaseBoardCaches(); assert.deepEqual(execution.law(req, combo), expected);
    fresh.releaseBoardCaches();
  }
  const invalid = structuredClone(requests[0]); invalid.board[0] = invalid.board[1];
  assert.throws(() => execution.law(invalid, [0, 1]), error => error.status === 'invalid-public-prefix');
  execution.releaseBoardCaches();
});

test('each zero cache budget preserves laws without retaining completed numeric entries', () => {
  const { inputs, flop, later, execution } = fixture();
  const req = request('Jc9d4h2s', { flop: ['check', 'check'], turn: ['bet125'] });
  const combo = ownCombo(inputs, execution.prefix(req)), expected = execution.law(req, combo);
  for (const key of ['entries', 'numericBytes', 'metadataBytes']) {
    const zero = createModel11Execution(inputs, flop, later, { cache: { [key]: 0 } });
    assert.deepEqual(zero.law(req, combo), expected); assert.deepEqual(zero.law(req, combo), expected);
    assert.equal(zero.cacheStats().entries, 0); assert.equal(zero.cacheStats().active, 0);
    zero.releaseBoardCaches(); assert.deepEqual(zero.law(req, combo), expected); zero.releaseBoardCaches();
  }
  execution.releaseBoardCaches();
});

test('private historical prefixes have a fixed cap and both request-finalization and explicit-release resets', () => {
  const source = readFileSync(new URL('../scripts/postflop-ai/effective-reach.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/#historicalPrefixes = new Map\(\)/g) ?? []).length, 1);
  assert.equal((source.match(/this\.#historicalPrefixes\.clear\(\)/g) ?? []).length, 2);
  const reach = source.slice(source.indexOf('  reach(seat, entries, board, table = null) {'), source.indexOf('  prepare(prefix) {'));
  assert.match(reach, /JSON\.stringify\(\[request\.board, request\.path\.flop, request\.path\.turn, request\.path\.river\]\)/);
  assert.match(reach, /this\.#historicalPrefixes\.size < MAX_PREFIX_DECISIONS/);
  assert.match(reach, /this\.requestDepth > 0/);
  assert.match(reach, /const vector = this\.prepare\(prefix\)/);
  const publicLaw = source.slice(source.indexOf('  law(request, combo) {'), source.indexOf('  // Gate-only projection'));
  assert.doesNotMatch(publicLaw, /historicalPrefixes/);
});
