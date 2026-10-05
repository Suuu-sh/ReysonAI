import { DurableObject } from 'cloudflare:workers';
import { routeHumanRank, sweepHumanRank, nextHumanDeadline } from './human-rank.ts';
import { routeFastFold } from './fastfold.ts';
import type { FastFoldRuntimeEnv } from './fastfold-dispatch.ts';
// SQLite-backed namespace is available on Workers Free. Game/account state remains
// D1-authoritative; no state migration or per-object cache can override owner/CAS checks.
export class FastFoldRuntime extends DurableObject<FastFoldRuntimeEnv>{
 async handle(request:Request):Promise<Response>{
  if(!new URL(request.url).pathname.startsWith('/v1/fastfold/'))return new Response(null,{status:404});
  // Binding RPC only, never an external HTTP route. This verifies the real HttpOnly
  // account session, expiry, origin, legal action, version and idempotency every call.
  if(new URL(request.url).pathname.startsWith('/v1/fastfold/human/')){
   const response=await routeHumanRank(request,this.env);
   if(response.status<500)await this.scheduleHumanAlarm();
   return response;
  }
  return routeFastFold(request,this.env);
 }
 private async scheduleHumanAlarm(){
  const due=await nextHumanDeadline(this.env);if(due===null)return;
  // Never overwrite an earlier timer, or erase another request's newly armed timer.
  // SQLite storage operations within transaction() include the alarm atomically.
  await this.ctx.storage.transaction(async()=>{const current=await this.ctx.storage.getAlarm();const next=Math.max(Date.now()+100,due);if(current===null||next<current)await this.ctx.storage.setAlarm(next);});
 }
 async alarm(){await sweepHumanRank(this.env);await this.scheduleHumanAlarm();}
}
