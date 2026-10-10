import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import contract from './fixtures/adopted-hu-v7-contract.json' with { type:'json' };
import candidate from './fixtures/adopted-hu-v7-candidate-contract.json' with { type:'json' };
import { moduleDigest,declarationDigests,digest,engineCases,uiCases } from './helpers/hu-v7-parity.mjs';
import * as engine from '../scripts/postflop-ai/engine.ts';
import * as ui from '../src/estimated/postflop-trial.ts';
import { config,loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor } from '../scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy } from '../scripts/postflop-ai/later-policy.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { explainCombo } from '../scripts/postflop-ai/explain.mjs';
import { flopUiComboFactsCanonical } from '../scripts/postflop-ai/flop-ui-facts.ts';
import { flopRangeFacts } from '../scripts/postflop-ai/range-facts.ts';
import { explainLaterCombo } from '../scripts/postflop-ai/explain-later.ts';
import { checkFlopBalance,checkLaterBalance } from '../scripts/postflop-ai/balance.mjs';
import { flopNodesCanonical } from '../scripts/postflop-ai/views.ts';
import { promptFor,promptForLater } from '../scripts/postflop-ai/generate.mjs';
import { POSTFLOP_SPOTS,spotById } from '../scripts/postflop-ai/spots.ts';
import { captureAuditIdentity, AUDIT_REPOSITORY } from '../scripts/postflop-ai/audit-identity.mjs';
const text=path=>readFileSync(resolve(AUDIT_REPOSITORY,path),'utf8');

test('adopted HU-v7: historical executable pins remain intact and candidate deltas are explicitly bounded',()=>{
  assert.equal(contract.baseline,'7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5');
  assert.equal(candidate.status,'proposed_candidate_pending_independent_review');
  assert.equal(candidate.baseline_commit,contract.baseline);
  const expectedCandidateModules=[
    'apps/frontend/scripts/postflop-ai/balance.mjs',
    'apps/frontend/scripts/postflop-ai/defence.ts',
    'apps/frontend/scripts/postflop-ai/explain-later.ts',
    'apps/frontend/scripts/postflop-ai/explain.mjs',
    'apps/frontend/scripts/postflop-ai/flop-ui-facts.ts',
    'apps/frontend/scripts/postflop-ai/generate.mjs',
    'apps/frontend/scripts/postflop-ai/later-policy.ts',
    'apps/frontend/scripts/postflop-ai/policy.ts',
    'apps/frontend/scripts/postflop-ai/range-facts.ts',
    'apps/frontend/scripts/postflop-ai/views.ts',
  ];
  assert.deepEqual(Object.keys(candidate.changed_modules).sort(),expectedCandidateModules);
  for(const [path,expected] of Object.entries(contract.files)){
    let source=text(path);
    for(const guard of contract.validationOnlyAdapters[path]??[]){
      assert.equal(source.split(guard).length,2,`${path}: exact added validation guard must occur once`);
      source=source.replace(guard,'');
    }
    const proposed=candidate.changed_modules[path];
    if(!proposed){assert.equal(moduleDigest(source,path),expected,path);continue;}
    assert.equal(proposed.baseline_executable_ast_sha256,expected,`${path}: immutable historical pin`);
    assert.equal(moduleDigest(source,path),proposed.candidate_executable_ast_sha256,`${path}: proposed candidate executable binding`);
    const actual=declarationDigests(text(path),path);
    assert.deepEqual(Object.keys(actual).sort(),proposed.candidate_declaration_names,`${path}: candidate declaration inventory`);
    for(const [name,baselineSha] of Object.entries(proposed.baseline_declarations)){
      if(Object.hasOwn(proposed.changed_declarations,name)){
        assert.equal(proposed.changed_declarations[name].baseline_sha256,baselineSha,`${path}/${name}: historical declaration`);
        assert.equal(actual[name],proposed.changed_declarations[name].candidate_sha256,`${path}/${name}: candidate declaration`);
      } else assert.equal(actual[name],baselineSha,`${path}/${name}: unchanged historical declaration`);
    }
    for(const [name,binding] of Object.entries(proposed.changed_declarations)){
      if(binding.baseline_sha256===null)assert.equal(actual[name],binding.candidate_sha256,`${path}/${name}: explicit candidate addition`);
    }
  }
});
test('adopted HU-v7: all extracted chip/path helpers and isolated classifier bodies are exact7c2',()=>{
  const path='apps/frontend/scripts/postflop-ai/hu-v7-street-state.ts';
  assert.deepEqual(declarationDigests(text(path),path),contract.helperDigests);
  const classifier='apps/frontend/scripts/postflop-ai/hu-hand-tier.ts';
  assert.deepEqual(declarationDigests(text(classifier),classifier),contract.classifier);
});
test('adopted HU-v7: completion extension inverses to immutable 6566786a and its HU/MW3 gates are explicit',()=>{
  const path='apps/frontend/src/estimated/postflop-trial.ts', actual=declarationDigests(text(path),path);
  const proposed=candidate.completion_extension;
  assert.equal(proposed.baseline_commit,contract.completion_baseline);
  assert.equal(actual.flopSpotFor,contract.completion.flopSpotFor,'unchanged saved-spot resolution');
  assert.equal(actual.completedFlopContext,proposed.candidate_declaration_sha256,'candidate declaration is separately bound');
  const source=text(path);
  assert.equal(source.split(proposed.candidate_expression).length,2,'only the HU pilot-availability condition is extended');
  const historical=source.replace(proposed.candidate_expression,proposed.historical_expression);
  assert.equal(declarationDigests(historical,path).completedFlopContext,contract.completion.completedFlopContext,
    'inverse substitution must reproduce the immutable historical declaration digest');
});

