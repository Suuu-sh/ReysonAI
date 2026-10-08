import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs, readArtifact } from '../scripts/postflop-ai/inputs.mjs';
import { defenceFor, replayDecision } from '../scripts/postflop-ai/defence.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';

// Supersedes v10's 128-entry exact-sign LRU tests. Adopted v7 has ordinary
// context/equity caches only. Standalone exact-river-call-EV algorithm tests
// remain untouched and do not make that experiment an active execution path.
const inputs=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const board=parseCards('7c5d5h3c8s',5);
const path={flop:['check','check'],turn:['check','check'],river:['bet33']};
const fresh=(input=inputs)=>defenceFor({...input},readArtifact(input.spot,'candidate').policy,readArtifact(input.spot,'laterCandidate').policy);
function fixture(model) {
  const input=model.inputs,flop=input.spot.tree==='oop_leads'?['check','check']:['check'];
  const table=replayDecision(input,board,{...path,flop}),node=table.log.at(-1).node;
  const context=model.context(table,board,node);
  assert.ok(context);
  return {table,node,context};
}
const groups=model=>[model.contexts,model.bets,model.bettingFactRanges];

test('v7 ordinary and compact equity caches retain identical values and repeated mixes', () => {
  for(const input of [inputs,loadInputs('BTN_open_BB_call')]) {
  const ordinary=fresh(input),compact=fresh(input);compact.largeRun=true;
  const normal=fixture(ordinary),packed=fixture(compact);
  const a=ordinary.summarize(normal.context),b=compact.summarize(packed.context);
  assert.deepEqual(b,a,'compact storage must preserve the exact calculated doubles');
  assert.ok(a.defenders.length>50);
  if(!input.spot.history)assert.equal(packed.context.equities.constructor.name,'PackedEquities','wide legacy range exercises compact storage');
  assert.equal(packed.context.completeEquities,true,'large-run saved support is completed');
  const values=[];
  for(const row of a.defenders) {
    const combo=[Math.floor(row.id/52),row.id%52],before=ordinary.equity(normal.context,combo);
    assert.equal(compact.equity(packed.context,combo),before);
    assert.equal(compact.equity(packed.context,combo),before,'repeat lookup retains the same value');
    const base=ordinary.baseMix(normal.table,board,normal.node,combo);
    assert.deepEqual(compact.mix(packed.table,board,packed.node,combo,base),ordinary.mix(normal.table,board,normal.node,combo,base));
    values.push([row.id,before]);
  }
  assert.equal(packed.context.bettorRange.dense,null,'hot lookup releases the completed range index');
  assert.equal(packed.context.bettorRange.byCard,null);
  assert.equal(packed.context.exactRiverCallEv,undefined);
  assert.equal(compact.exactRiverContexts,undefined);
  ordinary.releaseBoardCaches();compact.releaseBoardCaches();
  const revisited=fixture(compact),summary=compact.summarize(revisited.context);
  assert.deepEqual(summary,a,'rebuilding after release preserves the v7 result');
  for(const [id,equity] of values)assert.equal(compact.equity(revisited.context,[Math.floor(id/52),id%52]),equity);
  compact.releaseBoardCaches();
  }
});

test('v7 board release clears derived graphs while preserving base weights, rules and storage mode', () => {
  const model=fresh();model.largeRun=true;
  const {table,node,context}=fixture(model);
  const summary=model.summarize(context),selected=summary.defenders[0];
  const combo=[Math.floor(selected.id/52),selected.id%52];
  const base=model.baseMix(table,board,node,combo),expected=model.mix(table,board,node,combo,base);
  const weights=model.baseWeights(inputs.spot.ip),rules=[...model.rules];
  assert.ok(model.stages.size>0&&rules.length>0);
  for(const group of groups(model))for(const street of ['flop','turn','river'])group[street].set(`release-${street}`,null);
  model.releaseBoardCaches();
  assert.equal(model.stages.size,0);
  for(const group of groups(model))for(const cache of Object.values(group))assert.equal(cache.size,0);
  assert.equal(model.baseWeights(inputs.spot.ip),weights);
  assert.deepEqual([...model.rules],rules);
  assert.equal(model.largeRun,true);
  const rebuilt=fixture(model);
  assert.notEqual(rebuilt.context,context);
  assert.deepEqual(model.mix(rebuilt.table,board,rebuilt.node,combo,base),expected);
  model.releaseBoardCaches();
});

test('v7 river trimming occurs only above the threshold and preserves other street caches', () => {
  const model=fresh(),{context}=fixture(model);model.summarize(context);
  for(const group of groups(model))for(const street of ['flop','turn','river'])group[street].set(`trim-${street}`,null);
  const stages=[...model.stages],base=[...model.base],rules=[...model.rules];
  const retained=groups(model).map(group=>({flop:[...group.flop],turn:[...group.turn],river:[...group.river]}));
  const size=model.contexts.river.size;
  model.trimRiverCaches(size);
  groups(model).forEach((group,index)=>assert.deepEqual([...group.river],retained[index].river,'at threshold, do not trim'));
  model.trimRiverCaches(size-1);
  groups(model).forEach((group,index)=>{
    assert.equal(group.river.size,0);
    assert.deepEqual([...group.flop],retained[index].flop);
    assert.deepEqual([...group.turn],retained[index].turn);
  });
  assert.deepEqual([...model.stages],stages);
  assert.deepEqual([...model.base],base);
  assert.deepEqual([...model.rules],rules);
  assert.equal(model.exactRiverContexts,undefined);
  model.releaseBoardCaches();
});

test('v7 ordinary river-context LRU evicts the least recently used context at16000', () => {
  const model=fresh(),first=fixture(model),key=first.context.key;
  for(let index=1;index<16000;index++)model.contexts.river.set(`placeholder-${index}`,null);
  assert.equal(model.contexts.river.size,16000);
  assert.equal(model.context(first.table,board,first.node),first.context,'a hit preserves the context');
  assert.equal([...model.contexts.river.keys()].at(-1),key,'a hit refreshes ordinary LRU order');
  const anotherPath={...path,river:['bet75']},another=replayDecision(inputs,board,anotherPath),node=another.log.at(-1).node;
  assert.ok(model.context(another,board,node));
  assert.equal(model.contexts.river.size,16000);
  assert.equal(model.contexts.river.has('placeholder-1'),false);
  assert.equal(model.contexts.river.has(key),true,'the recently touched real context is retained');
  assert.equal(model.exactRiverContexts,undefined);
  assert.equal(first.context.exactRiverCallEv,undefined);
  model.releaseBoardCaches();
});
