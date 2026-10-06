// Independent eager chronological reference for the prefix product/DAG implementation.
// Reuses the frozen raw Defence formula stage, not model11 reach, cache, compiler or factory.
import { Defence, comboId, replayDecision, tierArray, isFacingNode } from '../../scripts/postflop-ai/defence.mjs';
import { equityVersus, equitiesVersus, releaseRangeTables } from '../../scripts/postflop-ai/range-equity.mjs';
import { canonicalPostflopPath } from '../../scripts/postflop-ai/observable-actions.mjs';
import { NODES } from '../../scripts/postflop-ai/policy.mjs';
import { LATER_NODES } from '../../scripts/postflop-ai/later-tree.mjs';
const size=2704, streets=['flop','turn','river'];
const keyOf=(board,path)=>JSON.stringify([board,path.flop??[],path.turn??[],path.river??[]]);
const priorRequest=(table,board,entry)=>({board:board.slice(0,entry.boardLen),path:Object.fromEntries(streets.map((s,i)=>[s,i<streets.indexOf(entry.street)?[...table.path[s]]:i===streets.indexOf(entry.street)?table.path[s].slice(0,entry.index):[]]))});
function independentMass(raw,order,observation) {
  let cumulative=0, previous=0; const labels={};
  for(let i=0;i<order.length;i++){
    if(i===order.length-1) labels[order[i]]=100-previous;
    else{ cumulative+=raw[order[i]]; const cut=Math.min(100,Math.max(0,cumulative));labels[order[i]]=cut-previous;previous=cut; }
  }
  const physical={};
  for(const group of observation.classes){let sum=0;for(const alias of group.aliases)sum+=labels[alias];physical[group.action]=sum;}
  return {rawMix:{...raw},labelMass:labels,physicalMass:physical};
}
class EagerRaw extends Defence {
  constructor(...args){super(...args);this.snapshots=new Map();}
  queryEquity(range,id,tables){return equityVersus(range,id,tables,{wasm:false});}
  queryEquities(range,ids,tables){return equitiesVersus(range,ids,tables,{wasm:false});}
  reach(seat,entries,board,table){const pair=this.snapshots.get(keyOf(board,table.path));if(!pair)throw new Error('Slow reference requested an unbuilt earlier snapshot');return pair[seat];}
  context(table,board,node){const context=super.context(table,board,node);if(context)this.prime(context);return context;}
  prime(context){
    if(context.slowComplete)return;
    const ids=[],base=this.baseWeights(context.defender),tiers=tierArray(context.board);
    for(let id=0;id<size;id++)if(base[id]>0&&tiers[id]!==255)ids.push(id);
    if(context.bettorRange.queries!==0)throw new Error('Slow reference schedule started out of order');
    const values=this.queryEquities(context.bettorRange,ids,this.tablesOf(context));
    for(let i=0;i<ids.length;i++)context.equities.set(ids[i],values[i]);
    context.slowComplete=true;releaseRangeTables(context.bettorRange);
  }
}
export function slowPrefixReference(inputs,flopPolicy,laterPolicy,request,{bluffCap=true}={}) {
  const board=[...request.board.slice(0,3).sort((a,b)=>b-a),...request.board.slice(3)];
  const path=canonicalPostflopPath(inputs.spot,request.path,inputs.config),full=replayDecision(inputs,board,path,inputs.config);
  const raw=new EagerRaw(inputs,flopPolicy,laterPolicy,bluffCap),seats=[inputs.spot.ip,inputs.spot.oop];
  let weights=Object.fromEntries(seats.map(seat=>[seat,raw.baseWeights(seat).slice()])), laws;
  for(const entry of full.log){
    const prior=priorRequest(full,board,entry),tiers=tierArray(prior.board),table=replayDecision(inputs,prior.board,prior.path,inputs.config);
    weights=Object.fromEntries(seats.map(seat=>[seat,Float64Array.from(weights[seat],(weight,id)=>tiers[id]===255?0:weight)]));
    raw.snapshots.set(keyOf(prior.board,table.path),Object.fromEntries(seats.map(seat=>[seat,weights[seat].slice()])));
    const current=table.log.at(-1), order=NODES[current.node]??LATER_NODES[current.node];
    if(isFacingNode(current.node))raw.context(table,prior.board,current.node);
    laws=new Map();const base=raw.baseWeights(current.seat);
    for(let id=0;id<size;id++)if(base[id]>0&&tiers[id]!==255){
      const combo=[Math.floor(id/52),id%52],saved=raw.baseMix(table,prior.board,current.node,combo);
      const mix=raw.mix(table,prior.board,current.node,combo,saved);
      laws.set(id,independentMass(mix,order,current.observation));
    }
    if(entry.action===null)return {laws,weights,table,prefix:prior};
    const next=new Float64Array(size);
    for(let id=0;id<size;id++)if(weights[entry.seat][id]>0)next[id]=weights[entry.seat][id]*(laws.get(id).physicalMass[entry.action]/100);
    weights={...weights,[entry.seat]:next};
  }
  throw new Error('Slow reference found no pending decision');
}
