import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadInputs, readArtifact, useArtifactSource, config, laterSizingHash } from '../scripts/postflop-ai/inputs.mjs';
import * as runtime from '../scripts/postflop-ai/defence.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { simulationReport, playHand } from '../scripts/postflop-ai/simulation.mjs';
import { laterPolicyMix, referenceLaterMix } from '../scripts/postflop-ai/later-policy.ts';
import { sha } from '../scripts/postflop-ai/generate.mjs';
import { flopBaseIdentity, isFreshFlopBase } from '../scripts/postflop-ai/flop-base-core.ts';
import { HAND_EV_VERSION, loadHandEv } from '../scripts/postflop-ai/hand-ev.mjs';
import { LATER_HAND_EV_VERSION, loadLaterHandEv } from '../scripts/postflop-ai/later-hand-ev.mjs';
import { buildLaterView } from '../scripts/postflop-ai/local-view.mjs';
import { explainLaterCombo } from '../scripts/postflop-ai/explain-later.ts';
import { computeLaterView, computeLaterExplain } from '../src/estimated/postflop-compute.ts';
import { datasetsNeededForSpot } from '../src/estimated/postflop-browser.ts';
import { POSTFLOP_SPOTS } from '../scripts/postflop-ai/spots.ts';
import { snapshotDependencies, snapshot } from '../scripts/postflop-ai/serial-validation-proof.mjs';
import { auditFileRecord, AUDIT_REPOSITORY } from '../scripts/postflop-ai/audit-identity.mjs';
import { REPRESENTATIVE, riverCases, nonriverCases, riverRaiseCases, probe, numericGolden } from './helpers/river-floor-regression.mjs';

// Replacement ledger: v10's history-only negative-call-EV floor exemption,
// pooled action aliases, exact-sign caches and model6/v3 archive goldens are not
// the adopted runtime. These tests use unchanged tracked development-v7 pairs,
// bounded deterministic probes and fixed deals. No saved policy/report generation.
const pairFor = inputs => Object.fromEntries(['candidate','laterCandidate','report'].map(kind => [kind,readArtifact(inputs.spot,kind)]));
const inputs = loadInputs(REPRESENTATIVE), pair = pairFor(inputs);
const withoutHistory = input => ({...input,spot:{...input.spot,history:undefined}});
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
const lineOf = item => ({flop:item.board.slice(0,6),turn:item.board.slice(6,8),river:item.board.slice(8,10),
  flopActions:item.path.flop.join(','),turnActions:item.path.turn.join(','),riverActions:item.path.river.join(',')});

function fresh(input=inputs) {
  return runtime.defenceFor({...input},pair.candidate.policy,pair.laterCandidate.policy);
}

test('adopted-v7 defence exposes one history-independent model without the experimental floor API', () => {
  assert.equal(runtime.DEFENCE_VERSION,7);
  for(const name of ['NEW_HU_DEFENCE_VERSION','defenceVersionFor','RIVER_EXACT_CACHE_LIMIT']) assert.equal(Object.hasOwn(runtime,name),false,name);
  for(const input of [inputs,withoutHistory(inputs)]) {
    const model=fresh(input);
    assert.equal(model.negativeRiverCallEv,undefined);
    assert.equal(model.exactRiverContexts,undefined);
    assert.equal(model.observableMix,undefined);
    assert.equal(model.inputs.spot.history,input.spot.history);
  }
});

test('v7 MDF floor promotes the same zero-equity mass with and without history', () => {
  const combo=parseCards('Ac9d',2), base={fold:90,call:0,raise:10};
  for(const input of [inputs,withoutHistory(inputs)]) {
    const model=fresh(input);
    const context={street:'river',call:10,required:0.25,floor:{threshold:0,fraction:1/3},ceiling:null};
    // A precomputed v7 floor uses realized equity and allocation only. It must
    // not secretly scan exact support or switch algorithms because history exists.
    Object.defineProperty(context,'bettorRange',{get(){throw new Error('v7 floor scanned an experimental exact-support range');}});
    for(const equity of [0,-0,Number.MIN_VALUE]) {
      assert.deepEqual(model.applyEquity(context,base,equity,combo,true),base);
      assert.deepEqual(model.applyEquity(context,base,equity,combo),{fold:60,call:30,raise:10});
    }
    assert.deepEqual(model.applyEquity({...context,floor:{threshold:0.25,fraction:0.5}},base,0.25,combo),{fold:22,call:68,raise:10});
    assert.deepEqual(model.applyEquity({...context,floor:{threshold:0.1,fraction:1}},base,0,combo),base);
    assert.deepEqual(model.applyEquity({...context,floor:{threshold:0,fraction:0.001}},base,0,combo),base);
    assert.deepEqual(model.applyEquity({...context,floor:null,ceiling:{threshold:0.3,fraction:0.5}},base,0.25,combo),base);
    for(const street of ['flop','turn']) {
      const nonriver={...context,street,role:'ip',board:[],tiers:new Uint8Array(52*52),realizationFactors:[1]};
      assert.deepEqual(model.applyEquity(nonriver,base,0,combo),{fold:60,call:30,raise:10});
    }
  }
});

