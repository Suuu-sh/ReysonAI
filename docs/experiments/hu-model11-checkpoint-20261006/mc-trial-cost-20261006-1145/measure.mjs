// Isolated runtime diagnostic. No formal source, policy, coverage or acceptance change.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from 'node:inspector';
import { loadContext, requirePrepared, file, read } from '../co-bb-squeeze-btncall-optimized-five-workers/context.mjs';
import { contentHash } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
import { same } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { createModel11BehaviorCompletion } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/offpath-behavior-model11.mjs';
import { playModel11Hand } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation-model11.mjs';
import { playHand, dealRunout } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/simulation.mjs';
import { defenceFor } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/defence.mjs';
import { makeSampler, seatRange, samplePair } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/policy.mjs';
import { referenceLaterPolicy } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/later-policy.mjs';
import { seedFor, seededRandom } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/lib/equity.mjs';
import { EffectiveReachError } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/decision-prefix.mjs';
import { compactCompletionDecision, completionCellAccumulator, accountCompletionRepresentativeTrial, completionRepresentativeCellSummary } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-contract.mjs';
import { produceCompletionRepresentativeCell, validateCompletionRepresentativeCell } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative.mjs';
import { openCompletionRepresentativeEvidence } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-store.mjs';

const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};
const base=dirname(fileURLToPath(import.meta.url)), self=file(fileURLToPath(import.meta.url));
const [mode,indexText,reviewedSha]=process.argv.slice(2), index=Number(indexText);
requireThat(process.argv.length===5 && ['legacy','current','producer','profile'].includes(mode) && [1,2,59].includes(index) && reviewedSha===self.sha256,'Exact reviewed mode/cell/source required');
requireThat(mode!=='producer'||index===2,'Producer diagnostic fixed to completion-bearing cell002');
requireThat(mode!=='profile'||index===59,'CPU profile fixed to completion-bearing cell059');
const output=join(base,`${mode}-${String(index).padStart(3,'0')}`);
requireThat(!existsSync(output),'Fresh diagnostic destination required'); mkdirSync(output);
const write=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const c=loadContext('c1b0e672b29346ab8f0efc2e2dd98f3503d4d19365c24c92d136f00a35d78988');requirePrepared(c);
const cell=c.cells[index], board=c.regressionBinding.plan.boardList.find(row=>row.id===cell.board);
requireThat(cell.samples===64 && cell.cacheBatchSize===64 && cell.seed===c.inputs.config.seed,'Fixed64 cache epoch/seed differs');
const originalDir=join(c.p.runRoot,'regression/cells',String(index).padStart(3,'0'),'79cc56b9873cb3e9c7e234789fceda0891557de599097b371c1b18f03d698f2d');
const marker=file(join(originalDir,`${String(index).padStart(3,'0')}.cell.json`)), original=read(marker), originalPins=[marker], prior=[];
requireThat(same(original.cell,cell) && original.bindingHash===contentHash(c.regressionBinding) && original.unreachable===false,'Original cell differs');
for(const ref of original.chunks){const pin=file(join(originalDir,ref.path));requireThat(pin.bytes===ref.bytes&&pin.sha256===ref.sha256,'Original chunk changed');const chunk=read(pin);requireThat(chunk.startIndex===prior.length&&contentHash(chunk.trials)===ref.trialHash,'Original trial ordering/hash differs');prior.push(...chunk.trials);originalPins.push(pin);}
requireThat(prior.length===64,'Original64 incomplete');
const recheck=()=>{c.assertUnchanged();requireThat(same(file(self.path),self),'Diagnostic changed');for(const pin of originalPins)requireThat(same(file(pin.path),pin),'Original evidence changed');};
const timed=fn=>{const cpu=process.cpuUsage(),start=performance.now();const value=fn();const used=process.cpuUsage(cpu);return {value,wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000};};
recheck();
let result;
if(mode==='producer'){
  const store=openCompletionRepresentativeEvidence(join(output,'evidence'),c.regressionBinding,{fresh:true});
  const storage={};const wrap=(name,fn)=>(...args)=>{const start=performance.now();try{return fn(...args);}finally{const row=storage[name]??={calls:0,wallMs:0};row.calls++;row.wallMs+=performance.now()-start;}};
  const measuredStore={...store,putProof:wrap('putProof',store.putProof),record:wrap('record',store.record),beginCell:wrap('beginCell',(...args)=>{const stream=store.beginCell(...args);return {...stream,append:wrap('append',stream.append),finish:wrap('finish',stream.finish)};})};
  const produced=timed(()=>produceCompletionRepresentativeCell(c.inputs,c.flop,c.later,c.regressionBinding,measuredStore,index,cell));
  const validated=timed(()=>validateCompletionRepresentativeCell(c.inputs,c.flop,c.later,c.regressionBinding,store,cell,produced.value));
  const trials=produced.value.chunks.flatMap(ref=>{const {startIndex,count,trialHash,...pin}=ref;return store.read(ref.path,pin).trials;});
  requireThat(same(trials,prior),'Official producer complete64 trial objects differ');
  store.write(store.cellName(index),produced.value);
  result={producer:{wallMs:produced.wallMs,cpuMs:produced.cpuMs},nativeValidation:{wallMs:validated.wallMs,cpuMs:validated.cpuMs},storage,summary:produced.value.row,completeSavedTrialObjectsEqual:true,trialHash:contentHash(trials)};
}else{
  const setup=timed(()=>mode==='legacy'?defenceFor(c.inputs,c.flop.policy,c.later.policy):createModel11BehaviorCompletion(c.inputs,c.flop,c.later));
  const execution=setup.value, samplers=timed(()=>({ip:makeSampler(seatRange(c.inputs,c.inputs.spot.ip,board.cards)),oop:makeSampler(seatRange(c.inputs,c.inputs.spot.oop,board.cards))}));
  const {ip,oop}=samplers.value, random=seededRandom(seedFor(`${c.inputs.config.seed}|${board.id}|${cell.opponent}|${cell.hero}`));
  const reference=referencePolicyFor(c.inputs.spot.tree), referenceLater=referenceLaterPolicy();
  const trials=[],draws=[],proofs=new Map(),counts={decisionCallbacks:0,heroDecisions:0,referenceDecisions:0,completionDecisions:0},byNode={},phases={samplingMs:0,baselineMs:0,candidateMs:0,evidenceCallbackMs:0};
  const perTrialMs=[];let cacheBeforeRelease=null;
  const session=mode==='profile'?new Session():null;
  const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,value)=>error?reject(error):resolve(value)));
  if(session){session.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');}
  const loop=timed(()=>{
    try{
      for(let trialIndex=0;trialIndex<64;trialIndex++){
        const start=performance.now();if(trialIndex%64===0)execution.releaseBoardCaches();
        let at=performance.now();const hands=samplePair(ip,oop,random,c.inputs.spot),runout=dealRunout(hands,board.cards,random),randoms=Array.from({length:24},()=>random());phases.samplingMs+=performance.now()-at;
        draws.push({hands,runout,randoms});
        at=performance.now();const baseline=playHand({hands,flop:board.cards,runout,hero:cell.hero,policy:reference,laterPolicy:referenceLater,profile:cell.opponent,randoms,spot:c.inputs.spot});phases.baselineMs+=performance.now()-at;
        const completionDecisions=[];let randomIndex=0,played,failure;at=performance.now();
        try{
          played=mode==='legacy'?playHand({hands,flop:board.cards,runout,hero:cell.hero,policy:c.flop.policy,laterPolicy:c.later.policy,profile:cell.opponent,randoms,spot:c.inputs.spot,defence:execution}):playModel11Hand({execution,hands,flop:board.cards,runout,hero:cell.hero,profile:cell.opponent,randoms,onDecision:row=>{
            const callbackStart=performance.now(),position=randomIndex++;counts.decisionCallbacks++;counts[row.seat===cell.hero?'heroDecisions':'referenceDecisions']++;byNode[row.node]=(byNode[row.node]??0)+1;
            if(row.law.provenance.kind==='off-model-saved-policy-behavior-completion'){counts.completionDecisions++;completionDecisions.push(compactCompletionDecision(row,hands[row.seat],position,proof=>proofs.set(proof.proofHash,proof)));}
            phases.evidenceCallbackMs+=performance.now()-callbackStart;
          }});
        }catch(error){if(mode==='legacy'||!(error instanceof EffectiveReachError)||error.status!=='off-model-observed-action')throw error;failure={index:trialIndex,status:error.status,message:error.message,decision:error.decision,zeroLikelihoodProof:error.zeroLikelihoodProof??null};}
        phases.candidateMs+=performance.now()-at;
        trials.push({index:trialIndex,status:failure?'unresolved-off-model':'complete',...(failure?{unresolved:failure}:{candidateReturn:played.returns[cell.hero]}),baselineReturn:baseline.returns[cell.hero],completionDecisions});
        perTrialMs.push(performance.now()-start);
      }
      if(mode!=='legacy')cacheBeforeRelease=execution.cacheStats();
    }finally{execution.releaseBoardCaches();}
  });
  if(session){const {profile}=await post('Profiler.stop');write('cpu.cpuprofile',profile);session.disconnect();}
  requireThat(same(trials.map(t=>t.baselineReturn),prior.map(t=>t.baselineReturn)),'Same-draw baseline control differs');
  if(mode!=='legacy')requireThat(same(trials,prior),'Current-engine complete64 trial objects differ');
  const acc=completionCellAccumulator();trials.forEach((trial,i)=>accountCompletionRepresentativeTrial(acc,trial,i,64));
  write('trials.json',trials);write('proofs.json',[...proofs.values()]);
  result={setup:{wallMs:setup.wallMs,cpuMs:setup.cpuMs},samplers:{wallMs:samplers.wallMs,cpuMs:samplers.cpuMs},loop:{wallMs:loop.wallMs,cpuMs:loop.cpuMs,wallMsPerPairedTrial:loop.wallMs/64,cpuMsPerPairedTrial:loop.cpuMs/64},phases,perTrialMs,counts:mode==='legacy'?{decisionCallbacks:'not instrumented',completionDecisions:'not applicable'}:counts,byNode,cacheBeforeRelease,cacheAfterRelease:mode==='legacy'?null:execution.cacheStats(),drawHash:contentHash(draws),trialHash:contentHash(trials),summary:completionRepresentativeCellSummary(cell,acc),baselineSavedReturnsEqual:true,completeSavedTrialObjectsEqual:mode==='legacy'?'not expected; changed model semantics':true,profileOverheadIncluded:mode==='profile'};
}
recheck();
result={kind:'isolated-hu-monte-carlo-trial-cost',version:1,mode,originalCellIndex:index,cell,sourceCommit:c.p.commit,sourceIdentityHash:c.source.identityHash,source:self,inputFingerprint:c.inputs.fingerprint,policyHashes:c.p.policyHashes,originalEvidence:originalPins,runtime:{node:process.version,execArgv:process.execArgv},memory:process.memoryUsage(),processLifetimeMaxRssKiB:process.resourceUsage().maxRSS,interpretation:'Timing diagnostic only; legacy/model11 semantic equality is not expected; no policy acceptance or validation coverage change',...result};
write('result.json',result);console.log(JSON.stringify({mode,index,loop:result.loop,producer:result.producer,nativeValidation:result.nativeValidation,completeSavedTrialObjectsEqual:result.completeSavedTrialObjectsEqual,output}));
