import { accountTransport, digest, type AccountEnv } from './account.ts';
import type { D1Database } from './postflop.ts';
import { createHand, applyAction, forfeit, legalActions, publicProjection, POSITIONS, type MultiplayerHand } from './multiplayer-engine.ts';
import { cardText } from '../../frontend/scripts/postflop-ai/flop-isomorphism.ts';
import { rankedHistory } from './ranked-history.ts';

type Env=AccountEnv&{FASTFOLD_ENABLED?:string};
type Player={user_id:string;public_id:string;public_name:string;phase:'out'|'queued'|'reserved'|'hand'|'break';version:number;lease_until:number;break_until:number|null;table_id:string|null;seat:number|null;accepted:number;rating:number;peak:number;hands:number;net_bb:number;rating_net_bb:number};
type Private={users:(string|null)[];hand:MultiplayerHand|null};
type Table={id:string;version:number;status:'reserved'|'active'|'done'|'cancelled';private_json:string;created_at:number;expires_at:number};
export const HUMAN_SEASON='human-fastfold-v1';
const LEASE=45_000,RESERVATION=60_000,TURN=30_000,BREAK=900_000;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const metadata={season:HUMAN_SEASON,mode:'six_verified_humans',requiredHumans:6,comparisonMode:'shadow',appliedPenalty:false};
const q=<T>(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args).all<T>().then(r=>r.results);
function deck(){const d=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const n=i+1,limit=Math.floor(4294967296/n)*n;let value;do{value=crypto.getRandomValues(new Uint32Array(1))[0]}while(value>=limit);const j=value%n;[d[i],d[j]]=[d[j],d[i]];}return d;}
function projection(hand:MultiplayerHand,seat:number){const v=publicProjection(hand,seat);return {...v,board:v.board.map(cardText),holeCards:Object.fromEntries(Object.entries(v.holeCards).map(([p,c])=>[p,c!.map(cardText)]))};}
const shadow={mode:'shadow',appliedPenalty:0,baselineDeviation:null,opponentAdjustedDeviation:null,support:'uncalibrated_ev_reference'};
function settlements(t:Table,hidden:Private){const hand=hidden.hand!;if(!hand.result) return null;return JSON.stringify(hidden.users.flatMap((user,seat)=>{if(user===null)return [];const view=projection(hand,seat);return {user,net:hand.result!.net[seat],public:JSON.stringify({id:t.id,season:HUMAN_SEASON,hero:POSITIONS[seat],netBb:hand.result!.net[seat]/100,showdown:hand.result!.showdown,board:view.board,holeCards:view.holeCards,winners:hand.result!.winners.map(i=>POSITIONS[i]),shadow,log:hand.log})};}));}
async function commitTable(db:D1Database,t:Table,hidden:Private,now:number,receipt:unknown=null,departure:{user:string;version:number;phase:'break'|'out';deadline:number|null}|null=null){
 const done=hidden.hand?.status==='done',previous:Private=JSON.parse(t.private_json);
 const deadline=previous.hand?.turn===hidden.hand?.turn&&previous.hand?.street===hidden.hand?.street?t.expires_at:now+TURN;
 return (await q<{id:string}>(db,"UPDATE human_rank_tables SET private_json=?,version=version+1,status=?,expires_at=?,updated_at=?,receipt_json=?,settlement_json=?,departure_json=? WHERE id=? AND version=? AND status='active' AND (? IS NULL OR EXISTS(SELECT 1 FROM human_rank_players WHERE user_id=json_extract(?,'$.user') AND version=json_extract(?,'$.version'))) RETURNING id",JSON.stringify(hidden),done?'done':'active',done?0:deadline,now,receipt?JSON.stringify(receipt):null,done?settlements(t,hidden):null,departure?JSON.stringify(departure):null,t.id,t.version,departure?JSON.stringify(departure):null,departure?JSON.stringify(departure):null,departure?JSON.stringify(departure):null)).length>0;
}
// Bounded, persistent, idempotent work is used by both requests and actual DO alarms.
export async function sweepHumanRank(env:Env,now=Date.now()){
 const db=env.DB as D1Database;if(!db||env.FASTFOLD_ENABLED!=='true')return;
 await q(db,"UPDATE human_rank_players SET phase='out',version=version+1,break_until=NULL WHERE user_id IN (SELECT user_id FROM human_rank_players WHERE phase='break' AND break_until<=? LIMIT 128)",now);
 const reservations=await q<Table>(db,"SELECT t.* FROM human_rank_tables t WHERE status='reserved' AND (expires_at<=? OR EXISTS(SELECT 1 FROM human_rank_players p WHERE p.table_id=t.id AND p.lease_until<=?)) LIMIT 4",now,now);
 for(const t of reservations)await q(db,"UPDATE human_rank_tables SET status='cancelled',version=version+1 WHERE id=? AND version=? AND status='reserved'",t.id,t.version);
 await q(db,"UPDATE human_rank_players SET phase='out',version=version+1 WHERE user_id IN (SELECT user_id FROM human_rank_players WHERE phase='queued' AND lease_until<=? LIMIT 128)",now);
 const due=await q<Table>(db,"SELECT * FROM human_rank_tables WHERE status='active' AND expires_at<=? ORDER BY expires_at LIMIT 4",now);
 for(const t of due){const hidden:Private=JSON.parse(t.private_json),hand=hidden.hand!;if(hand.turn===null)continue;
  // SQL deletion anonymizes the seat and queues forfeiture. Only the pure rules
  // engine drains it: off-turn/all-in rights and unmatched refunds remain intact.
  if(hidden.users[hand.turn]===null){hidden.hand=forfeit(hand,hand.turn);await commitTable(db,t,hidden,now);continue;}
  const action=legalActions(hand).some(a=>a.key==='check')?'check':'fold';hidden.hand=applyAction(hand,hand.turn,action);await commitTable(db,t,hidden,now);}
}
export async function nextHumanDeadline(env:Env){const db=env.DB as D1Database;const [row]=await q<{due:number|null}>(db,"SELECT MIN(due) due FROM (SELECT expires_at due FROM human_rank_tables WHERE status IN ('reserved','active') UNION ALL SELECT lease_until FROM human_rank_players WHERE phase IN ('queued','reserved') UNION ALL SELECT break_until FROM human_rank_players WHERE phase='break')");return row?.due??null;}
async function progressPool(db:D1Database,now:number){
 const ready=await q<Table>(db,"SELECT t.* FROM human_rank_tables t WHERE status='reserved' AND expires_at>? AND (SELECT COUNT(*) FROM human_rank_players p WHERE p.table_id=t.id AND p.phase='reserved' AND p.accepted=1 AND p.lease_until>?)=6 LIMIT 1",now,now);
 for(const t of ready){const hidden:Private=JSON.parse(t.private_json);hidden.hand=createHand({id:t.id,deck:deck()});await q(db,"UPDATE human_rank_tables SET private_json=?,status='active',created_at=?,updated_at=?,expires_at=?,version=version+1 WHERE id=? AND version=? AND status='reserved' AND expires_at>?",JSON.stringify(hidden),now,now,now+TURN,t.id,t.version,now);}
 const waiting=await q<{user_id:string}>(db,"SELECT user_id FROM human_rank_players WHERE phase='queued' AND lease_until>? ORDER BY rowid LIMIT 6",now);
 if(waiting.length===6){try{await q(db,"INSERT INTO human_rank_tables(id,status,private_json,created_at,expires_at,updated_at) VALUES (?,'reserved',?,?,?,?)",crypto.randomUUID(),JSON.stringify({users:waiting.map(p=>p.user_id),hand:null}),now,now+RESERVATION,now);}catch(e){if(!String(e).includes('human_pair_conflict'))throw e;}}
}
async function bounded(request:Request){let size=0;const parts:Uint8Array[]=[];const reader=request.body?.getReader();if(!reader)throw Error('invalid_json');for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4096){await reader.cancel();throw Error('body_too_large')}parts.push(r.value)}const bytes=new Uint8Array(size);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length}let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error('invalid_json')}if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_json');return value as Record<string,unknown>;}
export async function routeHumanRank(request:Request,env:Env):Promise<Response>{
 if(env.FASTFOLD_ENABLED!=='true'||env.AUTH_ENABLED!=='true'||!env.DB||!env.AUTH_APP_URL||!env.GOOGLE_REDIRECT_URI||!env.AUTH_RATE_LIMIT_KEY)return reply({enabled:false,error:'human_rank_not_enabled',...metadata},503);
 const url=new URL(request.url),path=url.pathname.slice('/v1/fastfold/human/'.length),db=env.DB as D1Database;
 const origins=(env.ALLOWED_ORIGIN??'').split(',').map(x=>x.trim()).filter(x=>x&&x!=='*');
 const transport=accountTransport(url,new URL(env.AUTH_APP_URL),new URL(env.GOOGLE_REDIRECT_URI),origins,env.AUTH_LOCAL_DEV);
 if(!transport)return reply({error:'not_configured'},503);
 if(request.method==='POST'&&(!origins.includes(request.headers.get('origin')??'')||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??'')))return reply({error:'invalid_origin_or_content_type'},403);
 let now=Date.now();const respond=(body:Record<string,unknown>,status=200)=>reply({...metadata,serverNow:now,...body},status);
 try{
  await q(db,'SELECT user_id,public_id,phase,lease_until,break_until,table_id,seat,accepted,version,rating,peak,hands,net_bb,rating_net_bb,receipt_json FROM human_rank_players LIMIT 0');
  await q(db,'SELECT id,version,status,private_json,expires_at,receipt_json,settlement_json,departure_json FROM human_rank_tables LIMIT 0');
  await q(db,'SELECT user_id,action_id,request_json FROM human_rank_receipts LIMIT 0');await q(db,'SELECT table_id,user_id,net_cents,before_rating,after_rating,public_json FROM human_rank_results LIMIT 0');
  const triggers=await q<{name:string}>(db,"SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('human_rank_claim','human_rank_reserved','human_rank_activate','human_rank_phase','human_rank_player_receipt','human_rank_table_receipt','human_rank_settle','human_rank_aggregate','human_rank_departure','human_rank_delete')");if(triggers.length!==10)throw Error('human_rank_schema_unavailable');
  if(path==='status'&&request.method==='GET')return respond({enabled:true});
  const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(transport.session+'='))?.slice(transport.session.length+1);
  const [user]=cookie&&/^[a-f\d]{64}$/.test(cookie)?await q<{id:string}>(db,'SELECT u.id FROM account_users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',await digest(cookie),Math.floor(now/1000)):[];
  if(!user)return respond({error:'sign_in_required'},401);
  if(path==='history'&&request.method==='GET')return await rankedHistory(db,user.id,url.searchParams);
  if(request.method==='GET')await sweepHumanRank(env,now);
  const player=async()=> (await q<Player>(db,'SELECT * FROM human_rank_players WHERE user_id=?',user.id))[0];
  const table=async(id:string)=> (await q<Table>(db,'SELECT * FROM human_rank_tables WHERE id=?',id))[0];
  const publicPlayer=(p:Player)=>({id:p.public_id,name:p.public_name,rating:p.rating,hands:p.hands,style:'unknown',tendencyScope:'observed_only'});
  const state=async()=>{
   const p=await player();const [count]=await q<{humans:number}>(db,"SELECT COUNT(*) humans FROM human_rank_players WHERE phase IN ('queued','reserved') AND lease_until>?",now);
   const recent=await q<{public_json:string}>(db,'SELECT public_json FROM human_rank_results WHERE user_id=? ORDER BY at DESC,rowid DESC LIMIT 100',user.id);
   const base={rating:p?.rating??1000,peak:p?.peak??1000,hands:p?.hands??0,netBb:p?.net_bb??0,bbPer100:p?.hands?p.net_bb/p.hands*100:null,provisional:(p?.hands??0)<100,uncertainty:null,recent:recent.map(r=>JSON.parse(r.public_json)),phase:p?.phase??'out',version:p?.version??0,leaseExpiresAt:p?.lease_until??0,queue:{humans:count.humans,required:6},...(p?.break_until?{breakExpiresAt:p.break_until}:{})};
   if(!p?.table_id)return base;const t=await table(p.table_id);if(!t)return base;
   if(t.status==='reserved'){const [accepted]=await q<{n:number}>(db,'SELECT COUNT(*) n FROM human_rank_players WHERE table_id=? AND accepted=1',t.id);return {...base,reservation:{id:t.id,expiresAt:t.expires_at,accepted:!!p.accepted,acceptedHumans:accepted.n}};}
   if(t.status==='active'&&p.phase==='hand'&&p.seat!==null){const hidden:Private=JSON.parse(t.private_json),participants=await q<Player>(db,"SELECT * FROM human_rank_players WHERE user_id IN (SELECT value FROM json_each(?,'$.users'))",t.private_json);return {...base,match:{id:t.id,version:t.version,hero:p.seat,turnExpiresAt:t.expires_at,hand:projection(hidden.hand!,p.seat),participants:hidden.users.map((id,seat)=>({seat,position:POSITIONS[seat],player:id!==null&&participants.some(x=>x.user_id===id)?publicPlayer(participants.find(x=>x.user_id===id)!):{id:`departed-${t.id}-${seat}`,name:'Departed player',rating:null,hands:null,style:'unknown',tendencyScope:'observed_only',unavailable:true}}))}};}
   return base;
  };
  if(request.method==='GET'){
   if(path==='profile'){await progressPool(db,now);return respond({enabled:true,state:await state()});}
   if(path==='leaderboard'){const players=await q<Player>(db,'SELECT * FROM human_rank_players WHERE hands>=100 ORDER BY rating DESC,net_bb/hands DESC,public_id LIMIT 100');return respond({rows:players.map((p,i)=>({...publicPlayer(p),place:i+1,self:p.user_id===user.id,bbPer100:p.net_bb/p.hands*100,provisional:false}))});}
   if(path==='opponent'){const [p]=await q<Player>(db,'SELECT * FROM human_rank_players WHERE public_id=?',url.searchParams.get('player'));if(!p)return respond({error:'player_not_found'},404);const samples=await q<{public_json:string}>(db,'SELECT public_json FROM human_rank_results WHERE user_id=? ORDER BY at DESC,rowid DESC LIMIT 100',p.user_id);const logs=samples.map(r=>JSON.parse(r.public_json) as {hero:string;log:Array<{seat:number;street:string;action:string;to:number}>});const vpip=logs.filter(r=>r.log.some(e=>e.street==='preflop'&&POSITIONS[e.seat]===r.hero&&['call','raise','all_in'].includes(e.action))).length,pfr=logs.filter(r=>{let highest=100,raised=false;for(const e of r.log){if(e.street!=='preflop')continue;if(POSITIONS[e.seat]===r.hero&&(e.action==='raise'||e.action==='all_in'&&e.to>highest))raised=true;highest=Math.max(highest,e.to);}return raised;}).length;return respond({player:{...publicPlayer(p),netBb:p.net_bb,confidence:samples.length<100?'insufficient':'sampled',stats:{hands:samples.length,vpip:{taken:vpip,opportunities:samples.length,percent:samples.length?vpip/samples.length*100:null},pfr:{taken:pfr,opportunities:samples.length,percent:samples.length?pfr/samples.length*100:null}}}});}
   return respond({error:'not_found'},404);
  }
  if(request.method!=='POST'||!['join','heartbeat','accept','action','break','resume','leave'].includes(path))return respond({error:'not_found'},404);
  const body=await bounded(request);now=Date.now();
  const [stillAuthenticated]=await q<{id:string}>(db,'SELECT user_id id FROM account_sessions WHERE token_hash=? AND expires_at>?',await digest(cookie!),Math.floor(now/1000));
  if(stillAuthenticated?.id!==user.id)return respond({error:'sign_in_required'},401);
  await sweepHumanRank(env,now);
  if(!uuid(body.actionId)||!Number.isSafeInteger(body.version)||Number(body.version)<0)return respond({error:'invalid_submission'},400);
  const allowed=path==='action'?['tableId','version','actionId','action']:path==='join'?['consent','version','actionId']:path==='accept'?['reservationId','version','actionId']:['version','actionId'];if(Object.keys(body).some(k=>!allowed.includes(k)))return respond({error:'invalid_submission'},400);
  await q(db,'DELETE FROM account_rate_limits WHERE bucket IN (SELECT bucket FROM account_rate_limits WHERE expires_at<? LIMIT 128)',Math.floor(now/1000));
  const [limit]=await q<{n:number}>(db,'INSERT INTO account_rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count n',`human:${user.id}:${Math.floor(now/60000)}`,Math.floor(now/1000)+120);if(limit.n>120)return respond({error:'rate_limited'},429);
  const key=JSON.stringify({operation:path,version:body.version,tableId:body.tableId,reservationId:body.reservationId,action:body.action,consent:body.consent});
  const [receipt]=await q<{request_json:string}>(db,'SELECT request_json FROM human_rank_receipts WHERE user_id=? AND action_id=?',user.id,body.actionId);if(receipt){if(receipt.request_json!==key)return respond({error:'action_id_conflict'},409);return respond({enabled:true,state:await state()});}
  if(path==='join'&&body.consent!==true)return respond({error:'public_human_consent_required'},400);
  let p=await player();if(!p&&path==='join'){await q(db,'INSERT OR IGNORE INTO human_rank_players(user_id,public_id,public_name) VALUES (?,?,?)',user.id,crypto.randomUUID(),`Player ${crypto.randomUUID().slice(0,8)}`);p=await player();}if(!p)return respond({error:'session_not_found'},404);
  if(path==='action'){
   if(!uuid(body.tableId)||typeof body.action!=='string')return respond({error:'invalid_action'},400);
   const t=await table(body.tableId);if(!t)return respond({error:'table_not_found'},404);const hidden:Private=JSON.parse(t.private_json),seat=hidden.users.indexOf(user.id);
   if(seat<0)return respond({error:'table_not_found'},404);
   if(p.phase!=='hand'||p.table_id!==t.id||t.status!=='active')return respond({error:'not_in_hand'},409);
   if(t.version!==body.version)return respond({error:'stale_version'},409);
   if(t.expires_at<=now)return respond({error:'turn_expired'},409);
   try{hidden.hand=applyAction(hidden.hand!,seat,body.action);}catch{return respond({error:'illegal_action'},400)}
   if(!await commitTable(db,t,hidden,now,{user:user.id,id:body.actionId,request:key}))return respond({error:'stale_version'},409);

  }else{
   if(p.version!==body.version)return respond({error:'stale_version'},409);
   if(path==='join'&&!['out','queued'].includes(p.phase))return respond({error:'already_joined'},409);
   if(path==='heartbeat'&&!['queued','reserved','hand'].includes(p.phase))return respond({error:'not_waiting'},409);
   if(path==='accept'&&(p.phase!=='reserved'||p.table_id!==body.reservationId))return respond({error:'reservation_not_found'},409);
   if(path==='accept'){const t=await table(p.table_id!);if(!t||t.status!=='reserved'||t.expires_at<=now)return respond({error:'reservation_expired'},409);}
   if(path==='resume'&&(p.phase!=='break'||!p.break_until||p.break_until<=now))return respond({error:'break_expired'},409);
   if(['break','leave'].includes(path)&&p.table_id){
    const t=await table(p.table_id),departure={user:user.id,version:p.version,phase:path==='break'?'break' as const:'out' as const,deadline:path==='break'?(p.break_until??now+BREAK):null},receipt={user:user.id,id:body.actionId,request:key};
    if(t?.status==='reserved'){
     const changed=await q<{id:string}>(db,"UPDATE human_rank_tables SET status='cancelled',version=version+1,departure_json=?,receipt_json=? WHERE id=? AND version=? AND status='reserved' AND EXISTS(SELECT 1 FROM human_rank_players WHERE user_id=? AND version=?) RETURNING id",JSON.stringify(departure),JSON.stringify(receipt),t.id,t.version,user.id,p.version);
     if(!changed.length)return respond({error:'stale_version'},409);
    }else if(t?.status==='active'){
     const hidden:Private=JSON.parse(t.private_json),seat=hidden.users.indexOf(user.id);if(seat<0)return respond({error:'table_not_found'},404);
     hidden.hand=forfeit(hidden.hand!,seat);if(!await commitTable(db,t,hidden,now,receipt,departure))return respond({error:'stale_version'},409);
    }else return respond({error:'stale_version'},409);
    await progressPool(db,now);return respond({enabled:true,state:await state()});
   }
   const phase=path==='leave'?'out':path==='break'?'break':['join','resume'].includes(path)?'queued':p.phase;
   const deadline=path==='break'?(p.break_until??now+BREAK):path==='resume'||path==='leave'?null:p.break_until;
   const changed=await q<{user_id:string}>(db,'UPDATE human_rank_players SET phase=?,version=version+1,lease_until=?,break_until=?,table_id=?,seat=?,accepted=?,receipt_json=? WHERE user_id=? AND version=? RETURNING user_id',phase,now+LEASE,deadline,['break','leave','join','resume'].includes(path)?null:p.table_id,['break','leave','join','resume'].includes(path)?null:p.seat,path==='accept'?1:p.accepted,JSON.stringify({id:body.actionId,request:key}),user.id,p.version);if(!changed.length)return respond({error:'stale_version'},409);
  }
  await progressPool(db,now);return respond({enabled:true,state:await state()});
 }catch(error){const name=error instanceof Error?error.message:'';return respond({enabled:false,error:['invalid_json','body_too_large'].includes(name)?name:'human_rank_service_unavailable'},['invalid_json','body_too_large'].includes(name)?400:503);}
}
