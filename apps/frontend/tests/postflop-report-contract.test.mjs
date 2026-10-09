import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadInputs, boards, config, useArtifactSource } from '../scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor } from '../scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy } from '../scripts/postflop-ai/later-policy.ts';
import { sha } from '../scripts/postflop-ai/generate.mjs';
import { simulationReport, PROFILES } from '../scripts/postflop-ai/simulation.mjs';
import { hasPostflopDeal } from '../scripts/postflop-ai/range-support.mjs';
import { isFreshSimulationReport } from '../scripts/postflop-ai/publish-d1.mjs';
import { postflopResponse, buildLaterView } from '../scripts/postflop-ai/local-view.mjs';
import { computeLaterView, computeLaterExplain } from '../src/estimated/postflop-compute.ts';
import { datasetsNeededForSpot } from '../src/estimated/postflop-browser.ts';
import { flopBaseIdentity, isFreshFlopBase } from '../scripts/postflop-ai/flop-base-core.ts';
import { buildInputs } from '../scripts/postflop-ai/browser-inputs.ts';
import { historicalHuCatalog } from './fixtures/historical-hu-catalog.mjs';

const historicalId='CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_fold_SB_4bet_BB_fold_CO_call';
const id='UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call';
const rangesFor = spot => Object.fromEntries(datasetsNeededForSpot(spot).filter(name=>name!=='hu-after-multiway-spots').map(name=>[name,JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url)))]));
function historicalInputs() {
  const spot=historicalHuCatalog.spots.find(spot=>spot.id===historicalId);
  const datasets={...rangesFor(spot),'hu-after-multiway-spots':historicalHuCatalog};
  return {inputs:buildInputs(historicalId,datasets),datasets};
}
function fixture(inputs) {
  const policy=referencePolicyFor(inputs.spot.tree), laterPolicy=referenceLaterPolicy();
  const candidate={metadata:{kind:'ai_estimate_not_gto',source_hash:inputs.fingerprint,policy_hash:sha(policy),config_version:config.version,spot:inputs.spot.id,tree:inputs.spot.tree},policy};
  const laterCandidate={metadata:{kind:'ai_estimate_not_gto',config_version:config.version,spot:inputs.spot.id,source_hash:inputs.fingerprint,flop_policy_hash:sha(policy),policy_hash:sha(laterPolicy)},policy:laterPolicy};
  const metric={mean:0,ci95:[0,0]};
  // Test-only structurally complete report. No simulated/publication claim.
  const rows=boards().filter(b=>!inputs.spot.history||hasPostflopDeal(inputs,b.cards)).flatMap(b=>PROFILES.flatMap(opponent=>[inputs.spot.ip,inputs.spot.oop].map(hero=>({board:b.id,split:b.split,opponent,hero,candidate_ev_bb:metric,baseline_ev_bb:metric,delta_bb:metric}))));
  const report=simulationReport(inputs,policy,config.samples_per_board_profile_seat,laterCandidate,rows);
  // The deferred catalog is a test-only shape fixture. It does not author reports
  // or change the adopted v7 simulator's complete-board semantics.
  const unreachable=boards().filter(b=>!rows.some(row=>row.board===b.id)).map(b=>b.id);
  if(unreachable.length)report.unreachable_boards=unreachable;
  return {candidate,laterCandidate,report};
}

test('publication freshness rejects stale defence/later/sizing/seed/samples and incomplete comparisons', () => {
  const inputs=loadInputs('BTN_open_BB_call'), {candidate,laterCandidate,report}=fixture(inputs);
  assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,report),true);
  for (const patch of [{defence_version:5},{later_policy_hash:'wrong'},{later_sizing_hash:'wrong'},{seed:'wrong'},{samples_per_board_profile_seat:1},{results:report.results.slice(1)},{results:[report.results[0],...report.results.slice(0,-1)]}]) {
    assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,{...report,...patch}),false,JSON.stringify(Object.keys(patch)));
  }
});

