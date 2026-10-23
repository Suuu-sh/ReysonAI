import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { bridgeOrigin, runBridge, validateBridgeJob } from '../scripts/aiv2-postflop-ondemand-bridge.ts';
import { CONFIG, DEFAULT_STORE, implementationHash, loadRoot } from '../scripts/aiv2-postflop-ondemand-store.ts';
import { postflopHash as hash } from '../scripts/aiv2-postflop-ondemand.ts';

const source=resolve(DEFAULT_STORE,'source-snapshot');
const rootId='16c8f7aeff99422bc108d09a22ac8d6988d5df1329d6da1353a7a05854c20c71';
const childId='7504f6574de683065bbc208f0cd783282617a7068f1ee55db7bca702684769c1';
const child=JSON.parse(readFileSync(resolve(DEFAULT_STORE,'decisions',childId+'.json'),'utf8'));
const wait=(n:number)=>new Promise(r=>setTimeout(r,n));
async function fixture(path:string[]=['check'],full=false){
 const root=mkdtempSync(join(tmpdir(),'aiv2-bridge-test-')),bearerFile=join(root,'test-bearer');
 writeFileSync(bearerFile,'test-only-not-a-production-secret-123456789',{mode:0o600});mkdirSync(join(root,'decisions'));
 copyFileSync(resolve(DEFAULT_STORE,'decisions',rootId+'.json'),join(root,'decisions',rootId+'.json'));
 if(full)copyFileSync(resolve(DEFAULT_STORE,'decisions',childId+'.json'),join(root,'decisions',childId+'.json'));
 const implementation=implementationHash(),sourceHash=hash((await loadRoot('As7d2c',source)).upstream),revision=hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash});
 const maxDecisions=1+path.filter(token=>! /^[AKQJT98765432][shdc]$/.test(token)).length;
 const job={id:hash({revision,board:'As7d2c',path}),board:'As7d2c',path,revision,implementationHash:implementation,sourceHash,leaseToken:'test-only-lease-token-1234567890123456789',maxProviderCalls:2*maxDecisions,maxDecisions};
 const requests:Array<{action:string;body:any}>=[];
 const fetcher=async(url:any,init:any)=>{
  assert.equal(init.redirect,'error');assert.match(init.headers.authorization,/^Bearer test-only-/);assert.equal(init.headers.origin,undefined);
  const action=String(url).split('/').at(-1)!,body=JSON.parse(init.body);requests.push({action,body});
  return Response.json(action==='claim'?{job}:{ok:true});
 };
 const options={source,origin:'http://127.0.0.1:43210',allowLoopback:true,bearerFile,root,runtimePath:join(root,'runtime'),fetch:fetcher as typeof fetch};
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
  for(const patch of [{implementationHash:'0'.repeat(64)},{sourceHash:'0'.repeat(64)},{revision:'0'.repeat(64)},{id:'0'.repeat(64)},{maxDecisions:33},{maxProviderCalls:65},{maxProviderCalls:3},{maxDecisions:1},{path:['bet66']},{leaseToken:'short'}])assert.throws(()=>validateBridgeJob({...f.job,...patch},f.job.implementationHash,f.job.sourceHash));
  const withPath=(path:string[],maxDecisions:number,maxProviderCalls:number)=>({...f.job,path,id:hash({revision:f.job.revision,board:f.job.board,path}),maxDecisions,maxProviderCalls});
  // These test only envelope bounds; the snapshot reader separately rejects illegal poker paths.
  validateBridgeJob(withPath(Array(31).fill('check'),32,64),f.job.implementationHash,f.job.sourceHash);
  assert.throws(()=>validateBridgeJob(withPath(Array(31).fill('check'),32,65),f.job.implementationHash,f.job.sourceHash));
  assert.throws(()=>validateBridgeJob(withPath(Array(32).fill('check'),33,66),f.job.implementationHash,f.job.sourceHash));
  validateBridgeJob(withPath([],1,2),f.job.implementationHash,f.job.sourceHash);
  validateBridgeJob(withPath(['check','check','Kd'],3,6),f.job.implementationHash,f.job.sourceHash);
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
test('claim capacity prevents leasing an unaffordable job and exits watch cleanly',async()=>{
 const f=await fixture();let claims=0;
 try{
  const fetcher=async(url:any,init:any)=>{
   if(String(url).endsWith('/claim')){
    claims++;assert.deepEqual(JSON.parse(init.body),{remainingCalls:7,remainingDecisions:5});
    return Response.json({job:null,budgetBlocked:true});
   }
   return f.options.fetch(url,init);
  };
  const result=await runBridge({...f.options,fetch:fetcher as typeof fetch,watch:true,maxCalls:7,maxDecisions:5,providerFactory:()=>{throw Error('no provider without fitting lease');}});
  assert.deepEqual(result,{status:'budget_blocked',calls:0,decisions:0,jobs:0});assert.equal(claims,1);
  assert.equal(f.requests.some(r=>r.action==='fail'||r.action==='complete'),false);
  assert.equal(JSON.parse(readFileSync(join(f.root,'runtime','bridge-journal.json'),'utf8')).status,'idle');
  assert.equal(existsSync(join(f.root,'worker.lock')),false);
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

// Parallel tests use generated test-only JSON, never the real provider/network.
async function parallelFixture(boards=['QsJhTd','9s8s6d']){
 const f=await fixture([]);
 const {decisionIdentity,postflopLegalActions}=await import('../scripts/aiv2-postflop-ondemand.ts');
 const jobs=boards.map(board=>({...f.job,board,id:hash({revision:f.job.revision,board,path:[]})}));
 const outputs=new Map<string,{raw:any;metric:any}>();
 for(const job of jobs){
  const input=await loadRoot(job.board,source),id=decisionIdentity(input,implementationHash());
  outputs.set(id,{raw:{decision_id:id,range_summary:{text:'Test only AI estimate.',text_ja:'テスト専用のAI推定。'},groups:[{combos:Object.keys(input.ranges[input.actor]).filter(combo=>input.ranges[input.actor][combo]>0),mix:Object.fromEntries(postflopLegalActions(input).map(a=>[a.action,a.action==='check'?100:0])),text:'Test only check policy.',text_ja:'テスト専用チェック方針。'}]},metric:{...child.attestation[0],threadId:'test-'+job.board,turnId:'turn-'+job.board}});
 }
 let claims=0;
 const fetcher=async(url:any,init:any)=>{
  if(String(url).endsWith('/claim')){
   const job=jobs[claims++];f.requests.push({action:'claim',body:JSON.parse(init.body)});
   return Response.json(job?{job}:{job:null,budgetBlocked:true});
  }
  return f.options.fetch(url,init);
 };
 return {...f,jobs,outputs,options:{...f.options,fetch:fetcher as typeof fetch,concurrency:2,watch:true,maxDecisions:boards.length,maxCalls:2*boards.length},claimCount:()=>claims};
}
test('parallel concurrency is bounded and invalid values fail before network',async()=>{
 const f=await parallelFixture();try{
  for(const concurrency of [0,5,1.5,NaN])await assert.rejects(runBridge({...f.options,concurrency}),{code:'invalid_bridge_concurrency'});
  assert.equal(f.requests.length,0);
 }finally{f.cleanup();}
});
test('two root jobs overlap with isolated evidence, one lock, and reserved aggregate capacity',async()=>{
 const f=await parallelFixture();let active=0,peak=0,providers=0,drains=0;
 try{
  mkdirSync(f.options.runtimePath);writeFileSync(join(f.options.runtimePath,'bridge-journal.json'),JSON.stringify({status:'idle',calls:0,decisions:0}));
  const result=await runBridge({...f.options,heartbeatMs:2,providerFactory:onMetric=>{
   providers++;
   return {withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{
    assert.equal(existsSync(join(f.root,'worker.lock')),true);active++;peak=Math.max(peak,active);
    await wait(35);const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;
    onMetric(output.metric);active--;return structuredClone(output.raw);
   }}),close:()=>{},drain:async()=>{drains++;}};
  }});
  assert.deepEqual(result,{status:'finished',calls:2,decisions:2,jobs:2});assert.equal(peak,2);assert.equal(providers,2);assert.equal(drains,2);assert.equal(f.claimCount(),2);
  assert.deepEqual(f.requests.filter(r=>r.action==='claim').map(r=>r.body),[{remainingCalls:4,remainingDecisions:2},{remainingCalls:2,remainingDecisions:1}]);
  for(const [id,output] of f.outputs){const envelope=JSON.parse(readFileSync(join(f.root,'decisions',id+'.json'),'utf8'));assert.equal(envelope.attestation[0].threadId,output.metric.threadId);assert.equal(envelope.provider_calls.length,1);}
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));
  assert.equal(journal.format,'parallel-owner-v1');assert.equal(journal.status,'complete');assert.equal(journal.entries.length,2);assert.ok(journal.entries.every((e:any)=>e.status==='complete'&&e.calls===1&&e.decisions===1&&!e.call_in_flight));
  assert.equal(existsSync(join(f.root,'worker.lock')),false);
 }finally{f.cleanup();}
});
test('parallel reservation prevents a second lease beyond the aggregate decision budget',async()=>{
 const f=await parallelFixture();let calls=0;
 try{
  const result=await runBridge({...f.options,maxDecisions:1,maxCalls:2,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{calls++;await wait(10);const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);return output.raw;}}),close:()=>{},drain:async()=>{}})});
  assert.equal(result.decisions,1);assert.equal(calls,1);assert.equal(f.claimCount(),1);
 }finally{f.cleanup();}
});
test('one lane uncertainty blocks sibling correction/new claims and drains both providers',async()=>{
 const f=await parallelFixture();let calls=0,drains=0;
 try{
  await assert.rejects(runBridge({...f.options,providerFactory:()=>({withSession:async(fn:any)=>fn({run:async()=>{
   const number=++calls;await wait(number===1?15:35);if(number===1)throw Object.assign(Error('test failure'),{code:'test_uncertain'});return {}; // Invalid sibling JSON must not trigger its correction after halt.
  }}),close:()=>{},drain:async()=>{drains++;}})}));
  assert.equal(calls,2);assert.equal(drains,2);assert.equal(f.claimCount(),2);assert.equal(f.requests.some(r=>r.action==='complete'),false);
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));
  assert.equal(journal.status,'failed');assert.equal(journal.entries.length,2);assert.ok(journal.entries.every((e:any)=>e.status==='failed'&&e.calls===1&&e.call_in_flight));
  for(const id of f.outputs.keys())assert.equal(existsSync(join(f.root,'decisions',id+'.json')),false);
 }finally{f.cleanup();}
});
test('parallel lost completion is retained per job and supports explicit upload-only retry',async()=>{
 const f=await parallelFixture();let calls=0,completions=0;
 try{
  const fetcher=async(url:any,init:any)=>{if(String(url).endsWith('/complete')&&++completions===1)throw Error('lost ack');return f.options.fetch(url,init);};
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{const number=++calls;await wait(number===1?15:45);const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);return output.raw;}}),close:()=>{},drain:async()=>{}})}),{code:'completion_upload_requires_explicit_retry'});
  let journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));
  assert.equal(journal.status,'completion_pending');assert.equal(journal.entries.filter((e:any)=>e.status==='completion_pending').length,1);assert.equal(journal.entries.filter((e:any)=>e.status==='failed').length,1);
  await assert.rejects(runBridge({...f.options,concurrency:1}),{code:'previous_owner_outcome_requires_manual_review'});
  await assert.rejects(runBridge(f.options),{code:'previous_owner_outcome_requires_manual_review'});
  const before=f.requests.length;
  const result=await runBridge({...f.options,retryCompletion:true,providerFactory:()=>{throw Error('upload only');}});
  assert.equal(result.status,'completion_uploaded');assert.deepEqual(f.requests.slice(before).map(r=>r.action),['complete']);assert.equal(calls,2);
  journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.ok(journal.entries.every((e:any)=>['complete','failed'].includes(e.status)));
 }finally{f.cleanup();}
});
test('same-board overlapping paths serialize ancestors without duplicate cache writes',async()=>{
 const f=await fixture([]);let claims=0,calls=0,active=0,peak=0;
 const rootEnvelope=JSON.parse(readFileSync(join(f.root,'decisions',rootId+'.json'),'utf8'));
 rmSync(join(f.root,'decisions',rootId+'.json'));
 const jobs=[f.job,{...f.job,path:['check'],id:hash({revision:f.job.revision,board:f.job.board,path:['check']}),maxDecisions:2,maxProviderCalls:4}];
 try{
  const fetcher=async(url:any,init:any)=>{
   if(String(url).endsWith('/claim')){const job=jobs[claims++];f.requests.push({action:'claim',body:JSON.parse(init.body)});return Response.json(job?{job}:{job:null,budgetBlocked:true});}
   return f.options.fetch(url,init);
  };
  const result=await runBridge({...f.options,fetch:fetcher as typeof fetch,concurrency:2,watch:true,maxDecisions:3,maxCalls:6,pollMs:2,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{
   calls++;active++;peak=Math.max(peak,active);await wait(20);const envelope=options.outputSchema.properties.decision_id.const===rootId?rootEnvelope:child;onMetric(envelope.attestation[0]);active--;return structuredClone(envelope.artifact.source_response);
  }}),close:()=>{},drain:async()=>{}})});
  assert.equal(result.decisions,2);assert.equal(calls,2);assert.equal(peak,1);assert.equal(f.requests.filter(r=>r.action==='complete').length,2);
 }finally{f.cleanup();}
});
test('parallel two-turn corrections retain per-job metric provenance and aggregate four-call cap',async()=>{
 const f=await parallelFixture(),turns=new Map<string,number>();let calls=0;
 try{
  const result=await runBridge({...f.options,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{
   calls++;const id=options.outputSchema.properties.decision_id.const,turn=(turns.get(id)??0)+1;turns.set(id,turn);await wait(15);
   const output=f.outputs.get(id)!;onMetric({...output.metric,sessionTurn:turn,turnId:output.metric.turnId+'-'+turn});return turn===1?{}:structuredClone(output.raw);
  }}),close:()=>{},drain:async()=>{}})});
  assert.equal(result.calls,4);assert.equal(result.decisions,2);assert.equal(calls,4);assert.equal(f.claimCount(),2);
  for(const [id,output] of f.outputs){const envelope=JSON.parse(readFileSync(join(f.root,'decisions',id+'.json'),'utf8'));assert.equal(envelope.attestation.length,2);assert.ok(envelope.attestation.every((m:any)=>m.threadId===output.metric.threadId));assert.equal(envelope.provider_calls[1].session_turn,2);assert.ok(envelope.provider_calls[1].validation_issue);}
 }finally{f.cleanup();}
});
test('uncertain parallel claim is never retried and blocks both restart modes',async()=>{
 const f=await parallelFixture();let claims=0;
 try{
  const fetcher=async(url:any,init:any)=>{if(String(url).endsWith('/claim')){claims++;throw Error('lost claim');}return f.options.fetch(url,init);};
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:()=>{throw Error('must not create provider');}}),{code:'bridge_transport_uncertain'});
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.claim_pending,true);assert.equal(claims,1);
  for(const concurrency of [1,2,4])await assert.rejects(runBridge({...f.options,concurrency}),{code:'previous_owner_outcome_requires_manual_review'});
  await assert.rejects(runBridge({...f.options,retryCompletion:true}),{code:'no_pending_completion'});
 }finally{f.cleanup();}
});
test('parallel job heartbeat loss stops sibling calls and unresolved fail upload blocks restart',async()=>{
 const f=await parallelFixture();let calls=0,beats=0;
 try{
  const fetcher=async(url:any,init:any)=>{
   const action=String(url).split('/').at(-1);if(action==='heartbeat'&&JSON.parse(init.body).id&&++beats>2)throw Error('lost lease heartbeat');
   if(action==='fail')throw Error('lost failure acknowledgement');return f.options.fetch(url,init);
  };
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,heartbeatMs:2,providerFactory:()=>({withSession:async(fn:any)=>fn({run:async()=>{calls++;await wait(35);return {};}}),close:()=>{},drain:async()=>{}})}));
  assert.equal(calls,2);assert.equal(f.requests.some(r=>r.action==='complete'),false);
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.ok(journal.entries.some((e:any)=>e.status==='failure_pending'));
  for(const concurrency of [1,2,4])await assert.rejects(runBridge({...f.options,concurrency}),{code:'previous_owner_outcome_requires_manual_review'});
 }finally{f.cleanup();}
});
test('parallel idle heartbeat failure is surfaced even while the final claim exits cleanly',async()=>{
 const f=await parallelFixture();let beats=0;
 try{
  const fetcher=async(url:any,init:any)=>{
   if(String(url).endsWith('/heartbeat')&&++beats>1){await wait(20);throw Error('late idle heartbeat failure');}
   if(String(url).endsWith('/claim')){await wait(10);return Response.json({job:null,budgetBlocked:true});}
   return f.options.fetch(url,init);
  };
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,heartbeatMs:2,providerFactory:()=>{throw Error('no provider while idle');}}),{code:'bridge_transport_uncertain'});
  assert.equal(existsSync(join(f.root,'worker.lock')),false);
 }finally{f.cleanup();}
});
test('four disjoint roots overlap with isolated evidence, exact aggregate reservations and safe old journal migration',async()=>{
 const f=await parallelFixture(['QsJhTd','9s8s6d','AhKd7c','Tc9h5s']);let calls=0,active=0,peak=0,drains=0,release!:()=>void;
 const allStarted=new Promise<void>(resolve=>{release=resolve;});
 try{
  mkdirSync(f.options.runtimePath);writeFileSync(join(f.options.runtimePath,'bridge-journal.json'),JSON.stringify({format:'parallel-owner-v1',status:'complete',origin:f.options.origin,concurrency:2,claim_pending:false,calls:2,decisions:2,entries:[]}));
  const result=await runBridge({...f.options,concurrency:4,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{
   calls++;active++;peak=Math.max(peak,active);if(calls===4)release();await allStarted;
   const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);active--;return structuredClone(output.raw);
  }}),close:()=>{},drain:async()=>{drains++;}})});
  assert.deepEqual(result,{status:'finished',calls:4,decisions:4,jobs:4});assert.equal(peak,4);assert.equal(drains,4);assert.equal(f.claimCount(),4);
  assert.deepEqual(f.requests.filter(r=>r.action==='claim').map(r=>r.body),[{remainingCalls:8,remainingDecisions:4},{remainingCalls:6,remainingDecisions:3},{remainingCalls:4,remainingDecisions:2},{remainingCalls:2,remainingDecisions:1}]);
  for(const [id,output] of f.outputs){const envelope=JSON.parse(readFileSync(join(f.root,'decisions',id+'.json'),'utf8'));assert.equal(envelope.attestation[0].threadId,output.metric.threadId);assert.equal(envelope.provider_calls.length,1);}
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.concurrency,4);assert.equal(journal.entries.length,4);assert.ok(journal.entries.every((entry:any)=>entry.status==='complete'&&entry.calls===1));
 }finally{f.cleanup();}
});
test('four-lane setting never leases a fourth root when only three reservations fit',async()=>{
 const f=await parallelFixture(['QsJhTd','9s8s6d','AhKd7c','Tc9h5s']);let calls=0;
 try{
  const result=await runBridge({...f.options,concurrency:4,maxDecisions:3,maxCalls:6,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async(_prompt:any,options:any)=>{calls++;await wait(10);const output=f.outputs.get(options.outputSchema.properties.decision_id.const)!;onMetric(output.metric);return output.raw;}}),close:()=>{},drain:async()=>{}})});
  assert.equal(result.decisions,3);assert.equal(calls,3);assert.equal(f.claimCount(),3);
 }finally{f.cleanup();}
});
test('four-lane uncertainty prevents every sibling correction and drains all started work',async()=>{
 const f=await parallelFixture(['QsJhTd','9s8s6d','AhKd7c','Tc9h5s']);let calls=0,drains=0,release!:()=>void;
 const allStarted=new Promise<void>(resolve=>{release=resolve;});
 try{
  await assert.rejects(runBridge({...f.options,concurrency:4,providerFactory:()=>({withSession:async(fn:any)=>fn({run:async()=>{
   const number=++calls;if(number===4)release();await allStarted;
   if(number===1)throw Object.assign(Error('mock uncertain response'),{code:'test_uncertain'});await wait(15);return {};
  }}),close:()=>{},drain:async()=>{drains++;}})}));
  assert.equal(calls,4);assert.equal(drains,4);assert.equal(f.claimCount(),4);assert.equal(f.requests.some(r=>r.action==='complete'),false);
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.concurrency,4);assert.equal(journal.entries.length,4);assert.ok(journal.entries.every((entry:any)=>entry.status==='failed'&&entry.calls===1));
  for(const id of f.outputs.keys())assert.equal(existsSync(join(f.root,'decisions',id+'.json')),false);
 }finally{f.cleanup();}
});

