// Dedicated public READ-ONLY facade. Never forwards caller URLs, headers or bodies.
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {stripTypeScriptTypes} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readSafeBytes} from './projection.ts';
const HERE=dirname(fileURLToPath(import.meta.url));
const routes:Record<string,{file:string;mime:string}>={'/':{file:'index.html',mime:'text/html; charset=utf-8'},'/app.js':{file:'app.ts',mime:'text/javascript; charset=utf-8'},'/style.css':{file:'style.css',mime:'text/css; charset=utf-8'}};
const phases=new Set(['startup','pin_validation','claim','job_validation','lease_heartbeat','idle_heartbeat','provider','decision_validation','completion_validation','completion_upload','failure_upload','provider_drain']);
const statuses=new Set(['idle','claim_pending','running','completion_pending','failure_pending','complete','failed','uncertain','stale','unknown']);
const phase=(value:unknown)=>typeof value==='string'&&['running','review_wait','ready','halted'].includes(value)?value:null;
const integer=(value:unknown,max=1_000_000)=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=max?Number(value):null;
const stamp=(value:unknown)=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const board=(value:unknown)=>typeof value==='string'&&/^(?:[AKQJT98765432][shdc]){3}$/.test(value)&&new Set(value.match(/../g)).size===3?value:null;
function path(value:unknown):string[]|null{return Array.isArray(value)&&value.length<=64&&value.every(s=>typeof s==='string'&&/^(?:check|fold|call|raise|allin|bet33|bet66|bet125|[AKQJT98765432][shdc])$/.test(s))?[...value]:null;}
export function publicSnapshot(value:any){
 if(value?.schemaVersion!==1||!stamp(value.observedAt)||!value.owner||!value.run||!value.counts||!value.coverage||!Array.isArray(value.lanes)||value.lanes.length>50)throw Error('unavailable');
 const o=value.owner,r=value.run,c=value.counts,v=value.coverage;
 const coverage=(node:any)=>({saved:integer(node?.saved,22100),missing:integer(node?.missing,22100),blocked:integer(node?.blocked,22100),unknown:integer(node?.unknown,22100),parentPending:integer(node?.parentPending,22100),zeroReach:integer(node?.zeroReach,22100)});
 return {schemaVersion:1,observedAt:stamp(value.observedAt),capacity:50,
 owner:{alive:o.alive===true,bindingAvailable:o.bindingAvailable===true,configuredConcurrency:integer(o.configuredConcurrency,50),lastUpdatedAt:stamp(o.lastUpdatedAt),phase:phase(o.phase)},
 run:{status:statuses.has(r.status)?r.status:'unknown',calls:integer(r.calls),decisions:integer(r.decisions),maxCalls:integer(r.maxCalls,200),maxDecisions:integer(r.maxDecisions,100),active:integer(r.active,50),stale:r.stale!==false,lastUpdatedAt:stamp(r.lastUpdatedAt)},
 counts:{queued:integer(c.queued),running:integer(c.running),complete:integer(c.complete),failed:integer(c.failed),uncertain:integer(c.uncertain),recordedAt:stamp(c.recordedAt),source:['broker_snapshot','submission_and_local_journal','local_journal'].includes(c.source)?c.source:null},
 lanes:value.lanes.map((l:any,i:number)=>({lane:integer(l?.lane,50)??i+1,board:board(l?.board),path:path(l?.path),status:statuses.has(l?.status)?l.status:'unknown',phase:phases.has(l?.phase)?l.phase:null,callInFlight:l?.callInFlight===true,active:l?.active===true,elapsedMs:integer(l?.elapsedMs,86_400_000),elapsedSource:['metric','observation'].includes(l?.elapsedSource)?l.elapsedSource:null})),
 coverage:{domain:22100,root:coverage(v.root),check:coverage(v.check),recordedAt:stamp(v.recordedAt),localRecordedAt:stamp(v.localRecordedAt),stale:v.stale!==false,locallyValidatedNotGto:true},
 warnings:Array.isArray(value.warnings)?value.warnings.filter((s:unknown)=>typeof s==='string'&&['owner_not_running','owner_identity_unverified','journal_not_fresh_or_scope_mismatch','current_batch_snapshot_unavailable'].includes(s)):[]};
}
export function permittedPublicRequest(request:Pick<IncomingMessage,'method'|'url'|'headers'|'socket'>){
 if(request.method!=='GET'||!['127.0.0.1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??''))return false;
 const host=String(request.headers.host??'');if(host!=='127.0.0.1:5197'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(host))return false;
 return request.url==='/api/workers'||Object.hasOwn(routes,request.url??'');
}
async function readLocal(){const response=await fetch('http://127.0.0.1:5189/api/workers',{method:'GET',redirect:'error',signal:AbortSignal.timeout(4000),headers:{accept:'application/json'}});if(!response.ok)throw Error('unavailable');if(!response.body)throw Error('unavailable');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256*1024){await reader.cancel();throw Error('unavailable');}chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{reader.releaseLock();}}
export function publicRelayHandler(read:()=>Promise<unknown>=readLocal){return async(request:IncomingMessage,response:ServerResponse)=>{
 response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Cross-Origin-Resource-Policy','same-origin');response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
 const fail=(status:number)=>{response.statusCode=status;response.setHeader('Content-Type','application/json');response.end('{"error":"monitor_unavailable"}');};
 if(!permittedPublicRequest(request)){fail(403);return;}
 try{if(request.url==='/api/workers'){response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(publicSnapshot(await read())));return;}
 const asset=routes[request.url!],file=await readSafeBytes(resolve(HERE,asset.file),512*1024);if(!file){fail(404);return;}
 response.setHeader('Content-Type',asset.mime);response.end(request.url==='/app.js'?stripTypeScriptTypes(file.bytes.toString('utf8'),{mode:'strip'}):file.bytes);
 }catch{fail(503);}
};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)createServer(publicRelayHandler()).listen(5197,'127.0.0.1');
