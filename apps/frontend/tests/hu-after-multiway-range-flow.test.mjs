import test from 'node:test';
import assert from 'node:assert/strict';
import { MULTIWAY_POSTFLOP_CATALOG } from '../scripts/postflop-ai/spots.ts';
import { continuationRoots, continuationTerminals } from '../src/estimated/continuation-tree.ts';
import { buildActionBlocks, buildRangeUrlActionBlocks, encodeRangeUrl, decodeRangeUrl } from '../src/estimated/range-url.ts';
import { completedFlopContext } from '../src/estimated/postflop-trial.ts';
import { withContinuationAvailability } from '../src/estimated/continuation-ranges.ts';

test('every top40 terminal progresses through Range state and shared URL to its flop',()=>{
 for (const spot of MULTIWAY_POSTFLOP_CATALOG.spots) {
  const terminal=continuationTerminals.find(t=>t.id===spot.terminalId);
  const root=continuationRoots.find(r=>r.id===terminal.root_id);
  const choices=terminal.history.slice(root.history.length).map(e=>e.action);
  const legacy=root.family==='squeeze' ? choices[0]==='four_bet' ? 1 : Math.min(2,choices.length) : 0;
  const state={rangeType:root.squeezer?'response':'three_bet',opener:root.opener,hero:root.squeezer??root.three_bettor,callers:root.callers,pendingRaise:root.squeezer?'squeeze':null,coldAction:root.cold_caller?{position:root.cold_caller,action:'call'}:root.four_bettor?{position:root.four_bettor,action:'raise'}:null,squeezeResponse:choices.slice(0,legacy).map(a=>a==='four_bet'?'raise':a),continuationActions:choices.slice(legacy)};
  const blocks=buildRangeUrlActionBlocks(state);
  assert.equal(blocks.at(-1).kind,'end',spot.id);
  assert.equal(completedFlopContext({...state,actionBlocks:blocks,isDefaultTable:true})?.spotId,spot.id);
  const decoded=decodeRangeUrl(encodeRangeUrl(state,blocks));
  assert.ok(decoded,spot.id);
  assert.equal(completedFlopContext({...decoded,actionBlocks:buildRangeUrlActionBlocks(decoded),isDefaultTable:true})?.spotId,spot.id);
  assert.equal(withContinuationAvailability(blocks,null).at(-1).continuationAvailable,false);
 }
});
