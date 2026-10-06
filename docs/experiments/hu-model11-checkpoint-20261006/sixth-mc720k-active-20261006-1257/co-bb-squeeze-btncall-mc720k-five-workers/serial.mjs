// Serial operational stages: unchanged whole12 aggregation or zero-generation1755 finalization.
import { readFileSync,mkdirSync,readdirSync,lstatSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadContext,checkLaunchReview,requirePrepared,fiveIndices,file,read,write } from './context.mjs';
import { contentHash,canonicalJson } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
import { same,gateFail,expandedModel11Legality,validateModel11Balance } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { checkModel11Balance } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/gate-model11.mjs';
import { hasPostflopDeal } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/range-support.mjs';
import { simulate } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation.mjs';
import { referencePolicyFor } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/policy.mjs';
import { openCompletionRepresentativeEvidence,persistCompletionRepresentativeBalance,readCompletionRepresentativeBalance } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-store.mjs';
import { openBoardCheckpoints,writeImmutableAllBoardOutput } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/all-board-checkpoints.mjs';
import { runModel11AllBoards } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-drivers.mjs';
import { partitionModel11AllBoardReceipt,materializeModel11AllBoardReceipt } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-partitioned-output.mjs';
import { validateModel11GateReceipt } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/evaluate-model11-audit.mjs';
// Version2 external storage contract. Canonical JSON has a unique UTF-8 byte encoding;
// exact string equality therefore proves equality of every encoded byte without two extra Buffers.
function verifyFullLosslessBytes(original,restored){
 const first=canonicalJson(original),second=canonicalJson(restored);
 const firstBytes=Buffer.byteLength(first,'utf8'),secondBytes=Buffer.byteLength(second,'utf8');
 const firstSha256=createHash('sha256').update(first,'utf8').digest('hex'),secondSha256=createHash('sha256').update(second,'utf8').digest('hex');
 if(first!==second||firstBytes!==secondBytes||firstSha256!==secondSha256)gateFail('Full canonical receipt bytes/hash differ');
 return {encoding:'UTF-8 of frozen canonicalJson; complete receipt, all1755 rows',bytes:firstBytes,sha256:firstSha256,fullBytesEqual:true,fullHashEqual:true};
}
try{
 if(!['whole12','finalize'].includes(process.argv[2])||process.argv.length!==(process.argv[2]==='finalize'?9:7))gateFail('serial whole12|finalize JOB PLAN_SHA REVIEW REVIEW_SHA [all-boards SPOT]');
 const [mode,jobPath,planSha,reviewPath,reviewSha]=process.argv.slice(2,7),c=loadContext(planSha);requirePrepared(c);
 if(mode==='finalize'&&(process.argv[7]!=='all-boards'||process.argv[8]!==c.p.spot))gateFail('Exact actual all-boards/spot invocation required');
 const review=checkLaunchReview(c,reviewPath,reviewSha,mode),jobPin=file(jobPath),job=read(jobPin);
 if(job.kind!=='next-hu-serial-job'||job.mode!==mode||job.lane!==0||job.planSha256!==planSha||job.reviewSha256!==review.sha256||jobPath!==join(c.p.runRoot,'attempts',job.attempt,'jobs',job.id+'.json'))gateFail('Serial job identity differs');
 const output=join(dirname(dirname(jobPath)),job.id+'-output');mkdirSync(output);
 const assertUnchanged=()=>{c.assertUnchanged();if(!same(file(jobPath),jobPin)||!same(file(review.path),review))gateFail('Job/review changed');};assertUnchanged();
 const started={kind:'next-hu-serial-start',plan:c.planPin,job:jobPin,worker:file(fileURLToPath(import.meta.url)),review,bindingHash:c.bindingHash,process:{pid:process.pid,startTicks:readFileSync(`/proc/${process.pid}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/)[19]},startedAt:new Date().toISOString()};
 write(jobPath.replace(/\.json$/,'.started.json'),started);
 let summary;
 if(mode==='whole12'){
  const plan=c.regressionBinding.plan,strictBinding=c.regressionBinding.strictBalance;
  const legality=expandedModel11Legality(c.inputs,c.flop,c.later,plan.boardList);
  const balancePlan={...plan,boardList:plan.boardList.filter(board=>hasPostflopDeal(c.inputs,board.cards))};
  if(!balancePlan.boardList.length)gateFail('Representative gate has no reachable board');
  let balance=checkModel11Balance(c.inputs,c.flop,c.later,{boardList:balancePlan.boardList,street:plan.street,authored:true});
  const validation=validateModel11Balance(balancePlan,strictBinding,balance);
  const store=openCompletionRepresentativeEvidence(join(output,'balance'),c.regressionBinding);
  const originalBalanceHash=contentHash(balance),balanceEvidence=persistCompletionRepresentativeBalance(store,balance);
  balance=null; // Release original aggregate before rehydrating its lossless partition.
  let restored=readCompletionRepresentativeBalance(store,balanceEvidence);
  if(contentHash(restored)!==originalBalanceHash)gateFail('Original whole12 aggregate changed while partitioning');validateModel11Balance(balancePlan,strictBinding,restored);
  restored=null;
  const sanity=simulate(c.inputs,referencePolicyFor(c.inputs.spot.tree),12,null,{computedDefence:false,boardList:plan.boardList});
  const sanityExpected=balancePlan.boardList.length*3*2;
  if(sanity.results.length!==sanityExpected||sanity.results.some(row=>row.delta_bb.mean!==0||row.delta_bb.ci95.some(value=>value!==0)))gateFail('Reference sanity drift or incomplete scope');
  summary={kind:'model11-next-policy-unchanged-whole12-component',version:1,bindingHash:contentHash(c.regressionBinding),strictBindingHash:contentHash(strictBinding),boardIds:plan.boardList.map(b=>b.id),...legality,balanceEvidence,balanceDirectory:store.dir,complete:validation.complete,errorCount:validation.errorCount,warnings:validation.warnings,prefixCounts:validation.prefixCounts,offModelStages:validation.offModelStages,referenceSanity:{samplesPerCell:12,cells:sanityExpected,zeroDrift:true,numericalHash:contentHash(sanity)},fullReplayPassed:false,policyAccepted:false};
  write(join(output,'whole12.json'),summary);
 }else{
  const producer=read(job.producerReceipt);
  if(producer.kind!=='next-hu-five-worker-owned-supervision'||producer.mode!=='boards'||producer.status!=='COMPLETE_NOT_ACCEPTED'||!producer.allCreatedChildrenReaped||!producer.allOwnedGroupsGone||!producer.sourceUnchanged||producer.errors.length||producer.persistedCompleteObjects!==1755||producer.plan.sha256!==planSha||!same(producer.controller,file(join(dirname(fileURLToPath(import.meta.url)),'controller.py')))||!same(producer.adapterPins,c.adapters))gateFail('Complete terminal1755 producers required');
  const expectedRows=new Map(),pins=[job.producerReceipt];
  for(const jobReceipt of producer.completedJobs){
   const pin=jobReceipt.completion,value=read(pin);pins.push(pin);
   if(value.kind!=='next-hu-canonical-batch-complete-not-accepted'||value.started.bindingHash!==c.bindingHash||!same(value.started.plan,c.planPin)||!same(value.started.process,{pid:jobReceipt.pid,startTicks:jobReceipt.startTicks})||!same(value.completed.map(r=>r.index),jobReceipt.job.indices))gateFail('Producer batch completion differs');
   for(const item of value.completed){if(expectedRows.has(item.index)||item.index%5!==jobReceipt.job.lane)gateFail('Duplicate/foreign lane assignment');expectedRows.set(item.index,{...item,lane:jobReceipt.job.lane});}
  }
  if(!same([...expectedRows.keys()].sort((a,b)=>a-b),Array.from({length:1755},(_,i)=>i)))gateFail('Exact disjoint1755 producer union required');
  const targetRoot=join(output,'checkpoints'),cache=openBoardCheckpoints(targetRoot,c.binding,c.boardIds);
  for(let index=0;index<1755;index++){
   const item=expectedRows.get(index),sourceDir=join(c.p.runRoot,`lane-${item.lane}`,'checkpoints',c.checkpointIdentityHash),sourcePin={...item.checkpoint,path:join(sourceDir,item.checkpoint.path)},bytes=readFileSync(sourcePin.path);if(!same(file(sourcePin.path),sourcePin))gateFail('Source board bytes differ');pins.push(sourcePin);
   const envelope=JSON.parse(bytes),row=envelope.row;if(row?.complete!==true||row.board!==c.boardIds[index])gateFail('Missing/incomplete board');
   for(const proof of item.proofs){const pin={...proof,path:join(sourceDir,proof.path)};if(!same(file(pin.path),pin))gateFail('Proof bytes differ');pins.push(pin);writeImmutableAllBoardOutput(join(cache.dir,proof.path),readFileSync(pin.path));}
   cache.write(row);if(!readFileSync(join(cache.dir,item.checkpoint.path)).equals(bytes))gateFail('Imported checkpoint bytes differ');
  }
  const mergedPins=readdirSync(cache.dir).sort().map(name=>file(join(cache.dir,name)));
  const assertEvidence=()=>{assertUnchanged();for(const pin of [...pins,...mergedPins])if(!same(file(pin.path),pin))gateFail('Terminal evidence bytes changed');};
  const requireExisting=()=>{assertUnchanged();for(const name of ['identity.json',...c.boardIds.map(b=>b+'.json')]){const stat=lstatSync(join(cache.dir,name));if(!stat.isFile()||stat.isSymbolicLink())gateFail('Finalizer cannot generate absent checkpoints');}};
  assertEvidence();requireExisting();
  const result=runModel11AllBoards(c.inputs,c.flop,c.later,c.binding,targetRoot,{assertUnchanged:requireExisting,onBoard(){gateFail('Finalization must generate zero boards');}});
  const exitCode=['blocked-off-model-coverage','completed-with-quality-errors'].includes(result.status)?1:0;
  const log=JSON.stringify({spot:c.p.spot,operation:'all-boards',status:result.status,generatedBoards:0,componentOnly:true})+'\n';
  const receipt={kind:'model11-gate-execution-receipt',version:1,operation:'all-boards',startedAt:started.startedAt,completedAt:new Date().toISOString(),command:process.argv,exitCode,execution:{node:process.version,platform:process.platform,arch:process.arch},sourceStart:c.source,sourceEnd:c.source,filesStart:c.files,filesEnd:c.files,reportInput:null,result,resultHash:contentHash(result),log:{text:log,sha256:createHash('sha256').update(log).digest('hex')},diagnostics:{producerReceipt:job.producerReceipt,generatedBoards:0,externalFinalizationContract:'semantic-once-full-lossless-v2',semanticPasses:1,originalConsumerFreshSemanticReplay:false,oldFullReplayPassed:false,policyAccepted:false}};
  validateModel11GateReceipt(receipt,{operation:'all-boards',binding:c.binding});
  const saved=partitionModel11AllBoardReceipt(receipt,targetRoot,{outputSourceStart:c.source.output,outputSourceEnd:c.source.output});
  const restored=materializeModel11AllBoardReceipt(saved,targetRoot,{binding:c.binding,outputSource:c.source.output});
  const lossless=verifyFullLosslessBytes(receipt,restored);
  if(lossless.sha256!==saved.originalReceiptHash)gateFail('Full canonical receipt hash differs from frozen partition identity');
  assertEvidence();requireExisting();write(join(output,'allboard-partitioned.json'),saved);
  summary={kind:'next-hu-final1755-component',version:2,externalFinalizationContract:'semantic-once-full-lossless-v2',semanticPasses:1,semanticBoards:1755,fullLosslessStorageCheck:lossless,checkpointEnvelopeBytesVerified:1755,complete:result.complete&&result.fullScopePassed&&exitCode===0,errorCount:result.inheritedSummary.errors+result.globalFindings.filter(f=>f.severity==='error').length,globalErrorCount:result.globalFindings.filter(f=>f.severity==='error').length,full1755ComponentPassed:result.fullScopePassed,nativeExitCode:exitCode,partitionedReceipt:file(join(output,'allboard-partitioned.json')),checkpointRoot:targetRoot,generatedBoards:0,originalSemanticValidation:true,originalConsumerFreshSemanticReplay:false,oldFullReplayPassed:false,policyAccepted:false};
 }
 assertUnchanged();const complete=summary.complete&&summary.errorCount===0;
 write(jobPath.replace(/\.json$/,'.completed.json'),{kind:'next-hu-serial-component-complete-not-accepted',version:1,started,mode,summary,complete,outputDirectory:output});
 console.log(JSON.stringify({mode,complete,oldFullReplayPassed:false,policyAccepted:false}));if(!complete)process.exitCode=1;
}catch(error){console.error(error.stack);process.exitCode=1;}
