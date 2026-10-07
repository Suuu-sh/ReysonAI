import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.ts';
import { digest } from '../src/account.ts';
import { routeFastFold, newHand, publicHand, agentFor, actionStats, departureResult } from '../src/fastfold.ts';
import { fastfoldRating } from '../src/fastfold-rating.ts';
import { playHand } from '../../frontend/src/agent/hand.ts';
import { preflopOptions, startPreflop } from '../../frontend/src/agent/preflop.ts';
import { createPostflopSpots } from '../../frontend/scripts/postflop-ai/spots-core.ts';
import { buildInputs, sha } from '../../frontend/scripts/postflop-ai/browser-inputs.ts';
import { referencePolicyFor } from '../../frontend/scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy } from '../../frontend/scripts/postflop-ai/later-policy.ts';
import { POSTFLOP_SPOTS } from '../../frontend/scripts/postflop-ai/spots.ts';
const BASE=['opening-ranges','preflop-ranges','three-bet-responses','four-bet-responses','five-bet-responses','limp-responses','limp-deep-responses','multiway-responses','squeeze-responses','cold-three-bet-responses'];
const bundle=Object.fromEntries(BASE.map(name=>[name,JSON.parse(readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url)))]));
const origin='http://localhost:5173', endpoint='http://localhost:8787/v1/fastfold/';
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_postflop.sql','0003_preflop.sql','0007_accounts.sql','0010_fastfold.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 let queryCount=0;
 const db={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async all(){queryCount++;return {results:sqlite.prepare(sql).all(...args)}}}}};
 const allNames=[...BASE,...['nit','station','lag','maniac'].flatMap(type=>BASE.slice(0,7).map(n=>`profiles/${type}/villain/${n}`))];
 for(const name of allNames){const body=readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url),'utf8');sqlite.prepare('INSERT INTO preflop_datasets VALUES (?,?,?,1)').run(name,await digest(body),Buffer.byteLength(body));sqlite.prepare('INSERT INTO preflop_dataset_parts VALUES (?,0,?)').run(name,body);}
 const a='a'.repeat(64),b='b'.repeat(64);
 for(const [id,token] of [['A',a],['B',b]]){sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run(id,id,`${id}@invalid`,Date.now());sqlite.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(await digest(token),id,Math.floor(Date.now()/1000)+3600);}
 const env={DB:db,FASTFOLD_ENABLED:'true',AUTH_ENABLED:'true',AUTH_LOCAL_DEV:'true',AUTH_APP_URL:origin,ALLOWED_ORIGIN:origin,GOOGLE_REDIRECT_URI:'http://localhost:8787/v1/account/google/callback',AUTH_RATE_LIMIT_KEY:'ephemeral-test-only'};
 env.FASTFOLD_RUNTIME={getByName(){return {handle:request=>routeFastFold(request,env)}}};
 const call=async(path,body,user=a,extra={})=>{const before=queryCount;const response=await worker.fetch(new Request(endpoint+path,{headers:{cookie:`reysonai-dev-session=${user}`,origin,...(body===undefined?{}:{'content-type':'application/json'}),...extra},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})}),env);assert.ok(queryCount-before<=50,`D1 budget for ${path}: ${queryCount-before}`);return response;};
 return {sqlite,env,call,a,b,get queryCount(){return queryCount},close(){sqlite.close()}};
}
async function read(response,status=200){const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
const command=s=>({sessionId:s.id,version:s.version,actionId:crypto.randomUUID(),action:s.hand.pending.options.some(o=>o.key==='fold')?'fold':s.hand.pending.options[0].key});
test('disabled/schema/data readiness fail closed and exact local account session required',async()=>{
 const f=await fixture();try{
 await read(await routeFastFold(new Request(endpoint+'status'),{...f.env,FASTFOLD_ENABLED:undefined}),503);
 const statusResponse=await f.call('status');assert.equal(statusResponse.headers.get('access-control-allow-origin'),origin);assert.equal(statusResponse.headers.get('access-control-allow-credentials'),'true');await read(statusResponse);
 const options=await worker.fetch(new Request(endpoint+'action',{method:'OPTIONS',headers:{origin}}),f.env);assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-credentials'),'true');
 const denied=await worker.fetch(new Request(endpoint+'profile',{headers:{origin:'https://evil.invalid'}}),f.env);assert.equal(denied.headers.get('access-control-allow-credentials'),null);assert.equal(denied.headers.get('access-control-allow-origin'),null);
 await read(await f.call('profile',undefined,''),401);
 await read(await f.call('profile',undefined,'a'.repeat(64),{cookie:`__Host-reysonai=${f.a}`}),401);
 await read(await f.call('start',{consent:true},f.a,{origin:'https://evil.invalid'}),403);
 f.sqlite.exec('DROP TRIGGER fastfold_settle');await read(await f.call('status'),503);
 }finally{f.close()}
});
test('authenticated continuous Fold, blind losses, retries/concurrency, owner isolation, pause/resume and illegal actions',async()=>{
 const f=await fixture();try{
 let current=await read(await f.call('start',{consent:true}));let s=current.session;
 assert.equal(s.hand.hero,'UTG');assert.deepEqual(Object.keys(s.hand.holeCards),['UTG']);assert.equal(s.hand.board.length,0);
 const forbidden=/"(?:seed|hole|draws|hashes|private_json|receipt)"/;assert.equal(forbidden.test(JSON.stringify(current)),false);
 const illegal={...command(s),action:'all_in'};await read(await f.call('action',illegal),400);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_actions').get().n,0);
 await read(await f.call('action',{...command(s),rating:9999}),400);
 await read(await f.call('action',command(s),f.b),404);
 const paused=await read(await f.call('pause',{sessionId:s.id,version:s.version}));
 await read(await f.call('action',command(paused.session)),409);const resumed=await read(await f.call('start',{consent:true}));
 assert.equal(resumed.session.hand.id,s.hand.id);assert.deepEqual(resumed.session.hand.holeCards,s.hand.holeCards);s=resumed.session;
 const cmd=command(s),results=await Promise.all([f.call('action',cmd),f.call('action',cmd)]);for(const response of results)await read(response);
 const before=f.sqlite.prepare('SELECT hands FROM fastfold_players WHERE user_id=?').get('A').hands;
 const retry=await read(await f.call('action',cmd));assert.equal(retry.lastResult.netBb,0);assert.equal(retry.lastResult.shadow.appliedPenalty,0);assert.equal(retry.lastResult.shadow.observations.length,1);assert.equal(retry.lastResult.shadow.observations[0].heroCards.length,2);assert.equal(retry.lastResult.shadow.observations[0].board.length,0);
 assert.equal(f.sqlite.prepare('SELECT hands FROM fastfold_players WHERE user_id=?').get('A').hands,before);
 await read(await f.call('action',{...cmd,action:'call'}),409);
 s=retry.session;
 for(let i=0;i<26;i++){current=await read(await f.call('action',command(s)));s=current.session;}
 const profile=await read(await f.call('profile'));assert.ok(profile.state.hands>20);assert.ok(profile.state.recent.some(r=>r.hero==='SB'&&r.netBb===-.5));assert.ok(profile.state.recent.some(r=>r.hero==='BB'&&r.netBb===-1));
 assert.equal(profile.state.recent.some(r=>r.shadow.appliedPenalty!==0),false);assert.ok(profile.state.rating<=4000);
 assert.equal((await read(await f.call('profile',undefined,f.b))).state.hands,0);
 const saved=JSON.parse(f.sqlite.prepare('SELECT private_json FROM fastfold_sessions WHERE user_id=?').get('A').private_json);assert.ok(saved.hand.draws.length===128);assert.equal(JSON.stringify(profile).includes(JSON.stringify(saved.hand.board)),false);
 const refreshed=JSON.stringify({...bundle['opening-ranges'],qaRefresh:true}),hash=await digest(refreshed);f.sqlite.prepare('UPDATE preflop_dataset_parts SET body=? WHERE name=?').run(refreshed,'opening-ranges');f.sqlite.prepare('UPDATE preflop_datasets SET content_hash=?,bytes=? WHERE name=?').run(hash,Buffer.byteLength(refreshed),'opening-ranges');await read(await f.call('profile'));await read(await f.call('action',command(s)));assert.equal(JSON.parse(f.sqlite.prepare('SELECT private_json FROM fastfold_sessions WHERE user_id=?').get('A').private_json).hashes['opening-ranges'],hash);
 }finally{f.close()}
});
test('settlement failure rolls back hand, receipt and aggregate as one statement',async()=>{
 const f=await fixture();try{
 const started=await read(await f.call('start',{consent:true})),s=started.session,cmd=command(s);
 f.sqlite.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON fastfold_results BEGIN SELECT RAISE(ABORT,'injected_failure'); END");
 await read(await f.call('action',cmd),503);
 assert.equal(f.sqlite.prepare('SELECT version FROM fastfold_sessions').get().version,s.version);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_actions').get().n,0);
 assert.equal(f.sqlite.prepare('SELECT hands FROM fastfold_players').get().hands,0);
 f.sqlite.exec('DROP TRIGGER injected_failure');await read(await f.call('action',cmd));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_actions').get().n,1);
 }finally{f.close()}
});
test('readiness detects truncated delivery; start rejects same-sized hash tampering',async()=>{
 const f=await fixture();try{
 f.sqlite.prepare('DELETE FROM preflop_dataset_parts WHERE name=?').run('profiles/nit/villain/opening-ranges');
 const readiness=await read(await f.call('status'),503);assert.equal(readiness.error,'fastfold_dataset_unavailable');
 }finally{f.close()}
 const g=await fixture();try{
 const old=g.sqlite.prepare('SELECT body FROM preflop_dataset_parts WHERE name=?').get('opening-ranges').body;
 // Same UTF-8 length, valid JSON, but not the published SHA256.
 g.sqlite.prepare('UPDATE preflop_dataset_parts SET body=? WHERE name=?').run(old.replace('UTG_open','UTO_open'),'opening-ranges');
 const rejected=await read(await g.call('start',{consent:true}),503);assert.equal(rejected.error,'fastfold_dataset_hash_mismatch');
 assert.equal(g.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_sessions').get().n,0);
 }finally{g.close()}
});
test('authenticated pinned postflop plays legal flop/turn/river to 5-card showdown without leaks',async()=>{
 const f=await fixture();try{
 const inputs=buildInputs('BTN_open_BB_call',bundle),flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
 const candidate={policy:flop,metadata:{source_hash:inputs.fingerprint,policy_hash:sha(flop)}};
 const laterCandidate={policy:later,metadata:{source_hash:inputs.fingerprint,flop_policy_hash:sha(flop),policy_hash:sha(later)}};
 for(const [stage,c] of [['flop',candidate],['later',laterCandidate]])f.sqlite.prepare('INSERT INTO postflop_policies VALUES (?,?,?,?,?)').run('BTN_open_BB_call',stage,c.metadata.policy_hash,JSON.stringify(c.metadata),JSON.stringify(c));
 const started=await read(await f.call('start',{consent:true}));
 const privateState=JSON.parse(f.sqlite.prepare('SELECT private_json FROM fastfold_sessions').get().private_json);
 privateState.hand={...privateState.hand,number:6,hero:'BB',type:'balanced',hole:{UTG:[0,5],HJ:[8,13],CO:[16,21],BTN:[48,44],SB:[24,29],BB:[36,40]},board:[37,41,12,15,27],draws:Array(128).fill(0),actions:[]};
 privateState.hand.draws[3]=.99;
 // Reuse the genuine balanced immutable input versions already present in the session.
 const hashes=Object.fromEntries(Object.entries(privateState.hashes).filter(([name])=>!name.startsWith('profiles/')));privateState.hashes=hashes;
 f.sqlite.prepare('UPDATE fastfold_sessions SET private_json=? WHERE id=?').run(JSON.stringify(privateState),started.session.id);
 let current=await read(await f.call('profile')),s=current.state.active;const seen=new Set();let done;
 for(let step=0;step<12;step++){
  const pending=s.hand.pending;assert.ok(pending);seen.add(pending.street);
  assert.equal(s.hand.board.length,{preflop:0,flop:3,turn:4,river:5}[pending.street]);
  assert.deepEqual(Object.keys(s.hand.holeCards),['BB']);assert.equal(s.hand.policyMissing,false);
  const action=pending.options.find(o=>o.key==='call')?.key??pending.options.find(o=>o.key==='check')?.key;assert.ok(action);
  const beforeQueries=f.queryCount;current=await read(await f.call('action',{sessionId:s.id,version:s.version,actionId:crypto.randomUUID(),action}));
  assert.ok(f.queryCount-beforeQueries<=40,`D1 query budget exceeded: ${f.queryCount-beforeQueries}`);
  if(current.lastResult){done=current.lastResult;break;}
  s=current.session;
  if(pending.street==='preflop'){
   // A published policy update must not alter this hand's already pinned candidate.
   f.sqlite.prepare("UPDATE postflop_policies SET policy_json='{}' WHERE spot_id=?").run('BTN_open_BB_call');
  }
 }
 assert.deepEqual([...seen],['preflop','flop','turn','river']);assert.ok(done?.showdown);assert.equal(done.board.length,5);
 assert.deepEqual(Object.keys(done.holeCards).sort(),['BB','BTN']);assert.ok(Number.isFinite(done.netBb));
 assert.equal(done.shadow.appliedPenalty,0);assert.equal(done.shadow.observations.length,4);
 assert.ok(done.log.some(e=>e.street==='river'));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_results WHERE id=?').get(done.id).n,1);
 }finally{f.close()}
});
test('authenticated aggressive flop, capped wagers, instant facing fold and one settlement',async()=>{
 for(const mode of ['fold','raise']){
 const f=await fixture();try{
 const inputs=buildInputs('BTN_open_BB_call',bundle),flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
 for(const [stage,policy,metadata] of [['flop',flop,{source_hash:inputs.fingerprint,policy_hash:sha(flop)}],['later',later,{source_hash:inputs.fingerprint,flop_policy_hash:sha(flop),policy_hash:sha(later)}]])f.sqlite.prepare('INSERT INTO postflop_policies VALUES (?,?,?,?,?)').run('BTN_open_BB_call',stage,metadata.policy_hash,JSON.stringify(metadata),JSON.stringify({policy,metadata}));
 const started=await read(await f.call('start',{consent:true}));const saved=JSON.parse(f.sqlite.prepare('SELECT private_json FROM fastfold_sessions').get().private_json);
 saved.hand={...saved.hand,number:6,hero:'BB',type:'balanced',hole:{UTG:[0,5],HJ:[8,13],CO:[16,21],BTN:[48,44],SB:[24,29],BB:[36,40]},board:[37,41,12,15,27],draws:Array(128).fill(.99),actions:[]};saved.hand.draws[0]=saved.hand.draws[1]=saved.hand.draws[2]=saved.hand.draws[4]=0;saved.hashes=Object.fromEntries(Object.entries(saved.hashes).filter(([n])=>!n.startsWith('profiles/')));
 f.sqlite.prepare('UPDATE fastfold_sessions SET private_json=?').run(JSON.stringify(saved));let s=(await read(await f.call('profile'))).state.active;let facing=false,result,lastCmd;
 for(let step=0;step<12;step++){
  const p=s.hand.pending;assert.deepEqual(Object.keys(s.hand.holeCards),['BB']);for(const o of p.options)assert.ok(o.to===undefined||o.to<=100);
  let action=p.options.find(o=>o.key==='call')?.key??'check';
  if(p.street==='flop'&&(p.toCall??0)>0&&!facing){facing=true;action=mode;assert.ok(p.options.some(o=>o.key===action));}
  lastCmd={sessionId:s.id,version:s.version,actionId:crypto.randomUUID(),action};const response=await read(await f.call('action',lastCmd));if(response.lastResult){result=response.lastResult;break}s=response.session;
 }
 assert.ok(facing);assert.ok(result);assert.ok(Number.isFinite(result.netBb));assert.equal(result.shadow.appliedPenalty,0);
 if(mode==='fold'){assert.equal(result.netBb,-2.5);assert.equal(result.showdown,false);assert.equal(result.board.length,3);assert.deepEqual(Object.keys(result.holeCards),['BB'])}
 else {assert.equal(result.showdown,true);assert.equal(result.board.length,5);assert.ok(result.log.some(e=>e.action==='raise'))}
 const count=f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_results WHERE id=?').get(result.id).n;assert.equal(count,1);const retry=await read(await f.call('action',lastCmd));assert.equal(retry.lastResult.id,result.id);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_results WHERE id=?').get(result.id).n,1);
 }finally{f.close()}}
});
test('crypto deal has distinct cards, pure spot extraction preserves geometry, applied profile uses authored frequencies',()=>{
 for(let i=0;i<100;i++){const h=newHand(i+1);assert.equal(new Set([...Object.values(h.hole).flat(),...h.board]).size,17)}
 const multiway=JSON.parse(readFileSync(new URL('../../frontend/scripts/data/hu-after-multiway-spots.json',import.meta.url)));
 assert.deepEqual(createPostflopSpots({...bundle,'hu-after-multiway-spots':multiway}).POSTFLOP_SPOTS,POSTFLOP_SPOTS);
 assert.equal(createPostflopSpots({opening:bundle['opening-ranges'],responses:bundle['preflop-ranges']}).spotById('BTN_open_BB_call').id,'BTN_open_BB_call');
 const name='profiles/nit/villain/opening-ranges',profile=JSON.parse(readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url)));
 const agent=agentFor('nit',{...bundle,[name]:profile}),offered=preflopOptions(startPreflop(),'UTG','T8s',n=>bundle[n]);
 const decision=agent.preflop({pos:'UTG',hand:'T8s',cards:[],offered,random:.99});
 assert.equal(decision.source,'profile');assert.equal(decision.mix.open,profile.spots.find(s=>s.id==='UTG_open').hands.find(r=>r.hand==='T8s').open);
});
test('server-predealt replay never uses seed and Fold stops without future runout or opponent cards',()=>{
 const h=newHand(1),setup={seed:'same',human:h.hero,agents:agentFor('balanced',bundle),datasets:n=>bundle[n],dealt:{hole:h.hole,board:h.board},draw:i=>h.draws[i],fastFold:true,postflop:()=>null};
 const initial=playHand(setup),changed=playHand({...setup,seed:'different'});assert.deepEqual(initial,changed);
 const folded=playHand({...setup,humanActions:['fold']});assert.equal(folded.status,'done');assert.equal(Math.abs(folded.returns.UTG),0);assert.equal(folded.board.length,0);assert.equal(folded.log.length,1);
 assert.deepEqual(Object.keys(publicHand(h,folded).holeCards),['UTG']);
});
test('rating rewards outcome evidence, not hand volume; sparse hands small and neutral unchanged',()=>{
 for(const n of [0,1,20,100,100000])assert.equal(fastfoldRating(n,0,n*100),1000);
 assert.ok(Math.abs(fastfoldRating(1,10,10000)-1000)<=4);
 assert.ok(fastfoldRating(200,300,10000)>1000);assert.ok(fastfoldRating(200,-300,10000)<1000);
 const stats=actionStats([{hero:'UTG',log:[{street:'preflop',pos:'UTG',action:'open',pot:4},{street:'preflop',pos:'BB',action:'three_bet',pot:14},{street:'preflop',pos:'UTG',action:'fold',pot:14}]}]);
 assert.equal(stats.foldToThreeBet.percent,100);assert.equal(stats.vpip.percent,100);assert.equal(stats.threeBet.percent,null);
});

