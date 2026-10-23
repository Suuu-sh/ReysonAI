import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { enumeratePhysicalFlops, physicalFlopKey, planFlopCoverage, validateCoverageSnapshot, writeFlopCoveragePlan } from '../scripts/aiv2-postflop-flop-coverage.ts';
import { DEFAULT_STORE, implementationHash, saveDecision, callProvenance } from '../scripts/aiv2-postflop-ondemand-store.ts';
import { postflopHash as hash, buildPostflopArtifact, decisionIdentity } from '../scripts/aiv2-postflop-ondemand.ts';
const source=resolve(DEFAULT_STORE,'source-snapshot');
const rootId='16c8f7aeff99422bc108d09a22ac8d6988d5df1329d6da1353a7a05854c20c71',childId='7504f6574de683065bbc208f0cd783282617a7068f1ee55db7bca702684769c1';
function fixture(){const root=mkdtempSync(join(tmpdir(),'flop-coverage-test-'));mkdirSync(join(root,'decisions'));return {root,cleanup:()=>rmSync(root,{recursive:true,force:true})};}
function copy(root:string,id:string){copyFileSync(resolve(DEFAULT_STORE,'decisions',id+'.json'),join(root,'decisions',id+'.json'));}
test('all physical flops count 22100 unique suit-preserving three-card sets in deterministic order',()=>{
 const boards=enumeratePhysicalFlops();assert.equal(boards.length,22100);assert.equal(new Set(boards).size,22100);assert.deepEqual(enumeratePhysicalFlops(),boards);
 assert.equal(boards[0],'AsAhAd');assert.equal(boards.at(-1),'2h2d2c');
 for(const board of boards){assert.equal(new Set(board.match(/../g)).size,3);assert.equal(physicalFlopKey(board),board);}
 assert.equal(physicalFlopKey('8c8h2d'),'8h8c2d');assert.notEqual(physicalFlopKey('As7d2c'),physicalFlopKey('Ah7d2c'));
 assert.throws(()=>physicalFlopKey('AsAs2c'));
});
test('physical enumeration respects actual card blockers without suit-isomorphism collapse',()=>{
 const boards=enumeratePhysicalFlops(['As','Kh']);assert.equal(boards.length,19600);
 assert.ok(boards.every(board=>!board.match(/../g)!.includes('As')&&!board.match(/../g)!.includes('Kh')));
 for(const blocked of [['As','As'],['AX'],['10s']])assert.throws(()=>enumeratePhysicalFlops(blocked));
});
test('empty cache plans all physical roots without constructing 22100 source inputs; next list is bounded and non-executable',async()=>{
 const f=fixture();try{
  const plan=await planFlopCoverage({root:f.root,source,limit:16});assert.equal(plan.rows.length,22100);assert.equal(plan.summary.root.M,22100);assert.equal(plan.summary.root.S,0);assert.equal(plan.summary.check.P,22100);
  assert.deepEqual(plan.next_batch.requests.map(r=>r.board),enumeratePhysicalFlops().slice(0,16));assert.ok(plan.next_batch.requests.every(r=>r.path.length===0));assert.equal(plan.next_batch.structural_max_calls,32);
  assert.equal(plan.validation_work.source_root_reads,2);assert.equal(plan.validation_work.domain_root_inputs_constructed,0);assert.equal(plan.next_batch.enqueued,false);assert.equal(plan.next_batch.execution_authorized,false);assert.equal(plan.next_batch.requires_fresh_owner_status_preflight,true);
  for(const limit of [0,17,1.5])await assert.rejects(planFlopCoverage({root:f.root,source,limit}));
 }finally{f.cleanup();}
});
test('only actual frozen-store validated root and matching parent check child count saved',async()=>{
 const f=fixture();try{
  copy(f.root,rootId);copy(f.root,childId);
  const plan=await planFlopCoverage({root:f.root,source,nextTarget:'check'}),row=plan.rows.find(row=>row[0]==='As7d2c');assert.deepEqual(row,['As7d2c','S','S']);assert.equal(plan.summary.root.S,1);assert.equal(plan.summary.check.S,1);assert.equal(plan.validated_artifacts.length,2);assert.equal(plan.pins.implementationHash,implementationHash());assert.equal(plan.validation_work.source_root_reads,2);
  assert.equal(plan.next_batch.requests.length,0);
 }finally{f.cleanup();}
});
test('root-only check target retains actual board and parent identity, while unknown upstream source never counts saved',async()=>{
 const f=fixture();try{
  copy(f.root,rootId);let plan=await planFlopCoverage({root:f.root,source,nextTarget:'check',limit:1});assert.deepEqual(plan.next_batch.requests,[{board:'As7d2c',path:['check'],physicalBoard:'As7d2c',parentId:rootId,decisionId:childId}]);assert.equal(plan.next_batch.structural_max_decisions,2);assert.equal(plan.next_batch.structural_max_calls,4);
  const file=join(f.root,'decisions',rootId+'.json'),envelope=JSON.parse(readFileSync(file,'utf8'));envelope.artifact.input.upstream[0].key='unreviewed/unknown-source-key';writeFileSync(file,JSON.stringify(envelope));
  plan=await planFlopCoverage({root:f.root,source,nextTarget:'check'});assert.deepEqual(plan.rows.find(row=>row[0]==='As7d2c'),['As7d2c','U','U']);assert.equal(plan.summary.root.S,0);assert.equal(plan.summary.check.S,0);assert.equal(plan.next_batch.requests.length,0);
 }finally{f.cleanup();}
});
test('unattributable cache corruption remains unknown and blocks any proposed batch',async()=>{
 const f=fixture();try{
  writeFileSync(join(f.root,'decisions','0'.repeat(64)+'.json'),'{not-json');const plan=await planFlopCoverage({root:f.root,source});assert.equal(plan.summary.unattributed_unknown_files,1);assert.equal(plan.summary.root.S,0);assert.equal(plan.next_batch.requests.length,0);assert.equal(plan.next_batch.blocked_reason,'unattributed-unvalidated-cache-file');
 }finally{f.cleanup();}
});
test('offline failed, queued and running snapshots block targets; remote complete alone is unknown, never saved',async()=>{
 const f=fixture();try{
  copy(f.root,rootId);const initial=await planFlopCoverage({root:f.root,source}),revision=initial.pins.revision;
  const requests=[{board:'As7d2c',path:['check'],status:'failed'},{board:'AsAhAd',path:[],status:'queued'},{board:'AsAhAc',path:[],status:'running'},{board:'AsAhKs',path:[],status:'complete'}];
  const snapshot={recordedAt:'2026-10-23T00:00:00Z',revision,source:'synthetic whitelist only',jobs:requests.map(request=>({id:hash({revision,board:request.board,path:request.path}),revision,...request}))};
  const plan=await planFlopCoverage({root:f.root,source,snapshot,nextTarget:'check'});assert.deepEqual(plan.rows.find(row=>row[0]==='As7d2c'),['As7d2c','S','B']);assert.equal(plan.next_batch.requests.length,0);
  const roots=await planFlopCoverage({root:f.root,source,snapshot,limit:3});assert.equal(roots.rows.find(row=>row[0]==='AsAhAd')![1],'B');assert.equal(roots.rows.find(row=>row[0]==='AsAhAc')![1],'B');assert.equal(roots.rows.find(row=>row[0]==='AsAhKs')![1],'U');assert.ok(roots.next_batch.requests.every(r=>!requests.some(job=>job.board===r.board)));
  assert.throws(()=>validateCoverageSnapshot({...snapshot,leaseToken:'not-allowed'},revision));assert.throws(()=>validateCoverageSnapshot({...snapshot,revision:'0'.repeat(64)},revision));
  const changed=structuredClone(snapshot);changed.jobs[0].id='0'.repeat(64);assert.throws(()=>validateCoverageSnapshot(changed,revision));
 }finally{f.cleanup();}
});
test('one compact private runtime JSON is written, not per-board files or arbitrary tracked paths',async()=>{
 const f=fixture(),output=resolve(DEFAULT_STORE,'../../../../../.local/range-dashboard/flop-coverage/test-'+process.pid+'.json');
 try{
  const plan=await planFlopCoverage({root:f.root,source});const path=writeFlopCoveragePlan(plan,output);assert.equal(lstatSync(path).mode&0o077,0);assert.equal(JSON.parse(readFileSync(path,'utf8')).rows.length,22100);assert.equal(readFileSync(path,'utf8').split('\n').length,2);
  assert.throws(()=>writeFlopCoveragePlan(plan,resolve(f.root,'outside.json')));assert.equal(existsSync(resolve(f.root,'outside.json')),false);
 }finally{if(existsSync(output))rmSync(output);f.cleanup();}
});

