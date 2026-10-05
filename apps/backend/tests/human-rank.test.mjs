import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';
import {routeHumanRank,sweepHumanRank,nextHumanDeadline}from'../src/human-rank.ts';import {digest}from'../src/account.ts';import worker from'../src/index.ts';import {humanRankFixture as fixture}from'./fixtures/human-rank.mjs';
const origin='http://localhost:5173',api='http://localhost:8787/v1/fastfold/human/';
test('zero/one/five never deal; six authenticated unique users reserve then all accept before human match',async()=>{const f=await fixture();try{
let s=await f.state(0);assert.equal(s.queue.humans,0);assert.equal(s.match,undefined);await f.join(0);assert.equal((await f.state(0)).queue.humans,1);
for(let i=1;i<5;i++)await f.join(i);s=await f.state(0);assert.equal(s.queue.humans,5);assert.equal(s.match,undefined);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM human_rank_tables').get().n,0);
await f.join(5);s=await f.state(0);assert.equal(s.phase,'reserved');assert.equal(s.queue.humans,6);assert.equal(s.match,undefined);
const privateReservation=JSON.parse(f.sqlite.prepare('SELECT private_json FROM human_rank_tables').get().private_json);assert.equal(privateReservation.hand,null);
for(let i=0;i<5;i++)await f.control(i,'accept',{reservationId:s.reservation.id});assert.equal((await f.state(0)).match,undefined);
await f.control(5,'accept',{reservationId:s.reservation.id});
for(let i=0;i<6;i++){const current=await f.state(i);assert.equal(current.phase,'hand');assert.equal(current.match.participants.length,6);assert.equal(current.match.hand.board.length,0);assert.deepEqual(Object.keys(current.match.hand.holeCards),[current.match.participants[i].position]);assert.equal(JSON.stringify(current).includes('runout'),false);assert.equal(JSON.stringify(current).includes('subject'),false);assert.equal(JSON.stringify(current).includes('email'),false)}
assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM human_rank_tables WHERE status='active'").get().n,1);
}catch(e){throw e}finally{f.close()}});
test('join/action UUID retries, owner isolation, legal turns, fold other five continue, results settle once',async()=>{const f=await fixture();try{
const cmd={version:0,actionId:crypto.randomUUID(),consent:true};await Promise.all([f.call(0,'join',cmd,[200,409]),f.call(0,'join',cmd,[200,409])]);
// Concurrent duplicate may safely respond stale; same UUID retry is always resolved.
await f.call(0,'join',cmd);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM human_rank_players WHERE phase='queued'").get().n,1);
for(let i=1;i<6;i++)await f.join(i);for(let i=0;i<6;i++){const s=await f.state(i);await f.control(i,'accept',{reservationId:s.reservation.id})}
let m=(await f.state(0)).match;const action={tableId:m.id,version:m.version,actionId:crypto.randomUUID(),action:'fold'};
await f.call(6,'action',action,404);await f.call(1,'action',action,400);
await f.call(0,'action',action);await f.call(0,'action',action);assert.equal((await f.state(1)).match.hand.status,'playing');assert.equal((await f.state(0)).phase,'queued');
assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM human_rank_results').get().n,0);
// A folded seat can explicitly leave then enter a different queue while old hand settles.
await f.control(0,'leave');await f.join(0);assert.equal((await f.state(0)).phase,'queued');
for(let i=1;i<5;i++){m=(await f.state(i)).match;await f.call(i,'action',{tableId:m.id,version:m.version,actionId:crypto.randomUUID(),action:'fold'})}
assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM human_rank_results').get().n,6);assert.equal((await f.state(0)).hands,1);assert.equal((await f.state(0)).phase,'reserved');assert.equal((await f.state(0)).match,undefined);
await f.call(0,'action',action);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM human_rank_results').get().n,6);
await f.call(0,'action',{...action,action:'call'},409);
const profile=await f.call(0,'opponent?player='+f.sqlite.prepare('SELECT public_id FROM human_rank_players WHERE user_id=?').get('U1').public_id);assert.equal(profile.player.style,'unknown');assert.equal(profile.player.stats.hands,1);
}finally{f.close()}});
test('reservation cancellation/lease and fixed 15-minute break survive reconnect, timeout persists',async()=>{const real=Date.now;let now=real();Date.now=()=>now;const f=await fixture();try{
for(let i=0;i<6;i++)await f.join(i);const reserved=(await f.state(0)).reservation.id;await f.control(0,'leave');assert.equal(f.sqlite.prepare('SELECT status FROM human_rank_tables WHERE id=?').get(reserved).status,'cancelled');assert.equal((await f.state(1)).phase,'queued');
await f.join(0);for(let i=0;i<6;i++){const s=await f.state(i);await f.control(i,'accept',{reservationId:s.reservation.id})}
const prior=(await f.state(1)).match.id;const b=await f.control(1,'break');assert.equal(b.state.phase,'break');const deadline=b.state.breakExpiresAt;
now+=1000;const repeat=await f.control(1,'break');assert.equal(repeat.state.breakExpiresAt,deadline);assert.equal((await f.state(0)).match.id,prior);assert.equal((await f.state(0)).match.hand.status,'playing');
const due=await nextHumanDeadline(f.env);assert.ok(due<=now+30000);now=due;await sweepHumanRank(f.env,now);assert.ok((await f.state(2)).match.hand.log.length>0);
const resume=await f.control(1,'resume');assert.equal(resume.state.phase,'queued');assert.equal(resume.state.match,undefined);
const nb=await f.control(1,'break');now=nb.state.breakExpiresAt;await sweepHumanRank(f.env,now);assert.equal((await f.state(1)).phase,'out');await f.call(1,'resume',{version:(await f.state(1)).version,actionId:crypto.randomUUID()},409);
assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,7);
}finally{Date.now=real;f.close()}});

