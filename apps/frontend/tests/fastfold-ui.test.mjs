import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
const bundle = await build({ stdin: { contents: 'export { ffBreakRemaining } from "./src/trainer/fastfold-api.ts"; export { FastFoldArena } from "./src/trainer/FastFoldArena.tsx";', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'esm', external: ['react', 'react-dom'], jsx: 'automatic', loader: { '.css': 'empty' } });
const code = bundle.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?|react-dom)"/g, (_, name) => `from "${import.meta.resolve(name)}"`);
const { FastFoldArena, ffBreakRemaining } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const session = (version = 0, status = 'active', number = 1) => ({ id: 'session', version, status, hand: { id: `hand-${number}`, number, hero: 'BTN', holeCards: { BTN: ['As', 'Kd'] }, board: [], log: [{ pos: 'SB', action: 'check', street: 'preflop', pot: 1.5 }], pot: 1.5, status: 'awaiting', opponents: ['UTG','HJ','CO','SB','BB'].map(position => ({position,type:'station',label:'station',policyVersion:'saved-ai-v1'})), policyVersion: 'saved-ai-v1', pending: { street: 'preflop', pos:'BTN', options: [{key:'fold'}, {key:'open',to:2.5}], board:[], pot:1.5, toCall:0 } } });
const state = active => ({rating:1000,peak:1000,hands:0,netBb:0,bbPer100:null,provisional:true,uncertainty:1,active,recent:[]});
const SERVER_NOW=1_700_000_000_000;
const profile = active => ({serverNow:SERVER_NOW,enabled:true,season:'fastfold-v1',publicName:'Player test',state:state(active)});
async function harness(run, fetcher, ready = true, view = "play") {
  const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost/learn/trainer/ranked/play' });
  const old = {window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,HTMLElement:globalThis.HTMLElement};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.fetch = fetcher;globalThis.HTMLElement=dom.window.HTMLElement;
  const root = createRoot(dom.window.document.getElementById('root'));
  const updates=[],navigation=[]; const props={ready,view,onBack(){navigation.push("library");},onWaiting(){navigation.push("waiting");},onPlay(){navigation.push("play");},onRanking(){},onProfile:p=>updates.push(p)};
  try { await act(async()=>root.render(React.createElement(FastFoldArena,props))); await run({dom,root,props,updates,navigation,click:async label=>{const button=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,`Missing ${label}`); await act(async()=>button.click());}}); }
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
  const urls=[];await harness(async({dom})=>{assert.match(dom.window.document.body.textContent,/Unlimited hands/);const start=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent.includes('Start FastFold'));assert.ok(start.disabled);assert.ok(dom.window.document.querySelector('.ff-arena.is-lobby'));assert.equal(urls.filter(url=>url.endsWith('/start')).length,0);},async url=>{urls.push(url);return initialFetch(null)(url);});
});
test('fold advances server hand immediately; missing policy notice and scope are visible',async()=>{
  const first=session();first.hand.policyMissing=true;first.hand.pending.notice='no_multiway';
  await harness(async({dom,click,updates})=>{await act(async()=>dom.window.document.querySelector('.game-current-hand').click());assert.match(dom.window.document.body.textContent,/not a recommended strategy/);await click('Close');await act(async()=>dom.window.document.querySelector('.game-controls-trigger').click());assert.match(dom.window.document.body.textContent,/Postflop uses balanced policy/);await click('Close');await click('Fold');assert.ok(dom.window.document.body.textContent.includes('#2'));assert.equal(updates.at(-1).state.active.hand.number,2);},async(url,options)=>{if(url.endsWith('/action')){const body=JSON.parse(options.body);assert.equal(body.action,'fold');assert.equal(body.version,0);assert.ok(body.actionId);return Response.json({serverNow:SERVER_NOW,session:session(1,'active',2),state:state(session(1,'active',2))});}return initialFetch(first)(url);});
});
test('uncertain action locks buttons and retries identical action id/body',async()=>{
  const bodies=[];await harness(async({dom,click})=>{await click('Fold');assert.match(dom.window.document.body.textContent,/Not confirmed/);assert.ok(dom.window.document.querySelector('.agent-back').disabled);assert.ok([...dom.window.document.querySelectorAll('.ff-actions button')].every(b=>b.disabled));await click('Retry');assert.deepEqual(bodies[0],bodies[1]);assert.equal(dom.window.document.querySelector('[role=alert]'),null);},async(url,options)=>{if(url.endsWith('/action')){bodies.push(options.body);if(bodies.length===1)throw Error('network');return Response.json({serverNow:SERVER_NOW,session:session(1),state:state(session(1))});}return initialFetch(session())(url);});
});
test('Exit breaks the server hand; waiting room resumes the same decision',async()=>{
  const posts=[];let paused=null;await harness(async({dom,root,props,navigation,click})=>{
    await click('Exit');assert.deepEqual(navigation,['waiting']);assert.match(dom.window.document.body.textContent,/Waiting room/);assert.equal(dom.window.document.querySelector('.ff-actions'),null);assert.equal(dom.window.document.querySelectorAll('.ff-exit').length,0);assert.equal(dom.window.document.querySelector('.ff-countdown').textContent,'15:00');
    await act(async()=>root.render(React.createElement(FastFoldArena,{...props,view:'waiting'})));
    await click('Resume');assert.ok(dom.window.document.querySelector('.ff-actions'));assert.equal(navigation.at(-1),'play');assert.deepEqual(posts[1],{sessionId:'session',version:1});
  },async(url,options)=>{if(options?.method==='POST'){posts.push(JSON.parse(options.body));const next=session(posts.length,url.endsWith('/break')?'paused':'active');if(url.endsWith('/break')){next.breakExpiresAt=SERVER_NOW+900000;paused=next;}return Response.json({serverNow:SERVER_NOW,session:next,state:state(next)});}return initialFetch(paused??session())(url);});
});
test('stale version reconciles without leaving controls locked',async()=>{
  let conflicted=false;await harness(async({dom,click})=>{await click('Fold');assert.ok([...dom.window.document.querySelectorAll('.ff-actions button')].every(b=>!b.disabled));assert.match(dom.window.document.body.textContent,/#3/);},async(url,options)=>{if(url.endsWith('/action')){conflicted=true;return Response.json({error:'stale_version'},{status:409});}return initialFetch(session(conflicted?3:0,'active',conflicted?3:1))(url);});
});
test('sign-out hides state and drops a late action response',async()=>{
  let resolveAction;await harness(async({dom,root,props,updates,click})=>{await click('Fold');await act(async()=>root.render(React.createElement(FastFoldArena,{...props,ready:false})));const count=updates.length;await act(async()=>resolveAction(Response.json({serverNow:SERVER_NOW,session:session(1),state:state(session(1))})));assert.equal(updates.length,count);assert.doesNotMatch(dom.window.document.body.innerHTML,/ff-scorebar|ff-actions/);assert.match(dom.window.document.body.textContent,/Sign in/);},async(url,options)=>url.endsWith('/action')?new Promise(resolve=>{resolveAction=resolve;}):initialFetch(session())(url));
});

test('ranked uses shared Agent felt, six seats, hidden opponent cards and matching action buttons',async()=>{
  await harness(async({dom})=>{
    assert.equal(dom.window.document.querySelectorAll('.agent-felt').length,1);
    assert.equal(dom.window.document.querySelectorAll('.agent-seat').length,6);
    assert.equal(dom.window.document.querySelectorAll('.agent-card.is-back').length,10);
    assert.equal(dom.window.document.querySelectorAll('.agent-hole .trainer-card').length,2);
    assert.equal(dom.window.document.querySelectorAll('.agent-board .is-slot').length,5);
    assert.ok(dom.window.document.querySelector('.ff-action-fold.agent-act.tone-fold'));
    assert.equal(dom.window.document.querySelector('.agent-side'),null);await act(async()=>dom.window.document.querySelector('.game-controls-trigger').click());assert.ok(dom.window.document.querySelector('.game-details-modal .ff-scorebar'));
    assert.equal(dom.window.document.querySelectorAll('.ff-opponent').length,5);
  },initialFetch(session()));
});

test('break countdown ignores browser wall clock skew and has an exact fixed boundary',()=>{
  const saved=Date.now;
  try { for(const skew of [-86400000,86400000]) {Date.now=()=>SERVER_NOW+skew;assert.equal(ffBreakRemaining(SERVER_NOW+900000,SERVER_NOW,0),900000);assert.equal(ffBreakRemaining(SERVER_NOW+900000,SERVER_NOW,899999),1);assert.equal(ffBreakRemaining(SERVER_NOW+900000,SERVER_NOW,900000),0);assert.equal(ffBreakRemaining(SERVER_NOW+900000,SERVER_NOW,1000000),0);}} finally {Date.now=saved;}
});
test('waiting reload restores fixed server break; leave retries exact body and exits only after confirmation',async()=>{
 const paused=session(2,'paused');paused.breakExpiresAt=SERVER_NOW+700000;const bodies=[];
 await harness(async({dom,click,navigation})=>{assert.match(dom.window.document.body.textContent,/Waiting room/);assert.equal(dom.window.document.querySelector('.ff-countdown').textContent,'11:40');await click('Leave now');assert.deepEqual(navigation,[]);assert.ok(dom.window.document.querySelector('.ff-resume').disabled);await click('Retry');assert.deepEqual(bodies[0],bodies[1]);assert.equal(navigation.at(-1),'library');},async(url,options)=>{if(url.endsWith('/leave')){bodies.push(options.body);if(bodies.length===1)throw Error('network');return Response.json({serverNow:SERVER_NOW,session:null,state:state(null)});}return initialFetch(paused)(url);},true,'waiting');
});
test('expired break reconciles through server after focus, without local settlement',async()=>{
 const paused=session(3,'paused');paused.breakExpiresAt=SERVER_NOW;let expired=false,calls=0;
 await harness(async({dom,navigation})=>{assert.deepEqual(navigation,[]);assert.ok(dom.window.document.querySelector('.ff-resume').disabled);expired=true;await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.equal(navigation.at(-1),'library');assert.ok(calls>=2);},async url=>{if(url.endsWith('/profile'))calls++;return initialFetch(expired?null:paused)(url);},true,'waiting');
});
test('uncertain Exit retries the identical break id/body before entering the waiting room',async()=>{
 const bodies=[];const paused=session(1,'paused');paused.breakExpiresAt=SERVER_NOW+900000;
 await harness(async({dom,navigation,click})=>{await click('Exit');assert.deepEqual(navigation,[]);assert.ok(dom.window.document.querySelector('.ff-exit').disabled);await click('Retry');assert.deepEqual(bodies[0],bodies[1]);assert.equal(navigation.at(-1),'waiting');assert.equal(dom.window.document.querySelector('.ff-countdown').textContent,'15:00');},async(url,options)=>{if(url.endsWith('/break')){bodies.push(options.body);if(bodies.length===1)throw Error('lost response');return Response.json({serverNow:SERVER_NOW,session:paused,state:state(paused)});}return initialFetch(session())(url);});
});
test('offline expiry stays locked until a server-confirmed retry, without local exit or rating',async()=>{
 const paused=session(2,'paused');paused.breakExpiresAt=SERVER_NOW;let profiles=0,recovered=false;
 await harness(async({dom,navigation,updates,click})=>{assert.deepEqual(navigation,[]);assert.match(dom.window.document.body.textContent,/Break ended/);assert.match(dom.window.document.body.textContent,/unavailable/);assert.ok(dom.window.document.querySelector('.ff-resume').disabled);recovered=true;await click('Retry');assert.equal(navigation.at(-1),'library');assert.equal(updates.at(-1).state.active,null);assert.equal(updates.at(-1).state.rating,1000);},async url=>{if(url.endsWith('/profile')){profiles++;if(profiles>1&&!recovered)throw Error('offline');}return initialFetch(recovered?null:paused)(url);},true,'waiting');
});