test('all bounded river, raise, flop and turn probes are numerically identical with history removed', () => {
  let rows=0,floors=0,raises=0;
  for(const item of [...riverCases,...riverRaiseCases,...nonriverCases]) {
    const current=probe({...inputs},pair,item), control=probe(withoutHistory(inputs),pair,item);
    assert.ok(current.context&&current.rows.length,item.id);
    assert.deepEqual(numericGolden(current),numericGolden(control),`${item.id}: v7 has no history-based algorithm`);
    assert.deepEqual(current.context.floor,control.context.floor,item.id);
    assert.deepEqual(current.context.ceiling,control.context.ceiling,item.id);
    assert.deepEqual(current.table.path,control.table.path,item.id);
    assert.deepEqual(current.table.invested,control.table.invested,item.id);
    assert.equal(current.table.pot,control.table.pot,item.id);
    rows+=current.rows.length;
    if(current.context.floor)floors++;
    if(item.id.startsWith('raise-'))raises++;
    for(const row of current.rows) {
      assert.ok(Number.isFinite(row.equity)&&row.equity>=-1e-12&&row.equity<=1+1e-12,item.id);
      assert.ok(Object.values(row.mix).every(value=>Number.isFinite(value)&&value>=0&&value<=100),item.id);
      close(Object.values(row.mix).reduce((sum,value)=>sum+value,0),100);
      assert.equal(row.mix.raise,row.capped.raise,`${item.id}: floor preserves capped legal raises`);
    }
    current.defence.releaseBoardCaches();control.defence.releaseBoardCaches();
  }
  assert.ok(rows>100&&floors>0);
  assert.equal(raises,riverRaiseCases.length);
});

test('v7 local/browser river views and explanations agree with the same ordinary defence mixes', () => {
  const datasets=Object.fromEntries(datasetsNeededForSpot(inputs.spot).filter(name=>name!=='hu-after-multiway-spots').map(name=>[name,
    JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url)))]));
  for(const item of [riverCases[0],riverCases.find(item=>item.id==='paired-oop-value-only'),riverRaiseCases[0]]) {
    const p=probe(inputs,pair,item),line=lineOf(item);
    const cards=item.selected??[Math.floor(p.rows[0].id/52),p.rows[0].id%52].map(card=>'23456789TJQKA'[card>>2]+'cdhs'[card&3]).join('');
    const local=buildLaterView(line,inputs,pair.candidate,pair.laterCandidate);
    assert.deepEqual(computeLaterView({...line,spotId:REPRESENTATIVE,datasets,flopCandidate:pair.candidate,laterCandidate:pair.laterCandidate}),local,item.id);
    const actual=new Map();
    let compared=0;
    for(const row of local.rows)for(const combo of row.combos) {
      const cards=parseCards(combo.cards,2);
      const base=laterPolicyMix(pair.laterCandidate.policy,local.node,cards,p.board,local.line);
      const mix=p.defence.mix(p.table,p.board,p.entry.node,cards,base);
      actual.set(runtime.comboId(...cards),mix);
      for(const action of Object.keys(combo.mix))close(combo.mix[action],mix[action]/100);
      compared++;
    }
    assert.ok(compared>0,item.id);
    const explanation=explainLaterCombo({...line,cards,inputs,flopPolicy:pair.candidate.policy,laterPolicy:pair.laterCandidate.policy});
    assert.deepEqual(computeLaterExplain({...line,cards,spotId:REPRESENTATIVE,datasets,flopCandidate:pair.candidate,laterCandidate:pair.laterCandidate}),
      {spot:REPRESENTATIVE,...explanation},item.id);
    assert.deepEqual(explanation.defence.mix,actual.get(runtime.comboId(...parseCards(cards,2))),item.id);
    const facts=p.defence.facts(p.table,p.board,p.entry.node,parseCards(cards,2),p.defence.baseMix(p.table,p.board,p.entry.node,parseCards(cards,2)));
    assert.deepEqual(facts.mix,explanation.defence.mix);
    assert.equal(facts.defence_frequency,explanation.defence.defence_frequency);
    p.defence.releaseBoardCaches();
  }
});

