import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { routeOnDemand,normalizeBrokerRequest,validateBrokerResult } from '../src/aiv2-ondemand.ts';
import { digest } from '../src/account.ts';
const token='a'.repeat(64),secret='test-only-secret-not-used-outside-fixture';
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0007_accounts.sql','0014_aiv2_ondemand.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('user','sub','test@example.invalid',0);
 sqlite.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(await digest(token),'user',Date.now()/1000+3600);
 const DB={prepare(sql:string){let args:unknown[]=[];return {bind(...a:unknown[]){args=a;return this;},async all(){return {results:sqlite.prepare(sql).all(...args as any[])}}};}};
 const env={DB,AUTH_ENABLED:'true',AIV2_ONDEMAND_ENABLED:'true',AIV2_ONDEMAND_IMPLEMENTATION_HASH:'b'.repeat(64),AIV2_ONDEMAND_SOURCE_HASH:'c'.repeat(64),AIV2_ONDEMAND_BRIDGE_SECRET:secret,AUTH_APP_URL:'https://app.reysonai.com',GOOGLE_REDIRECT_URI:'https://api.reysonai.com/v1/account/google/callback',AUTH_RATE_LIMIT_KEY:'test',ALLOWED_ORIGIN:'https://app.reysonai.com'};
 const call=(path:string,body?:unknown,headers:Record<string,string>={})=>routeOnDemand(new Request('https://api.reysonai.com/v1/aiv2/ondemand/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'__Host-reysonai='+token,...(body===undefined?{}:{origin:'https://app.reysonai.com','content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 const owner=(path:string,body:unknown={})=>routeOnDemand(new Request('https://api.reysonai.com/v1/aiv2/ondemand/owner/'+path,{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify(body)}),env);
 return {sqlite,env,call,owner};
}
test('feature gate, auth, origin, read-only misses and owner liveness fail closed',async()=>{
 const f=await fixture();try{
 assert.equal((await f.call('status',undefined,{cookie:''})).status,401);
 assert.equal((await f.call('requests',{board:'As7d2c',path:[],consent:true},{origin:'https://evil.invalid'})).status,403);
 assert.deepEqual(await (await f.call('scene?board=As7d2c&path=%5B%5D')).json(),{status:'not_generated'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,0);
 assert.equal((await f.call('requests',{board:'As7d2c',path:[],consent:true})).status,503);
 assert.equal((await f.owner('heartbeat')).status,200);assert.equal((await (await f.call('status')).json()).ownerOnline,true);
 f.env.AIV2_ONDEMAND_ENABLED='false';assert.equal((await f.call('status')).status,503);
 }finally{f.sqlite.close();}
});
test('atomic caps/dedup/access and owner lease expiry never replay provider calls',async()=>{
 const f=await fixture();try{
 await f.owner('heartbeat');
 const a=await (await f.call('requests',{board:'As7d2c',path:[],consent:true})).json();
 assert.equal((await f.call('requests',{board:'As7d2c',path:[],consent:true})).status,202);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,1);
 for(const board of ['Ks7d2c','Qs7d2c'])assert.equal((await f.call('requests',{board,path:[],consent:true})).status,202);
 assert.equal((await f.call('requests',{board:'Js7d2c',path:[],consent:true})).status,429);
 assert.equal((await f.call('requests/'+a.id,undefined,{cookie:''})).status,401);
 assert.equal((await f.call('requests/'+'f'.repeat(64))).status,404);
 const {job}=await (await f.owner('claim')).json();assert.equal(job.maxProviderCalls,2);assert.equal(job.maxDecisions,1);
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:'wrong',result:{}})).status,409);
 assert.equal((await f.owner('heartbeat',{id:job.id,leaseToken:job.leaseToken})).status,200);
 f.sqlite.prepare('UPDATE aiv2_ondemand_jobs SET lease_until=0 WHERE id=?').run(job.id);
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:job.leaseToken,result:{}})).status,409);
 await f.owner('claim');assert.equal(f.sqlite.prepare('SELECT status,error FROM aiv2_ondemand_jobs WHERE id=?').get(job.id)!.error,'uncertain_provider_outcome');
 assert.throws(()=>f.sqlite.prepare("UPDATE aiv2_ondemand_jobs SET status='queued' WHERE id=?").run(job.id));
 }finally{f.sqlite.close();}
});
test('owner completion binds exact job, revision and pinned config; immutable saved scene read',async()=>{
 const f=await fixture();try{
 await f.owner('heartbeat');await f.call('requests',{board:'As7d2c',path:[],consent:true});const {job}=await (await f.owner('claim')).json();
 const result={status:'terminal',snapshot:{status:'terminal',board:job.board,path:job.path,method:'llm-postflop-ondemand-v2',config:{method:'llm-postflop-ondemand-v2',version:'exact-combo-bilingual-srp33-66-125-3bp25-50-100-raise2p5-v2',model:'gpt-6.1-sol',effort:'medium'},scene:null},proof:{revision:job.revision,implementationHash:job.implementationHash,sourceHash:job.sourceHash,validatedStore:true}};
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:job.leaseToken,result:{...result,proof:{...result.proof,sourceHash:'f'.repeat(64)}}})).status,400);
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:job.leaseToken,result})).status,200);
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:job.leaseToken,result})).status,200);
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:job.leaseToken,result:{...result,status:'chance'}})).status,400);
 const read=await (await f.call('scene?board=As7d2c&path=%5B%5D')).json();assert.equal(read.result.validation,'owner-validated-cache-not-independent-gto');
 assert.equal((await (await f.call('requests/'+job.id)).json()).status,'complete');
 }finally{f.sqlite.close();}
});
test('bounded input and reserved daily global call budget',async()=>{
 assert.throws(()=>normalizeBrokerRequest('AsAs2c',[]));assert.throws(()=>normalizeBrokerRequest('As7d2c',Array(65).fill('check')));
 const f=await fixture();try{
 await f.owner('heartbeat');f.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES ('old','old','As7d2c','[]','user',?,'failed',0,8)").run(new Date().toISOString().slice(0,10));
 // Populate other owners' jobs to reserve all 96 provider calls atomically.
 f.sqlite.prepare("INSERT INTO account_users VALUES ('other','other','other@example.invalid',0)").run();
 for(let i=0;i<11;i++)f.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES (?,'old',?,'[]','other',?,'failed',0,8)").run('x'+i,'board'+i,new Date().toISOString().slice(0,10));
 assert.equal((await f.call('requests',{board:'As7d2c',path:[],consent:true})).status,429);
 }finally{f.sqlite.close();}
});
test('owner secret, pin, oversized body and global outstanding boundaries',async()=>{
 const f=await fixture();try{
 assert.equal((await f.call('owner/claim',{})).status,403);
 assert.equal((await f.owner('heartbeat',{revision:'f'.repeat(64)})).status,409);
 await f.owner('heartbeat');
 assert.equal((await f.call('requests',{board:'As7d2c',path:[],consent:true,padding:'x'.repeat(5000)})).status,400);
 f.sqlite.prepare("INSERT INTO account_users VALUES ('other','other','other@example.invalid',0)").run();
 for(let i=0;i<16;i++)f.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES (?,'old',?,'[]','other','older-day','queued',0,8)").run('x'+i,'board'+i);
 assert.equal((await f.call('requests',{board:'As7d2c',path:[],consent:true})).status,429);
 }finally{f.sqlite.close();}
});
test('Worker production route is gated before any database/provider side effects',async()=>{
 const {default:worker}=await import('../src/index.ts');
 const response=await worker.fetch(new Request('https://api.reysonai.com/v1/aiv2/ondemand/status'),{} as any);
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ondemand_not_enabled');
});
test('browser on-demand credentialed CORS allows only exact app origin including preflight/errors',async()=>{
 const {default:worker}=await import('../src/index.ts');
 for(const method of ['GET','OPTIONS']){
  const response=await worker.fetch(new Request('https://api.reysonai.com/v1/aiv2/ondemand/status',{method,headers:{origin:'https://app.reysonai.com'}}),{ALLOWED_ORIGIN:'https://app.reysonai.com'} as any);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://app.reysonai.com');assert.equal(response.headers.get('access-control-allow-credentials'),'true');assert.equal(response.headers.get('cache-control'),'no-store');
 }
 const denied=await worker.fetch(new Request('https://api.reysonai.com/v1/aiv2/ondemand/status',{headers:{origin:'https://evil.invalid'}}),{ALLOWED_ORIGIN:'*'} as any);
 assert.equal(denied.headers.get('access-control-allow-origin'),null);assert.equal(denied.headers.get('access-control-allow-credentials'),null);
});
test('deep path reserves bounded calls for every ancestor including target, without counting chance cards',async()=>{
 const f=await fixture();try{
 await f.owner('heartbeat');
 const path=['check','bet33','call','4h','check','check','5h','check'];
 const response=await f.call('requests',{board:'As7d2c',path,consent:true});assert.equal(response.status,202);
 const {job}=await (await f.owner('claim')).json();assert.deepEqual(job.path,path);assert.equal(job.maxDecisions,7);assert.equal(job.maxProviderCalls,14);
 assert.equal(f.sqlite.prepare('SELECT reserved_calls FROM aiv2_ondemand_jobs WHERE id=?').get(job.id)!.reserved_calls,14);
 assert.equal((await f.call('requests',{board:'As7d2c',path:Array(32).fill('check'),consent:true})).status,400);
 assert.throws(()=>f.sqlite.prepare('UPDATE aiv2_ondemand_jobs SET reserved_calls=65 WHERE id=?').run(job.id));
 assert.throws(()=>f.sqlite.prepare('UPDATE aiv2_ondemand_jobs SET reserved_calls=3 WHERE id=?').run(job.id));
 // Existing job reservation is immutable from request replay, including new configured hard caps.
 assert.equal((await f.call('requests',{board:'As7d2c',path,consent:true})).status,202);
 assert.equal(f.sqlite.prepare('SELECT reserved_calls FROM aiv2_ondemand_jobs WHERE id=?').get(job.id)!.reserved_calls,14);
 }finally{f.sqlite.close();}
});
test('owner claim leaves a deep job queued when remaining cumulative budget cannot cover full reservation',async()=>{
 const f=await fixture();try{
 await f.owner('heartbeat');const response=await f.call('requests',{board:'As7d2c',path:['check','bet33','call','4h','check'],consent:true});const requested=await response.json();
 const blocked=await (await f.owner('claim',{remainingCalls:9,remainingDecisions:100})).json();assert.deepEqual(blocked,{job:null,budgetBlocked:true});
 assert.equal(f.sqlite.prepare('SELECT status,lease_hash FROM aiv2_ondemand_jobs WHERE id=?').get(requested.id)!.status,'queued');assert.equal(f.sqlite.prepare('SELECT lease_hash FROM aiv2_ondemand_jobs WHERE id=?').get(requested.id)!.lease_hash,null);
 assert.equal((await f.owner('claim',{remainingCalls:101,remainingDecisions:100})).status,400);
 const decisionBlocked=await (await f.owner('claim',{remainingCalls:100,remainingDecisions:4})).json();assert.equal(decisionBlocked.budgetBlocked,true);
 const eligible=await (await f.owner('claim',{remainingCalls:10,remainingDecisions:5})).json();assert.equal(eligible.job.id,requested.id);assert.equal(eligible.job.maxDecisions,5);assert.equal(eligible.job.maxProviderCalls,10);
 }finally{f.sqlite.close();}
});
