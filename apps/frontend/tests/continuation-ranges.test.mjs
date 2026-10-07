import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { continuationDecisions } from '../src/estimated/continuation-tree.ts';
import { continuationSavedRange, continuationSourceNames, withContinuationAvailability } from '../src/estimated/continuation-ranges.ts';
import { buildRangeUrlActionBlocks } from '../src/estimated/range-url.ts';

const sources = Object.fromEntries(continuationSourceNames.map(name => [name,
  JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)))]));
const refFor = node => ({ kind: 'bounded', position: node.hero, id: node.id });
const nodeFor = id => continuationDecisions.find(node => node.id === id);
const saved = (id, data = sources) => continuationSavedRange(refFor(nodeFor(id)), data);
const rowFor = (data, dataset, id, hand) => data[dataset].spots.find(spot => spot.id === id).hands.find(row => row.hand === hand);
const openerId = 'UTG_vs_BB_squeeze_HJcall';

test('squeeze opener and caller placeholders are unreachable; fractional prior reach preserves the saved mix', () => {
  const original = JSON.stringify(sources['squeeze-responses']);
  for (const id of [openerId, 'HJ_vs_BB_squeeze_UTGfold', 'HJ_vs_BB_squeeze_UTGcall']) {
    const range = saved(id);
    assert.equal(range.model.aggregates.get('72o').unreachable, true, id);
    assert.deepEqual(range.model.aggregates.get('72o').actions, {}, id);
    const row = range.spot.hands.find(row => row.hand === 'AA');
    assert.equal(range.model.aggregates.get('AA').unreachable, undefined, id);
    assert.deepEqual(range.model.aggregates.get('AA').actions,
      Object.fromEntries(range.model.actions.map(action => [action, row[action] / 100])), id);
  }
  // HJ calls AA only 10% before this response: its conditional mix still sums to 1.
  assert.equal(rowFor(sources, 'preflop-ranges', 'HJ_vs_UTG', 'AA').call, 10);
  assert.equal(Object.values(saved('HJ_vs_BB_squeeze_UTGfold').model.aggregates.get('AA').actions).reduce((a, b) => a + b), 1);
  // AJs really opens, then folds 100% to the squeeze. A fold-only mix is not
  // itself evidence that a hand is unreachable.
  assert.ok(rowFor(sources, 'opening-ranges', 'UTG_open', 'AJs').open > 0);
  assert.equal(saved(openerId).model.aggregates.get('AJs').unreachable, undefined);
  assert.equal(saved(openerId).model.aggregates.get('AJs').actions.fold, 1);
  assert.equal(JSON.stringify(sources['squeeze-responses']), original);
});

test('later responses in every bounded family preserve AA and mask any zero prior-action factor', () => {
  for (const family of ['squeeze', 'cold_four_bet', 'two_caller_squeeze', 'three_bet_cold_call']) {
    const node = continuationDecisions.find(node => node.family === family && !node.reused &&
      node.source_factors[node.hero].length >= 2 && sources[node.dataset].spots.some(spot => spot.id === node.id));
    assert.ok(node, family);
    const range = saved(node.id);
    assert.equal(range.model.aggregates.get('AA').unreachable, undefined, family);
    assert.equal(range.model.aggregates.get('AA').actions.call, 1, family);
    const factor = node.source_factors[node.hero].at(-1);
    const changed = structuredClone(sources);
    rowFor(changed, factor.dataset, factor.spot_id, 'AA')[factor.action] = 0;
    assert.equal(saved(node.id, changed).model.aggregates.get('AA').unreachable, true, family);
    assert.deepEqual(saved(node.id, changed).model.aggregates.get('AA').actions, {}, family);
  }
});

test('an empty observed fold history is unreachable even when Hero has positive own reach', () => {
  const changed = structuredClone(sources);
  changed['squeeze-responses'].spots.find(spot => spot.id === openerId).hands.forEach(row => { row.fold = 0; });
  const range = saved('HJ_vs_BB_squeeze_UTGfold', changed);
  assert.ok([...range.model.aggregates.values()].every(row => row.unreachable && !Object.keys(row.actions).length));
});

test('joint card impossibility masks AA against two AA-only seats but retains KK', () => {
  const changed = structuredClone(sources);
  for (const [dataset, id, action] of [['preflop-ranges', 'HJ_vs_UTG', 'call'], ['multiway-responses', 'BB_vs_UTG_HJcall', 'squeeze']]) {
    changed[dataset].spots.find(spot => spot.id === id).hands.forEach(row => { row[action] = row.hand === 'AA' ? 100 : 0; });
  }
  const range = saved(openerId, changed);
  assert.equal(range.model.aggregates.get('AA').unreachable, true);
  assert.equal(range.model.aggregates.get('KK').unreachable, undefined);
  assert.equal(range.model.aggregates.get('KK').actions.call + range.model.aggregates.get('KK').actions.four_bet, 1);
});

test('missing and invalid ancestors remain unavailable and disable continuation', () => {
  const changed = structuredClone(sources);
  delete changed['opening-ranges'];
  assert.equal(saved(openerId, changed), null);
  const blocks = buildRangeUrlActionBlocks({ rangeType: 'response', opener: 'UTG', hero: 'BB', callers: ['HJ'], pendingRaise: 'squeeze' });
  assert.ok(withContinuationAvailability(blocks, changed).at(-1).options.every(option => option.disabled));
  const invalid = structuredClone(sources);
  rowFor(invalid, 'opening-ranges', 'UTG_open', '72o').open = NaN;
  assert.equal(saved(openerId, invalid), null);
});

test('terminal comparison retains both live seats and the original unmasked root decision', () => {
  const blocks = buildRangeUrlActionBlocks({ rangeType: 'response', opener: 'UTG', hero: 'BB', callers: ['HJ'], pendingRaise: 'squeeze', squeezeResponse: ['fold', 'call'] });
  assert.deepEqual(blocks.at(-1).continuationTerminal.live_participants, ['HJ', 'BB']);
  const bb = blocks.find(block => block.position === 'BB');
  const root = continuationSavedRange(bb.rangeRef, sources);
  assert.equal(root.model.aggregates.get('72o').unreachable, undefined);
  assert.equal(root.model.aggregates.get('72o').actions.fold, 1);
  assert.equal(withContinuationAvailability(blocks, sources).at(-1).continuationAvailable, true);
});
