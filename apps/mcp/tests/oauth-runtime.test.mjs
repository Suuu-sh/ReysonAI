import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
const origin='https://api.example.invalid';
const range='reysonai:ranges:read', history='reysonai:history:read';
const app='https://app.example.invalid';
const sessions={alice:'a'.repeat(64),bob:'b'.repeat(64)};
const digest=s=>createHash('sha256').update(s).digest('hex');
const scope=[range,history,'offline_access'].join(' ');
async function readRpc(response) { const text=await response.text(); if(response.headers.get('content-type')?.includes('text/event-stream')) { const data=text.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6))); return data.find(item=>item.id===1)??data.at(-1); } return JSON.parse(text); }
const cookie=s=>`__Host-reysonai=${sessions[s]}`;
function field(html,name){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return html.match(new RegExp(`name="${escaped}" value="([^"]*)"`))?.[1].replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));}
async function consentCallback(response,denied=false){
 assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
 const body=await response.text();const label=denied?'Return to the app':'Continue to the app';
 const match=body.match(new RegExp(`<a class="completion-link" href="([^"]+)" rel="noreferrer">${label}</a>`));
 assert.ok(match,'consent completion link missing');
 return new URL(match[1].replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)));
}
const bindings={MCP_ENABLED:'true',MCP_ACCESS_MODE:'authenticated_free',MCP_ORIGIN:origin,MCP_ALLOWED_ORIGINS:app,AUTH_ENABLED:'true',AUTH_APP_URL:app};

