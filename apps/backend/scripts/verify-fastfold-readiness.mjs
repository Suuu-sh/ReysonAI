// Read-only release probe. No account sessions, writes, policy generation, or secrets.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FASTFOLD_DATASETS } from '../src/fastfold.ts';
const args=process.argv.slice(2);
const api=args.find(x=>x.startsWith('--api='))?.slice(6)??'https://api.reysonai.com';
const origin=args.find(x=>x.startsWith('--origin='))?.slice(9)??'https://app.reysonai.com';
const configured=args.includes('--configured');
const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const enabled=configured?/"FASTFOLD_ENABLED"\s*:\s*"true"/.test(config):true;
const fetchJson=async(path,options={})=>{
 const response=await fetch(api+path,{...options,headers:{Accept:'application/json',Origin:origin,...options.headers},signal:AbortSignal.timeout(15000)});
 if(response.headers.get('access-control-allow-origin')!==origin||response.headers.get('access-control-allow-credentials')!=='true')throw Error(`Credential CORS failed: ${path}`);
 return {response,body:await response.json()};
};
const status=await fetchJson('/v1/fastfold/status');
if(!enabled){
 if(status.response.status!==503||status.body.error!=='fastfold_not_enabled')throw Error('Configured disabled gate differs from live API');
 console.log('FastFold remains disabled as reviewed. This is not playable release readiness.');
}else{
 if(!status.response.ok||status.body.enabled!==true)throw Error('FastFold schema/auth/manifests are not ready; do not deliver enabled client');
 const catalogResponse=await fetch(api+'/v1/preflop/datasets',{signal:AbortSignal.timeout(15000)});
 if(!catalogResponse.ok)throw Error('Missing published dataset catalog');
 const catalog=(await catalogResponse.json()).datasets;
 for(const name of FASTFOLD_DATASETS){
  // Match the exact reviewed publisher delivery bytes (publish-d1.mjs preflopDatasets), not pretty source whitespace.
  const expected=Buffer.from(JSON.stringify(JSON.parse(readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url),'utf8'))));
  const expectedHash=createHash('sha256').update(expected).digest('hex');
  if(catalog?.[name]?.hash!==expectedHash||catalog[name].bytes!==expected.length)throw Error(`Published source differs from exact reviewed checkout: ${name}`);
  const response=await fetch(api+'/v1/preflop/datasets/'+encodeURIComponent(name),{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Published parts incomplete: ${name}`);
  const text=await response.text();
  if(createHash('sha256').update(text).digest('hex')!==expectedHash||Buffer.byteLength(text)!==expected.length)throw Error(`Published content/hash differs: ${name}`);
  const value=JSON.parse(text);
  if(!Array.isArray(value.spots)||!value.spots.length||value.spots.some(s=>!s.id||s.hands?.length!==169||new Set(s.hands.map(r=>r.hand)).size!==169))throw Error(`Malformed published source: ${name}`);
 }
 const preflight=await fetch(api+'/v1/fastfold/action',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(15000)});
 if(preflight.status!==204||preflight.headers.get('access-control-allow-origin')!==origin||preflight.headers.get('access-control-allow-credentials')!=='true'||!preflight.headers.get('access-control-allow-methods')?.includes('POST')||!preflight.headers.get('access-control-allow-headers')?.includes('content-type'))throw Error('FastFold browser action preflight failed');
 const anonymous=await fetchJson('/v1/fastfold/profile');
 if(anonymous.response.status!==401||anonymous.body.error!=='sign_in_required')throw Error('FastFold authentication boundary failed');
 console.log('FastFold API/schema, 38 exact published source hashes, CORS and anonymous rejection verified. Real signed-in match and CPU metrics are separate launch checks.');
}
