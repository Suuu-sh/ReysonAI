// Persistence and deterministic reads only. Provider ownership belongs to the explicit CLI.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTFLOP_METHOD, POSTFLOP_VERSION, postflopHash as hash, initialBtnBbInput, decisionIdentity, validatePostflopArtifact, advancePostflopDecision, postflopPrompt, postflopResponseSchema, effectivePostflopPrompt, noDonkBtnInput, noDonkRootPolicy, NO_DONK_RULE } from './aiv2-postflop-nodonk.ts';
import type { DecisionInput, DecisionArtifact } from './aiv2-postflop-nodonk.ts';
const HERE=dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STORE=resolve(HERE,'../candidates/aiv2-postflop',POSTFLOP_METHOD);
export const DEFAULT_SOURCE=resolve(HERE,'../candidates/aiv2-preflop/llm-range-single-response-v6');
export const CONFIG={method:POSTFLOP_METHOD,version:POSTFLOP_VERSION,root_rule:NO_DONK_RULE,model:'gpt-6.1-sol',effort:'medium',srp_bets:[33,66,125],three_bet_plus_bets:[25,50,100],raise_to_multiplier:2.5,max_path:64,max_ancestor_budget:64};
export const readJSON=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
export const implementationHash=()=>hash(['aiv2-postflop-nodonk.ts','aiv2-postflop-nodonk-store.ts','aiv2-postflop-nodonk-cli.ts','lib/aiv2-provider-session.ts'].map(f=>[f,readFileSync(resolve(HERE,f),'utf8')]));
export function normalizeRequest(board:unknown,path:unknown=[]){
 if(typeof board!=='string'||!Array.isArray(path)||path.length>64||path.some(v=>typeof v!=='string'||v.length>12))throw Error('Invalid board/path');
 const cards=board.match(/../g)??[];
 if(board.length!==6||cards.length!==3||new Set(cards).size!==3||cards.some(c=>!/^([AKQJT98765432][shdc])$/.test(c)))throw Error('Invalid three-card flop');
 return {board,path:[...path] as string[]};
}
export async function loadRoot(board:string,source=DEFAULT_SOURCE){
 const manifest=readJSON(resolve(source,'manifest.json'));
 if(manifest.method!=='llm-range-single-response-v6')throw Error('Source manifest mismatch');
 const keys=['base/opening-ranges/BTN_open','base/preflop-ranges/BB_vs_BTN'];
 const artifacts=keys.map(key=>{const node=manifest.nodes?.[key],artifact=readJSON(resolve(source,'spots',key+'.json'));if(node?.status!=='complete'||node.origin!=='single-pass-v6'||hash(artifact)!==node.artifact_hash)throw Error('Source attestation mismatch');return artifact;});
 // Existing independent full preflop reader validation; no generation is imported here.
 const readerPath='../../range-dashboard/server.ts';
 const { verifyArtifact }=await import(readerPath);
 artifacts.forEach(a=>verifyArtifact(a,undefined));
 return noDonkBtnInput(initialBtnBbInput(artifacts[0],artifacts[1],board));
}
export function loadDecision(input:DecisionInput,implementation:string,root=DEFAULT_STORE):DecisionArtifact|null{
 const id=decisionIdentity(input,implementation),file=resolve(root,'decisions',id+'.json');
 if(!existsSync(file))return null;
 const envelope=readJSON(file),artifact=validatePostflopArtifact(envelope.artifact),att=envelope.attestation;
 const prompt=postflopPrompt(input,id),schema=postflopResponseSchema(input,id);
 if(artifact.decision_id!==id||hash(artifact.input)!==hash(input)||envelope.kind!=='attested-nodonk-cache-v1'||envelope.config_hash!==hash(CONFIG)||envelope.prompt_hash!==hash(prompt)||envelope.schema_hash!==hash(schema)||envelope.source_hash!==hash(input.upstream)||envelope.parents_hash!==hash(input.history)||!Array.isArray(att)||att.length<1||att.length>2)throw Error('Cache identity mismatch');
 assertAttestation(att);assertCallProvenance(input,id,att,envelope.provider_calls);
 return artifact;
}
export function assertAttestation(att:any[]){
 if(!Array.isArray(att)||att.length<1||att.length>2)throw Error('Missing provider attestation');
 if(att.some(m=>m.transport!=='pooled-app-server'||m.model!==CONFIG.model||m.effort!==CONFIG.effort||m.confirmedModel!==CONFIG.model||m.confirmedEffort!==CONFIG.effort||!m.threadId||!m.turnId)||att.at(-1).status!=='completed'||att.length===2&&(att[0].threadId!==att[1].threadId||att[0].sessionTurn!==1||att[1].sessionTurn!==2))throw Error('Cache provider attestation mismatch');
 if(att[0].status==='failed'&&att[0].errorCode!=='invalid_json')throw Error('Invalid correction attestation');
 if(att[0].sessionTurn!==1)throw Error('Invalid first session turn');
}
export type CallProvenance = { session_turn:number; validation_issue:string|null; effective_prompt_hash:string; schema_hash:string };
export function callProvenance(input:DecisionInput,id:string,session_turn:number,validation_issue:string|null):CallProvenance {
 return {session_turn,validation_issue,effective_prompt_hash:hash(effectivePostflopPrompt(input,id,validation_issue)),schema_hash:hash(postflopResponseSchema(input,id))};
}
export function assertCallProvenance(input:DecisionInput,id:string,att:any[],calls:CallProvenance[]){
 if(!Array.isArray(calls)||calls.length!==att.length)throw Error('Missing actual request provenance');
 calls.forEach((call,index)=>{
  if(call.session_turn!==index+1||call.session_turn!==att[index].sessionTurn||index===0&&call.validation_issue!==null||index===1&&(typeof call.validation_issue!=='string'||!call.validation_issue.trim()||call.validation_issue.length>2000)||hash(call)!==hash(callProvenance(input,id,index+1,call.validation_issue)))throw Error('Actual request provenance mismatch');
 });
}
export function saveDecision(artifact:DecisionArtifact,attestation:unknown[],root=DEFAULT_STORE,providerCalls:CallProvenance[]){
 validatePostflopArtifact(artifact);assertAttestation(attestation);
 const input=artifact.input,id=artifact.decision_id;
 const calls=providerCalls;
 assertCallProvenance(input,id,attestation,calls);
 const envelope={kind:'attested-nodonk-cache-v1',artifact,config_hash:hash(CONFIG),prompt_hash:hash(postflopPrompt(input,id)),schema_hash:hash(postflopResponseSchema(input,id)),source_hash:hash(input.upstream),parents_hash:hash(input.history),attestation,provider_calls:calls,semantic_review:{status:'not-independently-reviewed',production_approved:false,warnings:[]},saved_at:new Date().toISOString()};
 mkdirSync(resolve(root,'decisions'),{recursive:true});
 writeFileSync(resolve(root,'decisions',id+'.json'),JSON.stringify(envelope)+'\n',{flag:'wx'});
 loadDecision(input,artifact.metadata.implementation_hash,root);
}
/** First uncached ancestor only. No fabricated private range after that frontier. */
export async function resolveFrontier(board:string,path:string[],root=DEFAULT_STORE,source=DEFAULT_SOURCE,implementation=implementationHash()){
 normalizeRequest(board,path);if(path[0]!=='check')throw Error('no_donk_requires_explicit_check_path');let input=await loadRoot(board,source),index=1;
 while(true){
  const artifact=loadDecision(input,implementation,root);
  if(!artifact)return {status:'missing' as const,input,index,id:decisionIdentity(input,implementation)};
  if(index===path.length)return {status:'generated' as const,input,index,artifact};
  const action=path[index++];
  let result;try{result=advancePostflopDecision(artifact,action);}catch(error){if((error as Error).message==='zero-reach')return {status:'zero-reach' as const,index};throw error;}
  if(result.status==='next-street-card-required'){
   if(index===path.length)return {status:'chance' as const,index};
   try{result=advancePostflopDecision(artifact,action,path[index++]);}catch(error){if((error as Error).message==='zero-reach')return {status:'zero-reach' as const,index};throw error;}
  }
  if(result.status==='terminal'){if(index!==path.length)throw Error('Path beyond terminal');return {status:'terminal' as const,index};}
  if(result.status!=='decision')throw Error('Invalid path transition');input=result.input;
 }
}
export function listJobs(root=DEFAULT_STORE){try{return readdirSync(resolve(root,'jobs')).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(f=>readJSON(resolve(root,'jobs',f))).sort((a,b)=>a.created_at.localeCompare(b.created_at));}catch(error){if((error as any).code==='ENOENT')return [];throw error;}}
export function updateJob(job:any,root=DEFAULT_STORE){const file=resolve(root,'jobs',job.id+'.json'),temp=file+'.'+process.pid+'.tmp';writeFileSync(temp,JSON.stringify({...job,updated_at:new Date().toISOString()})+'\n');renameSync(temp,file);}
export async function enqueue(board:string,path:string[],max_decisions=16,root=DEFAULT_STORE,source=DEFAULT_SOURCE){
 normalizeRequest(board,path);if(path[0]!=='check')throw Error('no_donk_requires_explicit_check_path');if(!Number.isInteger(max_decisions)||max_decisions<1||max_decisions>64)throw Error('Invalid ancestor budget');
 const implementation=implementationHash(),input=await loadRoot(board,source),pins={implementation,upstream:input.upstream,config:CONFIG},id=hash({board,path,pins});
 const current=listJobs(root).find(j=>j.id===id);if(current)return current;
 if(listJobs(root).filter(j=>['queued','running'].includes(j.status)).length>=1)throw Error('One queued/running job allowed');
 const job={id,board,path,pins,max_decisions,status:'queued',completed:0,total:max_decisions,current_scene:null,error:null,created_at:new Date().toISOString()};
 mkdirSync(resolve(root,'jobs'),{recursive:true});writeFileSync(resolve(root,'jobs',id+'.json'),JSON.stringify(job)+'\n',{flag:'wx'});return job;
}
