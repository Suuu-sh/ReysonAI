import test from 'node:test';
import assert from 'node:assert/strict';
const { encodeAgentHistoryForAccount: encode, decodeAgentHistory: decode } = await import(new URL('./apps/frontend/src/agent/agent-history-codec.ts', import.meta.url).href);
const flags=['vpip','pfr','threeBetOpp','threeBet','facedThreeBet','foldedToThreeBet','sawFlop','showdown','wonShowdown'];
const optional=['pfBets','pfCalls','pfFacing','pfFolds'];
test('exhaustive supported flag and optional-field combinations round trip without changing facts',(): any=>{
 let n=0;
 for(let bits=0;bits<512;bits++) for(let mask=0;mask<16;mask++) {
  const row: any={at:1790000000000,tableId:'synthetic-桌-é',pos:'BTN',returnBb:-1.375};
  flags.forEach((key?: any,i?: any): any=>row[key]=Boolean(bits&(1<<i)));
  optional.forEach((key?: any,i?: any): any=>{if(mask&(1<<i))row[key]=i;});
  assert.deepEqual(decode(JSON.parse(JSON.stringify(encode([row])))),[row]);n++;
 }
 assert.equal(n,8192);
});
test('legacy object histories and unknown object fields retain data and do not become compact loss',(): any=>{
 const known={at:1,tableId:'synthetic',pos:'BB',returnBb:0,...Object.fromEntries(flags.map((k?: any): any=>[k,false]))};
 const future={...known,sessionId:'saved-session',cards:['As','Kd'],extra:{noRewrite:true}};
 const incomplete={at:2,tableId:'legacy',returnBb:1};
 const source=[known,future,incomplete];
 assert.equal(decode(source),source);
 const wire=encode(source);
 assert.ok(Array.isArray(wire.records[0]));
 assert.deepEqual(wire.records[1],future);
 assert.deepEqual(wire.records[2],incomplete);
 assert.deepEqual(decode(JSON.parse(JSON.stringify(wire))),source);
 assert.deepEqual(encode(wire),wire);
});
test('3000 ordinary Agent rows remain below the unchanged endpoint limit and expand exactly',(): any=>{
 const source=Array.from({length:3000},(_?: any,at?: any): any=>({at,tableId:'synthetic-table',pos:'BTN',returnBb:at/16,...Object.fromEntries(flags.map((k?: any,i?: any): any=>[k,Boolean(at&(1<<i))])),pfBets:2,pfCalls:1,pfFacing:3,pfFolds:0}));
 const body={data:{'reysonai:agent-hands:v1':encode(source),'reysonai:profile:v1':{nickname:'synthetic'}},version:1,importLocal:true,consent:true,expectedOwner:'synthetic-owner'};
 const serialized=JSON.stringify(body);
 assert.ok(Buffer.byteLength(serialized)<500000);
 assert.deepEqual(decode(JSON.parse(serialized).data['reysonai:agent-hands:v1']),source);
});