test('single-lane failure diagnostics are durable, private and strictly sanitized',async()=>{
 for(const originalCode of ['quota_or_rate_limit','secret-bearer-prompt-output-code']){
  const f=await fixture();try{
   const metric={status:'failed',errorCode:originalCode,model:CONFIG.model,effort:CONFIG.effort,confirmedModel:CONFIG.model,confirmedEffort:CONFIG.effort,threadId:'01a1679f-4a9b-7e23-a46c-2fb9d6259e64',turnId:'01a1679f-4b53-7193-b228-ed00491a2c5c',elapsedMs:42,sessionTurn:1,message:'secret-bearer-prompt-output-message',errorDiagnostic:{message:'secret-bearer-prompt-output-diagnostic'},prompt:'secret-bearer-prompt-output-prompt',output:'secret-bearer-prompt-output-output',leaseToken:'secret-bearer-prompt-output-lease',authorization:'secret-bearer-prompt-output-auth'};
   await assert.rejects(runBridge({...f.options,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async()=>{onMetric(metric);throw Object.assign(Error('secret-bearer-prompt-output-exception'),{code:originalCode});}}),close:()=>{},drain:async()=>{}})}),{code:'uncertain_provider_outcome'});
   const file=join(f.options.runtimePath,'bridge-journal.json'),journal=JSON.parse(readFileSync(file,'utf8')),d=journal.diagnostics;
   assert.equal(lstatSync(file).mode&0o077,0);assert.equal(journal.calls,1);assert.equal(journal.decisions,0);assert.equal(journal.error,'uncertain_provider_outcome');
   assert.equal(d.first_failure.code,originalCode==='quota_or_rate_limit'?originalCode:'unclassified_failure');assert.equal(d.first_failure.phase,'provider');assert.ok(Number.isFinite(Date.parse(d.first_failure.at)));assert.ok(Number.isSafeInteger(d.first_failure.elapsed_ms));
   const saved=d.jobs[f.job.id].metrics;assert.equal(saved.length,1);assert.equal(saved[0].threadId,metric.threadId);assert.equal(saved[0].turnId,metric.turnId);assert.equal(saved[0].elapsedMs,42);assert.equal(saved[0].model,CONFIG.model);assert.equal(saved[0].effort,CONFIG.effort);
   assert.equal(JSON.stringify(d).includes('secret-bearer-prompt-output'),false);assert.equal(JSON.stringify(d).includes(f.job.leaseToken),false);assert.equal(f.requests.some(r=>r.action==='complete'),false);
  }finally{f.cleanup();}
 }
});
test('parallel diagnostics retain original cause across sibling and failure-upload errors without replay',async()=>{
 const f=await parallelFixture();let calls=0,drains=0,release!:()=>void;
 const started=new Promise<void>(resolve=>{release=resolve;});
 try{
  const fetcher=async(url:any,init:any)=>{if(String(url).endsWith('/fail'))throw Error('secret failure upload body');return f.options.fetch(url,init);};
  await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async()=>{
   const number=++calls;if(number===2)release();await started;if(number===2)await wait(15);
   const code=number===1?'quota_or_rate_limit':'authentication_required';onMetric({status:'failed',errorCode:code,model:CONFIG.model,effort:CONFIG.effort,threadId:'secret-must-not-be-a-thread-id',turnId:'secret-must-not-be-a-turn-id',stderr:'secret raw stderr'});throw Object.assign(Error('secret upstream message'),{code});
  }}),close:()=>{},drain:async()=>{drains++;}})}),{code:'quota_or_rate_limit'});
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8')),d=journal.diagnostics;
  assert.equal(calls,2);assert.equal(drains,2);assert.equal(f.claimCount(),2);assert.equal(d.first_failure.code,'quota_or_rate_limit');assert.equal(d.first_failure.phase,'provider');assert.equal(Object.keys(d.jobs).length,2);assert.ok(Object.values<any>(d.jobs).every(j=>j.metrics.length===1&&j.failure));assert.equal(JSON.stringify(d).includes('secret'),false);
  assert.ok(journal.entries.every((e:any)=>e.status==='failure_pending'&&e.call_in_flight));assert.equal(f.requests.some(r=>r.action==='complete'),false);assert.equal(existsSync(join(f.root,'worker.lock')),false);
 }finally{f.cleanup();}
});

