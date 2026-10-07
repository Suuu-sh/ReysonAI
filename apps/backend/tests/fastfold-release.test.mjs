import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { FASTFOLD_DATASETS } from '../src/fastfold.ts';
const workflow=readFileSync(new URL('../../../.github/workflows/deploy-worker.yml',import.meta.url),'utf8');
test('exact additive FastFold schema precedes API and readiness follows reviewed-data import',()=>{
 assert.match(workflow, /'apps\/backend\/migrations\/0010_fastfold.sql'/);
 const deploy=workflow.slice(workflow.indexOf('  deploy:'));
 assert.match(deploy,/--file migrations\/0010_fastfold.sql --yes/);
 assert.ok(deploy.indexOf('--file migrations/0010_fastfold.sql')<deploy.indexOf('ranked-api-deployment.log'));
 assert.ok(deploy.indexOf('- name: Deploy Worker')<deploy.indexOf('import-reviewed-preflop.mjs --remote'));
 assert.ok(deploy.indexOf('import-reviewed-preflop.mjs --remote')<deploy.indexOf('verify-fastfold-readiness.mjs --configured'));
 assert.doesNotMatch(deploy.split('\n').filter(line=>!line.trimStart().startsWith('#')).join('\n'),/migrations apply|d1 (?:restore|delete)/);
 const fastfold=readFileSync(new URL('../../../.github/workflows/verify-fastfold.yml',import.meta.url),'utf8');assert.match(fastfold,/tests\/fastfold-app-integration.test.mjs/);assert.match(fastfold,/wrangler@4\.147\.0 --call.*verify-fastfold-local-runtime.mjs --wrangler/);
 for(const filename of ['wrangler.jsonc','wrangler.local.jsonc']){const config=readFileSync(new URL('../'+filename,import.meta.url),'utf8');assert.match(config,/"main": "src\/worker.ts"/);assert.match(config,/"name": "FASTFOLD_RUNTIME"/);assert.match(config,/"new_sqlite_classes": \["FastFoldRuntime"\]/);assert.doesNotMatch(config,/"new_classes"/)}
});
test('read-only release probe proves exact38 public sources and rejects corruption',async()=>{
 const rawBodies=Object.fromEntries(FASTFOLD_DATASETS.map(name=>[name,readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url),'utf8')]));
 const bodies=Object.fromEntries(Object.entries(rawBodies).map(([name,body])=>[name,JSON.stringify(JSON.parse(body))]));
 const catalog=Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,{hash:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)}]));
 const rawCatalog=Object.fromEntries(Object.entries(rawBodies).map(([name,body])=>[name,{hash:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)}]));
 let corrupt=false,rawPretty=false,writes=0;
 const server=createServer((req,res)=>{
  if(!['GET','OPTIONS'].includes(req.method))writes++;
  res.setHeader('access-control-allow-origin','https://app.reysonai.com');res.setHeader('access-control-allow-credentials','true');
  res.setHeader('content-type','application/json');
  if(req.method==='OPTIONS'){res.setHeader('access-control-allow-methods','POST');res.setHeader('access-control-allow-headers','content-type');res.writeHead(204);res.end();return}
  const path=req.url;
  if(path==='/v1/fastfold/status')res.end(JSON.stringify({enabled:true}));
  else if(path==='/v1/fastfold/profile'){res.writeHead(401);res.end(JSON.stringify({error:'sign_in_required'}))}
  else if(path==='/v1/preflop/datasets')res.end(JSON.stringify({datasets:rawPretty?rawCatalog:catalog}));
  else if(path.startsWith('/v1/preflop/datasets/')){const name=decodeURIComponent(path.slice('/v1/preflop/datasets/'.length));res.end(corrupt&&name==='opening-ranges'?'{}':rawPretty?rawBodies[name]:bodies[name]);}
  else {res.writeHead(404);res.end('{}')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const api='http://127.0.0.1:'+server.address().port;
 const probe=()=>new Promise(resolve=>{const child=spawn(process.execPath,['--experimental-strip-types',new URL('../scripts/verify-fastfold-readiness.mjs',import.meta.url).pathname,'--api='+api],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('close',code=>resolve({code,output}));});
 try{const healthy=await probe();assert.equal(healthy.code,0,healthy.output);assert.match(healthy.output,/38 exact published source hashes/);corrupt=true;const broken=await probe();assert.notEqual(broken.code,0);assert.match(broken.output,/Published content\/hash differs/);corrupt=false;rawPretty=true;const pretty=await probe();assert.notEqual(pretty.code,0);assert.match(pretty.output,/Published source differs from exact reviewed checkout: opening-ranges/);assert.equal(writes,0)}finally{await new Promise(resolve=>server.close(resolve))}
});
