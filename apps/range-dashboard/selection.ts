// Atomic, explicitly reviewed five-node selection. No blind merging of candidate directories.
import { readFile,realpath } from 'node:fs/promises';
import { dirname,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const DOCS=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/qa');
export const ACTIVE_SELECTION_PATH=resolve(DOCS,'aiv2-postflop-active-selection.json');
export const REVIEW_FILE='aiv2-postflop-reviewed-regeneration-review.json';
export const RUN_ID='4cf32b71efd09dddfea2de266d93a28f7a0ed791a25bc9c1bd96182ad86324a5';
const OLD=['1ae33fd719b2a4c8186c3a241d86f301216326384b9b83e82154db305a6ed028','52ef028be959308231f9123c14d061d783a33c8db3e987246a8f28f03e767b4e'];
const REPLACED=['db36b233b2a0234cc36b87999597bc64c53e80525c99f604889faa38870ec445','6f9b28e4a8b7e1c30d4f4a1da188d013e2ca9528bb40b02f67676edbccfd5af2','744fb2ef8bb0a5fd9e0f5d5a59538eddfafdd7545538dafda31f242432353e7f'];
const SLOTS=['flop-btn','turn-bb','turn-btn','river-bb','river-btn'];
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=v=>sha(JSON.stringify(v));
const assert=v=>{if(!v)throw Error('Reviewed selection is unavailable or mismatched');};
export function checkSuccessor(parent,child,nextCard){
 const input=parent.input,actor=input.actor,opponent=actor==='BTN'?'BB':'BTN';
 const check=parent.legal_actions.find(v=>v.action==='check');assert(check?.paid_bb===0&&check.to_bb===input.committed_bb[actor]);
 const previous=input.history.at(-1),ended=previous?.street===input.street&&previous.seat===opponent&&previous.action==='check';
 assert(Boolean(nextCard)===Boolean(ended)&&(!ended||input.street!=='river'));
 const board=ended?input.board+nextCard:input.board,street=ended?(input.street==='flop'?'turn':'river'):input.street;
 const byCombo=new Map(parent.combos.map(c=>[c.combo,c.mix]));
 const ranges={};
 for(const seat of ['BTN','BB'])ranges[seat]=Object.fromEntries(Object.entries(input.ranges[seat]).map(([combo,weight])=>[combo,(board.includes(combo.slice(0,2))||board.includes(combo.slice(2)))?0:weight*(seat===actor?(byCombo.get(combo)?.check??0)/100:1)]));
 const step={street:input.street,board:input.board,seat:actor,action:'check',paid_bb:0,to_bb:check.to_bb,decision_id:parent.decision_id,policy_hash:parent.metadata.policy_hash};
 const expected={...input,actor:ended?'BB':opponent,street,board,committed_bb:ended?{BTN:0,BB:0}:{...input.committed_bb,[actor]:check.to_bb},last_full_raise_bb:ended?1:input.last_full_raise_bb,raises_this_street:ended?0:input.raises_this_street,raise_reopened:true,history:[...input.history,step],ranges};
 assert(isDeepStrictEqual(child.input,expected));
}
export function validateSelection(selection,report,reportRawHash,plan,planRawHash,entries,failedReviewHash){
 assert(selection?.schema_version==='aiv2-postflop-active-selection-v1'&&selection.run_id===RUN_ID);
 assert(selection.review?.file===REVIEW_FILE&&selection.review.raw_file_sha256===reportRawHash&&selection.run_plan_raw_file_sha256===planRawHash);
 assert(report?.schema_version==='aiv2-postflop-reviewed-regeneration-review-v1'&&report.approved===true&&report.scope==='dashboard-data-content-only'&&report.run_id===RUN_ID&&report.run_plan_raw_file_sha256===planRawHash);
 assert(report.reviewer?.relationship==='independent-review'&&typeof report.reviewer.actor==='string'&&report.reviewer.actor.trim()&&!['generator','codex-local-provider'].includes(report.reviewer.actor.toLowerCase())&&Array.isArray(report.reviewer.evidence)&&report.reviewer.evidence.length>0&&report.reviewer.evidence.every(v=>typeof v==='string'&&v.trim()));
 assert(Array.isArray(report.findings)&&report.findings.length===0);
 assert(plan.schema_version==='aiv2-postflop-reviewed-regeneration-plan-v1'&&plan.review_raw_sha256===failedReviewHash&&hash(plan)===RUN_ID);
 assert(Array.isArray(selection.artifacts)&&selection.artifacts.length===5&&isDeepStrictEqual(report.artifacts,selection.artifacts)&&entries.length===5&&new Set(selection.artifacts.map(v=>v.decision_id)).size===5);
 for(let i=0;i<5;i++){
  const pin=selection.artifacts[i],e=entries[i],a=e.artifact;
  assert(pin.slot===SLOTS[i]&&hex(pin.decision_id)&&hex(pin.raw_file_sha256)&&pin.decision_id===a.decision_id&&pin.raw_file_sha256===e.rawHash);
  assert(a.input.actor===(i===1||i===3?'BB':'BTN')&&a.input.board===(i===0?'As7d2c':i<3?'As7d2c9h':'As7d2c9h3s'));
  if(i<2){assert(pin.source==='original'&&pin.decision_id===OLD[i]&&pin.revision_raw_file_sha256===null);}
  else{
   const r=e.revision,{record_id,...body}=r;
   assert(pin.source==='reviewed-regeneration'&&hex(pin.revision_raw_file_sha256)&&pin.revision_raw_file_sha256===e.revisionRawHash&&hash(body)===record_id);
   assert(r.schema_version==='aiv2-postflop-generation-revision-v1'&&r.run_id===RUN_ID&&r.stage===SLOTS[i]&&r.original_decision_id===REPLACED[i-2]&&r.original_raw_file_sha256===e.originalRawHash&&r.new_decision_id===a.decision_id&&r.new_raw_file_sha256===e.rawHash&&r.failed_review_raw_sha256===failedReviewHash&&r.implementation_hash===plan.implementation_hash&&r.implementation_hash===a.metadata.implementation_hash);
   assert(r.input_hash===a.metadata.input_hash&&r.response_hash===a.metadata.response_hash&&r.policy_hash===a.metadata.policy_hash);
   const p=entries[i-1];assert(r.parent.decision_id===p.artifact.decision_id&&r.parent.raw_sha256===p.rawHash&&r.parent.policy_hash===p.artifact.metadata.policy_hash&&r.parent.action==='check'&&r.parent.next_card===(i===3?'3s':null));
   assert(r.provider?.confirmed_model==='gpt-6.1-sol'&&r.provider.confirmed_effort==='medium'&&typeof r.provider.thread_id==='string'&&r.provider.thread_id&&typeof r.provider.turn_id==='string'&&r.provider.turn_id);
  }
  if(i)checkSuccessor(entries[i-1].artifact,a,i===1?'9h':i===3?'3s':null);
 }
 return {run_id:RUN_ID,review_raw_file_sha256:reportRawHash,production_approved:false,scope:'dashboard-data-content-only'};
}
async function confined(directory,file){assert(hex(file.replace(/\.json$/,''))&&file.endsWith('.json'));const root=await realpath(directory),path=await realpath(resolve(root,file));assert(path.startsWith(root+sep));return readFile(path);}
export async function resolveSelection(root,failedReviewHash,verifyArtifact){
 try{
  const selection=JSON.parse(await readFile(ACTIVE_SELECTION_PATH,'utf8'));assert(selection.run_id===RUN_ID&&selection.review?.file===REVIEW_FILE&&Array.isArray(selection.artifacts)&&selection.artifacts.length===5);
  const reviewBytes=await readFile(resolve(DOCS,REVIEW_FILE)),report=JSON.parse(reviewBytes.toString('utf8'));
  const run=resolve(root,'reviewed-regeneration',RUN_ID),planBytes=await readFile(resolve(run,'run-plan.json')),plan=JSON.parse(planBytes.toString('utf8'));
  const entries=[];
  for(let i=0;i<5;i++){const pin=selection.artifacts[i];assert(hex(pin.decision_id));const directory=i<2?resolve(root,'decisions'):resolve(run,'decisions');const bytes=await confined(directory,pin.decision_id+'.json'),artifact=JSON.parse(bytes.toString('utf8')),rawHash=sha(bytes),scene=verifyArtifact(artifact,rawHash);let revision=null,revisionRawHash=null,originalRawHash=null;
   if(i>=2){const revisionBytes=await confined(resolve(run,'generation-revisions'),pin.decision_id+'.json');revision=JSON.parse(revisionBytes.toString('utf8'));revisionRawHash=sha(revisionBytes);originalRawHash=sha(await confined(resolve(root,'decisions'),REPLACED[i-2]+'.json'));}entries.push({artifact,rawHash,scene,revision,revisionRawHash,originalRawHash});}
  const binding=validateSelection(selection,report,sha(reviewBytes),plan,sha(planBytes),entries,failedReviewHash);
  return {binding,scenes:entries.map(e=>({...e.scene,review:{status:'dashboard_data_content_reviewed',production_approved:false,warnings:[]},selection:binding}))};
 }catch{return null;}
}
