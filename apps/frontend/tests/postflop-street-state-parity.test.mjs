// The active shared core is the exact adopted7c2 implementation, not historical-v10.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTFLOP_SPOTS } from '../scripts/postflop-ai/spots.ts';
import * as core from '../scripts/postflop-ai/street-state.mjs';
import * as ui from '../src/estimated/postflop-trial.ts';
test('adopted v7 shared core and UI re-export the identical later functions',()=>{
  assert.equal(core.laterStart,ui.laterStart);assert.equal(core.replayLater,ui.replayLater);assert.equal(core.laterDecisionState,ui.laterDecision);assert.equal(core.canRaiseNow,ui.canRaiseNow);
  assert.equal(core.canonicalStreetActions,undefined);assert.equal(core.hasObservablePostflopActions,undefined);
});
test('all85 adopted spot roots have the same amount options in core and UI',()=>{
  const spots=POSTFLOP_SPOTS.filter(spot=>spot.reachable);assert.equal(spots.length,85);assert.equal(spots.filter(spot=>spot.history).length,40);
  for(const spot of spots){const replay=core.replayFlop([],spot),view=ui.flopDecision([],spot);assert.equal(replay.state.node,view.node,spot.id);assert.equal(replay.pot,view.potBb);assert.deepEqual(core.decisionOptionFacts(replay.chipsNow,replay.state.node),view.options);}
});
