// Explicit operator quarantine of an expired, unsaved uncertain job. Read-only:
// never rewrite its journal/campaign, clear a lease, approve a result or refund calls.
import { readFileSync, lstatSync, existsSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { resolve, join, parse } from 'node:path';
import { createHash } from 'node:crypto';
const SHA=/^[a-f0-9]{64}$/;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const keys=(value:any,names:string[])=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
function requireValue(value:unknown):asserts value{if(!value)throw Object.assign(Error('invalid_expired_job_quarantine'),{code:'invalid_expired_job_quarantine'});}
function raw(file:string,max:number){let current=parse(resolve(file)).root;for(const part of resolve(file).slice(current.length).split('/')){current=join(current,part);requireValue(!lstatSync(current).isSymbolicLink());}const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=fstatSync(fd),named=lstatSync(file);requireValue(s.isFile()&&s.ino===named.ino&&s.dev===named.dev&&(s.mode&0o077)===0&&s.size<=max);const bytes=readFileSync(fd);requireValue(bytes.length===s.size);return bytes;}finally{closeSync(fd);}}
const timestamp=(v:unknown)=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
function board(value:unknown):value is string{return typeof value==='string'&&/^(?:[AKQJT98765432][shdc]){3}$/.test(value)&&new Set(value.match(/../g)).size===3;}
export const quarantinePhysicalKey=(value:string)=>(value.match(/../g)??[]).sort().join('');
export type QuarantinePins={revision:string;implementationHash:string;sourceHash:string};
export function validateExpiredJobQuarantine(proof:any,journal:any,campaign:any,context:{journalSha256:string;campaignSha256:string;pins?:QuarantinePins;now:number;alive:(pid:number)=>boolean}){
 requireValue(keys(proof,['schema_version','kind','authorizedBy','recordedAt','originalCampaignId','originalCampaignSha256','originalBatchId','originalJournalSha256','pins','ownerPid','coordinatorPid','jobs','approved','production_strategy_approved','gto_verified'])&&proof.schema_version===1&&proof.kind==='operator-expired-lease-quarantine'&&proof.authorizedBy==='operator'&&proof.approved===false&&proof.production_strategy_approved===false&&proof.gto_verified===false);
 requireValue([proof.originalCampaignId,proof.originalCampaignSha256,proof.originalBatchId,proof.originalJournalSha256].every(v=>typeof v==='string'&&SHA.test(v))&&proof.originalJournalSha256===context.journalSha256&&proof.originalCampaignSha256===context.campaignSha256&&timestamp(proof.recordedAt)&&Date.parse(proof.recordedAt)<=context.now+5000);
 requireValue(keys(proof.pins,['revision','implementationHash','sourceHash'])&&Object.values(proof.pins).every(v=>typeof v==='string'&&SHA.test(v))&&(!context.pins||Object.keys(context.pins).every(k=>proof.pins[k]===context.pins![k as keyof QuarantinePins])));
 requireValue([proof.ownerPid,proof.coordinatorPid].every(pid=>Number.isSafeInteger(pid)&&pid>1&&pid<=2**31-1&&!context.alive(pid))&&proof.ownerPid!==proof.coordinatorPid);
 requireValue(campaign?.campaignId===proof.originalCampaignId&&campaign.phase==='halted'&&campaign.pendingBatchId===proof.originalBatchId&&['revision','implementationHash','sourceHash'].every(k=>campaign.pins?.[k]===proof.pins[k]));
 requireValue(journal?.format==='parallel-owner-v1'&&journal.operatorBatchId===proof.originalBatchId&&journal.claim_pending===false&&['running','failed'].includes(journal.status)&&Array.isArray(journal.entries)&&journal.entries.length>=1&&journal.entries.length<=50);
 const pending=journal.entries.filter((e:any)=>e.status==='failure_pending');requireValue(pending.length>=1&&Array.isArray(proof.jobs)&&proof.jobs.length===pending.length);
 const seen=new Set<string>();
 for(const e of journal.entries){requireValue(e?.job&&typeof e.job.id==='string'&&SHA.test(e.job.id)&&!seen.has(e.job.id)&&board(e.job.board)&&Array.isArray(e.job.path)&&e.job.path.length===0&&['complete','failed','failure_pending'].includes(e.status)&&!Object.hasOwn(e,'completion')&&['revision','implementationHash','sourceHash'].every(k=>e.job[k]===proof.pins[k]));seen.add(e.job.id);if(e.status==='complete')requireValue(e.call_in_flight===false);}
 const jobs=new Set<string>();
 for(const value of proof.jobs){requireValue(keys(value,['id','board','path','status','leaseUntil','hasResult','checkedAt'])&&typeof value.id==='string'&&SHA.test(value.id)&&!jobs.has(value.id)&&board(value.board)&&Array.isArray(value.path)&&value.path.length===0&&value.status==='running'&&value.hasResult===false&&Number.isSafeInteger(value.leaseUntil)&&value.leaseUntil>0&&timestamp(value.checkedAt)&&value.leaseUntil<=Date.parse(value.checkedAt)&&Date.parse(value.checkedAt)<=Date.parse(proof.recordedAt)&&Date.parse(value.checkedAt)<=context.now+5000);jobs.add(value.id);const e=pending.find((e:any)=>e.job.id===value.id);requireValue(e&&e.job.board===value.board&&e.job.id===sha(JSON.stringify({revision:proof.pins.revision,board:value.board,path:[]}))&&e.error==='uncertain_provider_outcome'&&e.call_in_flight===true&&e.calls>=1&&e.calls<=e.job.maxProviderCalls&&e.decisions===0);}
 return {journalSha256:proof.originalJournalSha256 as string,originalBatchId:proof.originalBatchId as string,excludedBoards:journal.entries.map((e:any)=>e.job.board) as string[],pins:proof.pins as QuarantinePins};
}
export function loadExpiredJobQuarantine(file:string,runtime:string,pins?:QuarantinePins){
 const proofRaw=raw(file,64*1024),proof=JSON.parse(proofRaw.toString('utf8'));requireValue(typeof proof.originalCampaignId==='string'&&SHA.test(proof.originalCampaignId));
 const journalRaw=raw(resolve(runtime,'ondemand-bridge/bridge-journal.json'),16*1024*1024),campaignRaw=raw(resolve(runtime,'operator-campaigns',proof.originalCampaignId,'campaign.json'),16*1024*1024);
 const result=validateExpiredJobQuarantine(proof,JSON.parse(journalRaw.toString('utf8')),JSON.parse(campaignRaw.toString('utf8')),{journalSha256:sha(journalRaw),campaignSha256:sha(campaignRaw),pins,now:Date.now(),alive:pid=>{try{process.kill(pid,0);return true;}catch(error){return(error as any)?.code!=='ESRCH';}}});
 const derived=resolve(runtime,'ondemand-bridge/quarantines',result.journalSha256);let current=parse(derived).root;for(const part of derived.slice(current.length).split('/')){current=join(current,part);if(existsSync(current))requireValue(!lstatSync(current).isSymbolicLink());}
 return {...result,proofSha256:sha(proofRaw),runtime:derived};
}
