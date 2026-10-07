// Adopted v7 keeps its per-label mixes. Impossible raises are still coerced by the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor } from '../scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy,laterPolicyMix } from '../scripts/postflop-ai/later-policy.ts';
import { replayDecision,defenceFor } from '../scripts/postflop-ai/defence.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { laterMixRows } from '../scripts/postflop-ai/views.ts';
import { laterExplainContext } from '../scripts/postflop-ai/explain-later.ts';
test('adopted v7 low-SPR view retains the same labelled actions and mixes as its defence core',()=>{
  const inputs=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call'),flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
  const context=laterExplainContext({flop:'As7d2c',flopActions:'bet75,call',turn:'Jh',turnActions:'bet75'},inputs),board=context.board;
  const paths={flop:context.flopPath,turn:context.turnPath,river:context.riverPath};
  const table=replayDecision(inputs,board,paths),entry=table.log.at(-1);assert.equal(entry.canRaise,false);assert.equal(entry.node,'turn_ip_vs_75');
  const rows=laterMixRows({actor:entry.seat,role:context.decision.role,board,node:entry.node,line:entry.line,inputs,flopPolicy:flop,laterPolicy:later,paths,flopSteps:context.flopSteps,turnSteps:context.turnReplay.state.steps,turnBoard:context.turnBoard,turnPreviousAggressor:context.start.lastAggressor});
  const model=defenceFor(inputs,flop,later);
  for(const row of rows.filter(row=>row.reachable).slice(0,4))for(const item of row.combos){const combo=parseCards(item.cards,2),base=laterPolicyMix(later,entry.node,combo,board,entry.line),expected=model.mix(table,board,entry.node,combo,base);for(const action of Object.keys(item.mix))assert.ok(Math.abs(item.mix[action]-expected[action]/100)<1e-12);}
});
