import { DurableObject } from 'cloudflare:workers';
import { routeFastFold } from './fastfold.ts';
import type { FastFoldRuntimeEnv } from './fastfold-dispatch.ts';
// SQLite-backed namespace is available on Workers Free. Game/account state remains
// D1-authoritative; no state migration or per-object cache can override owner/CAS checks.
export class FastFoldRuntime extends DurableObject<FastFoldRuntimeEnv>{
 async handle(request:Request):Promise<Response>{
  if(!new URL(request.url).pathname.startsWith('/v1/fastfold/'))return new Response(null,{status:404});
  // Binding RPC only, never an external HTTP route. This verifies the real HttpOnly
  // account session, expiry, origin, legal action, version and idempotency every call.
  return routeFastFold(request,this.env);
 }
}