test('valid physical card-order alias is coverage-only and its actual request/parent identity is never relabelled',async()=>{
 const f=fixture();try{
  const envelope=JSON.parse(readFileSync(resolve(DEFAULT_STORE,'decisions',rootId+'.json'),'utf8')),input=structuredClone(envelope.artifact.input);input.board='2cAs7d';
  const id=decisionIdentity(input,implementationHash()),response=structuredClone(envelope.artifact.source_response);response.decision_id=id;
  const artifact=buildPostflopArtifact(input,response,implementationHash());saveDecision(artifact,envelope.attestation,f.root,[callProvenance(input,id,1,null)]);
  let plan=await planFlopCoverage({root:f.root,source,nextTarget:'check',limit:1});assert.deepEqual(plan.rows.find(row=>row[0]==='As7d2c'),['As7d2c','S','M']);assert.equal(plan.next_batch.requests[0].board,'2cAs7d');assert.equal(plan.next_batch.requests[0].parentId,id);assert.equal(plan.validated_artifacts[0].board,'2cAs7d');assert.equal(plan.validation_work.source_root_reads,3);
  const revision=plan.pins.revision,snapshot={recordedAt:'2026-10-23T00:00:00Z',revision,source:'synthetic same-physical-card failed job',jobs:[{id:hash({revision,board:'As7d2c',path:['check']}),revision,board:'As7d2c',path:['check'],status:'failed'}]};
  plan=await planFlopCoverage({root:f.root,source,nextTarget:'check',snapshot});assert.equal(plan.rows.find(row=>row[0]==='As7d2c')![2],'B');assert.equal(plan.next_batch.requests.length,0);
 }finally{f.cleanup();}
});
test('a saved zero-reach check is not a missing BTN target and never proposed for generation',async()=>{
 const f=fixture();try{
  const envelope=JSON.parse(readFileSync(resolve(DEFAULT_STORE,'decisions',rootId+'.json'),'utf8')),response=structuredClone(envelope.artifact.source_response);
  for(const group of response.groups)for(const action of Object.keys(group.mix))group.mix[action]=action==='bet33'?100:0;
  const artifact=buildPostflopArtifact(envelope.artifact.input,response,implementationHash());saveDecision(artifact,envelope.attestation,f.root,envelope.provider_calls);
  const plan=await planFlopCoverage({root:f.root,source,nextTarget:'check'});assert.deepEqual(plan.rows.find(row=>row[0]==='As7d2c'),['As7d2c','S','Z']);assert.equal(plan.summary.check.Z,1);assert.equal(plan.next_batch.requests.length,0);
 }finally{f.cleanup();}
});
