import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { routeRanked, gradeRanked, questionPool } from '../src/ranked.ts';
import { digest } from '../src/account.ts';
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
 f.sqlite.prepare('DELETE FROM preflop_dataset_parts').run();assert.equal((await f.call('matches',{consent:true})).status,503);assert.equal((await f.call('status')).status,503);
 assert.throws(()=>questionPool({spots:[{id:'bad',hands:[{hand:'AKs',fold:NaN,open:100}]}]},'open'));
 const questions=Array.from({length:20},()=>({mix:{fold:.8,open:.2}}));assert.equal(gradeRanked(questions,Array(20).fill('open'))[0].score,.5);
}));
