import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { sessionHistoryRows } from '../src/trainer/session-history.ts';
const bundled = await build({stdin:{contents:'export { SessionPage } from "./src/trainer/SessionPage.tsx";',resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',external:['react','react-dom'],jsx:'automatic',define:{'import.meta.url':JSON.stringify(new URL('../src/estimated/datasets.ts',import.meta.url).href)},loader:{'.css':'empty'}});
const code=bundled.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?|react-dom)"/g,(_,n)=>`from "${import.meta.resolve(n)}"`);
const {SessionPage}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const at=1700000000000;
const hand={at,tableId:'saved-table',pos:'BTN',returnBb:2,vpip:true,pfr:false,threeBetOpp:false,threeBet:false,facedThreeBet:false,foldedToThreeBet:false,sawFlop:false,showdown:false,wonShowdown:false};
const answer={spotId:'UTG_open',hand:'AA',cards:['As','Ah'],action:'open',result:'best',score:1};
const practice={at:at-100,answered:1,score:1,durationMs:1000,hands:[answer]};
const props={drills:[{id:'one',name:'Exact saved drill',sessions:[practice]}],reviews:[{...practice,id:'review-one'}],drafts:{one:{drillName:'Saved draft',reviewOnly:false,savedAt:at+100,elapsedMs:3000,session:{answered:1,score:1,log:[answer]}}},onResume(){}};
async function harness(run,fetcher=async()=>{throw Error('unexpected network')},extra={},saved=[hand],locale='en') {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/learn/sessions'});dom.window.localStorage.setItem('reysonai:agent-hands:v1',JSON.stringify(saved));dom.window.localStorage.setItem('reysonai:locale:v1',locale);
 const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,fetch:globalThis.fetch};Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,fetch:fetcher,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(dom.window.document.querySelector('#root'));
 const click=async text=>{const b=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,`missing ${text}`);await act(async()=>b.click());};
 try{await act(async()=>root.render(React.createElement(SessionPage,{...props,...extra})));await run({dom,root,click});}finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
}
test('legacy Agent summaries remain separate hands, never gain invented sessions/accuracy or rewrite storage',async()=>{
 const records=[hand,{...hand,returnBb:-3},{at:'invalid'}];const before=JSON.stringify(records),rows=sessionHistoryRows([],records,{});assert.equal(rows.length,2);assert.ok(rows.every(row=>!('sessionId' in row.record)&&!('score' in row.record)));assert.equal(JSON.stringify(records),before);
 await harness(async({dom,click})=>{const stored=dom.window.localStorage.getItem('reysonai:agent-hands:v1');await click('Agent matches');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,2);assert.ok([...dom.window.document.querySelectorAll('tbody tr')].every(r=>r.children[5].textContent==='—'));await click('Saved hand · saved-table');assert.match(dom.window.document.body.textContent,/without session IDs, cards or action logs/);await click('Sessions');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,2);assert.equal(dom.window.localStorage.getItem('reysonai:agent-hands:v1'),stored);},undefined,{},records);
});
test('Sessions removes the Agent storage note in every locale while keeping the saved Agent row',async()=>{
 for(const locale of ['en','ja','zh-CN','es']) await harness(async({dom})=>{
  assert.equal(dom.window.document.querySelector('.sessions-source-note'),null);
  assert.ok([...dom.window.document.querySelectorAll('.sessions-row-link')].some(button=>button.textContent.includes('saved-table')));
  assert.match(dom.window.localStorage.getItem('reysonai:agent-hands:v1'),/saved-table/);
 },undefined,{},[hand],locale);
});
test('drill/review/draft exact logs, resume and list Back survive mode switching',async()=>{
 const resumed=[];await harness(async({dom,click})=>{await click('Drills');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,3);await click('Saved draft');assert.match(dom.window.document.body.textContent,/AA/);await click('Resume');assert.equal(resumed[0].status,'draft');assert.deepEqual(resumed[0].hands,[answer]);await click('Sessions');await click('In progress');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);await click('Completed');await click('Review drill');assert.match(dom.window.document.body.textContent,/Your recorded action/);},undefined,{onResume:r=>resumed.push(r)});
});
test('ranked loads only with authenticated readiness; local data never substitutes; paging appends confirmed IDs',async()=>{
 let calls=0;await harness(({dom})=>assert.match(dom.window.document.body.textContent,/verified sign-in/),async()=>{calls++;return Response.json({});});assert.equal(calls,0);
 const fetched=[];await harness(async({dom,click})=>{assert.equal(fetched.length,3);assert.ok(fetched.every(r=>r.opts.credentials==='include'&&r.opts.cache==='no-store'&&!r.url.includes('user_id')));await click('Ranked');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,3);await click('Human FastFold · Load older results');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,4);assert.equal(dom.window.document.body.textContent.includes('Human FastFold · Load older results'),false);await click('Human FastFold');assert.match(dom.window.document.body.textContent,/Server-confirmed personal result/);assert.match(dom.window.document.body.textContent,/1,000 → 1,001/);},async(url,opts)=>{fetched.push({url,opts});const q=new URL(url).searchParams,season=q.get('season');return Response.json({season,items:[{id:season+(q.has('cursor')?'-older':''),at:at-1000,beforeRating:1000,afterRating:1001,hero:'BTN',netBb:2,heroCards:['As','Kd'],board:[],log:null,answered:20,accuracy:.75}],nextCursor:season==='human-fastfold-v1'&&!q.has('cursor')?'cursor-one':null});},{rankedReady:true,rankedOwner:'owner-A'});
});
test('sign-out masks ranked results immediately and discards late responses',async()=>{
 const pending=[];await harness(async({dom,root})=>{await act(async()=>root.render(React.createElement(SessionPage,{...props,rankedReady:false,rankedOwner:null})));assert.match(dom.window.document.body.textContent,/verified sign-in/);await act(async()=>pending.forEach(([season,done])=>done(Response.json({season,items:[{id:'private-owner-A',at,beforeRating:1000,afterRating:900}],nextCursor:null}))));assert.doesNotMatch(dom.window.document.body.textContent,/private-owner-A|900/);},url=>new Promise(done=>pending.push([new URL(url).searchParams.get('season'),done])),{rankedReady:true,rankedOwner:'owner-A'});
});
test('malformed ranked pages remain unavailable with retry while local storage is retained',async()=>{
 await harness(async({dom,click})=>{await click('Ranked');assert.equal(dom.window.document.querySelectorAll('[role="alert"]').length,3);assert.equal(dom.window.document.querySelectorAll('tbody tr').length,0);assert.match(dom.window.localStorage.getItem('reysonai:agent-hands:v1'),/saved-table/);},async()=>Response.json({season:'wrong',items:[],nextCursor:null}),{rankedReady:true,rankedOwner:'owner-A'});
});
test('switching authenticated owners clears selected details and never applies the previous owner response',async()=>{
 const pending=[];
 await harness(async({dom,root,click})=>{
  await act(async()=>pending.slice(0,3).forEach(([season,done])=>done(Response.json({season,items:[{id:'owner-A-'+season,at,beforeRating:1777,afterRating:1888,hero:'BTN',netBb:2}],nextCursor:null}))));
  await click('Ranked');await click('Human FastFold');assert.match(dom.window.document.body.textContent,/1,777 → 1,888/);
  await act(async()=>root.render(React.createElement(SessionPage,{...props,rankedReady:true,rankedOwner:'owner-B'})));
  assert.doesNotMatch(dom.window.document.body.textContent,/1,777|1,888/);
  await act(async()=>pending.slice(3).forEach(([season,done])=>done(Response.json({season,items:[{id:'owner-B-'+season,at,beforeRating:1222,afterRating:1333,hero:'BTN',netBb:1}],nextCursor:null}))));
  await click('Human FastFold');assert.match(dom.window.document.body.textContent,/1,222 → 1,333/);assert.doesNotMatch(dom.window.document.body.textContent,/1,777|1,888/);
 },url=>new Promise(done=>pending.push([new URL(url).searchParams.get('season'),done])),{rankedReady:true,rankedOwner:'owner-A'});
});

