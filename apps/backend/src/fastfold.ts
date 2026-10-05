import { accountTransport, digest, type AccountEnv } from './account.ts';
import type { D1Database } from './postflop.ts';
import { playHand, type HandResult } from '../../frontend/src/agent/hand.ts';
import { POSITIONS, startPreflop, applyPreflop, preflopOptions, handClass, type Position } from '../../frontend/src/agent/preflop.ts';
import { createAgent, makePostflopKit, type Decider, type PostflopKit } from '../../frontend/src/agent/policy.ts';
import type { SourceDataset } from '../../frontend/scripts/postflop-ai/types.ts';
import nitMeta from '../../frontend/src/estimated/profiles/nit/villain/meta.json' with { type: 'json' };
import stationMeta from '../../frontend/src/estimated/profiles/station/villain/meta.json' with { type: 'json' };
import lagMeta from '../../frontend/src/estimated/profiles/lag/villain/meta.json' with { type: 'json' };
import maniacMeta from '../../frontend/src/estimated/profiles/maniac/villain/meta.json' with { type: 'json' };
import { FASTFOLD_SEASON, fastfoldRating, uncertainty } from './fastfold-rating.ts';

type FastFoldEnv = AccountEnv & { FASTFOLD_ENABLED?: string };
type Dataset = SourceDataset;
type Data = Record<string,Dataset>;
type Player = {user_id:string;public_name:string;rating:number;peak:number;hands:number;net_bb:number;squared_bb:number;rating_net_bb:number};
type HiddenHand = {id:string;number:number;hero:Position;type:string;hole:Record<string,number[]>;board:number[];draws:number[];actions:string[];observations?:Array<Record<string,unknown>>;policies?:Record<string,{flop:string|null;later:string|null}>};
type Private = {hand:HiddenHand;hashes:Record<string,string>;receipt?:{actionId:string;request:string}};
type Session = {id:string;user_id:string;version:number;status:'active'|'paused';private_json:string;settled_id:string|null;settlement_json:string|null};
const BASE = ['opening-ranges','preflop-ranges','three-bet-responses','four-bet-responses','five-bet-responses','limp-responses','limp-deep-responses','multiway-responses','squeeze-responses','cold-three-bet-responses'];
const PROFILE_FILES = BASE.slice(0,7);
const TYPES = ['balanced','nit','station','lag','maniac'];
export const FASTFOLD_DATASETS = [...BASE,...TYPES.slice(1).flatMap(type=>PROFILE_FILES.map(name=>`profiles/${type}/villain/${name}`))];
const META:Record<string,{name:{en:string;ja:string};description:{en:string;ja:string}}>= {nit:nitMeta,station:stationMeta,lag:lagMeta,maniac:maniacMeta,balanced:{name:{en:'Balanced',ja:'バランス'},description:{en:'Plays the saved AI-estimated frequencies.',ja:'保存済みAI推定頻度に沿って行動します。'}}};
const reply = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const metadata = {season:FASTFOLD_SEASON,comparisonMode:'shadow',appliedPenalty:false};
const round = (n:number) => Math.round(n*100)/100;
const uuid = (v:unknown):v is string => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function uniform(n:number):number {
  // Rejection avoids modulo-biased dealing; cryptographic entropy never reaches responses.
  const max=Math.floor(4294967296/n)*n;let value:number;
  do {value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=max);
  return value%n;
}
export function newHand(number:number):HiddenHand {
  const deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--){const j=uniform(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  return {id:crypto.randomUUID(),number,hero:POSITIONS[(number-1)%6],type:TYPES[uniform(TYPES.length)],hole:Object.fromEntries(POSITIONS.map((p,i)=>[p,[deck[i],deck[i+6]]])),board:deck.slice(12,17),draws:Array.from(crypto.getRandomValues(new Uint32Array(128)),v=>v/4294967296),actions:[]};
}
function validateDataset(value:unknown):value is Dataset {
  if(!value||typeof value!=='object'||!('spots' in value)||!Array.isArray(value.spots)||!value.spots.length) return false;
  return value.spots.every(s=>s&&typeof s.id==='string'&&Array.isArray(s.hands)&&s.hands.length===169&&new Set(s.hands.map((r:Record<string,unknown>)=>r.hand)).size===169&&s.hands.every((r:Record<string,unknown>)=>{
    if(typeof r.hand!=='string'||!/^([AKQJT98765432])(?:\1|[AKQJT98765432][so])$/.test(r.hand))return false;
    const freqs=Object.entries(r).filter(([k])=>['fold','open','call','check','limp','three_bet','four_bet','all_in','raise','squeeze'].includes(k)).map(([,v])=>v);
    return freqs.length>0&&freqs.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100)&&Math.abs(freqs.reduce<number>((sum,v)=>sum+Number(v),0)-100)<=.15;
  }));
}
async function loadData(db:D1Database,type:string,expected?:Record<string,string>):Promise<{data:Data;hashes:Record<string,string>}> {
  const names=[...BASE,...(type==='balanced'?[]:PROFILE_FILES.map(n=>`profiles/${type}/villain/${n}`))];
  const placeholders=names.map(()=>'?').join(',');
  const hashes:Record<string,string>={};
  if(expected){for(const name of names){if(!expected[name])throw new Error('fastfold_snapshot_unavailable');hashes[name]=expected[name];}}
  else {
    const current=(await db.prepare(`SELECT name,content_hash,parts FROM preflop_datasets WHERE name IN (${placeholders})`).bind(...names).all<{name:string;content_hash:string;parts:number}>()).results;
    if(current.length!==names.length||current.some(r=>r.parts<1))throw new Error('fastfold_dataset_unavailable');
    for(const row of current)hashes[row.name]=row.content_hash;
    // SQLite copies chunks and metadata atomically. Never persist a mutable global registry.
    await db.prepare(`INSERT OR IGNORE INTO fastfold_dataset_parts(name,content_hash,part,body,parts) SELECT p.name,d.content_hash,p.part,p.body,d.parts FROM preflop_dataset_parts p JOIN preflop_datasets d ON p.name=d.name WHERE p.name IN (${placeholders})`).bind(...names).all();
  }
  const pairs=JSON.stringify(Object.entries(hashes).map(([name,hash])=>({name,hash})));
  const chunks=(await db.prepare("SELECT p.name,p.part,p.body,p.parts FROM fastfold_dataset_parts p JOIN json_each(?) wanted ON p.name=json_extract(wanted.value,'$.name') AND p.content_hash=json_extract(wanted.value,'$.hash') ORDER BY p.name,p.part").bind(pairs).all<{name:string;part:number;body:string;parts:number}>()).results;
  const data:Data={};
  for(const name of names){
    const parts=chunks.filter(row=>row.name===name);
    if(!parts.length||parts.length!==parts[0].parts||parts.some((r,i)=>r.part!==i))throw new Error('fastfold_snapshot_unavailable');
    const text=parts.map(r=>r.body).join('');if(text.length>2_000_000)throw new Error('fastfold_dataset_unavailable');
    if(await digest(text)!==hashes[name])throw new Error('fastfold_dataset_hash_mismatch');
    const parsed:unknown=JSON.parse(text);if(!validateDataset(parsed))throw new Error('fastfold_dataset_unavailable');data[name]=parsed;
  }
  return {data,hashes};
}
export function agentFor(type:string,data:Data):Decider {
  return createAgent({profileId:type,registry:{lookup({key,hand}){
    if(type==='balanced'||!key.startsWith('preflop:')) return null;
    const [file,spotId]=key.slice('preflop:'.length).split('/');
    const row=data[`profiles/${type}/villain/${file}`]?.spots.find(s=>s.id===spotId)?.hands.find(r=>r.hand===hand);
    if(!row) return null;
    return Object.fromEntries(Object.entries(row).filter(([k,v])=>k!=='hand'&&typeof v==='number'&&['fold','open','call','check','limp','three_bet','four_bet','all_in','raise'].includes(k))) as Record<string,number>;
  }}});
}
async function replay(db:D1Database,hand:HiddenHand,data:Data,sharedKits:Map<string,PostflopKit|null>):Promise<HandResult> {
  // Shared only across this authenticated request; replaying before/after reuses public defence work.
  const kits=new Map<string,PostflopKit|null>();
  const setup={seed:'server-private-deal',human:hand.hero,humanActions:hand.actions,agents:agentFor(hand.type,data),datasets:(name:string)=>data[name],dealt:{hole:hand.hole,board:hand.board},draw:(index:number)=>{if(index>=hand.draws.length)throw new Error('decision_budget_exceeded');return hand.draws[index];},fastFold:true,postflop:(id:string)=>kits.get(id)};
  let result=playHand(setup);
  while(result.status==='needs_postflop'&&result.spotId){
    hand.policies??={};
    if(!Object.hasOwn(hand.policies,result.spotId)){
      const rows=(await db.prepare('SELECT stage,policy_json FROM postflop_policies WHERE spot_id=?').bind(result.spotId).all<{stage:string;policy_json:string}>()).results;
      hand.policies[result.spotId]={flop:rows.find(r=>r.stage==='flop')?.policy_json??null,later:rows.find(r=>r.stage==='later')?.policy_json??null};
    }
    const snapshot=hand.policies[result.spotId];
    const kitKey=hand.id+'|'+result.spotId;
    if(!sharedKits.has(kitKey))sharedKits.set(kitKey,makePostflopKit(result.spotId,data,snapshot.flop?JSON.parse(snapshot.flop):null,snapshot.later?JSON.parse(snapshot.later):null));
    kits.set(result.spotId,sharedKits.get(kitKey)??null);
    result=playHand(setup);
  }
  return result;
}
function exposedCards(result:HandResult,hero:Position) {
  const revealed=new Set(result.showdown?POSITIONS.filter(pos=>!result.log.some(e=>e.pos===pos&&e.action==='fold')):[hero]);
  revealed.add(hero);
  return Object.fromEntries(Object.entries(result.holeCards).filter(([pos])=>revealed.has(pos as Position)));
}
export function publicHand(hand:HiddenHand,result:HandResult) {
  return {id:hand.id,number:hand.number,hero:hand.hero,status:result.status,board:result.board,holeCards:exposedCards(result,hand.hero),log:result.log,pending:result.pending,pot:result.pending?.pot??result.pot??0,policyMissing:result.policyMissing??false,policyVersion:'saved-ai-v1',opponents:POSITIONS.filter(pos=>pos!==hand.hero).map(position=>({position,type:hand.type,label:META[hand.type].name.en,description:META[hand.type].description,policyVersion:'saved-ai-v1',tendencyScope:'preflop',postflopType:'balanced'}))};
}
function settlement(hand:HiddenHand,result:HandResult,player:Player) {
  const netBb=result.returns?.[hand.hero];if(typeof netBb!=='number'||!Number.isFinite(netBb))throw new Error('invalid_result');
  const ratingEvidenceBb=Math.max(-10,Math.min(10,netBb));
  return {id:hand.id,hero:hand.hero,netBb,ratingEvidenceBb,beforeRating:player.rating,afterRating:fastfoldRating(player.hands+1,player.rating_net_bb+ratingEvidenceBb,player.squared_bb+netBb*netBb),showdown:!!result.showdown,board:result.board,holeCards:exposedCards(result,hand.hero),winners:result.winners??[],log:result.log,opponentType:hand.type,shadow:{mode:'shadow',appliedPenalty:0,baselineDeviation:null,opponentAdjustedDeviation:null,support:'unavailable',reason:'uncalibrated_ev_reference',coverage:{baseline:false,opponentAdjusted:false},observations:hand.observations??[]}};
}
export function actionStats(recent:Array<{hero:Position;log:HandResult['log']}>) {
  const counts={vpip:{opportunities:recent.length,taken:0},pfr:{opportunities:recent.length,taken:0},threeBet:{opportunities:0,taken:0},foldToThreeBet:{opportunities:0,taken:0}};
  for(const hand of recent){
    const pre=hand.log.filter(e=>e.street==='preflop'),mine=pre.filter(e=>e.pos===hand.hero);
    if(mine.some(e=>!['fold','check'].includes(e.action)))counts.vpip.taken++;
    if(mine.some(e=>['open','three_bet','four_bet','raise','squeeze','all_in'].includes(e.action)))counts.pfr.taken++;
    const first=pre.findIndex(e=>e.pos===hand.hero),prior=pre.slice(0,first);
    if(first>=0&&prior.filter(e=>e.action==='open').length===1&&!prior.some(e=>['three_bet','four_bet','squeeze','all_in'].includes(e.action))){counts.threeBet.opportunities++;if(pre[first].action==='three_bet')counts.threeBet.taken++;}
    const open=pre.findIndex(e=>e.pos===hand.hero&&e.action==='open'),three=pre.findIndex((e,i)=>i>open&&e.action==='three_bet');
    const answer=three>=0&&open>=0?pre.slice(three+1).find(e=>e.pos===hand.hero):null;
    if(answer){counts.foldToThreeBet.opportunities++;if(answer.action==='fold')counts.foldToThreeBet.taken++;}
  }
  return {hands:recent.length,window:'recent_100',coverage:{postflop:'partial'},...Object.fromEntries(Object.entries(counts).map(([key,v])=>[key,{...v,percent:v.opportunities?round(100*v.taken/v.opportunities):null}]))};
}
async function boundedBody(request:Request):Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid_json');const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed;}catch{throw new Error('invalid_json');}
}
export async function routeFastFold(request:Request,env:FastFoldEnv):Promise<Response> {
  if(env.FASTFOLD_ENABLED!=='true'||env.AUTH_ENABLED!=='true'||!env.DB||!env.AUTH_APP_URL||!env.GOOGLE_REDIRECT_URI||!env.AUTH_RATE_LIMIT_KEY) return reply({enabled:false,...metadata,error:'fastfold_not_enabled'},503);
  const url=new URL(request.url),path=url.pathname.slice('/v1/fastfold/'.length),db=env.DB as D1Database;
  const origins=(env.ALLOWED_ORIGIN??'').split(',').map(v=>v.trim()).filter(v=>v&&v!=='*');
  const transport=accountTransport(url,new URL(env.AUTH_APP_URL),new URL(env.GOOGLE_REDIRECT_URI),origins,env.AUTH_LOCAL_DEV);
  if(!transport)return reply({enabled:false,...metadata,error:'fastfold_not_configured'},503);
  if(request.method==='POST'&&(!origins.includes(request.headers.get('origin')??'')||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??'')))return reply({error:'invalid_origin_or_content_type'},403);
  const query=async<T>(sql:string,...args:unknown[])=>(await db.prepare(sql).bind(...args).all<T>()).results;
  try{
    // Verify exact required columns/triggers, not just a flag or table name. Missing schema is closed.
    await query('SELECT user_id,rating,peak,hands,net_bb,squared_bb,rating_net_bb FROM fastfold_players LIMIT 1');
    await query('SELECT id,user_id,version,status,private_json,updated_at,settled_id,settlement_json FROM fastfold_sessions LIMIT 1');
    await query('SELECT id,user_id,at,net_bb,before_rating,after_rating,public_json FROM fastfold_results LIMIT 1');
    await query('SELECT session_id,action_id,request_json,result_id FROM fastfold_actions LIMIT 1');
    await query('SELECT name,content_hash,part,body,parts FROM fastfold_dataset_parts LIMIT 1');
    const triggers=await query<{name:string}>("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('fastfold_accept_action','fastfold_settle','fastfold_aggregate')");
    if(triggers.length!==3)throw new Error('fastfold_schema_unavailable');
    // Read small manifests only; count/contiguity/UTF-8 sizes reject missing or truncated publication.
    // Start additionally hashes and validates its immutable source JSON before issuing any hand.
    const catalog=await query<{name:string;content_hash:string;parts:number;bytes:number;present:number;first:number;last:number;actual_bytes:number}>(`SELECT d.name,d.content_hash,d.parts,d.bytes,COUNT(p.part) present,MIN(p.part) first,MAX(p.part) last,COALESCE(SUM(length(CAST(p.body AS BLOB))),0) actual_bytes FROM preflop_datasets d LEFT JOIN preflop_dataset_parts p ON p.name=d.name WHERE d.name IN (${FASTFOLD_DATASETS.map(()=>'?').join(',')}) GROUP BY d.name`,...FASTFOLD_DATASETS);
    if(catalog.length!==FASTFOLD_DATASETS.length||catalog.some(row=>!/^([a-f0-9]{64})$/.test(row.content_hash)||row.parts<1||row.present!==row.parts||row.first!==0||row.last!==row.parts-1||row.bytes!==row.actual_bytes))throw new Error('fastfold_dataset_unavailable');
    if(path==='status'&&request.method==='GET')return reply({enabled:true,...metadata});
    const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${transport.session}=`))?.slice(transport.session.length+1);
    const now=Date.now();
    const [user]=cookie&&/^[a-f0-9]{64}$/.test(cookie)?await query<{id:string}>('SELECT u.id FROM account_users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',await digest(cookie),Math.floor(now/1000)):[];
    if(!user)return reply({error:'sign_in_required'},401);
    const inputs=new Map<string,Promise<{data:Data;hashes:Record<string,string>}>>();
    const readInputs=(type:string,expected?:Record<string,string>)=>{
      const key=type+'|'+JSON.stringify(expected??null);if(!inputs.has(key)){const pending=loadData(db,type,expected).then(value=>{inputs.set(type+'|'+JSON.stringify(value.hashes),Promise.resolve(value));return value;});inputs.set(key,pending);}return inputs.get(key)!;
    };
    const replays=new Map<string,Promise<HandResult>>();
    const sharedKits=new Map<string,PostflopKit|null>();
    const readHand=(hand:HiddenHand,data:Data)=>{const key=hand.id+'|'+hand.actions.join(',');if(!replays.has(key))replays.set(key,replay(db,hand,data,sharedKits));return replays.get(key)!;};
    const player=async()=> (await query<Player>('SELECT * FROM fastfold_players WHERE user_id=?',user.id))[0]??{user_id:user.id,public_name:'',rating:1000,peak:1000,hands:0,net_bb:0,squared_bb:0,rating_net_bb:0};
    const session=async()=> (await query<Session>('SELECT * FROM fastfold_sessions WHERE user_id=?',user.id))[0];
    const view=async(s:Session)=>{const hidden:Private=JSON.parse(s.private_json),{data}=await readInputs(hidden.hand.type,hidden.hashes);return {id:s.id,version:s.version,status:s.status,hand:publicHand(hidden.hand,await readHand(hidden.hand,data))};};
    const state=async()=>{const p=await player(),s=await session(),rows=await query<{public_json:string}>("SELECT public_json FROM fastfold_results WHERE user_id=? ORDER BY at DESC,rowid DESC LIMIT 100",user.id);return {rating:p.rating,peak:p.peak,hands:p.hands,netBb:round(p.net_bb),bbPer100:p.hands?round(p.net_bb/p.hands*100):null,provisional:p.hands<100,uncertainty:uncertainty(p.hands,p.squared_bb),active:s?await view(s):null,recent:rows.map(r=>JSON.parse(r.public_json)),actionStats:actionStats(rows.map(r=>JSON.parse(r.public_json)))};};
    if(path==='profile'&&request.method==='GET')return reply({enabled:true,...metadata,publicName:(await player()).public_name||null,state:await state()});
    if(path==='leaderboard'&&request.method==='GET'){
      const rows=await query<Player&{place:number}>(`WITH placed AS (SELECT *,ROW_NUMBER() OVER (ORDER BY rating DESC,net_bb / hands DESC,user_id ASC) place FROM fastfold_players WHERE hands>=100) SELECT * FROM placed WHERE place<=100 OR user_id=? ORDER BY place`,user.id);
      return reply({...metadata,rows:rows.map(p=>({id:p.public_name,name:p.public_name,rating:p.rating,hands:p.hands,bbPer100:round(p.net_bb/p.hands*100),place:p.place,self:p.user_id===user.id,provisional:false}))});
    }
    if(request.method!=='POST'||!['start','action','pause'].includes(path))return reply({error:'not_found'},404);
    const body=await boundedBody(request);
    const [limit]=await query<{count:number}>('INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',`fastfold:${user.id}:${Math.floor(now/60000)}`,Math.floor(now/1000)+120);
    if(limit.count>240)return reply({error:'rate_limited'},429);
    await query('DELETE FROM account_rate_limits WHERE expires_at<?',Math.floor(now/1000));
    if(path==='start'){
      if(body.consent!==true||Object.keys(body).some(k=>k!=='consent'))return reply({error:'public_fastfold_consent_required'},400);
      let s=await session();
      if(!s){
        const hand=newHand(1),{hashes,data}=await readInputs(hand.type);await readHand(hand,data);
        await query('INSERT OR IGNORE INTO fastfold_players(user_id,public_name) VALUES (?,?)',user.id,`Player ${crypto.randomUUID().slice(0,8)}`);
        await query("INSERT OR IGNORE INTO fastfold_sessions(id,user_id,status,private_json,updated_at) VALUES (?,?,'active',?,?)",crypto.randomUUID(),user.id,JSON.stringify({hand,hashes}),now);s=await session();
      }else if(s.status==='paused'){
        await query("UPDATE fastfold_sessions SET status='active',version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?",now,s.id,user.id,s.version);s=await session();
      }
      return reply({session:await view(s),state:await state(),...metadata});
    }
    if(!uuid(body.sessionId)||!Number.isInteger(body.version)||Number(body.version)<0||Object.keys(body).some(k=>!['sessionId','version',...(path==='action'?['action','actionId']:[])].includes(k)))return reply({error:'invalid_submission'},400);
    let s=await session();if(!s||s.id!==body.sessionId)return reply({error:'session_not_found'},404);
    const requestKey=JSON.stringify({version:body.version,action:body.action});
    if(path==='action'){
      if(!uuid(body.actionId)||typeof body.action!=='string')return reply({error:'invalid_action'},400);
      const [receipt]=await query<{request_json:string;result_id:string|null}>('SELECT request_json,result_id FROM fastfold_actions WHERE session_id=? AND action_id=?',s.id,body.actionId);
      if(receipt){if(receipt.request_json!==requestKey)return reply({error:'action_id_conflict'},409);const [r]=receipt.result_id?await query<{public_json:string}>('SELECT public_json FROM fastfold_results WHERE id=? AND user_id=?',receipt.result_id,user.id):[];return reply({session:await view(s),state:await state(),...(r?{lastResult:JSON.parse(r.public_json)}:{}),...metadata});}
    }
    if(s.version!==body.version)return reply({error:'stale_version'},409);
    if(path==='pause'){
      const changed=await query<{id:string}>("UPDATE fastfold_sessions SET status='paused',version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? RETURNING id",now,s.id,user.id,s.version);
      if(!changed.length)return reply({error:'stale_version'},409);s=await session();return reply({session:await view(s),state:await state(),...metadata});
    }
    if(s.status!=='active')return reply({error:'session_paused'},409);
    const hidden:Private=JSON.parse(s.private_json),loaded=await readInputs(hidden.hand.type,hidden.hashes),before=await readHand(hidden.hand,loaded.data);
    if(!before.pending?.options.some(o=>o.key===body.action))return reply({error:'illegal_action'},400);
    // Retain only the decision's information set, not actual opponent cards/runout.
    // These observations support offline calibration; no fabricated EV or live penalty.
    let baselineReference:unknown=null;
    if(before.pending.street==='preflop'){
      let pre=startPreflop();
      for(const entry of before.log.filter(e=>e.street==='preflop')){
        const type=entry.action==='fold'?'fold':entry.action==='check'?'check':['call','limp'].includes(entry.action)?'call':'raise';
        pre=applyPreflop(pre,entry.pos,{type,key:entry.action,to:entry.to});
      }
      const offered=preflopOptions(pre,hidden.hand.hero,handClass(hidden.hand.hole[hidden.hand.hero]),name=>loaded.data[name]);
      baselineReference={kind:'saved_frequency_not_ev',source:offered.source,tableRule:offered.tableRule,mix:Object.fromEntries(offered.choices.map(c=>[c.action.key,c.freq]))};
    }
    hidden.hand.observations??=[];
    hidden.hand.observations.push({street:before.pending.street,hero:hidden.hand.hero,heroCards:before.holeCards[hidden.hand.hero],board:[...before.pending.board],pot:before.pending.pot,toCall:before.pending.toCall??0,options:before.pending.options,action:body.action,history:before.log,opponentType:hidden.hand.type,tendencyScope:'preflop',postflopType:'balanced',policyVersion:'saved-ai-v1',sourceHashes:hidden.hashes,baselineReference,support:before.pending.notice??'uncalibrated_ev_reference'});
    hidden.hand.actions.push(String(body.action));let result=await readHand(hidden.hand,loaded.data),p=await player();
    const results:ReturnType<typeof settlement>[]=[];
    let hashes=loaded.hashes;
    while(result.status==='done'){
      const r=settlement(hidden.hand,result,p);results.push(r);p={...p,hands:p.hands+1,net_bb:p.net_bb+r.netBb,squared_bb:p.squared_bb+r.netBb*r.netBb,rating_net_bb:p.rating_net_bb+r.ratingEvidenceBb,rating:r.afterRating};
      hidden.hand=newHand(hidden.hand.number+1);const next=await readInputs(hidden.hand.type);hashes=next.hashes;result=await readHand(hidden.hand,next.data);
    }
    hidden.hashes=hashes;hidden.receipt={actionId:String(body.actionId),request:requestKey};
    const changed=await query<{id:string}>("UPDATE fastfold_sessions SET private_json=?,version=version+1,updated_at=?,settled_id=?,settlement_json=? WHERE id=? AND user_id=? AND version=? AND status='active' RETURNING id",JSON.stringify(hidden),now,results[0]?.id??null,results.length?JSON.stringify(results):null,s.id,user.id,s.version);
    if(!changed.length){
      const [receipt]=await query<{request_json:string;result_id:string|null}>('SELECT request_json,result_id FROM fastfold_actions WHERE session_id=? AND action_id=?',s.id,body.actionId);
      if(!receipt||receipt.request_json!==requestKey)return reply({error:receipt?'action_id_conflict':'stale_version'},409);
      s=await session();const [saved]=receipt.result_id?await query<{public_json:string}>('SELECT public_json FROM fastfold_results WHERE id=? AND user_id=?',receipt.result_id,user.id):[];
      return reply({session:await view(s),state:await state(),...(saved?{lastResult:JSON.parse(saved.public_json)}:{}),...metadata});
    }
    s=await session();return reply({session:await view(s),state:await state(),...(results.length?{lastResult:results[0]}:{}),...metadata});
  }catch(error){const message=error instanceof Error?error.message:'';return reply({enabled:false,...metadata,error:['invalid_json','body_too_large'].includes(message)?message:message.startsWith('fastfold_')?message:'fastfold_service_unavailable'},['invalid_json','body_too_large'].includes(message)?400:503);}
}