test('lease confirmation retries one transport reject with identical capability and records only confirmed success, never a provider replay',async()=>{
 for(const concurrency of [1,2]){
  const f=await fixture(['check'],true);let beats=0,providers=0;const bodies:string[]=[];
  try{
   const fetcher=async(url:any,init:any)=>{
    if(String(url).endsWith('/heartbeat')&&JSON.parse(init.body).id){bodies.push(init.body);beats++;if(beats===1)throw Error('secret-network-cause');const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(journal.diagnostics.first_failure,null);assert.equal(journal.diagnostics.lease_heartbeat_transport_retries[0].outcome,'pending');}
    return f.options.fetch(url,init);
   };
   const result=await runBridge({...f.options,concurrency,fetch:fetcher as typeof fetch,providerFactory:()=>{providers++;throw Error('no provider on cache');}});
   const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8')),d=journal.diagnostics;
   assert.equal(result.jobs,1);assert.equal(result.calls,0);assert.equal(providers,0);assert.equal(beats,2);assert.equal(bodies[0],bodies[1]);assert.equal(d.first_failure,null);assert.equal(d.lease_heartbeat_transport_retries.length,1);assert.equal(d.lease_heartbeat_transport_retries[0].outcome,'confirmed');assert.equal(d.lease_heartbeat_transport_retries[0].attempt,1);assert.equal(f.requests.filter(r=>r.action==='claim').length,1);assert.equal(f.requests.filter(r=>r.action==='complete').length,1);assert.equal(JSON.stringify(d).includes('secret'),false);assert.equal(JSON.stringify(d).includes('leaseToken'),false);
  }finally{f.cleanup();}
 }
});
test('lease confirmation second transport reject or definitive rejection fails closed without a third attempt',async()=>{
 for(const concurrency of [1,2])for(const rejection of ['transport',409,429,500,'json','not_ok']){
  const f=await fixture(['check'],true);let beats=0,providers=0;
  try{
   const fetcher=async(url:any,init:any)=>{
    if(String(url).endsWith('/heartbeat')&&JSON.parse(init.body).id){beats++;if(rejection==='transport')throw Error('secret-network-cause');if(rejection==='json')return new Response('invalid JSON');if(rejection==='not_ok')return Response.json({ok:false});return Response.json({error:'secret'}, {status:typeof rejection==='number'?rejection:500});}
    return f.options.fetch(url,init);
   };
   await assert.rejects(runBridge({...f.options,concurrency,fetch:fetcher as typeof fetch,providerFactory:()=>{providers++;throw Error('no provider on failed lease');}}));
   const d=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8')).diagnostics;assert.equal(beats,rejection==='transport'?2:1);assert.equal(providers,0);assert.equal(f.requests.some(r=>r.action==='complete'),false);assert.equal(d.lease_heartbeat_transport_retries.length,rejection==='transport'?1:0);if(rejection==='transport'){assert.equal(d.first_failure.code,'bridge_transport_uncertain');assert.equal(d.lease_heartbeat_transport_retries[0].outcome,'failed');assert.equal(d.lease_heartbeat_transport_retries[0].failure_code,'bridge_transport_uncertain');}assert.equal(JSON.stringify(d).includes('secret'),false);
  }finally{f.cleanup();}
 }
});
test('lease confirmation budget is once per job: recovered heartbeat followed by another reject stops without provider retry',async()=>{
 for(const concurrency of [1,2]){
  const f=await fixture();let beats=0,calls=0;
  try{
   const fetcher=async(url:any,init:any)=>{
    if(String(url).endsWith('/heartbeat')&&JSON.parse(init.body).id){beats++;if(beats===2||beats>=4)throw Error('secret-network-cause');}
    return f.options.fetch(url,init);
   };
   await assert.rejects(runBridge({...f.options,concurrency,heartbeatMs:2,fetch:fetcher as typeof fetch,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async()=>{calls++;await wait(30);onMetric(child.attestation[0]);return structuredClone(child.artifact.source_response);}}),close:()=>{},drain:async()=>{}})}));
   const journal=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8')),d=journal.diagnostics;assert.equal(beats,4);assert.equal(calls,1);assert.equal(d.lease_heartbeat_transport_retries.length,1);assert.equal(d.lease_heartbeat_transport_retries[0].outcome,'confirmed');assert.equal(d.first_failure.code,'bridge_transport_uncertain');assert.equal(f.requests.some(r=>r.action==='complete'),false);assert.equal(existsSync(join(f.root,'decisions',childId+'.json')),false);
  }finally{f.cleanup();}
 }
});
test('lease confirmation never retries claim, complete or failure-upload transport errors',async()=>{
 for(const action of ['claim','complete','fail']){
  const f=await fixture(['check'],true);let rejected=0;
  try{
   const fetcher=async(url:any,init:any)=>{
    const current=String(url).split('/').at(-1);if(action==='fail'&&current==='heartbeat'&&JSON.parse(init.body).id)return Response.json({error:'lease_conflict'},{status:409});
    if(current===action){rejected++;throw Error('secret-transport');}return f.options.fetch(url,init);
   };
   await assert.rejects(runBridge({...f.options,fetch:fetcher as typeof fetch,providerFactory:()=>{throw Error('no provider');}}));assert.equal(rejected,1);const d=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8')).diagnostics;assert.equal(d.lease_heartbeat_transport_retries.length,0);
  }finally{f.cleanup();}
 }
});

