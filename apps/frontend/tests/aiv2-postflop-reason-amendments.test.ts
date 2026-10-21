import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AMENDMENT_TARGETS, FAILED_REVIEW_SHA256, rawSha256, frequencyOnlyDigest, prepareReasonAmendment, validateReasonAmendmentResponse, buildReasonAmendment, validateReasonAmendment, validateAmendmentApproval } from "../scripts/aiv2-postflop-reason-amendments.ts";
import type { AmendmentContext, AmendmentResponse, AmendmentApproval } from "../scripts/aiv2-postflop-reason-amendments.ts";
import type { SessionMetric } from "../scripts/lib/aiv2-provider-session.ts";
import { runReasonAmendment } from "../scripts/aiv2-postflop-amend-cli.ts";
const report = readFileSync(new URL("../../../docs/qa/aiv2-postflop-checkthrough-review.json", import.meta.url),"utf8");
const source = (id:string) => readFileSync(new URL("../candidates/aiv2-postflop/llm-postflop-single-response-v1/decisions/"+id+".json",import.meta.url),"utf8");
const contexts = AMENDMENT_TARGETS.map(t=>prepareReasonAmendment(source(t.decision_id),report,"a".repeat(64)));
const metric:SessionMetric={model:"gpt-6.1-sol",effort:"medium",confirmedModel:"gpt-6.1-sol",confirmedEffort:"medium",threadId:"offline-thread",turnId:"offline-turn",attempt:1,queueMs:0,elapsedMs:1,status:"completed",transport:"pooled-app-server",processStarted:true,sessionTurn:1,promptBytes:1};
function response(c:AmendmentContext):AmendmentResponse{return{request_id:c.request_id,assessment:"reason-only",unchanged_all_frequencies:true,explanation:{text:"Corrected facts still support the saved frequencies after whole-range review.",text_ja:"レンジ全体の確認後も保存頻度は維持できると判断した。"},summary_patch:c.scope.kind==="summary"?{text:"Pocket pairs below the board ace are not overpairs.",text_ja:"盤面のAより低いポケットペアはオーバーペアではない。"}:null,combo_patches:c.scope.combos.map(combo=>({combo,mix:{...c.original.combos.find(r=>r.combo===combo)!.mix},text:"A six completes a straight; checking can retain the draw.",text_ja:"6でストレートが完成するドローをチェックで残す。"}))};}
test("only exact3 base raw bytes and unchanged failed-review report may be amended",()=>{
 assert.equal(rawSha256(report),FAILED_REVIEW_SHA256); assert.equal(contexts.length,3);
 for(const c of contexts){assert.equal(c.base.raw_file_sha256,c.target.raw_file_sha256);assert.equal(c.base.frequency_only_sha256,frequencyOnlyDigest(c.original));assert.ok(c.prompt.includes("BOTH full live ranges"));assert.ok(c.prompt.includes("new schema"));assert.ok(c.prompt.includes("complete_current_policy_and_reasons"));}
 assert.throws(()=>prepareReasonAmendment(source(AMENDMENT_TARGETS[0].decision_id)+" ",report,"a".repeat(64)),/changed/);
 assert.throws(()=>prepareReasonAmendment(source(AMENDMENT_TARGETS[0].decision_id),report+" ","a".repeat(64)),/identity changed/);
});
test("valid four-combo revision retains ALL original frequencies/policy/descendant refs and records actual provider metadata",()=>{
 const c=contexts[0],before=JSON.stringify(c.original),raw=response(c);
 // Model action-key order can differ; normalize losslessly to saved order.
 raw.combo_patches[0].mix=Object.fromEntries(Object.entries(raw.combo_patches[0].mix).reverse());
 const r=buildReasonAmendment(raw,c,metric); assert.equal(r.approval_status,"pending-independent-review");assert.equal(r.generation_mode,"post-generation-review-amendment");assert.equal(r.provenance.thread_id,"offline-thread");
 assert.equal(validateReasonAmendment(r,c),r);assert.equal(JSON.stringify(c.original),before);
 assert.deepEqual(Object.keys(r.source_response.combo_patches[0].mix),Object.keys(c.original.combos.find(row=>row.combo==="8s5s")!.mix));
 assert.throws(()=>buildReasonAmendment(raw,c,{...metric,confirmedModel:undefined}),/attestation/);
 assert.throws(()=>buildReasonAmendment(raw,c,{...metric,turnId:undefined}),/attestation/);
 const changed=structuredClone(r);changed.source_response.combo_patches[0].text="changed";assert.throws(()=>validateReasonAmendment(changed,c),/binding changed/);
});
test("scope, complete frequency confirmation, numeric mix, exactfour combos and bilingual patches fail closed",()=>{
 const c=contexts[0];
 for(const mutate of [(r:AmendmentResponse)=>r.unchanged_all_frequencies=false,r=>r.combo_patches.pop(),r=>r.combo_patches[1].combo=r.combo_patches[0].combo,r=>r.combo_patches[0].mix.check=99,r=>r.combo_patches[0].text_ja="",r=>r.summary_patch={text:"extra",text_ja:"余分"},r=>r.request_id="b".repeat(64)]){const r=response(c);mutate(r);assert.throws(()=>validateReasonAmendmentResponse(r,c));}
});
test("policy-change-required is a valid terminal outcome, never converted to an overlay or forced repair",()=>{
 const c=contexts[0],r:AmendmentResponse={...response(c),assessment:"policy-change-required",unchanged_all_frequencies:false,summary_patch:null,combo_patches:[],explanation:{text:"The draw fact requires a policy reassessment.",text_ja:"ドローの事実を踏まえ頻度の再評価が必要。"}};
 assert.equal(validateReasonAmendmentResponse(r,c),r);
 const diagnostic=buildReasonAmendment(r,c,metric);assert.equal(diagnostic.approval_status,"requires-policy-regeneration");assert.equal(validateReasonAmendment(diagnostic,c),diagnostic);
 assert.throws(()=>validateReasonAmendmentResponse({...r,unchanged_all_frequencies:true},c));
});
test("river revisions change only complete bilingual summary, never any combo or frequency",()=>{
 for(const c of contexts.slice(1)){const raw=response(c),r=buildReasonAmendment(raw,c,metric);assert.equal(r.source_response.combo_patches.length,0);assert.ok(r.source_response.summary_patch);assert.equal(validateReasonAmendment(r,c),r);
 const bad=response(c);bad.combo_patches=[response(contexts[0]).combo_patches[0]];assert.throws(()=>validateReasonAmendmentResponse(bad,c));}
});
test("render approval binds three exact raw revisions, bases and all-frequency digests; nullable reviewer model is honest",()=>{
 const revisions=contexts.map(c=>{const revision=buildReasonAmendment(response(c),c,metric);return{revision,raw_sha256:rawSha256(JSON.stringify(revision)+"\n")};});
 const approval:AmendmentApproval={schema_version:"aiv2-postflop-reason-amendment-approval-v1",approved:true,scope:"three-saved-decision-reason-only-amendments",original_failed_review_sha256:FAILED_REVIEW_SHA256,reviewer:{actor:"independent-test-reviewer",model:null,relationship:"independent-review",evidence:["Fixture-only; no actual approval receipt created."]},revisions:revisions.map(({revision:r,raw_sha256})=>({revision_id:r.revision_id,revision_raw_file_sha256:raw_sha256,base_decision_id:r.base.decision_id,base_raw_file_sha256:r.base.raw_file_sha256,frequency_only_sha256:r.base.frequency_only_sha256}))};
 assert.equal(validateAmendmentApproval(approval,revisions),approval);
 for(const mutate of [(a:AmendmentApproval)=>a.reviewer.actor="generator",a=>a.revisions[0].frequency_only_sha256="0".repeat(64),a=>a.revisions[0].revision_raw_file_sha256="0".repeat(64),a=>a.revisions[1]=a.revisions[0],a=>a.reviewer.evidence=[]]){const a=structuredClone(approval);mutate(a);assert.throws(()=>validateAmendmentApproval(a,revisions));}
 const diagnostic=buildReasonAmendment({...response(contexts[0]),assessment:"policy-change-required",unchanged_all_frequencies:false,combo_patches:[]},contexts[0],metric);
 assert.throws(()=>validateAmendmentApproval(approval,[{revision:diagnostic,raw_sha256:"0".repeat(64)},...revisions.slice(1)]));
});
test("CLI refuses unlisted decisions or missing explicit confirmation before any provider startup",async()=>{
 await assert.rejects(runReasonAmendment(["--decision=unlisted","--generate"]),/outside/);
 await assert.rejects(runReasonAmendment(["--decision="+AMENDMENT_TARGETS[0].decision_id,"--generate"]),/confirm-one-decision-amendment/);
 assert.equal(rawSha256(report),FAILED_REVIEW_SHA256);
 for(const t of AMENDMENT_TARGETS)assert.equal(rawSha256(source(t.decision_id)),t.raw_file_sha256);
});
