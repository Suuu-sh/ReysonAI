import { hands } from "../data.ts";
import type { MatrixModel } from "../data.ts";
export const ONDEMAND_METHOD = "llm-postflop-ondemand-v2";
export type Scene = {
 key:string; hero:"BTN"|"BB"; street:string; board:string[]; pot_bb:number;
 actions:string[]; range_reason:{en:string;ja:string};
 provenance:{method:string;verified:boolean;independent_gto_approved:boolean;artifact_hash?:string};
 cells:Array<{hand:string;mix:Record<string,number>;reach_weight:number;unreachable:boolean;reason:{en:string;ja:string};overrides:Array<{combo:string;mix:Record<string,number>;reach_weight:number;reason:{en:string;ja:string}}>}>;
};
export type SavedResult = {status:string;snapshot:{scene:Scene|null;status:string};proof:{revision:string;implementationHash:string;sourceHash:string;validatedStore:boolean}};
export type Job = {id:string;status:"queued"|"running"|"complete"|"failed";board:string;path:string[];result?:SavedResult;error?:string};
export type Capability = {ownerOnline?:boolean;enabled:boolean;revision:string;implementationHash:string;sourceHash:string;limits:{jobsPerUserDay:number;maxProviderCalls:number}};
export const validBoard=(board:string,count=3)=>new RegExp(`^(?:[AKQJT2-9][shdc]){${count}}$`).test(board)&&new Set(board.match(/../g)).size===count;
const round=(n:number)=>Math.round(n*100)/100;
type Seat="BTN"|"BB";
export type BrowseState={kind:"decision"|"chance"|"terminal";board:string;street:"flop"|"turn"|"river";actor:Seat;pot:number;stacks:Record<Seat,number>;committed:Record<Seat,number>;lastRaise:number;raises:number;reopened:boolean;previous?:{street:string;actor:Seat;action:string}};
export function browseActions(s:BrowseState):Array<{token:string;paid:number;to:number}> {
 if(s.kind!=="decision")return [];
 const me=s.actor,op=me==="BB"?"BTN":"BB",mine=s.committed[me],theirs=s.committed[op],facing=round(theirs-mine),cap=round(Math.min(s.stacks[me],s.stacks[op]+theirs-mine));
 const option=(token:string,paid:number)=>({token,paid,to:round(mine+paid)});
 const wager=(n:number)=>n>=cap*.67?cap:round(Math.min(n,cap));
 if(facing>0){const out=[option("fold",0),option("call",Math.min(facing,s.stacks[me]))];if(s.reopened&&s.raises<4&&s.stacks[op]>0&&cap>facing)out.push(option("raise",wager(round(Math.max(theirs*2.5,theirs+s.lastRaise)-mine))));return out;}
 const out=[option("check",0)];if(cap<=0)return out;
 for(const pct of [33,66,125]){const paid=wager(Math.max(1,round(s.pot*pct/100))),token=paid===cap?"allin":`bet${pct}`;if(!out.some(a=>a.token===token))out.push(option(token,paid));}return out;
}
/** Structural navigation only. Never constructs a policy or reach estimate. */
export function browsePath(board:string,path:string[]):BrowseState {
 if(!validBoard(board))throw Error("Invalid flop");
 let s:BrowseState={kind:"decision",board,street:"flop",actor:"BB",pot:5.5,stacks:{BTN:97.5,BB:97.5},committed:{BTN:0,BB:0},lastRaise:1,raises:0,reopened:true};
 for(const token of path){
  if(s.kind==="terminal")throw Error("Hand complete");
  if(s.kind==="chance"){if(!validBoard(s.board+token,s.board.length/2+1))throw Error("Invalid next card");s={...s,kind:"decision",board:s.board+token};continue;}
  const a=browseActions(s).find(a=>a.token===token);if(!a)throw Error("Illegal action");
  const me=s.actor,op=me==="BB"?"BTN":"BB",ended=token==="call"||token==="check"&&s.previous?.street===s.street&&s.previous.actor===op&&s.previous.action==="check",increment=a.to-s.committed[op];
  const stacks={...s.stacks,[me]:round(s.stacks[me]-a.paid)};
  const terminal=token==="fold"||ended&&(s.street==="river"||stacks.BB<=0||stacks.BTN<=0);
  s={...s,kind:terminal?"terminal":ended?"chance":"decision",board:s.board,street:ended&&!terminal?(s.street==="flop"?"turn":"river"):s.street,actor:ended?"BB":op,pot:round(s.pot+a.paid),stacks,committed:ended?{BB:0,BTN:0}:{...s.committed,[me]:a.to},lastRaise:ended?1:token==="raise"?Math.max(s.lastRaise,increment):token.startsWith("bet")||token==="allin"?a.paid:s.lastRaise,raises:ended?0:s.raises+Number(token==="raise"),reopened:ended||token!=="raise"||increment>=s.lastRaise,previous:{street:s.street,actor:me,action:token}};
 }
 return s;
}
export function savedSceneModel(result:SavedResult,cap:Capability,board:string,path:string[]):MatrixModel|null {
 if(!result.proof?.validatedStore||result.proof.revision!==cap.revision||result.proof.implementationHash!==cap.implementationHash||result.proof.sourceHash!==cap.sourceHash)throw Error("Source snapshot mismatch");
 if(result.status!=="generated")return null;
 const s=result.snapshot.scene,state=browsePath(board,path);
 if(!s||s.provenance?.method!==ONDEMAND_METHOD||s.provenance.verified!==true||s.provenance.independent_gto_approved!==false||s.board.join("")!==state.board||s.hero!==state.actor||s.street!==state.street||s.cells.length!==169||!s.range_reason.en?.trim()||!s.range_reason.ja?.trim())throw Error("Invalid saved scene");
 const legal=browseActions(state).map(a=>a.token);
 if(s.actions.length!==legal.length||legal.some(a=>!s.actions.includes(a)))throw Error("Invalid saved actions");
 const mixValid=(mix:Record<string,number>)=>Object.keys(mix).length===legal.length&&legal.every(a=>Number.isFinite(mix[a])&&mix[a]>=0&&mix[a]<=100)&&Math.abs(legal.reduce((n,a)=>n+mix[a],0)-100)<1e-6;
 return {actions:s.actions,aggregates:new Map(s.cells.map((c,i)=>{
  if(c.hand!==hands[i]||!Number.isFinite(c.reach_weight)||c.reach_weight<0||c.unreachable!==(c.reach_weight===0)||!c.reason.en?.trim()||!c.reason.ja?.trim()||!c.unreachable&&!mixValid(c.mix)||!Array.isArray(c.overrides))throw Error("Invalid saved cell");
  for(const row of c.overrides)if(!row.reason.en?.trim()||!row.reason.ja?.trim()||!mixValid(row.mix)||!Number.isFinite(row.reach_weight)||row.reach_weight<=0)throw Error("Invalid saved combo");
  return [c.hand,{hand:c.hand,comboCount:c.reach_weight,unreachable:c.unreachable,actions:c.unreachable?{}:Object.fromEntries(legal.map(a=>[a,c.mix[a]/100])),combos:c.overrides.map(row=>({cards:row.combo,mix:Object.fromEntries(legal.map(a=>[a,row.mix[a]/100])),reachWeight:row.reach_weight}))}];
 }))};
}
export async function onDemandRequest<T>(base:string,path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(`${base}/v1/aiv2/ondemand/${path}`,{credentials:"include",signal,...(body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
 if(!response.ok)throw Error(response.status===401?"sign_in_required":response.status===429?"quota_exceeded":response.status===503?"disabled":"request_failed");
 return response.json() as Promise<T>;
}
