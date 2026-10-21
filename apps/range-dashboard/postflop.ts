// Independent read-only decoder; never imports postflop generator/provider code.
import { readFile, realpath, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
const METHOD='llm-postflop-single-response-v1';
const VERSION='exact-combo-bilingual-bets33-66-100-125-v1';
const ranks=[...'AKQJT98765432'], cards=ranks.flatMap(r=>[...'shdc'].map(s=>r+s));
const hands=ranks.flatMap((a,i)=>ranks.map((b,j)=>i===j?a+b:i<j?a+b+'s':b+a+'o'));
const physical=cards.flatMap((a,i)=>cards.slice(i+1).map(b=>({combo:a+b,hand:a[0]===b[0]?a[0]+b[0]:a[0]+b[0]+(a[1]===b[1]?'s':'o')})));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert=ok=>{if(!ok)throw Error('Invalid saved postflop artifact');};
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
const text=v=>typeof v==='string'?v:'';
const reason=v=>{assert(typeof v?.text==='string'&&v.text.trim()&&typeof v.text_ja==='string'&&v.text_ja.trim());return {en:v.text,ja:v.text_ja};};
const mix=(v,actions)=>{assert(v&&Object.keys(v).length===actions.length&&actions.every(a=>Number.isInteger(v[a])&&v[a]>=0&&v[a]<=100)&&actions.reduce((n,a)=>n+v[a],0)===100);};
const event=v=>({street:text(v.street),board:typeof v.board==='string'?v.board:'',seat:text(v.seat),action:text(v.action),...(Number.isFinite(v.paid_bb)?{paid_bb:v.paid_bb}:{}),...(Number.isFinite(v.to_bb)?{to_bb:v.to_bb}:{}),...(Number.isFinite(v.to_size_bb)?{to_size_bb:v.to_size_bb}:{}),...(v.assumption?{assumption:typeof v.assumption==='string'?v.assumption:'assumed action'}:{})});
function legalOptions(input){
  const round=v=>Math.round(v*100)/100, me=input.actor, opponent=me==='BTN'?'BB':'BTN',mine=input.committed_bb[me],theirs=input.committed_bb[opponent];
  assert(Number.isFinite(mine)&&mine>=0&&Number.isFinite(theirs)&&theirs>=mine&&input.stacks_bb[me]>0);
  const cap=round(Math.min(input.stacks_bb[me],input.stacks_bb[opponent]+theirs-mine)), facing=round(theirs-mine);
  const wager=amount=>amount>=cap*.67?{paid:cap,allIn:true}:{paid:round(Math.min(amount,cap)),allIn:amount>=cap};
  const option=(action,paid,allIn=false)=>({action,paid_bb:paid,to_bb:round(mine+paid),all_in:allIn});
  if(facing>0){const paid=round(Math.min(facing,input.stacks_bb[me])),out=[option('fold',0),option('call',paid,paid>=input.stacks_bb[me])];if(input.raise_reopened&&input.raises_this_street<4&&input.stacks_bb[opponent]>0&&cap>facing){const v=wager(round(Math.max(theirs*3,theirs+input.last_full_raise_bb)-mine));out.push(option('raise',v.paid,v.allIn));}return out;}
  const out=[option('check',0)];if(cap<=0)return out;let merged=false;
  for(const pct of [33,66,100,125]){const v=wager(Math.max(1,round(input.pot_bb*pct/100)));if(v.allIn&&merged)continue;if(v.allIn)merged=true;out.push(option(v.allIn?'allin':'bet'+pct,v.paid,v.allIn));}return out;
}
export function verifyPostflop(output,fileHash=null){
  const {input,metadata:m,decision_id:id,source_response:response,combos:rows}=output;
  assert(output.kind==='aiv2_saved_postflop_decision'&&output.schema_version==='aiv2-postflop-decision-v1'&&/^[a-f0-9]{64}$/.test(id));
  assert(m?.reasons_generated_with_frequencies===true);
  assert(m?.method===METHOD&&m.version===VERSION&&m.model==='gpt-6.1-sol'&&m.reasoning_effort==='medium');
  assert(hash(input)===m.input_hash&&hash(response)===m.response_hash&&hash(rows)===m.policy_hash);
  assert(hash({method:METHOD,version:VERSION,model:m.model,effort:m.reasoning_effort,implementation_hash:m.implementation_hash,input,legal_actions:output.legal_actions})===id);
  const board=typeof input.board==='string'?input.board.match(/../g):null;
  assert(['flop','turn','river'].includes(input.street)&&board&&board.length===({flop:3,turn:4,river:5})[input.street]&&input.board.length===board.length*2&&new Set(board).size===board.length&&board.every(c=>cards.includes(c)));
  assert(['BTN','BB'].includes(input.actor)&&input.ranges?.[input.actor]&&Number.isFinite(input.pot_bb)&&input.pot_bb>0);
  const actions=output.legal_actions.map(v=>v.action);
  assert(actions.length>0&&new Set(actions).size===actions.length&&actions.every(a=>/^(check|fold|call|bet(?:33|66|100|125)|raise|allin)$/.test(a)));
  assert(output.legal_actions.every(v=>Number.isFinite(v.paid_bb)&&v.paid_bb>=0&&Number.isFinite(v.to_bb)&&v.to_bb>=0));
  const legal=physical.filter(c=>!board.includes(c.combo.slice(0,2))&&!board.includes(c.combo.slice(2)));
  for(const seat of ['BTN','BB']){const weights=input.ranges[seat];assert(weights&&Object.keys(weights).length===1326&&physical.every(c=>Number.isFinite(weights[c.combo])&&weights[c.combo]>=0&&weights[c.combo]<=1&&(!board.includes(c.combo.slice(0,2))&&!board.includes(c.combo.slice(2))||weights[c.combo]===0)));assert(Number.isFinite(input.stacks_bb[seat])&&input.stacks_bb[seat]>=0);}
  assert(JSON.stringify(output.legal_actions)===JSON.stringify(legalOptions(input)));
  const expected=legal.filter(c=>input.ranges[input.actor][c.combo]>0);
  assert(Array.isArray(rows)&&rows.length===expected.length&&rows.length>0);
  const byCombo=new Map(), groups=new Map();
  assert(response?.decision_id===id&&Array.isArray(response.groups));
  for(const g of response.groups){mix(g.mix,actions);reason(g);assert(Array.isArray(g.combos));for(const c of g.combos){assert(!groups.has(c));groups.set(c,g);}}
  assert(groups.size===rows.length);
  for(const row of rows){const p=expected.find(c=>c.combo===row.combo),group=groups.get(row.combo);assert(p&&p.hand===row.hand&&!byCombo.has(row.combo)&&near(row.reach_weight,input.ranges[input.actor][row.combo])&&row.reach_weight>0&&row.reach_weight<=1&&group);mix(row.mix,actions);reason(row);assert(actions.every(a=>group.mix[a]===row.mix[a])&&group.text===row.text&&group.text_ja===row.text_ja);byCombo.set(row.combo,row);}
  assert(expected.every(c=>byCombo.has(c.combo)));
  const summaryReason=reason(output.summary);assert(output.summary.text===response.range_summary.text&&output.summary.text_ja===response.range_summary.text_ja);
  const total=rows.reduce((n,r)=>n+r.reach_weight,0),frequency=Object.fromEntries(actions.map(a=>[a,rows.reduce((n,r)=>n+r.reach_weight*r.mix[a],0)/total]));
  assert(m.reached_combo_count===rows.length&&Array.isArray(output.hands)&&output.hands.length===169);
  const cells=hands.map((hand,i)=>{
    const group=rows.filter(c=>c.hand===hand),weight=group.reduce((n,c)=>n+c.reach_weight,0),saved=output.hands[i];
    const frequencies=weight?Object.fromEntries(actions.map(a=>[a,group.reduce((n,c)=>n+c.reach_weight*c.mix[a],0)/weight])):{};
    assert(saved?.hand===hand&&saved.combo_count===legal.filter(c=>c.hand===hand).length&&saved.reached_combo_count===group.length&&near(saved.reach_weight,weight)&&saved.unreachable===(weight===0)&&Object.keys(saved.frequencies).length===Object.keys(frequencies).length&&actions.every(a=>!weight||near(saved.frequencies[a],frequencies[a])));
    const unique=new Set(group.map(c=>JSON.stringify([c.mix,c.text,c.text_ja])));
    return {hand,mix:frequencies,reach_weight:weight,unreachable:!weight,blocked:!group.length,combo_count:group.length,reason:!group.length?{en:'No positive-reach board-legal physical combo. No policy or reason was generated.',ja:'ボードと両立する到達重み付きコンボがないため、方針・理由は生成されていません。'}:unique.size===1?reason(group[0]):{en:'Physical combos have different saved policies or reasons. See each exact combo below; the cell displays their reach-weighted frequencies.',ja:'実コンボごとに保存方針・理由が異なります。セルは到達重み付き集計です。以下に各実コンボの保存原文を表示します。'},overrides:group.map(c=>({combo:c.combo,mix:c.mix,reach_weight:c.reach_weight,reason:reason(c)}))};
  });
  return {key:id,id:`${input.spot_id} · ${input.street}`,hero:input.actor,family:input.street,context:'postflop',street:input.street,board:[...board],pot_bb:input.pot_bb,stacks_bb:{BTN:input.stacks_bb.BTN,BB:input.stacks_bb.BB},history:(input.history??[]).map(event),preflop_history:(input.preflop_history??[]).map(event),assumptions:(input.assumptions??[]).map(v=>typeof v==='string'?v:'Recorded explicit assumption'),actions,legal_actions:output.legal_actions.map(v=>({action:v.action,paid_bb:v.paid_bb,to_bb:v.to_bb,all_in:v.all_in===true})),cells,range_reason:summaryReason,summary:{action_frequency_pct:frequency,total_reach_weight:total,reached_combo_count:rows.length},provenance:{method:METHOD,model:m.model,effort:m.reasoning_effort,final_hash:m.policy_hash,reason_hash:m.response_hash,artifact_hash:fileHash,verified:true}};
}
export async function postflopSnapshot(root){
  let files;try{files=await readdir(resolve(root,'decisions'));}catch(error){if(error.code==='ENOENT')return {status:{state:'not_generated',total:0,completed:0,new_single_pass:0,running:0,failed:0,verified:0,invalid:0,updated_at:null,polled_at:new Date().toISOString()},scenes:[]};throw error;}
  const realRoot=await realpath(resolve(root,'decisions')),scenes=[];let invalid=0;
  for(const file of files.filter(v=>/^[a-f0-9]{64}\.json$/.test(v)).sort()){
    try{const path=await realpath(resolve(realRoot,file));assert(path.startsWith(realRoot+sep));const bytes=await readFile(path);const artifact=JSON.parse(bytes.toString('utf8'));assert(file===artifact.decision_id+'.json');scenes.push(verifyPostflop(artifact,createHash('sha256').update(bytes).digest('hex')));}catch{invalid++;}
  }
  return {status:{state:scenes.length?'saved':'not_generated',total:scenes.length,completed:scenes.length,new_single_pass:scenes.length,running:0,failed:0,verified:scenes.length,invalid,updated_at:null,polled_at:new Date().toISOString()},scenes};
}
