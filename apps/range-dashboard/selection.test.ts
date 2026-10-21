import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateSelection,RUN_ID,REVIEW_FILE } from './selection.ts';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const plan=JSON.parse(await readFile(new URL('../frontend/candidates/aiv2-postflop/llm-postflop-single-response-v1/reviewed-regeneration/'+RUN_ID+'/run-plan.json',import.meta.url),'utf8'));
const old=['1ae33fd719b2a4c8186c3a241d86f301216326384b9b83e82154db305a6ed028','52ef028be959308231f9123c14d061d783a33c8db3e987246a8f28f03e767b4e'];
const replaced=['db36b233b2a0234cc36b87999597bc64c53e80525c99f604889faa38870ec445','6f9b28e4a8b7e1c30d4f4a1da188d013e2ca9528bb40b02f67676edbccfd5af2','744fb2ef8bb0a5fd9e0f5d5a59538eddfafdd7545538dafda31f242432353e7f'];
const slots=['flop-btn','turn-bb','turn-btn','river-bb','river-btn'];
function successor(parent,nextCard){
 const x=parent.input,actor=x.actor,opponent=actor==='BTN'?'BB':'BTN',ended=Boolean(nextCard),board=x.board+(nextCard||'');
 const ranges=structuredClone(x.ranges);for(const [combo,weight] of Object.entries(ranges[actor]))ranges[actor][combo]=weight*((parent.combos.find(c=>c.combo===combo)?.mix.check||0)/100);
 for(const seat of ['BTN','BB'])for(const combo of Object.keys(ranges[seat]))if(board.includes(combo.slice(0,2))||board.includes(combo.slice(2)))ranges[seat][combo]=0;
 return {...x,actor:ended?'BB':opponent,street:ended?(x.street==='flop'?'turn':'river'):x.street,board,committed_bb:ended?{BTN:0,BB:0}:x.committed_bb,last_full_raise_bb:ended?1:x.last_full_raise_bb,raises_this_street:ended?0:x.raises_this_street,raise_reopened:true,history:[...x.history,{street:x.street,board:x.board,seat:actor,action:'check',paid_bb:0,to_bb:0,decision_id:parent.decision_id,policy_hash:parent.metadata.policy_hash}],ranges};
}
test('atomic reviewed five-node selection applies only exact pins and independent approval; mismatch keeps fallback',()=>{
 const initial={spot_id:'BTN_open_BB_call',street:'flop',board:'As7d2c',actor:'BTN',ip:'BTN',oop:'BB',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},committed_bb:{BTN:0,BB:0},last_full_raise_bb:1,raises_this_street:0,raise_reopened:true,history:[{street:'flop',seat:'BB',action:'check'}],ranges:{BTN:{AhAd:.5,KhKd:.8},BB:{AhAd:.7,KhKd:.6}}};
 const entries=[];
 for(let i=0;i<5;i++){
  const input=i?successor(entries[i-1].artifact,i===1?'9h':i===3?'3s':null):initial;
  const artifact={decision_id:i<2?old[i]:hash(slots[i]),input,legal_actions:[{action:'check',paid_bb:0,to_bb:0,all_in:false}],combos:[{combo:'AhAd',mix:{check:50}},{combo:'KhKd',mix:{check:75}}],metadata:{implementation_hash:plan.implementation_hash,input_hash:hash(input),response_hash:hash('response'+i),policy_hash:hash('policy'+i)}};
  const e={artifact,rawHash:hash(artifact),revision:null,revisionRawHash:null,originalRawHash:hash('original'+i)};
  if(i>=2){const p=entries[i-1],body={schema_version:'aiv2-postflop-generation-revision-v1',run_id:RUN_ID,stage:slots[i],original_decision_id:replaced[i-2],original_raw_file_sha256:e.originalRawHash,new_decision_id:artifact.decision_id,new_raw_file_sha256:e.rawHash,failed_review_raw_sha256:plan.review_raw_sha256,implementation_hash:plan.implementation_hash,input_hash:artifact.metadata.input_hash,response_hash:artifact.metadata.response_hash,policy_hash:artifact.metadata.policy_hash,parent:{decision_id:p.artifact.decision_id,raw_sha256:p.rawHash,policy_hash:p.artifact.metadata.policy_hash,action:'check',next_card:i===3?'3s':null},provider:{confirmed_model:'gpt-6.1-sol',confirmed_effort:'medium',thread_id:'fixture',turn_id:'fixture'}};e.revision={...body,record_id:hash(body)};e.revisionRawHash=hash(e.revision);}
  entries.push(e);
 }
 const artifacts=entries.map((e,i)=>({slot:slots[i],source:i<2?'original':'reviewed-regeneration',decision_id:e.artifact.decision_id,raw_file_sha256:e.rawHash,revision_raw_file_sha256:e.revisionRawHash}));
 const planHash=hash(plan),report={schema_version:'aiv2-postflop-reviewed-regeneration-review-v1',approved:true,scope:'dashboard-data-content-only',run_id:RUN_ID,run_plan_raw_file_sha256:planHash,reviewer:{actor:'independent-reviewer',model:null,relationship:'independent-review',evidence:['Scoped content review']},artifacts,findings:[]},reportHash=hash(report);
 const selection={schema_version:'aiv2-postflop-active-selection-v1',run_id:RUN_ID,run_plan_raw_file_sha256:planHash,review:{file:REVIEW_FILE,raw_file_sha256:reportHash},artifacts};
 const apply=(s=selection,r=report,e=entries)=>validateSelection(s,r,reportHash,plan,planHash,e,plan.review_raw_sha256);
 const before=JSON.stringify(entries);assert.equal(apply().production_approved,false);assert.equal(JSON.stringify(entries),before);
 assert.throws(()=>apply(selection,{...report,approved:false}));assert.throws(()=>apply({...selection,artifacts:[...artifacts,artifacts[0]]}));
 const changed=structuredClone(entries);changed[3].artifact.input.ranges.BTN.AhAd+=.01;assert.throws(()=>apply(selection,report,changed));
 const missing=structuredClone(entries);missing[4].revisionRawHash=hash('changed');assert.throws(()=>apply(selection,report,missing));
 assert.throws(()=>apply({...selection,review:{file:REVIEW_FILE,raw_file_sha256:hash('stale')}}));
});