// Real pinned OAuth provider + MCP SDK in workerd. Only D1/KV/user sessions/clients are local fixtures.
test('workerd OAuth PKCE consent, strict MCP auth, private tools, account isolation and revocation', async t=>{
 await mkdir('.local/tests',{recursive:true});
 await build({entryPoints:['tests/runtime-fixture.ts'],outfile:'.local/tests/worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['workerd','worker','browser'],external:['cloudflare:workers','node:*'],logLevel:'silent'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.local/tests/worker.mjs',compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],bindings,kvNamespaces:['OAUTH_KV'],d1Databases:['DB'],outboundService:()=>new Response('unexpected outbound fetch',{status:502})}));
 try{
 const db=await mf.getD1Database('DB');
 await db.exec((await readFile('../backend/migrations/0007_accounts.sql','utf8')).replace(/^--.*$/mg,'').split('\n').filter(Boolean).join(' '));
 await db.exec((await readFile('migrations/0001_mcp_revocations.sql','utf8')).replace(/^--.*$/mg,'').split('\n').filter(Boolean).join(' '));
 for(const user of ['alice','bob']){
  await db.prepare('INSERT INTO account_users(id,google_sub,email,created_at) VALUES (?,?,?,?)').bind(user,user,`${user}@example.invalid`,1).run();
  await db.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(digest(sessions[user]),user,Math.floor(Date.now()/1000)+3600).run();
 }
 const call=(path,options={})=>mf.dispatchFetch(origin+path,{...options,redirect:'manual',headers:{host:new URL(origin).host,...options.headers}});
 const client=await (await call('/__fixture/client')).json();assert.ok(client.clientId);
 const requestAuth=async({scopes=scope,user='alice',changes={}}={})=>{
  const verifier=randomBytes(32).toString('base64url');const challenge=createHash('sha256').update(verifier).digest('base64url');
  const params=new URLSearchParams({response_type:'code',client_id:client.clientId,redirect_uri:'https://client.example/callback',scope:scopes,state:'test-state',resource:origin+'/mcp',code_challenge:challenge,code_challenge_method:'S256',...changes});
  const res=await call('/oauth/mcp/authorize?'+params,{headers:user?{cookie:cookie(user)}:{}});const page=await res.text();
  const form=new URLSearchParams({handle:field(page,'handle')??'',session_proof:field(page,'session_proof')??'',decision:'approve'});
  for(const item of scopes.split(' '))if(item!=='offline_access')form.append('scope',item);
  const consentCookies=res.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const browserCookie=(user?cookie(user)+'; ':'')+consentCookies;
  return {res,page,form,verifier,browserCookie,params};
 };
 const approve=(attempt,{selectRefresh=true}={})=>{if(selectRefresh&&attempt.form.get('decision')==='approve'&&!attempt.form.getAll('scope').includes('offline_access'))attempt.form.append('scope','offline_access');return call('/oauth/mcp/authorize',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:attempt.browserCookie},body:attempt.form});};
 const exchange=(code,verifier,extra={})=>call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.clientId,redirect_uri:'https://client.example/callback',resource:origin+'/mcp',code,code_verifier:verifier,...extra})});
 const connect=async options=>{const attempt=await requestAuth(options);assert.equal(attempt.res.status,200);const res=await approve(attempt);const callback=await consentCallback(res);assert.equal(callback.searchParams.get('iss'),origin);const code=callback.searchParams.get('code');const token=await exchange(code,attempt.verifier);assert.equal(token.status,200,await token.clone().text());return {attempt,code,tokens:await token.json()};};
 const rpc=(token,method,params={},extra={})=>call('/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),...extra});
 await t.test('challenge and discovery require dedicated OAuth access; no public registration',async()=>{
  for(const headers of [{},{cookie:cookie('alice')},{authorization:'Bearer '+sessions.alice},{authorization:'Bearer fake.google.jwt'}]){const res=await call('/mcp',{method:'POST',headers,body:'{}'});assert.equal(res.status,401);assert.match(res.headers.get('www-authenticate'),/oauth-protected-resource/);assert.match(res.headers.get('cache-control'),/no-store/);}
  const metadata=await (await call('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(metadata.resource,origin+'/mcp');
  assert.ok(!metadata.scopes_supported?.includes('offline_access'));
  const auth=await (await call('/.well-known/oauth-authorization-server')).json();assert.equal(auth.issuer,origin);assert.deepEqual(auth.code_challenge_methods_supported,['S256']);assert.ok(auth.scopes_supported.includes('offline_access'));assert.equal(auth.registration_endpoint,undefined);assert.notEqual(auth.client_id_metadata_document_supported,true);
  const challenge=await call('/mcp',{method:'POST',body:'{}'});assert.doesNotMatch(challenge.headers.get('www-authenticate')??'',/offline_access/);
  assert.equal((await call('/oauth/register',{method:'POST',body:'{}'})).status,404);
 });
 await t.test('signed-out, redirect, origin, PKCE, scope and account-switch consent fail closed',async()=>{
  assert.equal((await requestAuth({user:null})).res.status,401);
  for(const changes of [{redirect_uri:'https://attacker.example/callback'},{resource:'https://attacker.example/mcp'},{code_challenge_method:'plain'},{code_challenge:''},{scope:'admin'}])assert.equal((await requestAuth({changes})).res.status,400);
  const a=await requestAuth();assert.match(a.page,/<script nonce="[a-f0-9]{32}">/);assert.match(a.page,/Fixture &#60;script&#62;/);assert.match(a.page,/client\.example/);
  assert.match(a.page,/class="consent-flow" aria-labelledby="consent-title"/);assert.match(a.page,/class="client-details"/);assert.match(a.page,/class="permissions"/);
  assert.match(a.page,/id="allow-access" type="submit" name="decision" value="approve" disabled>Allow access/);assert.match(a.page,/name="decision" value="deny" formnovalidate>Deny/);
  assert.match(a.page,/Access tokens expire after five minutes/);assert.match(a.page,/id="offline-access" type="checkbox" name="scope" value="offline_access" required/);assert.doesNotMatch(a.page,/value="offline_access"[^>]*checked/);assert.match(a.page,/Required to allow this connection/);assert.equal(field(a.page,'requested'),undefined);
  const badOrigin=await call('/oauth/mcp/authorize',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/x-www-form-urlencoded',cookie:a.browserCookie},body:a.form});assert.equal(badOrigin.status,403);
  const switched=await approve({...a,browserCookie:a.browserCookie.replace(sessions.alice,sessions.bob)});assert.equal(switched.status,403);
  const noCookie=await approve({...a,browserCookie:cookie('alice')});assert.equal(noCookie.status,400);
  const b=await requestAuth({scopes:range});b.form.append('scope',history);assert.equal((await approve(b)).status,400);
  const extraField=await requestAuth({scopes:range});extraField.form.append('requested',range);assert.equal((await approve(extraField)).status,400);
  const extraOffered=await requestAuth({scopes:range});extraOffered.form.append('offered',`${range} ${history} offline_access`);assert.equal((await approve(extraOffered)).status,400);
  const extraHistory=await requestAuth({scopes:range});extraHistory.form.append('history','true');assert.equal((await approve(extraHistory)).status,400);
  const duplicateScope=await requestAuth({scopes:range});duplicateScope.form.append('scope',range);assert.equal((await approve(duplicateScope)).status,400);
  const unknownScope=await requestAuth({scopes:range});unknownScope.form.append('scope','admin');assert.equal((await approve(unknownScope)).status,400);
  const duplicateDecision=await requestAuth({scopes:range});duplicateDecision.form.append('decision','approve');assert.equal((await approve(duplicateDecision)).status,400);
  const tamperedOffer=await requestAuth({scopes:range});const offerKey=`mcp:consent-offer:${digest(field(tamperedOffer.page,'handle'))}`;
  await (await mf.getKVNamespace('OAUTH_KV')).put(offerKey,JSON.stringify({version:1,requestedScopes:[range,history],offeredScopes:[range,history,'offline_access']}));
  assert.equal((await approve(tamperedOffer)).status,403);
  const optional=await requestAuth({scopes:range});assert.match(optional.page,/client did not request it/);assert.match(optional.page,/value="offline_access" required/);optional.form.append('scope','offline_access');
  const optionalApproved=await approve(optional);const optionalCode=(await consentCallback(optionalApproved)).searchParams.get('code');
  const optionalTokens=await (await exchange(optionalCode,optional.verifier)).json();assert.ok(optionalTokens.refresh_token);assert.equal(optionalTokens.scope,`${range} offline_access`);
  const denied=await requestAuth();denied.form.set('decision','deny');const d=await approve(denied,{selectRefresh:false});assert.equal((await consentCallback(d,true)).searchParams.get('error'),'access_denied');assert.equal((await approve(denied,{selectRefresh:false})).status,400);
  const unselected=await requestAuth();const rejected=await approve(unselected,{selectRefresh:false});assert.equal(rejected.status,400);assert.equal((await rejected.json()).error,'invalid_scope');unselected.form.append('scope','offline_access');assert.equal((await approve(unselected,{selectRefresh:false})).status,200);
 });
 const full=await connect();
 await t.test('code verifier, audience, replay and stateless MCP protocol',async()=>{
  const replay=await connect({user:'bob'}); assert.equal((await exchange(replay.code,replay.attempt.verifier)).status,400); assert.equal((await rpc(replay.tokens.access_token,'tools/list')).status,401);
  const pending=await requestAuth({user:'bob'});const approved=await approve(pending);const code=(await consentCallback(approved)).searchParams.get('code');
  assert.equal((await exchange(code,'wrong-verifier')).status,400);
  assert.equal((await exchange(code,pending.verifier,{resource:'https://attacker.example/mcp'})).status,400);
  const initialize=await rpc(full.tokens.access_token,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(initialize.status,200,await initialize.clone().text());
  for(const badOrigin of ['null','http://app.example.invalid',app+':444','https://evil.test'])assert.equal((await rpc(full.tokens.access_token,'tools/list',{}, {headers:{origin:badOrigin,authorization:'Bearer '+full.tokens.access_token}})).status,403);
  const list=await rpc(full.tokens.access_token,'tools/list');assert.equal(list.status,200,await list.clone().text());const body=await readRpc(list);assert.deepEqual(body.result.tools.map(tool=>tool.name).sort(),['evaluate_postflop_policy','get_my_learning_history','get_saved_postflop_range','get_saved_range','list_postflop_coverage','list_range_coverage']);assert.ok(body.result.tools.every(tool=>tool.annotations.readOnlyHint));
  const evaluator=body.result.tools.find(tool=>tool.name==='evaluate_postflop_policy');assert.match(evaluator.description,/preflop-range-weighted projection, not path-conditioned frequencies/);assert.match(evaluator.description,/nodeReachable=false are not reached-node recommendations/);assert.match(evaluator.description,/evaluator and defense versions/);
  for(const name of ['run_sql','create_solver_job','charge_card','shell']) {const res=await rpc(full.tokens.access_token,'tools/call',{name,arguments:{}});const body=await readRpc(res);assert.ok(body.error||body.result?.isError);}
  const unknown=await rpc(full.tokens.access_token,'tools/call',{name:'get_my_learning_history',arguments:{userId:'bob'}});const rejected=await readRpc(unknown);assert.ok(rejected.error||rejected.result?.isError);
 });
 await t.test('own history cannot cross accounts or silently acquire additional scopes',async()=>{
  await db.prepare('INSERT INTO account_data(user_id,data_json,version) VALUES (?,?,?)').bind('alice',JSON.stringify({'reysonai.trainer.history.v1':[],'reysonai:profile:v1':{secret:'must-not-leak'}}),1).run();
  const res=await rpc(full.tokens.access_token,'tools/call',{name:'get_my_learning_history',arguments:{}});assert.equal(res.status,200);const text=await res.text();assert.ok(!text.includes('must-not-leak'));assert.ok(!text.includes('bob@'));
  const ranged=await connect({scopes:range});assert.ok(ranged.tokens.refresh_token);const list=await readRpc(await rpc(ranged.tokens.access_token,'tools/list'));assert.ok(!list.result.tools.some(tool=>tool.name==='get_my_learning_history'));
  assert.equal(ranged.tokens.scope,`${range} offline_access`);
  const denied=await readRpc(await rpc(ranged.tokens.access_token,'tools/call',{name:'get_my_learning_history',arguments:{}}));assert.ok(denied.error||denied.result?.isError);
  for(const name of ['list_postflop_coverage','get_saved_postflop_range','evaluate_postflop_policy']){
   const result=await readRpc(await rpc(ranged.tokens.access_token,'tools/call',{name,arguments:{spotId:'BTN_open_BB_call',flop:'Kc7d2h'}}));
   assert.doesNotMatch(JSON.stringify(result),/Access denied/,name);
  }
  const tokenId=ranged.tokens.access_token.split(':')[1];const tokenKey=(await (await mf.getKVNamespace('OAUTH_KV')).list({prefix:`token:alice:${tokenId}:`})).keys[0].name;
  const kv=await mf.getKVNamespace('OAUTH_KV');const stored=await kv.get(tokenKey);const record=JSON.parse(stored);
  await kv.put(tokenKey,JSON.stringify({...record,scope:[history]}));
  const noRange=await readRpc(await rpc(ranged.tokens.access_token,'tools/call',{name:'evaluate_postflop_policy',arguments:{spotId:'BTN_open_BB_call',flop:'Kc7d2h'}}));
  assert.match(JSON.stringify(noRange),/Access denied|insufficient_scope/);
  await kv.put(tokenKey,stored);
 });
 await t.test('modern 2026 request envelope and token expiry/audience/scope enforcement',async()=>{
  const linked=await connect();
  const modern=await call('/mcp',{method:'POST',headers:{authorization:`Bearer ${linked.tokens.access_token}`,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':'tools/list'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'fixture',version:'1'}}}})});
  assert.equal(modern.status,200,await modern.clone().text());assert.equal((await readRpc(modern)).result.tools.length,6);
  const kv=await mf.getKVNamespace('OAUTH_KV');const id=linked.tokens.access_token.split(':')[1];const key=(await kv.list({prefix:`token:alice:${id}:`})).keys[0].name;const stored=await kv.get(key);const record=JSON.parse(stored);
  for(const patch of [{expiresAt:1},{audience:'https://other.example/mcp'},{scope:[]}]){
   await kv.put(key,JSON.stringify({...record,...patch}));const response=await rpc(linked.tokens.access_token,'tools/list');assert.equal(response.status,patch.scope?403:401);assert.match(response.headers.get('www-authenticate'),/Bearer/);
  }
  await kv.put(key,stored);
  assert.equal((await call('/mcp',{method:'POST',headers:{'x-fixture-host':'evil.example'},body:'{}'})).status,403);
  const revoked=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.clientId,token:linked.tokens.access_token,token_type_hint:'access_token'})});assert.equal(revoked.status,200);
  await kv.put(key,stored);assert.equal((await rpc(linked.tokens.access_token,'tools/list')).status,401);
  // Revoking one access token keeps its separately authorized refresh grant usable.
  const renewed=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,refresh_token:linked.tokens.refresh_token,resource:origin+'/mcp'})});assert.equal(renewed.status,200);
 });
 await t.test('authoritative single-use code claim rejects concurrent and stale-KV redemption',async()=>{
  const pending=await requestAuth();const approved=await approve(pending);const code=(await consentCallback(approved)).searchParams.get('code');const grantId=code.split(':')[1];
  const kv=await mf.getKVNamespace('OAUTH_KV');const grantKey=`grant:alice:${grantId}`;const stale=await kv.get(grantKey);assert.ok(stale);
  const first=await exchange(code,pending.verifier);assert.equal(first.status,200);const firstTokens=await first.json();assert.equal((await rpc(firstTokens.access_token,'tools/list')).status,200);
  await kv.put(grantKey,stale);
  const replay=await exchange(code,pending.verifier);assert.equal(replay.status,400);assert.equal((await replay.json()).error,'invalid_grant');assert.equal((await rpc(firstTokens.access_token,'tools/list')).status,401);
  const deniedRefresh=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,refresh_token:firstTokens.refresh_token,resource:origin+'/mcp'})});assert.equal(deniedRefresh.status,400);
  const claim=await db.prepare('SELECT grant_id FROM mcp_code_redemptions WHERE user_id=? AND grant_id=?').bind('alice',grantId).all();assert.equal(claim.results.length,1);
  const invalid=await requestAuth();const before=await approve(invalid);const invalidCode=(await consentCallback(before)).searchParams.get('code');const invalidId=invalidCode.split(':')[1];
  assert.equal((await exchange(invalidCode,'wrong-verifier')).status,400);
  const unclaimed=await db.prepare('SELECT grant_id FROM mcp_code_redemptions WHERE user_id=? AND grant_id=?').bind('alice',invalidId).all();assert.equal(unclaimed.results.length,0);
  assert.equal((await exchange(invalidCode,invalid.verifier)).status,200);
  const parallel=await requestAuth();const accepted=await approve(parallel);const parallelCode=(await consentCallback(accepted)).searchParams.get('code');
  const attempts=await Promise.all([exchange(parallelCode,parallel.verifier),exchange(parallelCode,parallel.verifier)]);
  assert.ok(attempts.filter(result=>result.status===200).length<=1);assert.ok(attempts.some(result=>result.status!==200));
  // The detected replay revokes the grant, including any request that was issuing concurrently.
  for(const result of attempts)if(result.status===200){const issued=await result.json();assert.equal((await rpc(issued.access_token,'tools/list')).status,401);}
 });
 await t.test('authoritative refresh revision rejects stale-KV generation rollback and enforces strict single-use refresh',async()=>{
  const linked=await connect();const kv=await mf.getKVNamespace('OAUTH_KV');const grantId=linked.tokens.refresh_token.split(':')[1];const key=`grant:alice:${grantId}`;const original=await kv.get(key);assert.ok(original);
  const refresh=value=>call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,refresh_token:value,resource:origin+'/mcp'})});
  const one=await refresh(linked.tokens.refresh_token);assert.equal(one.status,200);const r1=await one.json();
  const two=await refresh(r1.refresh_token);assert.equal(two.status,200);const r2=await two.json();
  const wrongClient=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.otherClientId,refresh_token:linked.tokens.refresh_token,resource:origin+'/mcp'})});assert.equal(wrongClient.status,400);assert.equal((await rpc(r2.access_token,'tools/list')).status,200);
  const badCredential=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,client_secret:'invalid-fixture-secret',refresh_token:linked.tokens.refresh_token,resource:origin+'/mcp'})});assert.equal(badCredential.status,401);assert.equal((await rpc(r2.access_token,'tools/list')).status,200);
  const duplicate=new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,refresh_token:linked.tokens.refresh_token,resource:origin+'/mcp'});duplicate.append('client_id',client.otherClientId);
  assert.equal((await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:duplicate})).status,400);assert.equal((await rpc(r2.access_token,'tools/list')).status,200);
  assert.equal((await refresh('alice:abcdefghijklmnop:unknown-token')).status,400);assert.equal((await rpc(r2.access_token,'tools/list')).status,200);
  assert.equal((await refresh(linked.tokens.refresh_token)).status,400);assert.equal((await rpc(r2.access_token,'tools/list')).status,401);
  await kv.put(key,original);const replay=await refresh(linked.tokens.refresh_token);assert.equal(replay.status,400);assert.equal((await replay.json()).error,'invalid_grant');
  for(const token of [linked.tokens.access_token,r1.access_token,r2.access_token])assert.equal((await rpc(token,'tools/list')).status,401);
  assert.equal((await refresh(r2.refresh_token)).status,400);
  const retryable=await connect();const advanced=await refresh(retryable.tokens.refresh_token);assert.equal(advanced.status,200);
  const latest=await advanced.json();
  // A lost refresh response requires reconnecting; replay never preserves an old token for 30 days.
  const retried=await refresh(retryable.tokens.refresh_token);assert.equal(retried.status,400);assert.equal((await rpc(latest.access_token,'tools/list')).status,401);
 });
 await t.test('refresh permission enables 30-day refresh; stale provider KV cannot restore RFC7009-revoked access',async()=>{
  const linked=await connect();assert.ok(linked.tokens.refresh_token);assert.equal(linked.tokens.scope,scope);
  const kv=await mf.getKVNamespace('OAUTH_KV');const grantId=linked.tokens.refresh_token.split(':')[1];
  const keys=[`grant:alice:${grantId}`,...(await kv.list({prefix:`token:alice:${grantId}:`})).keys.map(key=>key.name)];
  const stale=await Promise.all(keys.map(async key=>[key,await kv.get(key)]));
  const revoked=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.clientId,token:linked.tokens.refresh_token,token_type_hint:'refresh_token'})});assert.equal(revoked.status,200);
  const marker=await db.prepare('SELECT grant_id FROM mcp_revocations WHERE user_id=? AND grant_id=?').bind('alice',grantId).first();assert.ok(marker);
  // Reproduce a delayed refresh write / stale edge observation without issuing any external request.
  for(const [key,value] of stale)await kv.put(key,value);
  assert.equal((await rpc(linked.tokens.access_token,'tools/list')).status,401);
  const refreshed=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,refresh_token:linked.tokens.refresh_token,resource:origin+'/mcp'})});assert.equal(refreshed.status,400);
 });
 await t.test('pre-registered confidential basic/post clients exchange and refresh with strict replay denial',async()=>{
  for(const registered of client.confidential){
   assert.ok(registered.clientSecret);
   const pending=await requestAuth({changes:{client_id:registered.clientId}});const approved=await approve(pending);assert.equal(approved.status,200);assert.equal(approved.headers.get('location'),null);
   const headers={'content-type':'application/x-www-form-urlencoded'};
   const credentials=registered.method==='client_secret_post'?{client_id:registered.clientId,client_secret:registered.clientSecret}:{};
   if(registered.method==='client_secret_basic')headers.authorization='Basic '+Buffer.from(encodeURIComponent(registered.clientId)+':'+encodeURIComponent(registered.clientSecret)).toString('base64');
   const code=(await consentCallback(approved)).searchParams.get('code');
   const exchanged=await call('/oauth/mcp/token',{method:'POST',headers,body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:pending.verifier,redirect_uri:'https://client.example/callback',resource:origin+'/mcp',...credentials})});assert.equal(exchanged.status,200);const tokens=await exchanged.json();
   const refreshBody=new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token,resource:origin+'/mcp',...credentials});
   const refreshed=await call('/oauth/mcp/token',{method:'POST',headers,body:refreshBody});assert.equal(refreshed.status,200);const fresh=await refreshed.json();
   const invalidHeaders={...headers};const invalidBody=new URLSearchParams(refreshBody);
   if(registered.method==='client_secret_basic')invalidHeaders.authorization='Basic '+Buffer.from(registered.clientId+':bad-fixture-secret').toString('base64');else invalidBody.set('client_secret','bad-fixture-secret');
   assert.equal((await call('/oauth/mcp/token',{method:'POST',headers:invalidHeaders,body:invalidBody})).status,401);assert.equal((await rpc(fresh.access_token,'tools/list')).status,200);
   assert.equal((await call('/oauth/mcp/token',{method:'POST',headers,body:refreshBody})).status,400);assert.equal((await rpc(fresh.access_token,'tools/list')).status,401);
  }
 });
 await t.test('owned web revocation blocks access and refresh; account deletion fails closed',async()=>{
  const linked=await connect();const page=await call('/oauth/mcp/connections',{headers:{cookie:cookie('alice')}});const html=await page.text();const grant=field(html,'grant');assert.ok(grant);const proof=field(html,'session_proof');
  const revoke=new URLSearchParams({grant,session_proof:proof});
  const other=await call('/oauth/mcp/connections',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:cookie('bob')},body:revoke});assert.equal(other.status,403);
  const done=await call('/oauth/mcp/connections',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:cookie('alice')},body:revoke});assert.equal(done.status,200);
  assert.equal((await rpc(linked.tokens.access_token,'tools/list')).status,401);
  const refresh=await call('/oauth/mcp/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.clientId,refresh_token:linked.tokens.refresh_token,resource:origin+'/mcp'})});assert.equal(refresh.status,400);
  const bob=await connect({user:'bob'});await db.prepare('DELETE FROM account_users WHERE id=?').bind('bob').run();assert.equal((await rpc(bob.tokens.access_token,'tools/list')).status,401);
 });
 }finally{await mf.dispose();}
});
