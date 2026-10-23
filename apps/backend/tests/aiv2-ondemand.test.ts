import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { routeOnDemand,normalizeBrokerRequest,validateBrokerResult } from '../src/aiv2-ondemand.ts';
import { digest } from '../src/account.ts';
const token='a'.repeat(64),secret='test-only-secret-not-used-outside-fixture';
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0007_accounts.sql','0014_aiv2_ondemand.sql','0015_aiv2_operator_batches.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
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
async function operatorBatch(f:Awaited<ReturnType<typeof fixture>>,overrides:Record<string,unknown>={}){
 const {revision}=await (await f.owner('heartbeat')).json();
 return {batchId:'d'.repeat(64),revision,implementationHash:f.env.AIV2_ONDEMAND_IMPLEMENTATION_HASH,sourceHash:f.env.AIV2_ONDEMAND_SOURCE_HASH,operatorUserId:'user',requests:[{board:'9s8s6d',path:[]},{board:'AhKd7c',path:[]}],maxCalls:4,maxDecisions:2,...overrides};
}
test('operator batch uses real account, immutable idempotent manifest and separate public daily-three',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f);
 assert.equal((await f.owner('operator-batch',{...input,operatorUserId:'missing'})).status,404);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM account_users').get()!.n,1);
 const response=await f.owner('operator-batch',input);assert.equal(response.status,202);const batch=await response.json();assert.equal(batch.jobs.length,2);assert.equal(batch.implementationHash,input.implementationHash);
 assert.equal((await f.owner('operator-batch',input)).status,202);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,2);
 assert.equal((await f.owner('operator-batch',{...input,maxCalls:6})).status,409);
 assert.equal((await f.owner('operator-batch',{...input,requests:[{board:'Qs8s6d',path:[]}]})).status,409);
 for(const board of ['As7d2c','Ks7d2c','Qs7d2c'])assert.equal((await f.call('requests',{board,path:[],consent:true})).status,202);
 assert.equal((await f.call('requests',{board:'Js7d2c',path:[],consent:true})).status,429);
 const ids=batch.jobs.map((j:any)=>j.id);
 const read=await (await f.owner('operator-status',{ids})).json();assert.deepEqual(read.jobs,batch.jobs);
 assert.equal((await f.call('requests/'+ids[0])).status,404); // Owner enqueue does not grant browser job access.
 const {job}=await (await f.owner('claim',{remainingCalls:4,remainingDecisions:2})).json();assert.equal(job.maxProviderCalls,2);
 const result={status:'terminal',snapshot:{status:'terminal',board:job.board,path:job.path,method:'llm-postflop-ondemand-v2',config:{method:'llm-postflop-ondemand-v2',version:'exact-combo-bilingual-srp33-66-125-3bp25-50-100-raise2p5-v2',model:'gpt-6.1-sol',effort:'medium'},scene:null},proof:{revision:job.revision,implementationHash:job.implementationHash,sourceHash:job.sourceHash,validatedStore:true}};
 assert.equal((await f.owner('complete',{id:job.id,leaseToken:job.leaseToken,result})).status,200);
 const scene=await (await f.call('scene?board='+job.board+'&path=%5B%5D')).json();assert.equal(scene.status,'generated');
 assert.equal((await f.owner('operator-batch',input)).status,202);assert.equal(f.sqlite.prepare('SELECT status FROM aiv2_ondemand_jobs WHERE id=?').get(job.id)!.status,'complete');
 }finally{f.sqlite.close();}
});
test('operator batch rejects unbounded inputs and browser/incorrect bearer transports before writes',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f);
 for(const patch of [{maxCalls:201},{maxDecisions:101},{maxCalls:3},{maxDecisions:1},{requests:[]},{requests:Array(51).fill(input.requests[0])},{requests:[input.requests[0],input.requests[0]]},{consent:true}])assert.equal((await f.owner('operator-batch',{...input,...patch})).status,400);
 assert.equal((await f.owner('operator-batch',{...input,sourceHash:'f'.repeat(64)})).status,409);
 const request=(url:string,method:string,headers:Record<string,string>)=>routeOnDemand(new Request(url,{method,headers:{'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(input)}:{})}),f.env);
 const url='https://api.reysonai.com/v1/aiv2/ondemand/owner/operator-batch';
 for(const [url_,method,headers] of [[url,'POST',{}],[url,'POST',{authorization:'Bearer wrong'}],[url,'POST',{authorization:'Bearer '+secret,origin:'https://app.reysonai.com'}],[url.replace('https:','http:'),'POST',{authorization:'Bearer '+secret}],[url,'GET',{authorization:'Bearer '+secret}]] as [string,string,Record<string,string>][])assert.equal((await request(url_,method,headers)).status,403);
 assert.equal((await f.owner('operator-status',{ids:Array(17).fill('a'.repeat(64))})).status,400);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_operator_batches').get()!.n,0);
 }finally{f.sqlite.close();}
});
test('operator batches retain immutable reservations but do not consume public daily96 or slots16',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f);
 for(let i=0;i<16;i++)f.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES (?,'old',?,'[]','user','older','queued',0,2)").run('old'+i,'board'+i);
 assert.equal((await f.owner('operator-batch',input)).status,202);
 assert.equal((await f.owner('operator-batch',input)).status,202);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,18);
 assert.equal(f.sqlite.prepare('SELECT SUM(reserved_calls) n FROM aiv2_ondemand_jobs WHERE operator_batch_id=?').get(input.batchId)!.n,4);
 assert.throws(()=>f.sqlite.prepare('UPDATE aiv2_ondemand_operator_batches SET manifest_hash=? WHERE id=?').run('x',input.batchId));
 }finally{f.sqlite.close();}
 const g=await fixture();try{
 const input=await operatorBatch(g);
 g.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES ('old','old','old','[]','user',?,'failed',0,64)").run(new Date().toISOString().slice(0,10));
 g.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES ('old2','old','old2','[]','user',?,'failed',0,32)").run(new Date().toISOString().slice(0,10));
 assert.equal((await g.owner('operator-batch',input)).status,202);
 assert.equal((await g.call('requests',{board:'As7d2c',path:[],consent:true})).status,429);
 }finally{g.sqlite.close();}
});
function physicalBoards(n:number){const deck=[...'AKQJT98765432'].flatMap(r=>[...'shdc'].map(s=>r+s)),boards:string[]=[];for(let a=0;a<50&&boards.length<n;a++)for(let b=a+1;b<51&&boards.length<n;b++)for(let c=b+1;c<52&&boards.length<n;c++)boards.push(deck[a]+deck[b]+deck[c]);return boards;}
function scopedClaim(input:any,overrides:Record<string,unknown>={}){return {operatorBatchId:input.batchId,revision:input.revision,implementationHash:input.implementationHash,sourceHash:input.sourceHash,remainingCalls:input.maxCalls,remainingDecisions:input.maxDecisions,...overrides};}
test('private fifty check targets reserve exactly100 decisions/200 calls; public quota and slots stay separate',async()=>{
 const f=await fixture();try{
 const requests=physicalBoards(50).map(board=>({board,path:['check']}));
 const input=await operatorBatch(f,{requests,maxCalls:200,maxDecisions:100});
 assert.equal((await f.owner('operator-batch',input)).status,202);
 assert.equal((await f.owner('operator-batch',input)).status,202);
 assert.deepEqual({...f.sqlite.prepare('SELECT COUNT(*) n,SUM(reserved_calls) calls FROM aiv2_ondemand_jobs WHERE operator_batch_id=?').get(input.batchId)},{n:50,calls:200});
 assert.equal((await f.owner('operator-batch',{...input,batchId:'e'.repeat(64),requests:[{board:'Ks7d2c',path:[]}],maxCalls:2,maxDecisions:1})).status,429);
 assert.equal((await f.owner('operator-batch',{...input,maxCalls:201})).status,400);
 assert.equal((await f.owner('operator-batch',{...input,maxDecisions:101})).status,400);
 assert.equal((await f.owner('operator-batch',{...input,requests:[...requests,{board:'Qs7d2c',path:[]}]})).status,400);
 for(const board of ['As7d2c','Ks7d2c','Qs7d2c'])assert.equal((await f.call('requests',{board,path:[],consent:true})).status,202);
 assert.equal((await f.call('requests',{board:'Js7d2c',path:[],consent:true})).status,429);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,53);
 const changed={...input,maxCalls:199};assert.equal((await f.owner('operator-batch',changed)).status,400);
 }finally{f.sqlite.close();}
});
test('scoped claims never take public/other-batch/failed jobs and terminate only after scope settles',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f),other=await operatorBatch(f,{batchId:'e'.repeat(64),requests:[{board:'Ks7d2c',path:[]}],maxCalls:2,maxDecisions:1});
 await f.owner('operator-batch',input);await f.owner('operator-batch',other);await f.call('requests',{board:'As7d2c',path:[],consent:true});
 assert.equal((await f.owner('claim',scopedClaim(input,{operatorBatchId:'f'.repeat(64)}))).status,404);
 assert.equal((await f.owner('claim',scopedClaim(input,{sourceHash:'f'.repeat(64)}))).status,409);
 for(const patch of [{remainingCalls:201},{remainingDecisions:101},{remainingCalls:undefined},{revision:undefined}])assert.ok([400,409].includes((await f.owner('claim',scopedClaim(input,patch))).status));
 const first=await (await f.owner('claim',scopedClaim(input))).json();assert.equal(first.operatorBatchId,input.batchId);assert.equal(first.job.operatorBatchId,input.batchId);
 const second=await (await f.owner('claim',scopedClaim(input))).json();assert.notEqual(second.job.id,first.job.id);
 const active=await (await f.owner('claim',scopedClaim(input))).json();assert.equal(active.job,null);assert.equal(active.scopeComplete,false);
 for(const claimed of [first,second])assert.equal((await f.owner('fail',{id:claimed.job.id,leaseToken:claimed.job.leaseToken,error:'uncertain_provider_outcome'})).status,200);
 const done=await (await f.owner('claim',scopedClaim(input))).json();assert.equal(done.job,null);assert.equal(done.scopeComplete,true);assert.equal(done.scopeFailed,true);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status='queued'").get()!.n,2);
 const snapshots=f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n;
 assert.equal((await f.owner('operator-batch',{...input,batchId:'a'.repeat(64)})).status,409);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,snapshots);
 }finally{f.sqlite.close();}
});
test('scoped claim atomic combined running cap50 and legacy running cap4 cannot be exceeded',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f,{requests:physicalBoards(50).map(board=>({board,path:[]})),maxCalls:100,maxDecisions:50});
 f.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls,lease_until) VALUES ('public-running','other','Ks7d2c','[]','user','older','running',0,2,?)").run(Date.now()+3600000);await f.owner('operator-batch',input);
 const claims=await Promise.all(Array.from({length:51},()=>f.owner('claim',scopedClaim(input))));const values=await Promise.all(claims.map(r=>r.json()));
 assert.equal(values.filter(r=>r.job).length,49);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status='running'").get()!.n,50);
 assert.equal((await (await f.owner('claim')).json()).job,null);
 const next=await operatorBatch(f,{batchId:'e'.repeat(64),requests:[{board:'Ks7d2c',path:[]}],maxCalls:2,maxDecisions:1});assert.equal((await f.owner('operator-batch',next)).status,429);
 }finally{f.sqlite.close();}
 const g=await fixture();try{
 const input=await operatorBatch(g,{requests:physicalBoards(6).map(board=>({board,path:[]})),maxCalls:12,maxDecisions:6});await g.owner('operator-batch',input);
 const claims=await Promise.all(Array.from({length:5},()=>g.owner('claim'))),values=await Promise.all(claims.map(r=>r.json()));assert.equal(values.filter(v=>v.job).length,4);
 assert.equal((await g.owner('claim',{remainingCalls:101,remainingDecisions:100})).status,400);
 }finally{g.sqlite.close();}
});
test('operator pending/failed cross-scope or physical-alias conflicts fail before any new manifest/job insert',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f);await f.owner('operator-batch',input);
 const original=f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_operator_batches').get()!.n;
 for(const patch of [{batchId:'e'.repeat(64),requests:[{board:'Qs7d2c',path:[]},input.requests[0]]},{batchId:'f'.repeat(64),requests:[{board:'8s9s6d',path:[]}]}])assert.equal((await f.owner('operator-batch',{...input,...patch})).status,409);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_operator_batches').get()!.n,original);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,2);
 assert.equal((await f.owner('operator-batch',{...input,batchId:'a'.repeat(64),requests:[{board:'As7d2c',path:[]},{board:'7dAs2c',path:[]}]})).status,400);
 }finally{f.sqlite.close();}
});

