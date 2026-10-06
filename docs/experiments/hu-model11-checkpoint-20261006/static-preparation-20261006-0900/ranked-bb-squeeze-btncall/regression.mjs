// Fixed64 per-policy diagnostic, using the unchanged composite-cell producer/validator.
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext,checkLaunchReview,requirePrepared,file,read,write } from './context.mjs';
import { produceCompletionRepresentativeCell,validateCompletionRepresentativeCell } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative.mjs';
import { openCompletionRepresentativeEvidence } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-completion-representative-store.mjs';
import { same,gateFail } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { contentHash } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
try{
 if(process.argv.length!==7||!['inspect','cell'].includes(process.argv[2]))gateFail('regression inspect|cell JOB PLAN_SHA REVIEW REVIEW_SHA');
 const [mode,jobPath,planSha,reviewPath,reviewSha]=process.argv.slice(2),c=loadContext(planSha);requirePrepared(c);
 const review=checkLaunchReview(c,reviewPath,reviewSha,'regression'),jobPin=file(jobPath),job=read(jobPin),index=job.cellIndex,cell=c.cells[index];
 if(job.kind!=='next-hu-regression-job'||job.mode!==mode||!cell||job.planSha256!==planSha||job.reviewSha256!==review.sha256||!Number.isInteger(job.lane)||job.lane<0||job.lane>4||Math.floor(index/6)%5!==job.lane||jobPath!==join(c.p.runRoot,'attempts',job.attempt,'jobs',job.id+'.json'))gateFail('Invalid fixed-cell job');
 const store=openCompletionRepresentativeEvidence(join(c.p.runRoot,'regression','cells',String(index).padStart(3,'0')),c.regressionBinding);
 const assertUnchanged=()=>{c.assertUnchanged();if(!same(file(jobPath),jobPin)||!same(file(review.path),review))gateFail('Job/review changed');};assertUnchanged();
 const started={kind:'next-hu-regression-start',plan:c.planPin,job:jobPin,worker:file(fileURLToPath(import.meta.url)),review,bindingHash:contentHash(c.regressionBinding),cellIndex:index,cell,process:{pid:process.pid,startTicks:readFileSync(`/proc/${process.pid}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/)[19]},startedAt:new Date().toISOString()};
 write(jobPath.replace(/\.json$/,'.started.json'),started);
 let saved;
 if(mode==='inspect'){if(!store.hasCell(index))gateFail('Inspection may not generate trials');saved=store.read(store.cellName(index));}
 else{if(store.hasCell(index)||readdirSync(store.dir).some(name=>name!=='identity.json'))gateFail('Preserve existing complete/partial cell; no reroll');saved=produceCompletionRepresentativeCell(c.inputs,c.flop,c.later,c.regressionBinding,store,index,cell);}
 validateCompletionRepresentativeCell(c.inputs,c.flop,c.later,c.regressionBinding,store,cell,saved);
 if(mode==='cell')store.write(store.cellName(index),saved);
 const allowed=new Set(['identity.json',store.cellName(index),...saved.chunks.map(ref=>ref.path),...saved.proofs.map(ref=>ref.path)]);
 for(const name of readdirSync(store.dir)){const stat=lstatSync(join(store.dir,name));if(!stat.isFile()||stat.isSymbolicLink()||!allowed.has(name))gateFail('Partial/orphan regression evidence preserved; separate recovery required');}
 const values=[];for(const ref of saved.chunks){const {startIndex,count,trialHash,...pin}=ref;const chunk=store.read(ref.path,pin);values.push(...chunk.trials);}
 const complete=saved.unreachable||saved.row.unresolvedCount===0;
 const stats=key=>{if(!complete||saved.unreachable)return null;const a=values.map(t=>key==='delta'?t.candidateReturn-t.baselineReturn:t[key]);const mean=a.reduce((s,x)=>s+x,0)/a.length;return {actualN:a.length,mean,sampleStandardDeviation:Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length-1)),normalIntervalMeaning:'descriptive only;64 is an engineering budget, not confidence'};};
 const diagnostic={kind:'model11-per-policy-regression-72x64-cell',version:1,bindingHash:contentHash(c.regressionBinding),cellIndex:index,cell,requestedTrials:64,attempted:saved.unreachable?0:saved.row.attempted,completed:saved.unreachable?0:saved.row.completed,provedBaseUnreachableTrials:saved.unreachable?64:0,unresolved:saved.unreachable?0:saved.row.unresolvedCount,complete,precision:'low-or-unknown',candidate:stats('candidateReturn'),baseline:stats('baselineReturn'),delta:stats('delta'),normalIntervals:saved.unreachable?null:{candidate:saved.row.candidate_ev_bb?.ci95??null,baseline:saved.row.baseline_ev_bb?.ci95??null,delta:saved.row.delta_bb?.ci95??null},rawCell:store.record(store.cellName(index)),rawEvidenceDirectory:store.dir,oldFullReplayPassed:false,policyAccepted:false};
 assertUnchanged();write(jobPath.replace(/\.json$/,'.completed.json'),{kind:'next-hu-regression-cell-complete-not-accepted',version:1,started,diagnostic,generatedTrials:mode==='cell'?diagnostic.attempted:0,inspectedTrials:mode==='inspect'?diagnostic.attempted:0});
 console.log(JSON.stringify({cellIndex:index,complete,requestedTrials:64,generatedTrials:mode==='cell'?diagnostic.attempted:0,oldFullReplayPassed:false}));if(!complete)process.exitCode=1;
}catch(error){console.error(error.stack);process.exitCode=1;}
