import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.ts';
import {allowedData,digest,routeAccount,verifyGoogleToken} from '../src/account.ts';
import * as accountSession from '../../frontend/src/account/session.ts';
import {saveAgentHand} from '../../frontend/src/agent/agent-stats.ts';
const env={AUTH_ENABLED:'true',DB:{},GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-only',GOOGLE_REDIRECT_URI:'https://api.reysonai.com/v1/account/google/callback',AUTH_APP_URL:'https://app.reysonai.com',AUTH_RATE_LIMIT_KEY:'test-only',ALLOWED_ORIGIN:'https://app.reysonai.com'};
function accountStore(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0007_accounts.sql',import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}};
 return {sqlite,db};
}
test('disabled/origin/method gates and exact credentialed CORS',async()=>{
 assert.equal((await routeAccount(new Request('https://api.reysonai.com/v1/account/session'),{})).status,503);
 for(const origin of [undefined,'https://evil.invalid']) {
  assert.equal((await routeAccount(new Request('https://api.reysonai.com/v1/account/google/start',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:'{}'}),env)).status,403);
 }
 assert.equal((await routeAccount(new Request('https://api.reysonai.com/v1/account/google/start'),env)).status,404);
 const res=await worker.fetch(new Request('https://api.reysonai.com/v1/account/google/start',{method:'OPTIONS',headers:{origin:env.ALLOWED_ORIGIN}}),env);
 assert.equal(res.headers.get('access-control-allow-credentials'),'true');
 const wildcard=await worker.fetch(new Request('https://api.reysonai.com/v1/account/google/start',{method:'OPTIONS',headers:{origin:'https://evil.invalid'}}),{...env,ALLOWED_ORIGIN:'*'});
 assert.equal(wildcard.headers.get('access-control-allow-origin'),null);
});
test('snapshot allowlist includes Agent stats and excludes arbitrary/rank keys',()=>{
 assert.ok(allowedData({'reysonai.trainer.review-sessions.v1':[],'reysonai:locale:v1':'en','reysonai:agent-hands:v1':[]}));
 for(const data of [null,[],{'reysonai.trainer.rank.v1':{}},{other:1}]) assert.equal(allowedData(data),false);
});
test('Google signed identity, PKCE/state replay, owned snapshots and logout',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0007_accounts.sql',import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}};
 const local={...env,DB:db};const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-google-key',alg:'RS256',use:'sig'};
 const b64=bytes=>Buffer.from(bytes).toString('base64url');
 const sign=async claims=>{const payload=`${b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))}.${b64(JSON.stringify(claims))}`;return `${payload}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(payload)))}`;};
 const oldFetch=globalThis.fetch;let currentClaims,tokenExchange,googleError=false;
 globalThis.fetch=async(url,options)=>{
  if(url==='https://www.googleapis.com/oauth2/v3/certs') return Response.json({keys:[jwk]});
  assert.equal(url,'https://oauth2.googleapis.com/token');tokenExchange=new URLSearchParams(options.body);
  if(googleError) return new Response('{}',{status:400});
  return Response.json({id_token:await sign(currentClaims)});
 };
 let sessionCookie='';
 const call=(path,body,cookies=sessionCookie)=>routeAccount(new Request(`https://api.reysonai.com/v1/account/${path}`,{headers:{origin:env.ALLOWED_ORIGIN,'content-type':'application/json',cookie:cookies},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})}),local);
 const start=async(sub='google-sub-1',email='learner@custom-domain.example')=>{
  const res=await call('google/start',{});assert.equal(res.status,200);
  const auth=new URL((await res.json()).url);assert.equal(auth.hostname,'accounts.google.com');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.has('hd'),false);
  const now=Math.floor(Date.now()/1000);currentClaims={iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,exp:now+3600,iat:now,sub,email,email_verified:true,nonce:auth.searchParams.get('nonce')};
  return {auth,stateCookie:res.headers.get('set-cookie').split(';')[0]};
 };
 const finish=({auth,stateCookie},cookies=stateCookie)=>call(`google/callback?state=${auth.searchParams.get('state')}&code=test-code`,undefined,cookies);
 try {
  const attempt=await start();const wrong=await finish(attempt,'');assert.ok(wrong.headers.get('location').endsWith('#account-error=google'));
  const logged=await finish(attempt);assert.ok(logged.headers.get('location').startsWith('https://app.reysonai.com/analyze/ranges#account-signed-in'));
  sessionCookie=logged.headers.getSetCookie().find(c=>c.startsWith('__Host-reysonai=')).split(';')[0];
  assert.ok(logged.headers.getSetCookie().some(c=>c.includes('HttpOnly; Secure; SameSite=Lax')));
  assert.equal(b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tokenExchange.get('code_verifier')))),attempt.auth.searchParams.get('code_challenge'));
  assert.equal(tokenExchange.get('redirect_uri'),env.GOOGLE_REDIRECT_URI);
  assert.ok((await finish(attempt)).headers.get('location').endsWith('#account-error=google'));
  const firstUser=(await (await call('session')).json()).user;assert.equal(firstUser.email,'learner@custom-domain.example');assert.equal(firstUser.verified,true);
  const missingOwner=await call('data',{data:{},version:0});assert.equal(missingOwner.status,409);assert.deepEqual(await missingOwner.json(),{error:'account_owner_changed'});
  assert.equal((await call('data',{data:{'reysonai.trainer.history.v1':[]},version:0,expectedOwner:firstUser.id,importLocal:true})).status,400);
  assert.equal((await call('data',{data:{'reysonai.trainer.history.v1':[]},version:0,expectedOwner:firstUser.id,importLocal:true,consent:true})).status,200);
  assert.equal((await call('data',{data:{},version:0,expectedOwner:firstUser.id})).status,409);
  assert.equal((await call('data',{data:{'reysonai.trainer.rank.v1':{}},version:1,expectedOwner:firstUser.id})).status,400);
  const other=await finish(await start('different-google-sub',firstUser.email));sessionCookie=other.headers.getSetCookie().find(c=>c.startsWith('__Host-reysonai=')).split(';')[0];
  const secondUser=(await (await call('session')).json()).user;assert.notEqual(firstUser.id,secondUser.id);assert.deepEqual((await (await call('data')).json()).data,{});assert.equal((await (await call('data')).json()).ownerId,secondUser.id);
  const profileA={'reysonai:profile:v1':{nickname:'A'},'reysonai:agent-hands:v1':[]},profileB={'reysonai:profile:v1':{nickname:'B'}};
  for(const [ownerId,profile] of [[firstUser.id,profileA],[secondUser.id,profileB]]) sqlite.prepare('INSERT INTO account_data(user_id,data_json,version) VALUES (?,?,2) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,version=excluded.version').run(ownerId,JSON.stringify(profile));
  const staleOwnerWrite=await call('data',{data:profileA,version:2,expectedOwner:firstUser.id});
  assert.equal(staleOwnerWrite.status,409);assert.deepEqual(await staleOwnerWrite.json(),{error:'account_owner_changed'});
  let ownerB=sqlite.prepare('SELECT data_json,version FROM account_data WHERE user_id=?').get(secondUser.id);
  assert.equal(ownerB.version,2);assert.deepEqual(JSON.parse(ownerB.data_json),profileB,'a stale tab cannot replace another cookie owner even at the same version');
  const currentOwnerWrite=await call('data',{data:{...profileB,'reysonai:appearance:v1':{cards:'two'}},version:2,expectedOwner:secondUser.id});
  assert.equal(currentOwnerWrite.status,200);ownerB=sqlite.prepare('SELECT data_json,version FROM account_data WHERE user_id=?').get(secondUser.id);
  assert.equal(ownerB.version,3);assert.equal(JSON.parse(ownerB.data_json)['reysonai:profile:v1'].nickname,'B');
  const nonceHash=await digest(currentClaims.nonce);
  for(const patch of [{aud:'another-client'},{iss:'https://evil.invalid'},{email_verified:false},{nonce:'wrong'},{exp:0},{azp:'different-client'},{iat:0}]) await assert.rejects(verifyGoogleToken(await sign({...currentClaims,...patch}),env.GOOGLE_CLIENT_ID,nonceHash,Math.floor(Date.now()/1000)));
  const bad=await sign(currentClaims);await assert.rejects(verifyGoogleToken(bad.slice(0,-4)+'AAAA',env.GOOGLE_CLIENT_ID,nonceHash,Math.floor(Date.now()/1000)));
  assert.equal((await call('logout',{})).status,200);assert.equal((await (await call('session')).json()).user,null);
  googleError=true;assert.ok((await finish(await start())).headers.get('location').endsWith('#account-error=google'));
 } finally {globalThis.fetch=oldFetch;sqlite.close();}
});

