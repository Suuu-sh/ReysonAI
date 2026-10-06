// Fixed original diagnostics evaluated under the experimental law, never policy acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { loadInputs } from '../../scripts/postflop-ai/inputs.mjs';
import { Defence, comboId, replayDecision, finalTables } from '../../scripts/postflop-ai/defence.mjs';
import { parseCards } from '../../scripts/postflop-ai/model.mjs';
import { comboRange } from '../../scripts/postflop-ai/browser-inputs.mjs';
import { createEffectiveDefence } from '../../scripts/postflop-ai/effective-reach.mjs';
import { compileDeclaredPolicyLaw } from '../../scripts/postflop-ai/effective-action-law.mjs';
import { contentHash } from '../../scripts/postflop-ai/effective-law-identity.mjs';
import { requestBeforeEntry } from '../../scripts/postflop-ai/decision-prefix.mjs';
import { makeRange, equitiesVersus, equityVersus } from '../../scripts/postflop-ai/range-equity.mjs';
import { compileRiverCallEv, exactRiverCallEv } from '../../scripts/postflop-ai/exact-river-call-ev.mjs';
import { gameConfig } from '../../src/estimated/sizing.ts';
import { slowPrefixReference } from './model11-slow-reference.mjs';
const FRONTEND=new URL('../../',import.meta.url),DIRECTORY=new URL('.local/hu-model11/',FRONTEND);
const MANIFEST='.local/hu-model11/six-real-fixtures-v1.manifest.json';
const MANIFEST_SHA='d3a5c5ee250c60566f45d81bb064900c9ca175f3aebd8dc537d529c88b7c069d';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),cards=id=>[Math.floor(id/52),id%52];
const hex=weights=>{const bytes=Buffer.alloc(weights.length*8);for(let i=0;i<weights.length;i++)bytes.writeDoubleBE(weights[i],i*8);return bytes.toString('hex');};
const summary=weights=>{let support=0,total=0;for(const weight of weights){if(weight>0)support++;total+=weight;}return {support,total};};
function readPinned(record){
  assert.ok(record.path.startsWith('apps/frontend/.local/hu-model11/six-real-fixtures-v1/'));
  const bytes=readFileSync(new URL(record.path.slice('apps/frontend/'.length),FRONTEND));
  assert.equal(bytes.length,record.bytes);assert.equal(digest(bytes),record.sha256);return JSON.parse(bytes);
}
function fixture(number){
  const bytes=readFileSync(new URL(MANIFEST,FRONTEND));assert.equal(digest(bytes),MANIFEST_SHA);
  const manifest=JSON.parse(bytes),spec=manifest.cases[number-1];assert.equal(manifest.cases.length,6);assert.equal(spec.caseNumber,number);
  const locator=readPinned(manifest.originalLocator),original=locator.cases[number-1];
  assert.deepEqual({spot:spec.spot,board:spec.board,path:spec.path,node:spec.node,role:spec.role,action:spec.action},
    {spot:original.id,board:original.board,path:original.path,node:original.node,role:original.role,action:original.action});
  assert.equal(spec.baselineRecord.bytes,original.baseline_record.bytes);assert.equal(spec.baselineRecord.sha256,original.baseline_record.sha256);
  const baseline=readPinned(spec.baselineRecord),row=baseline.rows[spec.baselineRowIndex];
  assert.deepEqual({board:row.board,path:row.path,node:row.node},{board:spec.board,path:spec.path,node:spec.node});
  const flop=readPinned(spec.policies.flop),later=readPinned(spec.policies.later);
  for(const [kind,artifact] of [['flop',flop],['later',later]]){assert.equal(spec.policies[kind].sha256,baseline.policies[kind].file_sha256);assert.deepEqual(artifact.metadata,baseline.policies[kind].metadata);}
  const inputs=loadInputs(spec.spot);assert.equal(inputs.fingerprint,spec.sourceFingerprint);assert.equal(inputs.fingerprint,baseline.source_fingerprint);
  const model=createEffectiveDefence(inputs,flop,later);
  return {spec,inputs,flop,later,model,baseline,row,manifestIdentity:{path:MANIFEST,bytes:bytes.length,sha256:MANIFEST_SHA},
    artifactFileIdentity:spec.policies,baselineIdentity:spec.baselineRecord,locatorIdentity:manifest.originalLocator};
}
function emit(base,scenario,payload){
  mkdirSync(DIRECTORY,{recursive:true});const filename=`six-real-case-${base?.spec.caseNumber??'unknown'}-${scenario}-${Date.now()}-${process.pid}.json`;
  const record={kind:'bounded-six-original-real-case-diagnostic-not-acceptance',scenario,case:base?.spec??null,
    completion:'This file covers its recorded stage only; all required files and a successful enclosing receipt are necessary',
    semantics:'unnormalized own-action realization; not a public or hero posterior',numericEncoding:'Round-trip JSON binary64 numbers plus BE binary64 hex for every full vector',
    modelIdentity:base?.model.identity??null,artifactProvenance:base?.model.artifactProvenance??null,assumptionContract:base?.model.belief??null,
    addedFixtureManifest:base?.manifestIdentity??{path:MANIFEST,sha256:MANIFEST_SHA},artifactFileIdentity:base?.artifactFileIdentity??null,
    baselineIdentity:base?.baselineIdentity??null,locatorIdentity:base?.locatorIdentity??null,
    referenceScope:'Independent eager chronological products; frozen raw Defence, tiers, geometry and scheduled equity shared',...payload};
  const bytes=JSON.stringify(record,null,2)+'\n';writeFileSync(new URL(filename,DIRECTORY),bytes,{flag:'wx'});
  const descriptor={path:'.local/hu-model11/'+filename,bytes:Buffer.byteLength(bytes),sha256:digest(bytes)};
  console.log(JSON.stringify({kind:'six-real-lossless-evidence-file',caseNumber:base?.spec.caseNumber??null,scenario,...descriptor,checks:payload.checks??null,coverage:payload.coverage??null}));return descriptor;
}
function capture(base,request){
  const prefix=base.model.prefix(request),seats=[base.inputs.spot.ip,base.inputs.spot.oop];
  const ranges=Object.fromEntries(seats.map(seat=>[seat,base.model.rangeState(request,seat)]));
  const ids=comboRange(base.inputs.seatRows[prefix.pending.seat],'freq',prefix.board).map(item=>comboId(...item.combo)).sort((a,b)=>a-b);
  const laws=new Map(ids.map(id=>[id,base.model.law(request,cards(id))])),eager=slowPrefixReference(base.inputs,base.flop.policy,base.later.policy,request);
  const mismatches={coverage:Number(!isDeepStrictEqual(ids,[...eager.laws.keys()])),laws:[],vectors:Object.fromEntries(seats.map(seat=>[seat,[]]))};
  for(const id of ids){const law=laws.get(id);if(!isDeepStrictEqual({rawMix:law.rawMix,labelMass:law.labelMass,physicalMass:law.physicalMass},eager.laws.get(id)))mismatches.laws.push(id);}
  for(const seat of seats)for(let id=0;id<2704;id++)if(!Object.is(ranges[seat].weights[id],eager.weights[seat][id]))mismatches.vectors[seat].push(id);
  return {request,prefix,seats,ids,laws,ranges,eager,mismatches,mismatchCount:mismatches.coverage+mismatches.laws.length+Object.values(mismatches.vectors).reduce((n,ids)=>n+ids.length,0)};
}
function pack(snapshot){
  const first=snapshot.laws.values().next().value,common=Object.fromEntries(['modelIdentity','beliefIdentity','executorIdentity','prefix','aggregation'].map(key=>[key,first?.provenance[key]??null]));
  const rows=snapshot.ids.map(id=>{const law=snapshot.laws.get(id),status={...law.provenance};for(const key of Object.keys(common)){assert.deepEqual(status[key],common[key]);delete status[key];}return {comboId:id,cards:cards(id),law:{...law,provenance:status},eager:snapshot.eager.laws.get(id)};});
  return {request:snapshot.request,prefix:snapshot.prefix,prefixIdentity:contentHash(snapshot.prefix),commonLawProvenance:common,
    reconstruction:'Merge commonLawProvenance with row.law.provenance',rows,
    ranges:Object.fromEntries(snapshot.seats.map(seat=>{const state=snapshot.ranges[seat],weights=Array.from(state.weights),eager=Array.from(snapshot.eager.weights[seat]);return [seat,{...state,weights,weightsHex:hex(weights),eager,eagerHex:hex(eager)}];})),
    coverage:{baseSupportedActorLaws:snapshot.ids.length,seats:Object.fromEntries(snapshot.seats.map(seat=>[seat,summary(snapshot.ranges[seat].weights)]))},checks:{mismatches:snapshot.mismatches,mismatchCount:snapshot.mismatchCount}};
}
function requireCapture(snapshot){assert.equal(snapshot.mismatchCount,0);assert.ok(snapshot.ids.length>0);for(const seat of snapshot.seats)assert.equal(snapshot.ranges[seat].weights.length,2704);}
function factors(snapshot,action){
  const actor=snapshot.prefix.pending.seat,weights=Object.fromEntries(snapshot.seats.map(seat=>[seat,snapshot.ranges[seat].weights.slice()])),rows=[],underflow=[];let positiveCombos=0;
  for(let id=0;id<2704;id++){const before=weights[actor][id],percent=snapshot.laws.get(id)?.physicalMass[action]??0,factor=percent/100,after=before*factor;
    if(percent>0&&factor===0)underflow.push({comboId:id,stage:'percent-to-probability'});if(before>0&&percent>0&&after===0)underflow.push({comboId:id,stage:'realization-product'});
    if(before>0&&percent>0)positiveCombos++;weights[actor][id]=after;rows.push({comboId:id,cards:cards(id),before,percent,factor,after,beforeHex:hex([before]),factorHex:hex([factor]),afterHex:hex([after])});}
  return {actor,action,weights,rows,underflow,positiveCombos,total:summary(weights[actor]).total};
}
function packFactors(value){return {...value,weights:Object.fromEntries(Object.entries(value.weights).map(([seat,weights])=>[seat,{weights:Array.from(weights),weightsHex:hex(weights),...summary(weights)}]))};}

