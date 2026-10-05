import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
const bundle = await build({ stdin: { contents: 'export { FastFoldArena } from "./src/trainer/FastFoldArena.tsx";', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'esm', external: ['react'], jsx: 'automatic', loader: { '.css': 'empty' } });
const code = bundle.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?)"/g, (_, name) => `from "${import.meta.resolve(name)}"`);
const { FastFoldArena } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const session = (version = 0, status = 'active', number = 1) => ({ id: 'session', version, status, hand: { id: `hand-${number}`, number, hero: 'BTN', holeCards: { BTN: ['As', 'Kd'] }, board: [], log: [{ pos: 'SB', action: 'check', street: 'preflop', pot: 1.5 }], pot: 1.5, status: 'awaiting', opponents: ['UTG','HJ','CO','SB','BB'].map(position => ({position,type:'station',label:'station',policyVersion:'saved-ai-v1'})), policyVersion: 'saved-ai-v1', pending: { street: 'preflop', pos:'BTN', options: [{key:'fold'}, {key:'open',to:2.5}], board:[], pot:1.5, toCall:0 } } });
const state = active => ({rating:1000,peak:1000,hands:0,netBb:0,bbPer100:null,provisional:true,uncertainty:1,active,recent:[]});
const profile = active => ({enabled:true,season:'fastfold-v1',publicName:'Player test',state:state(active)});
async function harness(run, fetcher, ready = true) {
  const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost/learn/trainer/ranked/play' });
  const old = {window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.fetch = fetcher;
  const root = createRoot(dom.window.document.getElementById('root'));
  const updates=[]; const props={ready,onBack(){},onRanking(){},onProfile:p=>updates.push(p)};
  try { await act(async()=>root.render(React.createElement(FastFoldArena,props))); await run({dom,root,props,updates,click:async label=>{const button=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,`Missing ${label}`); await act(async()=>button.click());}}); }
  finally { await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,old);delete globalThis.IS_REACT_ACT_ENVIRONMENT; }
}
const initialFetch = active => async url => url.endsWith('/status') ? Response.json({enabled:true,season:'fastfold-v1',comparisonMode:'shadow',appliedPenalty:false}) : Response.json(profile(active));
test('readiness fails closed, never calls API while unauthenticated', async()=>{
  let calls=0; await harness(({dom})=>{assert.match(dom.window.document.body.textContent,/Sign in/);assert.doesNotMatch(dom.window.document.body.innerHTML,/ff-actions/);},async()=>{calls++;throw Error();},false);assert.equal(calls,0);
});
test('invalid readiness never loads profile or local ranking',async()=>{
  let calls=0;await harness(({dom})=>{assert.match(dom.window.document.body.textContent,/unavailable/);assert.doesNotMatch(dom.window.document.body.innerHTML,/ff-scorebar/);},async()=>{calls++;return Response.json({enabled:true,season:'old',comparisonMode:'shadow',appliedPenalty:false});});assert.equal(calls,1);
});
test('consent is explicit; no automatic start and no fixed question limit',async()=>{
  const urls=[];await harness(async({dom})=>{assert.match(dom.window.document.body.textContent,/Unlimited hands/);const start=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent.includes('Start FastFold'));assert.ok(start.disabled);assert.equal(urls.filter(url=>url.endsWith('/start')).length,0);},async url=>{urls.push(url);return initialFetch(null)(url);});
});
test('fold advances server hand immediately; missing policy notice and scope are visible',async()=>{
  const first=session();first.hand.policyMissing=true;first.hand.pending.notice='no_multiway';
  await harness(async({dom,click,updates})=>{assert.match(dom.window.document.body.textContent,/not a recommended strategy/);assert.match(dom.window.document.body.textContent,/Postflop uses balanced policy/);await click('Fold');assert.ok(dom.window.document.body.textContent.includes('#2'));assert.equal(updates.at(-1).state.active.hand.number,2);},async(url,options)=>{if(url.endsWith('/action')){const body=JSON.parse(options.body);assert.equal(body.action,'fold');assert.equal(body.version,0);assert.ok(body.actionId);return Response.json({session:session(1,'active',2),state:state(session(1,'active',2))});}return initialFetch(first)(url);});
});
test('uncertain action locks buttons and retries identical action id/body',async()=>{
  const bodies=[];await harness(async({dom,click})=>{await click('Fold');assert.match(dom.window.document.body.textContent,/Not confirmed/);assert.ok([...dom.window.document.querySelectorAll('.ff-actions button')].every(b=>b.disabled));await click('Retry');assert.deepEqual(bodies[0],bodies[1]);assert.equal(dom.window.document.querySelector('[role=alert]'),null);},async(url,options)=>{if(url.endsWith('/action')){bodies.push(options.body);if(bodies.length===1)throw Error('network');return Response.json({session:session(1),state:state(session(1))});}return initialFetch(session())(url);});
});
test('pause keeps same hand; resume posts no new random seed or local deck',async()=>{
  const posts=[];await harness(async({dom,click})=>{await click('Pause');assert.match(dom.window.document.body.textContent,/same decision/);assert.equal(dom.window.document.querySelector('.ff-actions'),null);await click('Resume');assert.ok(dom.window.document.querySelector('.ff-actions'));assert.equal(posts.length,2);assert.deepEqual(posts[1],{consent:true});},async(url,options)=>{if(options?.method==='POST'){posts.push(JSON.parse(options.body));const next=session(posts.length, url.endsWith('/pause')?'paused':'active');return Response.json({session:next,state:state(next)});}return initialFetch(session())(url);});
});
test('stale version reconciles without leaving controls locked',async()=>{
  let conflicted=false;await harness(async({dom,click})=>{await click('Fold');assert.ok([...dom.window.document.querySelectorAll('.ff-actions button')].every(b=>!b.disabled));assert.match(dom.window.document.body.textContent,/#3/);},async(url,options)=>{if(url.endsWith('/action')){conflicted=true;return Response.json({error:'stale_version'},{status:409});}return initialFetch(session(conflicted?3:0,'active',conflicted?3:1))(url);});
});
test('sign-out hides state and drops a late action response',async()=>{
  let resolveAction;await harness(async({dom,root,props,updates,click})=>{await click('Fold');await act(async()=>root.render(React.createElement(FastFoldArena,{...props,ready:false})));const count=updates.length;await act(async()=>resolveAction(Response.json({session:session(1),state:state(session(1))})));assert.equal(updates.length,count);assert.doesNotMatch(dom.window.document.body.innerHTML,/ff-scorebar|ff-actions/);assert.match(dom.window.document.body.textContent,/Sign in/);},async(url,options)=>url.endsWith('/action')?new Promise(resolve=>{resolveAction=resolve;}):initialFetch(session())(url));
});