test('departures are atomic under injected failure and concurrent old/new hand results never lose aggregate evidence',async()=>{const f=await fixture(11);try{
 await f.six();let m=(await f.state(0)).match;
 await f.call(0,'action',{tableId:m.id,version:m.version,actionId:crypto.randomUUID(),action:'call'});
 const current=await f.state(0),cmd={version:current.version,actionId:crypto.randomUUID()};
 f.sqlite.exec("CREATE TRIGGER reject_departure BEFORE UPDATE OF phase ON human_rank_players WHEN NEW.phase='break' BEGIN SELECT RAISE(ABORT,'test_failure'); END");
 const oldJSON=f.sqlite.prepare('SELECT private_json FROM human_rank_tables WHERE id=?').get(m.id).private_json;
 await f.call(0,'break',cmd,503);assert.equal(f.sqlite.prepare('SELECT private_json FROM human_rank_tables WHERE id=?').get(m.id).private_json,oldJSON);assert.equal((await f.state(0)).phase,'hand');
 f.sqlite.exec('DROP TRIGGER reject_departure');await f.call(0,'break',cmd);await f.control(0,'resume');
 for(let i=6;i<11;i++)await f.join(i);for(const i of [0,6,7,8,9,10]){const s=await f.state(i);await f.control(i,'accept',{reservationId:s.reservation.id})}
 const second=(await f.state(0)).match;assert.notEqual(second.id,m.id);
 await f.call(0,'action',{tableId:second.id,version:second.version,actionId:crypto.randomUUID(),action:'call'});await f.control(0,'leave');await f.join(0);
 for(const i of [1,2,3,4,6,7,8,9]){const h=(await f.state(i)).match;await f.call(i,'action',{tableId:h.id,version:h.version,actionId:crypto.randomUUID(),action:'fold'})}
 for(const i of [5,10]){const h=(await f.state(i)).match;await f.call(i,'action',{tableId:h.id,version:h.version,actionId:crypto.randomUUID(),action:'check'})}
 const last=await Promise.all([f.state(5),f.state(10)]);await Promise.all(last.map((s,j)=>f.call([5,10][j],'action',{tableId:s.match.id,version:s.match.version,actionId:crypto.randomUUID(),action:'check'})));
 const p=f.sqlite.prepare('SELECT hands,net_bb,rating FROM human_rank_players WHERE user_id=?').get('U0');assert.equal(p.hands,2);assert.equal(p.net_bb,-2);assert.equal(p.rating,999);
 const rows=f.sqlite.prepare('SELECT before_rating,after_rating,public_json FROM human_rank_results WHERE user_id=? ORDER BY rowid').all('U0');assert.deepEqual(rows.map(r=>[r.before_rating,r.after_rating]),[[1000,1000],[1000,999]]);assert.equal(JSON.parse(rows[1].public_json).afterRating,999);
}finally{f.close()}});

test('CSRF, expired identity, slow body expiry and schema loss fail closed before pairing',async()=>{const f=await fixture();const real=Date.now;try{
 const req=(headers,body)=>new Request(api+'join',{method:'POST',headers:{origin,cookie:'reysonai-dev-session='+f.tokens[0],'content-type':'application/json',...headers},body,...(body instanceof ReadableStream?{duplex:'half'}:{})});
 let response=await worker.fetch(req({origin:'https://evil.invalid'},'{}'),f.env);assert.equal(response.status,403);
 response=await worker.fetch(req({cookie:'reysonai-dev-session='+'f'.repeat(64)},'{}'),f.env);assert.equal(response.status,401);
 response=await worker.fetch(req({},'{'),f.env);assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_json');
 let now=real();Date.now=()=>now;f.sqlite.prepare('UPDATE account_sessions SET expires_at=? WHERE user_id=?').run(Math.floor(now/1000)+1,'U0');
 const stream=new ReadableStream({async pull(controller){now+=2000;controller.enqueue(new TextEncoder().encode(JSON.stringify({version:0,actionId:crypto.randomUUID(),consent:true})));controller.close();}});
 response=await worker.fetch(req({},stream),f.env);assert.equal(response.status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM human_rank_players').get().n,0);
 f.sqlite.exec('DROP TRIGGER human_rank_claim');response=await worker.fetch(new Request(api+'status',{headers:{origin}}),f.env);assert.equal(response.status,503);
 }finally{Date.now=real;f.close()}});
