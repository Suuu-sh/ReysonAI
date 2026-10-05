import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { loadInputs, artifactPaths } from '../scripts/postflop-ai/inputs.mjs';
import { comboId, defenceFor, replayDecision, DEFENCE_VERSION, NEW_HU_DEFENCE_VERSION, Defence, tierArray } from '../scripts/postflop-ai/defence.mjs';
import { parseCards, TIERS } from '../scripts/postflop-ai/model.mjs';
import { choose, referencePolicyFor, policyMix } from '../scripts/postflop-ai/policy.mjs';
import { referenceLaterPolicy, laterPolicyMix } from '../scripts/postflop-ai/later-policy.mjs';
import { seededRandom, seedFor } from '../scripts/lib/equity.mjs';
import { equitiesVersus } from '../scripts/postflop-ai/range-equity.mjs';
import { gameConfig } from '../src/estimated/sizing.ts';
import { actionProjection, canonicalPostflopPath } from '../scripts/postflop-ai/observable-actions.mjs';
import { contentHash, canonicalJson, savedPayloadHash, freezeSnapshot } from '../scripts/postflop-ai/effective-law-identity.mjs';
import { balancedExecutor, referenceExecutor, balancedBeliefContract, compileDeclaredPolicyLaw, sampleEffectiveAction, referenceActionLaw } from '../scripts/postflop-ai/effective-action-law.mjs';
import { createEffectiveDefence, CompletedLawCache, multiplyDeclaredMass } from '../scripts/postflop-ai/effective-reach.mjs';
import { comboRange } from '../scripts/postflop-ai/browser-inputs.mjs';
import { slowPrefixReference } from './helpers/model11-slow-reference.mjs';
const BTN='BTN_open_SB_3bet_BB_call_BTN_fold';
const HJ='HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_fold_BTN_call';
function fixture(id=BTN,options){const inputs=loadInputs(id),paths=artifactPaths(inputs.spot),flop=JSON.parse(readFileSync(paths.candidate)),later=JSON.parse(readFileSync(paths.laterCandidate));return {inputs,flop,later,model:createEffectiveDefence(inputs,flop,later,options)};}
const req=(text,path)=>({board:parseCards(text,text.length/2),path});
const sha=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');

test('browser-safe content IDs match independent SHA256 and contracts are immutable',()=>{
  for(const value of [null,'abc','日本語',{z:1,a:[true,3]},balancedBeliefContract()])assert.equal(contentHash(value),sha(value));
  const b=balancedExecutor();assert.ok(Object.isFrozen(b.nodeOrders.btn_first));assert.equal(b.identity,balancedExecutor().identity);
  assert.notEqual(referenceExecutor('passive').identity,referenceExecutor('aggressive').identity);
  assert.throws(()=>balancedExecutor({order:'filtered-Agent'}),/separate adapter/);
});

test('strict public prefix has no private/future inputs and rejects terminal suffixes',()=>{
  const {model}=fixture();const request=req('Jc9d4h2s',{flop:['check','check'],turn:['bet125']});
  const p=model.prefix(request);assert.equal(p.pending.node,'turn_ip_vs_125');assert.deepEqual(Object.keys(p).sort(),['board','decisionCount','geometry','path','pending','version']);
  assert.ok(Object.isFrozen(p.path.turn));assert.throws(()=>model.prefix({...request,hands:{SB:[1,2]}}),/Only revealed/);
  assert.throws(()=>model.prefix({...request,path:{...request.path,river:['check']}}),/Future actions/);
  assert.throws(()=>model.prefix(req('Jc9d4h2s',{flop:['check','check'],turn:['bet125','call','check']})));
  const a=model.prefix(req('Jc9d4h2s8c',{flop:['check','check'],turn:['check','check'],river:[]}));
  const b=model.prefix(req('Jc9d4h8c2s',{flop:['check','check'],turn:['check','check'],river:[]}));assert.notDeepEqual(a.board,b.board);
});

test('declared law keeps original label order, alias pooling and tiny final remainder',()=>{
  const observation=actionProjection({street:'river',node:'river_oop_first',pot:30,stacks:{ip:10,oop:10},committed:{ip:0,oop:0}});
  const actions=observation.actions,raw={check:99.99999999999999,bet33:0,bet75:0,bet125:0,allin:0};
  const law=compileDeclaredPolicyLaw(raw,actions,observation);assert.ok(law.labelMass.allin>0);assert.equal(law.physicalMass.allin,law.labelMass.allin);
  assert.equal(law.equalityClaim,'declared-continuous-policy-law; not finite-RNG-grid probability');
  const random=seededRandom(451);for(let i=0;i<1000;i++){const r=random();assert.equal(sampleEffectiveAction(law,r).label,choose(raw,r,actions));}
  for(const r of [0,0.25,0.9999999999999999])assert.equal(sampleEffectiveAction(law,r).label,choose(raw,r,actions));
  assert.throws(()=>sampleEffectiveAction(law,1),/\[0,1\)/);
});

test('completed cache has byte/count bounds and never prunes a stored numeric value',()=>{
  const c=new CompletedLawCache({numericBytes:8,metadataBytes:4,entries:1});
  c.set('a',{numericBytes:8,metadataBytes:4,value:Number.MIN_VALUE});assert.equal(c.get('a').value,Number.MIN_VALUE);
  c.set('b',{numericBytes:8,metadataBytes:4,value:2});assert.equal(c.get('a'),undefined);assert.equal(c.get('b').value,2);assert.equal(c.stats().evictions,1);
  c.clear();assert.equal(c.stats().numericBytes,0);assert.equal(c.stats().metadataBytes,0);
});

test('actual reference profiles are harness-only; balanced belief identity stays fixed',()=>{
  const {model}=fixture();const prefix=model.prefix(req('Jc9d4h',{flop:[]}));const combo=parseCards('AcKd',2);
  const balanced=model.law({board:prefix.board,path:prefix.path},combo);
  const passive=referenceActionLaw(prefix,combo,referenceExecutor('passive')),aggressive=referenceActionLaw(prefix,combo,referenceExecutor('aggressive'));
  assert.notEqual(passive.provenance.executor,aggressive.provenance.executor);assert.equal(model.belief.identity,balancedBeliefContract().identity);
  assert.deepEqual(balanced,model.law({board:prefix.board,path:prefix.path},combo));
  const {inputs,flop,later}=fixture();assert.throws(()=>createEffectiveDefence(inputs,flop,later,{belief:{...balancedBeliefContract(),hiddenProfile:'aggressive'}}),/only immutable balanced/);
});

