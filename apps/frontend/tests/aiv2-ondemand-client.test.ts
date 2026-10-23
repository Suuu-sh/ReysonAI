import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hands } from "../src/data.ts";
import { browsePath,browseActions,validBoard,savedSceneModel,onDemandRequest } from "../src/estimated/aiv2-ondemand-client.ts";
import type { Capability,SavedResult } from "../src/estimated/aiv2-ondemand-client.ts";
const cap:Capability={enabled:true,revision:"r",implementationHash:"i",sourceHash:"s",limits:{jobsPerUserDay:3,maxProviderCalls:8}};
function result():SavedResult{return {status:"generated",proof:{revision:"r",implementationHash:"i",sourceHash:"s",validatedStore:true},snapshot:{status:"generated",scene:{key:"root",hero:"BB",street:"flop",board:["As","7d","2c"],pot_bb:5.5,actions:["check","bet33","bet66","bet125"],range_reason:{en:"saved EN",ja:"保存JA"},provenance:{method:"llm-postflop-ondemand-v2",verified:true,independent_gto_approved:false},cells:hands.map(hand=>({hand,mix:{check:100,bet33:0,bet66:0,bet125:0},reach_weight:0,unreachable:true,reason:{en:"unreachable",ja:"到達不能"},overrides:[]}))}}};}
test("manual flop accepts arbitrary unique cards, rejects duplicate/invalid cards",()=>{
 assert.ok(validBoard("Kh8c3s"));assert.ok(!validBoard("AsAs2c"));assert.ok(!validBoard("As7d2x"));assert.ok(!validBoard("As7d2c8h"));
 assert.throws(()=>browsePath("AsAs2c",[]));
});
test("structural navigation starts with BB, exact sizes, legal closing/card/terminal rules",()=>{
 const root=browsePath("As7d2c",[]);assert.equal(root.actor,"BB");assert.deepEqual(browseActions(root).map(a=>a.token),["check","bet33","bet66","bet125"]);
 assert.equal(browseActions(root).find(a=>a.token==="bet66")?.paid,3.63);
 const facing=browsePath("As7d2c",["bet66"]);assert.equal(facing.actor,"BTN");assert.deepEqual(browseActions(facing).map(a=>a.token),["fold","call","raise"]);assert.equal(browseActions(facing).at(-1)?.to,9.07);
 assert.equal(browsePath("As7d2c",["check","check"]).kind,"chance");
 const turn=browsePath("As7d2c",["check","check","8h"]);assert.equal(turn.actor,"BB");assert.equal(turn.street,"turn");assert.equal(turn.board,"As7d2c8h");
 assert.equal(browsePath("As7d2c",["bet66","fold"]).kind,"terminal");
 assert.throws(()=>browsePath("As7d2c",["8h"]));assert.throws(()=>browsePath("As7d2c",["check","check","As"]));assert.throws(()=>browsePath("As7d2c",["bet75"]));assert.throws(()=>browsePath("As7d2c",["bet66","fold","check"]));
});
test("saved169 model rejects legacy methods, changed source, wrong board/path and incomplete grid",()=>{
 const value=result();assert.equal(savedSceneModel(value,cap,"As7d2c",[])?.aggregates.size,169);
 assert.deepEqual(savedSceneModel(value,cap,"As7d2c",[])?.aggregates.get("AA")?.actions,{});
 assert.throws(()=>savedSceneModel(value,{...cap,sourceHash:"other"},"As7d2c",[]));
 const legacy=result();legacy.snapshot.scene!.provenance.method="llm-postflop-single-response-v1";assert.throws(()=>savedSceneModel(legacy,cap,"As7d2c",[]));
 assert.throws(()=>savedSceneModel(value,cap,"Ks7d2c",[]));assert.throws(()=>savedSceneModel(value,cap,"As7d2c",["check"]));
 const missing=result();missing.snapshot.scene!.cells.pop();assert.throws(()=>savedSceneModel(missing,cap,"As7d2c",[]));
});
test("transport uses credentialed GET-only reads and explicit consent POST; errors fail closed",async()=>{
 const original=globalThis.fetch;const calls:Array<{url:string;init?:RequestInit}>=[];
 try{globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({enabled:true});};
 await onDemandRequest("https://api.example","status");await onDemandRequest("https://api.example","scene?board=As7d2c&path=[]");await onDemandRequest("https://api.example","requests/id");await onDemandRequest("https://api.example","requests",{board:"As7d2c",path:[],consent:true});
 assert.ok(calls.slice(0,3).every(c=>!c.init?.method&&!c.init?.body&&c.init?.credentials==="include"));assert.equal(calls[3].init?.method,"POST");assert.equal(JSON.parse(String(calls[3].init?.body)).consent,true);
 for(const [status,code] of [[401,"sign_in_required"],[429,"quota_exceeded"],[503,"disabled"]] as const){globalThis.fetch=async()=>new Response("",{status});await assert.rejects(onDemandRequest("https://api.example","status"),new RegExp(code));}
 }finally{globalThis.fetch=original;}
});
test("workspace generation is click-only and reuses project matrix and saved bilingual reasons",()=>{
 const ui=readFileSync(new URL("../src/estimated/Aiv2OnDemandWorkspace.tsx",import.meta.url),"utf8");
 assert.ok(ui.includes('onClick={()=>void generate()}'));assert.equal((ui.match(/base,"requests",/g)??[]).length,1);assert.ok(ui.includes('`requests/${encodeURIComponent(job.id)}`'));assert.ok(ui.includes("<StrategyMatrix"));assert.ok(ui.includes("ja?exact.reason.ja:exact.reason.en"));assert.ok(!ui.includes("Aiv2PostflopPilot"));assert.ok(!ui.includes("publishedDataset"));
});