test('fixed server break survives retry/reload and expires once without account logout or hand discard',async()=>{
 const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
 const f=await fixture();try{
  let s=(await read(await f.call('start',{consent:true}))).session;
  const request={sessionId:s.id,version:s.version,actionId:crypto.randomUUID()};
  const first=await read(await f.call('break',request));
  assert.equal(first.serverNow,clock);assert.equal(first.session.breakExpiresAt,clock+900000);
  const deadline=first.session.breakExpiresAt,hand=s.hand.id,cards=s.hand.holeCards;
  clock+=60000;
  const retry=await read(await f.call('break',request));assert.equal(retry.session.breakExpiresAt,deadline);assert.equal(retry.session.version,first.session.version);
  const duplicate=await read(await f.call('break',{sessionId:s.id,version:first.session.version,actionId:crypto.randomUUID()}));assert.equal(duplicate.session.breakExpiresAt,deadline);
  await read(await f.call('break',request,f.b),404);
  const refreshed=await read(await f.call('profile'));assert.equal(refreshed.state.active.breakExpiresAt,deadline);assert.deepEqual(refreshed.state.active.hand.holeCards,cards);
  const resumed=await read(await f.call('resume',{sessionId:s.id,version:first.session.version}));assert.equal(resumed.session.hand.id,hand);assert.equal(resumed.session.breakExpiresAt,undefined);
  s=resumed.session;
  const again=await read(await f.call('break',{sessionId:s.id,version:s.version,actionId:crypto.randomUUID()}));
  const beforeCount=f.sqlite.prepare('SELECT hands FROM fastfold_players WHERE user_id=?').get('A').hands;
  clock=again.session.breakExpiresAt;
  const outcomes=await Promise.all([f.call('profile'),f.call('resume',{sessionId:s.id,version:again.session.version}),f.call('action',command(s))]);
  assert.equal(outcomes[0].status,200);for(const response of outcomes.slice(1)){const body=await read(response,409);assert.equal(body.error,'break_expired');}
  const expired=await outcomes[0].json();assert.equal(expired.state.active,null);assert.equal(expired.state.hands,beforeCount+1);assert.equal(expired.state.recent[0].termination,'expired');assert.equal(expired.state.recent[0].netBb,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM fastfold_results WHERE id=?').get(hand).n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,2);
  await read(await f.call('profile'));assert.equal(f.sqlite.prepare('SELECT hands FROM fastfold_players WHERE user_id=?').get('A').hands,beforeCount+1);
  const fresh=await read(await f.call('start',{consent:true}));assert.notEqual(fresh.session.hand.id,hand);assert.ok(fresh.session.version>again.session.version);
  const oldRetry=await read(await f.call('break',request));assert.equal(oldRetry.session.hand.id,fresh.session.hand.id);assert.equal(oldRetry.session.breakExpiresAt,undefined);
  assert.equal(/"(?:seed|draws|hashes|private_json|receipt)"/.test(JSON.stringify(expired)),false);
  const bs=(await read(await f.call('start',{consent:true},f.b))).session;
  const bb=await read(await f.call('break',{sessionId:bs.id,version:bs.version,actionId:crypto.randomUUID()},f.b));clock=bb.session.breakExpiresAt;
  const newB=await read(await f.call('start',{consent:true},f.b));assert.equal(newB.state.hands,1);assert.equal(newB.state.recent[0].termination,'expired');assert.notEqual(newB.session.hand.id,bs.hand.id);
 }finally{Date.now=realNow;f.close()}
});
test('explicit server exit retries settle blind loss once; failed exit rolls back; legacy pause remains resumable',async()=>{
 const f=await fixture();try{
  let s=(await read(await f.call('start',{consent:true}))).session;
  for(let i=0;i<4;i++)s=(await read(await f.call('action',command(s)))).session;
  assert.equal(s.hand.hero,'SB');
  const paused=await read(await f.call('pause',{sessionId:s.id,version:s.version}));assert.equal(paused.session.breakExpiresAt,undefined);
  s=(await read(await f.call('start',{consent:true}))).session;assert.equal(s.hand.id,paused.session.hand.id);
  const leave={sessionId:s.id,version:s.version,actionId:crypto.randomUUID()};
  await read(await f.call('leave',leave,f.b),404);
  f.sqlite.exec("CREATE TRIGGER injected_exit_failure BEFORE INSERT ON fastfold_results BEGIN SELECT RAISE(ABORT,'injected_failure'); END");
  await read(await f.call('leave',leave),503);assert.equal(f.sqlite.prepare('SELECT version FROM fastfold_sessions').get().version,s.version);
  f.sqlite.exec('DROP TRIGGER injected_exit_failure');
  const first=await read(await f.call('leave',leave)),before=first.state.hands;assert.equal(first.session,null);assert.equal(first.state.active,null);assert.equal(first.lastResult.netBb,-.5);assert.equal(first.lastResult.termination,'exit');assert.deepEqual(Object.keys(first.lastResult.holeCards),['SB']);
  const retry=await read(await f.call('leave',leave));assert.equal(retry.state.hands,before);assert.equal(retry.lastResult.id,first.lastResult.id);
  await read(await f.call('leave',{...leave,version:leave.version+1}),409);
  const fresh=await read(await f.call('start',{consent:true}));assert.notEqual(fresh.session.hand.id,s.hand.id);
  const delayed=await read(await f.call('leave',leave));assert.equal(delayed.session.hand.id,fresh.session.hand.id);assert.equal(delayed.state.hands,before);
 }finally{f.close()}
});
test('departure refunds uncalled wager and sums each latest street without double blinds or hidden showdown',()=>{
 const hand={...newHand(6),hero:'BB'};
 const before={status:'awaiting',holeCards:{BB:['As','Kh'],BTN:['Qs','Qh']},board:['2s','3h','4c','8d'],log:[
 {street:'preflop',pos:'BTN',action:'open',bets:{SB:.5,BB:1,BTN:3}},
 {street:'preflop',pos:'BB',action:'call',bets:{SB:.5,BB:3,BTN:3}},
 {street:'flop',pos:'BB',action:'bet50',bets:{BB:5,BTN:0}},
 {street:'flop',pos:'BTN',action:'call',bets:{BB:5,BTN:5}},
 {street:'turn',pos:'BB',action:'bet50',bets:{BB:12,BTN:0}},
 {street:'turn',pos:'BTN',action:'allin',bets:{BB:12,BTN:7}}
 ],pending:{street:'turn',pos:'BB',pot:30,options:[{key:'check'}],board:['2s','3h','4c','8d']}};
 const result=departureResult(hand,before);assert.equal(result.returns.BB,-15);assert.equal(result.showdown,false);assert.equal(result.board.length,4);assert.deepEqual(Object.keys(publicHand(hand,result).holeCards),['BB']);
});

test('slow break resume stream cannot carry a pre-deadline clock past expiry',async()=>{
 const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
 const f=await fixture();try{
  const s=(await read(await f.call('start',{consent:true}))).session;
  const paused=(await read(await f.call('break',{sessionId:s.id,version:s.version,actionId:crypto.randomUUID()}))).session;
  const text=JSON.stringify({sessionId:s.id,version:paused.version});
  const body=new ReadableStream({pull(controller){clock=paused.breakExpiresAt;controller.enqueue(new TextEncoder().encode(text));controller.close();}},{highWaterMark:0});
  const response=await worker.fetch(new Request(endpoint+'resume',{method:'POST',headers:{cookie:`reysonai-dev-session=${f.a}`,origin,'content-type':'application/json'},body,duplex:'half'}),f.env);
  const result=await read(response,409);assert.equal(result.error,'break_expired');
  assert.equal(f.sqlite.prepare('SELECT hands FROM fastfold_players WHERE user_id=?').get('A').hands,1);
 }finally{Date.now=realNow;f.close()}
});