test('local artifact route accepts the selected HU complete pair and rejects incomplete reports', () => {
  const inputs=loadInputs(id), artifacts=fixture(inputs);
  assert.equal(artifacts.report.results.length,72);
  const ranges=rangesFor(inputs.spot);
  const previous=useArtifactSource({ranges,artifact:(_spot,kind)=>artifacts[kind]??null});
  try {
    const response=postflopResponse('/local-postflop-spot',new URLSearchParams({spot:id}));
    assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(response.body.report.results.length,artifacts.report.results.length);
    const complete=artifacts.report;
    artifacts.report={...complete,results:complete.results.slice(1)};
    assert.notEqual(postflopResponse('/local-postflop-spot',new URLSearchParams({spot:id})).status,200);
    artifacts.report=complete;
    assert.notEqual(postflopResponse('/local-postflop-spot',new URLSearchParams({spot:historicalId})).status,200,'deferred history stays unavailable');
    artifacts.laterCandidate=null;
    artifacts.report=simulationReport(inputs,artifacts.candidate.policy,config.samples_per_board_profile_seat,null,artifacts.report.results);
    assert.equal(isFreshSimulationReport(inputs,artifacts.candidate,null,artifacts.report),false,'a flop-only report cannot substitute for a selected HU pair');
    assert.notEqual(postflopResponse('/local-postflop-spot',new URLSearchParams({spot:id})).status,200);
  } finally {useArtifactSource(previous);}
});

test('historical test-only reduced-board completeness remains exact without activating a deferred route', () => {
  assert.throws(()=>loadInputs(historicalId),/Unknown postflop spot/);
  const {inputs}=historicalInputs(), {candidate,laterCandidate,report}=fixture(inputs);
  assert.ok(report.results.length<72); assert.ok(report.unreachable_boards.length>0);
  assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,report),true);
  assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,{...report,results:report.results.slice(1)}),false);
  assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,{...report,unreachable_boards:[]}),false);
});

test('read-only legacy preview preserves the prior contract without approving a stale report', () => {
  const inputs=loadInputs('BTN_open_BB_call'), artifacts=fixture(inputs);
  artifacts.report.defence_version=5;
  const ranges=Object.fromEntries(datasetsNeededForSpot(inputs.spot).map(name=>[name,JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url)))]));
  const previous=useArtifactSource({ranges,artifact:(_spot,kind)=>artifacts[kind]??null});
  try {
    const response=postflopResponse('/local-postflop-spot',new URLSearchParams({spot:inputs.spot.id}));
    assert.equal(response.status,200);
    assert.equal(response.body.report_status,'preserved-historical');
    assert.equal(response.body.report.defence_version,5);
    assert.equal(isFreshSimulationReport(inputs,artifacts.candidate,artifacts.laterCandidate,artifacts.report),false);
    artifacts.report.source_hash='wrong';
    assert.notEqual(postflopResponse('/local-postflop-spot',new URLSearchParams({spot:inputs.spot.id})).status,200);
  } finally {useArtifactSource(previous);}
});

test('adopted-v7 local/browser views reject duplicate turn and river cards', () => {
  // The old test injected a deferred catalog and expected the experimental v10
  // range-feasibility guard. Exercise the supported v7 input boundary instead.
  const inputs=loadInputs(id), datasets=rangesFor(inputs.spot), {candidate,laterCandidate}=fixture(inputs);
  for(const line of [
    {flop:'Ks7d2c',flopActions:'check,check',turn:'Ks'},
    {flop:'Ks7d2c',flopActions:'check,check',turn:'Jh',turnActions:'check,check',river:'Jh'},
  ]) {
    assert.throws(()=>buildLaterView(line,inputs,candidate,laterCandidate),/重複|duplicate/i);
    assert.throws(()=>computeLaterView({...line,spotId:id,datasets,flopCandidate:candidate,laterCandidate}),/重複|duplicate/i);
    assert.throws(()=>computeLaterExplain({...line,spotId:id,cards:'AhAd',datasets,flopCandidate:candidate,laterCandidate}),/重複|duplicate/i);
  }
});

