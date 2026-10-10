import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import worker from '../src/index.ts';
import { dispatchFastFold } from '../src/fastfold-dispatch.ts';
import { FASTFOLD_DATASETS } from '../src/fastfold.ts';
import { buildInputs, sha } from '../../frontend/scripts/postflop-ai/browser-inputs.ts';
import { referencePolicyFor } from '../../frontend/scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy } from '../../frontend/scripts/postflop-ai/later-policy.ts';
const origin='http://localhost:5173',api='http://localhost:8787/v1/fastfold/';
const env={DB:{},FASTFOLD_ENABLED:'true',AUTH_ENABLED:'true',AUTH_LOCAL_DEV:'true',AUTH_APP_URL:origin,ALLOWED_ORIGIN:origin,GOOGLE_REDIRECT_URI:'http://localhost:8787/v1/account/google/callback',AUTH_RATE_LIMIT_KEY:'ephemeral-test-only'};
const request=(path,token,body)=>new Request(api+path,{headers:{origin,...(token?{cookie:'reysonai-dev-session='+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
const hash=text=>createHash('sha256').update(text).digest('hex');
test('thin dispatcher fails closed and uses only32 opaque finite shards; preserves streams/cookies/CORS',async t=>{
 assert.equal((await dispatchFastFold(request('start','a'.repeat(64),{consent:true}),env)).status,503);
 assert.equal((await dispatchFastFold(request('status'),{...env,FASTFOLD_ENABLED:'false'})).status,503);
 const names=new Set(),times=[];let forwarded;
 const bound={...env,FASTFOLD_RUNTIME:{getByName(name){names.add(name);return {async handle(req){forwarded=req;return new Response('forwarded',{headers:{'set-cookie':'test=opaque; HttpOnly','x-test':'preserved'}})}}}}};
 for(let i=0;i<128;i++){
  const token=hash('shaped-unauthenticated-fixture-'+i),req=request('profile',token);
  const start=performance.now();const response=await worker.fetch(req,bound);times.push(performance.now()-start);
  assert.equal(response.headers.get('access-control-allow-credentials'),'true');assert.equal(response.headers.get('x-test'),'preserved');assert.equal(response.headers.get('set-cookie'),'test=opaque; HttpOnly');assert.equal(forwarded.headers.get('cookie'),req.headers.get('cookie'));
 }
 assert.ok(names.size<=32);assert.ok([...names].every(n=>/^session-shard-(?:[0-9]|[12][0-9]|3[01])$/.test(n)));
 await dispatchFastFold(request('status'),bound);assert.ok(names.has('public-status'));assert.equal(names.size<=33,true);
 const posted=request('action','a'.repeat(64),{version:1});await dispatchFastFold(posted,bound);assert.deepEqual(await forwarded.json(),{version:1});
 const bad=new Request(api+'action',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json',cookie:'reysonai-dev-session='+'a'.repeat(64)},body:'{}'});assert.equal((await dispatchFastFold(bad,bound)).status,403);
 const tooBig=new Request(api+'action',{method:'POST',headers:{origin,'content-type':'application/json','content-length':'4097',cookie:'reysonai-dev-session='+'a'.repeat(64)},body:'{}'});assert.equal((await dispatchFastFold(tooBig,bound)).status,400);
 times.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({runtime:'Node thin Worker local wall including async digest',samples:times.length,p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),productionCpuMs:null}));
});
test('actual SQLite DO binding + D1 auth/CAS across shards, expiry, restart, saved postflop and projection',{skip:!process.env.WORKERD_MODULE},async t=>{
 const {Miniflare}=await import(process.env.WORKERD_MODULE);const {build}=await import('../../frontend/node_modules/esbuild/lib/main.js');
 const dir=await mkdtemp(join(tmpdir(),'fastfold-do-test-'));let mf;
 try{
 const bundled=await build({entryPoints:[new URL('../src/worker.ts',import.meta.url).pathname],bundle:true,write:false,platform:'browser',conditions:['workerd'],format:'esm',external:['cloudflare:workers'],logLevel:'silent'});
 const workerEnv={...Object.fromEntries(Object.entries(env).filter(([k])=>k!=='DB').map(([k,value])=>[k,{type:'text',value}])),DB:{type:'d1',id:'fastfold-test-db'},FASTFOLD_RUNTIME:{type:'durable-object',worker:'ff-local-test',exportName:'FastFoldRuntime'}};
 const options={cf:false,telemetry:{enabled:false},resourcePersistencePath:join(dir,'storage'),workers:[{config:{name:'ff-local-test',compatibilityDate:'2026-09-22',env:workerEnv,exports:{FastFoldRuntime:{type:'durable-object',storage:'sqlite'}},manifest:{mainModule:'worker.mjs',modulesRoot:'/',modules:{'worker.mjs':{type:'esm',contents:bundled.outputFiles[0].text}}}}}]};
 mf=new Miniflare(options);await mf.ready;let db=await mf.getD1Database('DB');
 const schema=new DatabaseSync(':memory:');for(const name of ['0001_postflop.sql','0003_preflop.sql','0007_accounts.sql','0010_fastfold.sql'])schema.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 for(const row of schema.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all())await db.prepare(row.sql).run();schema.close();
 const data={};for(const name of FASTFOLD_DATASETS){const body=readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url),'utf8');data[name]=JSON.parse(body);await db.batch([db.prepare('INSERT INTO preflop_datasets VALUES (?,?,?,1)').bind(name,hash(body),Buffer.byteLength(body)),db.prepare('INSERT INTO preflop_dataset_parts VALUES (?,0,?)').bind(name,body)])}
 const a='a'.repeat(64),b='b'.repeat(64);let c;for(let i=0;i<100;i++){const token=hash('same-user-alternate-token-'+i);if(parseInt(hash(token).slice(0,2),16)%32!==parseInt(hash(a).slice(0,2),16)%32){c=token;break}}assert.ok(c);
 for(const user of ['A','B'])await db.prepare('INSERT INTO account_users VALUES (?,?,?,?)').bind(user,user,user+'@invalid',Date.now()).run();
 for(const [user,token,expiry] of [['A',a,Date.now()/1000+3600],['A',c,Date.now()/1000+3600],['B',b,Date.now()/1000+3600],['A','d'.repeat(64),1]])await db.prepare('INSERT INTO account_sessions VALUES (?,?,?)').bind(hash(token),user,Math.floor(expiry)).run();
 const call=async(path,token,body,status=200)=>{const start=performance.now();const req=request(path,token,body);const response=await mf.dispatchFetch(req.url,{method:req.method,headers:req.headers,...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));t.diagnostic(JSON.stringify({route:path,status,wallMs:performance.now()-start,productionCpuMs:null}));return result};
 await call('profile','d'.repeat(64),undefined,401);await call('profile','e'.repeat(64),undefined,401);
 let current=await call('start',a,{consent:true}),s=current.session;
 assert.deepEqual(Object.keys(s.hand.holeCards),['UTG']);const cmd={sessionId:s.id,version:s.version,actionId:crypto.randomUUID(),action:'fold'};
 await call('action',b,cmd,404);const responses=await Promise.all([call('action',a,cmd),call('action',c,cmd)]);assert.equal(responses[0].lastResult.id,responses[1].lastResult.id);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM fastfold_actions').first()).n,1);
 const csrf=await mf.dispatchFetch(api+'action',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json',cookie:'reysonai-dev-session='+a},body:JSON.stringify(cmd)});assert.equal(csrf.status,403);
 s=responses[0].session;await call('pause',a,{sessionId:s.id,version:s.version});
 await mf.dispose();mf=new Miniflare(options);await mf.ready;db=await mf.getD1Database('DB');const resumed=await call('start',c,{consent:true});assert.equal(resumed.session.hand.id,s.hand.id);assert.deepEqual(resumed.session.hand.holeCards,s.hand.holeCards);
 // Force only this ephemeral test's private deal to exercise the exact saved-policy heavy path.
 const inputs=buildInputs('BTN_open_BB_call',data),flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
 for(const [stage,policy,metadata] of [['flop',flop,{source_hash:inputs.fingerprint,policy_hash:sha(flop)}],['later',later,{source_hash:inputs.fingerprint,flop_policy_hash:sha(flop),policy_hash:sha(later)}]])await db.prepare('INSERT INTO postflop_policies VALUES (?,?,?,?,?)').bind('BTN_open_BB_call',stage,metadata.policy_hash,JSON.stringify(metadata),JSON.stringify({policy,metadata})).run();
 const saved=await db.prepare('SELECT private_json FROM fastfold_sessions').first();const hidden=JSON.parse(saved.private_json);delete hidden.receipt;hidden.hand={...hidden.hand,number:6,hero:'BB',type:'balanced',hole:{UTG:[0,5],HJ:[8,13],CO:[16,21],BTN:[48,44],SB:[24,29],BB:[36,40]},board:[37,41,12,15,27],draws:Array(128).fill(.99),actions:[]};for(const i of [0,1,2,4])hidden.hand.draws[i]=0;hidden.hashes=Object.fromEntries(Object.entries(hidden.hashes).filter(([n])=>!n.startsWith('profiles/')));await db.prepare('UPDATE fastfold_sessions SET private_json=?').bind(JSON.stringify(hidden)).run();
 s=(await call('profile',a)).state.active;let result;
 for(const action of ['call','check','raise','call','check','call','check','call']){const p=s.hand.pending;assert.deepEqual(Object.keys(s.hand.holeCards),['BB']);assert.ok(p.options.some(o=>o.key===action),JSON.stringify(p));current=await call('action',a,{sessionId:s.id,version:s.version,actionId:crypto.randomUUID(),action});if(current.lastResult){result=current.lastResult;break}s=current.session}
 assert.ok(result);assert.equal(result.showdown,true);assert.equal(result.board.length,5);assert.equal(result.shadow.appliedPenalty,0);
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true})}
});
