import { accountTransport, digest, type AccountEnv } from './account.ts';
import { readPublishedDataset } from './application/published-datasets.ts';
import { finalizeRankedMatch, type RankedMatchRecord, type RankedPlayerRecord } from './application/ranked-finalization.ts';
import { D1PublishedDatasetReader } from './infrastructure/d1-published-dataset-repository.ts';
import { D1RankedFinalizationRepository } from './infrastructure/d1-ranked-finalization-repository.ts';
import { questionPool } from './domain/ranked-quiz.ts';
import type { D1Database } from './postflop.ts';
import { RANKED_LENGTH, RANKED_DAILY_LIMIT, START_RATING, LEADERBOARD_MIN_MATCHES, displayTier } from '../../shared/ranked-rules.ts';

type RankedEnv = AccountEnv & { RANKED_ENABLED?: string };
type Match = RankedMatchRecord;
type Player = RankedPlayerRecord;
const reply = (body:unknown,status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const publicMatch=(m:Match)=>({id:m.id,at:m.completed_at,before:m.before_rating,after:m.after_rating,accuracy:m.score/RANKED_LENGTH,answered:RANKED_LENGTH});

export async function routeRanked(request:Request,env:RankedEnv):Promise<Response> {
  if(env.RANKED_ENABLED!=='true'||env.AUTH_ENABLED!=='true'||!env.DB||!env.AUTH_APP_URL||!env.GOOGLE_REDIRECT_URI||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.AUTH_RATE_LIMIT_KEY) return reply({error:'ranked_not_enabled'},503);
  const url=new URL(request.url),origins=(env.ALLOWED_ORIGIN||'').split(',').map(v=>v.trim()).filter(v=>v&&v!=='*');
  const transport=accountTransport(url,new URL(env.AUTH_APP_URL),new URL(env.GOOGLE_REDIRECT_URI),origins,env.AUTH_LOCAL_DEV);
  if(!transport) return reply({error:'ranked_not_configured'},503);
  if(request.method==='POST'&&(!origins.includes(request.headers.get('origin')||'')||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))) return reply({error:'invalid_origin_or_content_type'},403);
  const db=env.DB as D1Database,now=Date.now(),day=new Date(now).toISOString().slice(0,10);
  const query=async<T>(sql:string,...args:unknown[])=>(await db.prepare(sql).bind(...args).all<T>()).results;
  const publishedDatasets=new D1PublishedDatasetReader(db);
  if(['/v1/ranked/status','/v1/ranked/profile'].includes(url.pathname)&&request.method==='GET') {
    try {
      await query('SELECT id FROM account_users LIMIT 1');
      await query('SELECT token_hash,user_id,expires_at FROM account_sessions LIMIT 1');
      await query('SELECT bucket FROM account_rate_limits LIMIT 1');
      await query('SELECT id,user_id,day,slot,status,expires_at,questions_json,actions_json,completed_at,before_rating,after_rating,score FROM ranked_matches LIMIT 1');
      await query('SELECT user_id,public_name,rating,peak,matches FROM ranked_players LIMIT 1');
      const inputs=await Promise.all(['opening-ranges','preflop-ranges'].map(name=>readPublishedDataset(publishedDatasets,name)));
      if(inputs.some(input=>input.kind!=='published'||!input.text)) return reply({enabled:false,error:'ranked_dataset_unavailable'},503);
      inputs.forEach((input,index)=>{if(input.kind==='published')questionPool(JSON.parse(input.text),index?'response':'open');});
      if(url.pathname==='/v1/ranked/status') return reply({enabled:true,dayBoundary:'UTC'});
    }catch{return reply({enabled:false,error:'ranked_service_unavailable'},503);}
  }
  const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${transport.session}=`))?.slice(transport.session.length+1);
  const users=cookie&&/^[a-f0-9]{64}$/.test(cookie)?await query<{id:string}>('SELECT u.id FROM account_users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',await digest(cookie),Math.floor(now/1000)):[];
  if(!users.length) return reply({error:'sign_in_required'},401);
  const user=users[0].id,path=url.pathname.slice('/v1/ranked/'.length);
  // Per-account bound on requests; does not rely on client-provided IP/rating.
  if(request.method==='POST') {
    const limits=await query<{count:number}>('INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',`ranked:${user}:${Math.floor(now/60000)}`,Math.floor(now/1000)+120);
    await query('DELETE FROM account_rate_limits WHERE expires_at<?',Math.floor(now/1000));
    if(limits[0].count>30) return reply({error:'rate_limited'},429);
  }
  const history=()=>query<Match>("SELECT * FROM ranked_matches WHERE user_id=? AND status='complete' ORDER BY completed_at DESC LIMIT 100",user);
  const state=async()=>{
    const [player]=await query<Player>('SELECT * FROM ranked_players WHERE user_id=?',user);
    const [quota]=await query<{used:number}>('SELECT COUNT(*) used FROM ranked_matches WHERE user_id=? AND day=?',user,day);
    const [active]=await query<Match>("SELECT * FROM ranked_matches WHERE user_id=? AND status='active' AND expires_at>?",user,now);
    return {rating:player?.rating??START_RATING,peak:player?.peak??START_RATING,matches:(await history()).reverse().map(publicMatch),totalMatches:player?.matches??0,remaining:Math.max(0,RANKED_DAILY_LIMIT-quota.used),active:active?{id:active.id,questions:JSON.parse(active.questions_json),expiresAt:active.expires_at}:null};
  };
  try {
    if(path==='profile'&&request.method==='GET') return reply({enabled:true,state:await state(),dayBoundary:'UTC',publicName:(await query<Player>('SELECT * FROM ranked_players WHERE user_id=?',user))[0]?.public_name??null});
    if(path==='leaderboard'&&request.method==='GET') {
      const period=url.searchParams.get('period')??'all';if(!['all','week'].includes(period)) return reply({error:'invalid_period'},400);
      const cutoff=period==='week'?now-7*86400000:0;
      // ROW_NUMBER is applied over the entire qualified population before LIMIT. No client reranking.
      const sql=`WITH stats AS (SELECT user_id,COUNT(*) matches,SUM(score)/(?*COUNT(*)) accuracy,SUM(after_rating-before_rating) gain FROM ranked_matches WHERE status='complete' AND completed_at>=? GROUP BY user_id), placed AS (SELECT p.user_id,p.public_name name,p.rating,s.matches,s.accuracy,s.gain,ROW_NUMBER() OVER(ORDER BY p.rating DESC,s.accuracy DESC,p.user_id ASC) place FROM ranked_players p JOIN stats s ON s.user_id=p.user_id WHERE s.matches>=?) SELECT * FROM placed WHERE place<=100 OR user_id=? ORDER BY place`;
      const rows=await query<{user_id:string;name:string;rating:number;matches:number;accuracy:number;gain:number;place:number}>(sql,RANKED_LENGTH,cutoff,LEADERBOARD_MIN_MATCHES,user);
      const mine=rows.find(v=>v.user_id===user);
      const unplaced=mine?[]:await query<{user_id:string;name:string;rating:number;matches:number;accuracy:number;gain:number;place:null}>(`SELECT p.user_id,p.public_name name,p.rating,COUNT(m.id) matches,COALESCE(SUM(m.score)/(?*COUNT(m.id)),0) accuracy,COALESCE(SUM(m.after_rating-m.before_rating),0) gain,NULL place FROM ranked_players p LEFT JOIN ranked_matches m ON m.user_id=p.user_id AND m.status='complete' AND m.completed_at>=? WHERE p.user_id=? GROUP BY p.user_id`,RANKED_LENGTH,cutoff,user);
      return reply({period,rows:[...rows,...unplaced].map(({user_id,...row})=>({...row,id:row.name,self:user_id===user,tier:displayTier(row.rating,row.place)}))});
    }
    if(path==='matches'&&request.method==='POST') {
      const body=await boundedBody(request);if(body?.consent!==true||Object.keys(body).some(k=>k!=='consent')) return reply({error:'public_ranked_consent_required'},400);
      // Read both immutable snapshots before reserving a daily start. Unpublished inputs fail closed.
      const sources=await Promise.all(['opening-ranges','preflop-ranges'].map(name=>readPublishedDataset(publishedDatasets,name)));
      if(sources.some(source=>source.kind!=='published'||!source.text)) return reply({error:'ranked_dataset_unavailable'},503);
      const pool=sources.flatMap((source,i)=>source.kind==='published'?questionPool(JSON.parse(source.text),i?'response':'open'):[]).flat();
      const questions=Array.from({length:RANKED_LENGTH},()=>{let pick=random()*pool.reduce((sum,q)=>sum+q.weight,0);const q=pool.find(v=>(pick-=v.weight)<0)??pool.at(-1)!;return {spotId:q.spotId,hand:q.hand,mix:q.mix};});
      await query('INSERT OR IGNORE INTO ranked_players(user_id,public_name) VALUES (?,?)',user,`Player ${crypto.randomUUID().slice(0,8)}`);
      await query("UPDATE ranked_matches SET status='expired' WHERE user_id=? AND status='active' AND expires_at<=?",user,now);
      const [existing]=await query<Match>("SELECT * FROM ranked_matches WHERE user_id=? AND status='active'",user);
      if(existing) return reply({match:{id:existing.id,questions:JSON.parse(existing.questions_json),expiresAt:existing.expires_at},state:await state()});
      const id=crypto.randomUUID();
      const inserted=await query<Match>(`INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *`,id,user,day,now,now+3600000,JSON.stringify(questions),user,day,RANKED_DAILY_LIMIT);
      const [match]=inserted.length?inserted:await query<Match>("SELECT * FROM ranked_matches WHERE user_id=? AND status='active'",user);
      if(!match) return reply({error:'daily_limit'},429);
      return reply({match:{id:match.id,questions:JSON.parse(match.questions_json),expiresAt:match.expires_at},state:await state()});
    }
    const finish=path.match(/^matches\/([a-f0-9-]{36})\/finish$/);
    if(finish&&request.method==='POST') {
      const body=await boundedBody(request);if(!body||Object.keys(body).some(k=>k!=='actions')) return reply({error:'invalid_submission'},400);
      const finalized=await finalizeRankedMatch(new D1RankedFinalizationRepository(db),user,finish[1],body.actions,now);
      if(finalized.kind==='not_found') return reply({error:'match_not_found'},404);
      if(finalized.kind==='conflict') return reply({error:'match_already_finalized'},409);
      if(finalized.kind==='expired') return reply({error:'match_expired'},409);
      return reply({match:publicMatch(finalized.match),state:await state()});
    }
    return reply({error:'not_found'},404);
  } catch(error) {
    if(error instanceof Error&&['complete_match_required','invalid_action','invalid_json','body_too_large'].includes(error.message)) return reply({error:error.message},400);
    return reply({error:'ranked_service_unavailable'},503);
  }
}
async function boundedBody(request:Request):Promise<Record<string,unknown>> {
  // Bounded reads even when Content-Length is absent or forged.
  const reader=request.body?.getReader();if(!reader) throw new Error('invalid_json');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error();return parsed;}catch{throw new Error('invalid_json');}
}