test('deferred HU history cannot enter the supported local or browser routes', () => {
  const inputs=loadInputs(id), datasets=rangesFor(inputs.spot), {candidate,laterCandidate}=fixture(inputs);
  const line={spotId:historicalId,flop:'Ks7d2c',flopActions:'check,check',turn:'Jh',datasets,flopCandidate:candidate,laterCandidate};
  assert.throws(()=>loadInputs(historicalId),/Unknown postflop spot/);
  assert.notEqual(postflopResponse('/local-postflop-spot',new URLSearchParams({spot:historicalId})).status,200);
  assert.throws(()=>computeLaterView(line),/Unknown postflop spot/);
  assert.throws(()=>computeLaterExplain({...line,cards:'AhAd'}),/Unknown postflop spot/);
});

test('cached flop views must match the adopted-v7 generator and evaluator identities', () => {
  const inputs=loadInputs('BTN_open_BB_call'), {candidate,laterCandidate}=fixture(inputs);
  const data={kind:'ai_estimate_not_gto',mode:'balanced',spot:inputs.spot.id,histories:{},metadata:flopBaseIdentity(inputs,candidate,laterCandidate)};
  assert.equal(isFreshFlopBase(data,inputs,candidate,laterCandidate),true);
  assert.equal(data.metadata.generator_version,6,'adopted development-v7 cache generator');
  assert.equal(data.metadata.defence_version,7);
  assert.equal(data.metadata.evaluator_version,2);
  for(const patch of [{generator_version:5},{generator_version:7},{defence_version:10},{evaluator_version:1},{evaluator_version:3}]) {
    assert.equal(isFreshFlopBase({...data,metadata:{...data.metadata,...patch}},inputs,candidate,laterCandidate),false);
  }
});


test('adopted-v7 report contract rejects cross-contract markers and every missing identity', () => {
  for (const spotId of ['BTN_open_BB_call',id]) {
    const inputs=loadInputs(spotId), {candidate,laterCandidate,report}=fixture(inputs);
    assert.equal(report.defence_version,7);
    assert.equal(Object.hasOwn(report,'action_model_version'),false);
    assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,report),true);
    const patches=[{kind:'gto'},{version:2},{spot:'other'},{defence_version:10},{simulation_version:2},
      {action_model_version:10},{action_model_version:7},{action_model_version:null},{action_model_version:undefined},
      {evaluator_version:1},{evaluator_version:3},{samples_per_board_profile_seat:NaN},
      {samples_per_board_profile_seat:Infinity},{samples_per_board_profile_seat:'10000'},
      {policy_hash:'wrong'},{source_hash:'wrong'},{unreachable_boards:['As7d2c']}];
    for(const patch of patches) {
      assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,{...report,...patch}),false,`${spotId}: ${Object.keys(patch)}`);
    }
    for(const field of ['kind','version','spot','source_hash','policy_hash','later_policy_hash','later_sizing_hash',
      'simulation_version','defence_version','samples_per_board_profile_seat','seed','results']) {
      const missing={...report}; delete missing[field];
      assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,missing),false,`${spotId}: missing ${field}`);
    }
  }
});

test('direct report freshness checks exact source, policy content, later binding and configuration', () => {
  const inputs=loadInputs(id), base=fixture(inputs);
  const mutations=[
    ['missing flop', data=>{data.candidate=null;}],
    ['missing later', data=>{data.laterCandidate=null;}],
    ['missing later and report binding', data=>{data.laterCandidate=null;delete data.report.later_policy_hash;}],
    ['flop content', data=>{data.candidate.policy.changed=true;}],
    ['later content', data=>{data.laterCandidate.policy.changed=true;}],
    ['wrong later binding', data=>{data.laterCandidate.metadata.flop_policy_hash='0'.repeat(64);}],
    ['missing later binding', data=>{delete data.laterCandidate.metadata.flop_policy_hash;}],
  ];
  for(const stage of ['candidate','laterCandidate']) {
    for(const field of ['kind','spot','source_hash','policy_hash','config_version']) {
      mutations.push([`${stage} missing ${field}`,data=>{delete data[stage].metadata[field];}]);
      mutations.push([`${stage} changed ${field}`,data=>{data[stage].metadata[field]='wrong';}]);
    }
    mutations.push([`${stage} incompatible action model`,data=>{data[stage].metadata.action_model_version=10;}]);
  }
  for(const [label,mutate] of mutations) {
    const data=structuredClone(base); mutate(data);
    assert.equal(isFreshSimulationReport(inputs,data.candidate,data.laterCandidate,data.report),false,label);
  }
  assert.equal(isFreshSimulationReport({...inputs,fingerprint:undefined},base.candidate,base.laterCandidate,base.report),false);
});

