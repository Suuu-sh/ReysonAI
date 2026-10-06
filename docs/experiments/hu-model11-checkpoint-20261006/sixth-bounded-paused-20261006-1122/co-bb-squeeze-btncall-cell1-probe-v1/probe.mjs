// Fixed, separate cell001 continuation diagnostic; no change to the 72x64 contract.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, requirePrepared, file, read, write } from '../co-bb-squeeze-btncall-optimized-five-workers/context.mjs';
import { contentHash, freezeSnapshot } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
import { same } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { model11CompletionRepresentativeBinding, completionRepresentativeCells } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { produceCompletionRepresentativeCell, validateCompletionRepresentativeCell } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative.mjs';
import { openCompletionRepresentativeEvidence } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-store.mjs';
import { summarizeModel11Trials } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation-model11.mjs';
const base=dirname(fileURLToPath(import.meta.url)), self=file(fileURLToPath(import.meta.url));
const requireThat=(condition,message)=>{if(!condition)throw new Error(message);};
requireThat(process.argv.length===4 && process.argv[2]==='--reviewed-sha256' && process.argv[3]===self.sha256,'Exact reviewed diagnostic SHA required');
const c=loadContext('c1b0e672b29346ab8f0efc2e2dd98f3503d4d19365c24c92d136f00a35d78988');requirePrepared(c);
const originalCellIndex=1, originalDir=join(c.p.runRoot,'regression/cells/001/79cc56b9873cb3e9c7e234789fceda0891557de599097b371c1b18f03d698f2d');
const originalPin=file(join(originalDir,'001.cell.json'));
requireThat(originalPin.sha256==='a76ee87e088e2aa063cfc2a53cbb94f145c217efbdaccb1cdccc120b1493c316','Original marker changed');
const original=read(originalPin), priorPins=[originalPin], previous=[];
requireThat(same(original.cell,c.cells[originalCellIndex]) && original.cell.samples===64 && original.bindingHash===contentHash(c.regressionBinding) && !original.unreachable,'Original cell binding differs');
for(const ref of original.chunks){
 const pin=file(join(originalDir,ref.path));requireThat(pin.bytes===ref.bytes && pin.sha256===ref.sha256,'Original chunk changed');priorPins.push(pin);
 const chunk=read(pin);requireThat(chunk.bindingHash===original.bindingHash && chunk.cellIdentity===original.cellIdentity && chunk.startIndex===previous.length && chunk.trials.length===ref.count && contentHash(chunk.trials)===ref.trialHash,'Original chunk identity/order differs');previous.push(...chunk.trials);
}
requireThat(previous.length===64 && previous.every((trial,index)=>trial.index===index),'Original64 incomplete');
const board=c.regressionBinding.plan.boardList.find(row=>row.id==='As7d2c');requireThat(board && original.cell.opponent==='standard' && original.cell.hero==='BB','Fixed adverse condition differs');
const plan=freezeSnapshot({kind:'representative',scope:'cell001-adverse-probe-128-v1',boardList:[board],street:'all',authored:true,samples:192,profiles:['standard'],heroes:['BB'],cacheBatchSize:64,seed:c.inputs.config.seed});
const numerical=model11CompletionRepresentativeBinding(c.inputs,c.flop,c.later,plan,{strictBalance:c.source,retainedNumericalSource:c.source},c.files);
const binding=freezeSnapshot({...numerical,kind:'model11-separate-cell001-adverse-probe',version:1,diagnosticSource:self,originalCellIndex,originalEvidence:priorPins,scope:{replayedIndices:[0,63],additionalIndices:[64,191],additionalPairedTrials:128,selectedConditions:1,adaptiveInterpretation:'Exploratory; not calibrated confidence or a superiority/noninferiority claim',changesOriginal72x64:false}});
const cells=completionRepresentativeCells(c.inputs,plan);requireThat(cells.length===1,'Exactly one diagnostic condition');
const output=join(base,'run-v1');requireThat(!existsSync(output),'Fresh diagnostic destination required');
const assertUnchanged=()=>{c.assertUnchanged();requireThat(same(file(self.path),self),'Diagnostic changed');for(const pin of priorPins)requireThat(same(file(pin.path),pin),'Original evidence changed');};
assertUnchanged();const startedAt=new Date().toISOString(),store=openCompletionRepresentativeEvidence(output,binding,{fresh:true});
const saved=produceCompletionRepresentativeCell(c.inputs,c.flop,c.later,binding,store,0,cells[0]);
validateCompletionRepresentativeCell(c.inputs,c.flop,c.later,binding,store,cells[0],saved);
requireThat(!saved.unreachable,'Previously reachable base became unreachable');
const trials=[];
for(const ref of saved.chunks){const {startIndex,count,trialHash,...pin}=ref;trials.push(...store.read(ref.path,pin).trials);}
requireThat(trials.length===192 && same(trials.slice(0,64),previous),'Complete original64 trial replay differs');
store.write(store.cellName(0),saved);
const summary=rows=>summarizeModel11Trials({attempted:rows.length,candidate:rows.filter(t=>t.status==='complete').map(t=>t.candidateReturn),baseline:rows.filter(t=>t.status==='complete').map(t=>t.baselineReturn),unresolved:rows.filter(t=>t.status!=='complete').map(t=>t.unresolved)});
const result={kind:'model11-cell001-adaptive-continuation-diagnostic',version:1,startedAt,completedAt:new Date().toISOString(),spot:c.p.spot,source:c.source,files:c.files,diagnosticSource:self,bindingHash:contentHash(binding),originalCellIndex,condition:cells[0],originalEvidence:priorPins,first64CompleteTrialObjectsEqual:true,pairedExecutions:192,replayedPairedTrials:64,additionalPairedTrials:128,cacheReleaseIndices:[0,64,128],original64:summary(previous),replayed64:summary(trials.slice(0,64)),additional128:summary(trials.slice(64)),combined192:summary(trials),cell:store.record(store.cellName(0)),evidenceRoot:store.dir,complete:saved.row.unresolvedCount===0,completionDecisions:saved.row.completionDecisions,original72x64Changed:false,interpretation:'Adaptive diagnostic intervals are exploratory; separate from the original72x64 report, no confidence/superiority/noninferiority claim.',referenceDataEntersCandidateBelief:false,policyAccepted:false,model11Adoption:false};
assertUnchanged();write(join(base,'result.json'),result);console.log(JSON.stringify({status:result.complete?'COMPLETE_DIAGNOSTIC_NOT_ACCEPTED':'BLOCKED_UNRESOLVED',original64:result.original64.delta_bb,additional128:result.additional128.delta_bb,combined192:result.combined192.delta_bb,first64CompleteTrialObjectsEqual:true,additionalPairedTrials:128,output:join(base,'result.json')}));if(!result.complete)process.exitCode=1;
