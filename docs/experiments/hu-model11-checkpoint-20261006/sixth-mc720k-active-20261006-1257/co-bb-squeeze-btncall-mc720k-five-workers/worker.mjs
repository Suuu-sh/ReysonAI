// Short canonical batches. Numerical work is solely frozen board/proof APIs.
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE,loadContext,checkLaunchReview,requirePrepared,fiveIndices,file,read,write } from './context.mjs';
import { openBoardCheckpoints } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/all-board-checkpoints.mjs';
import { openPilot1755ProofAdapter,persistPilot1755Board } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-lane-proof.mjs';
import { validateModel11BoardRow } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-drivers.mjs';
import { auditFileRecord } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/audit-identity.mjs';
import { same,gateFail } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
try{
 if(process.argv.length!==7||!['inspect','batch'].includes(process.argv[2]))gateFail('worker inspect|batch JOB PLAN_SHA REVIEW REVIEW_SHA');
 const [mode,jobPath,planSha,reviewPath,reviewSha]=process.argv.slice(2),c=loadContext(planSha);requirePrepared(c);
 const review=checkLaunchReview(c,reviewPath,reviewSha,'boards'),jobPin=file(jobPath),job=read(jobPin);
 if(job.kind!=='next-hu-canonical-job'||job.mode!==mode||job.planSha256!==planSha||job.reviewSha256!==review.sha256||job.indices.length<1||job.indices.length>8||!same(job.indices,[...new Set(job.indices)].sort((a,b)=>a-b))||job.indices.some(i=>!fiveIndices(job.lane).includes(i))||jobPath!==join(c.p.runRoot,'attempts',job.attempt,'jobs',job.id+'.json'))gateFail('Invalid disjoint canonical job');
 const cache=openBoardCheckpoints(join(c.p.runRoot,`lane-${job.lane}`,'checkpoints'),c.binding,c.boardIds),owned=new Set(fiveIndices(job.lane).map(i=>c.boardIds[i]));
 if(cache.key!==c.checkpointIdentityHash)gateFail('Checkpoint binding differs');
 const allowed=new Set(['identity.json']);
 for(const [board,row] of cache.rows){
  if(!owned.has(board)||row.complete!==true)gateFail('Foreign/incomplete checkpoint');allowed.add(board+'.json');
  for(const ref of row.modelUnreachableProofs??[]){const name=ref.proofHash+'.proof.json',pin=auditFileRecord(cache.dir,name);if(pin.bytes!==ref.bytes||pin.sha256!==ref.sha256)gateFail('Proof bytes differ');allowed.add(name);}
 }
 for(const name of readdirSync(cache.dir)){const stat=lstatSync(join(cache.dir,name));if(!stat.isFile()||stat.isSymbolicLink()||!allowed.has(name))gateFail('Partial/orphan checkpoint requires separately reviewed preservation recovery');}
 const assertUnchanged=()=>{c.assertUnchanged();if(!same(file(jobPath),jobPin)||!same(file(review.path),review))gateFail('Job/review changed');};
 assertUnchanged();
 const started={kind:'next-hu-canonical-batch-start',plan:c.planPin,job:jobPin,worker:file(fileURLToPath(import.meta.url)),review,bindingHash:c.bindingHash,checkpointIdentityHash:cache.key,process:{pid:process.pid,startTicks:readFileSync(`/proc/${process.pid}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/)[19]},startedAt:new Date().toISOString()};
 write(jobPath.replace(/\.json$/,'.started.json'),started);
 const proof=openPilot1755ProofAdapter(c.inputs,c.flop,c.later,c.binding,cache),completed=[];
 try{for(const index of job.indices){const board=c.binding.plan.boardList[index];assertUnchanged();
  if(mode==='inspect'){if(!cache.rows.has(board.id))gateFail('Inspection may not generate');validateModel11BoardRow(c.inputs,c.binding,board,cache.rows.get(board.id),proof);}
  else{if(cache.rows.has(board.id))gateFail('Completed board must be reused, never regenerated');persistPilot1755Board(c.inputs,c.flop,c.later,c.binding,board,cache,proof,assertUnchanged,()=>{});}
  proof.release();const row=cache.rows.get(board.id);if(row?.complete!==true)gateFail('Incomplete board');
  completed.push({index,board:board.id,checkpoint:auditFileRecord(cache.dir,board.id+'.json'),proofs:(row.modelUnreachableProofs??[]).map(ref=>auditFileRecord(cache.dir,ref.proofHash+'.proof.json'))});
  console.log(JSON.stringify({lane:job.lane,index,board:board.id,mode,complete:true}));
 }}finally{proof.release();}
 assertUnchanged();write(jobPath.replace(/\.json$/,'.completed.json'),{kind:'next-hu-canonical-batch-complete-not-accepted',version:1,started,completed,generatedBoards:mode==='batch'?completed.length:0,inspectedBoards:mode==='inspect'?completed.length:0,fullGatePassed:false,policyAccepted:false});
}catch(error){console.error(error.stack);process.exitCode=1;}
