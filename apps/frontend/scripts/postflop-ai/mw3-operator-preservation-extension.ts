// Second closed preservation-only authority. The original review and its validator
// remain unchanged; their adapter bytes are replayed from a separately bound snapshot.
import {createHash} from 'node:crypto';
import proposal from '../../../../configs/source-identity-mw3-operator-preservation.json' with {type:'json'};
import review from '../../../../configs/source-identity-mw3-operator-preservation.review.json' with {type:'json'};
import baseline from '../../docs/mw3-source-identity/operator-preservation-adapter-baseline.json' with {type:'json'};
export const OPERATOR_PRESERVATION_IMPORTED={proposal,review,baseline};
export const OPERATOR_PRESERVATION_PATHS=Object.freeze(['apps/frontend/scripts/ci/mw3-local-d1-oracle.ts','apps/frontend/scripts/verify-preflop-local-d1.ts']);
export const OPERATOR_PRESERVATION_EXTRA_PATHS=Object.freeze([
 'apps/frontend/docs/mw3-source-identity/operator-preservation-adapter-baseline.json',
 'apps/frontend/scripts/postflop-ai/mw3-operator-preservation-extension.ts',
 'configs/source-identity-mw3-operator-preservation.json',
 'configs/source-identity-mw3-operator-preservation.review.json',
]);
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),SHA=/^[a-f0-9]{64}$/;
const fail=(reason:string):never=>{throw Error('Unapproved or changed MW3 archive source identity: operator preservation extension: '+reason);};
const keys=(value:any,names:string[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||!same(Object.keys(value).sort(),[...names].sort()))fail('closed shape');};
type Pin={path:string;bytes:number;sha256:string};
type Input={proposal:Buffer;review:Buffer;baseline:Buffer;priorProposal:Buffer;priorReview:Buffer;adapter:Buffer;validator:Buffer};
export function verifyOperatorPreservationExtension(input:Input){
 let p:any,r:any,b:any,prior:any,priorReview:any;
 try{p=JSON.parse(input.proposal.toString('utf8'));r=JSON.parse(input.review.toString('utf8'));b=JSON.parse(input.baseline.toString('utf8'));prior=JSON.parse(input.priorProposal.toString('utf8'));priorReview=JSON.parse(input.priorReview.toString('utf8'));}catch{fail('malformed JSON');}
 keys(p,['schema_version','kind','status','scope','author_task','rows']);
 keys(r,['schema_version','kind','status','scope','reviewer','reviewer_task','reviewer_model','proposal_sha256','adapter_sha256','validator_sha256','baseline_snapshot_sha256','prior_proposal_sha256','prior_review_sha256','notes']);
 keys(b,['schema_version','kind','path','source']);
 const scope='operator-batch-verification-preservation-only-no-numerical-or-gto-renewal';
 if(p.schema_version!==1||p.kind!=='mw3-operator-preservation-extension-proposal'||p.status!=='source-only-proposal'||p.scope!==scope||p.author_task!=='/root/parallel_safety_review'||!Array.isArray(p.rows)||p.rows.length!==2)fail('closed proposal');
 if(r.schema_version!==1||r.kind!=='mw3-operator-preservation-extension-review'||r.status!=='approved'||r.scope!==scope||typeof r.reviewer!=='string'||!r.reviewer.trim()||typeof r.reviewer_task!=='string'||!r.reviewer_task.trim()||r.reviewer_task===p.author_task||r.reviewer_model!=='not-exposed'||!Array.isArray(r.notes)||!r.notes.length||r.notes.some((v:unknown)=>typeof v!=='string'||!v.trim()))fail('independent review');
 for(const[key,bytes]of [['proposal_sha256',input.proposal],['adapter_sha256',input.adapter],['validator_sha256',input.validator],['baseline_snapshot_sha256',input.baseline],['prior_proposal_sha256',input.priorProposal],['prior_review_sha256',input.priorReview]]as const)if(!SHA.test(r[key])||r[key]!==sha(bytes))fail('exact byte binding: '+key);
 if(b.schema_version!==1||b.kind!=='mw3-operator-preservation-prior-adapter-bytes'||b.path!=='apps/frontend/scripts/postflop-ai/mw3-manifest-source-identity.ts'||typeof b.source!=='string'||sha(b.source)!==priorReview.adapter_sha256)fail('prior adapter snapshot');
 if(!Array.isArray(prior.rows)||prior.rows.length!==2)fail('prior closed rows');
 const overrides=new Map<string,Pin>();
 for(const[index,row]of p.rows.entries()){
  keys(row,['classification','prior','current']);keys(row.prior,['path','bytes','sha256']);keys(row.current,['path','bytes','sha256']);
  const path=OPERATOR_PRESERVATION_PATHS[index];
  if(row.classification!=='operator-preservation-extension'||!same(row.prior,prior.rows[index]?.current)||row.prior.path!==path||row.current.path!==path||!SHA.test(row.current.sha256)||!Number.isSafeInteger(row.current.bytes)||row.current.bytes<1||row.current.sha256===row.prior.sha256)fail('closed prior/current pin');
  overrides.set(path,{...row.current});
 }
 return {overrides,priorAdapter:Buffer.from(b.source,'utf8')};
}