test('cross-tab account owner changes pause the 350ms Agent auto-save and preserve the old export',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0007_accounts.sql',import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}};
 const local={...env,DB:db},tokens={A:'a'.repeat(64),B:'b'.repeat(64)},now=Math.floor(Date.now()/1000);
 const hand={at:1,tableId:'account-A-private-practice',pos:'BTN',returnBb:1,vpip:true,pfr:true,threeBetOpp:false,threeBet:false,facedThreeBet:false,foldedToThreeBet:false,sawFlop:false,showdown:false,wonShowdown:false};
 for(const id of ['A','B']){
  sqlite.prepare('INSERT INTO account_users(id,google_sub,email,created_at) VALUES (?,?,?,?)').run(id,'synthetic-'+id,id+'@example.invalid',now);
  sqlite.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(await digest(tokens[id]),id,now+3600);
  sqlite.prepare('INSERT INTO account_data(user_id,data_json,version) VALUES (?,?,2)').run(id,JSON.stringify({'reysonai:profile:v1':{nickname:id},...(id==='A'?{'reysonai:agent-hands:v1':[hand]}:{})}));
 }
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch,guest=new Map();
 globalThis.window={localStorage:{getItem:key=>guest.get(key)??null,setItem:(key,value)=>guest.set(key,value),removeItem:key=>guest.delete(key)}};
 let cookieOwner='A',holdSession=false,releaseSession;const writes=[];
 globalThis.fetch=async(url,options={})=>{
  assert.ok(url.startsWith('https://api.reysonai.com/v1/account/'));
  const path=new URL(url).pathname.slice('/v1/account/'.length);
  if(path==='session'&&holdSession) await new Promise(resolve=>{releaseSession=resolve;});
  const headers=new Headers(options.headers);headers.set('origin',env.ALLOWED_ORIGIN);headers.set('cookie',`__Host-reysonai=${tokens[cookieOwner]}`);
  const response=await routeAccount(new Request(url,{...options,headers}),local);
  if(path==='data'&&options.method==='POST') writes.push({cookieOwner,body:JSON.parse(options.body),status:response.status});
  return response;
 };
 let rechecking;
 try{
  await accountSession.refreshAccount();assert.equal(accountSession.accountSnapshot().user.id,'A');
  cookieOwner='B';holdSession=true;rechecking=accountSession.revalidateAccountSession();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof releaseSession,'function','the focus identity check is held in flight');
  await assert.rejects(accountSession.accountRequest('data',{data:{'reysonai:profile:v1':{nickname:'A'}},version:2,expectedOwner:'A'}),/session/);
  assert.deepEqual(writes.map(write=>({owner:write.cookieOwner,expectedOwner:write.body.expectedOwner,status:write.status})),[{owner:'B',expectedOwner:'A',status:409}],
    'the backend rejects a stale-owner snapshot before changing B even when both versions match');
  saveAgentHand({...hand,at:3,tableId:'account-A-new-private-practice'});
  await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(writes.length,1,'the 350ms autosave waits for owner revalidation instead of posting during it');
  releaseSession();holdSession=false;await rechecking;await accountSession.saveAccountData();
  assert.equal(accountSession.accountSnapshot().error,'session');
  assert.equal(accountSession.accountSnapshot().user.id,'A');
  const exported=accountSession.exportAccountData().data;
  assert.equal(exported['reysonai:profile:v1'].nickname,'A');
  assert.deepEqual(exported['reysonai:agent-hands:v1'].map(row=>row.tableId),['account-A-private-practice','account-A-new-private-practice']);
  const ownerB=sqlite.prepare('SELECT data_json,version FROM account_data WHERE user_id=?').get('B');
  assert.equal(ownerB.version,2);assert.equal(JSON.parse(ownerB.data_json)['reysonai:profile:v1'].nickname,'B');
  assert.deepEqual(JSON.parse(ownerB.data_json)['reysonai:agent-hands:v1'],undefined);
 }finally{
  releaseSession?.();holdSession=false;
  if(rechecking) await rechecking.catch(()=>{});
  globalThis.window=previousWindow;globalThis.fetch=previousFetch;sqlite.close();
 }
});

