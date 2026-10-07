// The v10 observable floor/cap experiment is not the adopted saved-policy runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { loadCandidate,loadLaterCandidate } from '../scripts/postflop-ai/generate.mjs';
import { defenceFor,replayDecision,DEFENCE_VERSION } from '../scripts/postflop-ai/defence.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
const inputs=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const flop=loadCandidate(inputs),later=loadLaterCandidate(inputs,flop);
test('adopted v7 saved-history defence uses the same computational contract as matching history-free geometry',()=>{
  assert.equal(DEFENCE_VERSION,7);const controls={...inputs,spot:{...inputs.spot,history:undefined}};
  const board=parseCards('7c5d5hTs6h',5),path={flop:['check','check'],turn:['check','check'],river:['check','bet33']};
  const models=[inputs,controls].map(input=>{const table=replayDecision(input,board,path),model=defenceFor(input,flop.policy,later.policy);return {table,model};});
  for(const hole of ['AcKc','Ad9d','8c8d']){
    const combo=parseCards(hole,2),outputs=models.map(({table,model})=>{const node=table.log.at(-1).node,base=model.baseMix(table,board,node,combo);return {base,mix:model.mix(table,board,node,combo,base),facts:model.facts(table,board,node,combo,base)};});
    assert.deepEqual(outputs[0],outputs[1],hole);
  }
  for(const {table,model} of models){assert.equal(model.observableMix,undefined);assert.equal(model.negativeRiverCallEv,undefined);assert.ok(table.log.every(entry=>!entry.observation));model.releaseBoardCaches();}
});
test('adopted v7 replay rejects illegal suffixes after an effective call instead of inventing a decision',()=>{
  const board=parseCards('Ac7d2h9hJd',5);
  assert.throws(()=>replayDecision(inputs,board,{flop:['bet33','call'],turn:['bet75','call'],river:['check','bet125','raise','fold']}),/effectively called|Illegal|after|pending decision/);
  assert.throws(()=>replayDecision(inputs,board,{flop:['check','check'],turn:['check','check'],river:['allin','raise']}),/Illegal|Invalid|history|pending decision/);
});
