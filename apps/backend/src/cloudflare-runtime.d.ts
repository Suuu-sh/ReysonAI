// Narrow ambient declaration for the documented runtime-supplied base class.
// No implementation, policy data, unsafe casts, or Node runtime substitute.
declare module 'cloudflare:workers' {
 export abstract class DurableObject<Env=unknown> {
  protected readonly env:Env;
  protected readonly ctx:{storage:{setAlarm(time:number):Promise<void>;deleteAlarm():Promise<void>;getAlarm():Promise<number|null>;transaction<T>(closure:()=>Promise<T>):Promise<T>}};
  constructor(ctx:unknown,env:Env);
 }
}
