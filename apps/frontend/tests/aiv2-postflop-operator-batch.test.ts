import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { enqueueOperatorBatch, operatorBatchManifest, operatorBatchPath } from '../scripts/aiv2-postflop-operator-batch.ts';
import { DEFAULT_STORE, CONFIG, implementationHash, loadRoot } from '../scripts/aiv2-postflop-ondemand-store.ts';
import { postflopHash as hash } from '../scripts/aiv2-postflop-ondemand.ts';
const source=resolve(DEFAULT_STORE,'source-snapshot'),operatorUserId='test-real-account-id';
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'aiv2-operator-test-')),bearerFile=join(root,'test-bearer'),runtimePath=join(root,'runtime');
 writeFileSync(bearerFile,'test-only-private-owner-bearer-12345678901234',{mode:0o600});
 const requests:any[]=[];
 const fetcher=async(url:any,init:any)=>{
  assert.match(String(url),/\/owner\/operator-batch$/);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.match(init.headers.authorization,/^Bearer test-only-/);assert.equal(init.headers.origin,undefined);
  const manifest=JSON.parse(init.body);requests.push(manifest);
  return Response.json({...manifest,jobs:manifest.requests.map((request:any)=>({...request,id:hash({revision:manifest.revision,...request}),status:'queued'}))},{status:202});
 };
 const options={operatorUserId,origin:'http://127.0.0.1:43210',allowLoopback:true,bearerFile,source,boards:['QsJhTd','9s8s6d'],maxCalls:4,maxDecisions:2,confirmLocalGeneration:true,runtimePath,fetch:fetcher as typeof fetch};
 return {root,requests,options,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('operator manifest validates explicit roots, duplicate card sets, caps and verified frozen pins',async()=>{
 const manifest=await operatorBatchManifest(['QsJhTd','9s8s6d'],4,2,source,operatorUserId);
 const sourceHash=hash((await loadRoot('QsJhTd',source)).upstream),implementation=implementationHash();
 assert.equal(manifest.sourceHash,sourceHash);assert.equal(manifest.implementationHash,implementation);assert.equal(manifest.revision,hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash}));
 assert.deepEqual(manifest.requests,[{board:'QsJhTd',path:[]},{board:'9s8s6d',path:[]}]);
 const {batchId,...payload}=manifest;assert.equal(batchId,hash(payload));
 for(const boards of [[],Array(51).fill('QsJhTd'),['QsQsTd'],['QsJhTd','TdQsJh']])await assert.rejects(operatorBatchManifest(boards,100,100,source,operatorUserId));
 for(const [calls,decisions] of [[3,2],[4,1],[201,2],[4,101],[NaN,2],[4,1.5]])await assert.rejects(operatorBatchManifest(['QsJhTd','9s8s6d'],calls,decisions,source,operatorUserId));
 await assert.rejects(operatorBatchManifest(['QsJhTd'],2,1,'',operatorUserId));await assert.rejects(operatorBatchManifest(['QsJhTd'],2,1,source,''));
});
test('operator enqueue is one owner-only bounded request, no worker/provider, private receipt and exact replay',async()=>{
 const f=fixture();try{
  const result=await enqueueOperatorBatch(f.options);assert.equal(result.status,'submitted');assert.equal(result.queued,2);assert.equal(f.requests.length,1);assert.equal(f.requests[0].operatorUserId,operatorUserId);
  assert.equal(f.requests[0].maxCalls,4);assert.equal(f.requests[0].maxDecisions,2);
  const file=join(f.options.runtimePath,result.batchId+'.json'),journal=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(journal.status,'submitted');assert.equal(lstatSync(file).mode&0o077,0);assert.equal(readFileSync(file,'utf8').includes('test-only-private-owner-bearer'),false);assert.equal(existsSync(file+'.lock'),false);
  const replay=await enqueueOperatorBatch(f.options);assert.equal(replay.status,'already_submitted');assert.equal(f.requests.length,1);
 }finally{f.cleanup();}
});
test('missing confirmation, insecure bearer, invalid origin and invalid local source never send',async()=>{
 const f=fixture();try{
  await assert.rejects(enqueueOperatorBatch({...f.options,confirmLocalGeneration:false}),{code:'explicit_operator_confirmation_required'});
  await assert.rejects(enqueueOperatorBatch({...f.options,origin:'https://evil.example'}));
  chmodSync(f.options.bearerFile,0o644);await assert.rejects(enqueueOperatorBatch(f.options),{code:'unsafe_bearer_file'});chmodSync(f.options.bearerFile,0o600);
  await assert.rejects(enqueueOperatorBatch({...f.options,source:join(f.root,'missing-source')}));assert.equal(f.requests.length,0);
 }finally{f.cleanup();}
});
test('ambiguous submission never retries itself; explicit retry uses byte-identical manifest',async()=>{
 const f=fixture();let body='';
 try{
  await assert.rejects(enqueueOperatorBatch({...f.options,fetch:async(_url:any,init:any)=>{body=init.body;throw Error('do not echo response secret');}}),{code:'operator_submission_uncertain'});
  const manifest=JSON.parse(body),file=join(f.options.runtimePath,manifest.batchId+'.json');assert.equal(JSON.parse(readFileSync(file,'utf8')).status,'submission_pending');
  await assert.rejects(enqueueOperatorBatch(f.options),{code:'operator_submission_requires_explicit_retry'});assert.equal(f.requests.length,0);
  const result=await enqueueOperatorBatch({...f.options,retrySubmission:true});assert.equal(result.status,'submitted');assert.equal(JSON.stringify(f.requests[0]),body);
 }finally{f.cleanup();}
});
test('partial quota acceptance is durable and only explicit identical retry may request remainder',async()=>{
 const f=fixture();try{
  const partialFetch=async(_url:any,init:any)=>{const manifest=JSON.parse(init.body),request=manifest.requests[0];return Response.json({...manifest,error:'generation_budget_exhausted',jobs:[{...request,id:hash({revision:manifest.revision,...request}),status:'queued'}]},{status:429});};
  const result=await enqueueOperatorBatch({...f.options,fetch:partialFetch});assert.equal(result.status,'partially_submitted');assert.equal(result.queued,1);
  await assert.rejects(enqueueOperatorBatch(f.options),{code:'operator_submission_requires_explicit_retry'});
  const retry=await enqueueOperatorBatch({...f.options,retrySubmission:true});assert.equal(retry.status,'submitted');assert.equal(retry.batchId,result.batchId);
 }finally{f.cleanup();}
});
test('broker pin mismatch is rejected and malformed successful/partial responses remain uncertain',async()=>{
 const f=fixture();try{
  await assert.rejects(enqueueOperatorBatch({...f.options,fetch:async()=>Response.json({error:'pin_mismatch'},{status:409})}),{code:'operator_broker_conflict'});
  await assert.rejects(enqueueOperatorBatch({...f.options,retrySubmission:true}),{code:'operator_submission_requires_explicit_retry'});assert.equal(f.requests.length,0);
 }finally{f.cleanup();}
 for(const patch of [{revision:'0'.repeat(64)},{implementationHash:'0'.repeat(64)},{sourceHash:'0'.repeat(64)},{jobs:[]},{maxCalls:100}]){
  const g=fixture();try{
   const fetcher=async(_url:any,init:any)=>{const manifest=JSON.parse(init.body);return Response.json({...manifest,jobs:manifest.requests.map((request:any)=>({...request,id:hash({revision:manifest.revision,...request}),status:'queued'})),...patch},{status:202});};
   await assert.rejects(enqueueOperatorBatch({...g.options,fetch:fetcher}),{code:'operator_submission_uncertain'});
   await assert.rejects(enqueueOperatorBatch(g.options),{code:'operator_submission_requires_explicit_retry'});
  }finally{g.cleanup();}
 }
});
test('server error remains pending and active submission lock is never bypassed',async()=>{
 const f=fixture();try{
  await assert.rejects(enqueueOperatorBatch({...f.options,fetch:async()=>Response.json({error:'unknown_outcome'},{status:503})}),{code:'operator_submission_uncertain'});
  const manifest=await operatorBatchManifest(f.options.boards,4,2,source,operatorUserId),lock=join(f.options.runtimePath,manifest.batchId+'.json.lock');writeFileSync(lock,'{}');
  await assert.rejects(enqueueOperatorBatch({...f.options,retrySubmission:true}),{code:'operator_submission_locked'});assert.equal(existsSync(lock),true);assert.equal(f.requests.length,0);
 }finally{f.cleanup();}
});
test('existing failed/complete jobs are reported as accepted states, not new queued work',async()=>{
 const f=fixture();try{
  const fetcher=async(url:any,init:any)=>{const response=await f.options.fetch(url,init),receipt=await response.json();receipt.jobs[0].status='failed';receipt.jobs[1].status='complete';return Response.json(receipt,{status:202});};
  const result=await enqueueOperatorBatch({...f.options,fetch:fetcher});assert.equal(result.accepted,2);assert.equal(result.queued,0);assert.deepEqual(result.states,{queued:0,running:0,complete:1,failed:1});
 }finally{f.cleanup();}
});
test('explicit check-child path preserves root defaults and pins while binding path-specific identity and ancestor budgets',async()=>{
 const boards=['QsJhTd','9s8s6d'];
 const roots=await operatorBatchManifest(boards,8,4,source,operatorUserId),explicitRoots=await operatorBatchManifest(boards,8,4,source,operatorUserId,[]),child=await operatorBatchManifest(boards,8,4,source,operatorUserId,['check']);
 assert.deepEqual(roots,explicitRoots);assert.deepEqual(child.requests,boards.map(board=>({board,path:['check']})));assert.notEqual(child.batchId,roots.batchId);
 for(const key of ['revision','implementationHash','sourceHash'] as const)assert.equal(child[key],roots[key]);
 assert.notEqual(hash({revision:child.revision,...child.requests[0]}),hash({revision:roots.revision,...roots.requests[0]}));
 for(const [calls,decisions] of [[4,2],[7,4],[8,3]])await assert.rejects(operatorBatchManifest(boards,calls,decisions,source,operatorUserId,['check']),{code:'invalid_operator_budget'});
 for(const path of [['bet33'],['check','check'],['check,check'],[''],['fold'],['Kd']])await assert.rejects(operatorBatchManifest(boards,100,100,source,operatorUserId,path),{code:'operator_path_not_supported'});
});
test('explicit six check-child jobs reserve twelve decisions/twenty-four calls and replay only that exact manifest',async()=>{
 const f=fixture(),boards=['9s8s6d','AhKd7c','Qs7s2s','JsJd4c','7s5h3d','Ts9d4c'];
 try{
  const options={...f.options,boards,path:['check'],maxCalls:24,maxDecisions:12};
  const result=await enqueueOperatorBatch(options);assert.equal(result.status,'submitted');assert.equal(result.accepted,6);assert.equal(result.queued,6);assert.equal(f.requests.length,1);
  assert.deepEqual(f.requests[0].requests,boards.map(board=>({board,path:['check']})));assert.equal(f.requests[0].maxCalls,24);assert.equal(f.requests[0].maxDecisions,12);
  const journal=JSON.parse(readFileSync(join(f.options.runtimePath,result.batchId+'.json'),'utf8'));assert.ok(journal.manifest.requests.every((request:any)=>JSON.stringify(request.path)==='["check"]'));
  const replay=await enqueueOperatorBatch(options);assert.equal(replay.status,'already_submitted');assert.equal(f.requests.length,1);
  await assert.rejects(enqueueOperatorBatch({...options,path:[],retrySubmission:true}),{code:'operator_no_pending_submission'});assert.equal(f.requests.length,1);
 }finally{f.cleanup();}
});
test('unsupported operator follow-up paths fail before any queue write',async()=>{
 const f=fixture();try{
  for(const path of [['bet33'],['check','bet33'],['check','check'],['allin']])await assert.rejects(enqueueOperatorBatch({...f.options,path,maxCalls:100,maxDecisions:100}),{code:'operator_path_not_supported'});
  assert.equal(f.requests.length,0);assert.equal(existsSync(f.options.runtimePath),false);
 }finally{f.cleanup();}
});