test('lease confirmation pending fences response save and correction dispatch until confirmed, failed confirmation never saves',async()=>{
 for(const concurrency of [1,2])for(const outcome of ['confirmed','failed','correction']){
  const f=await fixture();let beats=0,calls=0,returned=false,release:()=>void=()=>{},pending:()=>void=()=>{};
  const confirmation=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{pending=r;});
  try{
   const fetcher=async(url:any,init:any)=>{
    if(String(url).endsWith('/heartbeat')&&JSON.parse(init.body).id){beats++;if(beats===2)throw Error('first heartbeat transport reject');if(beats===3){pending();await confirmation;if(outcome==='failed')throw Error('second heartbeat transport reject');}}
    return f.options.fetch(url,init);
   };
   const work=runBridge({...f.options,concurrency,heartbeatMs:2,fetch:fetcher as typeof fetch,providerFactory:onMetric=>({withSession:async(fn:any)=>fn({run:async()=>{
    calls++;if(calls===1){await started;returned=true;if(outcome==='correction')throw Object.assign(Error('invalid JSON'),{code:'invalid_json'});onMetric(child.attestation[0]);return structuredClone(child.artifact.source_response);}
    assert.equal(outcome,'correction');const d=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8')).diagnostics;assert.equal(d.lease_heartbeat_transport_retries[0].outcome,'confirmed');throw Object.assign(Error('no third call'),{code:'quota_or_rate_limit'});
   }}),close:()=>{},drain:async()=>{}})});
   // Attach rejection handling before yielding; no unhandled rejection after release.
   const settled=work.then(result=>({result,error:null as any}),error=>({result:null,error}));
   await started;await wait(10);assert.equal(returned,true);assert.equal(calls,1);assert.equal(existsSync(join(f.root,'decisions',childId+'.json')),false);assert.equal(f.requests.some(r=>r.action==='complete'),false);const before=JSON.parse(readFileSync(join(f.options.runtimePath,'bridge-journal.json'),'utf8'));assert.equal(before.decisions,0);assert.equal(before.diagnostics.lease_heartbeat_transport_retries[0].outcome,'pending');
   release();const result=await settled;
   if(outcome==='confirmed'){assert.equal(result.error,null);assert.equal(result.result!.decisions,1);assert.equal(calls,1);assert.equal(existsSync(join(f.root,'decisions',childId+'.json')),true);}else{assert.ok(result.error);assert.equal(calls,outcome==='correction'?2:1);assert.equal(existsSync(join(f.root,'decisions',childId+'.json')),false);assert.equal(f.requests.some(r=>r.action==='complete'),false);}
  }finally{release();f.cleanup();}
 }
});
