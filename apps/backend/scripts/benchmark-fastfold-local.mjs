// Local-only measurements. WORKERD_MODULE points to an already-installed Miniflare runtime.
// Node synchronous measurements and local workerd walltime are NOT production Worker cpu_ms.
import { performance } from 'node:perf_hooks';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { build } from '../../frontend/node_modules/esbuild/lib/main.js';
import { benchmarkReplay, scenarios } from '../tests/fixtures/fastfold-benchmark.ts';
for(const scenario of Object.keys(scenarios)){
 const cpu=process.cpuUsage();const result=benchmarkReplay(scenario,()=>performance.now());
 const elapsed=process.cpuUsage(cpu);
 if(result.showdown)assert.ok(Math.abs(Object.values(result.returns).reduce((a,b)=>a+b,0)+result.rake)<.021);
 if(scenario==='foldFacing'){assert.equal(result.board.length,3);assert.equal(result.returns.BB,-2.5)}
 console.log(JSON.stringify({runtime:'node-local',scenario,status:result.status,boardCards:result.board.length,...result.timing,nodeCpuMs:(elapsed.user+elapsed.system)/1000}));
}
const modulePath=process.env.WORKERD_MODULE;if(!modulePath)throw Error('Supply WORKERD_MODULE path to existing Miniflare; no runtime will be installed');
const {Miniflare}=await import(modulePath);const temp=await mkdtemp(join(tmpdir(),'fastfold-workerd-'));
let mf;try{
 const output=join(temp,'fixture.mjs');await build({entryPoints:[new URL('../tests/fixtures/fastfold-benchmark.ts',import.meta.url).pathname],outfile:output,bundle:true,platform:'browser',format:'esm',logLevel:'silent'});
 mf=new Miniflare({workers:[{config:{name:'fastfold-local-benchmark',compatibilityDate:'2026-09-22',manifest:{mainModule:'fixture.mjs',modulesRoot:'/',modules:{'fixture.mjs':{type:'esm',contents:await readFile(output,'utf8')}}}}}]});await mf.ready;
 for(const scenario of Object.keys(scenarios)){
  const start=performance.now();const response=await mf.dispatchFetch('http://fixture.invalid/?scenario='+scenario);const result=await response.json();
  assert.equal(response.status,200);if(scenario==='callThrough'||scenario==='checkdown'){assert.equal(result.showdown,true);assert.equal(result.board.length,5)}
  console.log(JSON.stringify({runtime:'local-workerd',scenario,status:result.status,boardCards:result.board.length,wallMs:performance.now()-start,productionCpuMs:null}));
 }
}finally{if(mf)await mf.dispose();await rm(temp,{recursive:true,force:true})}