test('one fixed-deal simulation consumes the actual v7 floor mix with and without history', () => {
  const item=riverCases.find(item=>item.id==='paired-oop-value-only');
  const p=probe(inputs,pair,item),hands={HJ:parseCards('Ad9d',2),BB:parseCards('AcAh',2)};
  const opponent=referenceLaterMix('river_oop_first',hands.BB,p.board,'checked','standard');
  assert.ok(opponent.bet75>0);
  const bet75=(opponent.check+opponent.bet33+opponent.bet75/2)/100;
  const expected=p.defence.mix(p.table,p.board,p.entry.node,hands.HJ,p.defence.baseMix(p.table,p.board,p.entry.node,hands.HJ));
  const results=[];
  for(const input of [inputs,withoutHistory(inputs)]) {
    const model=fresh(input),observed=[];
    results.push(playHand({hands,flop:p.board.slice(0,3),runout:p.board.slice(3),hero:'HJ',spot:input.spot,
      policy:pair.candidate.policy,laterPolicy:pair.laterCandidate.policy,profile:'standard',
      randoms:[0,0,0,0,bet75,0.99,...Array(18).fill(0)],
      defence:{baseMix:(...args)=>model.baseMix(...args),mix:(table,board,node,combo,base)=>{
        const mix=model.mix(table,board,node,combo,base);if(node==='river_ip_vs_75')observed.push(mix);return mix;
      }}}));
    assert.deepEqual(observed,[expected]);
    model.releaseBoardCaches();
  }
  assert.deepEqual(results[0],results[1]);
  p.defence.releaseBoardCaches();
});

test('a fixed deal reaches a v7 river raise response and consumes the replayed mix', () => {
  const item=riverRaiseCases.find(item=>item.id==='raise-oop-7c5d5hTs6h'),p=probe(inputs,pair,item);
  const opponentCards=parseCards('7d7h',2);
  const selected=p.rows.find(row=>![Math.floor(row.id/52),row.id%52].some(card=>opponentCards.includes(card)));
  assert.ok(selected);
  const hands={BB:[Math.floor(selected.id/52),selected.id%52],HJ:opponentCards};
  const first=runtime.replayDecision(inputs,p.board,{...item.path,river:[]}),node=first.log.at(-1).node;
  const base=p.defence.baseMix(first,p.board,node,hands.BB),mix=p.defence.mix(first,p.board,node,hands.BB,base);
  assert.ok(mix.bet33>0);
  const opponent=referenceLaterMix('river_ip_vs_33',hands.HJ,p.board,'checked','standard');
  assert.ok(opponent.raise>0);
  const observed=[];
  playHand({hands,flop:p.board.slice(0,3),runout:p.board.slice(3),hero:'BB',spot:inputs.spot,
    policy:pair.candidate.policy,laterPolicy:pair.laterCandidate.policy,profile:'standard',
    randoms:[0,0,0,0,(mix.check+mix.bet33/2)/100,(opponent.fold+opponent.call+opponent.raise/2)/100,0.99,...Array(18).fill(0)],
    defence:{baseMix:(...args)=>p.defence.baseMix(...args),mix:(table,board,pending,combo,raw)=>{
      const result=p.defence.mix(table,board,pending,combo,raw);
      if(pending==='river_oop_vs_raise')observed.push(result);return result;
    }}});
  assert.deepEqual(observed,[selected.mix]);
  p.defence.releaseBoardCaches();
});

