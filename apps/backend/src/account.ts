// Google-only authorization-code login. Provider identity is keyed by sub, not email.
type Statement = { bind(...values: unknown[]): Statement; all<T>(): Promise<{results: T[]}>; run(): Promise<unknown> };
type DB = {prepare(sql: string): Statement};
export type AccountEnv = {DB?: unknown; AUTH_ENABLED?: string; AUTH_LOCAL_DEV?: string; ALLOWED_ORIGIN?: string; AUTH_APP_URL?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string; AUTH_RATE_LIMIT_KEY?: string};
type User = {id:string;email:string;google_sub:string};
type Claims = {iss:string;aud:string;azp?:string;exp:number;iat:number;sub:string;email:string;email_verified:boolean;nonce:string};
const encoder=new TextEncoder();
const COOKIE='__Host-reysonai';
const STATE_COOKIE='__Host-reysonai-oauth';
const reply=(body:unknown,status=200,cookies:string[]=[])=>{const headers=new Headers({'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'});for(const value of cookies) headers.append('set-cookie',value);return new Response(JSON.stringify(body),{status,headers});};
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
export const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export function accountTransport(requestURL:URL,app:URL,redirect:URL,origins:string[],localFlag:string|undefined) {
  const loopback=(url:URL)=>url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname) && url.hostname===requestURL.hostname && !url.username && !url.password;
  const local=localFlag==='true';
  if(local && (!loopback(requestURL) || !loopback(app) || !loopback(redirect) || !origins.length || !origins.every(origin=>loopback(new URL(origin))))) return null;
  if(!local && (requestURL.protocol!=='https:' || app.protocol!=='https:' || redirect.protocol!=='https:')) return null;
  if(!origins.includes(app.origin) || redirect.origin!==requestURL.origin || redirect.pathname!=='/v1/account/google/callback' || redirect.search || redirect.hash) return null;
  return {session:local?'reysonai-dev-session':COOKIE,state:local?'reysonai-dev-oauth':STATE_COOKIE, cookie:(name:string,token:string,age=604800)=>`${name}=${token}; Path=/; HttpOnly; ${local?'':'Secure; '}SameSite=Lax; Max-Age=${age}`};
}
const readCookie=(request:Request,name:string)=>request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1);
const b64url=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const publicUser=(u:User)=>({id:u.id,email:u.email,verified:true});
let keyCache:{until:number;keys:Array<JsonWebKey & {kid?:string}>}|undefined;
export async function verifyGoogleToken(token:string,clientId:string,nonceHash:string,now:number):Promise<Claims> {
  const parts=token.split('.');
  if(parts.length!==3 || token.length>16000) throw new Error('invalid_google_token');
  const header=JSON.parse(new TextDecoder().decode(unbase64(parts[0])));
  if(header.alg!=='RS256' || typeof header.kid!=='string') throw new Error('invalid_google_algorithm');
  // Cache only Google's fixed JWKS endpoint, never a URL supplied by the token.
  if(!keyCache || keyCache.until<=now || !keyCache.keys.some(k=>k.kid===header.kid)) {
    const response=await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if(!response.ok) throw new Error('google_keys_unavailable');
    const body=await response.json() as {keys:Array<JsonWebKey & {kid?:string}>};
    if(!Array.isArray(body.keys)) throw new Error('invalid_google_keys');
    keyCache={until:now+900,keys:body.keys};
  }
  const jwk=keyCache.keys.find(k=>k.kid===header.kid && k.kty==='RSA' && k.alg==='RS256' && k.use==='sig');
  if(!jwk) throw new Error('unknown_google_key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unbase64(parts[2]),encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error('invalid_google_signature');
  const claims=JSON.parse(new TextDecoder().decode(unbase64(parts[1]))) as Claims;
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss) || claims.aud!==clientId || claims.azp && claims.azp!==clientId || !Number.isFinite(claims.exp) || claims.exp<=now || !Number.isFinite(claims.iat) || claims.iat>now+60 || claims.iat<now-600 || typeof claims.sub!=='string' || !claims.sub || claims.sub.length>255 || typeof claims.email!=='string' || claims.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) || claims.email_verified!==true || typeof claims.nonce!=='string' || await digest(claims.nonce)!==nonceHash) throw new Error('invalid_google_claims');
  return claims;
}
export function allowedData(data:unknown):data is Record<string,unknown> {
  const keys=['reysonai:profile:v1','reysonai:appearance:v1','reysonai:display-mode:v1','reysonai:locale:v1','reysonai.trainer.history.v1','reysonai.trainer.drills.v1','reysonai.trainer.drafts.v1','reysonai.trainer.review-sessions.v1'];
  return !!data && typeof data==='object' && !Array.isArray(data) && Object.keys(data).every(k=>keys.includes(k));
}
export async function routeAccount(request:Request,env:AccountEnv):Promise<Response> {
  if(env.AUTH_ENABLED!=='true') return reply({error:'accounts_not_enabled'},503);
  if(!env.DB || !env.AUTH_APP_URL || !env.AUTH_RATE_LIMIT_KEY || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) return reply({error:'accounts_not_configured'},503);
  const url=new URL(request.url);
  const app=new URL('/analyze/ranges',env.AUTH_APP_URL);
  const redirectURI=new URL(env.GOOGLE_REDIRECT_URI);
  const origins=(env.ALLOWED_ORIGIN||'').split(',').map(s=>s.trim()).filter(s=>s && s!=='*');
  const transport=accountTransport(url,app,redirectURI,origins,env.AUTH_LOCAL_DEV);
  if(!transport) return reply({error:'accounts_not_configured'},503);
  const {cookie,session:sessionCookie,state:stateCookie}=transport;
  const path=url.pathname.replace('/v1/account/','');
  if(request.method==='POST' && (!origins.includes(request.headers.get('origin')||'') || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))) return reply({error:'invalid_origin_or_content_type'},403);
  if(!(request.method==='GET' && ['session','data','google/callback'].includes(path) || request.method==='POST' && ['google/start','logout','data'].includes(path))) return reply({error:'not_found'},404);
  const db=env.DB as DB;
  const query=async<T>(sql:string,...args:unknown[])=>(await db.prepare(sql).bind(...args).all<T>()).results;
  const now=Math.floor(Date.now()/1000);
  if(request.method==='POST' || path==='google/callback') {
    const ip=request.headers.get('cf-connecting-ip')||'local';
    const key=await crypto.subtle.importKey('raw',encoder.encode(env.AUTH_RATE_LIMIT_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const bucket=`${path}:${Math.floor(now/900)}:${hex(await crypto.subtle.sign('HMAC',key,encoder.encode(ip)))}`;
    const rows=await query<{count:number}>('INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',bucket,now+900);
    if(rows[0].count>(path==='data'?120:30)) return reply({error:'rate_limited'},429);
    await db.prepare('DELETE FROM account_rate_limits WHERE expires_at < ?').bind(now).run();
    await db.prepare('DELETE FROM account_oauth_states WHERE expires_at < ?').bind(now).run();
    await db.prepare('DELETE FROM account_sessions WHERE expires_at < ?').bind(now).run();
  }
  const oauthRedirect=(success:boolean,cookies:string[]=[])=>{app.hash=success?'account-signed-in':'account-error=google';const response=reply(null,303,cookies);response.headers.set('location',app.toString());return response;};
  if(path==='google/callback') {
    const state=url.searchParams.get('state');const browserState=readCookie(request,stateCookie);
    const clear=[cookie(stateCookie,'',0)];
    if(!state || !/^[a-f0-9]{64}$/.test(state) || state!==browserState) return oauthRedirect(false,clear);
    // DELETE RETURNING consumes state exactly once across all isolates before code exchange.
    const states=await query<{verifier:string;nonce_hash:string}>('DELETE FROM account_oauth_states WHERE state_hash=? AND expires_at>? RETURNING verifier,nonce_hash',await digest(state),now);
    if(!states[0] || url.searchParams.has('error')) return oauthRedirect(false,clear);
    const code=url.searchParams.get('code');
    if(!code || code.length>4096) return oauthRedirect(false,clear);
    let claims:Claims;
    try {
      const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.GOOGLE_REDIRECT_URI,grant_type:'authorization_code',code,code_verifier:states[0].verifier})});
      if(!response.ok) return oauthRedirect(false,clear);
      const tokens=await response.json() as {id_token?:string};
      if(typeof tokens.id_token!=='string') return oauthRedirect(false,clear);
      claims=await verifyGoogleToken(tokens.id_token,env.GOOGLE_CLIENT_ID,states[0].nonce_hash,now);
    } catch {return oauthRedirect(false,clear);}
    // Never merge different Google subjects merely because email matches or changes.
    await db.prepare('INSERT INTO account_users(id,google_sub,email,created_at) VALUES (?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email').bind(crypto.randomUUID(),claims.sub,claims.email,now).run();
    const user=(await query<User>('SELECT * FROM account_users WHERE google_sub=?',claims.sub))[0];
    const old=readCookie(request,sessionCookie);if(old && /^[a-f0-9]{64}$/.test(old)) await db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await digest(old)).run();
    const token=random();await db.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),user.id,now+604800).run();
    return oauthRedirect(true,[...clear,cookie(sessionCookie,token)]);
  }
  let body:Record<string,unknown>={};
  if(request.method==='POST') {
    const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
    if(reader) while(true) {const part=await reader.read();if(part.done) break;size+=part.value.byteLength;if(size>500000) {await reader.cancel();return reply({error:'payload_too_large'},413);}chunks.push(part.value);}
    const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks) {buffer.set(chunk,offset);offset+=chunk.byteLength;}
    try {body=JSON.parse(new TextDecoder().decode(buffer));} catch {return reply({error:'invalid_json'},400);}
    if(!body || typeof body!=='object' || Array.isArray(body)) return reply({error:'invalid_json'},400);
  }
  if(path==='google/start') {
    const state=random(),verifier=random(),nonce=random();
    await db.prepare('INSERT INTO account_oauth_states(state_hash,verifier,nonce_hash,expires_at) VALUES (?,?,?,?)').bind(await digest(state),verifier,await digest(nonce),now+600).run();
    const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.GOOGLE_REDIRECT_URI,response_type:'code',scope:'openid email',state,nonce,code_challenge:b64url(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))),code_challenge_method:'S256',prompt:'select_account'}).toString();
    // No hd/domain restriction: Google Workspace and custom-email Google accounts are welcome.
    return reply({url:auth.toString()},200,[cookie(stateCookie,state,600)]);
  }
  const rawToken=readCookie(request,sessionCookie);
  const user=rawToken && /^[a-f0-9]{64}$/.test(rawToken)?(await query<User>('SELECT u.* FROM account_users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',await digest(rawToken),now))[0]:undefined;
  if(path==='session') return reply({user:user?publicUser(user):null});
  if(path==='logout') {if(rawToken) await db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await digest(rawToken)).run();return reply({ok:true},200,[cookie(sessionCookie,'',0),cookie(stateCookie,'',0)]);}
  if(!user) return reply({error:'sign_in_required'},401);
  if(request.method==='GET') {const row=(await query<{data_json:string;version:number}>('SELECT data_json,version FROM account_data WHERE user_id=?',user.id))[0];return reply({data:row?JSON.parse(row.data_json):{},version:row?.version||0});}
  if(!allowedData(body.data) || !Number.isSafeInteger(body.version) || Number(body.version)<0) return reply({error:'invalid_data_or_ranked_data'},400);
  if(body.importLocal && body.consent!==true) return reply({error:'explicit_import_consent_required'},400);
  await db.prepare('INSERT OR IGNORE INTO account_data(user_id) VALUES (?)').bind(user.id).run();
  const rows=await query<{version:number}>('UPDATE account_data SET data_json=?,version=version+1 WHERE user_id=? AND version=? RETURNING version',JSON.stringify(body.data),user.id,body.version);
  return rows.length?reply({ok:true,version:rows[0].version}):reply({error:'data_conflict'},409);
}