test('all comparison rows and finite bounded metrics are required', () => {
  const inputs=loadInputs(id), {candidate,laterCandidate,report}=fixture(inputs);
  const mutations=[
    ['missing row',r=>{r.results.pop();}],
    ['duplicate row',r=>{r.results[1]=structuredClone(r.results[0]);}],
    ['extra row',r=>{r.results.push(structuredClone(r.results[0]));}],
    ['null row',r=>{r.results[0]=null;}],
  ];
  for(const field of ['board','split','opponent','hero']) {
    mutations.push([`missing ${field}`,r=>{delete r.results[0][field];}]);
    mutations.push([`wrong ${field}`,r=>{r.results[0][field]='wrong';}]);
  }
  for(const name of ['candidate_ev_bb','baseline_ev_bb','delta_bb']) {
    mutations.push([`missing ${name}`,r=>{delete r.results[0][name];}]);
    for(const value of [NaN,Infinity,-Infinity,null,'0',undefined]) {
      mutations.push([`${name} nonfinite mean ${value}`,r=>{r.results[0][name].mean=value;}]);
      for(const endpoint of [0,1]) mutations.push([`${name} nonfinite ci ${endpoint}: ${value}`,r=>{r.results[0][name].ci95[endpoint]=value;}]);
    }
    for(const ci of [null,[],[0],[0,0,0],[1,2],[-2,-1],[1,-1]]) {
      mutations.push([`${name} invalid interval ${ci}`,r=>{r.results[0][name].ci95=ci;}]);
    }
  }
  for(const [label,mutate] of mutations) {
    const changed=structuredClone(report); mutate(changed);
    assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,changed),false,label);
  }
});

test('v7 reports cannot pass under v10 defence or a changed simulation/evaluator runtime', () => {
  // Substitute a runtime constant in an isolated process, never a saved file or
  // policy/report. This checks both directions of the version boundary without
  // allowing a caller to override the production freshness gate's runtime.
  const publisher=new URL('../scripts/postflop-ai/publish-d1.mjs',import.meta.url).href;
  const inputsModule=new URL('../scripts/postflop-ai/inputs.mjs',import.meta.url).href;
  const versions=[
    ['defence.ts','DEFENCE_VERSION',7,10],
    ['simulation.mjs','SIMULATION_VERSION',3,4],
    ['../lib/equity.ts','EVALUATOR_VERSION',2,3],
  ];
  for(const [file,symbol,original,replacement] of versions) {
    const moduleUrl=new URL(`../scripts/postflop-ai/${file}`,import.meta.url).href;
    const script=`
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      let changed=false;
      registerHooks({load(url,context,nextLoad){
        const result=nextLoad(url,context);
        if(url!==${JSON.stringify(moduleUrl)}) return result;
        const source=String(result.source), from=${JSON.stringify('export const '+symbol+' = '+original+';')};
        assert.ok(source.includes(from),'runtime identity declaration exists');
        changed=true;
        return {...result,source:source.replace(from,${JSON.stringify('export const '+symbol+' = '+replacement+';')})};
      }});
      const {loadInputs,readArtifact}=await import(${JSON.stringify(inputsModule)});
      const {isFreshSimulationReport}=await import(${JSON.stringify(publisher)});
      const inputs=loadInputs(${JSON.stringify(id)});
      const candidate=readArtifact(inputs.spot,'candidate'),later=readArtifact(inputs.spot,'laterCandidate'),report=readArtifact(inputs.spot,'report');
      assert.ok(changed);
      assert.equal(report.defence_version,7);
      assert.equal(isFreshSimulationReport(inputs,candidate,later,report),false);
      assert.equal(isFreshSimulationReport(inputs,candidate,later,{...report,defence_version:10,action_model_version:10}),false);
    `;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:30_000});
    assert.equal(result.status,0,`${symbol}: ${result.error??result.stderr??result.stdout}`);
  }
});