test('all85 tracked reports exactly match v7 simulation headers and flop-base identities', () => {
  const spots=POSTFLOP_SPOTS.filter(spot=>spot.reachable);
  assert.equal(spots.length,85);
  for(const spot of spots) {
    const input=loadInputs(spot.id),saved=pairFor(input);
    // Reuse existing result rows. This is header/schema reconstruction only,
    // never a simulation or new numerical result.
    const report=simulationReport(input,saved.candidate.policy,config.samples_per_board_profile_seat,saved.laterCandidate,saved.report.results);
    assert.deepEqual(report,saved.report,spot.id);
    assert.equal(report.defence_version,7);
    assert.equal(Object.hasOwn(report,'action_model_version'),false);
    const raw=simulationReport(input,saved.candidate.policy,config.samples_per_board_profile_seat,saved.laterCandidate,[],{computedDefence:false});
    assert.equal(Object.hasOwn(raw,'defence_version'),false);
    assert.equal(Object.hasOwn(raw,'action_model_version'),false);
    const metadata=flopBaseIdentity(input,saved.candidate,saved.laterCandidate);
    assert.equal(metadata.generator_version,6);
    assert.equal(metadata.defence_version,7);
    assert.equal(metadata.evaluator_version,2);
    assert.equal(metadata.source_hash,input.fingerprint);
    assert.equal(metadata.policy_hash,saved.report.policy_hash);
    assert.equal(metadata.later_policy_hash,saved.report.later_policy_hash);
    assert.equal(metadata.later_sizing_hash,saved.report.later_sizing_hash);
    assert.equal(metadata.seed,saved.report.seed);
    assert.equal(Object.hasOwn(metadata,'action_model_version'),false);
    const base={kind:'ai_estimate_not_gto',mode:'balanced',spot:spot.id,histories:{},metadata};
    assert.equal(isFreshFlopBase(base,input,saved.candidate,saved.laterCandidate),true);
    for(const patch of [{defence_version:10},{generator_version:7},{evaluator_version:3},{source_hash:'wrong'},{later_policy_hash:'wrong'}]) {
      assert.equal(isFreshFlopBase({...base,metadata:{...metadata,...patch}},input,saved.candidate,saved.laterCandidate),false,spot.id);
    }
  }
});

test('v7 offline hand-EV lookup preserves its exact source/policy contracts without a history-specific identity', () => {
  for(const input of [inputs,loadInputs('BTN_open_BB_call')]) {
    const selected=pairFor(input);
    const common={kind:'ai_estimate_not_gto',source_hash:input.fingerprint,policy_hash:selected.candidate.metadata.policy_hash,
      later_policy_hash:sha(selected.laterCandidate.policy),method:'exact_expectation',seed:config.seed};
    const originalHand={...common,version:HAND_EV_VERSION,defence_version:7,later_sizing_hash:laterSizingHash()};
    const originalLater={...common,version:LATER_HAND_EV_VERSION};
    let handEv=originalHand,laterHandEv=originalLater;
    const previous=useArtifactSource({artifact:(_spot,kind)=>({handEv,laterHandEv})[kind]});
    try {
      assert.equal(loadHandEv(input,selected.candidate,selected.laterCandidate),originalHand);
      assert.equal(loadLaterHandEv(input,selected.candidate,selected.laterCandidate),originalLater);
      assert.equal(Object.hasOwn(originalLater,'defence_version'),false,'v7 later-EV schema has no defence field');
      for(const field of ['kind','version','source_hash','policy_hash','later_policy_hash']) {
        handEv={...originalHand,[field]:'wrong'};laterHandEv={...originalLater,[field]:'wrong'};
        assert.equal(loadHandEv(input,selected.candidate,selected.laterCandidate),null,field);
        assert.equal(loadLaterHandEv(input,selected.candidate,selected.laterCandidate),null,field);
      }
      for(const patch of [{defence_version:6},{defence_version:10},{later_sizing_hash:'wrong'}]) {
        handEv={...originalHand,...patch};assert.equal(loadHandEv(input,selected.candidate,selected.laterCandidate),null);
      }
      for(const patch of [{method:'monte_carlo'},{seed:'wrong'}]) {
        laterHandEv={...originalLater,...patch};assert.equal(loadLaterHandEv(input,selected.candidate,selected.laterCandidate),null);
      }
      laterHandEv=originalLater;
      assert.equal(loadLaterHandEv(input,selected.candidate,null),null);
    } finally {useArtifactSource(previous);}
  }
});

test('read-only audit inventory pins actual v7 sources without repurposing the separate Astra serial workflow', () => {
  const dependencies=snapshotDependencies();
  const records=new Map(dependencies.sources.map(record=>[record.path,record]));
  for(const file of ['defence.ts','simulation.mjs','audit.mjs','generate.mjs','flop-base-core.ts','hu-hand-tier.ts','publish-d1.mjs']) {
    const path=`apps/frontend/scripts/postflop-ai/${file}`;
    assert.deepEqual(records.get(path),auditFileRecord(AUDIT_REPOSITORY,path),file);
  }
  const paths=[...records.keys()];
  assert.equal(paths.some(path=>path.endsWith('/exact-river-call-ev.mjs')),false);
  assert.equal(paths.some(path=>path.endsWith('/observable-actions.mjs')),false);
  // Its explicit generation gate is distinct from adopted-v7 publication.
  assert.throws(()=>snapshot([REPRESENTATIVE]),/gpt-6-astra\/xhigh candidates/);
});
