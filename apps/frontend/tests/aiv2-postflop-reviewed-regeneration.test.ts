import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { CONCRETE_COMBOS } from "../scripts/aiv2-preflop.ts";
import { buildPostflopArtifact, postflopHash } from "../scripts/aiv2-postflop.ts";
import { REGEN_STAGES, REGEN_ROOT_PARENT, reviewedRegenerationPlan, prepareReviewedRegeneration, buildRegenerationRecord, validateSavedRegeneration, runReviewedRegeneration } from "../scripts/aiv2-postflop-reviewed-regeneration.ts";
import type { ReviewedRegenerationContext } from "../scripts/aiv2-postflop-reviewed-regeneration.ts";
import type { SessionMetric } from "../scripts/lib/aiv2-provider-session.ts";
const metric:SessionMetric={model:"gpt-6.1-sol",effort:"medium",confirmedModel:"gpt-6.1-sol",confirmedEffort:"medium",threadId:"offline-fixture-thread",turnId:"offline-fixture-turn",attempt:1,queueMs:0,elapsedMs:1,status:"completed",transport:"pooled-app-server",processStarted:true,sessionTurn:1,promptBytes:0};
function fixture(context:ReviewedRegenerationContext,checkPct:number){
 const actions=context.input.actor==="BTN"?"bet66":"bet33";
 const response={decision_id:context.decision_id,range_summary:{text:"Offline test fixture only.",text_ja:"オフラインテスト用で戦略ではない。"},groups:[{combos:CONCRETE_COMBOS.filter(c=>context.input.ranges[context.input.actor][c.combo]>0).map(c=>c.combo),mix:Object.fromEntries(context.input.actor?["check","bet33","bet66","bet100","bet125"].map(a=>[a,a==="check"?checkPct:a===actions?100-checkPct:0]):[]),text:"Offline fixture, not generated strategy.",text_ja:"実生成戦略ではないテスト用説明。"}]};
 const artifact=buildPostflopArtifact(context.input,response,context.plan.implementation_hash), raw=JSON.stringify(artifact)+"\n",record=buildRegenerationRecord(context,raw,metric);
 for(const [path,text]of[[context.artifact_path,raw],[context.record_path,JSON.stringify(record)+"\n"]]){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text,{flag:"wx"});}
 return{artifact,raw,record};
}
test("plan bound to terminal policy-change diagnostic and exact three staged replacements only",()=>{
 const shared=reviewedRegenerationPlan();assert.equal(shared.diagnostic.source_response.assessment,"policy-change-required");assert.equal(shared.plan.model,"gpt-6.1-sol");assert.equal(shared.plan.effort,"medium");assert.equal(shared.plan.board_runout,"As7d2c9h3s");
 assert.deepEqual(REGEN_STAGES.map(s=>s.stage),["turn-btn","river-bb","river-btn"]);assert.equal(shared.run_id,postflopHash(shared.plan));
});
test("new turn input derived from unchanged reviewed BB check, with fresh identity and unconstrained whole-range review prompt",()=>{
 const c=prepareReviewedRegeneration("turn-btn");assert.equal(c.parent.decision_id,REGEN_ROOT_PARENT);assert.equal(c.input.actor,"BTN");assert.equal(c.input.street,"turn");assert.equal(c.input.board,"As7d2c9h");
 assert.equal(postflopHash(c.input),c.old.artifact.metadata.input_hash);assert.notEqual(c.decision_id,c.old.artifact.decision_id);assert.equal(c.prompt.includes("NOT solver/GTO proof"),true);assert.ok(c.prompt.includes("Do NOT force bluffs"));assert.ok(c.prompt.includes("Freely change all frequencies"));
 assert.ok(c.artifact_path.includes("/reviewed-regeneration/"));assert.ok(!c.artifact_path.endsWith(c.old.artifact.decision_id+".json"));
 assert.throws(()=>prepareReviewedRegeneration("all-boards" as any),/outside/);
});
test("new descendants must exist with verified receipts; old river ranges are never fallback",()=>{
 const temp=mkdtempSync(join(tmpdir(),"aiv2-regen-empty-"));try{assert.throws(()=>prepareReviewedRegeneration("river-bb",temp),/Missing NEW/);assert.throws(()=>prepareReviewedRegeneration("river-btn",temp),/Missing NEW/);}finally{rmSync(temp,{recursive:true,force:true});}
});
test("both river inputs derive sequentially from NEW parents and exact own saved-action frequency only",()=>{
 const temp=mkdtempSync(join(tmpdir(),"aiv2-regen-path-"));try{
  const turn=prepareReviewedRegeneration("turn-btn",temp),first=fixture(turn,50);
  const bb=prepareReviewedRegeneration("river-bb",temp);assert.equal(bb.parent.decision_id,first.artifact.decision_id);assert.equal(bb.input.history.at(-1)?.decision_id,first.artifact.decision_id);assert.equal(bb.input.history.at(-1)?.policy_hash,first.artifact.metadata.policy_hash);
  assert.equal(bb.input.board,"As7d2c9h3s");assert.equal(bb.input.actor,"BB");
  const actorCombo=Object.keys(bb.input.ranges.BTN).find(c=>bb.input.ranges.BTN[c]>0)!;assert.equal(bb.input.ranges.BTN[actorCombo],turn.input.ranges.BTN[actorCombo]*.5);
  const second=fixture(bb,25),btn=prepareReviewedRegeneration("river-btn",temp);assert.equal(btn.parent.decision_id,second.artifact.decision_id);assert.equal(btn.input.actor,"BTN");assert.equal(btn.input.history.at(-1)?.decision_id,second.artifact.decision_id);
  const oppCombo=Object.keys(btn.input.ranges.BB).find(c=>btn.input.ranges.BB[c]>0)!;assert.equal(btn.input.ranges.BB[oppCombo],bb.input.ranges.BB[oppCombo]*.25);assert.deepEqual(btn.input.ranges.BTN,bb.input.ranges.BTN);
  const final=fixture(btn,100);assert.equal(validateSavedRegeneration(final.record,final.raw,btn).decision_id,btn.decision_id);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test("zero-reach check terminates this selected regeneration path; it must not fabricate old continuation ranges",()=>{
 const temp=mkdtempSync(join(tmpdir(),"aiv2-regen-zero-"));try{fixture(prepareReviewedRegeneration("turn-btn",temp),0);assert.throws(()=>prepareReviewedRegeneration("river-bb",temp),/zero reached range/);}finally{rmSync(temp,{recursive:true,force:true});}
});
test("immutable record binds exact prompt/schema/parent/content and actual confirmed model metadata",()=>{
 const temp=mkdtempSync(join(tmpdir(),"aiv2-regen-proof-"));try{
  const c=prepareReviewedRegeneration("turn-btn",temp),{raw,record}=fixture(c,50);assert.equal(validateSavedRegeneration(record,raw,c).decision_id,c.decision_id);
  assert.throws(()=>buildRegenerationRecord(c,raw,{...metric,confirmedModel:undefined}),/attestation/);assert.throws(()=>buildRegenerationRecord(c,raw,metric,"different prompt"),/Unbound/);
  for(const mutate of [(r:any)=>r.parent.policy_hash="0".repeat(64),(r:any)=>r.request.output_schema={type:"string"},(r:any)=>r.original_raw_file_sha256="0".repeat(64)]){
   const r=structuredClone(record);mutate(r);const{record_id,...body}=r;r.record_id=postflopHash(body);assert.throws(()=>validateSavedRegeneration(r,raw,c));
  }
  assert.throws(()=>validateSavedRegeneration(record,raw+" ",c));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test("CLI refuses unapproved stage or missing explicit consent without starting a provider",async()=>{
 await assert.rejects(runReviewedRegeneration(["--stage=all-boards","--generate"]),/Unapproved/);
 await assert.rejects(runReviewedRegeneration(["--stage=turn-btn","--generate"]),/confirm-one-reviewed-decision/);
 const old=prepareReviewedRegeneration("turn-btn").old;assert.equal(postflopHash(JSON.parse(readFileSync(new URL("../candidates/aiv2-postflop/llm-postflop-single-response-v1/decisions/"+old.artifact.decision_id+".json",import.meta.url),"utf8"))),postflopHash(old.artifact));
});
