import test, { after } from 'node:test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
const result=await build({stdin:{contents:'export * from "./src/agent/PokerTable.tsx"; export {OpponentProfile} from "./src/agent/OpponentProfile.tsx"; export {AgentTablePage} from "./src/agent/AgentTable.tsx";',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',external:['react'],jsx:'automatic',loader:{'.css':'empty','.png':'dataurl','.webp':'dataurl'},define:{'import.meta.url':JSON.stringify(new URL('../src/estimated/datasets.ts',import.meta.url).href)}});
const code=result.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?)"/g,(_,name)=>`from "${import.meta.resolve(name)}"`);
const bundlePath=`/tmp/reyson-poker-table-test-${process.pid}.mjs`;writeFileSync(bundlePath,code);after(()=>unlinkSync(bundlePath));
const {PokerTable,PokerSeat,PokerChip,PokerActionButton,AgentTablePage,OpponentProfile}=await import(pathToFileURL(bundlePath).href);
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
  const before={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
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
    assert.ok(style);await act(async()=>style.click());assert.ok(dom.window.document.querySelector('.style-drawer[role=dialog]'));
  } finally {await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,before);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});

async function agentFixture(run,props={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/learn/trainer/agent/reyson-01'});const old={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,HTMLElement:globalThis.HTMLElement};Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});dom.window.localStorage.setItem('reysonai:agent-speed','"fast"');const root=createRoot(dom.window.document.getElementById('root'));
 const render=p=>root.render(React.createElement(AgentTablePage,{tableId:'reyson-01',onExit(){},...props,...p}));const until=async fn=>{for(let i=0;i<150&&!fn();i++)await act(async()=>new Promise(r=>setTimeout(r,100)));assert.ok(fn(),'Agent state failed to settle');};
 try{await act(async()=>render());await until(()=>dom.window.document.querySelector('.agent-act'));await run({dom,root,render,until});}finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,old);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
}
test('Agent profile is sidebar-first, switches/closes without a modal and ignores shortcuts from focused buttons',async()=>{
 await agentFixture(async({dom})=>{const trigger=dom.window.document.querySelector('.agent-profile-trigger');trigger.focus();await act(async()=>trigger.click());const block=dom.window.document.querySelector('.agent-profile-block');assert.ok(block);assert.equal(dom.window.document.querySelector('.agent-side').firstElementChild,block);assert.match(block.textContent,/Balanced/);assert.equal(dom.window.document.querySelector('[role="dialog"]'),null);assert.equal(dom.window.document.querySelector('[aria-modal="true"]'),null);const actions=[...dom.window.document.querySelectorAll('.agent-act')].map(b=>b.textContent);const close=block.querySelector('button');close.focus();await act(async()=>close.dispatchEvent(new window.KeyboardEvent('keydown',{key:'1',bubbles:true})));assert.deepEqual([...dom.window.document.querySelectorAll('.agent-act')].map(b=>b.textContent),actions);const side=dom.window.document.querySelectorAll('.agent-mini-profile')[1];await act(async()=>side.click());assert.equal(dom.window.document.querySelectorAll('.agent-profile-block').length,1);assert.match(dom.window.document.querySelector('.agent-profile-block h3').textContent,/VEGA/);await act(async()=>dom.window.document.querySelector('.agent-profile-block button').click());assert.equal(dom.window.document.querySelector('.agent-profile-block'),null);assert.ok(dom.window.document.querySelector('.agent-act'));});
});
test('waiting Agent holds a reserved hand at completion without saving local history or inferred stats',async()=>{
 let boundaries=0;await agentFixture(async({dom,render,until})=>{assert.equal(dom.window.document.querySelector('.agent-standings'),null);await act(async()=>render({handoffKey:'real-reservation',onHandBoundary:()=>boundaries++}));await act(async()=>dom.window.document.querySelector('.agent-act.tone-fold').click());const trigger=dom.window.document.querySelector('.agent-profile-trigger');await act(async()=>trigger.click());await until(()=>Boolean(dom.window.document.querySelector('.agent-result')));await until(()=>boundaries===1);assert.ok(dom.window.document.querySelector('.agent-profile-block'),'profile does not interrupt handoff');assert.equal(dom.window.document.querySelector('.agent-side').firstElementChild,dom.window.document.querySelector('.agent-profile-block'));assert.match(dom.window.document.querySelector('.agent-title small').textContent,/#1/);await act(async()=>new Promise(r=>setTimeout(r,800)));assert.equal(boundaries,1);assert.match(dom.window.document.querySelector('.agent-title small').textContent,/#1/);const keys=Object.keys(dom.window.localStorage);assert.ok(!keys.some(key=>/agent-hands/.test(key)));assert.equal(dom.window.document.querySelector('.style-card'),null);},{waitingMode:true});
});

test('shared sidebar profile keeps four-language honesty and unavailable samples without modal semantics',()=>{
 const dom=new JSDOM('',{url:'http://localhost'});const oldWindow=globalThis.window;globalThis.window=dom.window;
 try{for(const [locale,caption,close] of [['en','Only server-public samples','Close'],['ja','サーバーの公開サンプル','閉じる'],['zh-CN','仅显示服务器公开样本','关闭'],['es','Solo muestras públicas','Cerrar']]){dom.window.localStorage.setItem('reysonai:locale:v1',locale);const html=renderToStaticMarkup(React.createElement(OpponentProfile,{profile:{name:'Player unchanged',kind:'human',type:'unknown',avatar:null},onClose(){}}));assert.ok(html.includes(caption));assert.ok(html.includes(close));assert.match(html,/role="region"/);assert.doesNotMatch(html,/aria-modal|role="dialog"/);assert.match(html,/Player unchanged/);assert.equal((html.match(/<dd>—<\/dd>/g)??[]).length,3);}}finally{dom.window.close();globalThis.window=oldWindow;}
});