test('operator path CLI accepts only one exact check flag and never silently falls back for a malformed flag',()=>{
 assert.deepEqual(operatorBatchPath([]),[]);assert.deepEqual(operatorBatchPath(['--boards=QsJhTd','--path=check']),['check']);
 for(const args of [['--path'],['--path','check'],['--path='],['--path=bet33'],['--path=check,check'],['--path=check','--path=check']])assert.throws(()=>operatorBatchPath(args),{code:'operator_path_not_supported'});
});

function fiftyOperatorBoards(n=50){const deck=[...'AKQJT98765432'].flatMap(r=>[...'shdc'].map(s=>r+s)),boards:string[]=[];for(let a=0;a<50&&boards.length<n;a++)for(let b=a+1;b<51&&boards.length<n;b++)for(let c=b+1;c<52&&boards.length<n;c++)boards.push(deck[a]+deck[b]+deck[c]);return boards;}
test('owner-only fifty check targets bind finite100decision200call manifest and never start a bridge',async()=>{
 const f=fixture();try{
 const boards=fiftyOperatorBoards(),options={...f.options,boards,path:['check'],maxDecisions:100,maxCalls:200};
 const manifest=await operatorBatchManifest(boards,200,100,source,operatorUserId,['check']);assert.equal(manifest.requests.length,50);assert.equal(manifest.maxCalls,200);assert.equal(manifest.maxDecisions,100);
 const result=await enqueueOperatorBatch(options);assert.equal(result.accepted,50);assert.equal(f.requests.length,1);assert.equal(f.requests[0].requests.length,50);assert.ok(f.requests[0].requests.every((r:any)=>JSON.stringify(r.path)==='["check"]'));
 const replay=await enqueueOperatorBatch(options);assert.equal(replay.status,'already_submitted');assert.equal(f.requests.length,1);
 for(const [calls,decisions] of [[199,100],[200,99],[201,100],[200,101]])await assert.rejects(operatorBatchManifest(boards,calls,decisions,source,operatorUserId,['check']),{code:'invalid_operator_budget'});
 await assert.rejects(operatorBatchManifest(fiftyOperatorBoards(51),200,100,source,operatorUserId),{code:'invalid_operator_boards'});
 }finally{f.cleanup();}
});
test('cross-scope or failed target conflict is durable rejection, never an automatic submission retry',async()=>{
 const f=fixture();try{
 const fetcher=async()=>Response.json({error:'batch_scope_failed_job'},{status:409});
 await assert.rejects(enqueueOperatorBatch({...f.options,fetch:fetcher}),{code:'operator_broker_conflict'});
 await assert.rejects(enqueueOperatorBatch({...f.options,retrySubmission:true}),{code:'operator_submission_requires_explicit_retry'});assert.equal(f.requests.length,0);
 }finally{f.cleanup();}
});
