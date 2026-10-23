import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFormat} from '../src/estimated/game-formats.ts';
import {onDemandRootSupported,onDemandHistorySelection,onDemandActionBlocks,ONDEMAND_WORKSPACE_SOURCE} from '../src/estimated/aiv2-ondemand-workspace-state.ts';
import {decodeRangeUrl,encodeRangeUrl} from '../src/estimated/range-url.ts';
const root={rangeType:'response',opener:'BTN',hero:'BB',callers:['BB'],foldedHero:true,format:defaultFormat,defaultTable:true,opponentProfile:'standard',context:{ip:'BTN',oop:'BB',potBb:5.5,stackBb:97.5}};
const h={flopCards:['Ks','8d','3c'],flopActions:[],turnCard:'',turnActions:[],riverCard:'',riverActions:[]};
test('exact AI root rejects other geometry, profiles, rake and incomplete preflop',()=>{
 assert.equal(onDemandRootSupported(root),true);
 for(const changed of [{opener:'CO'},{hero:'SB'},{callers:['SB','BB']},{foldedHero:false},{defaultTable:false},{opponentProfile:'nit'},{format:{...defaultFormat,rake:'none'}},{format:{...defaultFormat,stack:200}},{context:{...root.context,potBb:6.5}}])assert.equal(onDemandRootSupported({...root,...changed}),false);
});
test('existing strip blocks use actual BB first and legal v2 actions through all streets',()=>{
 const first=onDemandActionBlocks(h);assert.equal(first.blocks[0].position,'BB');assert.deepEqual(first.blocks[0].options.map(o=>o.action),['check','bet33','bet66','bet125']);assert.equal(first.blocks[0].chosen,null);
 const after=onDemandActionBlocks({...h,flopActions:['check','bet66','raise']});assert.equal(after.blocks.at(-1)?.position,'BTN');assert.equal(after.blocks[0].chosen,'check');assert.equal(after.blocks[2].options.at(-1)?.action,'raise');
 const chance=onDemandActionBlocks({...h,flopActions:['check','check']});assert.equal(chance.pendingStreet,'turn');assert.equal(chance.blocks.at(-1)?.kind,'board');
 const later=onDemandActionBlocks({...h,flopActions:['check','check'],turnCard:'Ah',turnActions:['check','check'],riverCard:'Td'});assert.deepEqual(later.path,['check','check','Ah','check','check','Td']);assert.equal(later.state.street,'river');assert.equal(later.blocks.at(-1)?.position,'BB');assert.equal(later.blocks.at(-1)?.laterIndex,0);
 assert.throws(()=>onDemandHistorySelection({...h,flopActions:['bet75']}));assert.throws(()=>onDemandHistorySelection({...h,turnCard:'Ah'}));assert.throws(()=>onDemandHistorySelection({...h,flopActions:['check','check'],turnCard:'Ks'}));
});
test('marked exact history roundtrips66percent and both cards without forced-check remapping',()=>{
 const query='?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F-C&board=Ks8d3c&flop_actions=B66-C&turn=Ah&turn_actions=X-X&river=Td&river_actions=B33&postflop_source='+ONDEMAND_WORKSPACE_SOURCE;
 const state=decodeRangeUrl(query)!;assert.equal(state.postflopSource,ONDEMAND_WORKSPACE_SOURCE);assert.deepEqual(state.flopActions,['bet66','call']);assert.deepEqual(state.turnActions,['check','check']);assert.deepEqual(state.riverActions,['bet33']);
 const again=decodeRangeUrl(encodeRangeUrl(state))!;assert.deepEqual(again,state);assert.equal(onDemandHistorySelection(again).state.actor,'BTN');
 const bad=decodeRangeUrl(query.replace('B66-C','B75-C'))!;assert.notEqual(bad.postflopSource,ONDEMAND_WORKSPACE_SOURCE);
 const otherRoot=decodeRangeUrl(query.replace('F-F-F-R2.5-F-C','F-F-R2.5-F-F-C'))!;assert.notEqual(otherRoot.postflopSource,ONDEMAND_WORKSPACE_SOURCE);
 const numericRaise=decodeRangeUrl(query.replace('B66-C','B33-R9.08'))!;assert.notEqual(numericRaise.postflopSource,ONDEMAND_WORKSPACE_SOURCE);
 const duplicateCard=decodeRangeUrl(query.replace('turn=Ah','turn=Ks'))!;assert.notEqual(duplicateCard.postflopSource,ONDEMAND_WORKSPACE_SOURCE);
 const unknown=decodeRangeUrl(query.replace(ONDEMAND_WORKSPACE_SOURCE,'anything'))!;assert.notEqual(unknown.postflopSource,ONDEMAND_WORKSPACE_SOURCE);
});
