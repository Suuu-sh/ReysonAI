// Explicit owner-only outbound bridge. Importing this file performs no network/model work.
// Frozen generation/store modules are reused without changing their implementation identity.
import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { generateOne } from './aiv2-postflop-ondemand-cli.ts';
import { postflopHash as hash } from './aiv2-postflop-ondemand.ts';
import { CONFIG, DEFAULT_STORE, DEFAULT_SOURCE, implementationHash, loadRoot, resolveFrontier, loadDecision, saveDecision, normalizeRequest } from './aiv2-postflop-ondemand-store.ts';
import { createAiv2SessionProvider } from './lib/aiv2-provider-session.ts';

type Job = { id:string; board:string; path:string[]; revision:string; implementationHash:string; sourceHash:string; leaseToken:string; maxProviderCalls:number; maxDecisions:number; operatorBatchId?:string };
type BridgeResult={status:string;calls:number;decisions:number;jobs:number;operatorBatchId?:string;scopeComplete?:boolean};
type Provider = { withSession:(fn:any)=>Promise<any>; close:()=>void; drain:()=>Promise<void> };
type Snapshot = { board:string; path:string[]; status:string; method:string; scene:unknown; [key:string]:unknown };
// Runtime adapter boundary: the existing dashboard is not part of strict tooling's source graph.
// This does not relax the bridge's compiler settings; returned identity is checked explicitly.
async function onDemandSnapshot(board:string,path:string[],root:string,source:string):Promise<Snapshot>{
 const modulePath='../../range-dashboard/ondemand.ts';
 const adapter=await import(modulePath) as {onDemandSnapshot:(board:string,path:string[],root:string,source:string)=>Promise<unknown>};
 const snapshot=await adapter.onDemandSnapshot(board,path,root,source);
 if(!snapshot||typeof snapshot!=='object')throw failure('snapshot_adapter_invalid');
 const value=snapshot as Snapshot;
 if(value.board!==board||hash(value.path)!==hash(path)||value.method!==CONFIG.method||typeof value.status!=='string'||!Object.hasOwn(value,'scene'))throw failure('snapshot_adapter_invalid');
 return value;
}
type Options = {
 origin:string; bearerFile:string; allowLoopback?:boolean; watch?:boolean; retryCompletion?:boolean;
 maxDecisions?:number; maxCalls?:number; concurrency?:number; operatorBatchId?:string; root?:string; source?:string; runtimePath?:string;
 // Injection points are for isolated tests; the CLI never accepts these dependencies.
 fetch?:typeof fetch; providerFactory?:(onMetric:(m:any)=>void)=>Provider;
 heartbeatMs?:number; pollMs?:number; signal?:AbortSignal;
};
const isHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const failure=(code:string)=>Object.assign(new Error(code),{code});
// Diagnostics never copy messages, prompts, outputs, stderr, unknown codes or capabilities.
type DiagnosticPhase='startup'|'pin_validation'|'claim'|'job_validation'|'lease_heartbeat'|'idle_heartbeat'|'provider'|'decision_validation'|'completion_validation'|'completion_upload'|'failure_upload'|'provider_drain';
function bridgeDiagnostics(){
 const started=Date.now(),codes=new Set(['quota_or_rate_limit','authentication_required','unsupported_model_effort_or_schema','upstream_error','process_failed','process_exited','transport_closed','session_lost','provider_closed','timeout','invalid_json','protocol_error','response_too_large','unexpected_server_request','missing_turn','missing_thread','model_or_effort_mismatch','unexpected_tool_call','overlapping_session_turn','session_closed_during_turn','bridge_transport_uncertain','bridge_lease_conflict','bridge_request_failed','bridge_response_invalid','pins_changed','budget_exhausted','invalid_or_stale_claim','snapshot_adapter_invalid','incomplete_validated_store','uncertain_provider_outcome','completion_upload_requires_explicit_retry','operator_scope_failed']);
 const code=(value:unknown)=>typeof value==='string'&&codes.has(value)?value:'unclassified_failure';
 type Cause={code:string;phase:DiagnosticPhase;at:string;elapsed_ms:number;job_id?:string};
 const state:{first_failure:Cause|null;jobs:Record<string,{metrics:Record<string,unknown>[];failure?:Cause}>}={first_failure:null,jobs:{}};
 const job=(id:string)=>state.jobs[id]??={metrics:[]};
 return {state,recordFailure(error:unknown,phase:DiagnosticPhase,id?:string){
  const cause:Cause={code:code((error as any)?.code),phase,at:new Date().toISOString(),elapsed_ms:Math.max(0,Date.now()-started)};
  if(isHash(id))cause.job_id=id;
  state.first_failure??=cause;if(isHash(id))job(id).failure??=cause;
 },recordMetric(id:string,value:any){
  if(!isHash(id)||!value||typeof value!=='object')return;
  const metric:Record<string,unknown>={at:new Date().toISOString()};
  if(['completed','failed'].includes(value.status))metric.status=value.status;
  if(value.errorCode!==undefined)metric.errorCode=code(value.errorCode);
  for(const key of ['threadId','turnId'])if(typeof value[key]==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value[key]))metric[key]=value[key];
  for(const key of ['model','confirmedModel'])if(value[key]===CONFIG.model)metric[key]=CONFIG.model;
  for(const key of ['effort','confirmedEffort'])if(value[key]===CONFIG.effort)metric[key]=CONFIG.effort;
  for(const key of ['elapsedMs','sessionTurn'])if(Number.isSafeInteger(value[key])&&value[key]>=0&&value[key]<=3_600_000)metric[key]=value[key];
  if(job(id).metrics.length<64)job(id).metrics.push(metric);
 }};
}
export function bridgeOrigin(value:string,allowLoopback=false){
 let u:URL;try{u=new URL(value);}catch{throw failure('invalid_bridge_origin');}
 const prod=u.protocol==='https:'&&u.hostname==='api.reysonai.com'&&(!u.port||u.port==='443');
 const loop=allowLoopback&&u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname)&&!!u.port;
 if((!prod&&!loop)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw failure('invalid_bridge_origin');
 return u.origin;
}
function budget(value:number|undefined,fallback:number,maximum=100){const n=value??fallback;if(!Number.isInteger(n)||n<1||n>maximum)throw failure('invalid_bridge_budget');return n;}
function readBearer(path:string){
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>4096)throw failure('unsafe_bearer_file');
 const token=readFileSync(path,'utf8').trim();if(token.length<32||token.length>4096||/\s/.test(token))throw failure('invalid_bearer_file');return token;
}
export function validateBridgeJob(value:any,implementation:string,sourceHash:string,operatorBatchId?:string):asserts value is Job {
 if(!value||operatorBatchId!==undefined&&value.operatorBatchId!==operatorBatchId)throw failure('invalid_or_stale_claim');
 const request=normalizeRequest(value.board,value.path);
 const pathDecisions=1+request.path.filter(token=>! /^[AKQJT98765432][shdc]$/.test(token)).length;
 if(!value||!isHash(value.id)||!isHash(value.revision)||value.implementationHash!==implementation||value.sourceHash!==sourceHash||
  value.id!==hash({revision:value.revision,...request})||
  value.revision!==hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash})||
  typeof value.leaseToken!=='string'||value.leaseToken.length<32||value.leaseToken.length>200||
  !Number.isInteger(value.maxDecisions)||value.maxDecisions<1||value.maxDecisions>32||value.maxDecisions!==pathDecisions||
  !Number.isInteger(value.maxProviderCalls)||value.maxProviderCalls<1||value.maxProviderCalls>64||value.maxProviderCalls!==2*value.maxDecisions)throw failure('invalid_or_stale_claim');
}

