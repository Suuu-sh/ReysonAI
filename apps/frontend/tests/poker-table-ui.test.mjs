import test, { after } from 'node:test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
const result=await build({stdin:{contents:'export * from "./src/agent/PokerTable.tsx"; export * from "./src/agent/GameplayDetails.tsx"; export {OpponentProfile} from "./src/agent/OpponentProfile.tsx"; export {AgentTablePage} from "./src/agent/AgentTable.tsx";',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',external:['react','react-dom'],jsx:'automatic',loader:{'.css':'empty','.png':'dataurl','.webp':'dataurl'},define:{'import.meta.url':JSON.stringify(new URL('../src/estimated/datasets.ts',import.meta.url).href)}});
const code=result.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?|react-dom)"/g,(_,name)=>`from "${import.meta.resolve(name)}"`);
const bundlePath=`/tmp/reyson-poker-table-test-${process.pid}.mjs`;writeFileSync(bundlePath,code);after(()=>unlinkSync(bundlePath));
const {PokerTable,PokerSeat,PokerChip,PokerActionButton,AgentTablePage,OpponentProfile,GameplayDetails,GamePanel}=await import(pathToFileURL(bundlePath).href);
test('shared presentation respects caller visibility, slots, chips and actions',()=>{
  const html=renderToStaticMarkup(React.createElement(PokerTable,{board:['As','Td','4c'],center:'42 bb'},[
    React.createElement(PokerSeat,{key:'seat',slot:4,position:'BTN',cards:['Kh','Qh'],showCards:false,handKey:1,name:'Agent',folded:true,acting:true,won:true,stack:'98 bb',bubble:'Call'}),
    React.createElement(PokerChip,{key:'chip',slot:4,amount:'2 bb'}),
    React.createElement(PokerActionButton,{key:'act',tone:'raise',disabled:true,onClick(){},children:'Raise'})]));
  const doc=new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('.agent-board .trainer-card').length,3);
  assert.equal(doc.querySelectorAll('.agent-board .is-slot').length,2);
  assert.equal(doc.querySelectorAll('.agent-hole .is-back').length,2);
  assert.equal(doc.querySelectorAll('.agent-hole .trainer-card').length,0);
  assert.ok(doc.querySelector('.agent-seat.slot-4.is-folded.is-acting.is-winner'));
  assert.equal(doc.querySelector('.agent-chip.slot-4').textContent,'2 bb');
  assert.ok(doc.querySelector('.agent-act.tone-raise').disabled);
});
test('local Agent retains reveal progression, actions and player-style drawer with shared presentation',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/learn/trainer/agent/reyson-01'});
  const before={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,HTMLElement:globalThis.HTMLElement};
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  dom.window.localStorage.setItem('reysonai:agent-speed','"fast"');
  const root=createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(AgentTablePage,{tableId:'reyson-01',onExit(){}})));
    for(let i=0;i<100&&!dom.window.document.querySelector('.agent-act');i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100));});
    assert.equal(dom.window.document.querySelectorAll('.agent-seat').length,6);
    assert.ok(dom.window.document.querySelector('.agent-act'),'Agent reaches human action after its unchanged reveal timers');
    assert.equal(dom.window.document.querySelectorAll('.agent-card.is-back').length,10);
    await act(async()=>dom.window.document.querySelector('.agent-act').click());
    assert.ok(dom.window.document.querySelector('.agent-felt'));
    const style=[...dom.window.document.querySelectorAll('button')].find(button=>button.textContent==='Play style');
    assert.ok(style);await act(async()=>style.click());assert.ok(dom.window.document.querySelector('.game-details-modal[role=dialog]'));assert.ok(dom.window.document.querySelector('.style-dash'));
  } finally {await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,before);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});

