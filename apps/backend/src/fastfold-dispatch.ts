import { digest, type AccountEnv } from './account.ts';
export type FastFoldRuntimeBinding = { getByName(name:string): {handle(request:Request):Promise<Response>} };
export type FastFoldRuntimeEnv = AccountEnv & {FASTFOLD_ENABLED?:string;FASTFOLD_RUNTIME?:FastFoldRuntimeBinding};
const reply=(error:string,status:number)=>Response.json({enabled:false,error},{status,headers:{'cache-control':'no-store'}});
// Edge Worker does no D1, parsing, replay or defence. Authentication is always rechecked
// inside the bound DO. Hashes select a finite shard; they never confer account identity.
export async function dispatchFastFold(request:Request,env:FastFoldRuntimeEnv):Promise<Response>{
 if(env.FASTFOLD_ENABLED!=='true'||env.AUTH_ENABLED!=='true'||!env.DB||!env.AUTH_APP_URL||!env.GOOGLE_REDIRECT_URI||!env.AUTH_RATE_LIMIT_KEY)return reply('fastfold_not_enabled',503);
 if(!env.FASTFOLD_RUNTIME)return reply('fastfold_runtime_unavailable',503);
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'&&request.method!=='POST')return reply('not_found',404);
 if(request.method==='POST'&&(!(env.ALLOWED_ORIGIN??'').split(',').map(s=>s.trim()).includes(request.headers.get('origin')??'')||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??'')))return reply('invalid_origin_or_content_type',403);
 // Reject declared oversized bodies cheaply; the DO still bounds the streamed body.
 const length=request.headers.get('content-length');if(request.method==='POST'&&length&&Number(length)>4096)return reply('body_too_large',400);
 let name='public-status';
 if(path!=='/v1/fastfold/status'||request.method!=='GET'){
  const cookieName=env.AUTH_LOCAL_DEV==='true'?'reysonai-dev-session':'__Host-reysonai';
  const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return reply('sign_in_required',401);
  name='session-shard-'+(parseInt((await digest(token)).slice(0,2),16)%32);
 }
 // Original request stream, cookie and Origin are forwarded; no internal user ID header.
 return env.FASTFOLD_RUNTIME.getByName(name).handle(request);
}