test('new Agent detail renders explicit suits, street actions, winners and results without mutating saved history', async () => {
 const record={...hand,history:{version:1,handRanks:{BTN:4,BB:5},handNo:7,names:{BTN:'You',BB:'VEGA'},holeCards:{BTN:['Ad','8c'],BB:['Qs','6s']},board:['Qc','9s','7s','Ts','Jh'],winners:['BB'],returns:{BTN:-11.18,BB:10.54},pot:22.86,rake:1.14,log:[{street:'preflop',pos:'BTN',action:'open',to:2.5,pot:4},{street:'flop',pos:'BB',action:'check',pot:5.5},{street:'turn',pos:'BB',action:'bet33',to:1.82,pot:7.32},{street:'river',pos:'BTN',action:'call',to:6.86,pot:22.86}]}};
 await harness(async({dom,click})=>{const before=dom.window.localStorage.getItem('reysonai:agent-hands:v1');await click('Agent matches');await click('Saved hand · saved-table');const text=dom.window.document.body.textContent;assert.match(text,/Hand history #7/);for(const value of ['A♦','8♣','Q♠','6♠','Q♣','9♠','7♠','T♠','J♥','Preflop','Flop','Turn','River','Bet','1.82','Call','6.86','Winner','VEGA','Rake','Straight','Flush'])assert.ok(text.includes(value),value);assert.doesNotMatch(text,/without session IDs, cards or action logs/);assert.equal(dom.window.localStorage.getItem('reysonai:agent-hands:v1'),before);},undefined,{},[record]);
});

test('explicit Agent entries group hands, preserve legacy rows, expose all details and status filters', async () => {
 const a={...hand,session:{id:'entry-a',startedAt:at-5000,endedAt:at+5000},history:{version:1,handNo:1,holeCards:{BTN:['Ad','8c']},board:['Qc','9s','7s'],log:[],winners:['BTN'],returns:{BTN:3}}};
 const b={...a,at:at+1000,returnBb:-1,history:{...a.history,handNo:2}};
 const next={...a,at:at+7000,session:{id:'entry-b',startedAt:at+6000},returnBb:4};
 const saved=[a,b,next,hand], rows=sessionHistoryRows([],saved,{});
 assert.equal(rows.length,3);const grouped=rows.find(row=>row.session?.id==='entry-a');assert.equal(grouped.session.hands.length,2);assert.equal(grouped.session.hands.reduce((sum,h)=>sum+h.returnBb,0),hand.returnBb-1);
 await harness(async({dom,click})=>{
  await click('Agent matches');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,3);
  await click('In progress');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);
  await click('Completed');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,2);
  const row=[...dom.window.document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes('Agent session'));assert.equal(row.children[4].textContent,'2');assert.notEqual(row.children[7].textContent,'—');
  await click('Agent session · saved-table');assert.equal(dom.window.document.querySelectorAll('details.sessions-agent-hand').length,2);
  assert.match(dom.window.document.body.textContent,/Hand #1/);assert.match(dom.window.document.body.textContent,/Hand #2/);assert.match(dom.window.document.body.textContent,/A♦/);
 },undefined,{},saved);
});

test('session closure updates an already-mounted Sessions list without reload', async () => {
 const {finishAgentHistorySession}=await import('../src/agent/agent-stats.ts');
 const saved=[{...hand,session:{id:'navigation-entry',startedAt:at-5000}}];
 await harness(async({dom,click})=>{
  await click('Agent matches');await click('In progress');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);
  await act(async()=>finishAgentHistorySession('navigation-entry',at+1000));assert.equal(dom.window.document.querySelectorAll('tbody tr').length,0);
  await click('Completed');assert.equal(dom.window.document.querySelectorAll('tbody tr').length,1);
 },undefined,{},saved);
});
