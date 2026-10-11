import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAgentHands, setAgentHandBookmarked } from '../src/agent/agent-stats.ts';

test('bookmark only completed hands with saved detail; toggles persist and preserve older history', () => {
 const old=globalThis.window, values=new Map(); let rejectWrites=false, events=0;
 globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(!rejectWrites)values.set(key,value)}},Event:class Event {constructor(type){this.type=type}},dispatchEvent(){events++}};
 const detailed={at:1,tableId:'table',pos:'BTN',returnBb:1,history:{version:1,holeCards:{BTN:['Ad','8c']},board:[],log:[],winners:['BTN'],returns:{BTN:1}}};
 try {
  window.localStorage.setItem('reysonai:agent-hands:v1',JSON.stringify([{...detailed,at:1},{...detailed,at:2,history:undefined},{...detailed,at:3,session:{id:'entry',startedAt:0},history:{...detailed.history,handNo:7}}]));
  setAgentHandBookmarked({at:1,tableId:'table',pos:'BTN'},true);
  assert.equal(loadAgentHands()[0].bookmarked,true);
  setAgentHandBookmarked({at:2,tableId:'table',pos:'BTN'},true);
  assert.equal(loadAgentHands()[1].bookmarked,undefined,'unfinished/no-detail rows cannot be bookmarked');
  setAgentHandBookmarked({sessionId:'entry',handNo:7,tableId:'table',pos:'BTN'},true);
  assert.equal(loadAgentHands()[2].bookmarked,true);
  setAgentHandBookmarked({at:1,tableId:'table',pos:'BTN'},false);
  assert.equal(loadAgentHands()[0].bookmarked,false,'unbookmark is saved');
  const eventsBeforeFailure=events;rejectWrites=true;
  const unchanged=setAgentHandBookmarked({at:1,tableId:'table',pos:'BTN'},true);
  assert.equal(unchanged[0].bookmarked,false,'failed persistence returns the unchanged saved state');
  assert.equal(events,eventsBeforeFailure,'failed persistence does not emit a saved-history event');
 } finally {globalThis.window=old;}
});
