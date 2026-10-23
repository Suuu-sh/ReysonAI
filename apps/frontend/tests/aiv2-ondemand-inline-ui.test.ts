import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {createServer} from 'vite';
import {hands} from '../src/data.ts';
import {LOCALE_KEY} from '../src/locale.ts';
let dom,server,RangeWorkspace,session,preferences,root;
const originals=new Map(),calls=[];
const pins={revision:'fixture-revision',implementationHash:'fixture-implementation',sourceHash:'fixture-source'};
const cap={...pins,enabled:true,ownerOnline:true,limits:{jobsPerUserDay:3,maxProviderCalls:64}};
function saved(board='As7d2c',actor='BB',path=[]){return {status:'generated',proof:{...pins,validatedStore:true},snapshot:{status:'generated',scene:{key:'fixture-decision',hero:actor,street:'flop',board:board.match(/../g),pot_bb:5.5,actions:['check','bet33','bet66','bet125'],range_reason:{en:'Saved exact range summary.',ja:'保存済み局面の要約。'},provenance:{method:'llm-postflop-ondemand-v2',verified:true,independent_gto_approved:false,artifact_hash:'a'.repeat(64)},cells:hands.map(hand=>({hand,reach_weight:hand==='KJs'?1:0,unreachable:hand!=='KJs',mix:hand==='KJs'?{check:100,bet33:0,bet66:0,bet125:0}:{},reason:{en:'Saved explanation.',ja:'保存された説明。'},overrides:[]}))}}};}
const user={id:'inline-test-user',email:'inline@example.invalid',verified:true};
before(async()=>{
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/analyze/ranges'});
 for(const name of ['window','document','Event','HTMLElement','sessionStorage','localStorage','IS_REACT_ACT_ENVIRONMENT','fetch']){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));if(name!=='fetch')Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});}
 window.HTMLElement.prototype.scrollTo=()=>{};window.matchMedia=()=>({matches:false});
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),method:init?.method??'GET'});const path=new URL(String(url),'http://localhost').pathname;if(path==='/v1/account/session')return Response.json({user});if(path==='/v1/account/data')return Response.json({ownerId:user.id,data:{},version:0});if(path.endsWith('/ondemand/status'))return Response.json(cap);if(path.endsWith('/ondemand/scene'))return Response.json({status:'not_generated'});if(path.endsWith('/ondemand/requests'))return Response.json({id:'b'.repeat(64),status:'queued',board:'As7d2c',path:[]});if(path.includes('/ondemand/requests/'))return Response.json({id:'b'.repeat(64),status:'complete',board:'As7d2c',path:[],result:saved()});throw Error('Unexpected test-only request');};
 server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
 ({RangeWorkspace}=await server.ssrLoadModule('/src/estimated/RangeWorkspace.tsx'));session=await server.ssrLoadModule('/src/account/session.ts');preferences=await server.ssrLoadModule('/src/account/preferences.ts');await session.refreshAccount();
});
after(async()=>{if(root)await act(async()=>root.unmount());await server?.close();dom?.window.close();for(const[name,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
async function mount(board,actions="",source="gto",marker=""){if(root)await act(async()=>root.unmount());window.localStorage.clear();window.sessionStorage.clear();window.localStorage.setItem(LOCALE_KEY,'en');preferences.saveRangeSource(source);window.history.replaceState({},'',`/analyze/ranges?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F-C&board=${board}&flop_actions=${actions}&hand=KJs${marker}`);root=createRoot(document.getElementById('root'));await act(async()=>root.render(createElement(RangeWorkspace)));}
async function click(el){assert.ok(el);await act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));}
test('saved GTO wins; missing GTO explicitly switches to same-strip AI, then click-only generation polls saved range',async()=>{
 await mount('QsJh2h');assert.ok(document.querySelector('.matrix button'));assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent.includes('Switch to AI estimates')));assert.equal(calls.filter(c=>c.url.includes('/ondemand/')).length,0);
 await mount('As7d2c');assert.match(document.body.textContent,/No saved GTO data/);const strip=document.querySelector('.action-path');
 const choose=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to AI estimates'));assert.ok(choose);assert.match(choose.textContent,/5% rake, cap 3BB.*not GTO/);await click(choose);
 assert.equal(document.querySelector('.action-path'),strip);assert.equal(document.querySelectorAll('.action-path').length,1);assert.equal(document.querySelectorAll('.aiv2-ondemand-inline input,.aiv2-ondemand-inline nav,.aiv2-ondemand-inline form').length,0);
 assert.equal(document.querySelector('.action-seat-flop.active .action-seat-position').textContent,'BB');assert.ok(document.querySelector('.action-seat-flop.active').textContent.includes('66%'));assert.ok(!document.querySelector('.action-seat-flop.active').textContent.includes('75%'));
 assert.equal(calls.filter(c=>c.url.endsWith('/ondemand/requests')).length,0);const generate=[...document.querySelectorAll('button')].find(b=>b.textContent==='Generate AI estimate');await click(generate);assert.equal(calls.filter(c=>c.url.endsWith('/ondemand/requests')&&c.method==='POST').length,1);
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,2100));});assert.equal(document.querySelectorAll('.aiv2-ondemand-inline .matrix button').length,169);assert.ok(calls.some(c=>c.url.includes('/ondemand/requests/')&&c.method==='GET'));assert.match(document.body.textContent,/Saved exact range summary/);assert.match(document.body.textContent,/Not GTO/);
});


