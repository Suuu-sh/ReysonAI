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
    assert.equal(isFreshSimulationReport(inputs,artifacts.candidate,null,artifacts.report),true,'complete flop-only report must not substitute for a new spot pair');
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

test('test-only historical local/browser views still reject impossible turn and river cards', () => {
  const {inputs,datasets}=historicalInputs(), {candidate,laterCandidate}=fixture(inputs);
  for(const line of [
    {flop:'Ks7d2c',flopActions:'check,check',turn:'As'},
    {flop:'Ks7d2c',flopActions:'check,check',turn:'Jh',turnActions:'check,check',river:'As'},
  ]) {
    const unreachable=error=>error.code==='POSTFLOP_BOARD_UNREACHABLE';
    assert.throws(()=>buildLaterView(line,inputs,candidate,laterCandidate),unreachable);
    assert.throws(()=>computeLaterView({...line,spotId:historicalId,datasets,flopCandidate:candidate,laterCandidate}),unreachable);
    assert.throws(()=>computeLaterExplain({...line,spotId:historicalId,cards:'AhAd',datasets,flopCandidate:candidate,laterCandidate}),unreachable);
  }
});

test('pre-fix cached flop views cannot bypass normalized legal-action mixes', () => {
  const inputs=loadInputs('BTN_open_BB_call'), {candidate,laterCandidate}=fixture(inputs);
  const data={kind:'ai_estimate_not_gto',mode:'balanced',spot:inputs.spot.id,histories:{},metadata:flopBaseIdentity(inputs,candidate,laterCandidate)};
  assert.equal(isFreshFlopBase(data,inputs,candidate,laterCandidate),true);
  assert.equal(isFreshFlopBase({...data,metadata:{...data.metadata,generator_version:6}},inputs,candidate,laterCandidate),false);
});
