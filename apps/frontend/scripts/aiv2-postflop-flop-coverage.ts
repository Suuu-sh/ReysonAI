// Offline physical-flop coverage only. Never imports a provider, enqueues, retries,
// starts an owner, or collapses suits into an unverified isomorphism class.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG, DEFAULT_STORE, implementationHash, loadDecision, loadRoot, normalizeRequest } from './aiv2-postflop-ondemand-store.ts';
import { advancePostflopDecision, decisionIdentity, postflopHash as hash } from './aiv2-postflop-ondemand.ts';
import type { DecisionInput } from './aiv2-postflop-ondemand.ts';
const DECK=Object.freeze([... 'AKQJT98765432'].flatMap(rank=>[...'shdc'].map(suit=>rank+suit)));
const CARD_ORDER=new Map(DECK.map((card,index)=>[card,index]));
const SHA=/^[a-f0-9]{64}$/;
function fail(code:string):never{throw Object.assign(new Error(code),{code});}
export function physicalFlopKey(board:string){
 const {board:valid}=normalizeRequest(board,[]),cards=valid.match(/../g)!;
 return cards.sort((a,b)=>CARD_ORDER.get(a)!-CARD_ORDER.get(b)!).join('');
}
export function enumeratePhysicalFlops(blockedCards:string[]=[]){
 if(!Array.isArray(blockedCards)||new Set(blockedCards).size!==blockedCards.length||blockedCards.some(card=>!CARD_ORDER.has(card)))fail('coverage_invalid_blockers');
 const blocked=new Set(blockedCards),deck=DECK.filter(card=>!blocked.has(card)),boards:string[]=[];
 for(let a=0;a<deck.length-2;a++)for(let b=a+1;b<deck.length-1;b++)for(let c=b+1;c<deck.length;c++)boards.push(deck[a]+deck[b]+deck[c]);
 return boards;
}
type SnapshotJob={id:string;revision:string;board:string;path:string[];status:'queued'|'running'|'complete'|'failed'};
type Snapshot={recordedAt:string;revision:string;source:string;jobs:SnapshotJob[]};
export function validateCoverageSnapshot(value:any,revision:string):Snapshot{
 const keys=(row:any,names:string[])=>row&&typeof row==='object'&&!Array.isArray(row)&&JSON.stringify(Object.keys(row).sort())===JSON.stringify([...names].sort());
 if(!keys(value,['recordedAt','revision','source','jobs'])||value.revision!==revision||typeof value.recordedAt!=='string'||!Number.isFinite(Date.parse(value.recordedAt))||typeof value.source!=='string'||!value.source.trim()||!Array.isArray(value.jobs)||value.jobs.length>100_000)fail('coverage_snapshot_invalid');
 const seen=new Set<string>();
 for(const job of value.jobs){
  if(!keys(job,['id','revision','board','path','status'])||!SHA.test(job.id)||seen.has(job.id)||job.revision!==revision||!['queued','running','complete','failed'].includes(job.status))fail('coverage_snapshot_invalid');
  const request=normalizeRequest(job.board,job.path);
  if(job.id!==hash({revision,...request}))fail('coverage_snapshot_invalid');seen.add(job.id);
 }
 return value;
}
type State='S'|'M'|'P'|'Z'|'U'|'B';
type Target={state:State;board?:string;decisionId?:string;parentId?:string;file?:string};
type Candidate={id:string;file:string;board:string;key:string;role:'root'|'check';sha256:string};
type Options={source:string;root?:string;nextTarget?:'root'|'check';limit?:number;snapshot?:unknown};
export async function planFlopCoverage(options:Options){
 const root=resolve(options.root??DEFAULT_STORE),source=resolve(options.source),implementation=implementationHash(),limit=options.limit??16,nextTarget=options.nextTarget??'root';
 if(!Number.isInteger(limit)||limit<1||limit>16||!['root','check'].includes(nextTarget))fail('coverage_invalid_next_batch');
 const inputs=new Map<string,Promise<DecisionInput>>();
 const inputFor=(board:string)=>{let result=inputs.get(board);if(!result){result=loadRoot(board,source);inputs.set(board,result);}return result;};
 const seed=await inputFor('As7d2c'),sourceHash=hash(seed.upstream),revision=hash({method:CONFIG.method,version:CONFIG.version,implementationHash:implementation,sourceHash});
 const snapshot=options.snapshot===undefined?null:validateCoverageSnapshot(options.snapshot,revision);
 const broker=new Map<string,SnapshotJob[]>();
 for(const job of snapshot?.jobs??[]){
  if(job.path.length>1||job.path.length===1&&job.path[0]!=='check')continue;
  const key=physicalFlopKey(job.board)+'/'+(job.path.length?'check':'root');broker.set(key,[...(broker.get(key)??[]),job]);
 }
 const cacheDir=resolve(root,'decisions'),candidates:Candidate[]=[],issues:Array<{file:string;reason:string;board?:string;physicalBoard?:string}>=[],fileIds=new Set<string>();
 const files=existsSync(cacheDir)?readdirSync(cacheDir).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort():[];
 let ignored=0;
 for(const name of files){
  const file=resolve(cacheDir,name),id=name.slice(0,-5);fileIds.add(id);
  try{
   const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)fail('coverage_cache_file_unsafe');
   const bytes=readFileSync(file);if(bytes.length!==stat.size)fail('coverage_cache_file_changed');
   const value=JSON.parse(bytes.toString('utf8')),input=value?.artifact?.input;
   if(!input||!Array.isArray(input.history))fail('coverage_unvalidated_metadata');
   if(input.street!=='flop'){ignored++;continue;}
   const role=input.actor==='BB'&&input.history.length===0?'root':input.actor==='BTN'&&input.history.length===1&&input.history[0]?.seat==='BB'&&input.history[0]?.action==='check'?'check':null;
   if(!role){ignored++;continue;}
   const key=physicalFlopKey(input.board);
   candidates.push({id,file,board:input.board,key,role,sha256:createHash('sha256').update(bytes).digest('hex')});
  }catch{issues.push({file,reason:'unattributed-unvalidated-cache-file'});}
 }
 const boards=enumeratePhysicalFlops(),states=new Map<string,{root:Target;check:Target}>(),validated:Array<{board:string;physicalBoard:string;role:string;decisionId:string;parentId?:string;file:string;sha256:string}>=[];
 const stateFor=(key:string)=>{let value=states.get(key);if(!value){value={root:{state:'M'},check:{state:'P'}};states.set(key,value);}return value;};
 const markIssue=(candidate:Candidate,reason:string)=>{issues.push({file:candidate.file,reason,board:candidate.board,physicalBoard:candidate.key});};
 const indexed=new Map<string,{roots:Candidate[];children:Candidate[]}>();
 for(const candidate of candidates){let value=indexed.get(candidate.board);if(!value){value={roots:[],children:[]};indexed.set(candidate.board,value);}value[candidate.role==='root'?'roots':'children'].push(candidate);}
 const actualBoards=[...indexed.keys()].sort();
 for(const board of actualBoards){
  const key=physicalFlopKey(board),state=stateFor(key),{roots,children}=indexed.get(board)!;
  try{
   const expected=await inputFor(board),canonical=await inputFor(key);
   // Only input-equivalent physical-card order aliases count toward coverage.
   // No artifact, identity, history, policy or request board is relabelled.
   if(hash({...expected,board:key})!==hash(canonical))fail('coverage_physical_input_mismatch');
   const expectedId=decisionIdentity(expected,implementation),candidate=roots.find(c=>c.id===expectedId);
   for(const other of roots.filter(c=>c!==candidate))markIssue(other,'root-not-current-input-identity');
   if(!candidate){
    if((roots.length||children.length)&&state.root.state!=='S')state.root={state:'U'};
    if(children.length&&state.check.state!=='S')state.check={state:'U'};
    for(const child of children)markIssue(child,'child-parent-not-locally-validated');continue;
   }
   const artifact=loadDecision(expected,implementation,root);if(!artifact)fail('coverage_expected_root_missing');
   state.root={state:'S',board,decisionId:artifact.decision_id,file:candidate.file};
   validated.push({board,physicalBoard:key,role:'root',decisionId:artifact.decision_id,file:candidate.file,sha256:candidate.sha256});
   try{
    const next=advancePostflopDecision(artifact,'check');if(next.status!=='decision')fail('coverage_unexpected_check_transition');
    const childId=decisionIdentity(next.input,implementation),childCandidate=children.find(c=>c.id===childId);
    for(const other of children.filter(c=>c!==childCandidate))markIssue(other,'child-not-current-parent-identity');
    if(!childCandidate){
     if(state.check.state!=='S')state.check={state:children.length||fileIds.has(childId)?'U':'M',board,parentId:artifact.decision_id,decisionId:childId};
    }else{
     const child=loadDecision(next.input,implementation,root);if(!child)fail('coverage_expected_child_missing');
     state.check={state:'S',board,decisionId:child.decision_id,parentId:artifact.decision_id,file:childCandidate.file};
     validated.push({board,physicalBoard:key,role:'check',decisionId:child.decision_id,parentId:artifact.decision_id,file:childCandidate.file,sha256:childCandidate.sha256});
    }
   }catch(error){
    if(state.check.state!=='S')state.check={state:(error as Error).message==='zero-reach'?'Z':'U',board,parentId:artifact.decision_id};
    if((error as Error).message!=='zero-reach')markIssue(candidate,'check-child-not-validated');
   }
  }catch{
   if(state.root.state!=='S')state.root={state:'U'};if(state.check.state!=='S')state.check={state:'U'};
   for(const candidate of [...roots,...children])markIssue(candidate,'source-input-or-cache-not-validated');
  }
 }
 const rows:Array<[string,State,State]>=[],requests:Array<{board:string;path:string[];physicalBoard:string;parentId?:string;decisionId?:string}>=[];
 const counts={root:{S:0,M:0,P:0,Z:0,U:0,B:0},check:{S:0,M:0,P:0,Z:0,U:0,B:0}};
 const unattributed=issues.some(issue=>!issue.physicalBoard);
 for(const board of boards){
  const state=stateFor(board);
  for(const target of ['root','check'] as const){
   const jobs=broker.get(board+'/'+target)??[],node=state[target];
   if(node.state!=='S'&&jobs.length)node.state=jobs.some(job=>job.status!=='complete')?'B':'U';
  }
  rows.push([board,state.root.state,state.check.state]);counts.root[state.root.state]++;counts.check[state.check.state]++;
  const node=state[nextTarget];
  if(!unattributed&&requests.length<limit&&node.state==='M')requests.push({board:node.board??board,path:nextTarget==='check'?['check']:[],physicalBoard:board,...(node.parentId?{parentId:node.parentId}:{}),...(node.decisionId?{decisionId:node.decisionId}:{})});
 }
 if(implementationHash()!==implementation||hash((await loadRoot('As7d2c',source)).upstream)!==sourceHash)fail('coverage_pins_changed');
 return {schema_version:1,kind:'offline-all-physical-flop-coverage-plan',scope:{spot:'BTN_open_BB_call',open_bb:2.5,effective_stack_bb:100,physical_flops:22100,targets:['BB root','BTN after BB check'],suit_isomorphism_applied:false},pins:{implementationHash:implementation,sourceHash,revision,configHash:hash(CONFIG)},deck_order:DECK,physical_domain_sha256:hash(boards),row_columns:['physical_board','root_state','check_btn_state'],state_legend:{S:'locally validated immutable saved decision',M:'missing local target; not permission to generate',P:'parent not locally saved/validated',Z:'saved parent check has zero reach',U:'unknown/not locally validated; never counted saved',B:'snapshot says failed/queued/running; never retried'},rows,summary:{physical_flops:boards.length,root:counts.root,check:counts.check,validated_artifacts:validated.length,unknown_files:issues.length,unattributed_unknown_files:issues.filter(issue=>!issue.physicalBoard).length},validated_artifacts:validated,unknown_files:issues,ignored_out_of_scope_files:ignored,validation_work:{candidate_files:files.length,unique_existing_board_orders:actualBoards.length,source_root_reads:inputs.size+1,domain_root_inputs_constructed:0},broker_snapshot:snapshot?{recordedAt:snapshot.recordedAt,source:snapshot.source,revision:snapshot.revision,jobs:snapshot.jobs.length}:null,next_batch:{target:nextTarget,limit,requests,structural_max_decisions:requests.length*(nextTarget==='check'?2:1),structural_max_calls:requests.length*(nextTarget==='check'?4:2),enqueued:false,execution_authorized:false,requires_explicit_confirmation:true,requires_fresh_owner_status_preflight:true,blocked_reason:unattributed?'unattributed-unvalidated-cache-file':null},approved:false,production_strategy_approved:false,gto_verified:false,limitations:['Physical card-order aliases count only after validated actual/canonical root input equality. Actual artifact boards/IDs and child-parent links remain unchanged.','Only these two flop nodes are planned, not a full action tree or turn/river runout expansion.','Saved coverage is numerical/provenance validation, not independent factual, strategic or GTO approval.','Offline broker snapshots can be stale; even a next-batch candidate requires fresh owner preflight and explicit bounded authorization. No failed job is retried.']};
}
export function writeFlopCoveragePlan(plan:Awaited<ReturnType<typeof planFlopCoverage>>,output?:string){
 const runtime=resolve(fileURLToPath(new URL('../../../',import.meta.url)),'.local/range-dashboard/flop-coverage'),file=resolve(output??resolve(runtime,'coverage-plan.json'));
 if(!file.startsWith(runtime+'/')||file===runtime)fail('coverage_private_runtime_output_required');
 const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));let parent=repo;
 for(const part of relative(repo,dirname(file)).split('/')){parent=join(parent,part);if(existsSync(parent)){if(lstatSync(parent).isSymbolicLink()||!lstatSync(parent).isDirectory())fail('coverage_output_parent_unsafe');}else mkdirSync(parent,{mode:0o700});}
 if(existsSync(file)){const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||JSON.parse(readFileSync(file,'utf8')).kind!==plan.kind)fail('coverage_output_not_owned');}
 const temp=file+'.'+process.pid+'.tmp';writeFileSync(temp,JSON.stringify(plan)+'\n',{flag:'wx',mode:0o600});renameSync(temp,file);return file;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=(name:string)=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
 try{
  const source=get('source-dir');if(!source||!args.includes('--plan-only'))fail('coverage_explicit_offline_plan_required');
  const snapshot=get('broker-snapshot');
  const plan=await planFlopCoverage({source,root:get('store-dir'),nextTarget:(get('next-target')??'root') as 'root'|'check',limit:Number(get('limit')??16),snapshot:snapshot?JSON.parse(readFileSync(resolve(snapshot),'utf8')):undefined});
  const output=writeFlopCoveragePlan(plan,get('output'));console.log(JSON.stringify({status:'offline-plan-saved',output,summary:plan.summary,next_target:plan.next_batch.target,next_count:plan.next_batch.requests.length,requires_fresh_owner_status_preflight:true,execution_authorized:false}));
 }catch{console.error(JSON.stringify({status:'failed',error:'offline_flop_coverage_unavailable_no_generation_or_retry'}));process.exitCode=1;}
}
