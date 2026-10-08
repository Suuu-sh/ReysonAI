import { flopBaseIdentity,isFreshFlopBase } from "../scripts/postflop-ai/flop-base-core.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { auditExperiment } from '../scripts/postflop-ai/audit.mjs';
import { loadInputs, readArtifact, useArtifactSource, config, laterSizingHash } from '../scripts/postflop-ai/inputs.mjs';
import { HAND_EV_VERSION, loadHandEv } from '../scripts/postflop-ai/hand-ev.mjs';
import { LATER_HAND_EV_VERSION, loadLaterHandEv } from '../scripts/postflop-ai/later-hand-ev.mjs';

// Validation-only exceptions to exact development-v7 computational parity.
// These tests never expand an audit, run a simulation or write a saved artifact.
const ids=['BTN_open_BB_call','UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call'];

test('audit rejects cross-contract defence/action markers before touching policy computation', () => {
  for(const id of ids) {
    const inputs=loadInputs(id),report=readArtifact(inputs.spot,'report');
    let accessed=0;
    const candidate={get policy(){accessed++;throw new Error('policy computation reached');}};
    const patches=[{defence_version:undefined},{defence_version:null},{defence_version:6},{defence_version:10},
      {action_model_version:10},{action_model_version:7},{action_model_version:null},{action_model_version:undefined}];
    for(const patch of patches) {
      assert.throws(()=>auditExperiment(inputs,candidate,{...report,...patch}),/incompatible execution contract/);
    }
    assert.throws(()=>auditExperiment(inputs,candidate,null),/incompatible execution contract/);
    assert.equal(accessed,0,'cross-contract reports stop before the original audit computation');
    // A real unchanged v7 header reaches the existing audit path. Stop at its
    // first policy access; this is deliberately not a strategy-quality audit.
    assert.throws(()=>auditExperiment(inputs,candidate,report),/policy computation reached/);
    assert.equal(accessed,1);
  }
});

test('audit fails closed when the runtime is v10, even with a relabelled report', () => {
  const defence=new URL('../scripts/postflop-ai/defence.ts',import.meta.url).href;
  const audit=new URL('../scripts/postflop-ai/audit.mjs',import.meta.url).href;
  const script=`
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    let changed=false;
    registerHooks({load(url,context,nextLoad){
      const result=nextLoad(url,context);
      if(url!==${JSON.stringify(defence)})return result;
      const source=String(result.source),from='export const DEFENCE_VERSION = 7;';
      assert.ok(source.includes(from));changed=true;
      return {...result,source:source.replace(from,'export const DEFENCE_VERSION = 10;')};
    }});
    const {auditExperiment}=await import(${JSON.stringify(audit)});
    assert.ok(changed);
    let touched=false;
    const candidate={get policy(){touched=true;throw new Error('unexpected computation');}};
    for(const defence_version of [7,10])assert.throws(()=>auditExperiment({},candidate,{defence_version}),/incompatible execution contract/);
    assert.equal(touched,false);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:30_000});
  assert.equal(result.status,0,result.error??result.stderr??result.stdout);
});

test('v7 offline readers reject old action markers and explicit wrong defence without requiring a new later schema', () => {
  for(const id of ids) {
    const inputs=loadInputs(id),candidate=readArtifact(inputs.spot,'candidate'),later=readArtifact(inputs.spot,'laterCandidate');
    const common={kind:'ai_estimate_not_gto',source_hash:inputs.fingerprint,policy_hash:candidate.metadata.policy_hash,
      later_policy_hash:later.metadata.policy_hash,method:'exact_expectation',seed:config.seed};
    const flop={...common,version:HAND_EV_VERSION,defence_version:7,later_sizing_hash:laterSizingHash()};
    const savedLater={...common,version:LATER_HAND_EV_VERSION};
    let handEv=flop,laterHandEv=savedLater;
    const previous=useArtifactSource({artifact:(_spot,kind)=>({handEv,laterHandEv})[kind]});
    try {
      assert.equal(loadHandEv(inputs,candidate,later),flop);
      assert.equal(loadLaterHandEv(inputs,candidate,later),savedLater,'unchanged v7 later schema has no defence marker');
      laterHandEv={...savedLater,defence_version:7};
      assert.equal(loadLaterHandEv(inputs,candidate,later),laterHandEv,'an explicit matching defence marker is compatible');
      for(const value of [10,7,0,null,undefined]) {
        handEv={...flop,action_model_version:value};laterHandEv={...savedLater,action_model_version:value};
        assert.equal(loadHandEv(inputs,candidate,later),null,`${id}: flop action marker ${value}`);
        assert.equal(loadLaterHandEv(inputs,candidate,later),null,`${id}: later action marker ${value}`);
      }
      for(const value of [6,10,0,'7',null,undefined]) {
        handEv={...flop,defence_version:value};laterHandEv={...savedLater,defence_version:value};
        assert.equal(loadHandEv(inputs,candidate,later),null,`${id}: flop defence ${value}`);
        assert.equal(loadLaterHandEv(inputs,candidate,later),null,`${id}: explicit later defence ${value}`);
      }
      handEv=flop;laterHandEv=savedLater;
      assert.equal(loadHandEv(inputs,candidate,later),flop);
      assert.equal(loadLaterHandEv(inputs,candidate,later),savedLater);
    } finally {useArtifactSource(previous);}
  }
});


test('v7 flop-base identity rejects any contradictory action-model marker without changing saved identity', () => {
  for (const id of ids) {
    const inputs=loadInputs(id),candidate=readArtifact(inputs.spot,'candidate'),later=readArtifact(inputs.spot,'laterCandidate');
    const metadata=flopBaseIdentity(inputs,candidate,later),base={kind:'ai_estimate_not_gto',mode:'balanced',spot:id,histories:{},metadata};
    assert.equal(isFreshFlopBase(base,inputs,candidate,later),true);
    for(const marker of [10,7,0,null,undefined])assert.equal(isFreshFlopBase({...base,metadata:{...metadata,action_model_version:marker}},inputs,candidate,later),false);
    assert.equal(isFreshFlopBase(base,inputs,candidate,later),true);
    assert.deepEqual(flopBaseIdentity(inputs,candidate,later),metadata);
  }
});