test('a /session A then /data B race preserves A in memory and recovers through same-owner refresh',async()=>{
 const {sqlite,db}=accountStore();const local={...env,DB:db},tokens={A:'a'.repeat(64),B:'b'.repeat(64)},now=Math.floor(Date.now()/1000);
 const profiles={A:{'reysonai:profile:v1':{nickname:'A'},'reysonai.trainer.history.v1':[{hand:'A-private'}]},B:{'reysonai:profile:v1':{nickname:'B'},'reysonai.trainer.history.v1':[{hand:'B-private'}]}};
 for(const id of ['A','B']){
  sqlite.prepare('INSERT INTO account_users(id,google_sub,email,created_at) VALUES (?,?,?,?)').run(id,'race-'+id,id+'@example.invalid',now);
  sqlite.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(await digest(tokens[id]),id,now+3600);
  sqlite.prepare('INSERT INTO account_data(user_id,data_json,version) VALUES (?,?,4)').run(id,JSON.stringify(profiles[id]));
 }
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;globalThis.window={localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
 let cookieOwner='A',flipAfterSession=false;const writes=[];
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname.slice('/v1/account/'.length),headers=new Headers(options.headers);headers.set('origin',env.ALLOWED_ORIGIN);headers.set('cookie',`__Host-reysonai=${tokens[cookieOwner]}`);
  const response=await routeAccount(new Request(url,{...options,headers}),local);
  if(path==='session'&&flipAfterSession){flipAfterSession=false;cookieOwner='B';}
  if(path==='data'&&options.method==='POST')writes.push({owner:cookieOwner,body:JSON.parse(options.body),status:response.status});
  return response;
 };
 try{
  await accountSession.refreshAccount();assert.equal(accountSession.accountSnapshot().user.id,'A');
  assert.deepEqual(accountSession.exportAccountData().data,profiles.A);
  flipAfterSession=true;await accountSession.refreshAccount();
  assert.equal(accountSession.accountSnapshot().user.id,'A','the earlier session identity is not adopted after an owner mismatch');
  assert.equal(accountSession.accountSnapshot().error,'session');
  assert.deepEqual(accountSession.exportAccountData().data,profiles.A,'the B response cannot replace A memory or its export');
  assert.equal(writes.length,0,'a mismatched read never triggers an autosave');
  cookieOwner='A';await accountSession.refreshAccount();
  assert.equal(accountSession.accountSnapshot().error,'');assert.deepEqual(accountSession.exportAccountData().data,profiles.A);
  accountSession.accountStorage().setItem('reysonai:profile:v1',JSON.stringify({nickname:'A recovered'}));
  await accountSession.saveAccountData();
  assert.equal(writes.length,1);assert.equal(writes[0].owner,'A');assert.equal(writes[0].body.expectedOwner,'A');assert.equal(writes[0].status,200);
  const savedA=sqlite.prepare('SELECT data_json,version FROM account_data WHERE user_id=?').get('A'),savedB=sqlite.prepare('SELECT data_json,version FROM account_data WHERE user_id=?').get('B');
  assert.equal(savedA.version,5);assert.equal(JSON.parse(savedA.data_json)['reysonai:profile:v1'].nickname,'A recovered');
  assert.equal(savedB.version,4);assert.deepEqual(JSON.parse(savedB.data_json),profiles.B,'the other account remains unchanged');
 }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;sqlite.close();}
});

