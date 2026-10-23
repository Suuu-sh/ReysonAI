import { browseActions, browsePath, validBoard } from "./aiv2-ondemand-client.ts";
import type { GameFormat } from "./game-formats.ts";
export const ONDEMAND_WORKSPACE_SOURCE="aiv2-exact-v2";
export type OnDemandRoot = {rangeType:string;opener:string;hero:string;callers:readonly string[];foldedHero:boolean;format:GameFormat;defaultTable:boolean;opponentProfile:string;context?:{ip?:string|null;oop?:string|null;potBb?:number;stackBb?:number|null}|null};
export function onDemandRootSupported(s:OnDemandRoot){
 return s.rangeType==="response"&&s.opener==="BTN"&&s.hero==="BB"&&s.callers.length===1&&s.callers[0]==="BB"&&s.foldedHero&&s.defaultTable&&s.opponentProfile==="standard"&&s.format.game==="cash"&&s.format.table==="6max"&&s.format.stack===100&&s.format.openSize===2.5&&!s.format.ante&&s.format.rake==="5pct-cap3"&&s.context?.ip==="BTN"&&s.context.oop==="BB"&&s.context.potBb===5.5&&s.context.stackBb===97.5;
}
export type OnDemandHistory = {flopCards:readonly string[];flopActions:readonly string[];turnCard:string;turnActions:readonly string[];riverCard:string;riverActions:readonly string[]};
export type OnDemandActionBlock = {key:string;kind:string;position?:string;stack?:string;chosen?:string|null;options:Array<{action:string;label:string}>;active?:boolean;flopIndex?:number;laterIndex?:number;street?:"turn"|"river";cards?:string[];pending?:boolean;potBb?:number;result?:string};
export function onDemandHistorySelection(h:OnDemandHistory){
 const board=h.flopCards.join("");if(!validBoard(board))throw Error("invalid-flop");
 const path=[...h.flopActions];let state=browsePath(board,path);
 const addStreet=(card:string,actions:readonly string[],street:"turn"|"river")=>{
  if(!card){if(actions.length)throw Error("card-required");return;}
  if(state.kind!=="chance"||state.street!==street)throw Error("street-not-open");
  path.push(card,...actions);state=browsePath(board,path);
 };
 addStreet(h.turnCard,h.turnActions,"turn");addStreet(h.riverCard,h.riverActions,"river");
 return {board,path,state};
}
const copy=(locale:string,en:string,ja:string,zh:string,es:string)=>({en,ja,"zh-CN":zh,es}[locale]??en);
export function onDemandActionBlocks(h:OnDemandHistory,locale="en"){
 const selection=onDemandHistorySelection(h),blocks:OnDemandActionBlock[]=[],counts={flop:0,turn:0,river:0};
 for(let i=0;i<=selection.path.length;i++){
  const state=browsePath(selection.board,selection.path.slice(0,i)),token=selection.path[i];
  if(state.kind==="terminal"){blocks.push({key:`aiv2-end-${i}`,kind:"end",options:[],result:copy(locale,"Hand complete","ハンド終了","本手结束","Mano terminada")});break;}
  if(state.kind==="chance"){
   const street=state.street as "turn"|"river";
   blocks.push({key:`aiv2-${street}-board`,kind:"board",street,cards:[token??""],pending:!token,potBb:state.pot,options:[]});continue;
  }
  const index=counts[state.street]++,actionCopy=(action:string)=>action==="check"?copy(locale,"Check","チェック","过牌","Pasar"):action==="fold"?copy(locale,"Fold","フォールド","弃牌","Retirarse"):action==="call"?copy(locale,"Call","コール","跟注","Pagar"):action==="raise"?copy(locale,"Raise","レイズ","加注","Subir"):action==="allin"?copy(locale,"All-in","オールイン","全下","Todo dentro"):`${copy(locale,"Bet","ベット","下注","Apostar")} ${action.slice(3)}%`;
  blocks.push({key:`aiv2-${state.street}-${index}`,kind:"flop",position:state.actor,stack:`${state.stacks[state.actor]}BB`,chosen:token??null,active:token===undefined,options:browseActions(state).map(a=>({action:a.token,label:`${actionCopy(a.token)}${a.paid>0?` ${a.to}BB`:""}`})),...(state.street==="flop"?{flopIndex:index}:{street:state.street,laterIndex:index})});
 }
 return {...selection,blocks,pendingStreet:selection.state.kind==="chance"?selection.state.street as "turn"|"river":null};
}
