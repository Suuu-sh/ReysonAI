// Explicit owner-only outbound bridge. Importing this file performs no network/model work.
// Frozen generation/store modules are reused without changing their implementation identity.
import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { generateOne } from './aiv2-postflop-ondemand-cli.ts';
import { postflopHash as hash } from './aiv2-postflop-ondemand.ts';
import { CONFIG, DEFAULT_STORE, DEFAULT_SOURCE, implementationHash, loadRoot, resolveFrontier, loadDecision, saveDecision, normalizeRequest } from './aiv2-postflop-ondemand-store.ts';
import { createAiv2SessionProvider } from './lib/aiv2-provider-session.ts';

type Job = { id:string; board:string; path:string[]; revision:string; implementationHash:string; sourceHash:string; leaseToken:string; maxProviderCalls:number; maxDecisions:number };
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
 maxDecisions?:number; maxCalls?:number; root?:string; source?:string; runtimePath?:string;
 // Injection points are for isolated tests; the CLI never accepts these dependencies.
 fetch?:typeof fetch; providerFactory?:(onMetric:(m:any)=>void)=>Provider;
 heartbeatMs?:number; pollMs?:number; signal?:AbortSignal;
};
const isHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const failure=(code:string)=>Object.assign(new Error(code),{code});
export function bridgeOrigin(value:string,allowLoopback=false){
 let u:URL;try{u=new URL(value);}catch{throw failure('invalid_bridge_origin');}
 const prod=u.protocol==='https:'&&u.hostname==='api.reysonai.com'&&(!u.port||u.port==='443');
 const loop=allowLoopback&&u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname)&&!!u.port;
 if((!prod&&!loop)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw failure('invalid_bridge_origin');
 return u.origin;
}
function budget(value:number|undefined,fallback:number){const n=value??fallback;if(!Number.isInteger(n)||n<1||n>100)throw failure('invalid_bridge_budget');return n;}
function readBearer(path:string){
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>4096)throw failure('unsafe_bearer_file');
 const token=readFileSync(path,'utf8').trim();if(token.length<32||token.length>4096||/\s/.test(token))throw failure('invalid_bearer_file');return token;
}
export function validateBridgeJob(value:any,implementation:string,sourceHash:string):asserts value is Job {
 if(!value)throw failure('invalid_or_stale_claim');
 const request=normalizeRequest(value.board,value.path);
 if(!value||!isHash(value.id)||!isHash(value.revision)||value.implementationHash!==implementation||value.sourceHash!==sourceHash||
  value.id!==hash({revision:value.revision,...request})||
  value.revision!==hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash})||
  typeof value.leaseToken!=='string'||value.leaseToken.length<32||value.leaseToken.length>200||
  !Number.isInteger(value.maxDecisions)||value.maxDecisions<1||value.maxDecisions>4||
  !Number.isInteger(value.maxProviderCalls)||value.maxProviderCalls<1||value.maxProviderCalls>8)throw failure('invalid_or_stale_claim');
}

