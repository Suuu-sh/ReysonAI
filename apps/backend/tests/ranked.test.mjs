import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { routeRanked, gradeRanked, questionPool } from '../src/ranked.ts';
import { digest } from '../src/account.ts';
import worker from '../src/index.ts';
const token='a'.repeat(64);
async function fixture() {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0007_accounts.sql','0003_preflop.sql','0009_ranked.sql','0009_ranked.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('user','google','private@example.invalid',0);
 sqlite.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(await digest(token),'user',Date.now()/1000+3600);
 for(const name of ['opening-ranges','preflop-ranges']) {
  const body=readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url),'utf8');
  sqlite.prepare('INSERT INTO preflop_datasets(name,content_hash,bytes,parts) VALUES (?,?,?,?)').run(name,'hash',body.length,1);
  sqlite.prepare('INSERT INTO preflop_dataset_parts VALUES (?,?,?)').run(name,0,body);
 }
 const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)}}}}};
 const env={DB,RANKED_ENABLED:'true',AUTH_ENABLED:'true',AUTH_APP_URL:'https://app.reysonai.com',ALLOWED_ORIGIN:'https://app.reysonai.com',GOOGLE_REDIRECT_URI:'https://api.reysonai.com/v1/account/google/callback',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',AUTH_RATE_LIMIT_KEY:'test'};
 const call=(path,body,headers={})=>routeRanked(new Request(`https://api.reysonai.com/v1/ranked/${path}`,{headers:{cookie:`__Host-reysonai=${token}`,...(body===undefined?{}:{origin:'https://app.reysonai.com','content-type':'application/json'}),...headers},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})}),env);
 return {sqlite,env,call};
}
const withFixture=fn=>async()=>{const f=await fixture();try{await fn(f)}finally{f.sqlite.close()}};
test('ranked is gated/authenticated and requires explicit public consent',withFixture(async f=>{
 assert.equal((await f.call('status')).status,200);
 assert.equal((await f.call('profile',undefined,{cookie:''})).status,401);
 assert.equal((await f.call('matches',{})).status,400);
 assert.equal((await f.call('matches',{consent:true},{origin:'https://evil.invalid'})).status,403);
 f.env.RANKED_ENABLED='false';assert.equal((await f.call('status')).status,503);
}));
test('server-issued matches, atomic duplicate finish, forged scores and replay',withFixture(async f=>{
 const starts=await Promise.all([f.call('matches',{consent:true}),f.call('matches',{consent:true})]);
 const responses=await Promise.all(starts.map(r=>r.json()));assert.equal(responses[0].match.id,responses[1].match.id);
 const {match}=responses[0];assert.equal(match.questions.length,20);
 const actions=match.questions.map(q=>Object.keys(q.mix).sort((a,b)=>q.mix[b]-q.mix[a])[0]);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions:actions.slice(0,19)})).status,400);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions,score:1000,rating:99999})).status,400);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions:actions.map(()=> 'all_in')})).status,400);
 const finished=await Promise.all([f.call(`matches/${match.id}/finish`,{actions}),f.call(`matches/${match.id}/finish`,{actions})]);
 assert.deepEqual(finished.map(r=>r.status),[200,200]);
 assert.equal(f.sqlite.prepare('SELECT matches FROM ranked_players').get().matches,1);
 const changed=[...actions];changed[0]=Object.keys(match.questions[0].mix).find(a=>a!==changed[0]);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions:changed})).status,409);
 assert.equal(f.sqlite.prepare('SELECT matches FROM ranked_players').get().matches,1);
 const board=await (await f.call('leaderboard?period=all')).json();assert.equal(board.rows[0].place,null);assert.equal(JSON.stringify(board).includes('private@example.invalid'),false);
 f.sqlite.prepare('DELETE FROM account_data WHERE user_id=?').run('user');assert.equal(f.sqlite.prepare('SELECT matches FROM ranked_players').get().matches,1);
 f.sqlite.prepare('DELETE FROM account_users WHERE id=?').run('user');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ranked_players').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ranked_matches').get().n,0);
}));
test('daily start quota and abandoned expiry are server enforced',withFixture(async f=>{
 for(let i=0;i<3;i++) {assert.equal((await f.call('matches',{consent:true})).status,200);f.sqlite.prepare("UPDATE ranked_matches SET expires_at=0 WHERE status='active'").run();}
 assert.equal((await f.call('matches',{consent:true})).status,429);
 assert.equal((await (await f.call('profile')).json()).state.remaining,0);
}));
test('global positions and Legend are assigned before top-100 pagination',withFixture(async f=>{
 for(let i=0;i<102;i++) {
  const id=i===101?'user':`p${i.toString().padStart(3,'0')}`;
  if(id!=='user') f.sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run(id,id,`${id}@example.invalid`,0);
  f.sqlite.prepare('INSERT INTO ranked_players VALUES (?,?,?,?,?)').run(id,`Player ${i}`,i===0?1600:1500-i,1600,3);
  for(let j=0;j<3;j++) f.sqlite.prepare('INSERT INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,status,questions_json,completed_at,before_rating,after_rating,score) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(`${id}-${j}`,id,'day',j+1,0,0,'complete','[]',Date.now(),1000,1600,20);
 }
 const {rows}=await (await f.call('leaderboard?period=all')).json();assert.equal(rows.length,101);assert.equal(rows[0].tier,'レジェンド');assert.equal(rows.at(-1).place,102);assert.equal(rows.at(-1).self,true);
 assert.equal(rows[1].tier,'ダイヤモンド');
}));
test('invalid/unpublished datasets fail closed and grading cannot use a client mix',withFixture(async f=>{
 f.sqlite.prepare('DELETE FROM preflop_dataset_parts').run();
 const unavailableStart=await f.call('matches',{consent:true}),unavailableStatus=await f.call('status');
 assert.equal(unavailableStart.status,503);assert.deepEqual(await unavailableStart.json(),{error:'ranked_dataset_unavailable'});
 assert.equal(unavailableStatus.status,503);assert.deepEqual(await unavailableStatus.json(),{enabled:false,error:'ranked_dataset_unavailable'});
 assert.throws(()=>questionPool({spots:[{id:'bad',hands:[{hand:'AKs',fold:NaN,open:100}]}]},'open'));
 const questions=Array.from({length:20},()=>({mix:{fold:.8,open:.2}}));assert.equal(gradeRanked(questions,Array(20).fill('open'))[0].score,.5);
}));

test('ranked preserves missing versus malformed published dataset errors',withFixture(async f=>{
 const malformed=await f.call('status');assert.equal(malformed.status,200);
 f.sqlite.prepare('UPDATE preflop_dataset_parts SET body=? WHERE name=? AND part=0').run('{ malformed json', 'opening-ranges');
 const malformedStatus=await f.call('status'),malformedStart=await f.call('matches',{consent:true});
 assert.equal(malformedStatus.status,503);assert.deepEqual(await malformedStatus.json(),{enabled:false,error:'ranked_service_unavailable'});
 assert.equal(malformedStart.status,503);assert.deepEqual(await malformedStart.json(),{error:'ranked_service_unavailable'});
 f.sqlite.prepare('DELETE FROM preflop_datasets WHERE name=?').run('opening-ranges');
 const missingStatus=await f.call('status'),missingStart=await f.call('matches',{consent:true});
 assert.equal(missingStatus.status,503);assert.deepEqual(await missingStatus.json(),{enabled:false,error:'ranked_dataset_unavailable'});
 assert.equal(missingStart.status,503);assert.deepEqual(await missingStart.json(),{error:'ranked_dataset_unavailable'});
}));

test('prototype names are not offered ranked actions and never finalize a match',withFixture(async f=>{
 const {match}=await (await f.call('matches',{consent:true})).json();
 for(const action of ['constructor','toString','__proto__','hasOwnProperty']) {
  assert.throws(()=>gradeRanked(match.questions,Array(20).fill(action)),/invalid_action/);
  const response=await f.call(`matches/${match.id}/finish`,{actions:Array(20).fill(action)});
  assert.equal(response.status,400,action);
  assert.equal((await response.json()).error,'invalid_action');
 }
 assert.equal(f.sqlite.prepare('SELECT status FROM ranked_matches WHERE id=?').get(match.id).status,'active');
 assert.equal(f.sqlite.prepare('SELECT matches FROM ranked_players').get().matches,0);
}));

test('other accounts and expired sessions cannot read or submit a reserved match',withFixture(async f=>{
 const {match}=await (await f.call('matches',{consent:true})).json();
 const actions=match.questions.map(q=>Object.keys(q.mix)[0]);
 const otherToken='b'.repeat(64);
 f.sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('other','other-google','other@example.invalid',0);
 f.sqlite.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(await digest(otherToken),'other',Date.now()/1000+3600);
 const otherHeaders={cookie:`__Host-reysonai=${otherToken}`};
 const profile=await (await f.call('profile',undefined,otherHeaders)).json();
 assert.equal(profile.state.active,null);
 assert.equal(profile.state.totalMatches,0);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions},otherHeaders)).status,404);
 f.sqlite.prepare('UPDATE account_sessions SET expires_at=0 WHERE user_id=?').run('user');
 assert.equal((await f.call('profile')).status,401);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions})).status,401);
 assert.equal(f.sqlite.prepare('SELECT status FROM ranked_matches WHERE id=?').get(match.id).status,'active');
}));