test('BTN contemporaneous computed-call law becomes the next public-prefix factor on both witness boards',()=>{
  const cardsOf=id=>[Math.floor(id/52),id%52];
  const cardText=card=>'23456789TJQKA'[card>>2]+'cdhs'[card&3];
  const floatBits=value=>{const bytes=new Uint8Array(8);new DataView(bytes.buffer).setFloat64(0,value,false);return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');};
  const summarize=weights=>{let support=0,total=0;for(const weight of weights){if(weight>0)support++;total+=weight;}return {support,total};};
  const summarizeCompatible=(weights,combo)=>{let support=0,total=0;for(let id=0;id<weights.length;id++)if(weights[id]>0&&cardsOf(id).every(card=>!combo.includes(card))){support++;total+=weights[id];}return {support,total};};
  for(const [board,comboText] of [['Jc9d4h2s','QcAd'],['Ac7d2h9h','QcKc']]){
    const {inputs,flop,later,model}=fixture(),actor=inputs.spot.ip,opponent=inputs.spot.oop,seats=[actor,opponent];
    const request=req(board,{flop:['check','check'],turn:['bet125']}),next=req(board+'8c',{flop:['check','check'],turn:['bet125','call'],river:[]});
    const combo=parseCards(comboText,2),id=comboId(...combo),river=next.board.at(-1);
    const currentPrefix=model.prefix(request),afterPrefix=model.prefix(next);
    const beforeStates=Object.fromEntries(seats.map(seat=>[seat,model.rangeState(request,seat)]));
    // This completes the canonical current law once; all later combo queries reuse that vector.
    const witnessLaw=model.law(request,combo);
    const afterStates=Object.fromEntries(seats.map(seat=>[seat,model.rangeState(next,seat)]));
    const before=Object.fromEntries(seats.map(seat=>[seat,beforeStates[seat].weights]));
    const after=Object.fromEntries(seats.map(seat=>[seat,afterStates[seat].weights]));
    const slow=slowPrefixReference(inputs,flop.policy,later.policy,request);
    const nextSlow=slowPrefixReference(inputs,flop.policy,later.policy,next);
    const laws=new Map(),saved=new Map(),lawMismatch={raw:0,labels:0,physical:0,combos:0};
    for(const [comboIndex,independent] of slow.laws){
      const ownCombo=cardsOf(comboIndex),law=model.law(request,ownCombo);
      laws.set(comboIndex,law);
      saved.set(comboIndex,laterPolicyMix(later.policy,currentPrefix.pending.node,ownCombo,currentPrefix.board,currentPrefix.pending.line));
      const rawMismatch=!isDeepStrictEqual(law.rawMix,independent.rawMix),labelMismatch=!isDeepStrictEqual(law.labelMass,independent.labelMass),physicalMismatch=!isDeepStrictEqual(law.physicalMass,independent.physicalMass);
      lawMismatch.raw+=Number(rawMismatch);lawMismatch.labels+=Number(labelMismatch);lawMismatch.physical+=Number(physicalMismatch);lawMismatch.combos+=Number(rawMismatch||labelMismatch||physicalMismatch);
    }
    const vectorMismatches=Object.fromEntries(seats.map(seat=>[seat,{before:0,after:0}]));
    let actorFactorMismatches=0,opponentMaskMismatches=0,positiveActorMissingLaw=0,afterWithoutBefore=0;
    const riverBlocked=Object.fromEntries(seats.map(seat=>[seat,{beforePositiveCombos:0,beforeMass:0,actionAdjustedBlockedMass:0}]));
    const savedZeroRetained={eligibleCombos:0,preRiverCallMass:0,retainedCombos:0,retainedMass:0};
    let currentCallMass=0,survivingActorCombos=0;
    for(let comboIndex=0;comboIndex<before[actor].length;comboIndex++){
      const blocked=cardsOf(comboIndex).includes(river),law=laws.get(comboIndex);
      if(before[actor][comboIndex]>0&&!law)positiveActorMissingLaw++;
      const expectedActor=blocked?0:before[actor][comboIndex]*((law?.physicalMass.call??0)/100);
      const expectedOpponent=blocked?0:before[opponent][comboIndex];
      if(!Object.is(after[actor][comboIndex],expectedActor))actorFactorMismatches++;
      if(!Object.is(after[opponent][comboIndex],expectedOpponent))opponentMaskMismatches++;
      if(after[actor][comboIndex]>0){survivingActorCombos++;if(!(before[actor][comboIndex]>0))afterWithoutBefore++;}
      const callMass=before[actor][comboIndex]*((law?.physicalMass.call??0)/100);currentCallMass+=callMass;
      if(before[actor][comboIndex]>0&&saved.get(comboIndex)?.call===0&&law?.physicalMass.call>0){
        savedZeroRetained.eligibleCombos++;savedZeroRetained.preRiverCallMass+=callMass;
        if(after[actor][comboIndex]>0){savedZeroRetained.retainedCombos++;savedZeroRetained.retainedMass+=after[actor][comboIndex];}
      }
      for(const seat of seats){
        if(!Object.is(before[seat][comboIndex],slow.weights[seat][comboIndex]))vectorMismatches[seat].before++;
        if(!Object.is(after[seat][comboIndex],nextSlow.weights[seat][comboIndex]))vectorMismatches[seat].after++;
        if(blocked&&before[seat][comboIndex]>0){riverBlocked[seat].beforePositiveCombos++;riverBlocked[seat].beforeMass+=before[seat][comboIndex];riverBlocked[seat].actionAdjustedBlockedMass+=seat===actor?callMass:before[seat][comboIndex];}
      }
    }
    const compatibleBefore=summarizeCompatible(before[opponent],combo),compatibleAfter=summarizeCompatible(after[opponent],combo);
    const witness={comboId:id,cards:combo,text:comboText,actor,opponent,
      sourceSavedTierRuleMixBeforeCapsAndComputedDefence:saved.get(id),effectiveRawMix:witnessLaw.rawMix,
      effectiveLabelMass:witnessLaw.labelMass,effectivePhysicalMass:witnessLaw.physicalMass,
      realizationBefore:before[actor][id],realizationAfter:after[actor][id],
      realizationBeforeHex:floatBits(before[actor][id]),realizationAfterHex:floatBits(after[actor][id]),
      expectedAfter:combo.includes(river)?0:before[actor][id]*(witnessLaw.physicalMass.call/100),riverBlocked:combo.includes(river),
      compatibleOpposingBefore:compatibleBefore,compatibleOpposingAfter:compatibleAfter};
    const rows=[];
    // All1326 legal card combos are emitted. Full2704 vectors below retain every matrix slot too.
    for(let a=0;a<52;a++)for(let b=a+1;b<52;b++){
      const comboIndex=comboId(a,b),law=laws.get(comboIndex),independent=slow.laws.get(comboIndex),blocked=a===river||b===river;
      rows.push({comboId:comboIndex,cards:[a,b],text:cardText(a)+cardText(b),riverBlocked:blocked,
        realization:Object.fromEntries(seats.map(seat=>[seat,{before:before[seat][comboIndex],after:after[seat][comboIndex],
          beforeHex:floatBits(before[seat][comboIndex]),afterHex:floatBits(after[seat][comboIndex]),
          eagerBefore:slow.weights[seat][comboIndex],eagerAfter:nextSlow.weights[seat][comboIndex]}])),
        sourceSavedTierRuleMixBeforeCapsAndComputedDefence:saved.get(comboIndex)??null,
        actorLaw:law?{rawMix:law.rawMix,labelMass:law.labelMass,physicalMass:law.physicalMass,provenance:law.provenance}:null,
        eagerActorLaw:independent??null,
        expectedActorAfter:blocked?0:before[actor][comboIndex]*((law?.physicalMass.call??0)/100),
        expectedOpponentAfter:blocked?0:before[opponent][comboIndex]});
    }
    const artifactFiles=artifactPaths(inputs.spot),artifactFileIdentity=Object.fromEntries(['candidate','laterCandidate'].map(kind=>{const bytes=readFileSync(artifactFiles[kind]);return [kind,{path:artifactFiles[kind],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];}));
    const positiveWitness=before[actor][id]>0&&witnessLaw.physicalMass.call>0&&after[actor][id]>0&&compatibleBefore.total>0&&compatibleAfter.total>0;
    const mismatchCount=lawMismatch.combos+Object.values(vectorMismatches).reduce((sum,value)=>sum+value.before+value.after,0)+actorFactorMismatches+opponentMaskMismatches+positiveActorMissingLaw+afterWithoutBefore;
    const evidence={kind:'bounded-BTN-causal-comparison-not-acceptance',semantics:'unnormalized own-action realization; not a public or hero posterior',
      numericEncoding:'JSON numbers round-trip binary64; every legal combo also records big-endian binary64 weight hex',
      board,requestedBoardCount:2,boardEvidenceOnly:true,overallTwoBoardOutcome:'Read the enclosing bounded test receipt; one board artifact does not establish two-board completion',riverCard:river,riverText:cardText(river),modelIdentity:model.identity,artifactProvenance:model.artifactProvenance,
      artifactFileIdentity,assumptionContract:model.belief,currentPrefix,afterPrefix,witness,
      referenceScope:'independent eager chronological reach/products; frozen raw Defence, geometry and scheduled range-equity stages shared',
      coverage:{legalComboRows:rows.length,currentActorBaseSupportLaws:laws.size,rangeVectorLength:before[actor].length,
        survivingActorCombos,currentCallMassBeforeRiverMask:currentCallMass,
        bySeat:Object.fromEntries(seats.map(seat=>[seat,{before:summarize(before[seat]),after:summarize(after[seat]),
          eagerBefore:summarize(slow.weights[seat]),eagerAfter:summarize(nextSlow.weights[seat]),
          beforeStatus:beforeStates[seat].status,afterStatus:afterStates[seat].status}]))},
      riverBlocked,savedCallZeroEffectiveCallPositive:savedZeroRetained,
      checks:{positiveWitness,lawMismatch,vectorMismatches,actorFactorMismatches,opponentMaskMismatches,positiveActorMissingLaw,afterWithoutBefore,mismatchCount},
      vectors:Object.fromEntries(seats.map(seat=>[seat,{before:Array.from(before[seat]),after:Array.from(after[seat]),
        eagerBefore:Array.from(slow.weights[seat]),eagerAfter:Array.from(nextSlow.weights[seat])}])),rows,cacheStats:model.cacheStats()};
    const directory=new URL('../.local/hu-model11/',import.meta.url);mkdirSync(directory,{recursive:true});
    const filename=`btn-causal-${board}-${Date.now()}-${process.pid}.json`,destination=new URL(filename,directory),bytes=JSON.stringify(evidence,null,2)+'\n';
    writeFileSync(destination,bytes,{flag:'wx'});
    console.log(JSON.stringify({kind:'BTN-causal-evidence-file',path:'.local/hu-model11/'+filename,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes),board,witness,checks:evidence.checks,coverage:evidence.coverage}));
    // Evidence is preserved even if a non-vacuity or complete-vector comparison fails.
    assert.ok(before[actor][id]>0,`${board}: witness must reach the current decision`);
    assert.equal(witness.sourceSavedTierRuleMixBeforeCapsAndComputedDefence.call,0,`${board}: fixed witness must have saved call zero`);
    assert.ok(witnessLaw.physicalMass.call>0,`${board}: current declared physical call must be positive`);
    assert.ok(after[actor][id]>0,`${board}: witness must survive the call and river mask`);
    assert.ok(compatibleBefore.total>0&&compatibleAfter.total>0,`${board}: witness needs compatible opposing support before and after`);
    assert.equal(mismatchCount,0,`${board}: full law/vector/factor comparisons must all agree exactly`);
    assert.equal(rows.length,1326);assert.ok(survivingActorCombos>0);
    assert.ok(savedZeroRetained.retainedCombos>0&&savedZeroRetained.retainedMass>0,`${board}: saved-call-zero/effective-call-positive mass must be retained`);
  }
});

test('HJ flop computed-call factor survives turn with complete causal evidence without asserting poker quality',()=>{
  const cardsOf=id=>[Math.floor(id/52),id%52];
  const cardText=card=>'23456789TJQKA'[card>>2]+'cdhs'[card&3];
  const floatBits=value=>{const bytes=new Uint8Array(8);new DataView(bytes.buffer).setFloat64(0,value,false);return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');};
  const summarize=weights=>{let support=0,total=0;for(const weight of weights){if(weight>0)support++;total+=weight;}return {support,total};};
  const summarizeCompatible=(weights,combo)=>{let support=0,total=0;for(let id=0;id<weights.length;id++)if(weights[id]>0&&cardsOf(id).every(card=>!combo.includes(card))){support++;total+=weights[id];}return {support,total};};
  for(const [board,comboText] of [['Js8s5d','KdAd']]){
    const {inputs,flop,later,model}=fixture(HJ),actor=inputs.spot.ip,opponent=inputs.spot.oop,seats=[actor,opponent];
    const request=req(board,{flop:['bet125']}),next=req(board+'2c',{flop:['bet125','call'],turn:[]});
    const combo=parseCards(comboText,2),id=comboId(...combo),turn=next.board.at(-1);
    const currentPrefix=model.prefix(request),afterPrefix=model.prefix(next);
    const beforeStates=Object.fromEntries(seats.map(seat=>[seat,model.rangeState(request,seat)]));
    // This completes the canonical current law once; all later combo queries reuse that vector.
    const witnessLaw=model.law(request,combo);
    const afterStates=Object.fromEntries(seats.map(seat=>[seat,model.rangeState(next,seat)]));
    const before=Object.fromEntries(seats.map(seat=>[seat,beforeStates[seat].weights]));
    const after=Object.fromEntries(seats.map(seat=>[seat,afterStates[seat].weights]));
    const slow=slowPrefixReference(inputs,flop.policy,later.policy,request);
    const nextSlow=slowPrefixReference(inputs,flop.policy,later.policy,next);
    const laws=new Map(),saved=new Map(),lawMismatch={raw:0,labels:0,physical:0,combos:0};
    for(const [comboIndex,independent] of slow.laws){
      const ownCombo=cardsOf(comboIndex),law=model.law(request,ownCombo);
      laws.set(comboIndex,law);
      saved.set(comboIndex,policyMix(flop.policy,currentPrefix.pending.node,ownCombo,currentPrefix.board));
      const rawMismatch=!isDeepStrictEqual(law.rawMix,independent.rawMix),labelMismatch=!isDeepStrictEqual(law.labelMass,independent.labelMass),physicalMismatch=!isDeepStrictEqual(law.physicalMass,independent.physicalMass);
      lawMismatch.raw+=Number(rawMismatch);lawMismatch.labels+=Number(labelMismatch);lawMismatch.physical+=Number(physicalMismatch);lawMismatch.combos+=Number(rawMismatch||labelMismatch||physicalMismatch);
    }
    const vectorMismatches=Object.fromEntries(seats.map(seat=>[seat,{before:0,after:0}]));
    let actorFactorMismatches=0,opponentMaskMismatches=0,positiveActorMissingLaw=0,afterWithoutBefore=0;
    const turnBlocked=Object.fromEntries(seats.map(seat=>[seat,{beforePositiveCombos:0,beforeMass:0,actionAdjustedBlockedMass:0}]));
    const savedZeroRetained={eligibleCombos:0,preTurnCallMass:0,retainedCombos:0,retainedMass:0};
    let currentCallMass=0,survivingActorCombos=0;
    for(let comboIndex=0;comboIndex<before[actor].length;comboIndex++){
      const blocked=cardsOf(comboIndex).includes(turn),law=laws.get(comboIndex);
      if(before[actor][comboIndex]>0&&!law)positiveActorMissingLaw++;
      const expectedActor=blocked?0:before[actor][comboIndex]*((law?.physicalMass.call??0)/100);
      const expectedOpponent=blocked?0:before[opponent][comboIndex];
      if(!Object.is(after[actor][comboIndex],expectedActor))actorFactorMismatches++;
      if(!Object.is(after[opponent][comboIndex],expectedOpponent))opponentMaskMismatches++;
      if(after[actor][comboIndex]>0){survivingActorCombos++;if(!(before[actor][comboIndex]>0))afterWithoutBefore++;}
      const callMass=before[actor][comboIndex]*((law?.physicalMass.call??0)/100);currentCallMass+=callMass;
      if(before[actor][comboIndex]>0&&saved.get(comboIndex)?.call===0&&law?.physicalMass.call>0){
        savedZeroRetained.eligibleCombos++;savedZeroRetained.preTurnCallMass+=callMass;
        if(after[actor][comboIndex]>0){savedZeroRetained.retainedCombos++;savedZeroRetained.retainedMass+=after[actor][comboIndex];}
      }
      for(const seat of seats){
        if(!Object.is(before[seat][comboIndex],slow.weights[seat][comboIndex]))vectorMismatches[seat].before++;
        if(!Object.is(after[seat][comboIndex],nextSlow.weights[seat][comboIndex]))vectorMismatches[seat].after++;
        if(blocked&&before[seat][comboIndex]>0){turnBlocked[seat].beforePositiveCombos++;turnBlocked[seat].beforeMass+=before[seat][comboIndex];turnBlocked[seat].actionAdjustedBlockedMass+=seat===actor?callMass:before[seat][comboIndex];}
      }
    }
    const compatibleBefore=summarizeCompatible(before[opponent],combo),compatibleAfter=summarizeCompatible(after[opponent],combo);
    const witness={comboId:id,cards:combo,text:comboText,actor,opponent,
      sourceSavedTierRuleMixBeforeCapsAndComputedDefence:saved.get(id),effectiveRawMix:witnessLaw.rawMix,
      effectiveLabelMass:witnessLaw.labelMass,effectivePhysicalMass:witnessLaw.physicalMass,
      realizationBefore:before[actor][id],realizationAfter:after[actor][id],
      realizationBeforeHex:floatBits(before[actor][id]),realizationAfterHex:floatBits(after[actor][id]),
      expectedAfter:combo.includes(turn)?0:before[actor][id]*(witnessLaw.physicalMass.call/100),turnBlocked:combo.includes(turn),
      compatibleOpposingBefore:compatibleBefore,compatibleOpposingAfter:compatibleAfter};
    const rows=[];
    // All1326 legal card combos are emitted. Full2704 vectors below retain every matrix slot too.
    for(let a=0;a<52;a++)for(let b=a+1;b<52;b++){
      const comboIndex=comboId(a,b),law=laws.get(comboIndex),independent=slow.laws.get(comboIndex),blocked=a===turn||b===turn;
      rows.push({comboId:comboIndex,cards:[a,b],text:cardText(a)+cardText(b),turnBlocked:blocked,
        realization:Object.fromEntries(seats.map(seat=>[seat,{before:before[seat][comboIndex],after:after[seat][comboIndex],
          beforeHex:floatBits(before[seat][comboIndex]),afterHex:floatBits(after[seat][comboIndex]),
          eagerBefore:slow.weights[seat][comboIndex],eagerAfter:nextSlow.weights[seat][comboIndex]}])),
        sourceSavedTierRuleMixBeforeCapsAndComputedDefence:saved.get(comboIndex)??null,
        actorLaw:law?{rawMix:law.rawMix,labelMass:law.labelMass,physicalMass:law.physicalMass,provenance:law.provenance}:null,
        eagerActorLaw:independent??null,
        expectedActorAfter:blocked?0:before[actor][comboIndex]*((law?.physicalMass.call??0)/100),
        expectedOpponentAfter:blocked?0:before[opponent][comboIndex]});
    }
    const artifactFiles=artifactPaths(inputs.spot),artifactFileIdentity=Object.fromEntries(['candidate','laterCandidate'].map(kind=>{const bytes=readFileSync(artifactFiles[kind]);return [kind,{path:artifactFiles[kind],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];}));
    const positiveWitness=before[actor][id]>0&&witnessLaw.physicalMass.call>0&&after[actor][id]>0&&compatibleBefore.total>0&&compatibleAfter.total>0;
    const mismatchCount=lawMismatch.combos+Object.values(vectorMismatches).reduce((sum,value)=>sum+value.before+value.after,0)+actorFactorMismatches+opponentMaskMismatches+positiveActorMissingLaw+afterWithoutBefore;
    const evidence={kind:'bounded-HJ-causal-comparison-not-acceptance',semantics:'unnormalized own-action realization; not a public or hero posterior',
      numericEncoding:'JSON numbers round-trip binary64; every legal combo also records big-endian binary64 weight hex',
      board,requestedBoardCount:1,boardEvidenceOnly:true,overallRunOutcome:'Read the enclosing bounded test receipt; this evidence is for the HJ control only',turnCard:turn,turnText:cardText(turn),modelIdentity:model.identity,artifactProvenance:model.artifactProvenance,
      artifactFileIdentity,assumptionContract:model.belief,currentPrefix,afterPrefix,witness,
      referenceScope:'independent eager chronological reach/products; frozen raw Defence, geometry and scheduled range-equity stages shared',
      coverage:{legalComboRows:rows.length,currentActorBaseSupportLaws:laws.size,rangeVectorLength:before[actor].length,
        survivingActorCombos,currentCallMassBeforeTurnMask:currentCallMass,
        bySeat:Object.fromEntries(seats.map(seat=>[seat,{before:summarize(before[seat]),after:summarize(after[seat]),
          eagerBefore:summarize(slow.weights[seat]),eagerAfter:summarize(nextSlow.weights[seat]),
          beforeStatus:beforeStates[seat].status,afterStatus:afterStates[seat].status}]))},
      turnBlocked,savedCallZeroEffectiveCallPositive:savedZeroRetained,
      checks:{positiveWitness,lawMismatch,vectorMismatches,actorFactorMismatches,opponentMaskMismatches,positiveActorMissingLaw,afterWithoutBefore,mismatchCount},
      vectors:Object.fromEntries(seats.map(seat=>[seat,{before:Array.from(before[seat]),after:Array.from(after[seat]),
        eagerBefore:Array.from(slow.weights[seat]),eagerAfter:Array.from(nextSlow.weights[seat])}])),rows,cacheStats:model.cacheStats()};
    const directory=new URL('../.local/hu-model11/',import.meta.url);mkdirSync(directory,{recursive:true});
    const filename=`hj-causal-${board}-${Date.now()}-${process.pid}.json`,destination=new URL(filename,directory),bytes=JSON.stringify(evidence,null,2)+'\n';
    writeFileSync(destination,bytes,{flag:'wx'});
    console.log(JSON.stringify({kind:'HJ-causal-evidence-file',path:'.local/hu-model11/'+filename,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes),board,witness,checks:evidence.checks,coverage:evidence.coverage}));
    // Evidence is preserved even if a non-vacuity or complete-vector comparison fails; HJ is a separate bounded flop300 control.
    assert.ok(before[actor][id]>0,`${board}: witness must reach the current decision`);
    assert.equal(witness.sourceSavedTierRuleMixBeforeCapsAndComputedDefence.call,0,`${board}: fixed witness must have saved call zero`);
    assert.ok(witnessLaw.physicalMass.call>0,`${board}: current declared physical call must be positive`);
    assert.ok(after[actor][id]>0,`${board}: witness must survive the call and turn mask`);
    assert.ok(compatibleBefore.total>0&&compatibleAfter.total>0,`${board}: witness needs compatible opposing support before and after`);
    assert.equal(mismatchCount,0,`${board}: full law/vector/factor comparisons must all agree exactly`);
    assert.equal(rows.length,1326);assert.ok(survivingActorCombos>0);
    assert.ok(savedZeroRetained.retainedCombos>0&&savedZeroRetained.retainedMass>0,`${board}: saved-call-zero/effective-call-positive mass must be retained`);
  }
});

test('canonical complete law/status and both-seat ranges agree across cold warm reverse release zero retention and genuine eviction',()=>{
  const request=req('Jc9d4h2s',{flop:['check','check'],turn:['bet125']});
  const base=fixture(),canonicalPrefix=base.model.prefix(request),actor=canonicalPrefix.pending.seat,seats=[base.inputs.spot.ip,base.inputs.spot.oop];
  const ownCombos=new Map(comboRange(base.inputs.seatRows[actor],'freq',canonicalPrefix.board).map(item=>[comboId(...item.combo),item.combo]));
  const ids=[...ownCombos.keys()].sort((a,b)=>a-b),reverseIds=[...ids].reverse();
  const vectorHex=weights=>{const bytes=Buffer.alloc(weights.length*8);for(let i=0;i<weights.length;i++)bytes.writeDoubleBE(weights[i],i*8);return bytes.toString('hex');};
  const summarize=weights=>{let support=0,total=0;for(const weight of weights){if(weight>0)support++;total+=weight;}return {support,total};};
  const summarizeCompatible=(weights,combo)=>{let support=0,total=0;for(let id=0;id<weights.length;id++)if(weights[id]>0&&[Math.floor(id/52),id%52].every(card=>!combo.includes(card))){support++;total+=weights[id];}return {support,total};};
  const capture=(name,model,queryOrder)=>{
    const beforeStats=model.cacheStats(),prefix=model.prefix(request);
    const ranges=Object.fromEntries(seats.map(seat=>[seat,model.rangeState(request,seat)])),laws=new Map();
    for(const id of queryOrder)laws.set(id,model.law(request,ownCombos.get(id)));
    return {name,prefix,identity:model.identity,belief:model.belief,artifactProvenance:model.artifactProvenance,
      queryOrder:[...queryOrder],ranges,laws,beforeStats,afterStats:model.cacheStats()};
  };
  const compare=(actual,expected)=>{
    const lawMismatchIds=ids.filter(id=>!isDeepStrictEqual(actual.laws.get(id),expected.laws.get(id)));
    const rangeMismatch=Object.fromEntries(seats.map(seat=>{let weights=0;for(let i=0;i<actual.ranges[seat].weights.length;i++)if(!Object.is(actual.ranges[seat].weights[i],expected.ranges[seat].weights[i]))weights++;
      const fields={status:actual.ranges[seat].status,identity:actual.ranges[seat].identity,prefix:actual.ranges[seat].prefix,semantics:actual.ranges[seat].semantics,total:actual.ranges[seat].total};
      const expectedFields={status:expected.ranges[seat].status,identity:expected.ranges[seat].identity,prefix:expected.ranges[seat].prefix,semantics:expected.ranges[seat].semantics,total:expected.ranges[seat].total};
      return [seat,{weights,metadata:Number(!isDeepStrictEqual(fields,expectedFields))}];}));
    const identityMismatch=Number(!isDeepStrictEqual(actual.identity,expected.identity)),prefixMismatch=Number(!isDeepStrictEqual(actual.prefix,expected.prefix)),coverageMismatch=Number(actual.laws.size!==ids.length);
    return {lawMismatchIds,rangeMismatch,identityMismatch,prefixMismatch,coverageMismatch,
      mismatchCount:lawMismatchIds.length+Object.values(rangeMismatch).reduce((sum,value)=>sum+value.weights+value.metadata,0)+identityMismatch+prefixMismatch+coverageMismatch};
  };
  const artifactFiles=artifactPaths(base.inputs.spot),artifactFileIdentity=Object.fromEntries(['candidate','laterCandidate'].map(kind=>{const bytes=readFileSync(artifactFiles[kind]);return [kind,{path:artifactFiles[kind],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];}));
  const artifacts=[],comparisons=[];
  const emit=(snapshot,comparison,extra={})=>{
    const first=snapshot.laws.get(ids[0]),{modelIdentity,beliefIdentity,executorIdentity,prefix,aggregation}=first.provenance;
    const commonLawProvenance={modelIdentity,beliefIdentity,executorIdentity,prefix,aggregation};
    let commonProvenanceMismatches=0;
    const lawRows=ids.map(id=>{
      const law=snapshot.laws.get(id),{modelIdentity,beliefIdentity,executorIdentity,prefix,aggregation,...status}=law.provenance;
      if(!isDeepStrictEqual({modelIdentity,beliefIdentity,executorIdentity,prefix,aggregation},commonLawProvenance))commonProvenanceMismatches++;
      return {comboId:id,cards:ownCombos.get(id),law:{...law,provenance:status}};
    });
    const record={kind:'bounded-complete-cache-control-scenario-not-acceptance',scenario:snapshot.name,
      semantics:'unnormalized own-action realization; not a public or hero posterior',
      scope:'same fixed public prefix and declared contract; future-board/chronology/prefix/cap-alias/six-tiny controls remain separate',
      completion:'One scenario artifact does not establish completion of all cache controls; read the enclosing bounded test receipt',
      numericEncoding:'JSON numbers round-trip binary64; each full2704 weight vector additionally has big-endian binary64 hex',
      prefix:snapshot.prefix,modelIdentity:snapshot.identity,artifactProvenance:snapshot.artifactProvenance,artifactFileIdentity,assumptionContract:snapshot.belief,
      queryOrder:snapshot.queryOrder,coverage:{actor,baseSupportedLawCount:ids.length,actualLawCount:snapshot.laws.size,
        ranges:Object.fromEntries(seats.map(seat=>[seat,summarize(snapshot.ranges[seat].weights)]))},
      // Each full original law reconstructs exactly by merging commonLawProvenance with that row's status provenance.
      commonLawProvenance,lawRows,rangeBySeat:Object.fromEntries(seats.map(seat=>[seat,{status:snapshot.ranges[seat].status,
        semantics:snapshot.ranges[seat].semantics,total:snapshot.ranges[seat].total,
        weights:Array.from(snapshot.ranges[seat].weights),weightsHex:vectorHex(snapshot.ranges[seat].weights)}])),
      comparison,commonProvenanceMismatches,cacheStats:{before:snapshot.beforeStats,after:snapshot.afterStats},extra};
    const directory=new URL('../.local/hu-model11/',import.meta.url);mkdirSync(directory,{recursive:true});
    const filename=`cache-control-${snapshot.name}-${Date.now()}-${process.pid}.json`,bytes=JSON.stringify(record,null,2)+'\n';
    writeFileSync(new URL(filename,directory),bytes,{flag:'wx'});
    const descriptor={scenario:snapshot.name,path:'.local/hu-model11/'+filename,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')};
    artifacts.push(descriptor);comparisons.push({scenario:snapshot.name,comparison,commonProvenanceMismatches});
    console.log(JSON.stringify({kind:'complete-cache-scenario-evidence-file',...descriptor,comparison,commonProvenanceMismatches,coverage:record.coverage,cacheStats:record.cacheStats,extra}));
  };
  const cold=capture('cold-canonical',base.model,ids);emit(cold,compare(cold,cold));
  const witnessCombo=parseCards('QcAd',2),witnessId=comboId(...witnessCombo);
  const witnessSupport={realization:cold.ranges[actor].weights[witnessId],physicalCall:cold.laws.get(witnessId)?.physicalMass.call,
    compatibleOpposing:summarizeCompatible(cold.ranges[base.inputs.spot.oop].weights,witnessCombo)};
  const warm=capture('warm-reversed-same-instance',base.model,reverseIds);emit(warm,compare(warm,cold));
  const reversed=capture('cold-reversed-fresh-instance',fixture().model,reverseIds);emit(reversed,compare(reversed,cold));
  const releaseBefore=base.model.cacheStats();base.model.releaseBoardCaches();const releaseAfter=base.model.cacheStats();
  const released=capture('after-explicit-release',base.model,ids);emit(released,compare(released,cold),{releaseBefore,releaseAfter});
  const zero=capture('zero-retention',fixture(BTN,{cache:{numericBytes:0,metadataBytes:0,entries:0}}).model,reverseIds);emit(zero,compare(zero,cold));
  const boundedModel=fixture(BTN,{cache:{entries:1}}).model;
  const boundedBefore=capture('bounded-before-forced-eviction',boundedModel,ids);emit(boundedBefore,compare(boundedBefore,cold));
  const forceBefore=boundedModel.cacheStats(),rootRequest={board:canonicalPrefix.board.slice(0,3),path:{flop:[]}},rootPrefix=boundedModel.prefix(rootRequest);
  const rootCombo=comboRange(base.inputs.seatRows[rootPrefix.pending.seat],'freq',rootPrefix.board).map(item=>item.combo).sort((a,b)=>comboId(...a)-comboId(...b))[0];
  const rootLaw=boundedModel.law(rootRequest,rootCombo),forceAfter=boundedModel.cacheStats();
  const boundedAfter=capture('bounded-after-forced-eviction',boundedModel,reverseIds);
  const evictionEvidence={forceBefore,forceAfter,distinctRootPrefix:rootPrefix,rootCombo,rootLaw,
    evictionDelta:forceAfter.evictions-forceBefore.evictions,
    targetRebuildDelta:boundedAfter.afterStats.builds-forceAfter.builds,
    explanation:'One completed entry was retained after the current-law queries; admitting the distinct root law forces eviction, then current-prefix laws are recomputed'};
  emit(boundedAfter,compare(boundedAfter,cold),evictionEvidence);
  const summary={kind:'bounded-complete-cache-control-summary-not-acceptance',modelIdentity:base.model.identity,artifactProvenance:base.model.artifactProvenance,artifactFileIdentity,
    assumptionIdentity:base.model.belief.identity,prefix:canonicalPrefix,witnessSupport,artifacts,comparisons,
    coverage:{supportedActorLaws:ids.length,rangeVectorLength:cold.ranges[actor].weights.length,seats},
    warmReusedWithoutBuild: warm.afterStats.builds===warm.beforeStats.builds,
    explicitRelease:{before:releaseBefore,after:releaseAfter},zeroRetentionStats:zero.afterStats,evictionEvidence};
  const directory=new URL('../.local/hu-model11/',import.meta.url),filename=`cache-control-summary-${Date.now()}-${process.pid}.json`,bytes=JSON.stringify(summary,null,2)+'\n';
  writeFileSync(new URL(filename,directory),bytes,{flag:'wx'});
  console.log(JSON.stringify({kind:'complete-cache-summary-evidence-file',path:'.local/hu-model11/'+filename,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex'),coverage:summary.coverage,witnessSupport,comparisons,cacheStats:{warm:warm.afterStats,releaseAfter,zero:zero.afterStats,forceBefore,forceAfter,rebuilt:boundedAfter.afterStats}}));
  // Lossless per-scenario and summary evidence is saved before any final comparison assertion.
  assert.ok(ids.length>3&&witnessSupport.realization>0&&witnessSupport.physicalCall>0&&witnessSupport.compatibleOpposing.total>0,'Cache comparison must cover complete nonempty support');
  for(const result of comparisons){assert.equal(result.comparison.mismatchCount,0,result.scenario);assert.equal(result.commonProvenanceMismatches,0,result.scenario);}
  assert.equal(warm.afterStats.builds,warm.beforeStats.builds,'Warm complete laws/ranges must be reused');
  assert.ok(releaseBefore.entries>0);assert.equal(releaseAfter.entries,0);assert.equal(releaseAfter.numericBytes,0);assert.equal(releaseAfter.metadataBytes,0);
  assert.equal(zero.afterStats.entries,0);assert.equal(zero.afterStats.numericBytes,0);assert.equal(zero.afterStats.metadataBytes,0);
  assert.equal(forceBefore.entries,1);assert.equal(forceAfter.entries,1);assert.ok(forceAfter.evictions>0&&evictionEvidence.evictionDelta>0,'Distinct root admission must force genuine bounded-cache eviction');
  assert.ok(evictionEvidence.targetRebuildDelta>0,'Current prefix must be rebuilt after forced eviction');
  assert.notDeepEqual(rootPrefix,canonicalPrefix);
  for(const snapshot of [cold,warm,reversed,released,zero,boundedBefore,boundedAfter]){assert.equal(snapshot.afterStats.active,0);assert.ok(snapshot.afterStats.maximumActiveAncestors<=21);for(const seat of seats)assert.equal(snapshot.ranges[seat].weights.length,2704);}
});

test('old45 factory identity smoke stays legacy6/model10; independent numerical parity remains pending',()=>{
  const inputs=loadInputs('BTN_open_BB_call'),flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
  assert.equal(DEFENCE_VERSION,6);assert.equal(NEW_HU_DEFENCE_VERSION,10);assert.throws(()=>createEffectiveDefence(inputs,flop,later),/never changes legacy45/);
  const board=parseCards('Jc9d4h',3),table=replayDecision(inputs,board,{flop:[]}),combo=parseCards('AcKd',2),legacy=defenceFor(inputs,flop,later);
  assert.deepEqual(legacy.mix(table,board,table.log.at(-1).node,combo,legacy.baseMix(table,board,table.log.at(-1).node,combo)),legacy.observableMix(table,board,table.log.at(-1).node,combo,legacy.baseMix(table,board,table.log.at(-1).node,combo)));
});

test('saved artifact envelopes construct BTN/HJ with unchanged separate provenance and payload identities',()=>{
  for(const id of [BTN,HJ]){
    const {inputs,flop,later,model}=fixture(id);
    assert.equal(model.identity.inputFingerprint,inputs.fingerprint);
    assert.equal(model.identity.flopPolicyContentHash,contentHash(flop.policy));
    assert.equal(model.identity.flopArtifactContentHash,contentHash(flop));
    assert.notEqual(model.identity.flopArtifactContentHash,model.identity.flopPolicyContentHash);
    assert.deepEqual(model.artifactProvenance.flop.originalGenerationProvenance,flop.metadata);
    assert.deepEqual(model.artifactProvenance.later.originalGenerationProvenance,later.metadata);
    assert.equal(model.artifactProvenance.flop.savedPolicyHash,savedPayloadHash(flop.policy));
    assert.equal(model.artifactProvenance.later.savedPolicyHash,savedPayloadHash(later.policy));
    assert.ok(Object.isFrozen(model.artifactProvenance.flop.originalGenerationProvenance));
  }
});

test('saved contracts reject missing envelope/fingerprints and stale source/spot/tree/config/payload',()=>{
  const {inputs,flop,later}=fixture();
  assert.throws(()=>createEffectiveDefence(inputs,flop.policy,later.policy),error=>error.status==='missing-executor-policy');
  const absent=structuredClone(inputs),f=structuredClone(flop),l=structuredClone(later);
  delete absent.fingerprint;delete f.metadata.source_hash;delete l.metadata.source_hash;
  assert.throws(()=>createEffectiveDefence(absent,f,l),error=>error.status==='invalid-artifact-provenance');
  for(const [field,value] of [['source_hash','a'.repeat(64)],['spot',HJ],['tree','oop_checks'],['config_version',inputs.config.version+1]]){
    const changed=structuredClone(flop);changed.metadata[field]=value;
    assert.throws(()=>createEffectiveDefence(inputs,changed,later),error=>error.status==='stale-executor-policy');
  }
  const changedInput=structuredClone(inputs);changedInput.seatRows[inputs.spot.ip].find(row=>row.freq===0).freq=0.01;
  assert.throws(()=>createEffectiveDefence(changedInput,flop,later),error=>error.status==='stale-source-contract');
  const changed=structuredClone(flop);changed.metadata.policy_hash='a'.repeat(64);
  assert.throws(()=>createEffectiveDefence(inputs,changed,later),error=>error.status==='invalid-artifact-provenance');
  const changedLater=structuredClone(later);changedLater.metadata.flop_policy_hash='a'.repeat(64);
  assert.throws(()=>createEffectiveDefence(inputs,flop,changedLater),error=>error.status==='stale-executor-policy');
});

test('original malformed facing values fail before JSON snapshot or computed overwrites',()=>{
  const {inputs,flop,later}=fixture();
  for(const value of [NaN,Infinity,undefined]){
    const changed=structuredClone(later);
    for(const rule of changed.policy.streets.turn.rules)if('call'in rule.mix){rule.mix.fold=value;rule.mix.call=value;}
    assert.throws(()=>createEffectiveDefence(inputs,flop,changed),error=>error.status==='invalid-source-contract');
  }
  for(const value of [null,-1,0.5,101]){
    const changed=structuredClone(later);
    for(const rule of changed.policy.streets.turn.rules)if('call'in rule.mix){rule.mix.fold=value;rule.mix.call=value;}
    assert.throws(()=>createEffectiveDefence(inputs,flop,changed),error=>error.status==='invalid-executor-policy');
  }
  const duplicate=structuredClone(flop);duplicate.policy.rules.push(structuredClone(duplicate.policy.rules[0]));
  assert.throws(()=>createEffectiveDefence(inputs,duplicate,later),error=>error.status==='invalid-executor-policy');
  const fractional=structuredClone(flop);
  for(const rule of fractional.policy.rules)if(rule.node==='oop_first')rule.mix={check:Number.MIN_VALUE,bet33:100,bet75:0,bet125:0};
  assert.throws(()=>createEffectiveDefence(inputs,fractional,later),error=>error.status==='invalid-executor-policy');
  assert.throws(()=>freezeSnapshot({value:NaN}),/Non-finite/);
  assert.throws(()=>freezeSnapshot({value:undefined}),/Non-JSON/);
  assert.throws(()=>freezeSnapshot(Array(1)),/Sparse/);
});

test('reference descriptors reject altered orders/content under stale identity; reload uses canonical descriptor',()=>{
  const {model}=fixture();const prefix=model.prefix(req('Jc9d4h',{flop:[]})),combo=parseCards('AcKd',2),canonical=referenceExecutor('standard');
  const reloaded=JSON.parse(JSON.stringify(canonical));
  assert.deepEqual(referenceActionLaw(prefix,combo,reloaded),referenceActionLaw(prefix,combo,canonical));
  const altered=structuredClone(canonical);altered.nodeOrders[prefix.pending.node].reverse();
  assert.throws(()=>referenceActionLaw(prefix,combo,altered),error=>error.status==='invalid-executor-contract');
  const changed=structuredClone(canonical);changed.fallback='invented';
  assert.throws(()=>referenceActionLaw(prefix,combo,changed),error=>error.status==='invalid-executor-contract');
});

test('positive percentage conversion and repeated product underflow fail explicitly; zero is separate',()=>{
  assert.throws(()=>multiplyDeclaredMass(1,Number.MIN_VALUE),error=>error.status==='numerical-underflow');
  assert.throws(()=>multiplyDeclaredMass(1e-300,1e-30),error=>error.status==='numerical-underflow');
  assert.equal(multiplyDeclaredMass(0.5,0),0);
  assert.equal(multiplyDeclaredMass(0.5,1e-17),0.5*(1e-17/100));
  assert.throws(()=>multiplyDeclaredMass(1,NaN),error=>error.status==='invalid-numeric-contract');
});

// Existing-fixture controls. No accepted witness body or implementation is changed.
const controlCards=id=>[Math.floor(id/52),id%52];
const controlHex=values=>{const bytes=Buffer.alloc(values.length*8);for(let i=0;i<values.length;i++)bytes.writeDoubleBE(values[i],i*8);return bytes.toString('hex');};
const controlSummary=weights=>{let support=0,total=0;for(const weight of weights){if(weight>0)support++;total+=weight;}return {support,total};};
function controlCompatible(left,right){let pairs=0,total=0;for(let i=0;i<left.length;i++)if(left[i]>0)for(let j=0;j<right.length;j++)if(right[j]>0&&controlCards(i).every(card=>!controlCards(j).includes(card))){pairs++;total+=left[i]*right[j];}return {pairs,total};}
function controlArtifactIdentity(base){return Object.fromEntries(['candidate','laterCandidate'].map(kind=>{const path=artifactPaths(base.inputs.spot)[kind],bytes=readFileSync(path);return [kind,{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];}));}
function controlEmit(name,base,payload){
  const directory=new URL('../.local/hu-model11/',import.meta.url);mkdirSync(directory,{recursive:true});
  const filename=`prefix-control-${name}-${Date.now()}-${process.pid}.json`;
  const record={kind:'bounded-existing-fixture-model11-control-not-acceptance',scenario:name,
    completion:'This artifact covers only its recorded scenario; overall completion requires the enclosing bounded receipt',
    semantics:'unnormalized own-action realization; not a public or hero posterior',
    referenceScope:'independent eager chronology/products; frozen raw Defence, geometry, tiers and scheduled equity shared',
    numericEncoding:'JSON binary64 numbers plus full-vector big-endian binary64 hex',
    modelIdentity:base?.model.identity??null,artifactProvenance:base?.model.artifactProvenance??null,
    assumptionContract:base?.model.belief??null,artifactFileIdentity:base?controlArtifactIdentity(base):null,...payload};
  const bytes=JSON.stringify(record,null,2)+'\n';writeFileSync(new URL(filename,directory),bytes,{flag:'wx'});
  const descriptor={path:'.local/hu-model11/'+filename,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')};
  console.log(JSON.stringify({kind:'existing-fixture-control-evidence-file',scenario:name,...descriptor,checks:payload.checks??null,coverage:payload.coverage??null}));return descriptor;
}
function controlCapture(base,request,{reference=true}={}){
  try{
    const prefix=base.model.prefix(request),seats=[base.inputs.spot.ip,base.inputs.spot.oop];
    const ranges=Object.fromEntries(seats.map(seat=>[seat,base.model.rangeState(request,seat)]));
    const combos=new Map(comboRange(base.inputs.seatRows[prefix.pending.seat],'freq',prefix.board).map(item=>[comboId(...item.combo),item.combo]));
    const ids=[...combos.keys()].sort((a,b)=>a-b),laws=new Map(ids.map(id=>[id,base.model.law(request,combos.get(id))]));
    const eager=reference?slowPrefixReference(base.inputs,base.flop.policy,base.later.policy,request):null;
    const mismatch={laws:[],vectors:Object.fromEntries(seats.map(seat=>[seat,[]])),coverage:0};
    if(eager){
      mismatch.coverage=Number(!isDeepStrictEqual(ids,[...eager.laws.keys()]));
      for(const id of ids){const law=laws.get(id),other=eager.laws.get(id);if(!other||!isDeepStrictEqual({rawMix:law.rawMix,labelMass:law.labelMass,physicalMass:law.physicalMass},other))mismatch.laws.push(id);}
      for(const seat of seats)for(let id=0;id<ranges[seat].weights.length;id++)if(!Object.is(ranges[seat].weights[id],eager.weights[seat][id]))mismatch.vectors[seat].push(id);
    }
    const compatible=controlCompatible(ranges[seats[0]].weights,ranges[seats[1]].weights);
    const coverage={actor:prefix.pending.seat,baseSupportedLawCount:ids.length,actualLawCount:laws.size,
      bySeat:Object.fromEntries(seats.map(seat=>[seat,controlSummary(ranges[seat].weights)])),compatible};
    return {request,prefix,prefixIdentity:contentHash(prefix),seats,ids,laws,ranges,eager,coverage,mismatch,
      mismatchCount:mismatch.laws.length+Object.values(mismatch.vectors).reduce((n,ids)=>n+ids.length,0)+mismatch.coverage,
      positive:ids.length>0&&compatible.pairs>0&&compatible.total>0&&seats.every(seat=>coverage.bySeat[seat].support>0&&coverage.bySeat[seat].total>0),cacheStats:base.model.cacheStats()};
  }catch(error){controlEmit('capture-failure',base,{request,failure:{name:error.name,status:error.status??null,message:error.message},checks:{completed:false}});throw error;}
}
function controlPack(snapshot){
  const common=snapshot.laws.values().next().value?.provenance;
  const commonProvenance=common?Object.fromEntries(['modelIdentity','beliefIdentity','executorIdentity','prefix','aggregation'].map(key=>[key,common[key]])):{};
  const laws=snapshot.ids.map(id=>{const law=snapshot.laws.get(id),status={...law.provenance};for(const key of Object.keys(commonProvenance)){assert.deepEqual(status[key],commonProvenance[key]);delete status[key];}return {comboId:id,cards:controlCards(id),law:{...law,provenance:status},eager:snapshot.eager?.laws.get(id)??null};});
  return {request:snapshot.request,prefix:snapshot.prefix,prefixIdentity:snapshot.prefixIdentity,
    lawReconstruction:'Merge commonLawProvenance with row.law.provenance; all public law fields/statuses are retained',commonLawProvenance:commonProvenance,laws,
    ranges:Object.fromEntries(snapshot.seats.map(seat=>{const state=snapshot.ranges[seat],weights=Array.from(state.weights),eager=snapshot.eager?Array.from(snapshot.eager.weights[seat]):null;return [seat,{...state,weights,weightsHex:controlHex(weights),eager,eagerHex:eager?controlHex(eager):null}];})),
    coverage:snapshot.coverage,checks:{positive:snapshot.positive,mismatch:snapshot.mismatch,mismatchCount:snapshot.mismatchCount},cacheStats:snapshot.cacheStats};
}
function controlRequire(snapshot){assert.ok(snapshot.positive,'Control requires positive live and compatible support');assert.equal(snapshot.mismatchCount,0,'Complete eager law and both-seat vectors must match');assert.ok(snapshot.eager,'Reference-backed control requires its eager snapshot');for(const seat of snapshot.seats)assert.equal(snapshot.ranges[seat].weights.length,2704);}
function controlCompare(actual,expected){
  const laws=[...new Set([...actual.ids,...expected.ids])].filter(id=>!isDeepStrictEqual(actual.laws.get(id),expected.laws.get(id)));
  const vectors=Object.fromEntries(actual.seats.map(seat=>[seat,Array.from(actual.ranges[seat].weights.keys()).filter(id=>!Object.is(actual.ranges[seat].weights[id],expected.ranges[seat].weights[id]))]));
  const rangeMetadata=Object.fromEntries(actual.seats.map(seat=>{const {weights:_actual,...fields}=actual.ranges[seat],{weights:_expected,...other}=expected.ranges[seat];return [seat,Number(!isDeepStrictEqual(fields,other))];}));
  const metadata=Number(!isDeepStrictEqual(actual.prefix,expected.prefix));
  return {laws,vectors,rangeMetadata,metadata,mismatchCount:laws.length+Object.values(vectors).reduce((n,ids)=>n+ids.length,0)+Object.values(rangeMetadata).reduce((n,x)=>n+x,0)+metadata};
}
function controlFactor(before,after,action,revealed=[]){
  const actor=before.prefix.pending.seat,rows=[],mismatches=[],missingLawIds=[];let positiveFactorCombos=0,retainedActorCombos=0;
  const blocked=Object.fromEntries(before.seats.map(seat=>[seat,{positiveCombos:0,beforeMass:0,actionAdjustedMass:0}]));
  for(let id=0;id<2704;id++){
    const masked=controlCards(id).some(card=>revealed.includes(card)),law=before.laws.get(id),percent=law?.physicalMass[action]??0;
    if(before.ranges[actor].weights[id]>0&&!law)missingLawIds.push(id);
    if(before.ranges[actor].weights[id]>0&&percent>0)positiveFactorCombos++;
    if(after.ranges[actor].weights[id]>0)retainedActorCombos++;
    const bySeat={};
    for(const seat of before.seats){const weight=before.ranges[seat].weights[id],factor=seat===actor?percent/100:1,expected=masked?0:weight*factor,actual=after.ranges[seat].weights[id];
      if(!Object.is(expected,actual))mismatches.push({seat,comboId:id});
      if(masked&&weight>0){blocked[seat].positiveCombos++;blocked[seat].beforeMass+=weight;blocked[seat].actionAdjustedMass+=weight*factor;}
      bySeat[seat]={before:weight,physicalActionPercent:seat===actor?percent:null,factor,expected,after:actual,beforeHex:controlHex([weight]),afterHex:controlHex([actual]),expectedHex:controlHex([expected])};
    }
    rows.push({comboId:id,cards:controlCards(id),masked,realization:bySeat});
  }
  return {actor,action,revealed,rows,blocked,positiveFactorCombos,retainedActorCombos,missingLawIds,mismatches,mismatchCount:mismatches.length+missingLawIds.length};
}

test('existing-fixture future reveals preserve complete historical laws and apply only own-action factors plus river masks',()=>{
  const base=fixture(),request=req('Jc9d4h2s',{flop:['check','check'],turn:['bet125']});
  const before=controlCapture(base,request),baselineFile=controlEmit('future-historical-baseline',base,controlPack(before));controlRequire(before);
  const files=[];
  for(const river of ['8c','8d']){
    const descendant=controlCapture(base,req('Jc9d4h2s'+river,{flop:['check','check'],turn:['bet125','call'],river:[]}));
    const historicalAgain=controlCapture(base,request,{reference:false}),historicalComparison=controlCompare(historicalAgain,before);
    const factors=controlFactor(before,descendant,'call',[descendant.prefix.board[4]]);
    const checks={historicalComparison,positive:descendant.positive,referenceMismatchCount:descendant.mismatchCount,factorMismatchCount:factors.mismatchCount,positiveFactorCombos:factors.positiveFactorCombos,retainedActorCombos:factors.retainedActorCombos};
    files.push(controlEmit('future-'+river,base,{baselineFile,descendant:controlPack(descendant),historicalRequery:controlPack(historicalAgain),factors,checks,coverage:descendant.coverage}));
    controlRequire(descendant);assert.equal(historicalComparison.mismatchCount,0);assert.equal(factors.mismatchCount,0);assert.ok(factors.positiveFactorCombos>0&&factors.retainedActorCombos>0);
    assert.ok(Object.values(factors.blocked).some(value=>value.positiveCombos>0),'Reveal must actually remove positive own-card support');
  }
  controlEmit('future-summary',base,{baselineFile,files,checks:{completedRiverCount:files.length,requiredRiverCount:2}});assert.equal(files.length,2);
});

test('existing-fixture chronological turn river reversal matches complete eager laws and distinct historical identities',()=>{
  const base=fixture(),files=[],endpoints=[],histories=[];
  for(const board of ['Jc9d4h2s8c','Jc9d4h8c2s']){
    const historical=controlCapture(base,req(board.slice(0,8),{flop:['check','check'],turn:['bet125']}));
    const historicalFile=controlEmit('chronology-historical-'+board,base,controlPack(historical));controlRequire(historical);
    const endpoint=controlCapture(base,req(board,{flop:['check','check'],turn:['bet125','call'],river:[]}));
    const factors=controlFactor(historical,endpoint,'call',[endpoint.prefix.board[4]]),requery=controlCapture(base,historical.request,{reference:false}),comparison=controlCompare(requery,historical);
    files.push(controlEmit('chronology-'+board,base,{historicalFile,endpoint:controlPack(endpoint),historicalRequery:controlPack(requery),factors,checks:{historicalComparison:comparison,factorMismatchCount:factors.mismatchCount,referenceMismatchCount:endpoint.mismatchCount,positive:endpoint.positive},coverage:endpoint.coverage}));
    controlRequire(endpoint);assert.equal(factors.mismatchCount,0);assert.equal(comparison.mismatchCount,0);assert.ok(factors.positiveFactorCombos>0&&factors.retainedActorCombos>0);histories.push(historical);endpoints.push(endpoint);
  }
  const checks={sameFiveCardSet:isDeepStrictEqual([...endpoints[0].prefix.board].sort((a,b)=>a-b),[...endpoints[1].prefix.board].sort((a,b)=>a-b)),
    distinctEndpointIdentity:endpoints[0].prefixIdentity!==endpoints[1].prefixIdentity,distinctHistoricalIdentity:histories[0].prefixIdentity!==histories[1].prefixIdentity};
  controlEmit('chronology-summary',base,{files,checks,scope:'Chronology identity and own-prefix eager correctness; no arbitrary strategy difference is required'});
  assert.ok(checks.sameFiveCardSet&&checks.distinctEndpointIdentity&&checks.distinctHistoricalIdentity);
});

function controlHistoryPair(name,pathA,pathB,{sameGeometry=false,equalOwnLabels=false}={}){
  const base=fixture(),requestA=req('Jc9d4h2s8c',pathA),requestB=req('Jc9d4h2s8c',pathB);
  const a=controlCapture(base,requestA),aFile=controlEmit(name+'-A',base,controlPack(a));controlRequire(a);
  const b=controlCapture(base,requestB),bFile=controlEmit(name+'-B',base,controlPack(b));controlRequire(b);
  const requery=controlCapture(base,requestA,{reference:false}),requeryComparison=controlCompare(requery,a);
  const differences=Object.fromEntries(a.seats.map(seat=>[seat,Array.from(a.ranges[seat].weights.keys()).filter(id=>!Object.is(a.ranges[seat].weights[id],b.ranges[seat].weights[id]))]));
  const tableA=replayDecision(base.inputs,a.prefix.board,a.prefix.path,base.inputs.config),tableB=replayDecision(base.inputs,b.prefix.board,b.prefix.path,base.inputs.config),actor=a.prefix.pending.seat;
  const ownLabels=table=>table.log.filter(entry=>entry.seat===actor&&entry.action!==null).map(entry=>({street:entry.street,action:entry.action}));
  const opposingLabels=table=>table.log.filter(entry=>entry.seat!==actor&&entry.action!==null).map(entry=>({street:entry.street,action:entry.action}));
  const checks={requeryComparison,distinctPrefixIdentity:a.prefixIdentity!==b.prefixIdentity,sameActor:a.prefix.pending.seat===b.prefix.pending.seat,
    sameCurrentNode:a.prefix.pending.node===b.prefix.pending.node,geometryEqual:isDeepStrictEqual(a.prefix.geometry,b.prefix.geometry),pendingMetadataEqual:isDeepStrictEqual(a.prefix.pending,b.prefix.pending),
    ownLabelsEqual:isDeepStrictEqual(ownLabels(tableA),ownLabels(tableB)),opposingLabelsDifferent:!isDeepStrictEqual(opposingLabels(tableA),opposingLabels(tableB)),
    actorWeightDifferenceCount:differences[actor].length,weightDifferenceCount:Object.values(differences).reduce((n,ids)=>n+ids.length,0)};
  controlEmit(name+'-A-B-A',base,{aFile,bFile,requery:controlPack(requery),differences,ownLabels:{A:ownLabels(tableA),B:ownLabels(tableB)},opposingLabels:{A:opposingLabels(tableA),B:opposingLabels(tableB)},checks,
    declaredRequirements:{sameGeometry,equalOwnLabels},coverage:{A:a.coverage,B:b.coverage}});
  assert.ok(checks.distinctPrefixIdentity&&checks.sameActor&&checks.sameCurrentNode);assert.equal(requeryComparison.mismatchCount,0);
  assert.ok(checks.weightDifferenceCount>0,'A distinguishing control needs genuine realization-weight differences');
  if(sameGeometry){assert.ok(checks.geometryEqual&&checks.pendingMetadataEqual);assert.ok(!checks.ownLabelsEqual&&!checks.opposingLabelsDifferent,'Same-geometry control changes SB own sizes and retains BB call/call labels');assert.equal(a.prefix.geometry.pot,110);for(const seat of a.seats){assert.equal(a.prefix.geometry.stacks[seat],46.25);assert.equal(a.prefix.geometry.invested[seat],41.75);}assert.equal(a.prefix.pending.node,'river_oop_first');assert.equal(a.prefix.pending.line,'aggressor');}
  if(equalOwnLabels){assert.ok(checks.ownLabelsEqual&&checks.opposingLabelsDifferent,'Selected current actor must have equal own-action labels with different opposing history');assert.ok(checks.actorWeightDifferenceCount>0,'Opposing-history control must distinguish the selected actor realization too');}
}
test('existing-fixture full history with equal current geometry and line cannot collide across A B A',()=>controlHistoryPair('equal-geometry-history',
  {flop:['bet33','call'],turn:['bet75','call'],river:[]},{flop:['bet75','call'],turn:['bet33','call'],river:[]},{sameGeometry:true}));
test('existing-fixture opposing public history with equal own labels cannot collide across A B A',()=>controlHistoryPair('opposing-history',
  {flop:['bet33','call'],turn:['check','check'],river:['check']},{flop:['bet75','call'],turn:['check','check'],river:['check']},{equalOwnLabels:true}));

// Probe only a recorded first-node cap stage using independently eager current reaches.
// Numeric classifications and frozen cap formula inputs are shared; label transformations below are reconstructed separately.
class ControlCapStage extends Defence{
  constructor(base,snapshot){super(base.inputs,base.flop.policy,base.later.policy);this.snapshot=snapshot;}
  reach(seat,_entries,board,table){assert.deepEqual(board,this.snapshot.prefix.board);assert.deepEqual(table.path,this.snapshot.prefix.path);return this.snapshot.eager.weights[seat];}
  queryEquities(range,ids,tables){return equitiesVersus(range,ids,tables,{wasm:false});}
}
function controlIndependentMass(raw,order,observation){
  const labelMass={},physicalMass={};let cumulative=0,previous=0;
  for(let i=0;i<order.length;i++){if(i===order.length-1)labelMass[order[i]]=100-previous;else{cumulative+=raw[order[i]];const cut=Math.min(100,Math.max(0,cumulative));labelMass[order[i]]=cut-previous;previous=cut;}}
  for(const group of observation.classes)physicalMass[group.action]=group.aliases.reduce((sum,label)=>sum+labelMass[label],0);
  return {labelMass,physicalMass};
}
function controlCapEvidence(base,snapshot){
  const stage=new ControlCapStage(base,snapshot),table=snapshot.eager.table,info=stage.betting(table,snapshot.prefix.board,snapshot.prefix.pending.node);
  assert.ok(info&&info.caps.length>0,'Recorded low-SPR first node must have a genuine cap stage');
  const observation=snapshot.prefix.pending.observation,street=snapshot.prefix.pending.street;
  const expectedLabels=observation.actions.filter(action=>(action.startsWith('bet')||action==='allin')&&(street==='river'||observation.byAction[action].stacks[observation.role]===0));
  const expectedClasses=observation.classes.filter(group=>group.aliases.some(action=>expectedLabels.includes(action)));
  const fixedLabels=street==='river'?['bet33','bet75','bet125','allin']:['bet33','bet75','bet125'],fixedClasses=street==='river'?['bet33','allin']:['bet33'];
  const actualLabels=info.caps.map(cap=>cap.action),actualClasses=(info.observedCaps??[]).map(cap=>cap.action),expectedClassActions=expectedClasses.map(group=>group.action);
  const duplicates=actions=>actions.filter((action,index)=>actions.indexOf(action)!==index);
  const coverage={expectedLabels,fixedLabels,actualLabels,expectedClassActions,fixedClasses,actualClasses,
    duplicateLabels:duplicates(actualLabels),duplicateClasses:duplicates(actualClasses),
    missingLabels:expectedLabels.filter(action=>!actualLabels.includes(action)),extraLabels:actualLabels.filter(action=>!expectedLabels.includes(action)),
    missingClasses:expectedClassActions.filter(action=>!actualClasses.includes(action)),extraClasses:actualClasses.filter(action=>!expectedClassActions.includes(action)),
    declaredLabelListMatchesFixed:isDeepStrictEqual(expectedLabels,fixedLabels),declaredClassListMatchesFixed:isDeepStrictEqual(expectedClassActions,fixedClasses),
    exactLabelCoverage:isDeepStrictEqual(actualLabels,expectedLabels),exactClassCoverage:isDeepStrictEqual(actualClasses,expectedClassActions)};
  const coverageMismatchCount=Number(!coverage.declaredLabelListMatchesFixed)+Number(!coverage.declaredClassListMatchesFixed)+Number(!coverage.exactLabelCoverage)+Number(!coverage.exactClassCoverage)+coverage.duplicateLabels.length+coverage.duplicateClasses.length;
  // Missing/duplicate provenance is emitted as a failed coverage result before any value comparisons.
  if(coverageMismatchCount)return {coverage,actualCaps:info.caps,actualObservedCaps:info.observedCaps??null,rows:[],
    checks:{coverageMismatchCount,mismatchCount:coverageMismatchCount,reducedPositiveCombos:0,reroutedPositiveCombos:0}};
  const actor=snapshot.prefix.pending.seat,other=snapshot.seats.find(seat=>seat!==actor),tiers=tierArray(snapshot.prefix.board),round6=x=>Math.round(x*1e6)/1e6;
  const bigBet=snapshot.prefix.pending.street==='river'?[...snapshot.prefix.pending.observation.actions].reverse().find(action=>action.startsWith('bet')):null;
  const shove=bigBet&&base.inputs.config.river_allin_max_pot_ratio!=null?info.caps.find(cap=>cap.action==='allin'):null;
  const rows=snapshot.ids.map(id=>{const source=laterPolicyMix(base.later.policy,snapshot.prefix.pending.node,controlCards(id),snapshot.prefix.board,snapshot.prefix.pending.line),tier=TIERS[tiers[id]];
    const rerouted=shove&&source.allin>0&&(shove.ratio>base.inputs.config.river_allin_max_pot_ratio||['medium','draw'].includes(tier))?{...source,allin:0,[bigBet]:round6((source[bigBet]??0)+source.allin)}:{...source};
    return {comboId:id,cards:controlCards(id),tier,classification:info.kind[id],realization:snapshot.ranges[actor].weights[id],source,rerouted};});
  const caps=info.caps.map(cap=>{
    let value=0,bluff=0;for(const row of rows)if(row.realization>0&&row.classification){const weight=row.realization*row.rerouted[cap.action]/100;if(row.classification===1)value+=weight;else bluff+=weight;}
    const share=value+bluff>0?bluff/(value+bluff):0;
    const group=snapshot.prefix.pending.observation.byAction[cap.action],wager=group.paid,call=Math.min(group.stacks[group.nextActor],Math.round((group.committed[snapshot.prefix.pending.observation.role]-group.committed[group.nextActor])*100)/100);
    const finalPot=snapshot.prefix.geometry.pot+wager+call,fee=Math.min(finalPot*gameConfig.rake.rate,gameConfig.rake.cap_bb),alpha=call>0?call/(finalPot-fee):0;
    const factor=share<=alpha||bluff<=0?1:value>0?alpha*value/((1-alpha)*bluff):0;
    return {action:cap.action,actual:{...cap},independent:{valueBefore:value,bluffBefore:bluff,valueAfter:value,bluffAfter:bluff*factor,factor,alpha,ratio:wager/snapshot.prefix.geometry.pot},geometry:{wager,call,finalPot,rake:fee}};
  });
  const mismatches=[],observed=Object.fromEntries(snapshot.prefix.pending.observation.classes.map(group=>[group.action,{valueBefore:0,bluffBefore:0,valueAfter:0,bluffAfter:0,removedBluff:0}]));let reducedPositiveCombos=0,reroutedPositiveCombos=0;
  for(const row of rows){let out={...row.rerouted};const transforms=[];
    if(row.realization>0&&!isDeepStrictEqual(row.source,row.rerouted))reroutedPositiveCombos++;
    for(const cap of caps)if(row.classification===2&&cap.independent.factor<1){const prior=out[cap.action],next=round6(prior*cap.independent.factor);if(next!==prior){out={...out,[cap.action]:next,[info.passive]:round6(out[info.passive]+prior-next)};transforms.push({action:cap.action,before:prior,after:next,passive:info.passive});}}
    const independent=controlIndependentMass(out,snapshot.prefix.pending.observation.actions,snapshot.prefix.pending.observation),actual=snapshot.laws.get(row.comboId);
    row.transforms=transforms;row.independentRawMix=out;row.independentLabelMass=independent.labelMass;row.independentPhysicalMass=independent.physicalMass;
    if(row.realization>0&&transforms.length)reducedPositiveCombos++;
    if(!isDeepStrictEqual(actual.rawMix,out)||!isDeepStrictEqual(actual.labelMass,independent.labelMass)||!isDeepStrictEqual(actual.physicalMass,independent.physicalMass))mismatches.push(row.comboId);
    if(row.realization>0&&row.classification){const pre=controlIndependentMass(row.rerouted,snapshot.prefix.pending.observation.actions,snapshot.prefix.pending.observation),weight=row.realization/100;
      for(const group of snapshot.prefix.pending.observation.classes){const before=pre.physicalMass[group.action],after=independent.physicalMass[group.action],value=row.classification===1,bucket=observed[group.action];bucket[value?'valueBefore':'bluffBefore']+=weight*before;bucket[value?'valueAfter':'bluffAfter']+=weight*after;if(!value&&before>after)bucket.removedBluff+=weight*(before-after);}
    }
  }
  const capMismatch=caps.filter(cap=>['valueBefore','bluffBefore','valueAfter','bluffAfter','factor','alpha','ratio'].some(key=>!Object.is(cap.actual[key],cap.independent[key])));
  const observedComparisons=expectedClasses.map(group=>{
    const actual=info.observedCaps.find(cap=>cap.action===group.action),totals=observed[group.action],firstLabel=caps.find(cap=>group.aliases.includes(cap.action));
    const independent={action:group.action,aliases:[...group.aliases],allIn:group.allIn,amountBb:group.amountBb,paid:group.paid,
      alpha:firstLabel.independent.alpha,ratio:firstLabel.independent.ratio,...totals,
      factor:totals.bluffBefore>0?totals.bluffAfter/totals.bluffBefore:1,wasReduced:totals.removedBluff>0};
    const mismatchFields=Object.keys(independent).filter(key=>!isDeepStrictEqual(actual[key],independent[key]));
    return {action:group.action,actual,independent,mismatchFields};
  });
  const observedMismatch=observedComparisons.filter(row=>row.mismatchFields.length);
  return {actor,opponent:other,passive:info.passive,coverage,caps,actualObservedCaps:info.observedCaps,independentObservedCaps:observed,observedComparisons,rows,
    checks:{coverageMismatchCount,mismatchIds:mismatches,capMismatch,observedMismatch,mismatchCount:coverageMismatchCount+mismatches.length+capMismatch.length+observedMismatch.length,reducedPositiveCombos,reroutedPositiveCombos},
    scope:'Independent saved-label reroute, per-label cap, passive transfer and post-cap declared pooling; shared eager reach, classifications and frozen geometry'};
}

test('existing-fixture actual low SPR caps aliases and impossible raises agree after per label transformations',()=>{
  const files=[],models=[];let reducedPositiveCombos=0,summaryBase;
  for(const spec of [
    {spot:BTN,board:'Jc9d4h2s8c',path:{flop:['check','check'],turn:['bet125','call'],river:[]},aliases:['bet75','bet125','allin'],physical:'allin'},
    {spot:HJ,board:'Js8s5d2c',path:{flop:['bet125','call'],turn:[]},aliases:['bet33','bet75','bet125'],physical:'bet33'}]){
    const base=fixture(spec.spot),opening=controlCapture(base,req(spec.board,spec.path));
    summaryBase??=base;models.push({spot:spec.spot,modelIdentity:base.model.identity,artifactProvenance:base.model.artifactProvenance,assumptionContract:base.model.belief,artifactFileIdentity:controlArtifactIdentity(base)});
    const openingFile=controlEmit('cap-opening-'+spec.spot,base,controlPack(opening));controlRequire(opening);
    const cap=controlCapEvidence(base,opening);reducedPositiveCombos+=cap.checks.reducedPositiveCombos;
    const capFile=controlEmit('cap-transforms-'+spec.spot,base,{openingFile,cap,checks:cap.checks});assert.equal(cap.checks.mismatchCount,0);
    const street=opening.prefix.pending.street,group=opening.prefix.pending.observation.classes.find(item=>item.action===spec.physical);
    assert.ok(group?.allIn);assert.deepEqual(group.aliases,spec.aliases);let canonical;
    for(const alias of spec.aliases){
      const facing=controlCapture(base,req(spec.board,{...spec.path,[street]:[...(spec.path[street]??[]),alias]}));
      const factors=controlFactor(opening,facing,spec.physical),comparison=canonical?controlCompare(facing,canonical):null;
      const savedStage=new Defence(base.inputs,base.flop.policy,base.later.policy),facingTable=facing.eager.table;
      const transfers=facing.ids.map(id=>{const source=laterPolicyMix(base.later.policy,facing.prefix.pending.node,controlCards(id),facing.prefix.board,facing.prefix.pending.line);
        const expected=source.raise?{...source,call:source.call+source.raise,raise:0}:{...source},actualSavedStage=savedStage.baseMix(facingTable,facing.prefix.board,facing.prefix.pending.node,controlCards(id));
        return {comboId:id,cards:controlCards(id),realization:facing.ranges[facing.prefix.pending.seat].weights[id],source,savedAfterImpossibleRaiseTransfer:expected,actualSavedStage,savedStageMatch:isDeepStrictEqual(expected,actualSavedStage),effectiveLaw:facing.laws.get(id)};});
      const positiveSavedRaiseTransfers=transfers.filter(row=>row.realization>0&&row.source.raise>0).length;
      const impossibleRaiseMismatch=transfers.filter(row=>!row.savedStageMatch||(row.effectiveLaw.rawMix.raise??0)!==0||row.effectiveLaw.physicalMass.raise!==undefined).map(row=>row.comboId);
      const checks={aliasComparison:comparison,factorMismatchCount:factors.mismatchCount,referenceMismatchCount:facing.mismatchCount,positive:facing.positive,positiveSavedRaiseTransfers,impossibleRaiseMismatch,canRaise:facing.prefix.pending.canRaise};
      files.push(controlEmit('cap-alias-'+spec.spot+'-'+alias,base,{openingFile,capFile,alias,group,facing:controlPack(facing),factors,transfers,checks,coverage:facing.coverage}));
      controlRequire(facing);assert.equal(factors.mismatchCount,0);assert.ok(factors.positiveFactorCombos>0&&factors.retainedActorCombos>0);if(comparison)assert.equal(comparison.mismatchCount,0);
      assert.equal(facing.prefix.pending.canRaise,false);assert.equal(impossibleRaiseMismatch.length,0);
      if(spec.spot===HJ){assert.ok(positiveSavedRaiseTransfers>0,'Impossible raise transfer must cover genuine positive saved raise support');assert.deepEqual(facing.prefix.pending.observation.byAction.raise.aliases,['call','raise']);}
      canonical??=facing;
    }
    let importedImpossibleRaise=null;
    if(spec.spot===HJ){const imported={...spec.path,[street]:[...(spec.path[street]??[]),spec.aliases[0],'raise']};
      const canonicalImport=canonicalPostflopPath(base.inputs.spot,imported,base.inputs.config),expected={...opening.prefix.path,[street]:[spec.physical,'call']};
      importedImpossibleRaise={imported,canonicalImport,expected,matches:isDeepStrictEqual(canonicalImport,expected)};
      controlEmit('cap-impossible-raise-import-'+spec.spot,base,{importedImpossibleRaise,checks:{matches:importedImpossibleRaise.matches}});assert.ok(importedImpossibleRaise.matches);
    }
    const bad={...spec.path,[street]:[...(spec.path[street]??[]),...(spec.spot===BTN?['allin','raise']:[spec.aliases[0],'raise','call'])]};let failure;
    try{base.model.prefix(req(spec.board,bad));}catch(error){failure={name:error.name,status:error.status??null,message:error.message};}
    controlEmit((spec.spot===BTN?'cap-explicit-allin-raise-':'cap-terminal-suffix-')+spec.spot,base,{request:req(spec.board,bad),importedImpossibleRaise,failure:failure??null,
      expectedRejection:spec.spot===HJ?'Extra suffix after legacy impossible raise maps to terminal call':'Explicit allin followed by raise is structurally illegal',checks:{rejected:Boolean(failure)}});assert.ok(failure,'The recorded illegal raise/suffix must be rejected');
  }
  controlEmit('cap-summary',summaryBase,{files,models,checks:{aliasCount:files.length,reducedPositiveCombos}});assert.equal(files.length,6);assert.ok(reducedPositiveCombos>0,'At least one real positive combo must undergo cap reduction');
});

test('existing-fixture genuine legal flop raise retains its physical factor and matches eager defender law',()=>{
  const base=fixture(),facing=controlCapture(base,req('Jc9d4h',{flop:['bet33']}));
  const beforeFile=controlEmit('legal-raise-before',base,controlPack(facing));controlRequire(facing);
  assert.equal(facing.prefix.pending.canRaise,true);
  const endpoint=controlCapture(base,req('Jc9d4h',{flop:['bet33','raise']})),factors=controlFactor(facing,endpoint,'raise');
  const checks={positive:endpoint.positive,referenceMismatchCount:endpoint.mismatchCount,factorMismatchCount:factors.mismatchCount,positiveRaiseCombos:factors.positiveFactorCombos,retainedActorCombos:factors.retainedActorCombos};
  controlEmit('legal-raise-after',base,{beforeFile,endpoint:controlPack(endpoint),factors,checks,coverage:endpoint.coverage});controlRequire(endpoint);
  assert.equal(factors.mismatchCount,0);assert.ok(factors.positiveFactorCombos>0&&factors.retainedActorCombos>0);
  assert.equal(endpoint.prefix.pending.node,'oop_vs_raise');
});

// Separate execution oracle: records every binary64 subtraction without calling choose.
function controlSamplerOracle(raw,order,random){
  const trace=order.reduce((rows,label)=>{const before=rows.length?rows.at(-1).after:random*100;rows.push({label,before,mass:raw[label],after:before-raw[label]});return rows;},[]);
  const selected=trace.find(row=>row.after<0)?.label??order[order.length-1];return {label:selected,trace};
}
function controlNeighbor(value,direction){
  if(value===0)return direction>0?Number.MIN_VALUE:-Number.MIN_VALUE;
  const buffer=new ArrayBuffer(8),view=new DataView(buffer);view.setFloat64(0,value,false);let bits=view.getBigUint64(0,false);bits+=BigInt((value>0?1:-1)*direction);view.setBigUint64(0,bits,false);return view.getFloat64(0,false);
}
function controlSeedWord(seed){
  const mask=0xffffffffn;let state=BigInt(seed>>>0);
  return ()=>{state=(state+0x6d2b79f5n)&mask;let word=state;word=((word^(word>>15n))*(word|1n))&mask;
    word=(word^((word+(((word^(word>>7n))*(word|61n))&mask))&mask))&mask;return Number((word^(word>>14n))&mask);};
}
function controlSeedHash(text){let hash=2166136261n;for(const char of text)hash=((hash^BigInt(char.charCodeAt(0)))*16777619n)&0xffffffffn;return Number(hash);}

test('independent sampler boundaries seed words and declared mass oracle preserve finite execution order',()=>{
  const observation=actionProjection({street:'river',node:'river_oop_first',pot:92.76,stacks:{ip:54.87,oop:54.87},committed:{ip:0,oop:0}}),order=observation.actions;
  const specs=[
    {name:'integer-exact',values:[25,25,25,20,5]},
    {name:'fractional',values:[0.1,0.2,33.333333,66.366667,0]},
    {name:'overfull-clipped',values:[60,60,3,4,5]},
    {name:'underfull-final-remainder',values:[0,0.25,0,0,0]},
    {name:'zero-middle',values:[25,0,25,0,50]},
    {name:'all-zero-final-fallback',values:[0,0,0,0,0]},
    {name:'tiny-last-remainder',values:[99.99999999999999,0,0,0,0]},
    {name:'subnormal-first',values:[Number.MIN_VALUE,0,0,0,0]}];
  const evidence=[],mismatches=[];let boundaries=0,reorderedRows=0;
  for(const spec of specs)for(const ordered of [order,[...order].reverse()]){
    const raw=Object.fromEntries(order.map((label,index)=>[label,spec.values[index]])),law=compileDeclaredPolicyLaw(raw,ordered,observation),independent=controlIndependentMass(raw,ordered,observation);
    const massMatch=isDeepStrictEqual(law.labelMass,independent.labelMass)&&isDeepStrictEqual(law.physicalMass,independent.physicalMass);
    const points=new Set([0,Number.MIN_VALUE,0.25,0.5,controlNeighbor(1,-1)]);let cumulative=0;
    for(const label of ordered){cumulative+=raw[label];const endpoint=cumulative/100;for(const value of [controlNeighbor(endpoint,-1),endpoint,controlNeighbor(endpoint,1)])if(Number.isFinite(value)&&value>=0&&value<1)points.add(value);}
    const rows=[...points].sort((a,b)=>a-b).map(random=>{const oracle=controlSamplerOracle(raw,ordered,random),actual=sampleEffectiveAction(law,random),physical=observation.classes.find(group=>group.aliases.includes(oracle.label)).action;
      const match=actual.label===oracle.label&&actual.action===physical;if(!match)mismatches.push({spec:spec.name,order:ordered,random});return {random,randomHex:controlHex([random]),oracle:{...oracle,physical},actual,match};});
    boundaries+=rows.length;if(ordered!==order)reorderedRows+=rows.length;if(!massMatch)mismatches.push({spec:spec.name,order:ordered,declaredMass:true});
    evidence.push({name:spec.name,order:ordered,raw,law,independentDeclaredMass:independent,massMatch,rows});
  }
  const seeded=[];
  for(const text of ['model11|fixture|1','日本語|😀','']){const independent=controlSeedHash(text),actual=seedFor(text);seeded.push({kind:'seed-hash',text,independent,actual,match:independent===actual});if(independent!==actual)mismatches.push({seedHash:text});}
  const seeds=[0,1,451,0xffffffff,-1,controlSeedHash('model11|fixture|1')];
  for(const seed of seeds){const independentWord=controlSeedWord(seed),random=seededRandom(seed),rows=[];
    for(let index=0;index<2048;index++){const word=independentWord(),expectedRandom=word/4294967296,actualRandom=random(),spec=evidence[index%evidence.length],oracle=controlSamplerOracle(spec.raw,spec.order,expectedRandom),actual=sampleEffectiveAction(spec.law,actualRandom),physical=observation.classes.find(group=>group.aliases.includes(oracle.label)).action;
      const match=Object.is(actualRandom,expectedRandom)&&actual.label===oracle.label&&actual.action===physical;if(!match)mismatches.push({seed,index});rows.push({index,word,expectedRandom,actualRandom,randomHex:controlHex([actualRandom]),spec:index%evidence.length,expectedLabel:oracle.label,expectedPhysical:physical,actual,match});}
    seeded.push({kind:'seeded-word-and-action-replay',seed,rows});
  }
  let filteredRejected=false;try{balancedExecutor({order:'filtered-Agent'});}catch(error){filteredRejected=error.status==='unsupported-executor-contract';}
  const validDescriptor=referenceExecutor(),changed=structuredClone(validDescriptor);changed.nodeOrders.river_oop_first=[...changed.nodeOrders.river_oop_first].reverse();
  const base=fixture(),prefix=base.model.prefix(req('Jc9d4h2s8c',{flop:['check','check'],turn:['check','check'],river:[]}));let staleOrderRejected=false;
  try{referenceActionLaw(prefix,parseCards('QcAd',2),changed);}catch(error){staleOrderRejected=error.status==='invalid-executor-contract';}
  const checks={mismatches,mismatchCount:mismatches.length,boundaryRows:boundaries,reorderedRows,seedReplayRows:seeds.length*2048,filteredRejected,staleOrderRejected};
  controlEmit('independent-sampler',base,{observation,executor:balancedExecutor(),evidence,seeded,checks,
    scope:'Exact binary64 sequential execution at recorded boundary values and independent BigInt finite seed-word replay; declared continuous law separately compiled. Sampled words do not establish whole-grid probabilities.',
    orderScope:'Compiler probes explicit full order and reversed order; model11 balanced executor remains immutable full-node order. Filtered Agent and stale reference orders are rejected.'});
  assert.equal(mismatches.length,0);assert.ok(boundaries>0&&reorderedRows>0);assert.ok(filteredRejected&&staleOrderRejected);
  assert.equal(controlSamplerOracle({a:25,b:0,c:75},['a','b','c'],0.25).label,'c','Strict boundary skips exact-zero labels');
});

import './helpers/model11-six-real-controls.mjs';
