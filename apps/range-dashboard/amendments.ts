// Read-only sidecar projection. Originals stay immutable; no approval can be inferred.
import { readFile,realpath } from 'node:fs/promises';
import { resolve,sep,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const APPROVAL_PATH=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/qa/aiv2-postflop-reason-amendments-approval.json');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rawHash=v=>createHash('sha256').update(v).digest('hex');
const assert=v=>{if(!v)throw Error('Unapproved or mismatched reason sidecar');};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const reason=v=>{assert(typeof v?.text==='string'&&v.text.trim()&&typeof v.text_ja==='string'&&v.text_ja.trim());return {en:v.text,ja:v.text_ja};};
export function frequencyDigest(artifact){return hash({decision_id:artifact.decision_id,input_hash:artifact.metadata.input_hash,legal_actions:artifact.legal_actions,combos:artifact.combos.map(({combo,hand,reach_weight,mix})=>({combo,hand,reach_weight,mix}))});}
export function approvedAmendment(artifact,baseRawHash,report,reportRawHash,revision,revisionRawHash,approval,approvalRawHash){
 try{
  assert(approval?.schema_version==='aiv2-postflop-reason-amendment-approval-v1'&&approval.approved===true&&approval.scope==='three-saved-decision-reason-only-amendments');
  assert(approval.reviewer?.relationship==='independent-review'&&typeof approval.reviewer.actor==='string'&&approval.reviewer.actor.trim()&&!['generator','codex-local-provider'].includes(approval.reviewer.actor.toLowerCase()));
  assert(Array.isArray(approval.reviewer.evidence)&&approval.reviewer.evidence.length&&approval.reviewer.evidence.every(v=>typeof v==='string'&&v.trim()));
  assert(Array.isArray(approval.revisions)&&approval.revisions.every(v=>['revision_id','revision_raw_file_sha256','base_decision_id','base_raw_file_sha256','frequency_only_sha256'].every(k=>typeof v[k]==='string'&&/^[a-f0-9]{64}$/.test(v[k])))&&approval.revisions.length===3&&new Set(approval.revisions.map(v=>v.revision_id)).size===3&&new Set(approval.revisions.map(v=>v.base_decision_id)).size===3);
  assert(revision?.schema_version==='aiv2-postflop-reason-amendment-v1'&&revision.generation_mode==='post-generation-review-amendment'&&revision.approval_status==='pending-independent-review');
  const {revision_id,...body}=revision;assert(/^[a-f0-9]{64}$/.test(revision_id)&&hash(body)===revision_id);
  const frequency=frequencyDigest(artifact),expectedBase={decision_id:artifact.decision_id,raw_file_sha256:baseRawHash,policy_hash:artifact.metadata.policy_hash,input_hash:artifact.metadata.input_hash,response_hash:artifact.metadata.response_hash,frequency_only_sha256:frequency};
  assert(equal(revision.base,expectedBase));
  const entry=approval.revisions.find(v=>v.revision_id===revision_id);
  assert(entry&&entry.revision_raw_file_sha256===revisionRawHash&&entry.base_decision_id===artifact.decision_id&&entry.base_raw_file_sha256===baseRawHash&&entry.frequency_only_sha256===frequency);
  assert(report?.schema_version==='aiv2-postflop-independent-review-v1'&&report.approved===false&&revision.original_failed_review_sha256===reportRawHash&&approval.original_failed_review_sha256===reportRawHash);
  assert(report.artifacts.some(v=>v.decision_id===artifact.decision_id&&v.raw_file_sha256===baseRawHash));
  const ids=revision.resolved_finding_ids;assert(Array.isArray(ids)&&ids.length===1&&new Set(ids).size===ids.length);
  const findings=ids.map(id=>report.findings.find(v=>v.id===id&&v.decision_id===artifact.decision_id&&v.artifact_raw_file_sha256===baseRawHash));assert(findings.every(Boolean));
  const p=revision.provenance;assert(p?.method==='aiv2-postflop-reason-amendment-v1'&&p.version==='three-bound-findings-v1'&&p.model==='gpt-6.1-sol'&&p.effort==='medium'&&p.confirmed_model==='gpt-6.1-sol'&&p.confirmed_effort==='medium'&&typeof p.thread_id==='string'&&p.thread_id.trim()&&typeof p.turn_id==='string'&&p.turn_id.trim());
  assert(hash({method:p.method,version:p.version,model:p.model,effort:p.effort,implementation_hash:p.implementation_hash,base:revision.base,original_failed_review_sha256:revision.original_failed_review_sha256,scope:revision.scope,resolved_finding_ids:revision.resolved_finding_ids})===revision.request_id);
  const response=revision.source_response;assert(/^[a-f0-9]{64}$/.test(revision.request_id)&&response?.request_id===revision.request_id&&response.assessment==='reason-only'&&response.unchanged_all_frequencies===true);reason(response.explanation);
  assert(Array.isArray(response.combo_patches)&&Array.isArray(revision.scope?.combos));
  let summary=null;const combo_reasons=[];
  if(revision.scope.kind==='summary'){
   assert(revision.scope.combos.length===0&&response.combo_patches.length===0&&findings.every(v=>!v.affected_combos?.length));summary=reason(response.summary_patch);
  }else{
   assert(revision.scope.kind==='combo-reasons'&&response.summary_patch===null);
   const expected=[...new Set(findings.flatMap(v=>v.affected_combos??[]))].sort();assert(expected.length>0&&equal([...revision.scope.combos].sort(),expected)&&equal(response.combo_patches.map(v=>v.combo).sort(),expected));
   for(const patch of response.combo_patches){const base=artifact.combos.find(v=>v.combo===patch.combo);assert(base&&equal(patch.mix,base.mix));combo_reasons.push({combo:patch.combo,reason:reason(patch)});}
  }
  return {revision_id,content_hash:revision_id,revision_raw_file_sha256:revisionRawHash,approval_id:approvalRawHash,resolved_finding_ids:[...ids],summary,combo_reasons,reason_only:true,production_approved:false};
 }catch{return null;}
}
export async function resolveAmendment(root,artifact,baseRawHash,report,reportRawHash,approvalPath=APPROVAL_PATH){
 try{
  const approvalBytes=await readFile(approvalPath),approval=JSON.parse(approvalBytes.toString('utf8'));
  if(!approval?.approved||!Array.isArray(approval.revisions))return null;
  const entries=approval.revisions.filter(v=>v.base_decision_id===artifact.decision_id);if(entries.length!==1)return null;
  const id=entries[0].revision_id;if(!/^[a-f0-9]{64}$/.test(id))return null;
  const directory=await realpath(resolve(root,'reason-amendments/revisions')),path=await realpath(resolve(directory,id+'.json'));
  if(!path.startsWith(directory+sep))return null;
  const bytes=await readFile(path),revision=JSON.parse(bytes.toString('utf8'));if(revision.revision_id!==id)return null;
  return approvedAmendment(artifact,baseRawHash,report,reportRawHash,revision,rawHash(bytes),approval,rawHash(approvalBytes));
 }catch{return null;}
}
