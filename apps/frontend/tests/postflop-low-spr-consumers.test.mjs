import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor, policyMix } from '../scripts/postflop-ai/policy.mjs';
import { referenceLaterPolicy, laterPolicyMix } from '../scripts/postflop-ai/later-policy.mjs';
import { defenceFor, replayDecision } from '../scripts/postflop-ai/defence.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { laterMixRows } from '../scripts/postflop-ai/views.mjs';
import { explainLaterCombo } from '../scripts/postflop-ai/explain-later.mjs';

// Test-only reference rules and real saved source ranges: no optional .local
// candidate is needed, so clean CI must exercise this regression.
test('merged-all-in mixes agree across view, simulation and explanation boundaries', () => {
  const inputs=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
  const flop=referencePolicyFor(inputs.spot.tree), later=structuredClone(referenceLaterPolicy());
  for (const rule of later.streets.turn.rules) if (rule.node === 'turn_ip_vs_75') rule.mix = {fold:40,call:51,raise:9};
  const board=parseCards('As7d2cJh',4), combo=parseCards('KhQh',2);
  const paths={flop:['bet75','call'],turn:['bet75']};
  const table=replayDecision(inputs,board,paths), entry=table.log.at(-1);
  assert.equal(entry.node,'turn_ip_vs_75'); assert.equal(entry.canRaise,false);
  assert.equal(table.stacks.BB,0); assert.equal(table.stacks.HJ,65.25); assert.equal(table.pot,137.75);
  const defence=defenceFor(inputs,flop,later);
  const raw=laterPolicyMix(later,entry.node,combo,board,entry.line);
  assert.ok(raw.raise>0,'raw authored raise must exercise the regression');
  const expected=defence.mix(table,board,entry.node,combo,defence.baseMix(table,board,entry.node,combo));
  assert.equal(expected.raise,0);
  assert.deepEqual(defence.mix(table,board,entry.node,combo,raw),expected);
  assert.deepEqual(defence.facts(table,board,entry.node,combo,raw).mix,expected);
  const rows=laterMixRows({actor:'HJ',role:'ip',board,node:entry.node,line:entry.line,inputs,flopPolicy:flop,laterPolicy:later,paths});
  const kqs=rows.find(row=>row.hand==='KQs'); assert.ok(kqs.reachable);
  for(const item of kqs.combos) {
    const cards=parseCards(item.cards,2), mix=defence.mix(table,board,entry.node,cards,defence.baseMix(table,board,entry.node,cards));
    assert.equal(item.mix.raise,0);
    for(const key of ['fold','call','raise']) assert.ok(Math.abs(item.mix[key]-mix[key]/100)<1e-12);
  }
  const explanation=explainLaterCombo({flop:'As7d2c',flopActions:'bet75,call',turn:'Jh',turnActions:'bet75',cards:'KhQh',inputs,flopPolicy:flop,laterPolicy:later});
  assert.deepEqual(explanation.defence.mix,expected);
});

test('flop all-in normalization is centralized while legal raises remain authored', () => {
  const original=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
  const inputs={...original,spot:{...original.spot,stackBb:20}};
  const policy=structuredClone(referencePolicyFor(inputs.spot.tree)), board=parseCards('As7d2c',3), combo=parseCards('KhQh',2);
  for (const rule of policy.rules) if (['ip_vs_75','ip_vs_33'].includes(rule.node)) rule.mix={fold:40,call:51,raise:9};
  const table=replayDecision(inputs,board,{flop:['bet75']}), entry=table.log.at(-1);
  assert.equal(entry.canRaise,false);
  const defence=defenceFor(inputs,policy,null), raw=policyMix(policy,entry.node,combo,board);
  assert.ok(raw.raise>0);
  const expected=defence.mix(table,board,entry.node,combo,defence.baseMix(table,board,entry.node,combo));
  assert.deepEqual(defence.mix(table,board,entry.node,combo,raw),expected);
  assert.equal(expected.raise,0);
  const legalTable=replayDecision(original,board,{flop:['bet33']}), legalEntry=legalTable.log.at(-1);
  assert.equal(legalEntry.canRaise,true);
  const legal=defenceFor(original,policy,null), legalRaw=policyMix(policy,legalEntry.node,combo,board);
  assert.equal(legal.mix(legalTable,board,legalEntry.node,combo,legalRaw).raise,legalRaw.raise);
});
