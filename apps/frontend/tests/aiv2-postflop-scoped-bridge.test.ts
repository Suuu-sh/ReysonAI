// New scope/50-lane tests only. Old 25 bridge cases are owned by their prior run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBridge } from '../scripts/aiv2-postflop-ondemand-bridge.ts';
import { CONFIG, DEFAULT_STORE, callProvenance, implementationHash, loadRoot, saveDecision } from '../scripts/aiv2-postflop-ondemand-store.ts';
import { advancePostflopDecision, buildPostflopArtifact, decisionIdentity, postflopHash as hash, postflopLegalActions } from '../scripts/aiv2-postflop-ondemand.ts';
import type { DecisionInput } from '../scripts/aiv2-postflop-ondemand.ts';
const source=resolve(DEFAULT_STORE,'source-snapshot'),scope='a'.repeat(64),otherScope='b'.repeat(64);
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function boards(count:number){if(count===0)return [];const deck=[...'AKQJT98765432'].flatMap(rank=>[...'shdc'].map(suit=>rank+suit)),out:string[]=[];for(let a=0;a<50;a++)for(let b=a+1;b<51;b++)for(let c=b+1;c<52;c++){out.push(deck[a]+deck[b]+deck[c]);if(out.length===count)return out;}return out;}
function metric(index:number){return {transport:'pooled-app-server',model:CONFIG.model,effort:CONFIG.effort,confirmedModel:CONFIG.model,confirmedEffort:CONFIG.effort,status:'completed',sessionTurn:1,threadId:'00000000-0000-4000-8000-'+String(index).padStart(12,'0'),turnId:'00000000-0000-4000-9000-'+String(index).padStart(12,'0')};}
function response(input:DecisionInput,id:string){return {decision_id:id,range_summary:{text:'Synthetic test estimate only.',text_ja:'テスト専用の推定。'},groups:[{combos:Object.keys(input.ranges[input.actor]).filter(combo=>input.ranges[input.actor][combo]>0),mix:Object.fromEntries(postflopLegalActions(input).map(a=>[a.action,a.action==='check'?100:0])),text:'Synthetic check policy only.',text_ja:'テスト専用のチェック方針。'}]};}
async function fixture(count=0){
 const root=mkdtempSync(join(tmpdir(),'aiv2-scoped-bridge-')),bearerFile=join(root,'test-bearer'),runtimePath=join(root,'runtime');mkdirSync(join(root,'decisions'));writeFileSync(bearerFile,'test-only-scoped-private-bearer-1234567890',{mode:0o600});
 const implementation=implementationHash(),seed=await loadRoot('As7d2c',source),sourceHash=hash(seed.upstream),revision=hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash});
 const jobs:any[]=[],outputs=new Map<string,{raw:any;metric:any}>();let index=0;
 for(const board of boards(count)){
  const input=await loadRoot(board,source),id=decisionIdentity(input,implementation),artifact=buildPostflopArtifact(input,response(input,id),implementation);
  saveDecision(artifact,[metric(++index)],root,[callProvenance(input,id,1,null)]);
  const next=advancePostflopDecision(artifact,'check');assert.equal(next.status,'decision');if(next.status!=='decision')throw Error('fixture path');
  const childId=decisionIdentity(next.input,implementation);outputs.set(childId,{raw:response(next.input,childId),metric:metric(index+1000)});
  const path=['check'];jobs.push({id:hash({revision,board,path}),board,path,revision,implementationHash:implementation,sourceHash,operatorBatchId:scope,leaseToken:'test-only-scoped-lease-capability-1234567890',maxDecisions:2,maxProviderCalls:4});
 }
 const requests:Array<{action:string;body:any}>=[];let claims=0;
 const fetcher=async(url:any,init:any)=>{
  assert.equal(init.redirect,'error');assert.match(init.headers.authorization,/^Bearer test-only-/);assert.equal(init.headers.origin,undefined);
  const action=String(url).split('/').at(-1)!,body=JSON.parse(init.body);requests.push({action,body});
  if(action==='claim'){
   assert.equal(body.operatorBatchId,scope);assert.equal(body.revision,revision);assert.equal(body.implementationHash,implementation);assert.equal(body.sourceHash,sourceHash);
   const job=jobs[claims++];return Response.json(job?{operatorBatchId:scope,job}:{operatorBatchId:scope,job:null,scopeComplete:true});
  }
  return Response.json({ok:true});
 };
 const options={origin:'http://127.0.0.1:43210',allowLoopback:true,root,source,bearerFile,runtimePath,fetch:fetcher as typeof fetch,operatorBatchId:scope,watch:true,concurrency:50,maxCalls:200,maxDecisions:100};
 return {root,options,jobs,outputs,requests,claims:()=>claims,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('scoped empty immutable batch finishes finite with default one lane and no provider',async()=>{
 const f=await fixture();try{
  const result=await runBridge({...f.options,concurrency:undefined,providerFactory:()=>{throw Error('no provider');}});
  assert.deepEqual(result,{status:'finished',calls:0,decisions:0,jobs:0,operatorBatchId:scope,scopeComplete:true});assert.equal(f.claims(),1);assert.equal(existsSync(join(f.root,'worker.lock')),false);
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.concurrency,1);assert.equal(journal.operatorBatchId,scope);assert.equal(journal.scope_complete,true);
 }finally{f.cleanup();}
});
test('scoped fifty guard rejects legacy five, malformed scope and over-budget values before network',async()=>{
 const f=await fixture();try{
  for(const patch of [{operatorBatchId:undefined,concurrency:5},{operatorBatchId:undefined,concurrency:50},{operatorBatchId:'short'},{concurrency:51},{maxCalls:201},{maxDecisions:101},{operatorBatchId:undefined,concurrency:1,maxCalls:101}])await assert.rejects(runBridge({...f.options,...patch}));
  assert.equal(f.requests.length,0);assert.equal(existsSync(join(f.root,'worker.lock')),false);
 }finally{f.cleanup();}
});
test('scoped wrong batch envelope or job membership never reaches any provider or other-job upload',async()=>{
 for(const wrongTop of [true,false]){
  const f=await fixture(1);try{
   const fetcher=async(url:any,init:any)=>{
    if(String(url).endsWith('/claim')){f.requests.push({action:'claim',body:JSON.parse(init.body)});return Response.json({operatorBatchId:wrongTop?otherScope:scope,job:{...f.jobs[0],operatorBatchId:wrongTop?scope:otherScope}});}
    return f.options.fetch(url,init);
   };
   await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:()=>{throw Error('no provider for other batch');}}),{code:'invalid_or_stale_claim'});
   assert.equal(f.requests.filter(r=>r.action==='claim').length,1);assert.equal(f.requests.some(r=>['complete','fail'].includes(r.action)),false);
   const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.claim_pending,true);
  }finally{f.cleanup();}
 }
});
test('scoped fifty check children overlap with exact 200-call/100-decision reservation and finite completion',async()=>{
 const f=await fixture(50);let calls=0,active=0,peak=0,drains=0,release!:()=>void;const started=new Promise<void>(resolve=>{release=resolve;});
 try{
  const result=await runBridge({...f.options,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{
   calls++;active++;peak=Math.max(peak,active);if(calls===50)release();await started;
   const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);active--;return structuredClone(output.raw);
  }}),close:()=>{},drain:async()=>{drains++;}})});
  assert.equal(result.status,'finished');assert.equal(result.scopeComplete,true);assert.equal(result.calls,50);assert.equal(result.decisions,50);assert.equal(result.jobs,50);assert.equal(peak,50);assert.equal(drains,50);assert.equal(f.claims(),51);
  const claims=f.requests.filter(r=>r.action==='claim');for(let i=0;i<50;i++){assert.equal(claims[i].body.remainingCalls,200-4*i);assert.equal(claims[i].body.remainingDecisions,100-2*i);assert.equal(claims[i].body.operatorBatchId,scope);}
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.entries.length,50);assert.ok(journal.entries.every((e:any)=>e.status==='complete'&&e.calls===1));assert.equal(journal.diagnostics.first_failure,null);
  for(const [id,output] of f.outputs){const artifact=JSON.parse(readFileSync(join(f.root,'decisions',id+'.json'),'utf8'));assert.equal(artifact.attestation[0].threadId,output.metric.threadId);}
 }finally{f.cleanup();}
});
test('scoped first provider failure blocks siblings corrections, retains sanitized cause and drains',async()=>{
 const f=await fixture(5);let calls=0,drains=0,release!:()=>void;const started=new Promise<void>(resolve=>{release=resolve;});
 try{
  await assert.rejects(runBridge({...f.options,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async()=>{
   const number=++calls;if(calls===5)release();await started;
   if(number===1){onMetric({status:'failed',errorCode:'quota_or_rate_limit',message:'SECRET upstream payload',errorDiagnostic:{message:'SECRET detail'},authorization:'SECRET bearer'});throw Object.assign(Error('SECRET raw provider message'),{code:'quota_or_rate_limit'});}
   await delay(15);return {};
  }}),close:()=>{},drain:async()=>{drains++;}})}),{code:'quota_or_rate_limit'});
  assert.equal(calls,5);assert.equal(drains,5);assert.ok(f.claims()<=6);assert.equal(f.requests.some(r=>r.action==='complete'),false);
  const file=join(f.options.runtimePath,'bridge-journal.json'),journal=JSON.parse(readFileSync(file,'utf8'));assert.equal(lstatSync(file).mode&0o077,0);assert.equal(journal.diagnostics.first_failure.code,'quota_or_rate_limit');assert.equal(JSON.stringify(journal.diagnostics).includes('SECRET'),false);assert.ok(journal.entries.every((e:any)=>e.status==='failed'&&e.call_in_flight));
  for(const id of f.outputs.keys())assert.equal(existsSync(join(f.root,'decisions',id+'.json')),false);
 }finally{f.cleanup();}
});
test('scoped no-local-work but another active lease exits scope_pending rather than idle forever',async()=>{
 const f=await fixture();try{
  const fetcher=async(url:any,init:any)=>String(url).endsWith('/claim')?Response.json({operatorBatchId:scope,job:null,scopeComplete:false}):f.options.fetch(url,init);
  const result=await runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:()=>{throw Error('no provider');}});assert.equal(result.status,'scope_pending');assert.equal(result.scopeComplete,false);
 }finally{f.cleanup();}
});
test('scoped run-once still claims at most one target and never advertises full-batch completion',async()=>{
 const f=await fixture(2);try{
  const result=await runBridge({...f.options,watch:false,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);return output.raw;}}),close:()=>{},drain:async()=>{}})});
  assert.equal(result.jobs,1);assert.equal(result.scopeComplete,false);assert.equal(f.claims(),1);
 }finally{f.cleanup();}
});
test('scoped completion retry is upload-only and cannot switch immutable batches',async()=>{
 const f=await fixture(1);try{
  const fetcher=async(url:any,init:any)=>{if(String(url).endsWith('/complete'))throw Error('lost ack');return f.options.fetch(url,init);};
  await assert.rejects(runBridge({...f.options,watch:false,fetch:fetcher as typeof fetch,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);return output.raw;}}),close:()=>{},drain:async()=>{}})}),{code:'completion_upload_requires_explicit_retry'});
  const before=f.requests.length;await assert.rejects(runBridge({...f.options,operatorBatchId:otherScope,retryCompletion:true}),{code:'completion_scope_changed'});assert.equal(f.requests.length,before);
  const result=await runBridge({...f.options,retryCompletion:true,providerFactory:()=>{throw Error('upload-only');}});assert.equal(result.status,'completion_uploaded');assert.deepEqual(f.requests.slice(before).map(r=>r.action),['complete']);
 }finally{f.cleanup();}
});

test('scoped already-failed immutable batch is not reported finished or retried',async()=>{
 const f=await fixture();try{
  const fetcher=async(url:any,init:any)=>String(url).endsWith('/claim')?Response.json({operatorBatchId:scope,job:null,scopeComplete:true,scopeFailed:true}):f.options.fetch(url,init);
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:()=>{throw Error('no provider for failed batch');}}),{code:'operator_scope_failed'});
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.diagnostics.first_failure.code,'operator_scope_failed');assert.equal(journal.claim_pending,false);assert.equal(journal.calls,0);assert.equal(journal.decisions,0);
 }finally{f.cleanup();}
});
