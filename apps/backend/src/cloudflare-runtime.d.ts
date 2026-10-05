// Narrow ambient declaration for the documented runtime-supplied base class.
// No implementation, policy data, unsafe casts, or Node runtime substitute.
declare module 'cloudflare:workers' {
 export abstract class DurableObject<Env=unknown> {
  protected readonly env:Env;
  constructor(ctx:unknown,env:Env);
 }
}
