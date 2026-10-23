import test from 'node:test';
import assert from 'node:assert/strict';
import { treeRoot,advanceTree,treeSnapshot,savedAt } from './tree.ts';
import { legalOptions,postflopSnapshot } from './postflop.ts';
import { POSTFLOP_ROOT,createDashboardServer } from './server.ts';
test('lazy full structural branches include BB donk, checkthrough 49/48 chance and every river action',()=>{
 const root=treeSnapshot([]);assert.equal(root.state.actor,'BB');assert.deepEqual(root.children.map(c=>c.token),['check','bet33','bet66','bet100','bet125']);assert.equal(root.status,'not_generated');assert.equal(root.children[1].status,'not_generated');
 const facing=treeSnapshot([],'As7d2c',['bet33']);assert.deepEqual(facing.children.map(c=>c.token),['fold','call','raise']);assert.equal(facing.state.pot_bb,7.32);assert.equal(facing.state.stacks_bb.BB,95.68);
 const chance=treeSnapshot([],'As7d2c',['check','check']);assert.equal(chance.status,'chance');assert.equal(chance.children.length,49);assert.ok(!chance.children.some(c=>c.token==='As'));
 const river=treeSnapshot([],'As7d2c',['check','check','9h','check','check']);assert.equal(river.children.length,48);const end=treeSnapshot([],'As7d2c',['check','check','9h','check','check','3s','check','check']);assert.equal(end.status,'terminal');assert.equal(end.children.length,0);
 assert.throws(()=>treeSnapshot([],'AsAs2c'));assert.throws(()=>treeSnapshot([],'As7d2c',['raise']));assert.throws(()=>treeSnapshot([],'As7d2c',['check','9h']));assert.throws(()=>treeSnapshot([],'As7d2c',Array(65).fill('check')));
 const alternate=treeSnapshot([],'KhQhJh',['bet125']);assert.equal(alternate.status,'not_generated');assert.equal('cells' in alternate,false);assert.equal('ranges' in alternate.state,false);
});
test('canonical effective cap, short all-in reopening, max raises and terminal semantics',()=>{
 const s=treeRoot();Object.assign(s,{actor:'BTN',pot_bb:20,stacks_bb:{BTN:5,BB:5}});assert.deepEqual(legalOptions(s).map(o=>o.action),['check','allin']);const allin=advanceTree(s,'allin');assert.deepEqual(legalOptions(allin).map(o=>o.action),['fold','call']);assert.equal(advanceTree(allin,'call').kind,'terminal');assert.equal(advanceTree(allin,'fold').kind,'terminal');
 const short={...treeRoot(),actor:'BTN',pot_bb:10,stacks_bb:{BTN:6,BB:10},committed_bb:{BTN:0,BB:4},last_full_raise_bb:4};const raised=advanceTree(short,'raise');assert.equal(raised.raise_reopened,false);assert.equal(raised.last_full_raise_bb,4);assert.equal(legalOptions(raised).some(o=>o.action==='raise'),false);
 const capped={...short,raises_this_street:4};assert.deepEqual(legalOptions(capped).map(o=>o.action),['fold','call']);
});
test('exact public state and policy lineage match original saved chain only, retaining review status',async()=>{
 const {scenes}=await postflopSnapshot(POSTFLOP_ROOT);assert.equal(scenes.length,5);assert.ok(scenes.every(s=>!s.selection));
 for(const [path,index] of [[['check'],0],[['check','check','9h'],1],[['check','check','9h','check'],2],[['check','check','9h','check','check','3s'],3],[['check','check','9h','check','check','3s','check'],4]]){
  const node=treeSnapshot(scenes,'As7d2c',path);const expected=scenes.find(s=>s.hero===node.state.actor&&s.board.join('')===node.state.board);assert.equal(node.scene_key,expected?.key,JSON.stringify(path));assert.equal(node.status,expected?.review.warnings.some(w=>!w.resolved)?'needs_correction':'generated');
 }
 const saved=treeSnapshot(scenes,'As7d2c',['check']);assert.ok(saved.scene_key);const clone=structuredClone(saved.state);clone.history[0].assumption=false;assert.equal(savedAt(clone,scenes),undefined);const descendant=treeSnapshot(scenes,'As7d2c',['check','check','9h']);const wrong=structuredClone(descendant.state);wrong.history[1].policy_hash='f'.repeat(64);assert.equal(savedAt(wrong,scenes),undefined);
 const modified=structuredClone(scenes);const parent=modified.find(s=>s.key===saved.scene_key);parent.summary.action_frequency_pct.bet33=0;const zero=treeSnapshot(modified,'As7d2c',['check','bet33']);assert.equal(zero.reach,'zero');assert.equal(zero.scene_key,null);assert.ok(zero.children.every(c=>c.zero_reach));
});
test('read-only tree endpoint validates inputs and never serves range data for unsaved nodes',async()=>{
 const server=createDashboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const r=await fetch(base+'/api/postflop/tree?board=KhQhJh&path=%5B%22bet33%22%5D');assert.equal(r.status,200);const d=await r.json();assert.equal(d.status,'not_generated');const raw=JSON.stringify(d);for(const key of ['ranges','cells','/Users/','source_response'])assert.equal(raw.includes(key),false);assert.equal((await fetch(base+'/api/postflop/tree?path=no')).status,400);assert.equal((await fetch(base+'/api/postflop/tree',{method:'POST'})).status,405);}finally{await new Promise(r=>server.close(r));}
});
