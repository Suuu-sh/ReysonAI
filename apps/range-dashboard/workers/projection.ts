// Strict read-only projection: no generator/provider imports or caller-selected paths.
import { open, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, parse } from 'node:path';
const SHA=/^[a-f0-9]{64}$/;
const statuses=new Set(['idle','claim_pending','running','completion_pending','failure_pending','complete','failed']);
const phases=new Set(['startup','pin_validation','claim','job_validation','lease_heartbeat','idle_heartbeat','provider','decision_validation','completion_validation','completion_upload','failure_upload','provider_drain']);
const codes=new Set(['quota_or_rate_limit','authentication_required','unsupported_model_effort_or_schema','upstream_error','process_failed','process_exited','transport_closed','session_lost','provider_closed','timeout','invalid_json','protocol_error','response_too_large','unexpected_server_request','missing_turn','missing_thread','model_or_effort_mismatch','unexpected_tool_call','overlapping_session_turn','session_closed_during_turn','bridge_transport_uncertain','bridge_lease_conflict','bridge_request_failed','bridge_response_invalid','pins_changed','budget_exhausted','invalid_or_stale_claim','snapshot_adapter_invalid','incomplete_validated_store','uncertain_provider_outcome','completion_upload_requires_explicit_retry','operator_scope_failed','generation_failed','unclassified_failure']);
const integer=(n:unknown,max=1_000_000)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=max?Number(n):null;
const stamp=(n:unknown)=>typeof n==='string'&&n.length<=40&&Number.isFinite(Date.parse(n))?new Date(n).toISOString():null;
const hash=(n:unknown)=>typeof n==='string'&&SHA.test(n)?n:null;
const board=(n:unknown)=>typeof n==='string'&&/^(?:[AKQJT98765432][shdc]){3}$/.test(n)&&new Set(n.match(/../g)).size===3?n:null;
const safePath=(n:unknown):string[]|null=>Array.isArray(n)&&n.length<=64&&n.every(v=>typeof v==='string'&&/^(?:check|fold|call|raise|allin|bet33|bet66|bet125|[AKQJT98765432][shdc])$/.test(v))?[...n]:null;
type Read={value:any;mtime:number};
export async function readSafeBytes(file:string,limit:number):Promise<{bytes:Buffer;mtime:number}|null>{
 try{
  // Reject symlinks in every component, including runtime directory ancestors.
  let current=parse(resolve(file)).root;
  for(const component of resolve(file).slice(current.length).split('/')){current=join(current,component);if((await lstat(current)).isSymbolicLink())return null;}
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=await handle.stat(),named=await lstat(file);if(await realpath(file)!==resolve(file)||named.ino!==stat.ino||named.dev!==stat.dev||!stat.isFile()||stat.size>limit)return null;const bytes=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead!==stat.size)return null;return{bytes:bytes.subarray(0,bytesRead),mtime:stat.mtimeMs};}finally{await handle.close();}
 }catch{return null;}
}
export async function readBounded(file:string,limit:number):Promise<Read|null>{try{const r=await readSafeBytes(file,limit);return r?{value:JSON.parse(r.bytes.toString('utf8')),mtime:r.mtime}:null;}catch{return null;}}
export type Inputs={owner:Read|null;journal:Read|null;batch:Read|null;coverage:Read|null;snapshot:Read|null;alive:boolean;coordinatorAlive?:boolean;now:number};
export function projectWorkers(input:Inputs,observations=new Map<string,number>()){
 const {owner,journal,batch,coverage,snapshot,now}=input,o=owner?.value??{},j=journal?.value??{};
 const batchId=hash(o.operatorBatchId)??hash(j.operatorBatchId),pid=integer(o.pid,2**31-1),startedAt=stamp(o.startedAt??o.startAt);
 const configured=integer(o.concurrency,50)??integer(j.concurrency,50);
 const scopeMatches=(!hash(o.operatorBatchId)||hash(j.operatorBatchId)===hash(o.operatorBatchId))&&(!integer(o.concurrency,50)||!integer(j.concurrency,50)||o.concurrency===j.concurrency);
 const age=journal?Math.max(0,now-journal.mtime):null;
 const predatesOwner=!!(startedAt&&journal&&journal.mtime<Date.parse(startedAt)-1000);
 const bindingAvailable=!!startedAt&&!!hash(o.operatorBatchId)&&hash(o.operatorBatchId)===hash(j.operatorBatchId)&&integer(o.concurrency,50)!==null&&Number(o.concurrency)>0&&Date.parse(startedAt)<=now+5000;
 const trustworthy=!!journal&&bindingAvailable&&scopeMatches&&!predatesOwner;
 const fresh=trustworthy&&age!<=15_000;
 const alive=input.alive&&pid!==null&&pid>0;
 const phaseAt=stamp(o.phaseAt),coordinatorPid=integer(o.coordinatorPid,2**31-1);
 const coordinatorBound=trustworthy&&hash(o.campaignId)!==null&&coordinatorPid!==null&&coordinatorPid>0&&coordinatorPid!==pid&&input.coordinatorAlive===true&&phaseAt!==null&&Date.parse(phaseAt)>=Date.parse(startedAt!)&&Date.parse(phaseAt)<=now+5000;
 const metadataPhase=['running','review_wait','ready','halted'].includes(o.phase)?o.phase:null;
 const entries=Array.isArray(j.entries)?j.entries.slice(0,50):j.job?[{job:j.job,status:j.status,calls:j.calls,decisions:j.decisions,call_in_flight:j.call_in_flight,error:j.error}]:[];
 const seen=new Set<string>();
 const validEntries=entries.filter((e:any)=>{const id=hash(e?.job?.id);if(!id||seen.has(id)||!board(e.job.board)||!safePath(e.job.path))return false;seen.add(id);return true;});
 const lanes=validEntries.map((entry:any,index:number)=>{
  const id=entry.job.id,terminal=['failed','failure_pending','complete'].includes(entry.status),uncertain=entry.call_in_flight===true&&terminal&&entry.status!=='complete';
  const memberMatches=!hash(j.operatorBatchId)||entry.job.operatorBatchId===j.operatorBatchId;
  const active=alive&&trustworthy&&memberMatches&&!terminal&&['running','completion_pending'].includes(entry.status);
  if(active&&!observations.has(id))observations.set(id,now);if(!active)observations.delete(id);
  const diagnostic=j.diagnostics?.jobs?.[id],metric=Array.isArray(diagnostic?.metrics)?diagnostic.metrics.slice(-64).reverse().find((m:any)=>integer(m?.elapsedMs,3_600_000)!==null):null;
  const failure=diagnostic?.failure,error=entry.error??failure?.code;
  return{lane:index+1,jobId:id,board:entry.job.board,path:safePath(entry.job.path)!,status:uncertain?'uncertain':active?'running':['running','completion_pending'].includes(entry.status)?'stale':statuses.has(entry.status)?entry.status:'unknown',phase:phases.has(failure?.phase)?failure.phase:active&&entry.call_in_flight?'provider':null,callInFlight:entry.call_in_flight===true,elapsedMs:metric?integer(metric.elapsedMs,3_600_000):active?Math.max(0,now-observations.get(id)!):null,elapsedSource:metric?'metric':active?'observation':null,errorCode:codes.has(error)?error:error? 'unclassified_failure':null,updatedAt:stamp(metric?.at??failure?.at),active};
 });
 const exactEntries=Array.isArray(j.entries)&&j.entries.length<=50&&j.entries.length===validEntries.length&&validEntries.every((e:any)=>e.job.operatorBatchId===batchId);
 const settled=!alive&&exactEntries&&j.status==='complete'&&validEntries.length>0&&validEntries.every((e:any)=>e.status==='complete'&&e.call_in_flight!==true);
 for(const key of observations.keys())if(!lanes.some((lane:any)=>lane.jobId===key&&lane.active))observations.delete(key);
 const manifest=batch?.value?.manifest,receipt=batch?.value?.receipt;
 const matching=!!batchId&&manifest?.batchId===batchId&&receipt?.batchId===batchId;
 const receiptJobs=matching&&Array.isArray(receipt.jobs)?receipt.jobs.slice(0,50).filter((v:any)=>hash(v?.id)&&board(v.board)&&safePath(v.path)):[];
 const revision=hash(manifest?.revision),broker=snapshot?.value;
 const snapValid=matching&&revision&&broker?.revision===revision&&stamp(broker.recordedAt)&&Array.isArray(broker.jobs)&&broker.jobs.length<=100_000&&receiptJobs.every((job:any)=>broker.jobs.some((v:any)=>v.id===job.id));
 const scoped=receiptJobs.map((job:any)=>{
  const local=validEntries.find((e:any)=>e.job.id===job.id),recorded=snapValid?broker.jobs.find((v:any)=>v.id===job.id):null;
  return local?.status??recorded?.status??job.status;
 });
 const counts={queued:matching?scoped.filter((s:any)=>s==='queued').length:null,running:lanes.filter((v:any)=>v.active).length,complete:matching?scoped.filter((s:any)=>s==='complete').length:lanes.filter((v:any)=>v.status==='complete').length,failed:matching?scoped.filter((s:any)=>s==='failed'||s==='failure_pending').length:lanes.filter((v:any)=>['failed','uncertain','failure_pending'].includes(v.status)).length,uncertain:lanes.filter((v:any)=>v.status==='uncertain').length,recordedAt:snapValid?stamp(broker.recordedAt):matching&&batch?new Date(batch.mtime).toISOString():journal?new Date(journal.mtime).toISOString():null,source:snapValid?'broker_snapshot':matching?'submission_and_local_journal':'local_journal'};
 const exactReceipt=matching&&Array.isArray(receipt.jobs)&&receipt.jobs.length<=50&&receipt.jobs.length===receiptJobs.length&&new Set(receiptJobs.map((job:any)=>job.id)).size===receiptJobs.length&&validEntries.every((entry:any)=>receiptJobs.some((job:any)=>job.id===entry.job.id&&job.board===entry.job.board&&JSON.stringify(job.path)===JSON.stringify(entry.job.path)));
 const campaignSettled=settled&&exactReceipt&&scoped.length>0&&scoped.every((status:unknown)=>status==='complete');
 const campaignPhase=coordinatorBound&&(metadataPhase==='running'?alive:metadataPhase==='review_wait'||metadataPhase==='ready'?campaignSettled:metadataPhase==='halted'?!alive:false)?metadataPhase:null;
 const c=coverage?.value,coverageValid=c?.kind==='offline-all-physical-flop-coverage-plan'&&c?.summary?.physical_flops===22100&&c.approved===false&&c.gto_verified===false;
 const coverageCounts=(role:string)=>{const s=coverageValid?c.summary[role]:null;const total=s&&['S','M','B','U','P','Z'].every(k=>integer(s[k],22100)!==null)?['S','M','B','U','P','Z'].reduce((n,k)=>n+s[k],0):-1;return total===22100?{saved:s.S,missing:s.M,blocked:s.B,unknown:s.U,parentPending:s.P,zeroReach:s.Z}:{saved:null,missing:null,blocked:null,unknown:null,parentPending:null,zeroReach:null};};
 const recordedAt=coverageValid?stamp(c.broker_snapshot?.recordedAt):null;
 return{schemaVersion:1,observedAt:new Date(now).toISOString(),capacity:50,owner:{alive,pid,bindingAvailable,phase:campaignPhase,configuredConcurrency:configured&&configured>0?configured:null,startedAt,lastUpdatedAt:owner?new Date(owner.mtime).toISOString():null},run:{status:statuses.has(j.status)?j.status:'unknown',batchId,calls:integer(j.calls),decisions:integer(j.decisions),maxCalls:integer(o.maxCalls,200)??(matching?integer(manifest.maxCalls,200):null),maxDecisions:integer(o.maxDecisions,100)??(matching?integer(manifest.maxDecisions,100):null),active:counts.running,stale:!alive||!fresh,lastUpdatedAt:journal?new Date(journal.mtime).toISOString():null},counts,lanes,coverage:{domain:22100,root:coverageCounts('root'),check:coverageCounts('check'),recordedAt,stale:!recordedAt||now-Date.parse(recordedAt)>60_000,locallyValidatedNotGto:true},warnings:[...(!alive?['owner_not_running']:[]),...(!bindingAvailable?['owner_identity_unverified']:[]),...(!fresh?['journal_not_fresh_or_scope_mismatch']:[]),...(!matching?['current_batch_snapshot_unavailable']:[])]};
}
export function createWorkersReader(root:string,alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}}){
 const runtime=resolve(root,'.local/range-dashboard'),observations=new Map<string,number>();
 return async()=>{
  const [owner,journal,coverage,snapshot]=await Promise.all([readBounded(join(runtime,'ondemand-bridge/owner-process.json'),16_384),readBounded(join(runtime,'ondemand-bridge/bridge-journal.json'),2*1024*1024),readBounded(join(runtime,'flop-coverage/coverage-plan.json'),8*1024*1024),readBounded(join(runtime,'flop-coverage/broker-snapshot.json'),8*1024*1024)]);
  const id=hash(owner?.value?.operatorBatchId)??hash(journal?.value?.operatorBatchId),batch=id?await readBounded(join(runtime,'operator-batches',id+'.json'),256*1024):null;
  const pid=integer(owner?.value?.pid,2**31-1),coordinatorPid=integer(owner?.value?.coordinatorPid,2**31-1);return projectWorkers({owner,journal,batch,coverage,snapshot,alive:pid!==null&&pid>0&&alive(pid),coordinatorAlive:coordinatorPid!==null&&coordinatorPid>0&&coordinatorPid!==pid&&alive(coordinatorPid),now:Date.now()},observations);
 };
}
