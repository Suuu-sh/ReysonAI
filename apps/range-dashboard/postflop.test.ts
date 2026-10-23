import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp,mkdir,writeFile,rm,symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyPostflop,postflopSnapshot } from './postflop.ts';
import { createDashboardServer } from './server.ts';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
 const ranks=[...'AKQJT98765432'],cards=ranks.flatMap(r=>[...'shdc'].map(s=>r+s));
 const all=cards.flatMap((a,i)=>cards.slice(i+1).map(b=>({combo:a+b,hand:a[0]===b[0]?a[0]+b[0]:a[0]+b[0]+(a[1]===b[1]?'s':'o')})));
 const hands=ranks.flatMap((a,i)=>ranks.map((b,j)=>i===j?a+b:i<j?a+b+'s':b+a+'o'));
 const weights=Object.fromEntries(all.map(c=>[c.combo,['AhAd','AhAc'].includes(c.combo)?.5:0]));
 const input={spot_id:'BTN_open_BB_call',street:'flop',board:'As7d2c',actor:'BTN',ip:'BTN',oop:'BB',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},committed_bb:{BTN:0,BB:0},last_full_raise_bb:1,raises_this_street:0,raise_reopened:true,history:[{street:'flop',board:'As7d2c',seat:'BB',action:'check',paid_bb:0,to_bb:0,assumption:'BB check probability 1 is assumed, not a generated policy.'}],ranges:{BTN:weights,BB:weights},assumptions:['BB check probability 1 is assumed, not a generated policy.'],preflop_history:[],upstream:[]};
 const legal_actions=[{action:'check',paid_bb:0,to_bb:0,all_in:false},...[['bet33',1.82],['bet66',3.63],['bet100',5.5],['bet125',6.88]].map(([action,paid])=>({action,paid_bb:paid,to_bb:paid,all_in:false}))];
 const implementation_hash='f'.repeat(64),method='llm-postflop-single-response-v1',version='exact-combo-bilingual-bets33-66-100-125-v1',model='gpt-6.1-sol',effort='medium';
 const decision_id=hash({method,version,model,effort,implementation_hash,input,legal_actions});
 const mix={check:50,bet33:50,bet66:0,bet100:0,bet125:0},summary={text:'Fixture only, not generated strategy.',text_ja:'検証用。実生成された戦略ではありません。'};
 const groups=[{combos:['AhAd','AhAc'],mix,text:'Saved English <script>not HTML</script>',text_ja:'保存された日本語'}],source_response={decision_id,range_summary:summary,groups};
 const combos=all.filter(c=>weights[c.combo]>0).map(c=>({...c,reach_weight:weights[c.combo],mix,text:groups[0].text,text_ja:groups[0].text_ja}));
 const board=['As','7d','2c'];
 const rows=hands.map(hand=>{const g=combos.filter(c=>c.hand===hand),w=g.reduce((n,c)=>n+c.reach_weight,0);return {hand,combo_count:all.filter(c=>c.hand===hand&&!board.includes(c.combo.slice(0,2))&&!board.includes(c.combo.slice(2))).length,reached_combo_count:g.length,reach_weight:w,unreachable:!w,frequencies:w?{...mix}:{}};});
 return {kind:'aiv2_saved_postflop_decision',schema_version:'aiv2-postflop-decision-v1',decision_id,input,legal_actions,source_response,summary,combos,hands:rows,metadata:{method,version,model,reasoning_effort:effort,implementation_hash,input_hash:hash(input),response_hash:hash(source_response),policy_hash:hash(combos),reached_combo_count:2,reasons_generated_with_frequencies:true}};
}
test('postflop independent hashes, 169 cells, physical combo reasons and no zero-reach fallback',()=>{
 const f=fixture(),s=verifyPostflop(f);assert.equal(s.cells.length,169);assert.equal(s.summary.reached_combo_count,2);assert.deepEqual(s.board,['As','7d','2c']);assert.equal(s.cells[0].overrides[0].reason.en,f.combos[0].text);assert.equal(s.cells[0].overrides[0].reason.ja,f.combos[0].text_ja);assert.equal(s.cells[1].blocked,true);assert.deepEqual(s.cells[1].mix,{});assert.match(s.assumptions[0],/assumed/);
 for(const change of [x=>x.combos[0].mix.check--,x=>x.source_response.groups[0].text+='bad',x=>x.hands[0].frequencies.check++,x=>x.input.board='AsAs2c',x=>x.legal_actions[1].action='bet75',x=>x.combos.pop()]){const x=structuredClone(f);change(x);assert.throws(()=>verifyPostflop(x));}
});
test('postflop exact file allowlist, symlink/traversal rejection, safe endpoints and explicit missing streets',async()=>{
 const root=await mkdtemp(resolve(tmpdir(),'range-postflop-')),f=fixture();await mkdir(resolve(root,'decisions'));const path=resolve(root,'decisions',f.decision_id+'.json');await writeFile(path,JSON.stringify(f));await writeFile(resolve(root,'decisions','private.json'),'secret');
 const server=createDashboardServer(undefined,root);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const data=await (await fetch(base+'/api/postflop/scenes')).json();assert.equal(data.scenes.length,1);assert.equal(data.scenes[0].street,'flop');assert.equal(data.scenes.filter(s=>s.street==='turn').length,0);
 const r=await fetch(base+'/api/postflop/scene?key='+f.decision_id),s=await r.json();assert.equal(r.status,200);assert.equal(s.cells.length,169);const raw=JSON.stringify(s);for(const key of ['input_hash','source_response','/Users/','implementation_hash','ranges'])assert.equal(raw.includes(key),false);
 for(const route of ['/api/postflop/scene?key=../../private','/api/postflop/decisions/private.json','/api/postflop/generate','/%2e%2e%2f.env'])assert.equal((await fetch(base+route)).status,404);
 assert.equal((await fetch(base+'/api/postflop/scenes',{method:'POST'})).status,405);
 await rm(path);await symlink(resolve(root,'decisions','private.json'),path);assert.equal((await postflopSnapshot(root)).scenes.length,0);
 const absent=await postflopSnapshot(resolve(root,'missing'));assert.equal(absent.status.state,'not_generated');assert.deepEqual(absent.scenes,[]);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
