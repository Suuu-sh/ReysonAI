import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hands } from '../src/data.ts';
import { stage3Roots, stage3Spots, stage3Terminals, stage3Boundaries, stage3ById, stage3Families, stage3RootById } from '../src/estimated/stage3-tree.ts';
import { stage3TreeForRoot, stage3RootDescriptors } from '../src/estimated/stage3-catalog.ts';
import { createStage3Model, RareStage3HistoryError, stage3Samples } from '../src/estimated/stage3-model.ts';
import { callFacts } from '../src/estimated/stage3-call-ev.ts';
import { callFacts as legacyCallFacts } from '../src/estimated/call-ev.ts';
import { stage3Profile } from '../scripts/lib/stage3-profiles.mjs';
import { encodeStage3Reasons, expandStage3Reasons, STAGE3_FACT_KEYS } from '../src/estimated/stage3-reason-format.ts';
const names=['opening-ranges','preflop-ranges','multiway-responses','multiway2-responses','squeeze-responses','cold-three-bet-responses','cold-four-bet-responses'];
const datasets=Object.fromEntries(names.map(n=>[n,JSON.parse(readFileSync(new URL(`../src/estimated/${n}.json`,import.meta.url),'utf8'))]));

test('Stage3 all structural families, unique IDs, legal raise minima, no legacy reuse IDs',()=>{
 assert.equal(stage3Roots.length,58);assert.equal(stage3Spots.length,16132);assert.equal(stage3Terminals.length,18620);assert.equal(stage3Boundaries.length,51);
 assert.equal(new Set([...stage3Spots,...stage3Terminals,...stage3Boundaries].map(n=>n.id)).size,stage3Spots.length+stage3Terminals.length+stage3Boundaries.length);
 const counts=[1920,3912,1170,420,4836,3874];
 stage3Families.forEach((f,i)=>assert.equal(stage3Spots.filter(n=>n.family===f).length,counts[i]));
 for(const n of stage3Spots){ assert(n.id.startsWith('s3_'));assert.equal(n.pending_actors[0],n.hero);assert.equal(n.total_pot_after_call_bb,n.pot_bb+n.cost_to_call_bb);
  for(const a of ['squeeze','four_bet','all_in'])if(n.legal_actions.includes(a)){assert(n.action_sizes_bb[a]>=n.minimum_raise_to_bb);assert(n.action_sizes_bb[a]<=100);}
  assert(n.live_participants.includes(n.hero));assert(n.participants.length<=6);
 }
});
test('lightweight root expansion matches complete offline catalog exactly',()=>{
 assert.equal(stage3RootDescriptors.length,58);
 for(const root of stage3Roots){const partial=stage3TreeForRoot(root.id);assert.deepEqual(partial.spots,stage3Spots.filter(n=>n.root_id===root.id));}
});
test('new outsider fold boundaries preserve existing Stage2 regime and exclude any second entrant',()=>{
 for(const root of stage3Roots.filter(r=>!r.rare_eligible)){
  const n=stage3ById.get(root.first_decision_id);assert.equal(n.hero,root.entrant);assert.equal(n.source_factors[n.hero].length,0);
  const b=stage3Boundaries.find(b=>b.parent_id===n.id);assert.equal(b.target_id,root.fold_boundary_id);
  for(const child of stage3Spots.filter(s=>s.root_id===root.id&&s.parent_id)){
    const unknown=child.history.filter(a=>!a.forced&&!root.participants.includes(a.seat));assert.equal(unknown.length,0);
  }
 }
});
test('rare threshold uses ratio units, exact sources, and rigorous legal-deal upper bound',()=>{
 const m=createStage3Model(datasets),rare=stage3Roots.filter(r=>r.rare_eligible);
 assert.equal(rare.length,7);
 for(const root of rare.filter(r=>r.family==='three_callers'))assert.deepEqual(m.rootEvidence(root).known.map(item=>item.factors[0].dataset),['opening-ranges','preflop-ranges','multiway-responses','multiway2-responses']);
 const max=rare.map(r=>m.rootEvidence(r)).sort((a,b)=>b.joint_reach_upper_bound-a.joint_reach_upper_bound)[0];
 assert(Math.abs(max.independent_product-3.0568846713232764e-6)<1e-18);
 assert(Math.abs(max.joint_reach_upper_bound-4.9833809564528886e-6)<1e-18);
 assert(Math.abs(max.random_tuple_disjoint_probability-0.6134158110800204)<1e-15);
 assert(Math.abs(max.joint_reach_upper_bound*100-0.0004983380956452889)<1e-15);
 for(const root of rare){const e=m.rootEvidence(root);assert.equal(e.rare,true);assert.equal(e.exact_joint_reach,null);assert(e.joint_reach_upper_bound<0.0001);assert.throws(()=>m.context(stage3ById.get(root.first_decision_id)),RareStage3HistoryError);}
 const four=m.rootEvidence(rare.find(r=>r.family==='four_callers'));assert.equal(four.independent_product,null);assert.equal(four.unresolved.length,1);
 const fourthSource=four.unresolved[0].factors[0];assert.equal(fourthSource.dataset,'stage3-responses');assert(stage3ById.has(fourthSource.spot_id));
});
test('Stage3 EQR preserves old law at2-4 players, extends exponent to5-6, all-in always1',()=>{
 for(const opponents of [['UTG'],['UTG','HJ'],['UTG','HJ','CO'],['UTG','HJ','CO','SB'],['UTG','HJ','CO','SB','BB']])for(const hand of hands){
  const c={node:{bet_level:3},input:{hero:'BTN',opponents,cost_to_call:10,total_pot_after_call:40,all_in:false}};
  const f=callFacts(c,hand,0.5);assert(Number.isFinite(f.call_ev_bb));
  if(opponents.length<=3)assert.deepEqual(f,legacyCallFacts(c,hand,0.5));
  assert.equal(callFacts({...c,input:{...c.input,all_in:true}},hand,0.5).eqr,1);
 }
});
test('explicit Stage3 profiles are integer hand-group candidates and samples are unchanged',()=>{
 for(const level of [2,3,4,5])for(const hand of hands){const p=stage3Profile({...stage3Spots[0],bet_level:level},hand);assert(Number.isInteger(p.call));assert(Number.isInteger(p.aggressive));assert(p.call+p.aggressive<=100);assert.equal(stage3Samples({bet_level:level}),level===5?20000:12000);}
});
test('compact Stage3 reasons preserve169hand facts including squeeze and placeholder facts',()=>{
 const saved={spot_id:'s3_fixture',source_fingerprint:'a'.repeat(64),spot:{},hands:hands.map(hand=>({hand,unreachable_reason:'No saved support.'}))};
 const compact=encodeStage3Reasons(saved),expanded=expandStage3Reasons(compact);assert.equal(Object.keys(expanded.hands).length,169);assert.equal(STAGE3_FACT_KEYS.length,13);
 for(const hand of hands){assert.equal(expanded.hands[hand].facts.squeeze_pct,0);assert.equal(expanded.hands[hand].facts.fold_pct,100);assert.equal(expanded.hands[hand].facts.raise_to_size_bb,null);}
});