function settledJournal(value:any){
 if(!value)return true;
 if(value.format==='parallel-owner-v1')return value.claim_pending===false&&Array.isArray(value.entries)&&value.entries.every((entry:any)=>['complete','failed'].includes(entry.status))&&['idle','complete','failed'].includes(value.status);
 return ['idle','complete','failed'].includes(value.status);
}
export async function runBridge(options:Options):Promise<BridgeResult>{
 const concurrency=options.concurrency??1,operatorBatchId=options.operatorBatchId;
 if(operatorBatchId!==undefined&&!isHash(operatorBatchId))throw failure('invalid_bridge_operator_batch');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>(operatorBatchId?50:4))throw failure('invalid_bridge_concurrency');
 if(concurrency>=2||operatorBatchId)return runParallelBridge(options);
 const origin=bridgeOrigin(options.origin,options.allowLoopback),maxDecisions=budget(options.maxDecisions,100),maxCalls=budget(options.maxCalls,100);
 const root=options.root??DEFAULT_STORE,source=options.source??DEFAULT_SOURCE,implementation=implementationHash();
 const heartbeatMs=options.heartbeatMs??30_000,pollMs=options.pollMs??3_000;
 if(!Number.isInteger(heartbeatMs)||heartbeatMs<1||heartbeatMs>30_000||!Number.isInteger(pollMs)||pollMs<1||pollMs>10_000)throw failure('invalid_bridge_interval');
 mkdirSync(root,{recursive:true});
 // Shared with the original local worker: never run both quota owners concurrently.
 const runtime=options.runtimePath??resolve(fileURLToPath(new URL('../../../',import.meta.url)),'.local/range-dashboard/ondemand-bridge');
 mkdirSync(runtime,{recursive:true,mode:0o700});
 const lock=resolve(root,'worker.lock'),journalFile=resolve(runtime,'bridge-journal.json');
 try{writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'outbound-owner-bridge',started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});}catch{throw failure('owner_worker_locked');}
 let provider:Provider|undefined,stopped=false,job:Job|undefined,timer:ReturnType<typeof setInterval>|undefined;
 let metricReceiver=(_metric:any):void=>{};
 let heartbeatWork:Promise<void>|undefined,heartbeatFailed=false,calls=0,decisions=0,jobs=0,budgetBlocked=false;
 let idleTimer:ReturnType<typeof setInterval>|undefined,idleWork:Promise<void>|undefined,idleFailed=false;
 const diagnostics=bridgeDiagnostics();let diagnosticPhase:DiagnosticPhase='startup',diagnosticsEnabled=false;
 let journal:any={status:'idle',calls,decisions};
 const persist=()=>{const temp=journalFile+'.tmp';writeFileSync(temp,JSON.stringify({...journal,diagnostics:diagnostics.state})+'\n',{mode:0o600});renameSync(temp,journalFile);};
 const stop=()=>{stopped=true;provider?.close();};
 const endHeartbeat=async()=>{if(timer)clearInterval(timer);timer=undefined;await heartbeatWork;heartbeatWork=undefined;};
 try{
  const bearer=readBearer(options.bearerFile),fetcher=options.fetch??fetch;
  // Never reflect network/provider response bodies, messages, or the owner bearer.
  const post=async(action:string,body:unknown)=>{
   let response:Response;try{response=await fetcher(origin+'/v1/aiv2/ondemand/owner/'+action,{method:'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15_000)});}catch{throw failure('bridge_transport_uncertain');}
   if(!response.ok)throw failure(response.status===409?'bridge_lease_conflict':'bridge_request_failed');
   try{return await response.json() as any;}catch{throw failure('bridge_response_invalid');}
  };
  const previous=existsSync(journalFile)?JSON.parse(readFileSync(journalFile,'utf8')):null;
  if(options.retryCompletion){
   // Explicit upload-only retry. Do not claim, instantiate a provider, or generate.
   if(previous?.status!=='completion_pending'||!previous.completion||previous.origin!==origin)throw failure('no_pending_completion');
   const payload=previous.completion,rootInput=await loadRoot(payload.result.snapshot.board,source),sourceHash=hash(rootInput.upstream);
   if(payload.result.proof.implementationHash!==implementation||payload.result.proof.sourceHash!==sourceHash)throw failure('completion_pins_changed');
   const snapshot=await onDemandSnapshot(payload.result.snapshot.board,payload.result.snapshot.path,root,source);
   if(hash(snapshot)!==hash(payload.result.snapshot))throw failure('completion_cache_changed');
   const result=await post('complete',payload);if(result.ok!==true)throw failure('bridge_response_invalid');
   journal={status:'complete',origin,calls:previous.calls,decisions:previous.decisions};persist();
   return {status:'completion_uploaded',calls:0,decisions:0,jobs:0};
  }
  if(!settledJournal(previous))throw failure('previous_owner_outcome_requires_manual_review');
  diagnosticsEnabled=true;diagnosticPhase='pin_validation';
  const onlineSourceHash=hash((await loadRoot('As7d2c',source)).upstream);
  const onlinePins={revision:hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash:onlineSourceHash}),implementationHash:implementation,sourceHash:onlineSourceHash};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);options.signal?.addEventListener('abort',stop,{once:true});
  if(options.signal?.aborted)stop();
  const online=await post('heartbeat',onlinePins);if(online.ok!==true)throw failure('bridge_response_invalid');
  idleTimer=setInterval(()=>{
   if(job||idleWork)return;
   idleWork=post('heartbeat',onlinePins).then(result=>{if(result.ok!==true)throw failure('bridge_response_invalid');}).catch(error=>{idleFailed=true;stop();diagnostics.recordFailure(error,'idle_heartbeat');persist();}).finally(()=>{idleWork=undefined;});
  },heartbeatMs);
  while(!stopped&&calls<maxCalls&&decisions<maxDecisions){
   // Advertise readiness before claim so an otherwise-idle owner can accept explicit user jobs.
   // The idle timer is independent of potentially slow claim requests.
   if(implementationHash()!==implementation||hash((await loadRoot('As7d2c',source)).upstream)!==onlineSourceHash)throw failure('pins_changed');
   // A claim is not retried after a transport failure: it may already own a lease.
   journal={status:'claim_pending',origin,calls,decisions};persist();
   diagnosticPhase='claim';
   const claimed=await post('claim',{remainingCalls:maxCalls-calls,remainingDecisions:maxDecisions-decisions});
   if(claimed.job===null){journal={status:'idle',origin,calls,decisions};persist();if(claimed.budgetBlocked===true){budgetBlocked=true;break;}if(!options.watch)break;await new Promise(r=>setTimeout(r,pollMs));continue;}
   job=claimed.job;
   // Pin checks and structural path validation happen before provider creation.
   let jobCalls=0,jobDecisions=0;heartbeatFailed=false;
   try{
    diagnosticPhase='job_validation';
    if(stopped||idleFailed)throw failure('uncertain_provider_outcome');
    const input=await loadRoot(job!.board,source),sourceHash=hash(input.upstream);
    validateBridgeJob(job,implementation,sourceHash,operatorBatchId);
    await onDemandSnapshot(job.board,job.path,root,source);
    journal={status:'running',origin,job,calls,decisions,call_in_flight:false};persist();
    const beat=async()=>{const result=await post('heartbeat',{id:job!.id,leaseToken:job!.leaseToken,revision:job!.revision,implementationHash:implementation,sourceHash});if(result.ok!==true)throw failure('bridge_response_invalid');};
    diagnosticPhase='lease_heartbeat';await beat();
    timer=setInterval(()=>{if(heartbeatWork)return;heartbeatWork=beat().catch(error=>{heartbeatFailed=true;provider?.close();diagnostics.recordFailure(error,'lease_heartbeat',job?.id);persist();}).finally(()=>{heartbeatWork=undefined;});},heartbeatMs);
    while(!stopped&&!heartbeatFailed){
     const next=await resolveFrontier(job.board,job.path,root,source,implementation);
     if(next.status!=='missing')break;
     if(jobDecisions>=job.maxDecisions||jobCalls>=job.maxProviderCalls||decisions>=maxDecisions||calls>=maxCalls)throw failure('budget_exhausted');
     const metrics:any[]=[],provenance:any[]=[];
     if(implementationHash()!==implementation||hash((await loadRoot(job.board,source)).upstream)!==sourceHash)throw failure('pins_changed');
     // Metrics callback is rebound per decision; no extra provider session is created on cache hits.
     provider??=(options.providerFactory??(onMetric=>createAiv2SessionProvider({concurrency:1,onMetric})))(m=>metricReceiver(m));
     metricReceiver=m=>{metrics.push(m);diagnostics.recordMetric(job!.id,m);persist();};
     diagnosticPhase='provider';
     const artifact=await generateOne(next.input,implementation,provider,()=>{
      if(stopped||heartbeatFailed)throw failure('uncertain_provider_outcome');
      if(calls>=maxCalls||jobCalls>=job!.maxProviderCalls)throw failure('budget_exhausted');
      calls++;jobCalls++;journal={...journal,calls,decisions,call_in_flight:true};persist();
     },call=>provenance.push(call));
     if(stopped||heartbeatFailed)throw failure('uncertain_provider_outcome');
     diagnosticPhase='decision_validation';saveDecision(artifact,metrics,root,provenance);
     loadDecision(next.input,implementation,root);
     decisions++;jobDecisions++;journal={...journal,calls,decisions,call_in_flight:false};persist();
    }
    if(stopped||heartbeatFailed)throw failure('uncertain_provider_outcome');
    await endHeartbeat();
    if(heartbeatFailed)throw failure('uncertain_provider_outcome');
    if(implementationHash()!==implementation||hash((await loadRoot(job.board,source)).upstream)!==sourceHash)throw failure('pins_changed');
    diagnosticPhase='completion_validation';
    const frontier=await resolveFrontier(job.board,job.path,root,source,implementation),snapshot=await onDemandSnapshot(job.board,job.path,root,source);
    if(frontier.status==='missing'||!['generated','terminal','chance','zero-reach'].includes(snapshot.status))throw failure('incomplete_validated_store');
    if(frontier.status==='generated')loadDecision(frontier.artifact.input,implementation,root);
    const completion={id:job.id,leaseToken:job.leaseToken,result:{status:snapshot.status,snapshot,proof:{revision:job.revision,implementationHash:implementation,sourceHash,validatedStore:true}}};
    journal={status:'completion_pending',origin,completion,calls,decisions};persist();
    diagnosticPhase='completion_upload';const result=await post('complete',completion);if(result.ok!==true)throw failure('bridge_response_invalid');
    journal={status:'complete',origin,calls,decisions};persist();jobs++;job=undefined;
   }catch(error){
    diagnostics.recordFailure(error,diagnosticPhase,job?.id);persist();
    await endHeartbeat();
    // Lost completion acknowledgements preserve the exact payload for explicit upload-only retry.
    if(journal.status==='completion_pending')throw failure('completion_upload_requires_explicit_retry');
    const code=(error as any)?.code;
    const outcome=journal.call_in_flight||heartbeatFailed||stopped?'uncertain_provider_outcome':code==='budget_exhausted'?'budget_exhausted':'generation_failed';
    journal={...journal,status:'failure_pending',calls,decisions,error:outcome};persist();
    if(job&&isHash(job.id)&&typeof job.leaseToken==='string'){
     diagnosticPhase='failure_upload';const response=await post('fail',{id:job.id,leaseToken:job.leaseToken,error:outcome});if(response.ok!==true)throw failure('bridge_response_invalid');
    }
    journal={status:'failed',origin,calls,decisions,error:outcome};persist();
    throw failure(outcome); // Never proceed to another claim after any generation/lease failure.
   }
   if(!options.watch)break;
  }
  if(idleFailed)throw failure('uncertain_provider_outcome');
  return {status:budgetBlocked?'budget_blocked':stopped?'stopped':'finished',calls,decisions,jobs};
 }catch(error){if(diagnosticsEnabled){diagnostics.recordFailure(error,diagnosticPhase,job?.id);persist();}throw error;}finally{
  if(idleTimer)clearInterval(idleTimer);await idleWork;
  await endHeartbeat();await provider?.drain();
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);options.signal?.removeEventListener('abort',stop);unlinkSync(lock);
 }
}