async function agentFixture(run,props={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/learn/trainer/agent/reyson-01'});const old={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,HTMLElement:globalThis.HTMLElement};Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});dom.window.localStorage.setItem('reysonai:agent-speed','"fast"');const root=createRoot(dom.window.document.getElementById('root'));
 const render=p=>root.render(React.createElement(AgentTablePage,{tableId:'reyson-01',onExit(){},...props,...p}));const until=async fn=>{for(let i=0;i<150&&!fn();i++)await act(async()=>new Promise(r=>setTimeout(r,100)));assert.ok(fn(),'Agent state failed to settle');};
 try{await act(async()=>render());await until(()=>dom.window.document.querySelector('.agent-act'));await run({dom,root,render,until});}finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,old);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
}
test('Agent profile uses shared modal, switches/closes and suppresses game shortcuts',async()=>{
 await agentFixture(async({dom})=>{const trigger=dom.window.document.querySelector('.agent-profile-trigger');trigger.focus();await act(async()=>trigger.click());const block=dom.window.document.querySelector('.agent-profile-block');assert.ok(block);assert.ok(block.closest('.game-profile-modal[role=dialog]'));assert.equal(dom.window.document.querySelector('.agent-side'),null);assert.match(block.textContent,/Balanced/);assert.ok(dom.window.document.querySelector('[role="dialog"][aria-modal="true"]'));const actions=[...dom.window.document.querySelectorAll('.agent-act')].map(b=>b.textContent);await act(async()=>dom.window.document.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'1',bubbles:true})));assert.deepEqual([...dom.window.document.querySelectorAll('.agent-act')].map(b=>b.textContent),actions);const close=block.querySelector('button');close.focus();await act(async()=>close.dispatchEvent(new window.KeyboardEvent('keydown',{key:'1',bubbles:true})));assert.deepEqual([...dom.window.document.querySelectorAll('.agent-act')].map(b=>b.textContent),actions);const side=dom.window.document.querySelectorAll('.agent-mini-profile')[1];await act(async()=>side.click());assert.equal(dom.window.document.querySelectorAll('.agent-profile-block').length,1);assert.match(dom.window.document.querySelector('.agent-profile-block h3').textContent,/VEGA/);await act(async()=>dom.window.document.querySelector('.agent-profile-block button').click());assert.equal(dom.window.document.querySelector('.agent-profile-block'),null);assert.ok(dom.window.document.querySelector('.agent-act'));});
});
test('waiting Agent holds a reserved hand at completion without saving local history or inferred stats',async()=>{
 let boundaries=0;await agentFixture(async({dom,render,until})=>{assert.equal(dom.window.document.querySelector('.agent-standings'),null);await act(async()=>render({handoffKey:'real-reservation',onHandBoundary:()=>boundaries++}));await act(async()=>dom.window.document.querySelector('.agent-act.tone-fold').click());const trigger=dom.window.document.querySelector('.agent-profile-trigger');await act(async()=>trigger.click());await until(()=>Boolean(dom.window.document.querySelector('.agent-result')));await until(()=>boundaries===1);assert.ok(dom.window.document.querySelector('.agent-profile-block'),'profile does not interrupt handoff');assert.ok(dom.window.document.querySelector('.game-profile-modal[aria-modal=true]'));assert.match(dom.window.document.querySelector('.agent-title small').textContent,/#1/);await act(async()=>new Promise(r=>setTimeout(r,800)));assert.equal(boundaries,1);assert.match(dom.window.document.querySelector('.agent-title small').textContent,/#1/);const keys=Object.keys(dom.window.localStorage);assert.ok(!keys.some(key=>/agent-hands/.test(key)));assert.equal(dom.window.document.querySelector('.style-card'),null);},{waitingMode:true});
});

test('shared sidebar profile keeps four-language honesty and unavailable samples without modal semantics',()=>{
 const dom=new JSDOM('',{url:'http://localhost'});const oldWindow=globalThis.window;globalThis.window=dom.window;
 try{for(const [locale,caption,close] of [['en','Only server-public samples','Close'],['ja','サーバーの公開サンプル','閉じる'],['zh-CN','仅显示服务器公开样本','关闭'],['es','Solo muestras públicas','Cerrar']]){dom.window.localStorage.setItem('reysonai:locale:v1',locale);const html=renderToStaticMarkup(React.createElement(OpponentProfile,{profile:{name:'Player unchanged',kind:'human',type:'unknown',avatar:null},onClose(){}}));assert.ok(html.includes(caption));assert.ok(html.includes(close));assert.match(html,/role="region"/);assert.doesNotMatch(html,/aria-modal|role="dialog"/);assert.match(html,/Player unchanged/);assert.equal((html.match(/<dd>—<\/dd>/g)??[]).length,3);}}finally{dom.window.close();globalThis.window=oldWindow;}
});

test("shared gameplay modals contain focus, dismiss, restore triggers and retain current actions", async () => {
 const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost"});
 const before = {window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(dom.window.document.getElementById("root"));let actions=0;
 const profile={name:"Public name",kind:"human",type:"Unknown",avatar:null};
 const render=p=>root.render(React.createElement(React.Fragment,null,
  React.createElement("button",{className:"current-action",onClick:()=>actions++},"Call"),
  React.createElement("button",{className:"profile-trigger",onClick:()=>render(profile)},"Player"),
  React.createElement(GameplayDetails,{currentCards:["As","Kd"],history:[{id:1,cards:["Th","9c"],resultBb:-1.25},{id:2,resultBb:null}],profile:p&&React.createElement(OpponentProfile,{profile:p,onClose:()=>render(null)})},
   React.createElement(GamePanel,{id:"hand",label:"Hand"},"Real current action log"),
   React.createElement(GamePanel,{id:"recent",label:"Recent"},"Actual completed-hand details"),
   React.createElement(GamePanel,{id:"rank",label:"Rank"},"All seven tiers remain available"))));
 try {
  await act(async()=>render(null));const doc=dom.window.document,action=doc.querySelector('.current-action'),current=doc.querySelector('.game-current-hand');
  assert.equal(doc.querySelector('.game-details-nav'),null);assert.equal(doc.querySelector('.agent-side'),null);
  const completed=doc.querySelectorAll('.game-history-hand');assert.equal(completed[0].querySelectorAll('.trainer-card').length,2);assert.match(completed[0].textContent,/-1.25 bb/);assert.equal(completed[1].querySelectorAll('.trainer-card').length,0);assert.equal(completed[1].querySelector('b'),null);
  current.focus();await act(async()=>current.click());let modal=doc.querySelector('[role=dialog]');assert.equal(modal.getAttribute('aria-modal'),'true');assert.equal(modal.parentElement.parentElement,doc.body);assert.match(modal.textContent,/Real current action log/);assert.equal(doc.querySelector('.current-action'),action);
  const close=modal.querySelector('button');close.focus();await act(async()=>close.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(doc.activeElement,close);
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',cancelable:true})));assert.equal(doc.querySelector('[role=dialog]'),null);assert.equal(doc.activeElement,current);
  await act(async()=>completed[0].click());modal=doc.querySelector('[role=dialog]');assert.match(modal.textContent,/Actual completed-hand details/);assert.doesNotMatch(modal.textContent,/Real current action log/);await act(async()=>doc.querySelector('.modal-backdrop').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true})));assert.equal(doc.querySelector('[role=dialog]'),null);
  const trigger=doc.querySelector('.profile-trigger');trigger.focus();await act(async()=>trigger.click());assert.ok(doc.querySelector('.game-profile-modal'));await act(async()=>doc.querySelector('.agent-profile-block button').click());assert.equal(doc.activeElement,trigger);
  await act(async()=>action.click());assert.equal(actions,1);assert.equal(doc.querySelector('.current-action'),action);
 } finally {await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,before);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
test("fixed mobile gameplay sizing is route-scoped and leaves bottom navigation and optional contained scroll",async()=>{
 const css=await readFile(new URL('../src/agent/gameplay-mobile.css',import.meta.url),'utf8');
 assert.match(css,/@media \(max-width: 650px\)/); assert.match(css,/html:has\(\.game-details\)/);
 assert.match(css,/height: 100dvh/); assert.match(css,/env\(safe-area-inset-top, 0px\)/);
 assert.match(css,/grid-template-rows: minmax\(0, 1fr\) auto/); assert.match(css,/max-height: calc\(100dvh - 32px\)/);
 assert.match(css,/max-height: 450px/); assert.match(css,/prefers-reduced-motion: reduce/);
 const shell=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(shell,/padding-bottom: calc\(68px \+ env\(safe-area-inset-bottom, 0px\)\)/);
 const profile=await readFile(new URL('../src/agent/OpponentProfile.tsx',import.meta.url),'utf8');assert.doesNotMatch(profile,/scrollIntoView|scrollTo/);assert.doesNotMatch(css,/grid-template-columns: minmax\(0, 1fr\) minmax\(150px/);
});
test("history rail keeps current and newest three hands left of independent right controls",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});const old={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(dom.window.document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(GameplayDetails,{currentCards:['As','Kd'],history:[7,6,5,4].map(id=>({id,cards:['Qh','Jc'],resultBb:id}))})));const rail=dom.window.document.querySelector('.game-history-rail'),items=rail.querySelector('.game-history-items');assert.equal(items.querySelectorAll('.game-current-hand').length,1);const recent=[...items.querySelectorAll('.game-history-hand')];assert.equal(recent.length,3);assert.deepEqual(recent.map(button=>button.getAttribute('aria-label').match(/#(\d+)/)?.[1]),['7','6','5']);assert.equal(rail.querySelector('.game-controls-trigger').parentElement,rail);const css=await readFile(new URL('../src/agent/gameplay-mobile.css',import.meta.url),'utf8');assert.match(css,/\.game-history-items\s*\{[^}]*max-width:\s*calc\(100%\s*-\s*49px\)/s);assert.match(css,/\.game-history-rail \.game-controls-trigger\s*\{[^}]*right:\s*0/);assert.match(css,/min-height: 451px\).*\.agent-seat\.slot-3\s*\{[^}]*flex-direction: row/s);}
 finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,old);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
