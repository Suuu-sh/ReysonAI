// Explicit functional verification extension, never an assertion of TypeScript parity.
// Only the two preservation helpers can advance; all other legacy source pins remain exact.
import { createHash } from 'node:crypto';
import proposal from '../../../../configs/source-identity-mw3-verification-preservation.json' with { type: 'json' };
import review from '../../../../configs/source-identity-mw3-verification-preservation.review.json' with { type: 'json' };
import baseline from '../../docs/mw3-source-identity/verification-preservation-adapter-baseline.json' with { type: 'json' };
export const PRESERVATION_IMPORTED = { proposal, review, baseline };
export const PRESERVATION_PATHS = Object.freeze([
 'apps/frontend/scripts/ci/mw3-local-d1-oracle.ts',
 'apps/frontend/scripts/verify-preflop-local-d1.ts',
]);
export const PRESERVATION_EXTRA_PATHS = Object.freeze([
 'apps/frontend/docs/mw3-source-identity/verification-preservation-adapter-baseline.json',
 'apps/frontend/scripts/postflop-ai/mw3-verification-preservation-extension.ts',
 'configs/source-identity-mw3-verification-preservation.json',
 'configs/source-identity-mw3-verification-preservation.review.json',
]);
const SHA=/^[a-f0-9]{64}$/;
const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(reason:string):never=>{throw Error('Unapproved or changed MW3 archive source identity: verification-preservation extension: '+reason);};
const keys=(v:any,k:string[],label:string)=>{if(!v||typeof v!=='object'||Array.isArray(v)||!same(Object.keys(v).sort(),[...k].sort()))fail(label);};
type RecordPin={path:string;bytes:number;sha256:string};
type Input={proposal:Buffer;review:Buffer;baseline:Buffer;legacyInventory:Buffer;legacyReview:Buffer;legacyEvidence:Buffer;adapter:Buffer;validator:Buffer};
export function verifyPreservationExtension(input:Input){
 let p:any,r:any,b:any,old:any,inventory:any;
 try{p=JSON.parse(input.proposal.toString('utf8'));r=JSON.parse(input.review.toString('utf8'));b=JSON.parse(input.baseline.toString('utf8'));old=JSON.parse(input.legacyReview.toString('utf8'));inventory=JSON.parse(input.legacyInventory.toString('utf8'));}catch{fail('malformed JSON');}
 keys(p,['schema_version','kind','status','scope','author_task','rows'],'proposal shape');
 keys(r,['schema_version','kind','status','scope','reviewer','reviewer_task','reviewer_model','proposal_sha256','adapter_sha256','validator_sha256','baseline_snapshot_sha256','legacy_inventory_sha256','legacy_review_sha256','legacy_evidence_sha256','notes'],'review shape');
 keys(b,['schema_version','kind','path','source'],'baseline shape');
 const scope='verification-preservation-only-no-numerical-or-gto-renewal';
 if(p.schema_version!==1||p.kind!=='mw3-verification-preservation-extension-proposal'||p.status!=='source-only-proposal'||p.scope!==scope||p.author_task!=='/root/production_path'||!Array.isArray(p.rows)||p.rows.length!==2)fail('closed proposal scope');
 if(r.schema_version!==1||r.kind!=='mw3-verification-preservation-extension-review'||r.status!=='approved'||r.scope!==scope||typeof r.reviewer!=='string'||!r.reviewer.trim()||typeof r.reviewer_task!=='string'||!r.reviewer_task.trim()||r.reviewer_task===p.author_task||r.reviewer_model!=='not-exposed'||!Array.isArray(r.notes)||!r.notes.length||r.notes.some((v:unknown)=>typeof v!=='string'||!v.trim()))fail('independent review');
 const bindings=[['proposal_sha256',input.proposal],['adapter_sha256',input.adapter],['validator_sha256',input.validator],['baseline_snapshot_sha256',input.baseline],['legacy_inventory_sha256',input.legacyInventory],['legacy_review_sha256',input.legacyReview],['legacy_evidence_sha256',input.legacyEvidence]] as const;
 for(const[k,v]of bindings)if(!SHA.test(r[k])||r[k]!==digest(v))fail('review byte binding: '+k);
 if(b.schema_version!==1||b.kind!=='mw3-preservation-legacy-adapter-bytes'||b.path!=='apps/frontend/scripts/postflop-ai/mw3-manifest-source-identity.ts'||typeof b.source!=='string'||digest(b.source)!==old.adapter_sha256)fail('legacy adapter bytes');
 // Legacy review still authorizes exactly its old inventory/evidence/adapter,
 // not the new functional helpers. Their independent authority is separate.
 if(old.inventory_sha256!==digest(input.legacyInventory)||old.evidence_sha256!==digest(input.legacyEvidence))fail('legacy review chain');
 if(!Array.isArray(inventory.rows)||inventory.rows.length!==152)fail('legacy inventory');
 const overrides=new Map<string,RecordPin>();
 for(const[index,row]of p.rows.entries()){
  keys(row,['classification','prior','current'],'extension row shape');keys(row.prior,['path','bytes','sha256'],'prior pin');keys(row.current,['path','bytes','sha256'],'current pin');
  const path=PRESERVATION_PATHS[index],prior=inventory.rows.find((v:any)=>v.current?.path===path)?.current;
  if(row.classification!=='verification-preservation-extension'||!same(row.prior,prior)||row.current.path!==path||!SHA.test(row.current.sha256)||!Number.isSafeInteger(row.current.bytes)||row.current.bytes<1||row.current.sha256===row.prior.sha256)fail('closed prior/current pin');
  overrides.set(path,{...row.current});
 }
 return {overrides,legacyAdapter:Buffer.from(b.source,'utf8')};
}