// A single owner/lock schedules at most four legacy jobs, or up to fifty jobs
// in one explicitly named immutable operator batch. Each lane has its own
// provider, metrics, lease heartbeat and journal entry; the journal is atomically
// replaced as one aggregate so concurrent updates cannot overwrite another lane.
async function runParallelBridge(options:Options):Promise<BridgeResult>{
 const concurrency=options.concurrency??1,operatorBatchId=options.operatorBatchId;
 const origin=bridgeOrigin(options.origin,options.allowLoopback),maxDecisions=budget(options.maxDecisions,100),maxCalls=budget(options.maxCalls,100,operatorBatchId?200:100);
 const root=options.root??DEFAULT_STORE,source=options.source??DEFAULT_SOURCE,implementation=implementationHash();
 const heartbeatMs=options.heartbeatMs??30_000,pollMs=options.pollMs??3_000;
 if(!Number.isInteger(heartbeatMs)||heartbeatMs<1||heartbeatMs>30_000||!Number.isInteger(pollMs)||pollMs<1||pollMs>10_000)throw failure('invalid_bridge_interval');
 const runtime=options.runtimePath??resolve(fileURLToPath(new URL('../../../',import.meta.url)),'.local/range-dashboard/ondemand-bridge');
 mkdirSync(root,{recursive:true});mkdirSync(runtime,{recursive:true,mode:0o700});
 const lock=resolve(root,'worker.lock'),journalFile=resolve(runtime,'bridge-journal.json');
 try{writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'outbound-owner-bridge',concurrency,...(operatorBatchId?{operatorBatchId}:{}),started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});}catch{throw failure('owner_worker_locked');}
 type Entry={job:Job;status:string;calls:number;decisions:number;call_in_flight:boolean;completion?:any;error?:string};
 type Lane={entry:Entry;provider?:Provider;heartbeat?:ReturnType<typeof setInterval>;heartbeatWork?:Promise<void>;heartbeatFailed:boolean;phase:DiagnosticPhase;receive?:(metric:any)=>void;work?:Promise<void>};
 const entries:Entry[]=[],active=new Set<Lane>(),boards=new Set<string>();
 let calls=0,decisions=0,jobs=0,claimPending=false,stopped=false,halted=false,budgetBlocked=false,scopePending=false,scopeComplete=false,firstError:unknown;
 let idleTimer:ReturnType<typeof setInterval>|undefined,idleWork:Promise<void>|undefined;
 const diagnostics=bridgeDiagnostics();let diagnosticPhase:DiagnosticPhase='startup',diagnosticsEnabled=false;
 let journal:any;
 const persist=()=>{
  const status=claimPending?'claim_pending':entries.some(e=>e.status==='completion_pending')?'completion_pending':entries.some(e=>!['complete','failed'].includes(e.status))?'running':halted?'failed':entries.length?'complete':'idle';
  journal={format:'parallel-owner-v1',status,origin,concurrency,...(operatorBatchId?{operatorBatchId,scope_complete:scopeComplete,scope_pending:scopePending}:{}),claim_pending:claimPending,calls,decisions,entries,diagnostics:diagnostics.state};
  const temp=journalFile+'.tmp';writeFileSync(temp,JSON.stringify(journal)+'\n',{mode:0o600});renameSync(temp,journalFile);
 };
 const halt=(error:unknown,phase:DiagnosticPhase=diagnosticPhase,id?:string)=>{halted=true;firstError??=error;diagnostics.recordFailure(error,phase,id);persist();};
 // Do not interrupt unrelated in-flight responses: block all new calls, then drain
 // every lane. Returned responses after a stop are not saved or published.
 const stop=()=>{stopped=true;halted=true;};
 const endHeartbeat=async(lane:Lane)=>{if(lane.heartbeat)clearInterval(lane.heartbeat);lane.heartbeat=undefined;await lane.heartbeatWork;lane.heartbeatWork=undefined;};
 const pendingBudget=()=>({
  calls:[...active].reduce((n,l)=>n+Math.max(0,l.entry.job.maxProviderCalls-l.entry.calls),0),
  decisions:[...active].reduce((n,l)=>n+Math.max(0,l.entry.job.maxDecisions-l.entry.decisions),0),
 });
 try{
  const bearer=readBearer(options.bearerFile),fetcher=options.fetch??fetch;
  const post=async(action:string,body:unknown)=>{
   let response:Response;try{response=await fetcher(origin+'/v1/aiv2/ondemand/owner/'+action,{method:'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15_000)});}catch{throw failure('bridge_transport_uncertain');}
   if(!response.ok)throw failure(response.status===409?'bridge_lease_conflict':'bridge_request_failed');
   try{return await response.json() as any;}catch{throw failure('bridge_response_invalid');}
  };
  const previous=existsSync(journalFile)?JSON.parse(readFileSync(journalFile,'utf8')):null;
  if(options.retryCompletion){
   if((operatorBatchId||previous?.operatorBatchId)&&previous?.operatorBatchId!==operatorBatchId)throw failure('completion_scope_changed');
   const parallel=previous?.format==='parallel-owner-v1';
   const pending=parallel?previous.entries?.filter((e:any)=>e.status==='completion_pending'):previous?.status==='completion_pending'?[previous]:[];
   if(previous?.origin!==origin||!Array.isArray(pending)||!pending.length||parallel&&(previous.claim_pending!==false||previous.entries.some((e:any)=>!['complete','failed','completion_pending'].includes(e.status))))throw failure('no_pending_completion');
   // Validate every payload before sending any; retries are upload-only and never
   // turn a lost claim/running lane into implicitly replayed generation.
   for(const entry of pending){
    const payload=entry.completion;if(!payload)throw failure('no_pending_completion');
    const input=await loadRoot(payload.result.snapshot.board,source);
    if(payload.result.proof.implementationHash!==implementation||payload.result.proof.sourceHash!==hash(input.upstream))throw failure('completion_pins_changed');
    const snapshot=await onDemandSnapshot(payload.result.snapshot.board,payload.result.snapshot.path,root,source);
    if(hash(snapshot)!==hash(payload.result.snapshot))throw failure('completion_cache_changed');
   }
   if(parallel){entries.push(...previous.entries);calls=previous.calls;decisions=previous.decisions;}
   for(const entry of pending){
    diagnosticPhase='completion_upload';const result=await post('complete',entry.completion);if(result.ok!==true)throw failure('bridge_response_invalid');
    if(parallel){entry.status='complete';entry.call_in_flight=false;delete entry.completion;persist();}
    else{const temp=journalFile+'.tmp';writeFileSync(temp,JSON.stringify({status:'complete',origin,calls:previous.calls,decisions:previous.decisions})+'\n',{mode:0o600});renameSync(temp,journalFile);}
   }
   return {status:'completion_uploaded',calls:0,decisions:0,jobs:0};
  }
  if(!settledJournal(previous))throw failure('previous_owner_outcome_requires_manual_review');
  diagnosticsEnabled=true;diagnosticPhase='pin_validation';
  const onlineSourceHash=hash((await loadRoot('As7d2c',source)).upstream);
  const onlinePins={revision:hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash:onlineSourceHash}),implementationHash:implementation,sourceHash:onlineSourceHash};
  const assertPins=async()=>{if(implementationHash()!==implementation||hash((await loadRoot('As7d2c',source)).upstream)!==onlineSourceHash)throw failure('pins_changed');};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);options.signal?.addEventListener('abort',stop,{once:true});
  if(options.signal?.aborted)stop();
  if(stopped)return {status:'stopped',calls,decisions,jobs};
  const online=await post('heartbeat',onlinePins);if(online.ok!==true)throw failure('bridge_response_invalid');
  persist();
  idleTimer=setInterval(()=>{
   if(active.size||idleWork||halted)return;
   idleWork=post('heartbeat',onlinePins).then(result=>{if(result.ok!==true)throw failure('bridge_response_invalid');}).catch(error=>halt(error,'idle_heartbeat')).finally(()=>{idleWork=undefined;});
  },heartbeatMs);
  const runLane=async(lane:Lane)=>{
   const entry=lane.entry,job=entry.job;
   // Equivalent card-order boards serialize too. This prevents overlapping paths
   // from concurrently generating/writing the same immutable decision file.
   const boardKey=(job.board.match(/../g)??[]).sort().join('');let ownsBoard=false;
   try{
    lane.phase='job_validation';
    if(halted)throw failure('uncertain_provider_outcome');
    const sourceHash=hash((await loadRoot(job.board,source)).upstream);
    validateBridgeJob(job,implementation,sourceHash,operatorBatchId);
    await onDemandSnapshot(job.board,job.path,root,source);
    const beat=async()=>{const result=await post('heartbeat',{id:job.id,leaseToken:job.leaseToken,revision:job.revision,implementationHash:implementation,sourceHash});if(result.ok!==true)throw failure('bridge_response_invalid');};
    lane.phase='lease_heartbeat';await beat();
    lane.heartbeat=setInterval(()=>{
     if(lane.heartbeatWork||halted)return;
     lane.heartbeatWork=beat().catch(error=>{lane.heartbeatFailed=true;halt(error,'lease_heartbeat',job.id);}).finally(()=>{lane.heartbeatWork=undefined;});
    },heartbeatMs);
    while(boards.has(boardKey)&&!halted)await new Promise(r=>setTimeout(r,pollMs));
    if(halted)throw failure('uncertain_provider_outcome');boards.add(boardKey);ownsBoard=true;
    while(!halted){
     const next=await resolveFrontier(job.board,job.path,root,source,implementation);
     if(next.status!=='missing')break;
     if(entry.decisions>=job.maxDecisions||entry.calls>=job.maxProviderCalls||decisions>=maxDecisions||calls>=maxCalls)throw failure('budget_exhausted');
     await assertPins();if(halted)throw failure('uncertain_provider_outcome');
     const metrics:any[]=[],provenance:any[]=[];
     // One provider per job keeps response attestations disjoint even when calls overlap.
     lane.receive=metric=>{metrics.push(metric);diagnostics.recordMetric(job.id,metric);persist();};
     lane.phase='provider';
     lane.provider??=(options.providerFactory??(onMetric=>createAiv2SessionProvider({concurrency:1,onMetric})))(metric=>lane.receive?.(metric));
     const artifact=await generateOne(next.input,implementation,lane.provider,()=>{
      if(halted||lane.heartbeatFailed)throw failure('uncertain_provider_outcome');
      if(calls>=maxCalls||entry.calls>=job.maxProviderCalls)throw failure('budget_exhausted');
      calls++;entry.calls++;entry.call_in_flight=true;persist();
     },call=>provenance.push(call));
     if(halted||lane.heartbeatFailed)throw failure('uncertain_provider_outcome');
     lane.phase='decision_validation';saveDecision(artifact,metrics,root,provenance);loadDecision(next.input,implementation,root);
     decisions++;entry.decisions++;entry.call_in_flight=false;persist();
    }
    if(halted)throw failure('uncertain_provider_outcome');
    await endHeartbeat(lane);if(halted||lane.heartbeatFailed)throw failure('uncertain_provider_outcome');
    await assertPins();if(halted)throw failure('uncertain_provider_outcome');
    lane.phase='completion_validation';
    const frontier=await resolveFrontier(job.board,job.path,root,source,implementation),snapshot=await onDemandSnapshot(job.board,job.path,root,source);
    if(halted)throw failure('uncertain_provider_outcome');
    if(frontier.status==='missing'||!['generated','terminal','chance','zero-reach'].includes(snapshot.status))throw failure('incomplete_validated_store');
    if(frontier.status==='generated')loadDecision(frontier.artifact.input,implementation,root);
    entry.completion={id:job.id,leaseToken:job.leaseToken,result:{status:snapshot.status,snapshot,proof:{revision:job.revision,implementationHash:implementation,sourceHash,validatedStore:true}}};
    entry.status='completion_pending';persist();
    lane.phase='completion_upload';const result=await post('complete',entry.completion);if(result.ok!==true)throw failure('bridge_response_invalid');
    entry.status='complete';delete entry.completion;jobs++;persist();
   }catch(error){
    // Halt synchronously before awaiting heartbeats/fail uploads. Another lane may
    // finish its current response, but can never start its correction/next response.
    diagnostics.recordFailure(error,lane.phase,job.id);
    halt(entry.status==='completion_pending'?failure('completion_upload_requires_explicit_retry'):error,lane.phase,job.id);
    await endHeartbeat(lane);
    if(entry.status==='completion_pending')return;
    const code=(error as any)?.code;
    const outcome=entry.call_in_flight||lane.heartbeatFailed||stopped||code==='uncertain_provider_outcome'?'uncertain_provider_outcome':code==='budget_exhausted'?'budget_exhausted':'generation_failed';
    entry.status='failure_pending';entry.error=outcome;persist();
    try{
     if(isHash(job.id)&&typeof job.leaseToken==='string'){
      lane.phase='failure_upload';const response=await post('fail',{id:job.id,leaseToken:job.leaseToken,error:outcome});if(response.ok!==true)throw failure('bridge_response_invalid');
     }
     entry.status='failed';persist();
    }catch(uploadError){halt(uploadError,'failure_upload',job.id);}
   }finally{
    if(ownsBoard)boards.delete(boardKey);
    await endHeartbeat(lane);await lane.provider?.drain();
   }
  };
  try{
   while(!halted&&calls<maxCalls&&decisions<maxDecisions){
    if(active.size>=concurrency){await Promise.race([...active].map(l=>l.work));continue;}
    const reserved=pendingBudget(),remainingCalls=maxCalls-calls-reserved.calls,remainingDecisions=maxDecisions-decisions-reserved.decisions;
    if(remainingCalls<1||remainingDecisions<1){
     if(active.size){await Promise.race([...active].map(l=>l.work));continue;}
     budgetBlocked=true;break;
    }
    await assertPins();if(halted)break;
    diagnosticPhase='claim';claimPending=true;persist();
    const claimed=await post('claim',{remainingCalls,remainingDecisions,...(operatorBatchId?{operatorBatchId,...onlinePins}:{})});
    // Keep claim_pending durable on transport/shape uncertainty: never reclaim or retry.
    if(!claimed||!Object.hasOwn(claimed,'job'))throw failure('bridge_response_invalid');
    if(operatorBatchId&&(claimed.operatorBatchId!==operatorBatchId||claimed.job!==null&&claimed.scopeComplete===true))throw failure('invalid_or_stale_claim');
    if(operatorBatchId&&claimed.scopeFailed===true){if(claimed.job===null){claimPending=false;persist();}throw failure('operator_scope_failed');}
    if(claimed.job===null){
     claimPending=false;persist();
     if(claimed.budgetBlocked===true){
      if(active.size){await Promise.race([...active].map(l=>l.work));continue;}
      budgetBlocked=true;break;
     }
     if(operatorBatchId){
      // An immutable batch cannot gain future jobs. Never idle-poll indefinitely
      // or drift into another queue. Drain local work before declaring scope done.
      if(active.size){await Promise.all([...active].map(l=>l.work));if(halted)break;if(claimed.scopeComplete===true){scopeComplete=true;persist();break;}continue;}
      scopeComplete=claimed.scopeComplete===true;scopePending=!scopeComplete;persist();
      break;
     }
     if(!options.watch)break;
     await new Promise(r=>setTimeout(r,pollMs));continue;
    }
    const job=claimed.job as Job;
    // Validate before accepting claimed capacity; malformed/over-budget leases remain
    // uncertain in the journal and cannot reach any provider factory.
    validateBridgeJob(job,implementation,onlineSourceHash,operatorBatchId);
    if(job.maxProviderCalls>remainingCalls||job.maxDecisions>remainingDecisions||entries.some(e=>e.job.id===job.id))throw failure('invalid_or_stale_claim');
    const lane:Lane={entry:{job,status:'running',calls:0,decisions:0,call_in_flight:false},heartbeatFailed:false,phase:'job_validation'};
    entries.push(lane.entry);active.add(lane);claimPending=false;persist();
    lane.work=runLane(lane).catch(error=>halt(error,'provider_drain',lane.entry.job.id)).finally(()=>{active.delete(lane);});
    if(!options.watch)break; // --run-once still means at most one job, even in parallel mode.
   }
  }catch(error){halt(error);}
  await Promise.all([...active].map(l=>l.work));
  if(idleTimer)clearInterval(idleTimer);idleTimer=undefined;await idleWork;
  if(firstError)throw firstError;
  return {status:budgetBlocked?'budget_blocked':stopped?'stopped':scopePending?'scope_pending':'finished',calls,decisions,jobs,...(operatorBatchId?{operatorBatchId,scopeComplete}: {})};
 }catch(error){if(diagnosticsEnabled){diagnostics.recordFailure(error,diagnosticPhase);persist();}throw error;}finally{
  if(idleTimer)clearInterval(idleTimer);await idleWork;
  await Promise.all([...active].map(l=>l.work));
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);options.signal?.removeEventListener('abort',stop);unlinkSync(lock);
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=(name:string)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
 try{
  const retry=args.includes('--retry-completion');
  if(!retry&&(!args.includes('--confirm-local-generation')||(!args.includes('--run-once')&&!args.includes('--watch'))))throw failure('explicit_owner_generation_confirmation_required');
  const origin=get('origin'),bearerFile=get('bearer-file');if(!origin||!bearerFile)throw failure('origin_and_bearer_file_required');
  const result=await runBridge({origin,bearerFile,source:get('source-dir')===undefined?undefined:resolve(get('source-dir')!),watch:args.includes('--watch'),operatorBatchId:get('operator-batch-id'),concurrency:get('concurrency')===undefined?undefined:Number(get('concurrency')),retryCompletion:retry,allowLoopback:args.includes('--allow-loopback-test'),maxDecisions:get('max-decisions')===undefined?undefined:Number(get('max-decisions')),maxCalls:get('max-calls')===undefined?undefined:Number(get('max-calls'))});
  console.log(JSON.stringify(result));
 }catch{console.error(JSON.stringify({status:'failed',error:'owner_bridge_stopped_check_local_journal_no_automatic_retry'}));process.exitCode=1;}
}