test('guest import preflights the exact owner-bound 500KB request and old-client recovery stays fail-closed',async()=>{
 const {sqlite,db}=accountStore();const local={...env,DB:db},token='c'.repeat(64),now=Math.floor(Date.now()/1000),owner='A';
 const initial={'reysonai:profile:v1':{nickname:'Account'}},initialVersion=2;
 sqlite.prepare('INSERT INTO account_users(id,google_sub,email,created_at) VALUES (?,?,?,?)').run(owner,'import-'+owner,'import@example.invalid',now);
 sqlite.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(await digest(token),owner,now+3600);
 sqlite.prepare('INSERT INTO account_data(user_id,data_json,version) VALUES (?,?,?)').run(owner,JSON.stringify(initial),initialVersion);
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch,guest=new Map();
 globalThis.window={localStorage:{getItem:key=>guest.get(key)??null,setItem:(key,value)=>guest.set(key,value),removeItem:key=>guest.delete(key)}};
 const writes=[];globalThis.fetch=async(url,options={})=>{
  const headers=new Headers(options.headers);headers.set('origin',env.ALLOWED_ORIGIN);headers.set('cookie',`__Host-reysonai=${token}`);
  const response=await routeAccount(new Request(url,{...options,headers}),local);
  if(new URL(url).pathname.endsWith('/data')&&options.method==='POST')writes.push({body:JSON.parse(options.body),status:response.status});
  return response;
 };
 const bodyBytes=(length,includeOwner)=>Buffer.byteLength(JSON.stringify({data:{'reysonai.trainer.history.v1':'x'.repeat(length)},version:initialVersion,importLocal:true,consent:true,...(includeOwner?{expectedOwner:owner}:{})}));
 const lengthFor=target=>{let low=0,high=target;while(low<=high){const mid=Math.floor((low+high)/2),size=bodyBytes(mid,false);if(size===target)return mid;if(size<target)low=mid+1;else high=mid-1;}throw new Error(`could not make exact ${target}-byte fixture`);};
 try{
  await accountSession.refreshAccount();assert.deepEqual(accountSession.exportAccountData().data,initial);
  const oldClientBoundaryLength=lengthFor(500_000);assert.equal(bodyBytes(oldClientBoundaryLength,false),500_000);assert.equal(bodyBytes(oldClientBoundaryLength,true),500_020);
  const originalGuest=JSON.stringify('x'.repeat(oldClientBoundaryLength));guest.set('reysonai.trainer.history.v1',originalGuest);
  await assert.rejects(accountSession.importGuestData(true),/payload_too_large/);
  assert.equal(writes.length,0);assert.deepEqual(accountSession.exportAccountData().data,initial,'oversize rejection leaves in-memory account data intact');
  assert.equal(guest.get('reysonai.trainer.history.v1'),originalGuest,'oversize rejection leaves the guest source available for export/recovery');
  assert.equal(sqlite.prepare('SELECT version FROM account_data WHERE user_id=?').get(owner).version,initialVersion);
  const exactOwnerLength=lengthFor(500_000-20);assert.equal(bodyBytes(exactOwnerLength,true),500_000);
  guest.set('reysonai.trainer.history.v1',JSON.stringify('x'.repeat(exactOwnerLength)));
  await accountSession.importGuestData(true);
  assert.equal(writes.length,1);assert.equal(Buffer.byteLength(JSON.stringify(writes[0].body)),500_000);assert.equal(writes[0].status,200);
  assert.equal(writes[0].body.expectedOwner,owner);assert.equal(writes[0].body.consent,true);
  assert.equal(sqlite.prepare('SELECT version FROM account_data WHERE user_id=?').get(owner).version,initialVersion+1);
  assert.equal(accountSession.exportAccountData().data['reysonai.trainer.history.v1'].length,exactOwnerLength);
  // A pre-change client can still read/export, but an unbound write stays rejected.
  const unbound=await routeAccount(new Request('https://api.reysonai.com/v1/account/data',{method:'POST',headers:{origin:env.ALLOWED_ORIGIN,'content-type':'application/json',cookie:`__Host-reysonai=${token}`},body:JSON.stringify({data:initial,version:initialVersion+1})}),local);
  assert.equal(unbound.status,409);assert.deepEqual(await unbound.json(),{error:'account_owner_changed'});
  const legacyRead=await routeAccount(new Request('https://api.reysonai.com/v1/account/data',{headers:{cookie:`__Host-reysonai=${token}`}}),local);
  assert.equal(legacyRead.status,200);assert.equal((await legacyRead.json()).ownerId,owner,'reload into an owner-aware client can bind to the authenticated account and resume saves');
 }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;sqlite.close();}
});
