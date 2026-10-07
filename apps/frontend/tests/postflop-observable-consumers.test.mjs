// Supersedes unadopted v10 alias-pooling consumer assertions. The product uses saved HU-v7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor,choose } from '../scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy } from '../scripts/postflop-ai/later-policy.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { replayDecision } from '../scripts/postflop-ai/defence.ts';
import { laterExplainContext } from '../scripts/postflop-ai/explain-later.ts';
import { createAgent } from '../src/agent/policy.ts';
import { LATER_NODES } from '../scripts/postflop-ai/later-tree.ts';
import { computeLaterView,computeLaterExplain } from '../src/estimated/postflop-compute.ts';
import { buildLaterView } from '../scripts/postflop-ai/local-view.mjs';
import { sha } from '../scripts/postflop-ai/browser-inputs.ts';
import { dataset } from '../src/estimated/datasets.ts';
const inputs=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
const request=alias=>({flop:'Ac7d2h',flopActions:'bet33,call',turn:'9h',turnActions:'bet75,call',river:'Jd',riverActions:`check,${alias}`});
const datasets=Object.fromEntries([...new Set(Object.values(inputs.spot.ranges).flat().map(f=>f[0]))].map(name=>[name,dataset(name)]));
const candidate={policy:flop,metadata:{source_hash:inputs.fingerprint,policy_hash:sha(flop)}};
const laterCandidate={policy:later,metadata:{source_hash:inputs.fingerprint,flop_policy_hash:sha(flop),policy_hash:sha(later)}};
test('adopted v7 keeps each saved size label and facing node even when chip amounts merge',()=>{
  for(const action of ['bet33','bet75','bet125','allin']){
    const context=laterExplainContext(request(action),inputs);
    assert.deepEqual(context.riverPath,['check',action]);
    assert.equal(context.decision.node,`river_oop_vs_${action==='allin'?'allin':action.slice(3)}`);
    const table=replayDecision(inputs,context.board,{flop:context.flopPath,turn:context.turnPath,river:context.riverPath});
    assert.equal(table.log.at(-1).node,context.decision.node);assert.ok(!table.log.at(-1).observation);
  }
});
test('adopted v7 browser and local views use the same saved-label path and normalized rows',()=>{
  for(const alias of ['bet75','allin']){
    const args={...request(alias),spotId:inputs.spot.id,datasets,flopCandidate:candidate,laterCandidate};
    const browser=computeLaterView(args),local=buildLaterView(request(alias),inputs,candidate,laterCandidate);
    assert.deepEqual(browser,local);assert.equal(browser.rows.length,169);
    const explain=computeLaterExplain({...args,cards:'AsKs'});assert.equal(explain.node,browser.node);
    assert.equal(explain.defence.faced_action.allIn,undefined);
  }
});
test('adopted v7 Agent samples raw profile mass and addresses the supplied saved-label registry node',()=>{
  const board=parseCards('Ac7d2h9hJd',5),table=replayDecision(inputs,board,{flop:['bet33','call'],turn:['bet75','call'],river:['check','bet75']});
  const raw={fold:25,call:65,raise:10},keys=[];
  const agent=createAgent({registry:{lookup(query){keys.push(query.key);return raw;}}});
  const kit={spotId:inputs.spot.id,inputs,defence:{baseMix:()=>raw,mix:()=>raw}};
  for(const random of [0,.249,.25,.899,.9,.999]){
    const result=agent.postflop({kit,table,street:'river',node:'river_oop_vs_75',board,hole:parseCards('AsKs',2),actions:LATER_NODES.river_oop_vs_75,random});
    assert.equal(result.action,choose(raw,random,LATER_NODES.river_oop_vs_75));assert.deepEqual(result.mix,raw);assert.equal(result.source,'profile');
  }
  assert.ok(keys.every(key=>key===`postflop:${inputs.spot.id}:river:river_oop_vs_75`));
});
