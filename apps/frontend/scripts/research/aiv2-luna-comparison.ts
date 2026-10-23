// Isolated opt-in research. Never writes production cache/queue or uses an API key.
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,ftruncateSync,fstatSync,writeSync,constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {effectivePostflopPrompt,postflopResponseSchema,postflopHash as hash,validatePostflopResponse,buildPostflopArtifact} from '../aiv2-postflop-ondemand.ts';
import {DEFAULT_STORE,implementationHash,loadDecision} from '../aiv2-postflop-ondemand-store.ts';
export const RESEARCH_MODEL='gpt-6-luna',RESEARCH_EFFORT='medium';
export const BASELINES:Record<string,string>={AhKd7c:'5f924b1d0890ceae81fb3f97fb965e5708d9d0b2b9858b95fbd8187a5f4e8a9f','9s8s6d':'45e4e7ff689049f3a98a9c86999c937bc47885f574115c356a7dac6e07067378',Qs7s2s:'bd2c2ff8e1468ee7b6fe771fc74dfc9126c686940e37ee6dcc0105b4b46f689a'};
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const check=(v:unknown)=>{if(!v)throw Error('research_validation_failed');};
export function loadBaseline(board:string){
 check(Object.hasOwn(BASELINES,board));const file=resolve(DEFAULT_STORE,'decisions',BASELINES[board]+'.json');check(!lstatSync(file).isSymbolicLink());const bytes=readFileSync(file);check(bytes.length<4*1024*1024);const envelope=JSON.parse(bytes.toString()),a=envelope.artifact,implementation=implementationHash();
 check(a.input.board===board&&a.input.history.length===0&&a.input.actor==='BB'&&a.metadata.implementation_hash===implementation&&a.metadata.model==='gpt-6.1-sol');
 check(loadDecision(a.input,implementation)?.decision_id===BASELINES[board]);
 check(hash(effectivePostflopPrompt(a.input,a.decision_id))===envelope.prompt_hash);
 return {artifact:a,envelope,rawSha256:digest(bytes),promptHash:envelope.prompt_hash,inputHash:hash(a.input)};
}
export async function compareOne(baseline:ReturnType<typeof loadBaseline>,provider:any,metrics:any[]){
 const a=baseline.artifact,id=a.decision_id,schema=postflopResponseSchema(a.input,id),calls:any[]=[];let issue:string|null=null;
 const validated=await provider.withSession(async(session:any)=>{
  for(let turn=1;turn<=2;turn++){
   const prompt=effectivePostflopPrompt(a.input,id,issue);calls.push({sessionTurn:turn,validationIssue:issue,effectivePromptHash:hash(prompt),schemaHash:hash(schema)});
   let raw:any;try{raw=await session.run(prompt,{model:RESEARCH_MODEL,effort:RESEARCH_EFFORT,outputSchema:schema});}catch(e){if((e as any)?.code!=='invalid_json'||turn===2)throw Error('research_provider_failed_no_retry');issue='Invalid JSON';continue;}
   try{validatePostflopResponse(raw,a.input,id);return {raw,numeric:buildPostflopArtifact(a.input,raw,a.metadata.implementation_hash)};}catch{if(turn===2)throw Error('research_bounded_validation_failed');issue='Invalid numerical/schema/physical-combo coverage';}
  }throw Error('research_bounded_validation_failed');
 });
 check(metrics.length===calls.length&&metrics.length>=1&&metrics.length<=2);
 for(let i=0;i<metrics.length;i++){const m=metrics[i];check(m.model===RESEARCH_MODEL&&m.effort===RESEARCH_EFFORT&&m.confirmedModel===RESEARCH_MODEL&&m.confirmedEffort===RESEARCH_EFFORT&&typeof m.threadId==='string'&&typeof m.turnId==='string'&&m.sessionTurn===i+1&&(!i||m.threadId===metrics[0].threadId));check(m.status==='completed'||i===0&&m.errorCode==='invalid_json');}check(metrics.at(-1).status==='completed');
 check(validated.numeric.hands.length===169);
 const delta=validated.numeric.combos.map((r:any)=>{const b=a.combos.find((x:any)=>x.combo===r.combo);check(b);return Object.keys(r.mix).reduce((n,k)=>n+Math.abs(r.mix[k]-b.mix[k]),0)/2;});
 const byAction=(rows:any[])=>Object.fromEntries(a.legal_actions.map((x:any)=>[x.action,rows.reduce((n,r)=>n+r.reach_weight*r.mix[x.action],0)/rows.reduce((n,r)=>n+r.reach_weight,0)]));
 const project=(m:any)=>Object.fromEntries(['transport','model','effort','confirmedModel','confirmedEffort','threadId','turnId','sessionTurn','elapsedMs','queueMs','turnDurationMs','status','errorCode'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]]));
 const tokens=(m:any)=>{const v=m.tokenUsage?.last;return v&&Object.fromEntries(['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens'].filter(k=>Number.isSafeInteger(v[k])&&v[k]>=0).map(k=>[k,v[k]]));};
 return {kind:'isolated-model-comparison-v1',researchKey:hash({model:RESEARCH_MODEL,effort:RESEARCH_EFFORT,baseline:baseline.rawSha256,inputHash:baseline.inputHash}),board:a.input.board,model:RESEARCH_MODEL,effort:RESEARCH_EFFORT,baseline:{model:'gpt-6.1-sol',rawSha256:baseline.rawSha256,decisionId:id,inputHash:baseline.inputHash,promptHash:baseline.promptHash,metrics:baseline.envelope.attestation.map((m:any)=>({...project(m),lastTokenUsage:tokens(m)}))},calls,attestation:metrics.map(m=>({...project(m),lastTokenUsage:tokens(m)})),response:validated.raw,combos:validated.numeric.combos,hands:validated.numeric.hands,comparison:{baselineReachWeightedActions:byAction(a.combos),lunaReachWeightedActions:byAction(validated.numeric.combos),meanComboTotalVariationPercentagePoints:delta.reduce((n:number,x:number)=>n+x,0)/delta.length,changedCombos:delta.filter((x:number)=>x>0).length,comboCount:delta.length,handCells:169,semanticReview:'pending-independent-EN-JA-factual-review',optimalityClaim:false},approved:false,production_strategy_approved:false,gto_verified:false};
}
async function main(){
 const args=process.argv.slice(2);check(args.length===2&&args.includes('--confirm-isolated-research'));const value=args.find(a=>a.startsWith('--board='));check(value);const board=value!.slice(8),baseline=loadBaseline(board);
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../.local/research/aiv2-luna-comparison');let current='/';for(const part of root.split('/').filter(Boolean)){current=resolve(current,part);if(existsSync(current))check(!lstatSync(current).isSymbolicLink());}mkdirSync(root,{recursive:true,mode:0o700});check((lstatSync(root).mode&0o077)===0);const key=hash({model:RESEARCH_MODEL,baseline:baseline.rawSha256}),file=resolve(root,key+'.json');
 // Process-restart attempt fence (not power-loss durability): never replay an ambiguous failure.
 const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);writeFileSync(fd,JSON.stringify({status:'attempt_reserved',board,model:RESEARCH_MODEL,baselineSha256:baseline.rawSha256})+'\n');
 const metrics:any[]=[];let provider:any;try{const {createLunaResearchProvider}=await import('./aiv2-luna-session.ts');provider=createLunaResearchProvider({concurrency:1,onMetric:(m:any)=>metrics.push(m)});const result=await compareOne(baseline,provider,metrics);check(loadBaseline(board).rawSha256===baseline.rawSha256);check(fstatSync(fd).ino===lstatSync(file).ino&&!lstatSync(file).isSymbolicLink());ftruncateSync(fd,0);writeSync(fd,JSON.stringify(result)+'\n',0,'utf8');console.log(JSON.stringify({status:'saved-research-only',board,model:RESEARCH_MODEL,inputHash:baseline.inputHash,calls:metrics.length}));}finally{provider?.close();closeSync(fd);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('{"status":"research_failed_no_automatic_retry"}');process.exitCode=1;});