test('expired matches cannot update ratings and malformed submissions cannot finish',withFixture(async f=>{
 const {match}=await (await f.call('matches',{consent:true})).json();
 const actions=match.questions.map(q=>Object.keys(q.mix)[0]);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions},{'content-type':'text/plain'})).status,403);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions:Array(20).fill('x'.repeat(1000))})).status,400);
 f.sqlite.prepare('UPDATE ranked_matches SET expires_at=0 WHERE id=?').run(match.id);
 assert.equal((await f.call(`matches/${match.id}/finish`,{actions})).status,409);
 assert.equal(f.sqlite.prepare('SELECT matches FROM ranked_players').get().matches,0);
}));

// Exercise the actual Worker entry point: routeRanked alone cannot detect a
// browser rejecting cookie-authenticated responses because of missing CORS.
const appOrigin = 'https://app.reysonai.com';
function assertRankedCors(response) {
 assert.equal(response.headers.get('access-control-allow-origin'),appOrigin);
 assert.equal(response.headers.get('access-control-allow-credentials'),'true');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('vary'),/Origin/);
}
function browserRequest(path,body,headers={}) {
 return new Request(`https://api.reysonai.com/v1/ranked/${path}`,{
  credentials:'include',headers:{origin:appOrigin,cookie:`__Host-reysonai=${token}`,...(body===undefined?{}:{'content-type':'application/json'}),...headers},
  ...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})
 });
}
test('browser cookie transport covers ranked profile, preflight, start, finish and leaderboard',withFixture(async f=>{
 const preflight=await worker.fetch(new Request('https://api.reysonai.com/v1/ranked/matches',{method:'OPTIONS',headers:{origin:appOrigin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}}),f.env);
 assert.equal(preflight.status,204);assertRankedCors(preflight);
 assert.match(preflight.headers.get('access-control-allow-methods'),/POST/);
 assert.match(preflight.headers.get('access-control-allow-headers'),/content-type/);
 const call=async(path,body)=>{const response=await worker.fetch(browserRequest(path,body),f.env);assertRankedCors(response);assert.equal(response.status,200);return response.json();};
 assert.equal((await call('status')).enabled,true);
 const profile=await call('profile');assert.equal(profile.enabled,true);assert.equal(profile.state.remaining,3);
 const {match}=await call('matches',{consent:true});assert.equal(match.questions.length,20);
 const actions=match.questions.map(q=>Object.keys(q.mix).sort((a,b)=>q.mix[b]-q.mix[a])[0]);
 const completed=await call(`matches/${match.id}/finish`,{actions});
 assert.equal(completed.state.totalMatches,1);assert.equal(completed.state.remaining,2);assert.equal(completed.state.active,null);
 const board=await call('leaderboard?period=all');assert.equal(board.rows[0].self,true);
 assert.equal(board.rows[0].matches,1);assert.equal(JSON.stringify(board).includes('private@example.invalid'),false);
}));
test('ranked authentication, validation, quota and unavailable errors remain readable to the allowed browser',withFixture(async f=>{
 const assertError=async(request,status)=>{const response=await worker.fetch(request,f.env);assert.equal(response.status,status);assertRankedCors(response);};
 await assertError(browserRequest('profile',undefined,{cookie:''}),401);
 await assertError(browserRequest('matches',{}),400);
 for(let i=0;i<3;i++){await f.call('matches',{consent:true});f.sqlite.prepare("UPDATE ranked_matches SET expires_at=0 WHERE status='active'").run();}
 await assertError(browserRequest('matches',{consent:true}),429);
 f.env.RANKED_ENABLED='false';await assertError(browserRequest('status'),503);
 f.env.RANKED_ENABLED='true';f.env.DB={prepare(){throw new Error('test unavailable');}};
 await assertError(browserRequest('leaderboard'),500);
}));
test('ranked CORS never grants credentials to an unknown, missing, null or wildcard origin',withFixture(async f=>{
 for(const allowed of [appOrigin,'*',`${appOrigin},*`]) for(const origin of ['https://evil.invalid','null',null]) for(const method of ['GET','OPTIONS']) {
  const response=await worker.fetch(new Request('https://api.reysonai.com/v1/ranked/profile',{method,headers:origin?{origin}:{}}),{...f.env,ALLOWED_ORIGIN:allowed});
  assert.equal(response.headers.get('access-control-allow-origin'),null,`${allowed} / ${origin} / ${method}`);
  assert.equal(response.headers.get('access-control-allow-credentials'),null);
 }
 for(const allowed of ['*','']) {
  const response=await worker.fetch(browserRequest('status'),{...f.env,ALLOWED_ORIGIN:allowed});
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal(response.headers.get('access-control-allow-credentials'),null);
 }
}));
