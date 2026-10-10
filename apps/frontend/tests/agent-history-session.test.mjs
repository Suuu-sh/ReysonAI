import test from 'node:test';
import assert from 'node:assert/strict';
import React, { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useAgentHistorySession } from '../src/agent/history-session.ts';
import { loadAgentHands, saveAgentHand } from '../src/agent/agent-stats.ts';

test('entry lifecycle groups two hands; StrictMode cleanup is not exit; unmount and reentry are distinct', async () => {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
 const old={window:globalThis.window,document:globalThis.document};Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 let active;function Table({enabled=true}) { active=useAgentHistorySession(enabled);return null; }
 const root=createRoot(dom.window.document.querySelector('#root'));
 const record=n=>({at:Date.now()+n,tableId:'same-table',pos:'BTN',returnBb:n,session:{...active.entry}});
 try {
  await act(async()=>root.render(React.createElement(StrictMode,null,React.createElement(Table))));
  const first=active.entry.id;saveAgentHand(record(1));saveAgentHand(record(2));await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(loadAgentHands().every(hand=>hand.session.id===first&&hand.session.endedAt==null));
  await act(async()=>root.render(null));await new Promise(resolve=>setTimeout(resolve,10));assert.ok(loadAgentHands().every(hand=>Number.isFinite(hand.session.endedAt)));
  await act(async()=>root.render(React.createElement(Table)));assert.notEqual(active.entry.id,first);saveAgentHand(record(3));active.close();assert.ok(loadAgentHands().every(hand=>hand.session.endedAt!=null));
  await act(async()=>root.render(null));await new Promise(resolve=>setTimeout(resolve,10));
  await act(async()=>root.render(React.createElement(Table)));saveAgentHand(record(4));dom.window.dispatchEvent(new dom.window.Event('pagehide'));assert.ok(loadAgentHands().every(hand=>hand.session.endedAt!=null));
 } finally {await act(async()=>root.unmount());await new Promise(resolve=>setTimeout(resolve,10));dom.window.close();Object.assign(globalThis,old);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
