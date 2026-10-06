// External operational binding only. All numerical APIs are imported from the separately reviewed prefix-key execution source.
import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadInputs, boards } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/inputs.mjs';
import { PROFILES } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation.mjs';
import { capturePilot1755Source, pilotFile, pilotJSON } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-lanes.mjs';
import { contentHash, freezeSnapshot } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
import { resolveModel11GatePlan, same, gateFail } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { model11GateBinding } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-drivers.mjs';
import { model11CheckpointIdentityHash } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-partitioned-output.mjs';
import { model11CompletionRepresentativeBinding, completionRepresentativeCells } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { writeImmutableAllBoardOutput } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/all-board-checkpoints.mjs';
export const BASE=dirname(fileURLToPath(import.meta.url));
export const file=path=>pilotFile(resolve(path),256*1024*1024);
export const read=pin=>pilotJSON(pin.path,pin);
export const write=(path,value)=>writeImmutableAllBoardOutput(path,JSON.stringify(value,null,2)+'\n');
export const fiveIndices=lane=>{
 if(!Number.isInteger(lane)||lane<0||lane>4)gateFail('Exactly five lanes0..4');
 return Array.from({length:351},(_,offset)=>lane+5*offset);
};
export function loadContext(planSha){
 const planPin=file(join(BASE,'plan.json'));if(planPin.sha256!==planSha)gateFail('Exact reviewed external plan SHA required');
 const p=read(planPin);
 if(p.kind!=='next-hu-fixed-five-workers-plan'||p.version!==1||p.spot!=='CO_open_BTN_call_BB_squeeze_CO_fold_BTN_call'||p.lanes!==5||p.boardsPerProcess!==8||p.repository!==resolve(BASE,'../../hu-model11-prefix-key-execution')||p.runRoot!==join(BASE,'run'))gateFail('Fixed next-case contract changed');
 if(!same(p.limits,{heapMiB:512,groupRssMiB:900,aggregateRssMiB:3072,minimumAvailableMiB:2048,childSeconds:900,wholeSeconds:43200,pollMilliseconds:50}))gateFail('Resource contract changed');
 if(process.execPath!==p.node.path||process.version!==p.node.version||!same(process.execArgv,['--max-old-space-size=512']))gateFail('Pinned Node and512MiB heap required');
 const adapterNames=['context.mjs','worker.mjs','regression.mjs','serial.mjs','controller.py'];
 const adapters=adapterNames.map(name=>file(join(BASE,name)));
 const assertFilePins=()=>{
  if(!same(file(planPin.path),planPin))gateFail('Plan changed');
  for(const pin of [...p.sourcePins,...Object.values(p.pair),p.fullPlan,...adapters])if(!same(file(pin.path),pin))gateFail('Pinned source/pair/runtime/adapter changed');
 };
 const assertPins=()=>{
  assertFilePins();if(!same(file(p.node.binary.path),p.node.binary))gateFail('Pinned Node binary changed');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:p.repository,encoding:'utf8'}).trim()!==p.commit||execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:p.repository,encoding:'utf8'}).trim())gateFail('Frozen repository changed');
 };
 assertPins();
 const source=capturePilot1755Source();if(source.identityHash!==p.sourceIdentityHash)gateFail('Frozen numerical closure differs');
 const inputs=loadInputs(p.spot),flop=read(p.pair.flop),later=read(p.pair.later);
 if(inputs.fingerprint!==p.inputFingerprint||flop.metadata.policy_hash!==p.policyHashes.flop||later.metadata.policy_hash!==p.policyHashes.later)gateFail('Exact input/policy identities differ');
 const files={flop:p.pair.flop,later:p.pair.later,plan:p.fullPlan};
 const full=resolveModel11GatePlan(inputs,read(p.fullPlan),{executeFull:true});
 const binding=model11GateBinding(inputs,flop,later,full,source,files);
 const representative=boards();
 const regressionPlan=freezeSnapshot({kind:'representative',scope:'per-policy-regression-72x64-v1',boardList:representative,street:'all',authored:true,samples:64,profiles:[...PROFILES],heroes:[inputs.spot.ip,inputs.spot.oop],cacheBatchSize:64,seed:inputs.config.seed});
 const numerical=model11CompletionRepresentativeBinding(inputs,flop,later,regressionPlan,{strictBalance:source,retainedNumericalSource:source},files);
 const regressionBinding=freezeSnapshot({...numerical,kind:'model11-per-policy-regression-72x64-binding',version:1,externalPlan:planPin,adapterPins:adapters,scope:{requestedStrata:72,requestedPairedTrials:4608,initialIndices:[0,63],purpose:'routing and gross regression;64 is an engineering budget, not confidence',oldFullReplayPassed:false,policyAccepted:false,precision:'low-or-unknown; normal intervals descriptive only',extension:'not implemented; no reroll or repeated64-cell concatenation'}});
 const cells=completionRepresentativeCells(inputs,regressionPlan);
 if(full.boardList.length!==1755||cells.length!==72||!same([...new Set([0,1,2,3,4].flatMap(fiveIndices))].sort((a,b)=>a-b),Array.from({length:1755},(_,i)=>i)))gateFail('Exact catalog/strata/five-lane union differs');
 // Warm numerical children check pinned bytes only; owning Python checks Git/runtime before and after.
 const assertUnchanged=()=>{assertFilePins();if(loadInputs(p.spot).fingerprint!==inputs.fingerprint||!same(capturePilot1755Source(),source))gateFail('Input/numerical source changed');};
 return {p,planPin,adapters,source,files,inputs,flop,later,binding,bindingHash:contentHash(binding),checkpointIdentityHash:model11CheckpointIdentityHash(binding),boardIds:full.boardList.map(b=>b.id),regressionBinding,cells,assertUnchanged};
}
export function checkLaunchReview(c,path,sha,mode){
 const pin=file(path);if(pin.sha256!==sha)gateFail('Exact independent launch review SHA required');const r=read(pin);
 if(r.kind!=='next-hu-independent-launch-review'||r.version!==1||r.verdict!=='APPROVE'||r.spot!==c.p.spot||r.planSha256!==c.planPin.sha256||!same(r.adapterPins,c.adapters)||!same(r.prepared,file(join(c.p.runRoot,'prepared.json')))||!r.approvedModes?.includes(mode)||r.policyChanged!==false||r.productionAuthorized!==false)gateFail('Independent exact-adapter launch review absent or incomplete');
 if(!r.commonEvidence?.length||!r.pilotScopedAcceptance||r.pilotScopedAcceptance.status!=='independently-accepted-scoped-evidence')gateFail('Current pilot must finish and obtain scoped independent acceptance first');
 for(const evidence of [...r.commonEvidence,r.pilotScopedAcceptance.file])if(!same(file(evidence.path),evidence))gateFail('Retained common/pilot evidence changed');
 if(mode==='boards'){
  if(!r.boundedCaseReview||r.boundedCaseReview.verdict!=='APPROVE_FOR_1755'||r.boundedCaseReview.bindingHash!==c.bindingHash||!r.boundedCaseReview.evidence?.length)gateFail('Own bounded quality review must clear this policy before1755');
  for(const evidence of r.boundedCaseReview.evidence)if(!same(file(evidence.path),evidence))gateFail('Bounded individual review evidence changed');
 }
 return pin;
}
export function requirePrepared(c){
 const f=join(c.p.runRoot,'prepared.json');if(!existsSync(f))gateFail('Non-numerical prepare required');const saved=read(file(f));
 if(saved.kind!=='next-hu-five-workers-prepared'||saved.plan!==c.planPin.sha256||saved.bindingHash!==c.bindingHash||saved.checkpointIdentityHash!==c.checkpointIdentityHash||!same(saved.boardIds,c.boardIds)||!same(saved.adapterPins,c.adapters)||saved.numericalWorkPerformed!==false)gateFail('Preparation identity differs');
 return saved;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||process.argv[2]!=='describe')gateFail('describe PLAN_SHA only; no numerical work');
  const c=loadContext(process.argv[3]);
  const regressionBindingHash=contentHash(c.regressionBinding),regressionStoreKey=createHash('sha256').update(JSON.stringify({kind:'model11-completion-representative-evidence',version:1,bindingHash:regressionBindingHash})).digest('hex');
  console.log(JSON.stringify({kind:'next-hu-five-workers-prepared',version:1,plan:c.planPin.sha256,spot:c.p.spot,adapterPins:c.adapters,bindingHash:c.bindingHash,checkpointIdentityHash:c.checkpointIdentityHash,boardIds:c.boardIds,regressionBindingHash,regressionStoreKey,cells:c.cells,lanes:[0,1,2,3,4].map(lane=>({lane,count:fiveIndices(lane).length})),numericalWorkPerformed:false}));
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
