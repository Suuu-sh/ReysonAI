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
const LIMITS={jobsPerUserDay:3,outstandingGlobal:16,reservedCallsPerDay:96,maxProviderCalls:64,maxDecisions:32};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
const isHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type Job={id:string;revision:string;board:string;path_json:string;status:string;result_json:string|null;error:string|null;lease_hash:string|null;lease_until:number|null;reserved_calls:number};
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
   if(Object.keys(input).some(k=>!['batchId','revision','implementationHash','sourceHash','requests','maxCalls','maxDecisions','operatorUserId'].includes(k))||typeof input.operatorUserId!=='string'||input.operatorUserId.length<1||input.operatorUserId.length>200||!isHash(input.batchId)||!Array.isArray(input.requests)||input.requests.length<1||input.requests.length>16||!Number.isInteger(input.maxCalls)||input.maxCalls<1||input.maxCalls>100||!Number.isInteger(input.maxDecisions)||input.maxDecisions<1||input.maxDecisions>100)throw Error('invalid_request');
   if(input.revision!==revision||input.implementationHash!==implementationHash||input.sourceHash!==sourceHash)return json({error:'pin_mismatch'},409);
   const requests=input.requests.map((item:any)=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['board','path'].includes(k)))throw Error('invalid_request');return normalizeBrokerRequest(item.board,item.path);});
   const keys=requests.map((item:any)=>JSON.stringify(item));
   const reservedCalls=requests.map((item:any)=>2*(1+item.path.filter((v:string)=>! /^[AKQJT98765432][shdc]$/.test(v)).length));
   const totalCalls=reservedCalls.reduce((sum:number,n:number)=>sum+n,0);
   if(new Set(keys).size!==keys.length||totalCalls>input.maxCalls||totalCalls/2>input.maxDecisions)throw Error('invalid_request');
   // Explicit existing account, authorized by the private owner bearer; never invent users.
   const creator=input.operatorUserId;
   const [operator]=await query<{id:string}>('SELECT id FROM account_users WHERE id=?',creator);
   if(!operator)return json({error:'operator_account_not_found'},404);
   const manifest=await digest(JSON.stringify({revision,operatorUserId:creator,requests,maxCalls:input.maxCalls,maxDecisions:input.maxDecisions}));
   await query('INSERT OR IGNORE INTO aiv2_ondemand_operator_batches(id,manifest_hash,operator_user_id,created_at) VALUES (?,?,?,?)',input.batchId,manifest,creator,now);
   const [batch]=await query<{manifest_hash:string}>('SELECT manifest_hash FROM aiv2_ondemand_operator_batches WHERE id=?',input.batchId);
   if(batch?.manifest_hash!==manifest)return json({error:'batch_conflict'},409);
   const jobs:Array<ReturnType<typeof publicJob>>=[];
   for(let i=0;i<requests.length;i++){
    const normalized=requests[i],id=await digest(JSON.stringify({revision,...normalized}));
    // Each atomic insert still shares the public global outstanding/daily reservation bounds.
    // Batch total is structurally bounded above; terminal canonical jobs are never requeued.
    await query(`INSERT OR IGNORE INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls,operator_batch_id)
 SELECT ?,?,?,?,?,?,'queued',?,?,? WHERE
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE status IN ('queued','running'))<? AND
 (SELECT COALESCE(SUM(reserved_calls),0) FROM aiv2_ondemand_jobs WHERE day=?)+?<=? AND
 (SELECT COALESCE(SUM(reserved_calls),0) FROM aiv2_ondemand_jobs WHERE operator_batch_id=?)+?<=?`,id,revision,normalized.board,JSON.stringify(normalized.path),creator,day,now,reservedCalls[i],input.batchId,LIMITS.outstandingGlobal,day,reservedCalls[i],LIMITS.reservedCallsPerDay,input.batchId,reservedCalls[i],input.maxCalls);
    const [job]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=? AND revision=?',id,revision);if(job)jobs.push(publicJob(job));
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
   if(Object.keys(input).some(k=>!['remainingCalls','remainingDecisions'].includes(k)))throw Error('invalid_request');
   const remainingCalls=input.remainingCalls??100,remainingDecisions=input.remainingDecisions??100;
   if(!Number.isInteger(remainingCalls)||remainingCalls<1||remainingCalls>100||!Number.isInteger(remainingDecisions)||remainingDecisions<1||remainingDecisions>100)throw Error('invalid_request');
   // Lease expiry means possibly consumed subscription quota: never requeue it.
   await query("UPDATE aiv2_ondemand_jobs SET status='failed',error='uncertain_provider_outcome' WHERE status='running' AND lease_until<=?",now);
   const token=crypto.randomUUID()+crypto.randomUUID(),leaseHash=await digest(token);
   const [job]=await query("UPDATE aiv2_ondemand_jobs SET status='running',lease_hash=?,lease_until=? WHERE id=(SELECT id FROM aiv2_ondemand_jobs WHERE status='queued' AND revision=? AND reserved_calls<=? AND reserved_calls/2<=? ORDER BY created_at,id LIMIT 1) AND status='queued' RETURNING *",leaseHash,now+120*60*1000,revision,remainingCalls,remainingDecisions);
   const queued=job?[]:await query("SELECT id FROM aiv2_ondemand_jobs WHERE status='queued' AND revision=? LIMIT 1",revision);
   return json({job:job?{id:job.id,board:job.board,path:JSON.parse(job.path_json),revision,implementationHash,sourceHash,leaseToken:token,maxProviderCalls:job.reserved_calls,maxDecisions:job.reserved_calls/2}:null,...(!job&&queued.length?{budgetBlocked:true}:{})});
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
 // One atomic INSERT SELECT enforces both per-account and global provider budgets.
 await query(`INSERT OR IGNORE INTO aiv2_ondemand_jobs(id,revision,board,path_json,creator,day,status,created_at,reserved_calls)
 SELECT ?,?,?,?,?,?,'queued',?,? WHERE
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE creator=? AND day=? AND operator_batch_id IS NULL)<? AND
 (SELECT COUNT(*) FROM aiv2_ondemand_jobs WHERE status IN ('queued','running'))<? AND
 (SELECT COALESCE(SUM(reserved_calls),0) FROM aiv2_ondemand_jobs WHERE day=?)+?<=?`,id,revision,normalized.board,pathJSON,user,day,now,reservedCalls,user,day,LIMITS.jobsPerUserDay,LIMITS.outstandingGlobal,day,reservedCalls,LIMITS.reservedCallsPerDay);
 const [job]=await query('SELECT * FROM aiv2_ondemand_jobs WHERE id=?',id);
 if(!job)return json({error:'generation_budget_exhausted'},429);
 await query('INSERT OR IGNORE INTO aiv2_ondemand_access(job_id,user_id) VALUES (?,?)',id,user);
 return json(publicJob(job),202);
}
