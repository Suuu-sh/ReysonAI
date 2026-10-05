import test, { after } from 'node:test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
const result=await build({stdin:{contents:'export * from "./src/agent/PokerTable.tsx"; export {AgentTablePage} from "./src/agent/AgentTable.tsx";',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',external:['react'],jsx:'automatic',loader:{'.css':'empty','.png':'dataurl','.webp':'dataurl'},define:{'import.meta.url':JSON.stringify(new URL('../src/estimated/datasets.ts',import.meta.url).href)}});
const code=result.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?)"/g,(_,name)=>`from "${import.meta.resolve(name)}"`);
const bundlePath=`/tmp/reyson-poker-table-test-${process.pid}.mjs`;writeFileSync(bundlePath,code);after(()=>unlinkSync(bundlePath));
const {PokerTable,PokerSeat,PokerChip,PokerActionButton,AgentTablePage}=await import(pathToFileURL(bundlePath).href);
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
