// Fresh-case whole12 storage. Numerical APIs and the native reader remain frozen.
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, requirePrepared, checkLaunchReview, file, read, write } from '../co-sb-coldcall-optimized-five-workers/context.mjs';
import { contentHash } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
import { same, gateFail, expandedModel11Legality, validateModel11Balance } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { checkModel11Balance } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/gate-model11.mjs';
import { hasPostflopDeal } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/range-support.mjs';
import { simulate } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation.mjs';
import { referencePolicyFor } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/policy.mjs';
import { openCompletionRepresentativeEvidence, readCompletionRepresentativeBalance } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-store.mjs';
import { persistCompletionRepresentativeBalance } from './persist-once.mjs';
const BASE=dirname(fileURLToPath(import.meta.url));
const identity=pid=>{const f=readFileSync(`/proc/${pid}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/);return {pid,startTicks:f[19],group:Number(f[2]),session:Number(f[3])};};
const compact=v=>({complete:v.complete,errorCount:v.errorCount,warnings:v.warnings,prefixCounts:v.prefixCounts,offModelStages:v.offModelStages});
try {
 if(process.argv.length!==7||!['produce','validate'].includes(process.argv[2]))gateFail('produce|validate JOB REPAIR_PLAN_SHA REVIEW REVIEW_SHA required');
 const [mode,jobPath,planSha,reviewPath,reviewSha]=process.argv.slice(2),planPin=file(join(BASE,'repair-plan.json'));
 if(planPin.sha256!==planSha)gateFail('Exact repair plan hash required');
 const p=read(planPin),runner=file(fileURLToPath(import.meta.url)),reviewPin=file(reviewPath),review=read(reviewPin);
 if(p.kind!=='coldcall-whole12-two-stage-storage-plan'||p.version!==1||p.runRoot!==join(BASE,'run')||reviewPin.sha256!==reviewSha||review.kind!=='coldcall-whole12-storage-independent-source-review'||review.verdict!=='APPROVE_TWO_STAGE_EXECUTION'||review.planSha256!==planSha||!same(review.sourcePins,p.sourcePins)||!same(review.approvedStages,['produce','validate'])||review.policyChanged!==false||review.productionAuthorized!==false)gateFail('Exact two-stage source review required');
 const c=loadContext(p.frozenPlan.sha256);requirePrepared(c);checkLaunchReview(c,p.launchReview.path,p.launchReview.sha256,'whole12');
 if(!same(c.planPin,p.frozenPlan)||c.p.commit!==p.commit||c.p.sourceIdentityHash!==p.sourceIdentityHash||!same(c.p.policyHashes,p.policyHashes)||contentHash(c.regressionBinding)!==p.regressionBindingHash)gateFail('Frozen calculation identity differs');
 const jobPin=file(jobPath),job=read(jobPin),owner=identity(process.ppid);
 if(job.kind!=='coldcall-whole12-storage-owned-job'||job.mode!==mode||jobPath!==join(p.runRoot,mode,'job.json')||!same(job.plan,planPin)||!same(job.review,reviewPin)||!same(job.worker,runner)||job.owner.pid!==owner.pid||job.owner.startTicks!==owner.startTicks)gateFail('Exact owned stage job required');
 const fixedPins=[planPin,runner,reviewPin,jobPin,p.frozenPlan,p.prepared,p.launchReview,...p.sourcePins];
 const assertPins=()=>{
  c.assertUnchanged();for(const pin of fixedPins)if(!same(file(pin.path),pin))gateFail('Pinned fresh-case/source evidence changed');
 };
 assertPins();
 const output=join(p.runRoot,mode,'output');mkdirSync(output);
 const processIdentity=identity(process.pid);
 if(processIdentity.group!==process.pid||processIdentity.session!==process.pid)gateFail('Stage must own its new session/group');
 const started={kind:'coldcall-whole12-storage-stage-start',version:1,mode,plan:planPin,job:jobPin,worker:runner,review:reviewPin,process:{pid:process.pid,startTicks:processIdentity.startTicks},bindingHash:p.regressionBindingHash,startedAt:new Date().toISOString()};
 write(join(p.runRoot,mode,'started.json'),started);
 const plan=c.regressionBinding.plan,strictBinding=c.regressionBinding.strictBalance;
 const balancePlan={...plan,boardList:plan.boardList.filter(board=>hasPostflopDeal(c.inputs,board.cards))};
 if(plan.boardList.length!==12||balancePlan.boardList.length!==12)gateFail('Exact reachable original12 required');
 let result;
 if(mode==='produce'){
  const legality=expandedModel11Legality(c.inputs,c.flop,c.later,plan.boardList);
  let balance=checkModel11Balance(c.inputs,c.flop,c.later,{boardList:balancePlan.boardList,street:plan.street,authored:true});
  const validation=compact(validateModel11Balance(balancePlan,strictBinding,balance));
  const store=openCompletionRepresentativeEvidence(join(output,'balance'),c.regressionBinding,{fresh:true});
  const originalBalanceHash=contentHash(balance);
  const balanceEvidence=persistCompletionRepresentativeBalance(store,balance,originalBalanceHash);
  balance=null; // This process never rehydrates or runs the reference simulation.
  write(join(output,'balance-descriptor.json'),balanceEvidence);
  result={kind:'coldcall-whole12-balance-produced-not-validated',version:1,started,complete:true,originalBalanceHash,balanceEvidence:file(join(output,'balance-descriptor.json')),balanceDirectory:store.dir,legality,validation,generatedBalanceBoards:balancePlan.boardList.length,nativeReadValidated:false,referenceSanityRun:false,oldFullReplayPassed:false,policyAccepted:false};
 }else{
  if(!job.producerReceipt)gateFail('Exact terminal producer receipt required');
  fixedPins.push(job.producerReceipt);const producerReceipt=read(job.producerReceipt);
  if(job.producerReceipt.path!==join(p.runRoot,'produce','receipt.json')||producerReceipt.status!=='COMPLETE_NOT_ACCEPTED'||producerReceipt.mode!=='produce'||!producerReceipt.allCreatedChildrenReaped||!producerReceipt.allOwnedGroupsGone||!producerReceipt.sourceUnchanged||producerReceipt.errors.length||producerReceipt.remainingOwnedMembers.length||!same(producerReceipt.plan,planPin)||!same(producerReceipt.review,reviewPin))gateFail('Fresh validator requires fully reaped exact producer');
  fixedPins.push(producerReceipt.completion);const producer=read(producerReceipt.completion);
  if(producer.kind!=='coldcall-whole12-balance-produced-not-validated'||producer.complete!==true||!same(producer.started.process,producerReceipt.process)||!same(producer.started.plan,planPin)||!same(producer.started.worker,runner)||!same(producer.started.review,reviewPin)||producer.nativeReadValidated!==false||producer.referenceSanityRun!==false||producer.generatedBalanceBoards!==balancePlan.boardList.length)gateFail('Producer lineage differs');
  fixedPins.push(producer.balanceEvidence);const balanceEvidence=read(producer.balanceEvidence);
  const store=openCompletionRepresentativeEvidence(join(p.runRoot,'produce','output','balance'),c.regressionBinding);
  if(store.dir!==producer.balanceDirectory||balanceEvidence.balanceHash!==producer.originalBalanceHash)gateFail('Original saved aggregate hash differs');
  const savedFiles=readdirSync(store.dir).sort().map(name=>file(join(store.dir,name)));fixedPins.push(...savedFiles);
  const expectedFiles=['identity.json',balanceEvidence.header.path,...balanceEvidence.prefixChunks.map(ref=>ref.path),...balanceEvidence.proofs.map(ref=>ref.path)];
  if(new Set(expectedFiles).size!==expectedFiles.length||!same(savedFiles.map(pin=>basename(pin.path)).sort(),expectedFiles.sort()))gateFail('Produced store inventory differs from actual descriptor closure');
  // Full immutable native read verifies descriptor, every part/proof and the complete aggregate hash.
  let restored=readCompletionRepresentativeBalance(store,balanceEvidence);
  const validation=compact(validateModel11Balance(balancePlan,strictBinding,restored));restored=null;
  if(!same(validation,producer.validation))gateFail('Original and native restored validation differ');
  let parts=0,rows=0;const seen=new Set(),perFlop=new Map();
  for(const ref of balanceEvidence.prefixChunks){
   const {startIndex,count,rowHash,...pin}=ref,part=store.read(ref.path,pin);
   if(part.startIndex!==rows||ref.path!==`balance.${String(parts).padStart(3,'0')}.prefixes.json`)gateFail('Produced prefixes are not contiguous');
   for(const row of part.rows){if(seen.has(row.prefixIdentity))gateFail('Duplicate produced prefix');seen.add(row.prefixIdentity);const board=JSON.stringify(row.prefix.board.slice(0,3));perFlop.set(board,(perFlop.get(board)||0)+1);}
   rows+=part.rows.length;parts++;
  }
  const expectedFlops=balancePlan.boardList.map(board=>JSON.stringify([...board.cards].sort((a,b)=>b-a)));
  if(rows!==balanceEvidence.prefixCoverageCount||rows!==validation.prefixCounts.requested||seen.size!==rows||!same([...perFlop.keys()].sort(),[...expectedFlops].sort()))gateFail('Produced coverage differs from actual descriptor/native validation/current board recipe');
  const inventory={parts,uniquePrefixRows:rows,proofFiles:balanceEvidence.proofs.length,perOriginalFlop:balancePlan.boardList.map(board=>({board:board.id,prefixRows:perFlop.get(JSON.stringify([...board.cards].sort((a,b)=>b-a)))})),descriptorClosureExact:true,priorAttemptComparison:'not applicable: first fresh-case whole12 production'};
  write(join(output,'produced-storage-inventory.json'),inventory);
  const sanity=simulate(c.inputs,referencePolicyFor(c.inputs.spot.tree),12,null,{computedDefence:false,boardList:plan.boardList});
  const sanityExpected=balancePlan.boardList.length*3*2;
  if(sanityExpected!==72||sanity.results.length!==sanityExpected||sanity.results.some(row=>row.delta_bb.mean!==0||row.delta_bb.ci95.some(value=>value!==0)))gateFail('Original reference864 drift or incomplete scope');
  write(join(output,'reference-sanity.json'),sanity);
  const summary={kind:'model11-next-policy-unchanged-whole12-component',version:1,bindingHash:p.regressionBindingHash,strictBindingHash:contentHash(strictBinding),boardIds:plan.boardList.map(b=>b.id),...producer.legality,balanceEvidence,balanceDirectory:store.dir,...validation,referenceSanity:{samplesPerCell:12,cells:sanityExpected,pairedTrials:864,zeroDrift:true,numericalHash:contentHash(sanity)},freshStorageInventory:inventory,nativeAggregateHashVerified:true,originalBalanceHash:producer.originalBalanceHash,freshValidatorProcess:true,fullReplayPassed:false,policyAccepted:false};
  write(join(output,'whole12.json'),summary);
  result={kind:'coldcall-whole12-storage-validated-component',version:1,started,complete:summary.complete&&summary.errorCount===0,summary:file(join(output,'whole12.json')),producerReceipt:job.producerReceipt,generatedBalanceBoards:0,nativeReadValidated:true,referenceSanityRun:true,oldFullReplayPassed:false,policyAccepted:false};
 }
 assertPins();write(join(p.runRoot,mode,'completed.json'),result);
 console.log(JSON.stringify({mode,complete:result.complete,oldFullReplayPassed:false,policyAccepted:false}));if(!result.complete)process.exitCode=1;
}catch(error){console.error(error.stack);process.exitCode=1;}
