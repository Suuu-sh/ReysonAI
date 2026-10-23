// Explicit owner worker. Importing this module starts no process or model call.
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAiv2SessionProvider } from './lib/aiv2-provider-session.ts';
import { postflopHash as hash, postflopPrompt, postflopResponseSchema, validatePostflopResponse, buildPostflopArtifact, effectivePostflopPrompt } from './aiv2-postflop-ondemand.ts';
import { CONFIG, DEFAULT_STORE, DEFAULT_SOURCE, implementationHash, listJobs, updateJob, resolveFrontier, saveDecision, loadRoot, callProvenance } from './aiv2-postflop-ondemand-store.ts';
export async function generateOne(input:any,implementation:string,provider:any,beforeCall:()=>void,onCall:(call:ReturnType<typeof callProvenance>)=>void=()=>{}){
 const id=(await import('./aiv2-postflop-ondemand.ts')).decisionIdentity(input,implementation),prompt=postflopPrompt(input,id),schema=postflopResponseSchema(input,id);
 return provider.withSession(async(session:any)=>{
  let issue='';
  for(let attempt=0;attempt<2;attempt++){
   beforeCall();let raw;const validationIssue=attempt?issue:null;onCall(callProvenance(input,id,attempt+1,validationIssue));
   try{raw=await session.run(effectivePostflopPrompt(input,id,validationIssue),{model:CONFIG.model,effort:CONFIG.effort,outputSchema:schema});}
   catch(error){if((error as any).code!=='invalid_json')throw error;issue='Invalid JSON';continue;}
   try{validatePostflopResponse(raw,input,id);return buildPostflopArtifact(input,raw,implementation);}catch(error){issue=(error as Error).message;}
  }
  throw Error('bounded_validation_failed');
 });
}
export async function runWorker(argv:string[]){
 if(!argv.includes('--run-once')&&!argv.includes('--watch'))throw Error('Explicit --run-once or --watch required');
 if(!argv.includes('--confirm-local-generation'))throw Error('Explicit --confirm-local-generation required');
 const number=(name:string,fallback:number)=>Number(argv.find(a=>a.startsWith('--'+name+'='))?.split('=')[1]??fallback);
 const maxDecisions=number('max-decisions',1),maxCalls=number('max-calls',maxDecisions*2);
 if(!Number.isInteger(maxDecisions)||maxDecisions<1||maxDecisions>100||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>200)throw Error('Invalid worker budget');
 const root=DEFAULT_STORE,source=DEFAULT_SOURCE,implementation=implementationHash();mkdirSync(root,{recursive:true});
 const lock=resolve(root,'worker.lock');
 if(existsSync(lock)){
  const old=JSON.parse(readFileSync(lock,'utf8'));let live=true;try{process.kill(old.pid,0);}catch{live=false;}if(live)throw Error('Owner worker already active');
  // A crashed running job is uncertain: never replay its call implicitly.
  for(const job of listJobs(root).filter(j=>j.status==='running'))updateJob({...job,status:'failed',error:'interrupted_owner_worker_manual_review_required'},root);
  unlinkSync(lock);
 }
 writeFileSync(lock,JSON.stringify({pid:process.pid,started_at:new Date().toISOString(),maxDecisions,maxCalls}),{flag:'wx'});
 const retryId=argv.find(a=>a.startsWith('--retry-failed='))?.split('=')[1];
 if(retryId){
  const job=listJobs(root).find(j=>j.id===retryId&&j.status==='failed');
  if(!job||!argv.includes('--acknowledge-uncertain-call')){unlinkSync(lock);throw Error('Explicit failed-job acknowledgement required');}
  if(listJobs(root).some(j=>['queued','running'].includes(j.status))){unlinkSync(lock);throw Error('Another active job exists');}
  job.status='queued';job.error=null;job.call_in_flight=false;updateJob(job,root);
 }
 let stopped=false,calls=0,decisions=0;const stop=()=>{stopped=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 const metrics:any[]=[];let provider:ReturnType<typeof createAiv2SessionProvider>|undefined;
 try{
  while(!stopped&&decisions<maxDecisions&&calls<maxCalls){
   const job=listJobs(root).find(j=>j.status==='queued');
   if(!job){if(!argv.includes('--watch'))break;await new Promise(r=>setTimeout(r,1000));continue;}
   job.status='running';updateJob(job,root);
   try{
    const sourceInput=await loadRoot(job.board,source);
    if(job.pins.implementation!==implementation||hash(sourceInput.upstream)!==hash(job.pins.upstream)||hash(job.pins.config)!==hash(CONFIG))throw Error('source_or_implementation_changed');
    while(!stopped){
     const next=await resolveFrontier(job.board,job.path,root,source,implementation);
     if(next.status!=='missing'){job.status=next.status==='zero-reach'?'zero-reach':'completed';job.total=job.completed;break;}
     if(job.completed>=job.max_decisions||decisions>=maxDecisions||calls>=maxCalls)throw Error('explicit_generation_budget_exhausted');
     job.current_scene=next.id;job.ancestor_index=next.index;updateJob(job,root);
     const start=metrics.length,providerCalls:ReturnType<typeof callProvenance>[]=[];
     // No process is spawned on idle polling or a cache hit.
     provider??=createAiv2SessionProvider({concurrency:1,onMetric:m=>metrics.push(m)});
     const artifact=await generateOne(next.input,implementation,provider,()=>{
      if(stopped)throw Error('controlled_stop');if(calls>=maxCalls)throw Error('explicit_call_budget_exhausted');
      calls++;job.responses_started=(job.responses_started??0)+1;job.call_in_flight=true;updateJob(job,root);
     },call=>providerCalls.push(call));
     saveDecision(artifact,metrics.slice(start),root,providerCalls);job.call_in_flight=false;job.completed++;decisions++;updateJob(job,root);
    }
    if(stopped&&job.status==='running'){job.status='failed';job.error='owner_stopped_resume_requires_explicit_new_request';}
   }catch(error){job.status='failed';const code=(error as any).code;job.error=typeof code==='string'?code:((error as Error).message.match(/^[a-z_]+$/)?(error as Error).message:'generation_failed');stopped=true;}
   updateJob(job,root);
   console.log(JSON.stringify({job_id:job.id,status:job.status,completed:job.completed,error:job.error,calls,decisions}));
   if(argv.includes('--run-once'))break;
  }
 }finally{await provider?.drain();unlinkSync(lock);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runWorker(process.argv.slice(2));