test('combined outstanding admission accepts public16 plus operator50 only and scoped low budgets leave jobs queued',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f,{requests:physicalBoards(50).map(board=>({board,path:['check']})),maxCalls:200,maxDecisions:100});
 for(let i=0;i<16;i++)f.sqlite.prepare("INSERT INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls) VALUES (?,'old',?,'[]','user','older','queued',0,2)").run('p'+i,'board'+i);
 assert.equal((await f.owner('operator-batch',input)).status,202);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status IN ('queued','running')").get()!.n,66);
 assert.equal((await f.call('requests',{board:'Ks7d2c',path:[],consent:true})).status,429);
 const blocked=await (await f.owner('claim',scopedClaim(input,{remainingCalls:3}))).json();assert.equal(blocked.job,null);assert.equal(blocked.budgetBlocked,true);assert.equal(blocked.scopeComplete,false);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status='running'").get()!.n,0);
 const expired=await (await f.owner('claim',scopedClaim(input))).json();f.sqlite.prepare('UPDATE aiv2_ondemand_jobs SET lease_until=0 WHERE id=?').run(expired.job.id);
 const next=await (await f.owner('claim',scopedClaim(input))).json();assert.equal(next.job,null);assert.equal(next.scopeFailed,true);assert.equal(next.scopeComplete,false);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status='running'").get()!.n,0);assert.equal(f.sqlite.prepare('SELECT error FROM aiv2_ondemand_jobs WHERE id=?').get(expired.job.id)!.error,'uncertain_provider_outcome');
 }finally{f.sqlite.close();}
});

