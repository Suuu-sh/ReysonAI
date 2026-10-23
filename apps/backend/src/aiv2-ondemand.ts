// Broker only: no provider imports, API fallback, anonymous generation, or automatic retries.
import { accountTransport, digest, type AccountEnv } from './account.ts';
import type { D1Database } from './postflop.ts';
export type OnDemandEnv = AccountEnv & {
 AIV2_ONDEMAND_ENABLED?:string; AIV2_ONDEMAND_IMPLEMENTATION_HASH?:string;
 AIV2_ONDEMAND_SOURCE_HASH?:string; AIV2_ONDEMAND_BRIDGE_SECRET?:string;
};
const PREFIX='/v1/aiv2/ondemand/';
const METHOD='llm-postflop-ondemand-v2';
const VERSION='exact-combo-bilingual-srp33-66-125-3bp25-50-100-raise2p5-v2';
// Public limits remain unchanged; private operator work has a finite immutable batch budget.
const LIMITS={jobsPerUserDay:3,outstandingGlobal:16,reservedCallsPerDay:96,maxProviderCalls:64,maxDecisions:32};
const OPERATOR_LIMITS={requests:50,maxCalls:200,maxDecisions:100,outstanding:50,combinedOutstanding:66,running:50};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
const isHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type Job={id:string;revision:string;board:string;path_json:string;status:string;result_json:string|null;error:string|null;lease_hash:string|null;lease_until:number|null;reserved_calls:number;operator_batch_id:string|null};
export function normalizeBrokerRequest(board:unknown,path:unknown){
 if(typeof board!=='string'||board.length!==6||!Array.isArray(path)||path.length>64||path.some(v=>typeof v!=='string'||! /^(check|fold|call|raise|allin|bet33|bet66|bet125|[AKQJT98765432][shdc])$/.test(v)))throw Error('invalid_request');
 const cards=board.match(/../g)!;if(new Set(cards).size!==3||cards.some(c=>! /^[AKQJT98765432][shdc]$/.test(c)))throw Error('invalid_request');
 if(1+path.filter(v=>! /^[AKQJT98765432][shdc]$/.test(v)).length>LIMITS.maxDecisions)throw Error('invalid_request');
 return {board,path:path as string[]};
}
async function body(request:Request,max:number):Promise<Record<string,any>>{
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))throw Error('invalid_request');
 if(Number(request.headers.get('content-length'))>max)throw Error('invalid_request');
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_request');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>max){await reader.cancel();throw Error('invalid_request');}chunks.push(next.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_request');return value;
}
function publicJob(row:Job){return {id:row.id,status:row.status,board:row.board,path:JSON.parse(row.path_json),...(row.result_json?{result:JSON.parse(row.result_json)}:{}),...(row.error?{error:row.error}:{})};}
export function validateBrokerResult(result:any,job:Pick<Job,'board'|'path_json'|'revision'>,implementationHash:string,sourceHash:string){
 if(!result||!['generated','terminal','chance','zero-reach'].includes(result.status))throw Error('invalid_result');
 const snapshot=result.snapshot,proof=result.proof;
 if(!snapshot||snapshot.board!==job.board||!equal(snapshot.path,JSON.parse(job.path_json))||snapshot.status!==result.status||snapshot.method!==METHOD||snapshot.config?.method!==METHOD||snapshot.config?.version!==VERSION||snapshot.config?.model!=='gpt-6.1-sol'||snapshot.config?.effort!=='medium'||!proof||proof.revision!==job.revision||proof.implementationHash!==implementationHash||proof.sourceHash!==sourceHash||proof.validatedStore!==true)throw Error('invalid_result');
 if(result.status==='generated'){
  const p=snapshot.scene?.provenance,r=snapshot.scene?.review;
  if(!p||p.method!==METHOD||p.model!=='gpt-6.1-sol'||p.effort!=='medium'||p.independent_gto_approved!==false||r?.production_approved!==false||!isHash(p.artifact_hash)||!Array.isArray(snapshot.scene.cells)||snapshot.scene.cells.length!==169)throw Error('invalid_result');
 }else if(snapshot.scene!==null)throw Error('invalid_result');
 // Numerical, legal-path and provider-call verification occurs in the trusted Mac store.
 // This adapter validates identity and transport bounds, not independent poker correctness.
 return {...result,validation:'owner-validated-cache-not-independent-gto'};
}
export async function routeOnDemand(request:Request,env:OnDemandEnv):Promise<Response>{
 try{return await handle(request,env);}catch(error){return json({error:error instanceof Error&&['invalid_request','invalid_result'].includes(error.message)?error.message:'ondemand_service_unavailable'},error instanceof Error&&['invalid_request','invalid_result'].includes(error.message)?400:503);}
}
async function handle(request:Request,env:OnDemandEnv):Promise<Response>{
 const implementationHash=env.AIV2_ONDEMAND_IMPLEMENTATION_HASH,sourceHash=env.AIV2_ONDEMAND_SOURCE_HASH;
 if(env.AIV2_ONDEMAND_ENABLED!=='true'||env.AUTH_ENABLED!=='true'||!env.DB||!isHash(implementationHash)||!isHash(sourceHash)||!env.AIV2_ONDEMAND_BRIDGE_SECRET||env.AIV2_ONDEMAND_BRIDGE_SECRET.length<32)return json({enabled:false,error:'ondemand_not_enabled'},503);
 const revision=await digest(JSON.stringify({method:METHOD,version:VERSION,implementationHash,sourceHash}));
 const url=new URL(request.url),path=url.pathname.slice(PREFIX.length),db=env.DB as D1Database,now=Date.now(),day=new Date(now).toISOString().slice(0,10);
 const query=async<T=Job>(sql:string,...args:unknown[])=>(await db.prepare(sql).bind(...args).all<T>()).results;
 if(path.startsWith('owner/')){
  if(url.protocol!=='https:'||request.method!=='POST'||request.headers.has('origin'))return json({error:'bridge_forbidden'},403);
  const auth=request.headers.get('authorization')??'';
  if(!auth.startsWith('Bearer ')||await digest(auth.slice(7))!==await digest(env.AIV2_ONDEMAND_BRIDGE_SECRET))return json({error:'bridge_forbidden'},403);
  const input=await body(request,path==='owner/complete'?1_800_000:path==='owner/operator-batch'?32768:4096);
  if(path==='owner/operator-status'){
   if(Object.keys(input).some(k=>k!=='ids')||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>16||input.ids.some((id:unknown)=>!isHash(id)))throw Error('invalid_request');
   const jobs:Array<ReturnType<typeof publicJob>>=[];for(const id of input.ids){const [job]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=? AND revision=?',id,revision);if(job)jobs.push(publicJob(job));}
   return json({revision,implementationHash,sourceHash,jobs});
  }
  if(path==='owner/operator-batch'){
   if(Object.keys(input).some(k=>!['batchId','revision','implementationHash','sourceHash','requests','maxCalls','maxDecisions','operatorUserId'].includes(k))||typeof input.operatorUserId!=='string'||input.operatorUserId.length<1||input.operatorUserId.length>200||!isHash(input.batchId)||!Array.isArray(input.requests)||input.requests.length<1||input.requests.length>OPERATOR_LIMITS.requests||!Number.isInteger(input.maxCalls)||input.maxCalls<1||input.maxCalls>OPERATOR_LIMITS.maxCalls||!Number.isInteger(input.maxDecisions)||input.maxDecisions<1||input.maxDecisions>OPERATOR_LIMITS.maxDecisions)throw Error('invalid_request');
   if(input.revision!==revision||input.implementationHash!==implementationHash||input.sourceHash!==sourceHash)return json({error:'pin_mismatch'},409);
   const requests=input.requests.map((item:any)=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['board','path'].includes(k)))throw Error('invalid_request');return normalizeBrokerRequest(item.board,item.path);});
   const keys=requests.map((item:any)=>JSON.stringify({board:(item.board.match(/../g)??[]).sort().join(''),path:item.path}));
   const reservedCalls=requests.map((item:any)=>2*(1+item.path.filter((v:string)=>! /^[AKQJT98765432][shdc]$/.test(v)).length));
   const totalCalls=reservedCalls.reduce((sum:number,n:number)=>sum+n,0);
   if(new Set(keys).size!==keys.length||totalCalls>input.maxCalls||totalCalls/2>input.maxDecisions)throw Error('invalid_request');
   // Explicit existing account, authorized by the private owner bearer; never invent users.
   const creator=input.operatorUserId;
   const [operator]=await query<{id:string}>('SELECT id FROM account_users WHERE id=?',creator);
   if(!operator)return json({error:'operator_account_not_found'},404);
   const manifest=await digest(JSON.stringify({revision,operatorUserId:creator,requests,maxCalls:input.maxCalls,maxDecisions:input.maxDecisions}));
   const [priorBatch]=await query<{manifest_hash:string}>('SELECT manifest_hash FROM aiv2_ondemand_operator_batches WHERE id=?',input.batchId);
   if(priorBatch&&priorBatch.manifest_hash!==manifest)return json({error:'batch_conflict'},409);
   const targets:Array<{id:string;board:string;path_json:string;reserved_calls:number;aliases:string[]}>=[];
   // Check the whole list before inserting a manifest/job. Failed targets cannot be
   // resurrected with a new batch ID, and pending work cannot change batch owner.
   for(let i=0;i<requests.length;i++){
    const request=requests[i],id=await digest(JSON.stringify({revision,...request})),cards=request.board.match(/../g)!;
    const aliases=[cards.join(''),cards[0]+cards[2]+cards[1],cards[1]+cards[0]+cards[2],cards[1]+cards[2]+cards[0],cards[2]+cards[0]+cards[1],cards[2]+cards[1]+cards[0]];
    const rows=await query('SELECT * FROM aiv2_ondemand_jobs WHERE revision=? AND path_json=? AND board IN (?,?,?,?,?,?)',revision,JSON.stringify(request.path),...aliases);
    if(rows.some(row=>row.board!==request.board))return json({error:'physical_board_alias_conflict'},409);
    if(rows.some(row=>row.status==='failed'))return json({error:'batch_scope_failed_job'},409);
    if(rows.some(row=>['queued','running'].includes(row.status)&&row.operator_batch_id!==input.batchId))return json({error:'batch_scope_conflict'},409);
    targets.push({id,board:request.board,path_json:JSON.stringify(request.path),reserved_calls:reservedCalls[i],aliases});
   }
   await query('INSERT OR IGNORE INTO aiv2_ondemand_operator_batches(id,manifest_hash,operator_user_id,created_at) VALUES (?,?,?,?)',input.batchId,manifest,creator,now);
   const [batch]=await query<{manifest_hash:string}>('SELECT manifest_hash FROM aiv2_ondemand_operator_batches WHERE id=?',input.batchId);
   if(batch?.manifest_hash!==manifest)return json({error:'batch_conflict'},409);
   const jobs:Array<ReturnType<typeof publicJob>>=[];
   // One atomic INSERT SELECT admits the explicit list only if its NEW reservations
   // fit. Concurrent batches cannot cross either slot limit or steal pending aliases.
   const payload=JSON.stringify(targets);
   await query(`INSERT OR IGNORE INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls,operator_batch_id)
 SELECT json_extract(t.value,'$.id'),?,json_extract(t.value,'$.board'),json_extract(t.value,'$.path_json'),?,?,'queued',?,json_extract(t.value,'$.reserved_calls'),? FROM json_each(?) t WHERE
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE operator_batch_id IS NOT NULL AND status IN ('queued','running'))+(SELECT COUNT(*) FROM json_each(?) n WHERE NOT EXISTS(SELECT 1 FROM aiv2_ondemand_jobs j WHERE j.id=json_extract(n.value,'$.id')))<=? AND
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE status IN ('queued','running'))+(SELECT COUNT(*) FROM json_each(?) n WHERE NOT EXISTS(SELECT 1 FROM aiv2_ondemand_jobs j WHERE j.id=json_extract(n.value,'$.id')))<=? AND
 (SELECT COALESCE(SUM(reserved_calls),0) FROM aiv2_ondemand_jobs WHERE operator_batch_id=?)+(SELECT COALESCE(SUM(json_extract(n.value,'$.reserved_calls')),0) FROM json_each(?) n WHERE NOT EXISTS(SELECT 1 FROM aiv2_ondemand_jobs j WHERE j.id=json_extract(n.value,'$.id')))<=? AND
 NOT EXISTS(SELECT 1 FROM json_each(?) n JOIN aiv2_ondemand_jobs j ON j.revision=? AND j.path_json=json_extract(n.value,'$.path_json') AND j.board IN (SELECT value FROM json_each(n.value,'$.aliases')) WHERE j.board!=json_extract(n.value,'$.board') OR j.status='failed' OR (j.status IN ('queued','running') AND (j.operator_batch_id IS NULL OR j.operator_batch_id!=?)))`,revision,creator,day,now,input.batchId,payload,payload,OPERATOR_LIMITS.outstanding,payload,OPERATOR_LIMITS.combinedOutstanding,input.batchId,payload,input.maxCalls,payload,revision,input.batchId);
   for(const target of targets){
    const [job]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=? AND revision=?',target.id,revision);
    if(job&&job.status==='failed')return json({error:'batch_scope_failed_job'},409);
    if(job&&['queued','running'].includes(job.status)&&job.operator_batch_id!==input.batchId)return json({error:'batch_scope_conflict'},409);
    if(job)jobs.push(publicJob(job));
   }
   const exhausted=jobs.length!==requests.length;
   return json({batchId:input.batchId,revision,implementationHash,sourceHash,maxCalls:input.maxCalls,maxDecisions:input.maxDecisions,jobs,...(exhausted?{error:'generation_budget_exhausted'}:{})},exhausted?429:202);
  }
  if(path==='owner/heartbeat'){
   if(Object.keys(input).some(k=>!['id','leaseToken','revision','implementationHash','sourceHash'].includes(k))||((input.id!==undefined||input.leaseToken!==undefined)&&(!isHash(input.id)||typeof input.leaseToken!=='string'||input.leaseToken.length>200)))throw Error('invalid_request');
   if((input.revision!==undefined&&input.revision!==revision)||(input.implementationHash!==undefined&&input.implementationHash!==implementationHash)||(input.sourceHash!==undefined&&input.sourceHash!==sourceHash))return json({error:'pin_mismatch'},409);
   if(input.id){
    const rows=await query("UPDATE aiv2_ondemand_jobs SET lease_until=? WHERE id=? AND revision=? AND status='running' AND lease_hash=? AND lease_until>? RETURNING id",now+120*60*1000,input.id,revision,await digest(input.leaseToken),now);
    if(!rows.length)return json({error:'lease_conflict'},409);
   }
   await query('INSERT INTO aiv2_ondemand_owner(singleton,revision,heartbeat_at) VALUES (1,?,?) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision,heartbeat_at=excluded.heartbeat_at',revision,now);
   return json({ok:true,revision});
  }
  if(path==='owner/claim'){
   const scoped=Object.hasOwn(input,'operatorBatchId');
   if(Object.keys(input).some(k=>!(scoped?['operatorBatchId','remainingCalls','remainingDecisions','revision','implementationHash','sourceHash']:['remainingCalls','remainingDecisions']).includes(k)))throw Error('invalid_request');
   if(scoped&&!isHash(input.operatorBatchId))throw Error('invalid_request');
   const remainingCalls=input.remainingCalls??(scoped?NaN:100),remainingDecisions=input.remainingDecisions??(scoped?NaN:100);
   if(!Number.isInteger(remainingCalls)||remainingCalls<1||remainingCalls>(scoped?OPERATOR_LIMITS.maxCalls:100)||!Number.isInteger(remainingDecisions)||remainingDecisions<1||remainingDecisions>100)throw Error('invalid_request');
   if(scoped){
    if(input.revision!==revision||input.implementationHash!==implementationHash||input.sourceHash!==sourceHash)return json({error:'pin_mismatch'},409);
    const [batch]=await query('SELECT id FROM aiv2_ondemand_operator_batches WHERE id=?',input.operatorBatchId);
    if(!batch)return json({error:'operator_batch_not_found'},404);
    if((await query('SELECT id FROM aiv2_ondemand_jobs WHERE operator_batch_id=? AND revision!=? LIMIT 1',input.operatorBatchId,revision)).length)return json({error:'pin_mismatch'},409);
   }
   // Lease expiry means possibly consumed subscription quota: never requeue it.
   await query("UPDATE aiv2_ondemand_jobs SET status='failed',error='uncertain_provider_outcome' WHERE status='running' AND lease_until<=?",now);
   const token=crypto.randomUUID()+crypto.randomUUID(),leaseHash=await digest(token);
   const scopeSql=scoped?' AND operator_batch_id=?':'',scopeArgs=scoped?[input.operatorBatchId]:[],failedScopeSql=scoped?" AND NOT EXISTS(SELECT 1 FROM aiv2_ondemand_jobs WHERE operator_batch_id=? AND status='failed')":'';
   const [job]=await query(`UPDATE aiv2_ondemand_jobs SET status='running',lease_hash=?,lease_until=? WHERE id=(SELECT id FROM aiv2_ondemand_jobs WHERE status='queued' AND revision=? AND reserved_calls<=? AND reserved_calls/2<=?${scopeSql} ORDER BY created_at,id LIMIT 1) AND status='queued' AND (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE status='running')<?${failedScopeSql} RETURNING *`,leaseHash,now+120*60*1000,revision,remainingCalls,remainingDecisions,...scopeArgs,scoped?OPERATOR_LIMITS.running:4,...scopeArgs);
   const queued=job?[]:await query(`SELECT id FROM aiv2_ondemand_jobs WHERE status='queued' AND revision=?${scopeSql} LIMIT 1`,revision,...scopeArgs);
   const running=scoped&&!job?await query("SELECT id FROM aiv2_ondemand_jobs WHERE status='running' AND revision=? AND operator_batch_id=? LIMIT 1",revision,input.operatorBatchId):[];
   const failed=scoped?await query("SELECT id FROM aiv2_ondemand_jobs WHERE status='failed' AND revision=? AND operator_batch_id=? LIMIT 1",revision,input.operatorBatchId):[];
   return json({...(scoped?{operatorBatchId:input.operatorBatchId}:{}),job:job?{id:job.id,board:job.board,path:JSON.parse(job.path_json),revision,implementationHash,sourceHash,leaseToken:token,maxProviderCalls:job.reserved_calls,maxDecisions:job.reserved_calls/2,...(scoped?{operatorBatchId:job.operator_batch_id}:{})}:null,...(!job&&queued.length?{budgetBlocked:true}:{}),...(scoped?{scopeFailed:failed.length>0}:{}),...(scoped&&!job?{scopeComplete:queued.length===0&&running.length===0}:{})});
  }
  if(!['owner/complete','owner/fail'].includes(path)||!isHash(input.id)||typeof input.leaseToken!=='string'||input.leaseToken.length>200)return json({error:'invalid_request'},400);
  const [job]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=? AND revision=? AND lease_hash=?',input.id,revision,await digest(input.leaseToken));
  if(!job)return json({error:'lease_conflict'},409);
  if(path==='owner/complete'&&job.status==='complete'){
   const result=validateBrokerResult(input.result,job,implementationHash,sourceHash);
   return equal(JSON.parse(job.result_json!),result)?json({ok:true,replayed:true}):json({error:'lease_conflict'},409);
  }
  if(job.status!=='running'||!job.lease_until||job.lease_until<=now)return json({error:'lease_conflict'},409);
  if(path==='owner/fail'){
   if(!['generation_failed','budget_exhausted','uncertain_provider_outcome'].includes(input.error))return json({error:'invalid_request'},400);
   const rows=await query("UPDATE aiv2_ondemand_jobs SET status='failed',error=?,lease_hash=NULL WHERE id=? AND status='running' AND lease_hash=? AND lease_until>? RETURNING id",input.error,job.id,job.lease_hash,now);
   return json({ok:rows.length===1},rows.length?200:409);
  }
  const result=validateBrokerResult(input.result,job,implementationHash,sourceHash),text=JSON.stringify(result);
  const rows=await query("UPDATE aiv2_ondemand_jobs SET status='complete',result_json=? WHERE id=? AND status='running' AND lease_hash=? AND lease_until>? RETURNING id",text,job.id,job.lease_hash,now);
  return json({ok:rows.length===1},rows.length?200:409);
 }
 if(!env.AUTH_APP_URL||!env.GOOGLE_REDIRECT_URI||!env.AUTH_RATE_LIMIT_KEY)return json({error:'ondemand_not_configured'},503);
 const origins=(env.ALLOWED_ORIGIN??'').split(',').map(v=>v.trim()).filter(v=>v&&v!=='*');
 const transport=accountTransport(url,new URL(env.AUTH_APP_URL),new URL(env.GOOGLE_REDIRECT_URI),origins,env.AUTH_LOCAL_DEV);
 if(!transport)return json({error:'ondemand_not_configured'},503);
 if(request.method==='POST'&&(!origins.includes(request.headers.get('origin')??'')||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??'')||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'invalid_origin_or_content_type'},403);
 const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(transport.session+'='))?.slice(transport.session.length+1);
 const users=token&&isHash(token)?await query<{id:string}>('SELECT u.id FROM account_users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',await digest(token),Math.floor(now/1000)):[];
 if(!users.length)return json({error:'sign_in_required'},401);
 const user=users[0].id;
 const ownerRows=await query<{heartbeat_at:number}>('SELECT heartbeat_at FROM aiv2_ondemand_owner WHERE singleton=1 AND revision=?',revision);
 const ownerOnline=!!ownerRows.length&&ownerRows[0].heartbeat_at>now-90000;
 if(request.method==='GET'&&path==='status')return json({enabled:true,ownerOnline,revision,implementationHash,sourceHash,limits:LIMITS});
 if(request.method==='GET'&&path==='scene'){
  if(url.searchParams.getAll('board').length!==1||url.searchParams.getAll('path').length!==1||(url.searchParams.get('path')?.length??0)>1400)throw Error('invalid_request');
  const input=normalizeBrokerRequest(url.searchParams.get('board'),JSON.parse(url.searchParams.get('path')!));
  const [job]=await query("SELECT * FROM aiv2_ondemand_jobs WHERE revision=? AND board=? AND path_json=? AND status='complete'",revision,input.board,JSON.stringify(input.path));
  return json(job?{status:'generated',result:JSON.parse(job.result_json!)}:{status:'not_generated'});
 }
 if(request.method==='GET'&&/^requests\/[a-f0-9]{64}$/.test(path)){
  const [job]=await query('SELECT j.* FROM aiv2_ondemand_jobs j JOIN aiv2_ondemand_access a ON a.job_id=j.id WHERE j.id=? AND j.revision=? AND a.user_id=?',path.slice(9),revision,user);
  return job?json(publicJob(job)):json({error:'not_found'},404);
 }
 if(request.method!=='POST'||path!=='requests')return json({error:'not_found'},404);
 const input=await body(request,4096);
 if(input.consent!==true||Object.keys(input).some(k=>!['board','path','consent'].includes(k)))throw Error('invalid_request');
 const normalized=normalizeBrokerRequest(input.board,input.path),pathJSON=JSON.stringify(normalized.path),id=await digest(JSON.stringify({revision,...normalized}));
 const reservedCalls=2*(1+normalized.path.filter(v=>! /^[AKQJT98765432][shdc]$/.test(v)).length);
 const [rate]=await query<{count:number}>('INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',`ondemand:${user}:${Math.floor(now/60000)}`,Math.floor(now/1000)+120);
 if(rate.count>30)return json({error:'rate_limited'},429);
 const [existing]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=?',id);
 if(!existing&&!ownerOnline)return json({error:'owner_offline'},503);
 // One atomic INSERT SELECT preserves public-only account/day/slot limits and the combined hard bound.
 await query(`INSERT OR IGNORE INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls)
 SELECT ?,?,?,?,?,?,'queued',?,? WHERE
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE creator=? AND day=? AND operator_batch_id IS NULL)<? AND
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE status IN ('queued','running') AND operator_batch_id IS NULL)<? AND
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE status IN ('queued','running'))<? AND
 (SELECT COALESCE(SUM(reserved_calls),0) FROM aiv2_ondemand_jobs WHERE day=? AND operator_batch_id IS NULL)+?<=?`,id,revision,normalized.board,pathJSON,user,day,now,reservedCalls,user,day,LIMITS.jobsPerUserDay,LIMITS.outstandingGlobal,OPERATOR_LIMITS.combinedOutstanding,day,reservedCalls,LIMITS.reservedCallsPerDay);
 const [job]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=?',id);
 if(!job)return json({error:'generation_budget_exhausted'},429);
 await query('INSERT OR IGNORE INTO aiv2_ondemand_access(job_id,user_id) VALUES (?,?)',id,user);
 return json(publicJob(job),202);
}
