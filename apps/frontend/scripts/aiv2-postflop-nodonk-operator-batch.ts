// Enqueue-only operator command: no provider imports, worker start or implicit retries.
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { postflopHash as hash } from './aiv2-postflop-nodonk.ts';
import { CONFIG, implementationHash, loadRoot, normalizeRequest } from './aiv2-postflop-nodonk-store.ts';
import { bridgeOrigin } from './aiv2-postflop-ondemand-bridge.ts';

type Manifest={batchId:string;operatorUserId:string;revision:string;implementationHash:string;sourceHash:string;requests:Array<{board:string;path:string[]}>;maxCalls:number;maxDecisions:number};
type Receipt={batchId:string;revision:string;implementationHash:string;sourceHash:string;maxCalls:number;maxDecisions:number;jobs:Array<{id:string;board:string;path:string[];status:string}>};
type Options={operatorUserId:string;origin:string;bearerFile:string;source:string;boards:string[];path?:string[];maxCalls:number;maxDecisions:number;confirmLocalGeneration:boolean;retrySubmission?:boolean;runtimePath?:string;allowLoopback?:boolean;fetch?:typeof fetch};
const failure=(code:string)=>Object.assign(new Error(code),{code});
export function operatorBatchPath(args:string[]){
 const flags=args.filter(arg=>arg==='--path'||arg.startsWith('--path='));
 if(!flags.length)return [];
 if(flags.length!==1||flags[0]!=='--path=check')throw failure('operator_path_not_supported');
 return ['check'];
}
export async function operatorBatchManifest(boards:string[],maxCalls:number,maxDecisions:number,source:string,operatorUserId:string,path:string[]=[]):Promise<Manifest>{
 if(typeof operatorUserId!=='string'||!operatorUserId||operatorUserId.length>200||/\s/.test(operatorUserId))throw failure('operator_user_id_required');
 if(!Array.isArray(boards)||boards.length<1||boards.length>50)throw failure('invalid_operator_boards');
 if(!Array.isArray(path)||path.length!==1||path[0]!=='check')throw failure('operator_path_not_supported');
 const requests=boards.map(board=>normalizeRequest(board,path)),unique=new Set(requests.map(request=>(request.board.match(/../g)??[]).sort().join('')));
 if(unique.size!==requests.length)throw failure('duplicate_operator_board');
 const structuralDecisions=requests.length*path.length;
 if(!Number.isInteger(maxCalls)||maxCalls<2*structuralDecisions||maxCalls>200||!Number.isInteger(maxDecisions)||maxDecisions<structuralDecisions||maxDecisions>100)throw failure('invalid_operator_budget');
 if(typeof source!=='string'||!source)throw failure('operator_source_required');
 const implementation=implementationHash(),input=await loadRoot(requests[0].board,source),sourceHash=hash(input.upstream);
 const revision=hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash});
 const manifest={operatorUserId,revision,implementationHash:implementation,sourceHash,requests,maxCalls,maxDecisions};
 return {batchId:hash(manifest),...manifest};
}
function validateReceipt(value:any,manifest:Manifest,partial:boolean):Receipt{
 if(!value||value.batchId!==manifest.batchId||value.revision!==manifest.revision||value.implementationHash!==manifest.implementationHash||value.sourceHash!==manifest.sourceHash||value.maxCalls!==manifest.maxCalls||value.maxDecisions!==manifest.maxDecisions||!Array.isArray(value.jobs)||value.jobs.length>manifest.requests.length||!partial&&value.jobs.length!==manifest.requests.length)throw failure('operator_response_invalid');
 const expected=new Map(manifest.requests.map(request=>[hash({revision:manifest.revision,...request}),request])),seen=new Set<string>();
 const jobs=value.jobs.map((job:any)=>{
  const request=expected.get(job?.id);
  if(!request||seen.has(job.id)||job.board!==request.board||hash(job.path)!==hash(request.path)||!['queued','running','complete','failed'].includes(job.status))throw failure('operator_response_invalid');
  seen.add(job.id);return {id:job.id,board:job.board,path:[...job.path],status:job.status};
 });
 return {batchId:manifest.batchId,revision:manifest.revision,implementationHash:manifest.implementationHash,sourceHash:manifest.sourceHash,maxCalls:manifest.maxCalls,maxDecisions:manifest.maxDecisions,jobs};
}
function receiptSummary(receipt:Receipt){
 return {batchId:receipt.batchId,accepted:receipt.jobs.length,queued:receipt.jobs.filter(job=>job.status==='queued').length,states:Object.fromEntries(['queued','running','complete','failed'].map(status=>[status,receipt.jobs.filter(job=>job.status===status).length])),jobIds:receipt.jobs.map(job=>job.id),maxCalls:receipt.maxCalls,maxDecisions:receipt.maxDecisions};
}
function readBearer(file:string){
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>4096)throw failure('unsafe_bearer_file');
 const token=readFileSync(file,'utf8').trim();if(token.length<32||token.length>4096||/\s/.test(token))throw failure('invalid_bearer_file');return token;
}
export async function enqueueOperatorBatch(options:Options){
 if(options.confirmLocalGeneration!==true)throw failure('explicit_operator_confirmation_required');
 const origin=bridgeOrigin(options.origin,options.allowLoopback);
 const manifest=await operatorBatchManifest(options.boards,options.maxCalls,options.maxDecisions,options.source,options.operatorUserId,options.path);
 const runtime=options.runtimePath??resolve(fileURLToPath(new URL('../../../',import.meta.url)),'.local/range-dashboard/nodonk-operator-batches');
 mkdirSync(runtime,{recursive:true,mode:0o700});
 const file=resolve(runtime,manifest.batchId+'.json'),lock=file+'.lock';
 try{writeFileSync(lock,JSON.stringify({pid:process.pid,batchId:manifest.batchId}),{flag:'wx',mode:0o600});}catch{throw failure('operator_submission_locked');}
 try{
  const bearer=readBearer(options.bearerFile),previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
  const persist=(journal:unknown)=>{const temp=file+'.tmp';writeFileSync(temp,JSON.stringify(journal)+'\n',{mode:0o600});renameSync(temp,file);};
  if(previous){
   if(previous.origin!==origin||hash(previous.manifest)!==hash(manifest))throw failure('operator_submission_manifest_changed');
   if(previous.status==='submitted'){
    const receipt=validateReceipt(previous.receipt,manifest,false);
    return {status:'already_submitted',...receiptSummary(receipt)};
   }
   if(!options.retrySubmission||!['submission_pending','partially_submitted'].includes(previous.status))throw failure('operator_submission_requires_explicit_retry');
  }else if(options.retrySubmission)throw failure('operator_no_pending_submission');
  // Check the source again immediately before writing intent/sending. Generation
  // pins are also validated by the owner endpoint before it mutates any queue row.
  if(hash(await operatorBatchManifest(options.boards,options.maxCalls,options.maxDecisions,options.source,options.operatorUserId,options.path))!==hash(manifest))throw failure('operator_pins_changed');
  persist({status:'submission_pending',origin,manifest});
  let response:Response;
  try{response=await (options.fetch??fetch)(origin+'/v1/aiv2/nodonk/owner/operator-batch',{method:'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify(manifest),redirect:'error',signal:AbortSignal.timeout(15_000)});}catch{throw failure('operator_submission_uncertain');}
  if(response.status!==202&&response.status!==429){
   // Rejected calls are recorded, never automatically retried or resubmitted as
   // another batch. Do not expose broker response bodies or bearer material.
   if(response.status>=400&&response.status<500){
    persist({status:'rejected',origin,manifest,httpStatus:response.status});
    throw failure(response.status===409?'operator_broker_conflict':'operator_broker_rejected');
   }
   throw failure('operator_submission_uncertain');
  }
  let value:any;try{value=await response.json();}catch{throw failure('operator_submission_uncertain');}
  const partial=response.status===429;
  if(partial&&value?.error!=='generation_budget_exhausted')throw failure('operator_submission_uncertain');
  let receipt:Receipt;try{receipt=validateReceipt(value,manifest,partial);}catch{throw failure('operator_submission_uncertain');}
  persist({status:partial?'partially_submitted':'submitted',origin,manifest,receipt});
  return {status:partial?'partially_submitted':'submitted',...receiptSummary(receipt)};
 }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=(name:string)=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
 try{
  const origin=get('origin'),bearerFile=get('bearer-file'),source=get('source-dir'),boards=get('boards'),operatorUserId=get('operator-user-id');
  if(!origin||!bearerFile||!source||!boards||!operatorUserId||get('max-calls')===undefined||get('max-decisions')===undefined)throw failure('operator_explicit_arguments_required');
  const result=await enqueueOperatorBatch({operatorUserId,origin,bearerFile,source:resolve(source),boards:boards.split(','),path:operatorBatchPath(args),maxCalls:Number(get('max-calls')),maxDecisions:Number(get('max-decisions')),confirmLocalGeneration:args.includes('--confirm-local-generation'),retrySubmission:args.includes('--retry-submission'),allowLoopback:args.includes('--allow-loopback-test')});
  console.log(JSON.stringify(result));
 }catch(error){const code=(error as any)?.code;console.error(JSON.stringify({status:'failed',error:typeof code==='string'&&/^operator_[a-z_]+$/.test(code)?code:'operator_batch_failed_no_automatic_retry'}));process.exitCode=1;}
}
