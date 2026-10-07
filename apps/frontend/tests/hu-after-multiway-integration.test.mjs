import test from 'node:test';
import assert from 'node:assert/strict';
import { MULTIWAY_POSTFLOP_CATALOG, spotFor } from '../scripts/postflop-ai/spots.ts';
import { postflopSpotFor } from '../src/agent/hand.ts';
import { flopSpotFor, completedFlopContext } from '../src/estimated/postflop-trial.ts';
import { continuationDecisions } from '../src/estimated/continuation-tree.ts';
import { continuationDecisionForEvents } from '../src/estimated/continuation-history.ts';
import { datasetsNeededForSpot } from '../src/estimated/postflop-browser.ts';
import { buildActionBlocks } from '../src/estimated/range-url.ts';

test('catalog histories resolve identically for Agent and completed Range context', () => {
  assert.equal(MULTIWAY_POSTFLOP_CATALOG.spots.length, 40);
  for (const spot of MULTIWAY_POSTFLOP_CATALOG.spots) {
    const events = spot.history.map(e => ({ pos: e.seat, key: e.action, type: ['open','squeeze','three_bet','four_bet','all_in'].includes(e.action) ? 'raise' : e.action, to: e.to_size_bb }));
    assert.equal(postflopSpotFor(events)?.id, spot.id);
    const actionBlocks = [{ kind: 'end', result: '2人でフロップへ', pot: `ポット ${spot.potBb}bb`, postflopEvents: spot.history }];
    const state = { actionBlocks, rangeType: 'response', opener: spot.opener, hero: spot.aggressor, callers: [spot.caller], isDefaultTable: true };
    assert.equal(flopSpotFor(state)?.id, spot.id);
    const context = completedFlopContext(state);
    assert.equal(context.spotId, spot.id);
    assert.deepEqual(context.players, [spot.oop, spot.ip]);
    assert.equal(completedFlopContext({ ...state, isDefaultTable: false }).pilotAvailable, false);
    assert.ok(datasetsNeededForSpot(spot).includes('hu-after-multiway-spots'));
  }
});

test('existing squeeze Range state connects a published HU-after-multiway path', () => {
  const spot = MULTIWAY_POSTFLOP_CATALOG.spots.find(s => s.id === 'UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call') ?? MULTIWAY_POSTFLOP_CATALOG.spots.find(s => s.kind === 'sqp' && s.history.length === 5 && s.history[3].action === 'fold' && s.history[4].action === 'call');
  assert.ok(spot, 'top40 must contain a legacy squeeze terminal');
  const state = { rangeType: 'response', opener: spot.opener, hero: spot.aggressor, callers: [spot.caller], pendingRaise: 'squeeze', squeezeResponse: ['fold', 'call'] };
  const actionBlocks = buildActionBlocks(state);
  assert.equal(flopSpotFor(state)?.id, spot.id);
  assert.equal(completedFlopContext({ ...state, actionBlocks, isDefaultTable: true })?.spotId, spot.id);
});

test('exact continuation history and unsupported multiway remain fail-closed', () => {
  const node = continuationDecisions.find(n => n.history.some(e => e.action === 'squeeze'));
  assert.equal(continuationDecisionForEvents(node.history)?.id, node.id);
  const wrong = node.history.map(e => ({ ...e }));
  wrong.find(e => e.action === 'open').to_size_bb += 1;
  assert.equal(continuationDecisionForEvents(wrong), null);
  assert.equal(postflopSpotFor([{ pos:'UTG', type:'raise', key:'open' }, { pos:'HJ', type:'call', key:'call' }, { pos:'BB', type:'call', key:'call' }]), null);
  assert.equal(postflopSpotFor([{pos:'BTN',type:'raise',key:'open'},{pos:'BB',type:'call',key:'call'}])?.id, spotFor('BTN','BB').id);
});