test('one failed scoped member fences every still-queued sibling without replay or a new lease',async()=>{
 const f=await fixture();try{
 const input=await operatorBatch(f);await f.owner('operator-batch',input);
 const claimed=await (await f.owner('claim',scopedClaim(input))).json();await f.owner('fail',{id:claimed.job.id,leaseToken:claimed.job.leaseToken,error:'uncertain_provider_outcome'});
 const stopped=await (await f.owner('claim',scopedClaim(input))).json();assert.equal(stopped.job,null);assert.equal(stopped.scopeFailed,true);assert.equal(stopped.scopeComplete,false);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status='queued'").get()!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM aiv2_ondemand_jobs WHERE status='running'").get()!.n,0);
 }finally{f.sqlite.close();}
});
test('no-donk API has separate revision, explicit user-rule root with no queue, BTN-only admission and same private authorization',async()=>{
 const f=await fixture();try{
 Object.assign(f.env,{AIV2_NODONK_ENABLED:'true',AIV2_NODONK_IMPLEMENTATION_HASH:'d'.repeat(64),AIV2_NODONK_SOURCE_HASH:'e'.repeat(64)});
 const call=(path:string,value?:unknown,owner=false,auth=true)=>routeOnDemand(new Request('https://api.reysonai.com/v1/aiv2/nodonk/'+(owner?'owner/':'')+path,{method:value===undefined?'GET':'POST',headers:{...(auth?owner?{authorization:'Bearer '+secret}:{cookie:'__Host-reysonai='+token}:{}),...(value===undefined?{}:{'content-type':'application/json',...(!owner?{origin:'https://app.reysonai.com'}:{})})},...(value===undefined?{}:{body:JSON.stringify(value)})}),f.env);
 const root=await call('scene?board=AhKd7c&path=[]');assert.equal(root.status,200);const info=await root.json();assert.equal(info.status,'user_rule');assert.equal(info.userRule.providerCalls,0);assert.equal(info.userRule.authority,'user-instruction');assert.equal(info.userRule.gto_verified,false);
 assert.equal((await call('requests',{board:'AhKd7c',path:[],consent:true})).status,400);
 assert.equal((await call('requests',{board:'AhKd7c',path:['bet33'],consent:true})).status,400);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM aiv2_ondemand_jobs').get()!.n,0);
 assert.equal((await call('heartbeat',{},true,false)).status,403);assert.equal((await call('heartbeat',{},true)).status,200);
 assert.equal((await call('requests',{board:'AhKd7c',path:['check'],consent:true})).status,202);
 const row=f.sqlite.prepare('SELECT * FROM aiv2_ondemand_jobs').get()!;assert.equal(row.reserved_calls,2);assert.equal(row.path_json,'["check"]');
 const capability=await (await call('status')).json();assert.equal(capability.method,'llm-postflop-nodonk-v1');assert.equal(capability.version,'user-rule-no-donk-flop-bb-check-v1');assert.notEqual(capability.revision,(await(await f.call('status')).json()).revision);
 }finally{f.sqlite.close();}
});
