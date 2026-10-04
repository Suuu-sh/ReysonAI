// Offline diagnostic only. No strategy, report, metadata or production writes.
// Fixed hero, saved observed bettor reach, uniform compatible turn/river and saved
// subsequent legacy-runtime strategies, including deep-raise reference fallbacks.
// This is policy-conditional Monte Carlo, never GTO.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadInputs, artifactPaths } from './inputs.mjs';
import { loadCandidate, loadLaterCandidate } from './generate.mjs';
import { defenceFor, replayDecision } from './defence.mjs';
import { parseCards, parseFlopBoard, handTier } from './model.mjs';
import { playFromNode } from './flop-hand-ev-core.mjs';
import { seededRandom, seedFor } from '../lib/equity.mjs';
import { captureSourceGraph, identityHash } from './audit-identity.mjs';
import { compatibleOpponentSupport, compatibleRunout, weightedOpponentSampler, newMoments, addMoment, completedMoments, empiricalBernsteinInterval, postCapRawMix } from './rollout-diagnostic-contract.mjs';
export { empiricalBernsteinInterval } from './rollout-diagnostic-contract.mjs';
export const ROLLOUT_DIAGNOSTIC_VERSION = 2;

const bytesRecord = path => { const bytes=readFileSync(path);return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}; };
export function rolloutCall({ spot='BTN_open_BB_call', boardText='8c8d2h', heroText='KcQh', action='bet75', bettorRole='ip', samples=128, seed='low-flop-call-rollout-v1', delta=0.01 }={}) {
  if(!Number.isSafeInteger(samples)||samples<2||samples>1000000)throw new Error('Invalid sample count');
  if(!['bet33','bet75','bet125'].includes(action)||!['ip','oop'].includes(bettorRole))throw new Error('Invalid decision');
  if(!(delta>0&&delta<1))throw new Error('Invalid delta');
  const inputs=loadInputs(spot), candidate=loadCandidate(inputs), later=loadLaterCandidate(inputs,candidate);
  if(!later)throw new Error('Saved later artifact required; no whole-artifact reference substitution');
  const board=parseFlopBoard(boardText), hero=parseCards(heroText,2);
  if(new Set([...board.cards,...hero]).size!==5)throw new Error('Hero overlaps board');
  if(bettorRole==='oop'&&inputs.spot.tree!=='oop_leads')throw new Error('No OOP lead in this tree');
  const history=bettorRole==='ip'&&inputs.spot.tree==='oop_leads'?['check',action]:[action];
  const table=replayDecision(inputs,board.cards,{flop:history}), node=table.log.at(-1).node, actor=table.log.at(-1).seat;
  const defence=defenceFor(inputs,candidate.policy,later.policy);
  defence.largeRun=true; // Exact cache representation only; identical decision semantics.
  const ctx=defence.context(table,board.cards,node);
  const own=defence.rangeItems(table,board.cards,actor).find(x=>x.combo.every(card=>hero.includes(card)));
  if(!own||!(own.weight>0))throw new Error('Hero has no saved reach');
  const opponents=compatibleOpponentSupport(defence.rangeItems(table,board.cards,ctx.bettor),board.cards,hero);
  const opponentSampler=weightedOpponentSampler(opponents),total=opponentSampler.total;
  const base=defence.baseMix(table,board.cards,node,hero),equity=defence.equity(ctx,hero),realization=defence.realizationFor(ctx,hero);
  const raw=postCapRawMix(defence,ctx,base,equity,hero),actual=defence.mix(table,board.cards,node,hero,base);
  const files=artifactPaths(inputs.spot),artifacts=[bytesRecord(files.candidate),bytesRecord(files.laterCandidate)];
  const source=captureSourceGraph({roots:['apps/frontend/scripts/postflop-ai/rollout-low-flop-defence.mjs']});
  const random=seededRandom(seedFor(`${seed}|${spot}|${board.id}|${heroText}|${history}`));
  const lower=-table.stacks[actor],upper=table.pot+table.stacks[ctx.bettor],range=upper-lower;
  const moments=newMoments();
  const started=performance.now();
  for(let i=1;i<=samples;i++){
    // Reset all range-dependent contexts so no previous sample can alter the computation path.
    defence.releaseBoardCaches();
    const opponent=opponentSampler.pick(random).combo,runout=compatibleRunout(board.cards,hero,opponent,random);
    const value=playFromNode({hands:{[actor]:hero,[ctx.bettor]:opponent},flop:board.cards,runout,history,forced:'call',policy:candidate.policy,laterPolicy:later.policy,random,spot:inputs.spot,defence});
    if(!Number.isFinite(value)||value<lower-1e-9||value>upper+1e-9)throw new Error('Invalid or unbounded payoff');
    addMoment(moments,value);
    if(i%256===0||i===samples){process.stderr.write(JSON.stringify({completed:i,samples,mean_call_bb:moments.mean,elapsed_s:(performance.now()-started)/1000,rss_bytes:process.memoryUsage().rss})+'\n');}
  }
  const {mean,variance,se,minimum,maximum,positive:wins}=completedMoments(moments);
  // Maurer & Pontil (2009), Theorem 4, on normalized bounded payoffs;
  // use delta/2 for each tail, hence log(4/delta). No optional stopping.
  const interval=empiricalBernsteinInterval({mean,variance,samples,payoffRange:range,delta});
  const artifactsAfter=artifacts.map(x=>bytesRecord(x.path));
  if(JSON.stringify(artifacts)!==JSON.stringify(artifactsAfter))throw new Error('Policy bytes changed');
  const after=captureSourceGraph({roots:['apps/frontend/scripts/postflop-ai/rollout-low-flop-defence.mjs']});
  if(identityHash(source)!==identityHash(after))throw new Error('Code changed during rollout');
  return {schema_version:1,sampler_version:ROLLOUT_DIAGNOSTIC_VERSION,status:'complete',kind:'offline_policy_conditional_mc_not_gto',spot,board:board.id,hero:heroText,node,actor,bettor:ctx.bettor,history,samples,seed,delta,elapsed_s:(performance.now()-started)/1000,rss_bytes:process.memoryUsage().rss,source_fingerprint:inputs.fingerprint,flop_policy_hash:candidate.metadata.policy_hash,later_policy_hash:later.metadata.policy_hash,artifacts,source_graph:source,source_graph_sha256:identityHash(source),reach:{hero_weight:own.weight,compatible_opponent_combos:opponents.length,compatible_opponent_weight:total},initial:{tier:handTier(hero,board.cards),raw_equity:equity,realization,realized_equity:equity*realization,required:ctx.required,base,raw,actual,call_bb:ctx.call,pot_before_bb:ctx.potBefore},rollout:{forced_action:'call',fold_incremental_payoff_bb:0,mean_call_bb:mean,sample_variance_bb2:variance,se_bb:se,normal_95_percent_interval:[mean-1.96*se,mean+1.96*se],empirical_bernstein:interval,min_observed_bb:minimum,max_observed_bb:maximum,positive_payoff_samples:wins},limits:['Continuation uses the complete legacy runtime policy: saved rules, computed defence and inherited deep-raise reference fallbacks; play is not optimized.','Hero exact combo is fixed; opponent range is saved own-action reach conditioned on the observed bet and card removal.','No equilibrium or external-population validity claim.','Legacy same-amount all-in action labels condition different ranges; that known model limitation is preserved.','An initial floor-only ablation cannot change forced-call continuation because calling completes the flop.','The normal interval is descriptive; the conservative empirical-Bernstein interval is the bounded fixed-sample diagnostic.']};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  const [spot,boardText,heroText,action,bettorRole,n,seed,delta]=process.argv.slice(2);
  process.stdout.write(JSON.stringify(rolloutCall({spot,boardText,heroText,action,bettorRole,samples:n?Number(n):128,...(seed?{seed}:{}),...(delta?{delta:Number(delta)}:{})}),null,2)+'\n');
}
