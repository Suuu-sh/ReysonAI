// Browser-only scope identity and explicit user-rule navigation; no model policy is synthesized.
import {onDemandActionBlocks,onDemandHistorySelection,type OnDemandHistory} from './aiv2-ondemand-workspace-state.ts';
export const NODONK_WORKSPACE_SOURCE='ondemand-nodonk';
export const NODONK_METHOD='llm-postflop-nodonk-v1';
export const NODONK_VERSION='user-rule-no-donk-flop-bb-check-v1';
export const NODONK_RULE_HASH='f244b21f22a867ed387ab3b562a578fc93233e1f92b812244b0a3feff6ee82cd';
export function noDonkFlopActions(actions:readonly string[]):string[]{if(actions.length===0)return ['check'];if(actions[0]!=='check')throw Error('Not a no-donk path');return [...actions];}
export function noDonkHistorySelection(history:OnDemandHistory){return onDemandHistorySelection({...history,flopActions:noDonkFlopActions(history.flopActions)});}
export function noDonkActionBlocks(history:OnDemandHistory,locale='en'){
 const selection=onDemandActionBlocks({...history,flopActions:noDonkFlopActions(history.flopActions)},locale);
 const label=({en:'Check 100% · user rule',ja:'チェック100% · ユーザー指定','zh-CN':'过牌100% · 用户规则',es:'Check100% · regla del usuario'} as Record<string,string>)[locale]??'Check100% · user rule';
 selection.blocks[0]={...selection.blocks[0],kind:'forced',chosen:'check',active:false,options:[{action:'check',label}]};return selection;
}
export function validNoDonkRule(value:unknown){const expected={kind:'user-rule-policy',scope:NODONK_VERSION,authority:'user-instruction',street:'flop',actor:'BB',action:'check',probability:1,providerCalls:0,approved:false,production_strategy_approved:false,gto_verified:false,rule_hash:NODONK_RULE_HASH};return value!==null&&typeof value==='object'&&Object.keys(value).length===Object.keys(expected).length&&Object.entries(expected).every(([key,v])=>(value as Record<string,unknown>)[key]===v);}
