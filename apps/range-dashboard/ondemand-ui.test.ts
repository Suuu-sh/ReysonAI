import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createDashboardServer } from './server.ts';
import { formatOnDemandScene } from './ondemand.ts';

const source=stripTypeScriptTypes(await readFile(new URL('./app.ts',import.meta.url),'utf8'));
function fixture(canGenerate=false,providedSnapshot=null){
 const nodes=new Map(),requests=[];
 const node=()=>({textContent:'',hidden:false,disabled:false,value:'',children:[],style:{},dataset:{},classList:{toggle(){}},setAttribute(){},append(...v){this.children.push(...v);},prepend(){},replaceChildren(...v){this.children=[...v];}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const snapshot=providedSnapshot||{status:'not_generated',can_generate:canGenerate,generation_enabled:true,breadcrumbs:[{label:'As7d2c · BB',path:[]}],children:[{token:'check',label:'check',status:'not_generated'}],state:{street:'flop',board:'As7d2c',actor:'BB',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},history:[]}};
 const context=vm.createContext({URLSearchParams,location:{hash:'#stage=postflop'},history:{replaceState(){}},document:{getElementById:get,createElement:node,createTextNode:t=>t,querySelectorAll:()=>[],querySelector:()=>get('main')},window:{addEventListener(){}},setInterval(){},fetch:async(url,options)=>{requests.push({url,method:options?.method||'GET',body:options?.body});return {ok:true,json:async()=>url==='/api/postflop/jobs'?{jobs:[]}:snapshot};}});
 vm.runInContext(source,context);
 return {get,requests,context};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('public on-demand navigation and polling only read; missing policies remain blank',async()=>{
 const {get,requests}=fixture();await settle();
 assert.ok(requests.some(r=>r.url.startsWith('/api/postflop/ondemand?')));
 assert.ok(requests.every(r=>r.method==='GET'));
 assert.equal(get('generate-scene').hidden,true);
 assert.equal(get('matrix').children.length,0);
 assert.match(get('generation-status').textContent,/管理画面/);
 await get('tree-children').children[0].onclick();await settle();
 assert.ok(requests.every(r=>r.method==='GET'));
 assert.ok(!requests.some(r=>r.url.startsWith('/api/postflop/tree')));
});
test('only explicit local-capability button submits generation and legacy stays labelled',async()=>{
 const {get,requests}=fixture(true);await settle();
 assert.equal(get('generate-scene').hidden,false);
 assert.ok(requests.every(r=>r.method==='GET'));
 await get('generate-scene').onclick();
 const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);
 assert.equal(writes[0].url,'/api/postflop/jobs');
 assert.deepEqual(JSON.parse(writes[0].body),{board:'As7d2c',path:[]});
 const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/旧試作設定 · 保存5局面/);
 assert.match(html,/33 \/ 66 \/ 125%/);
});

test('actual read-only server response drives new SRP tree without legacy fallback',async()=>{
 const server=createDashboardServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/postflop/ondemand?board=KhQhJh&path=[]');assert.equal(response.status,200);const data=await response.json();assert.equal(data.scene,null);assert.deepEqual(data.children.map(c=>c.token),['check','bet33','bet66','bet125']);const {get,requests}=fixture(false,data);await settle();assert.match(get('tree-current').textContent,/KhQhJh/);assert.equal(get('tree-children').children.length,4);assert.equal(get('matrix').children.length,0);assert.ok(requests.every(r=>r.method==='GET'));}finally{await new Promise(r=>server.close(r));}
});
test('real backend saved-scene adapter renders all 169 cells and exact combo EN/JA source',async()=>{
 // Synthetic policy fixture: verifies adapter/UI shape only, not a real generated strategy.
 const ranks=[...'AKQJT98765432'],hands=ranks.flatMap((a,i)=>ranks.map((b,j)=>({hand:i===j?a+b:i<j?a+b+'s':b+a+'o',frequencies:{check:100},reach_weight:i===0&&j===0?1:0,unreachable:i!==0||j!==0,combo_count:i===0&&j===0?1:0})));
 const scene=formatOnDemandScene({decision_id:'fixture-only',legal_actions:[{action:'check',to_bb:0,paid_bb:0}],input:{spot_id:'fixture-only',actor:'BB',street:'flop',board:'As7d2c',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},history:[],preflop_history:[]},combos:[{hand:'AA',combo:'AhAd',mix:{check:100},reach_weight:1,text:'Exact saved English',text_ja:'保存された日本語原文'}],hands,summary:{text:'Saved summary',text_ja:'保存概要'},metadata:{policy_hash:'test-policy',response_hash:'test-response'}});
 const snapshot={status:'generated',scene,can_generate:false,generation_enabled:false,breadcrumbs:[],children:[],state:{street:'flop',board:'As7d2c',actor:'BB',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},history:[]}};
 const {get,context}=fixture(false,snapshot);await settle();assert.equal(get('matrix').children.length,169);assert.equal(get('reason').textContent,'保存された日本語原文');assert.equal(get('overrides-panel').hidden,false);assert.match(get('overrides').children[0].textContent,/AhAd/);await get('en').onclick();assert.equal(get('reason').textContent,'Exact saved English');assert.match(get('family').textContent,/新設定/);assert.ok(get('provenance').children.some(v=>v.textContent==='test-policy'));
});