export async function runBridge(options:Options){
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
 let heartbeatWork:Promise<void>|undefined,heartbeatFailed=false,calls=0,decisions=0,jobs=0;
 let idleTimer:ReturnType<typeof setInterval>|undefined,idleWork:Promise<void>|undefined,idleFailed=false;
 let journal:any={status:'idle',calls,decisions};
 const persist=()=>{const temp=journalFile+'.tmp';writeFileSync(temp,JSON.stringify(journal)+'\n',{mode:0o600});renameSync(temp,journalFile);};
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
  if(previous&&!['idle','complete','failed'].includes(previous.status))throw failure('previous_owner_outcome_requires_manual_review');
  const onlineSourceHash=hash((await loadRoot('As7d2c',source)).upstream);
  const onlinePins={revision:hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash:onlineSourceHash}),implementationHash:implementation,sourceHash:onlineSourceHash};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);options.signal?.addEventListener('abort',stop,{once:true});
  if(options.signal?.aborted)stop();
  const online=await post('heartbeat',onlinePins);if(online.ok!==true)throw failure('bridge_response_invalid');
  idleTimer=setInterval(()=>{
   if(job||idleWork)return;
   idleWork=post('heartbeat',onlinePins).then(result=>{if(result.ok!==true)throw failure('bridge_response_invalid');}).catch(()=>{idleFailed=true;stop();}).finally(()=>{idleWork=undefined;});
  },heartbeatMs);
  while(!stopped&&calls<maxCalls&&decisions<maxDecisions){
   // Advertise readiness before claim so an otherwise-idle owner can accept explicit user jobs.
   // The idle timer is independent of potentially slow claim requests.
   if(implementationHash()!==implementation||hash((await loadRoot('As7d2c',source)).upstream)!==onlineSourceHash)throw failure('pins_changed');
   // A claim is not retried after a transport failure: it may already own a lease.
   journal={status:'claim_pending',origin,calls,decisions};persist();
   const claimed=await post('claim',{});
   if(claimed.job===null){journal={status:'idle',origin,calls,decisions};persist();if(!options.watch)break;await new Promise(r=>setTimeout(r,pollMs));continue;}
   job=claimed.job;
   // Pin checks and structural path validation happen before provider creation.
   let jobCalls=0,jobDecisions=0;heartbeatFailed=false;
   try{
    if(stopped||idleFailed)throw failure('uncertain_provider_outcome');
    const input=await loadRoot(job!.board,source),sourceHash=hash(input.upstream);
    validateBridgeJob(job,implementation,sourceHash);
    await onDemandSnapshot(job.board,job.path,root,source);
    journal={status:'running',origin,job,calls,decisions,call_in_flight:false};persist();
    const beat=async()=>{const result=await post('heartbeat',{id:job!.id,leaseToken:job!.leaseToken,revision:job!.revision,implementationHash:implementation,sourceHash});if(result.ok!==true)throw failure('bridge_response_invalid');};
    await beat();
    timer=setInterval(()=>{if(heartbeatWork)return;heartbeatWork=beat().catch(()=>{heartbeatFailed=true;provider?.close();}).finally(()=>{heartbeatWork=undefined;});},heartbeatMs);
    while(!stopped&&!heartbeatFailed){
     const next=await resolveFrontier(job.board,job.path,root,source,implementation);
     if(next.status!=='missing')break;
     if(jobDecisions>=job.maxDecisions||jobCalls>=job.maxProviderCalls||decisions>=maxDecisions||calls>=maxCalls)throw failure('budget_exhausted');
     const metrics:any[]=[],provenance:any[]=[];
     if(implementationHash()!==implementation||hash((await loadRoot(job.board,source)).upstream)!==sourceHash)throw failure('pins_changed');
     // Metrics callback is rebound per decision; no extra provider session is created on cache hits.
     provider??=(options.providerFactory??(onMetric=>createAiv2SessionProvider({concurrency:1,onMetric})))(m=>metricReceiver(m));
     metricReceiver=m=>{metrics.push(m);};
     const artifact=await generateOne(next.input,implementation,provider,()=>{
      if(stopped||heartbeatFailed)throw failure('uncertain_provider_outcome');
      if(calls>=maxCalls||jobCalls>=job!.maxProviderCalls)throw failure('budget_exhausted');
      calls++;jobCalls++;journal={...journal,calls,decisions,call_in_flight:true};persist();
     },call=>provenance.push(call));
     if(stopped||heartbeatFailed)throw failure('uncertain_provider_outcome');
     saveDecision(artifact,metrics,root,provenance);
     loadDecision(next.input,implementation,root);
     decisions++;jobDecisions++;journal={...journal,calls,decisions,call_in_flight:false};persist();
    }
    if(stopped||heartbeatFailed)throw failure('uncertain_provider_outcome');
    await endHeartbeat();
    if(heartbeatFailed)throw failure('uncertain_provider_outcome');
    if(implementationHash()!==implementation||hash((await loadRoot(job.board,source)).upstream)!==sourceHash)throw failure('pins_changed');
    const frontier=await resolveFrontier(job.board,job.path,root,source,implementation),snapshot=await onDemandSnapshot(job.board,job.path,root,source);
    if(frontier.status==='missing'||!['generated','terminal','chance','zero-reach'].includes(snapshot.status))throw failure('incomplete_validated_store');
    if(frontier.status==='generated')loadDecision(frontier.artifact.input,implementation,root);
    const completion={id:job.id,leaseToken:job.leaseToken,result:{status:snapshot.status,snapshot,proof:{revision:job.revision,implementationHash:implementation,sourceHash,validatedStore:true}}};
    journal={status:'completion_pending',origin,completion,calls,decisions};persist();
    const result=await post('complete',completion);if(result.ok!==true)throw failure('bridge_response_invalid');
    journal={status:'complete',origin,calls,decisions};persist();jobs++;job=undefined;
   }catch(error){
    await endHeartbeat();
    // Lost completion acknowledgements preserve the exact payload for explicit upload-only retry.
    if(journal.status==='completion_pending')throw failure('completion_upload_requires_explicit_retry');
    const code=(error as any)?.code;
    const outcome=journal.call_in_flight||heartbeatFailed||stopped?'uncertain_provider_outcome':code==='budget_exhausted'?'budget_exhausted':'generation_failed';
    journal={...journal,status:'failure_pending',calls,decisions,error:outcome};persist();
    if(job&&isHash(job.id)&&typeof job.leaseToken==='string'){
     const response=await post('fail',{id:job.id,leaseToken:job.leaseToken,error:outcome});if(response.ok!==true)throw failure('bridge_response_invalid');
    }
    journal={status:'failed',origin,calls,decisions,error:outcome};persist();
    throw failure(outcome); // Never proceed to another claim after any generation/lease failure.
   }
   if(!options.watch)break;
  }
  if(idleFailed)throw failure('uncertain_provider_outcome');
  return {status:stopped?'stopped':'finished',calls,decisions,jobs};
 }finally{
  if(idleTimer)clearInterval(idleTimer);await idleWork;
  await endHeartbeat();await provider?.drain();
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);options.signal?.removeEventListener('abort',stop);unlinkSync(lock);
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=(name:string)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
 try{
  const retry=args.includes('--retry-completion');
  if(!retry&&(!args.includes('--confirm-local-generation')||(!args.includes('--run-once')&&!args.includes('--watch'))))throw failure('explicit_owner_generation_confirmation_required');
  const origin=get('origin'),bearerFile=get('bearer-file');if(!origin||!bearerFile)throw failure('origin_and_bearer_file_required');
  const result=await runBridge({origin,bearerFile,source:get('source-dir')===undefined?undefined:resolve(get('source-dir')!),watch:args.includes('--watch'),retryCompletion:retry,allowLoopback:args.includes('--allow-loopback-test'),maxDecisions:get('max-decisions')===undefined?undefined:Number(get('max-decisions')),maxCalls:get('max-calls')===undefined?undefined:Number(get('max-calls'))});
  console.log(JSON.stringify(result));
 }catch{console.error(JSON.stringify({status:'failed',error:'owner_bridge_stopped_check_local_journal_no_automatic_retry'}));process.exitCode=1;}
}
