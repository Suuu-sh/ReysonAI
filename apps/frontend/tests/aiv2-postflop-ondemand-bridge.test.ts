import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { bridgeOrigin, runBridge, validateBridgeJob } from '../scripts/aiv2-postflop-ondemand-bridge.ts';
import { CONFIG, DEFAULT_STORE, implementationHash, loadRoot } from '../scripts/aiv2-postflop-ondemand-store.ts';
import { postflopHash as hash } from '../scripts/aiv2-postflop-ondemand.ts';

const rootId='16c8f7aeff99422bc108d09a22ac8d6988d5df1329d6da1353a7a05854c20c71';
const childId='7504f6574de683065bbc208f0cd783282617a7068f1ee55db7bca702684769c1';
const child=JSON.parse(readFileSync(resolve(DEFAULT_STORE,'decisions',childId+'.json'),'utf8'));
const wait=(n:number)=>new Promise(r=>setTimeout(r,n));
async function fixture(path:string[]=['check'],full=false){
 const root=mkdtempSync(join(tmpdir(),'aiv2-bridge-test-')),bearerFile=join(root,'test-bearer');
 writeFileSync(bearerFile,'test-only-not-a-production-secret-123456789',{mode:0o600});mkdirSync(join(root,'decisions'));
 copyFileSync(resolve(DEFAULT_STORE,'decisions',rootId+'.json'),join(root,'decisions',rootId+'.json'));
 if(full)copyFileSync(resolve(DEFAULT_STORE,'decisions',childId+'.json'),join(root,'decisions',childId+'.json'));
 const implementation=implementationHash(),sourceHash=hash((await loadRoot('As7d2c')).upstream),revision=hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash});
 const job={id:hash({revision,board:'As7d2c',path}),board:'As7d2c',path,revision,implementationHash:implementation,sourceHash,leaseToken:'test-only-lease-token-1234567890123456789',maxProviderCalls:8,maxDecisions:4};
 const requests:Array<{action:string;body:any}>=[];
 const fetcher=async(url:any,init:any)=>{
  assert.equal(init.redirect,'error');assert.match(init.headers.authorization,/^Bearer test-only-/);assert.equal(init.headers.origin,undefined);
  const action=String(url).split('/').at(-1)!,body=JSON.parse(init.body);requests.push({action,body});
  return Response.json(action==='claim'?{job}:{ok:true});
 };
 const options={origin:'http://127.0.0.1:43210',allowLoopback:true,bearerFile,root,runtimePath:join(root,'runtime'),fetch:fetcher as typeof fetch};
 return {root,job,requests,options,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('outbound origin allowlist cannot leak owner bearer through URLs or redirects',()=>{
 assert.equal(bridgeOrigin('https://api.reysonai.com'),'https://api.reysonai.com');
 assert.equal(bridgeOrigin('http://127.0.0.1:1234',true),'http://127.0.0.1:1234');
 for(const url of ['https://evil.example','https://api.reysonai.com.evil.example','http://api.reysonai.com','https://api.reysonai.com:444','https://api.reysonai.com/path','https://user:pass@api.reysonai.com','https://api.reysonai.com/?x=1','http://127.0.0.1:1234'])assert.throws(()=>bridgeOrigin(url));
});
test('claim pins, revision, identity and per-job budgets are strictly bound',async()=>{
 const f=await fixture();try{
  validateBridgeJob(f.job,f.job.implementationHash,f.job.sourceHash);
  for(const patch of [{implementationHash:'0'.repeat(64)},{sourceHash:'0'.repeat(64)},{revision:'0'.repeat(64)},{id:'0'.repeat(64)},{maxDecisions:5},{maxProviderCalls:9},{path:['bet66']},{leaseToken:'short'}])assert.throws(()=>validateBridgeJob({...f.job,...patch},f.job.implementationHash,f.job.sourceHash));
 }finally{f.cleanup();}
});
test('cache-hit claim uploads locally validated proof with zero provider creation',async()=>{
 const f=await fixture(['check'],true);try{
  const result=await runBridge({...f.options,providerFactory:()=>{throw Error('must not instantiate provider');}});
  assert.equal(result.calls,0);assert.equal(result.decisions,0);assert.equal(result.jobs,1);
  assert.deepEqual(f.requests.map(r=>r.action),['heartbeat','claim','heartbeat','complete']);
  const completion=f.requests.at(-1)!.body;
  assert.equal(completion.result.snapshot.scene.key,childId);assert.equal(completion.result.proof.validatedStore,true);assert.equal(completion.result.proof.sourceHash,f.job.sourceHash);
  assert.equal(completion.result.snapshot.scene.provenance.independent_gto_approved,false);
  assert.equal(existsSync(join(f.root,'worker.lock')),false);
 }finally{f.cleanup();}
});
test('idle watch announces pinned readiness before claim and maintains heartbeat while waiting',async()=>{
 const f=await fixture(),controller=new AbortController();
 try{
  const fetcher=async(url:any,init:any)=>{
   if(String(url).endsWith('/claim')){await wait(15);controller.abort();return Response.json({job:null});}
   return f.options.fetch(url,init);
  };
  const result=await runBridge({...f.options,fetch:fetcher as typeof fetch,watch:true,signal:controller.signal,heartbeatMs:2,pollMs:2,providerFactory:()=>{throw Error('no idle provider');}});
  assert.equal(result.calls,0);assert.equal(result.status,'stopped');
  assert.equal(f.requests[0].action,'heartbeat');
  assert.ok(f.requests.filter(r=>r.action==='heartbeat').length>1);
  assert.equal(f.requests[0].body.sourceHash,f.job.sourceHash);
  assert.equal(f.requests[0].body.revision,f.job.revision);
 }finally{f.cleanup();}
});
test('one saved missing decision, exact metrics and heartbeat while provider call is pending',async()=>{
 const f=await fixture();let calls=0,closed=0;
 try{
  const result=await runBridge({...f.options,heartbeatMs:2,providerFactory:onMetric=>({
   withSession:async(fn:any)=>fn({run:async()=>{calls++;await wait(15);onMetric(child.attestation[0]);return structuredClone(child.artifact.source_response);}}),
   close:()=>{closed++;},drain:async()=>{},
  })});
  assert.equal(calls,1);assert.equal(result.calls,1);assert.equal(result.decisions,1);assert.equal(closed,0);
  assert.ok(f.requests.filter(r=>r.action==='heartbeat').length>1);
  assert.equal(JSON.parse(readFileSync(join(f.root,'decisions',childId+'.json'),'utf8')).artifact.metadata.policy_hash,child.artifact.metadata.policy_hash);
  assert.equal(f.requests.at(-1)!.action,'complete');
 }finally{f.cleanup();}
});
test('decision and global call budgets stop before another provider call; no job retry',async()=>{
 const f=await fixture(['check','bet33']);let calls=0;
 try{
  await assert.rejects(runBridge({...f.options,maxDecisions:1,providerFactory:onMetric=>({
   withSession:async(fn:any)=>fn({run:async()=>{calls++;onMetric(child.attestation[0]);return structuredClone(child.artifact.source_response);}}),close:()=>{},drain:async()=>{},
  })}),{code:'budget_exhausted'});
  assert.equal(calls,1);assert.equal(f.requests.filter(r=>r.action==='claim').length,1);
  assert.equal(f.requests.at(-1)!.body.error,'budget_exhausted');
 }finally{f.cleanup();}
 const g=await fixture();calls=0;
 try{
  await assert.rejects(runBridge({...g.options,maxCalls:1,providerFactory:()=>({withSession:async(fn:any)=>fn({run:async()=>{calls++;return {};}}),close:()=>{},drain:async()=>{}})}),{code:'uncertain_provider_outcome'});
  assert.equal(calls,1);assert.equal(g.requests.at(-1)!.body.error,'uncertain_provider_outcome');
 }finally{g.cleanup();}
});
test('heartbeat transport failure during generation poisons lease and forbids complete or retry',async()=>{
 const f=await fixture();let calls=0,beats=0,closes=0;
 try{
  const fetcher=async(url:any,init:any)=>{
   if(String(url).endsWith('/heartbeat')&&++beats>2)throw Error('never expose network secret');
   return f.options.fetch(url,init);
  };
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,heartbeatMs:2,providerFactory:onMetric=>({
   withSession:async(fn:any)=>fn({run:async()=>{calls++;await wait(15);onMetric(child.attestation[0]);return structuredClone(child.artifact.source_response);}}),close:()=>{closes++;},drain:async()=>{},
  })}),{code:'uncertain_provider_outcome'});
  assert.equal(calls,1);assert.ok(closes>0);assert.equal(f.requests.some(r=>r.action==='complete'),false);
  assert.equal(existsSync(join(f.root,'decisions',childId+'.json')),false);
 }finally{f.cleanup();}
});
test('lost complete acknowledgement permits explicit upload-only retry but no model/claim replay',async()=>{
 const f=await fixture(['check'],true);
 try{
  const fetcher=async(url:any,init:any)=>{if(String(url).endsWith('/complete'))throw Error('uncertain upload');return f.options.fetch(url,init);};
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch}),{code:'completion_upload_requires_explicit_retry'});
  assert.equal(JSON.parse(readFileSync(join(f.root,'runtime','bridge-journal.json'),'utf8')).status,'completion_pending');
  await assert.rejects(runBridge(f.options),{code:'previous_owner_outcome_requires_manual_review'});
  const before=f.requests.length;
  const result=await runBridge({...f.options,retryCompletion:true,providerFactory:()=>{throw Error('no provider on upload retry');}});
  assert.equal(result.calls,0);assert.deepEqual(f.requests.slice(before).map(r=>r.action),['complete']);
 }finally{f.cleanup();}
});
test('shared local-worker lock and insecure token permissions fail closed before network',async()=>{
 const f=await fixture();try{
  writeFileSync(join(f.root,'worker.lock'),'{}');
  await assert.rejects(runBridge(f.options),{code:'owner_worker_locked'});assert.equal(f.requests.length,0);
  // No stale lock recovery is attempted automatically.
  assert.equal(existsSync(join(f.root,'worker.lock')),true);
 }finally{f.cleanup();}
 const g=await fixture();try{
  const {chmodSync}=await import('node:fs');chmodSync(g.options.bearerFile,0o644);
  await assert.rejects(runBridge(g.options),{code:'unsafe_bearer_file'});assert.equal(g.requests.length,0);
 }finally{g.cleanup();}
});
