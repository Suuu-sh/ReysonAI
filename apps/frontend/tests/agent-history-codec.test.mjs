import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAgentHistoryForAccount, decodeAgentHistory } from '../src/agent/agent-history-codec.ts';
const summary={at:1,tableId:'reyson-01',pos:'BTN',returnBb:1,vpip:true,pfr:true,threeBetOpp:false,threeBet:false,facedThreeBet:false,foldedToThreeBet:false,sawFlop:true,showdown:true,wonShowdown:false};
test('mixed old summaries and full session histories roundtrip compact-v1 without losing unknown fields or rows',()=>{
 const full={...summary,session:{id:'entry-a',startedAt:0,endedAt:9},history:{version:1,handNo:2,names:{BTN:'You',BB:'VEGA'},holeCards:{BTN:['Ad','8c'],BB:['Qs','6s']},board:['Qc','9s','7s','Ts','Jh'],log:[{street:'river',pos:'BTN',action:'call',to:6.86,pot:22.86,bets:{BTN:6.86,BB:6.86}}],winners:['BB'],returns:{BTN:-11.18,BB:10.54},pot:22.86,rake:1.14,handRanks:{BTN:4,BB:5}},futureField:{keep:true}};
 const rows=[summary,full],wire=JSON.parse(JSON.stringify(encodeAgentHistoryForAccount(rows)));
 assert.equal(wire.format,'reysonai-agent-hands:compact-v1');assert.equal(wire.records.length,2);assert.ok(Array.isArray(wire.records[0]));assert.deepEqual(wire.records[1],full);assert.deepEqual(decodeAgentHistory(wire),rows);
 assert.deepEqual(decodeAgentHistory(rows),rows,'legacy arrays still read directly');
});
test('oversized detailed history encoding never trims records, logs or cards to fit account quota',()=>{
 const rows=Array.from({length:3000},(_,at)=>({...summary,at,session:{id:'entry-a',startedAt:0},history:{version:1,holeCards:{BTN:['Ad','8c']},board:[],log:[{street:'preflop',pos:'BTN',action:'open',pot:4,source:'x'.repeat(200)}],winners:['BTN'],returns:{BTN:1}}}));
 const wire=encodeAgentHistoryForAccount(rows);assert.ok(new TextEncoder().encode(JSON.stringify(wire)).byteLength>500000);assert.deepEqual(decodeAgentHistory(wire),rows);assert.equal(wire.records.length,3000);
});