// Diagnostic contrast only: the protected model10 saved-conditioning implementation,
// using pinned JS queries. This does not replace the separately required frozen-baseline old45 test.
class Conditioning10 extends Defence{
  queryEquity(range,id,tables){return equityVersus(range,id,tables,{wasm:false});}
  queryEquities(range,ids,tables){return equitiesVersus(range,ids,tables,{wasm:false});}
}
function contrast10(base,snapshot,raw){
  const table=replayDecision(base.inputs,snapshot.prefix.board,snapshot.prefix.path,base.inputs.config),target=table.log.at(-1);
  const ranges=Object.fromEntries(snapshot.seats.map(seat=>[seat,raw.rangeOf(table,snapshot.prefix.board,seat)]));
  const cap=raw.betting(table,snapshot.prefix.board,target.node),laws=new Map();
  for(const id of snapshot.ids){const saved=raw.baseMix(table,snapshot.prefix.board,target.node,cards(id)),mix=cap?cap.applyCombo(saved,cards(id)):saved;
    laws.set(id,compileDeclaredPolicyLaw(mix,snapshot.prefix.pending.observation.actions,snapshot.prefix.pending.observation));}
  const lawDifferences=snapshot.ids.filter(id=>{const law=snapshot.laws.get(id),other=laws.get(id);return !isDeepStrictEqual({rawMix:law.rawMix,labelMass:law.labelMass,physicalMass:law.physicalMass},{rawMix:other.rawMix,labelMass:other.labelMass,physicalMass:other.physicalMass});});
  const rangeDifferences=Object.fromEntries(snapshot.seats.map(seat=>[seat,Array.from(ranges[seat].keys()).filter(id=>!Object.is(ranges[seat][id],snapshot.ranges[seat].weights[id]))]));
  return {scope:'Model10 saved-conditioning contrast from unchanged protected Defence with pinned JS; no claim of old execution-order/legacy-baseline parity',
    laws:snapshot.ids.map(id=>({comboId:id,cards:cards(id),law:laws.get(id)})),ranges:Object.fromEntries(snapshot.seats.map(seat=>[seat,{weights:Array.from(ranges[seat]),weightsHex:hex(ranges[seat]),...summary(ranges[seat])}])),
    lawDifferences,rangeDifferences,differenceCount:lawDifferences.length+Object.values(rangeDifferences).reduce((n,ids)=>n+ids.length,0),
    diagnosticIdentity:{model:10,defenceVersion:6,physicalActionModel:10,inputFingerprint:base.inputs.fingerprint,flopPolicyContentHash:contentHash(base.flop.policy),laterPolicyContentHash:contentHash(base.later.policy)}};
}
function causalTrace(base,before){
  const table=replayDecision(base.inputs,before.prefix.board,before.prefix.path,base.inputs.config),raw=new Conditioning10(base.inputs,base.flop.policy,base.later.policy),files=[];let firstDifference=null,firstFullLawDifference=null;
  for(const [index,entry] of table.log.entries()){
    const snapshot=entry.action===null?before:capture(base,requestBeforeEntry(table,before.prefix.board,entry));
    const contrast=contrast10(base,snapshot,raw),actionForContrast=entry.action??base.spec.action,lawFactorDifferences=snapshot.ids.filter(id=>snapshot.laws.get(id).physicalMass[actionForContrast]!==contrast.laws.find(row=>row.comboId===id).law.physicalMass[actionForContrast]);
    const difference={index,entry,prefix:snapshot.prefix,prefixIdentity:contentHash(snapshot.prefix),lawDifferenceCount:contrast.lawDifferences.length,
      actionForContrast,lawFactorDifferences,rangeDifferences:contrast.rangeDifferences,differenceCount:contrast.differenceCount};
    if(!firstFullLawDifference&&difference.lawDifferenceCount>0)firstFullLawDifference=difference;
    if(!firstDifference&&(lawFactorDifferences.length>0||Object.values(contrast.rangeDifferences).some(ids=>ids.length)))firstDifference=difference;
    files.push(emit(base,'causal-step-'+index,{model11:pack(snapshot),model10Conditioning:contrast,observedAction:entry.action,
      model11ObservedFactor:entry.action===null?null:packFactors(factors(snapshot,entry.action)),difference,checks:{referenceMismatchCount:snapshot.mismatchCount},coverage:pack(snapshot).coverage}));requireCapture(snapshot);
  }
  return {files,firstDifference,firstFullLawDifference,scope:'All strict earlier public decisions and current cap law are retained; causal contrast uses the observed earlier-action factor or range, then the current allin factor. Other raw-law differences remain separate; historical record values remain provenance'};
}
function defenderDiagnostics(base,before,after){
  const actor=before.prefix.pending.seat,defender=after.prefix.pending.seat,table=after.eager.table,range=makeRange(after.ranges[actor].weights),tables=finalTables(after.prefix.board),scores=tables[0].score;
  const ordinary=equitiesVersus(range,after.ids,tables,{wasm:false}),call=Math.min(table.stacks[defender],Math.round((table.invested[actor]-table.invested[defender])*100)/100),finalPot=table.pot+call,rake=Math.min(finalPot*gameConfig.rake.rate,gameConfig.rake.cap_bb);
  const compiled=compileRiverCallEv({street:'river',board:after.prefix.board,call,finalPot,rake,bettorRange:range},scores),raw=new Conditioning10(base.inputs,base.flop.policy,base.later.policy),rows=[],mismatches=[];
  const counts={liveDefenders:0,livePositiveCompatible:0,liveUnavailablePositiveCompatible:0,liveKnownOrdinary:0,liveExactIncompatible:0,liveExactKnown:0,liveExactUnknown:0,kernelExactRequested:0};
  for(let index=0;index<after.ids.length;index++){
    const id=after.ids[index],hero=cards(id),law=after.laws.get(id),own=after.ranges[defender].weights[id];
    const compatible=[];let mass=0;for(let other=0;other<2704;other++){const weight=after.ranges[actor].weights[other];if(weight>0&&cards(other).every(card=>!hero.includes(card))){mass+=weight;compatible.push({comboId:other,cards:cards(other),weight,weightHex:hex([weight]),rank:scores[other],outcome:scores[other]<scores[id]?'hero-win':scores[other]===scores[id]?'tie':'hero-loss'});}}
    const equity=ordinary[index],expectedStatus=!range.ids.length?'opponent-empty':!compatible.length?'exact-incompatibility':equity===null?'positive-support-equity-unavailable':'known';
    const exact=exactRiverCallEv(compiled,hero),saved=raw.baseMix(table,after.prefix.board,after.prefix.pending.node,hero),fallback=compileDeclaredPolicyLaw(saved,law.actions,after.prefix.pending.observation);
    const fallbackMatches=equity!==null||isDeepStrictEqual({rawMix:law.rawMix,labelMass:law.labelMass,physicalMass:law.physicalMass},{rawMix:fallback.rawMix,labelMass:fallback.labelMass,physicalMass:fallback.physicalMass});
    const mismatchFields=[];if(law.provenance.equity!==expectedStatus)mismatchFields.push('ordinary-status');if(equity===null&&law.provenance.fallback!=='saved-capped')mismatchFields.push('fallback-provenance');if(!fallbackMatches)mismatchFields.push('fallback-law');
    if(typeof law.provenance.exactRiverSign==='number'&&(exact.status!=='known'||exact.sign!==law.provenance.exactRiverSign))mismatchFields.push('requested-kernel-exact-sign');
    if(mismatchFields.length)mismatches.push({comboId:id,mismatchFields});
    if(own>0){counts.liveDefenders++;if(compatible.length&&mass>0)counts.livePositiveCompatible++;if(expectedStatus==='positive-support-equity-unavailable')counts.liveUnavailablePositiveCompatible++;if(expectedStatus==='known')counts.liveKnownOrdinary++;if(expectedStatus==='exact-incompatibility')counts.liveExactIncompatible++;counts[exact.status==='known'?'liveExactKnown':'liveExactUnknown']++;}
    if(typeof law.provenance.exactRiverSign==='number')counts.kernelExactRequested++;
    rows.push({comboId:id,cards:hero,rank:scores[id],ownRealization:own,ownRealizationHex:hex([own]),ordinaryEquity:equity,ordinaryEquityHex:equity===null?null:hex([equity]),expectedOrdinaryStatus:expectedStatus,
      kernelStatus:law.provenance,sourceSavedAfterImpossibleRaiseTransfer:saved,fallbackLaw:fallback,fallbackMatches,
      compatibleCount:compatible.length,compatibleMass:mass,compatibleMassHex:hex([mass]),compatible,exactSupportDiagnostic:exact,mismatchFields});
  }
  const exactCompilation=compiled.status==='compiled'?{status:compiled.status,netPot:compiled.netPot,call:compiled.call,netUnits:compiled.netUnits.toString(),callUnits:compiled.callUnits.toString(),rows:compiled.rows.map(row=>({...row,units:row.units.toString()}))}:compiled;
  return {actor,defender,call,finalPot,rake,ordinarySchedule:'All unblocked defender base-support IDs in canonical ascending order; unchanged JS first-three scan then indexed; no range normalization',
    exactScope:'Supplemental exact support/sign diagnostic is independent of ordinary availability; not-requested kernel exact signs remain explicitly not-requested',
    counts,exactCompilation,scoreByCombo:Array.from(scores),rows,checks:{mismatches,mismatchCount:mismatches.length}};
}
function runCase(base){
  const request={board:parseCards(base.spec.board,5),path:base.spec.path},before=capture(base,request);
  assert.equal(before.prefix.pending.node,base.spec.node);assert.equal(before.prefix.pending.seat,base.inputs.spot[base.spec.role]);
  const beforeFile=emit(base,'before',{snapshot:pack(before),historicalModel10Row:base.row,historicalValuesAreRequiredTargets:false,checks:{referenceMismatchCount:before.mismatchCount},coverage:pack(before).coverage});requireCapture(before);
  assert.ok(before.seats.every(seat=>before.ranges[seat].total>0),'Each original current decision must have nonempty live support before branch classification');
  const trace=causalTrace(base,before),branch=factors(before,'allin'),actorTotal=before.ranges[branch.actor].total,probability=actorTotal>0?branch.total/actorTotal:null;
  const probabilityUnderflow=branch.total>0&&actorTotal>0&&probability===0;
  const next={board:[...request.board],path:{...before.prefix.path,river:[...before.prefix.path.river,'allin']}},facingPrefix=base.model.prefix(next);
  const branchFile=emit(base,'branch-factor',{beforeFile,trace,branch:packFactors(branch),actorTotal,probability,probabilityHex:probability===null?null:hex([probability]),probabilityUnderflow,
    legalFacingPrefix:facingPrefix,historicalBranchSummary:base.spec.historicalBranchSummary,checks:{underflowCount:branch.underflow.length,probabilityUnderflow,positiveBranch:branch.total>0}});
  assert.equal(branch.underflow.length,0,'A positive mathematical factor may not silently underflow');assert.equal(probabilityUnderflow,false);
  if(branch.total===0){
    let failure;try{base.model.rangeState(next,branch.actor);}catch(error){failure={name:error.name,status:error.status??null,message:error.message};}
    const eager=slowPrefixReference(base.inputs,base.flop.policy,base.later.policy,next);
    const mismatch=before.seats.flatMap(seat=>Array.from(branch.weights[seat].keys()).filter(id=>!Object.is(branch.weights[seat][id],eager.weights[seat][id])).map(comboId=>({seat,comboId})));
    emit(base,'exact-zero-off-model',{beforeFile,branchFile,trace,legalFacingPrefix:facingPrefix,derivedAfter:packFactors(branch),failure:failure??null,
      model11AfterLawStatus:'Unavailable: observed allin has exact zero model likelihood; no fabricated resolved defender law',
      eagerAfter:{weights:Object.fromEntries(before.seats.map(seat=>[seat,{weights:Array.from(eager.weights[seat]),weightsHex:hex(eager.weights[seat])}])),laws:[...eager.laws].map(([comboId,law])=>({comboId,law}))},
      coverageGap:'This original case no longer exercises positive-support unavailable equity under model11',checks:{mismatchCount:mismatch.length,mismatch,typedOffModel:failure?.status==='off-model-observed-action'}});
    assert.equal(failure?.status,'off-model-observed-action');assert.equal(mismatch.length,0);return;
  }
  const after=capture(base,next),factorMismatch=before.seats.flatMap(seat=>Array.from(branch.weights[seat].keys()).filter(id=>!Object.is(branch.weights[seat][id],after.ranges[seat].weights[id])).map(comboId=>({seat,comboId})));
  const afterFile=emit(base,'after',{beforeFile,branchFile,snapshot:pack(after),factorMismatch,checks:{referenceMismatchCount:after.mismatchCount,factorMismatchCount:factorMismatch.length},coverage:pack(after).coverage});requireCapture(after);assert.equal(factorMismatch.length,0);
  const diagnostic=defenderDiagnostics(base,before,after),diagnosticFile=emit(base,'support-status',{beforeFile,branchFile,afterFile,diagnostic,checks:diagnostic.checks,coverage:diagnostic.counts});assert.equal(diagnostic.checks.mismatchCount,0);
  const terminalFactors=factors(after,'call'),terminal={board:next.board,path:{...after.prefix.path,river:[...after.prefix.path.river,'call']}};let terminalFailure;
  try{base.model.prefix(terminal);}catch(error){terminalFailure={name:error.name,status:error.status??null,message:error.message};}
  const gaps=[];if(!diagnostic.counts.liveUnavailablePositiveCompatible)gaps.push('No live positive-compatible ordinary-unavailable defender; required numerical regime remains a separate control');
  if(!diagnostic.counts.livePositiveCompatible)gaps.push('No compatible live defender for the positive branch; exact incompatibility remains explicit');
  if(!diagnostic.counts.liveExactKnown)gaps.push('No known supplemental exact sign on live defenders');
  emit(base,'summary',{beforeFile,branchFile,afterFile,diagnosticFile,trace,currentBranch:{mass:branch.total,probability,actorTotal,positiveCombos:branch.positiveCombos},
    historicalBranchSummary:base.spec.historicalBranchSummary,terminalRequest:terminal,terminalFailure:terminalFailure??null,terminalOwnRealization:packFactors(terminalFactors),
    terminalStatus:'Call completes the hand; terminal vectors are factor products, not a fabricated pending successor',coverageGaps:gaps,
    causalExplanation:{firstEarlierOrCurrentDifference:trace.firstDifference,historicalProbability:base.spec.historicalBranchSummary.frequency,currentProbability:probability,
      note:trace.firstDifference?'Inspect the first preserved full-prefix conditioning contrast and every subsequent product; old tiny probabilities and signs are not forced targets':'No saved-conditioning contrast detected on these recorded prefixes; current cap labels/remainder and historical source row are preserved for numerical inspection'},
    checks:{referenceMismatchCount:before.mismatchCount+after.mismatchCount,factorMismatchCount:factorMismatch.length,statusMismatchCount:diagnostic.checks.mismatchCount,terminalUnderflowCount:terminalFactors.underflow.length,terminalRejected:terminalFailure?.status==='invalid-public-prefix'},coverage:diagnostic.counts});
  assert.equal(terminalFactors.underflow.length,0);assert.equal(terminalFailure?.status,'invalid-public-prefix');
}
for(let number=1;number<=6;number++)test(`six real support case ${number} retains exact fixtures complete laws vectors and explicit numerical states`,()=>{
  let base;try{base=fixture(number);runCase(base);}catch(error){emit(base,'failure',{requestedCaseNumber:number,failure:{name:error.name,status:error.status??null,message:error.message},checks:{completed:false}});throw error;}
});
