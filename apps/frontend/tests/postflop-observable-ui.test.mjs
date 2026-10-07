// Adopted v7 preserves authored size tokens; v10 URL canonicalization is dormant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spotById } from '../scripts/postflop-ai/spots.ts';
import { flopDecision,laterDecision,laterStart,replayLater,buildLaterActionBlocks } from '../src/estimated/postflop-trial.ts';
const spot=spotById('BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call');
test('adopted v7 UI retains the deterministic 125-percent facing node and physical all-in label',()=>{
  const start=laterStart(['bet33','call'],spot),decision=laterDecision('turn',['bet125'],start,spot);
  assert.equal(decision.node,'turn_ip_vs_125');assert.deepEqual(decision.options.map(x=>x.action),['fold','call']);
  assert.ok(!decision.facedAction);assert.match(decision.history[0],/All-in/);
  const result=replayLater('turn',['bet125','call'],start,spot);assert.equal(result.pot,202.5);assert.deepEqual(result.stacks,{ip:0,oop:0});
});
test('adopted v7 later blocks keep selected125 action and finish the low-SPR hand',()=>{
  const blocks=buildLaterActionBlocks({flopActions:['bet33','call'],turnCard:'9h',turnActions:['bet125','call']},spot);
  assert.ok(blocks.some(block=>block.chosen==='bet125'));assert.ok(!blocks.some(block=>block.chosen==='bet75'));
  assert.match(blocks.at(-1).result,/ショウダウン|ショーダウン/);
});
test('adopted v7 illegal flop and later action suffixes remain rejected',()=>{
  assert.throws(()=>flopDecision(['bet125','raise','raise','fold'],{...spot,stackBb:10}),/Illegal|effective/);
  const start={pot:120,stacks:{ip:40,oop:40},lastAggressor:'oop'};
  assert.throws(()=>laterDecision('river',['check','allin','raise'],start,spot),/Illegal/);
  assert.throws(()=>laterDecision('river',['check','bet125','raise','fold'],start,spot),/effectively called|Illegal/);
});