test('rare pruning is not an unconditional family exemption when saved source support rises',()=>{
 const broad=Object.fromEntries(Object.entries(datasets).map(([name,data])=>[name,{...data,spots:data.spots.map(spot=>({...spot,hands:spot.hands.map(row=>({...row,open:100,call:100}))}))}]));
 const m=createStage3Model(broad),root=stage3Roots.find(r=>r.family==='three_callers');
 assert.equal(m.rootEvidence(root).rare,false);assert.equal(m.rootEvidence(root).independent_product,1);assert.equal(m.rootEvidence(root).joint_reach_upper_bound,1);
});

test('audit rejects equities for omitted histories and unknown joint-defense evidence',async()=>{
 const {auditStage3Estimates}=await import('../src/estimated/stage3-audit.ts');
 const {STAGE3_VERSION,STAGE3_SEED}=await import('../src/estimated/stage3-model.ts');
 const {rakeMetadata}=await import('../src/estimated/rake.ts');
 const sources={...datasets,'continuation-responses':JSON.parse(readFileSync(new URL('../src/estimated/continuation-responses.json',import.meta.url),'utf8'))};
 const families=['three_callers','four_callers'],count=stage3Spots.filter(n=>families.includes(n.family)).length;
 const data={metadata:{schema_version:'1.0',storage:'reachable-nonrare-only',strategy_type:'ai_estimate_not_gto',game:'6max Cash / No-Limit Texas Holdem',effective_stack_bb:100,open_size_bb:2.5,ante_bb:0,rake:rakeMetadata,families,legal_actions:['fold','call','squeeze','four_bet','all_in']},catalog_spot_count:count,omitted_rare_count:count,omitted_unreachable_count:0,spot_count:0,hand_classes_per_spot:169,entry_count:0,spots:[]};
 const table={version:STAGE3_VERSION,seed:STAGE3_SEED,spots:{},joint_defense:{}};
 assert.deepEqual(auditStage3Estimates(data,sources,table,{allowPartial:true}).findings,[]);
 const rareId=stage3Spots.find(n=>n.family==='three_callers').id;
 const extra=auditStage3Estimates(data,sources,{...table,spots:{[rareId]:{}}},{allowPartial:true});
 assert(extra.findings.some(f=>f.check==='call-equity-coverage'&&f.severity==='error'));
 const unknown=auditStage3Estimates(data,sources,{...table,joint_defense:{'unknown:event':{}}},{allowPartial:true});
 assert(unknown.findings.some(f=>f.check==='joint-defense-coverage'&&f.severity==='error'));
});

test('pause checks run with zero newly computed equities, including fully cached passes',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {stage3PauseCheckpoint,STAGE3_PAUSE_CODE}=await import('../scripts/lib/stage3-checkpoint.mjs');
 const directory=mkdtempSync(join(tmpdir(),'stage3-pause-')),pauseFile=join(directory,'pause');
 try{stage3PauseCheckpoint({pauseFile,computed:0});writeFileSync(pauseFile,'pause\n');assert.throws(()=>stage3PauseCheckpoint({pauseFile,computed:0}),e=>e.code===STAGE3_PAUSE_CODE);rmSync(pauseFile);
 stage3PauseCheckpoint({computed:64,checkpointLimit:64,equityCheckpoint:false});assert.throws(()=>stage3PauseCheckpoint({computed:64,checkpointLimit:64,equityCheckpoint:true}),e=>e.code===STAGE3_PAUSE_CODE);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('partial Stage3 coverage counts terminals only inside the selected root',async()=>{
 const {stage3Coverage}=await import('../src/estimated/stage3-coverage.ts');
 const root=stage3Roots.find(root=>root.family==='three_callers');
 const partial={metadata:{families:['three_callers'],root_ids:[root.id]},spots:[]};
 const report=stage3Coverage(partial,datasets);
 assert.equal(report.roots.length,1);assert.equal(report.families[0].root_count,1);
 assert.equal(report.families[0].decision_count,stage3Spots.filter(node=>node.root_id===root.id).length);
 assert.equal(report.families[0].terminal_count,stage3Terminals.filter(node=>node.root_id===root.id).length);
 assert(report.families[0].terminal_count<stage3Terminals.filter(node=>node.family==='three_callers').length);
});