test('adopted HU-v7 candidate preserves direct historical standard-path outputs',()=>{
  const expected=candidate.standard_path_output_baseline;
  const inputs=loadInputs(expected.spot), flopPolicy=referencePolicyFor(inputs.spot.tree), laterPolicy=referenceLaterPolicy();
  const flop=parseCards(expected.board,3);
  const outputs={
    standard_flop_prompt:digest(promptFor(inputs)),
    standard_later_prompt:digest(promptForLater(inputs)),
    standard_4bp_flop_prompt:digest(promptFor(loadInputs('HJ_open_BTN_4bp_call'))),
    standard_limp_later_prompt:digest(promptForLater(loadInputs('SB_limp_BB_iso_call'))),
    flop_nodes_all:digest(flopNodesCanonical(inputs,flopPolicy,flop)),
    flop_explain_first:digest(explainCombo({boardCards:flop,node:'btn_first',cards:'AsKc',inputs,policy:flopPolicy})),
    flop_explain_facing:digest(explainCombo({boardCards:flop,node:'bb_vs_75',cards:'QsQc',prev:'bet75',inputs,policy:flopPolicy})),
    flop_ui_facts:digest(flopUiComboFactsCanonical({boardCards:flop,node:'bb_vs_75',cards:'QsQc',history:['bet75'],policy:flopPolicy,inputs})),
    flop_range_facts:digest(flopRangeFacts({inputs,policy:flopPolicy,laterPolicy,boardCards:flop,node:'bb_vs_75',prev:'bet75'})),
    turn_explanation:digest(explainLaterCombo({inputs,flopPolicy,laterPolicy,flop:expected.board,flopActions:'check',turn:expected.turn,turnActions:'',river:'',riverActions:'',cards:'QsQc'})),
    river_explanation:digest(explainLaterCombo({inputs,flopPolicy,laterPolicy,flop:expected.board,flopActions:'check',turn:expected.turn,turnActions:'check,check',river:expected.river,riverActions:'',cards:'QsQc'})),
    standard_flop_balance:digest(checkFlopBalance(inputs,flopPolicy)),
    standard_later_balance:digest(checkLaterBalance(inputs,flopPolicy,laterPolicy)),
  };
  assert.equal(inputs.fingerprint,expected.input_fingerprint,'unchanged historical scenario inputs');
  assert.equal(digest(inputs.seatRows),expected.seat_rows_sha256,'unchanged saved range rows');
  assert.deepEqual(outputs,expected.sha256);
});
test('adopted HU-v7:425 deterministic engine scenarios across all85 saved spots match7c2',()=>{
  const results=engineCases(engine,POSTFLOP_SPOTS,config);
  assert.equal(results.length,425);assert.equal(digest(results),contract.engine.sha256);
  for(const row of results){assert.ok(Number.isFinite(row.pot));assert.ok(Object.values(row.stacks).every(x=>x>=0));assert.ok(row.log.every(entry=>!('observation' in entry)));}
});
test('adopted HU-v7: all85 flop/turn/river UI replay, labels, low-SPR and illegal suffix cases match7c2',()=>{
  const results=uiCases(ui,POSTFLOP_SPOTS);assert.equal(results.length,85);assert.equal(digest(results),contract.ui.sha256);
});
test('adopted HU-v7: bet33/call then bet125/call retains turn_ip_vs_125 rather than v10 bet75 rewrite',()=>{
  const spot=spotById('BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call'),table=engine.createTable(spot);
  const flop=['bet33','call'];engine.playFlop(table,spot.tree,()=>flop.shift(),config);
  const turn=['bet125','call'];engine.playLaterStreetsWithPolicy(table,[48,21,2],[30,36],()=>turn.shift(),config);
  assert.deepEqual(table.path.turn,['bet125','call']);
  assert.equal(table.log.at(-1).node,'turn_ip_vs_125');assert.equal(table.pot,202.5);
  assert.deepEqual(table.stacks,{BB:0,SB:0});
  const start=ui.laterStart(['bet33','call'],spot);
  assert.equal(ui.laterDecision('turn',['bet125'],start,spot).node,'turn_ip_vs_125');
});
test('adopted HU-v7: active numeric closure cannot select dormant observable-v10 helpers or UI routing',()=>{
  const sources=captureAuditIdentity().sources.map(item=>item.path);
  assert.ok(sources.includes('apps/frontend/scripts/postflop-ai/hu-v7-street-state.ts'));
  assert.ok(sources.includes('apps/frontend/scripts/postflop-ai/street-state.mjs'));
  for(const name of ['observable-actions.mjs','observable-view-paths.mjs','exact-river-call-ev.mjs'])assert.ok(!sources.some(path=>path.endsWith('/'+name)),name);
  assert.ok(!sources.includes('apps/frontend/src/estimated/postflop-trial.ts'));
});
