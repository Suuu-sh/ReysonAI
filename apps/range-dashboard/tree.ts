// Public-state-only traversal. Never conditions, copies or fabricates private ranges.
import { isDeepStrictEqual } from 'node:util';
import { legalOptions } from './postflop.ts';
const round=v=>Math.round(v*100)/100;
const deck=[...'AKQJT98765432'].flatMap(r=>[...'shdc'].map(s=>r+s));
const other=s=>s==='BTN'?'BB':'BTN';
export function treeRoot(board='As7d2c',sourceLineage=null){
 const cards=board.match(/../g)||[];
 if(board.length!==6||cards.length!==3||new Set(cards).size!==3||cards.some(c=>!deck.includes(c)))throw Error('Flop must contain three distinct cards, e.g. As7d2c');
 return {spot_id:'BTN_open_BB_call',street:'flop',board,actor:'BB',pot_bb:5.5,stacks_bb:{BTN:97.5,BB:97.5},committed_bb:{BTN:0,BB:0},last_full_raise_bb:1,raises_this_street:0,raise_reopened:true,history:[],source_lineage:sourceLineage};
}
const historyShape=h=>h.map(e=>({street:e.street,board:e.board,seat:e.seat,action:e.action,paid_bb:e.paid_bb,to_bb:e.to_bb,...(e.decision_id?{decision_id:e.decision_id,policy_hash:e.policy_hash}:{}),...(e.assumption?{assumption:true}:{})}));
export function savedAt(state,scenes){
 return scenes.find(s=>s.tree_state&&isDeepStrictEqual({...state,history:historyShape(state.history)},{...s.tree_state,history:historyShape(s.tree_state.history)}));
}
export function advanceTree(state,action,saved=null){
 const option=legalOptions(state).find(a=>a.action===action);if(!option)throw Error('Illegal action');
 const actor=state.actor,opponent=other(actor);
 const step={street:state.street,board:state.board,seat:actor,action,paid_bb:option.paid_bb,to_bb:option.to_bb,...(saved?{decision_id:saved.key,policy_hash:saved.provenance.final_hash}:state.history.length===0&&state.board==='As7d2c'&&state.source_lineage&&actor==='BB'&&action==='check'?{assumption:true}:{})};
 const next={...state,stacks_bb:{...state.stacks_bb,[actor]:round(state.stacks_bb[actor]-option.paid_bb)},committed_bb:{...state.committed_bb,[actor]:option.to_bb},pot_bb:round(state.pot_bb+option.paid_bb),history:[...state.history,step]};
 if(action==='fold')return {...next,kind:'terminal',terminal:'Fold · ハンド終了'};
 const previous=state.history.at(-1),ended=action==='call'||action==='check'&&previous?.street===state.street&&previous.seat===opponent&&previous.action==='check';
 if(ended&&(state.street==='river'||next.stacks_bb.BTN<=0||next.stacks_bb.BB<=0))return {...next,kind:'terminal',terminal:state.street==='river'?'Showdown · ハンド終了':'All-in call · 残りボードのランアウト（追加判断なし）'};
 if(ended)return {...next,kind:'chance',actor:'BB',street:state.street==='flop'?'turn':'river',committed_bb:{BTN:0,BB:0},last_full_raise_bb:1,raises_this_street:0,raise_reopened:true};
 const increment=option.to_bb-state.committed_bb[opponent];
 return {...next,actor:opponent,last_full_raise_bb:action==='raise'?Math.max(state.last_full_raise_bb,increment):action.startsWith('bet')||action==='allin'?option.paid_bb:state.last_full_raise_bb,raises_this_street:state.raises_this_street+Number(action==='raise'),raise_reopened:action!=='raise'||increment>=state.last_full_raise_bb};
}
function deal(state,card){if(state.kind!=='chance'||!deck.includes(card)||state.board.includes(card))throw Error('Illegal next card');const {kind,...next}=state;return {...next,board:state.board+card};}
function describe(state,scenes){
 const saved=state.kind?null:savedAt(state,scenes);
 return {state,status:state.kind==='terminal'?'terminal':state.kind==='chance'?'chance':saved?.review?.warnings?.some(w=>!w.resolved)?'needs_correction':saved?'generated':'not_generated',scene_key:saved?.key??null,reach:saved?'saved':'unknown',assumed_initial_check:state.history.some(e=>e.assumption),...(state.kind==='terminal'?{message:state.terminal}:{}),...(saved?{reached_combo_count:saved.summary.reached_combo_count}:{} )};
}
export function treeSnapshot(scenes,board='As7d2c',path=[]){
 if(!Array.isArray(path)||path.length>64||path.some(v=>typeof v!=='string'||v.length>12))throw Error('Invalid tree path');
 const seed=scenes.find(s=>s.tree_state?.street==='flop'&&s.tree_state.actor==='BTN'&&s.tree_state.board==='As7d2c'&&s.tree_state.history.length===1&&s.tree_state.history[0].assumption);
 let zeroReach=false;let state=treeRoot(board,seed?.tree_state.source_lineage??null);const breadcrumbs=[{label:board+' · BB',path:[]}];
 for(let i=0;i<path.length;i++){const token=path[i],saved=state.kind?null:savedAt(state,scenes);if(saved&&!(saved.summary.action_frequency_pct[token]>0))zeroReach=true;state=state.kind==='chance'?deal(state,token):state.kind==='terminal'?(()=>{throw Error('Terminal path');})():advanceTree(state,token,saved);breadcrumbs.push({label:token,path:path.slice(0,i+1)});}
 const current=describe(state,scenes),saved=current.scene_key?scenes.find(s=>s.key===current.scene_key):null;
 const children=state.kind==='terminal'?[]:state.kind==='chance'?deck.filter(c=>!state.board.includes(c)).map(card=>({token:card,label:card,...describe(deal(state,card),scenes),zero_reach:zeroReach})):legalOptions(state).map(option=>{
  const next=advanceTree(state,option.action,saved),zero=saved&&!(saved.summary.action_frequency_pct[option.action]>0);
  return {token:option.action,label:option.action,option,...describe(next,scenes),zero_reach:zeroReach||!!zero};
 });
 return {scope:'100 BB · BTN open 2.5 BB → BB call · 固定サイズ規則の合法全枝（任意ベット額の連続空間ではありません）',board,path,breadcrumbs,...current,reach:zeroReach?'zero':current.reach,children};
}
