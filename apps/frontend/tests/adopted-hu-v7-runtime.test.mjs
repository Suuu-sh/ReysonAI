import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import contract from './fixtures/adopted-hu-v7-contract.json' with { type:'json' };
import { moduleDigest,declarationDigests,digest,engineCases,uiCases } from './helpers/hu-v7-parity.mjs';
import * as engine from '../scripts/postflop-ai/engine.ts';
import * as ui from '../src/estimated/postflop-trial.ts';
import { config } from '../scripts/postflop-ai/inputs.mjs';
import { POSTFLOP_SPOTS,spotById } from '../scripts/postflop-ai/spots.ts';
import { captureAuditIdentity, AUDIT_REPOSITORY } from '../scripts/postflop-ai/audit-identity.mjs';
const text=path=>readFileSync(resolve(AUDIT_REPOSITORY,path),'utf8');

test('adopted HU-v7: every computational module has the exact 7c2 erased executable AST',()=>{
  assert.equal(contract.baseline,'7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5');
  for(const [path,expected] of Object.entries(contract.files)){
    let source=text(path);
    for(const guard of contract.validationOnlyAdapters[path]??[]){
      assert.equal(source.split(guard).length,2,`${path}: exact added validation guard must occur once`);
      source=source.replace(guard,'');
    }
    assert.equal(moduleDigest(source,path),expected,path);
  }
});
test('adopted HU-v7: all extracted chip/path helpers and isolated classifier bodies are exact7c2',()=>{
  const path='apps/frontend/scripts/postflop-ai/hu-v7-street-state.ts';
  assert.deepEqual(declarationDigests(text(path),path),contract.helperDigests);
  const classifier='apps/frontend/scripts/postflop-ai/hu-hand-tier.ts';
  assert.deepEqual(declarationDigests(text(classifier),classifier),contract.classifier);
});
test('adopted HU-v7: Stage3/MW3 completed-flop routing remains exact6566786a',()=>{
  const path='apps/frontend/src/estimated/postflop-trial.ts', actual=declarationDigests(text(path),path);
  for(const [name,expected] of Object.entries(contract.completion))assert.equal(actual[name],expected,name);
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
