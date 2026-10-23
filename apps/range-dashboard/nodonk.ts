import { onDemandReviewWarnings, ONDEMAND_REVIEW_STATUS_WARNING } from "../shared/aiv2-ondemand-review-warnings.ts";
// On-demand public reads are deterministic; only the strict owner endpoint may enqueue.
import { NO_DONK_RULE, structuralLegalActions, advancePostflopDecision, postflopHash as hash } from '../frontend/scripts/aiv2-postflop-nodonk.ts';
import { CONFIG, DEFAULT_STORE, DEFAULT_SOURCE, normalizeRequest, resolveFrontier, loadDecision, implementationHash, listJobs, enqueue } from '../frontend/scripts/aiv2-postflop-nodonk-store.ts';
const deck=[...'AKQJT98765432'].flatMap(r=>[...'shdc'].map(s=>r+s));
const round=(n:number)=>Math.round(n*100)/100;
export function ownerRequest(req:any,requireOrigin=true){
 const host=req.headers.host,origin=req.headers.origin;
 if(Object.keys(req.headers).some(k=>k.toLowerCase()==='forwarded'||k.toLowerCase().startsWith('x-forwarded-')))return false;
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return false;
 if(typeof host!=='string'||! /^(localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}$/.test(host))return false;
 if(requireOrigin?origin!=='http://'+host:origin!==undefined&&origin!=='http://'+host)return false;
 const fetchSite=req.headers['sec-fetch-site'];return !fetchSite||fetchSite==='same-origin';
}
export const generationEnabled=()=>process.env.ONDEMAND_GENERATION_ENABLED==='1';
function rootState(board:string):any{return {pot_type:'SRP',spot_id:'BTN_open_BB_call',street:'flop',board,actor:'BB',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},committed_bb:{BTN:0,BB:0},last_full_raise_bb:1,raises_this_street:0,raise_reopened:true,history:[]};}
function transition(state:any,token:string):any{
 if(state.kind==='terminal')throw Error('Terminal path');
 if(state.kind==='chance'){if(!deck.includes(token)||state.board.includes(token))throw Error('Invalid next card');const {kind,...out}=state;return {...out,board:state.board+token};}
 const option=structuralLegalActions(state).find(a=>a.action===token);if(!option)throw Error('Illegal path action');
 const me=state.actor,op=me==='BB'?'BTN':'BB',previous=state.history.at(-1),history=[...state.history,{street:state.street,board:state.board,seat:me,action:token,paid_bb:option.paid_bb,to_bb:option.to_bb}];
 const stacks={...state.stacks_bb,[me]:round(state.stacks_bb[me]-option.paid_bb)},committed={...state.committed_bb,[me]:option.to_bb},pot=round(state.pot_bb+option.paid_bb);
 const ended=token==='call'||token==='check'&&previous?.street===state.street&&previous.seat===op&&previous.action==='check';
 const out={...state,stacks_bb:stacks,committed_bb:committed,pot_bb:pot,history};
 if(token==='fold'||ended&&(state.street==='river'||stacks.BB<=0||stacks.BTN<=0))return {...out,kind:'terminal'};
 if(ended)return {...out,kind:'chance',street:state.street==='flop'?'turn':'river',actor:'BB',committed_bb:{BB:0,BTN:0},last_full_raise_bb:1,raises_this_street:0,raise_reopened:true};
 const increment=option.to_bb-state.committed_bb[op];return {...out,actor:op,last_full_raise_bb:token==='raise'?Math.max(state.last_full_raise_bb,increment):token.startsWith('bet')||token==='allin'?option.paid_bb:state.last_full_raise_bb,raises_this_street:state.raises_this_street+Number(token==='raise'),raise_reopened:token!=='raise'||increment>=state.last_full_raise_bb};
}
export function formatOnDemandScene(a:any){
 const actions=a.legal_actions.map(v=>v.action),rows=a.combos,total=rows.reduce((n,r)=>n+r.reach_weight,0),reason=(r:any)=>({en:r.text,ja:r.text_ja});
 return {key:a.decision_id,id:a.input.spot_id,hero:a.input.actor,family:a.input.street,context:'postflop',street:a.input.street,board:a.input.board.match(/../g),pot_bb:a.input.pot_bb,stacks_bb:a.input.stacks_bb,history:a.input.history,preflop_history:a.input.preflop_history,assumptions:a.input.assumptions,actions,legal_actions:a.legal_actions,range_reason:reason(a.summary),cells:a.hands.map((h:any)=>{const group=rows.filter(r=>r.hand===h.hand),same=new Set(group.map(r=>JSON.stringify([r.mix,r.text,r.text_ja]))).size===1;return {hand:h.hand,mix:h.frequencies,reach_weight:h.reach_weight,unreachable:h.unreachable,blocked:h.combo_count===0,combo_count:h.combo_count,reason:same?reason(group[0]):{en:group.length?'See exact physical-combo reasons below.':'No reached combo; no generated policy.',ja:group.length?'実コンボごとの保存理由を参照してください。':'到達コンボがないため生成方針はありません。'},overrides:group.map(r=>({combo:r.combo,mix:r.mix,reach_weight:r.reach_weight,reason:reason(r)}))};}),summary:{action_frequency_pct:Object.fromEntries(actions.map(action=>[action,rows.reduce((n,r)=>n+r.reach_weight*r.mix[action],0)/total])),total_reach_weight:total,reached_combo_count:rows.length},provenance:{user_rule:{kind:"user-rule-policy",...NO_DONK_RULE,rule_hash:hash(NO_DONK_RULE)},method:CONFIG.method,model:CONFIG.model,effort:CONFIG.effort,final_hash:a.metadata.policy_hash,reason_hash:a.metadata.response_hash,artifact_hash:hash(a),verified:true,numerically_validated:true,independent_gto_approved:false},review:{status:'not-independently-reviewed',production_approved:false,status_warning:ONDEMAND_REVIEW_STATUS_WARNING,warnings:onDemandReviewWarnings(a.decision_id,hash(a))}};
}
export async function onDemandSnapshot(board='As7d2c',path:string[]=[],root=DEFAULT_STORE,source=DEFAULT_SOURCE){
 normalizeRequest(board,path);if(path.length===0)return {method:CONFIG.method,config:CONFIG,board,path,status:'user_rule',scene:null,userRule:{kind:'user-rule-policy',authority:'user-instruction',action:'check',probability:1,providerCalls:0,approved:false,production_strategy_approved:false,gto_verified:false},children:[{token:'check',label:'check',path:['check'],status:'not_generated'}]};if(path[0]!=='check')throw Error('No donk allowed');let state=rootState(board);const breadcrumbs:{label:string;path:string[]}[]=[{label:board+' · BB',path:[]}];
 path.forEach((token,index)=>{state=transition(state,token);breadcrumbs.push({label:token,path:path.slice(0,index+1)});});
 const implementation=implementationHash(),frontier=await resolveFrontier(board,path,root,source,implementation),artifact=frontier.status==='generated'?frontier.artifact:null;
 const status=frontier.status==='zero-reach'?'zero-reach':state.kind==='terminal'?'terminal':state.kind==='chance'?'chance':artifact?'generated':frontier.status==='missing'&&frontier.index<path.length?'ancestor_required':'not_generated';
 const options=state.kind==='terminal'?[]:state.kind==='chance'?deck.filter(c=>!state.board.includes(c)).map(c=>({token:c,label:c})):structuralLegalActions(state).map(option=>({token:option.action,label:option.action,option}));
 // A chance node has no decision policy itself. Its cards descend from the
 // exact saved closing-action parent, not from an invented chance policy.
 const chanceParent=state.kind==='chance'&&path.length&&status!=='zero-reach'
  ?await resolveFrontier(board,path.slice(0,-1),root,source,implementation):null;
 const closingArtifact=chanceParent?.status==='generated'?chanceParent.artifact:null;
 const children=options.map((entry:any)=>{
  const child=transition(state,entry.token);let childStatus=child.kind??'not_generated';
  if(closingArtifact){try{const next=advancePostflopDecision(closingArtifact,path.at(-1)!,entry.token);if(next.status==='decision')childStatus=loadDecision(next.input,implementation,root)?'generated':'not_generated';else childStatus=next.status==='terminal'?'terminal':'chance';}catch(error){if((error as Error).message!=='zero-reach')throw error;childStatus='zero-reach';}}
  if(artifact){try{const next=advancePostflopDecision(artifact,entry.token);if(next.status==='decision')childStatus=loadDecision(next.input,implementation,root)?'generated':'not_generated';else childStatus=next.status==='next-street-card-required'?'chance':'terminal';}catch(error){if((error as Error).message!=='zero-reach')throw error;childStatus='zero-reach';}}
  return {...entry,state:child,status:childStatus,zero_reach:status==='zero-reach'||childStatus==='zero-reach'};
 });
 return {scope:'100 BB · BTN open 2.5 BB → BB call · SRP 33/66/125% · raise-to 2.5×',method:CONFIG.method,config:CONFIG,board,path,breadcrumbs,state,status,reach:status==='zero-reach'?'zero':artifact?'saved':'unknown',scene_key:artifact?.decision_id??null,scene:artifact?formatOnDemandScene(artifact):null,ancestor_index:frontier.index,missing_ancestors:frontier.status==='missing'&&frontier.index<path.length,children};
}
