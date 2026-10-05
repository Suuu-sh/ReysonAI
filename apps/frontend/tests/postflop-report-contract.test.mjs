import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const id='CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_fold_SB_4bet_BB_fold_CO_call';
function fixture(inputs) {
  const policy=referencePolicyFor(inputs.spot.tree), laterPolicy=referenceLaterPolicy();
  const candidate={metadata:{kind:'ai_estimate_not_gto',source_hash:inputs.fingerprint,policy_hash:sha(policy),config_version:config.version,spot:inputs.spot.id,tree:inputs.spot.tree},policy};
  const laterCandidate={metadata:{source_hash:inputs.fingerprint,flop_policy_hash:sha(policy),policy_hash:sha(laterPolicy)},policy:laterPolicy};
  const metric={mean:0,ci95:[0,0]};
  // Test-only structurally complete report. No simulated/publication claim.
  const rows=boards().filter(b=>!inputs.spot.history||hasPostflopDeal(inputs,b.cards)).flatMap(b=>PROFILES.flatMap(opponent=>[inputs.spot.ip,inputs.spot.oop].map(hero=>({board:b.id,split:b.split,opponent,hero,candidate_ev_bb:metric,baseline_ev_bb:metric,delta_bb:metric}))));
  return {candidate,laterCandidate,report:simulationReport(inputs,policy,config.samples_per_board_profile_seat,laterCandidate,rows)};
}

test('publication freshness rejects stale defence/later/sizing/seed/samples and incomplete comparisons', () => {
  const inputs=loadInputs('BTN_open_BB_call'), {candidate,laterCandidate,report}=fixture(inputs);
  assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,report),true);
  for (const patch of [{defence_version:5},{later_policy_hash:'wrong'},{later_sizing_hash:'wrong'},{seed:'wrong'},{samples_per_board_profile_seat:1},{results:report.results.slice(1)},{results:[report.results[0],...report.results.slice(0,-1)]}]) {
    assert.equal(isFreshSimulationReport(inputs,candidate,laterCandidate,{...report,...patch}),false,JSON.stringify(Object.keys(patch)));
  }
});

test('local artifact route accepts exact reduced-board completeness, not a fixed72 rows', () => {
  const inputs=loadInputs(id), artifacts=fixture(inputs);
  assert.ok(artifacts.report.results.length<72); assert.ok(artifacts.report.unreachable_boards.length>0);
  const ranges=Object.fromEntries(datasetsNeededForSpot(inputs.spot).map(name=>[name,JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url)))]));
  const previous=useArtifactSource({ranges,artifact:(_spot,kind)=>artifacts[kind]??null});
  try {
    const response=postflopResponse('/local-postflop-spot',new URLSearchParams({spot:id}));
    assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(response.body.report.results.length,artifacts.report.results.length);
    artifacts.laterCandidate=null;
    artifacts.report=simulationReport(inputs,artifacts.candidate.policy,config.samples_per_board_profile_seat,null,artifacts.report.results);
    assert.equal(isFreshSimulationReport(inputs,artifacts.candidate,null,artifacts.report),true,'complete flop-only report must not substitute for a new spot pair');
    assert.notEqual(postflopResponse('/local-postflop-spot',new URLSearchParams({spot:id})).status,200);
  } finally {useArtifactSource(previous);}
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

test('local/browser later views and explanations reject impossible turn and river cards', () => {
  const inputs=loadInputs(id), {candidate,laterCandidate}=fixture(inputs);
  const datasets=Object.fromEntries(datasetsNeededForSpot(inputs.spot).map(name=>[name,JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url)))]));
  for(const line of [
    {flop:'Ks7d2c',flopActions:'check,check',turn:'As'},
    {flop:'Ks7d2c',flopActions:'check,check',turn:'Jh',turnActions:'check,check',river:'As'},
  ]) {
    const unreachable=error=>error.code==='POSTFLOP_BOARD_UNREACHABLE';
    assert.throws(()=>buildLaterView(line,inputs,candidate,laterCandidate),unreachable);
    assert.throws(()=>computeLaterView({...line,spotId:id,datasets,flopCandidate:candidate,laterCandidate}),unreachable);
    assert.throws(()=>computeLaterExplain({...line,spotId:id,cards:'AhAd',datasets,flopCandidate:candidate,laterCandidate}),unreachable);
  }
});

test('pre-fix cached flop views cannot bypass normalized legal-action mixes', () => {
  const inputs=loadInputs('BTN_open_BB_call'), {candidate,laterCandidate}=fixture(inputs);
  const data={kind:'ai_estimate_not_gto',mode:'balanced',spot:inputs.spot.id,histories:{},metadata:flopBaseIdentity(inputs,candidate,laterCandidate)};
  assert.equal(isFreshFlopBase(data,inputs,candidate,laterCandidate),true);
  assert.equal(isFreshFlopBase({...data,metadata:{...data.metadata,generator_version:6}},inputs,candidate,laterCandidate),false);
});
