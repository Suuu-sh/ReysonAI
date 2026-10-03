import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.ts';
import {allowedData,digest,routeAccount,verifyGoogleToken} from '../src/account.ts';
const env={AUTH_ENABLED:'true',DB:{},GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-only',GOOGLE_REDIRECT_URI:'https://api.reysonai.com/v1/account/google/callback',AUTH_APP_URL:'https://reysonai.com',AUTH_RATE_LIMIT_KEY:'test-only',ALLOWED_ORIGIN:'https://reysonai.com'};
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
test('snapshot allowlist excludes arbitrary/rank keys and includes review sessions',()=>{
 assert.ok(allowedData({'reysonai.trainer.review-sessions.v1':[],'reysonai:locale:v1':'en'}));
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
  const logged=await finish(attempt);assert.ok(logged.headers.get('location').endsWith('#account-signed-in'));
  sessionCookie=logged.headers.getSetCookie().find(c=>c.startsWith('__Host-reysonai=')).split(';')[0];
  assert.ok(logged.headers.getSetCookie().some(c=>c.includes('HttpOnly; Secure; SameSite=Lax')));
  assert.equal(b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tokenExchange.get('code_verifier')))),attempt.auth.searchParams.get('code_challenge'));
  assert.equal(tokenExchange.get('redirect_uri'),env.GOOGLE_REDIRECT_URI);
  assert.ok((await finish(attempt)).headers.get('location').endsWith('#account-error=google'));
  const firstUser=(await (await call('session')).json()).user;assert.equal(firstUser.email,'learner@custom-domain.example');assert.equal(firstUser.verified,true);
  assert.equal((await call('data',{data:{'reysonai.trainer.history.v1':[]},version:0,importLocal:true})).status,400);
  assert.equal((await call('data',{data:{'reysonai.trainer.history.v1':[]},version:0,importLocal:true,consent:true})).status,200);
  assert.equal((await call('data',{data:{},version:0})).status,409);
  assert.equal((await call('data',{data:{'reysonai.trainer.rank.v1':{}},version:1})).status,400);
  const other=await finish(await start('different-google-sub',firstUser.email));sessionCookie=other.headers.getSetCookie().find(c=>c.startsWith('__Host-reysonai=')).split(';')[0];
  const secondUser=(await (await call('session')).json()).user;assert.notEqual(firstUser.id,secondUser.id);assert.deepEqual((await (await call('data')).json()).data,{});
  const nonceHash=await digest(currentClaims.nonce);
  for(const patch of [{aud:'another-client'},{iss:'https://evil.invalid'},{email_verified:false},{nonce:'wrong'},{exp:0},{azp:'different-client'},{iat:0}]) await assert.rejects(verifyGoogleToken(await sign({...currentClaims,...patch}),env.GOOGLE_CLIENT_ID,nonceHash,Math.floor(Date.now()/1000)));
  const bad=await sign(currentClaims);await assert.rejects(verifyGoogleToken(bad.slice(0,-4)+'AAAA',env.GOOGLE_CLIENT_ID,nonceHash,Math.floor(Date.now()/1000)));
  assert.equal((await call('logout',{})).status,200);assert.equal((await (await call('session')).json()).user,null);
  googleError=true;assert.ok((await finish(await start())).headers.get('location').endsWith('#account-error=google'));
 } finally {globalThis.fetch=oldFetch;sqlite.close();}
});