test('changing the existing action node discards a late generation response without enqueuing again',async()=>{
 await mount('As7d2c');await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to AI estimates')));
 const normalFetch=globalThis.fetch;let finish;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/ondemand/requests')&&init?.method==='POST'){calls.push({url:String(url),method:'POST'});return new Promise(resolve=>{finish=resolve;});}return normalFetch(url,init);};
 try{
  const postsBefore=calls.filter(c=>c.url.endsWith('/ondemand/requests')&&c.method==='POST').length;
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Generate AI estimate'));assert.equal(typeof finish,'function');
  await click([...document.querySelectorAll('.action-seat-flop.active .action-seat-options button')].find(b=>b.textContent==='Check'));
  assert.equal(document.querySelector('.action-seat-flop.active .action-seat-position').textContent,'BTN');
  await act(async()=>{finish(Response.json({id:'c'.repeat(64),status:'complete',board:'As7d2c',path:[],result:saved()}));});
  assert.equal(document.querySelector('.aiv2-ondemand-inline .matrix'),null);assert.match(document.querySelector('.aiv2-ondemand-inline').textContent,/BTN/);
  assert.equal(calls.filter(c=>c.url.endsWith('/ondemand/requests')&&c.method==='POST').length,postsBefore+1);
 }finally{globalThis.fetch=normalFetch;}
});


test('GTO50percent history is not remapped into an AI66percent generation request',async()=>{
 await mount('As7d2c','B50');const before=calls.filter(c=>c.url.includes('/ondemand/')).length;
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to AI estimates')));
 assert.match(document.body.textContent,/legacy action semantics/);assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Generate AI estimate'));
 assert.equal(calls.filter(c=>c.url.includes('/ondemand/')).length,before);
});


test('unmarked legacy implicit-check33percent raise history never becomes a different exact actor or raise size',async()=>{
 await mount('As7d2c','B33-R');const before=calls.filter(c=>c.url.includes('/ondemand/')).length;
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to AI estimates')));
 assert.match(document.body.textContent,/legacy action semantics/);assert.equal(calls.filter(c=>c.url.includes('/ondemand/')).length,before);
 assert.ok(!new URLSearchParams(window.location.search).has('postflop_source'));
 assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Generate AI estimate'));
 await click(document.querySelector('.action-seat-flop-forced .action-seat-position')??document.querySelector('.action-seat-flop .action-seat-position'));
 assert.ok(document.querySelector('.aiv2-ondemand-inline'));assert.equal(document.querySelector('.action-seat-flop.active .action-seat-position').textContent,'BB');
 assert.equal(new URLSearchParams(window.location.search).get('postflop_source'),'aiv2-exact-v2');
});

test('exact AI history retains its origin when viewing GTO and switching back, without generation',async()=>{
 await mount('As7d2c');await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to AI estimates')));
 await click([...document.querySelectorAll('.action-seat-flop.active .action-seat-options button')].find(b=>b.textContent==='Check'));
 const history=new URLSearchParams(window.location.search).get('flop_actions'),posts=calls.filter(c=>c.method==='POST'&&c.url.endsWith('/ondemand/requests')).length;
 await act(async()=>preferences.saveRangeSource('gto'));assert.equal(document.querySelector('.aiv2-ondemand-inline'),null);assert.equal(new URLSearchParams(window.location.search).get('postflop_source'),'aiv2-exact-v2');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Switch to AI estimates')));
 assert.equal(new URLSearchParams(window.location.search).get('flop_actions'),history);assert.equal(document.querySelector('.action-seat-flop.active .action-seat-position').textContent,'BTN');assert.ok(document.querySelector('.aiv2-ondemand-inline'));
 assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/ondemand/requests')).length,posts);
});


test('invalid exact-marked raw history cannot auto-promote a decoder-truncated empty path',async()=>{
 const before=calls.filter(c=>c.url.includes('/ondemand/')).length;await mount('As7d2c','BOGUS','ai','&postflop_source=aiv2-exact-v2');
 assert.match(document.body.textContent,/legacy action semantics/);assert.equal(calls.filter(c=>c.url.includes('/ondemand/')).length,before);assert.ok(!new URLSearchParams(window.location.search).has('postflop_source'));
});
