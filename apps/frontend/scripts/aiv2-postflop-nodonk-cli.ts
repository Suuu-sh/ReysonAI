// Explicit owner worker. Importing this module starts no process or model call.
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAiv2SessionProvider } from './lib/aiv2-provider-session.ts';
import { postflopHash as hash, postflopPrompt, postflopResponseSchema, validatePostflopResponse, buildPostflopArtifact, effectivePostflopPrompt } from './aiv2-postflop-nodonk.ts';
import { CONFIG, DEFAULT_STORE, DEFAULT_SOURCE, implementationHash, listJobs, updateJob, resolveFrontier, saveDecision, loadRoot, callProvenance } from './aiv2-postflop-nodonk-store.ts';
export async function generateOne(input:any,implementation:string,provider:any,beforeCall:()=>void,onCall:(call:ReturnType<typeof callProvenance>)=>void=()=>{}){
 const id=(await import('./aiv2-postflop-nodonk.ts')).decisionIdentity(input,implementation),prompt=postflopPrompt(input,id),schema=postflopResponseSchema(input,id);
 return provider.withSession(async(session:any)=>{
  let issue='';
  for(let attempt=0;attempt<2;attempt++){
   beforeCall();let raw;const validationIssue=attempt?issue:null;onCall(callProvenance(input,id,attempt+1,validationIssue));
   try{raw=await session.run(effectivePostflopPrompt(input,id,validationIssue),{model:CONFIG.model,effort:CONFIG.effort,outputSchema:schema});}
   catch(error){if((error as any).code!=='invalid_json')throw error;issue='Invalid JSON';continue;}
   try{validatePostflopResponse(raw,input,id);return buildPostflopArtifact(input,raw,implementation);}catch(error){issue=(error as Error).message;}
  }
  throw Error('bounded_validation_failed');
 });
}
