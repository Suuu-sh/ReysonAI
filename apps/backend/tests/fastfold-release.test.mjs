import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { FASTFOLD_DATASETS } from '../src/fastfold.ts';
import { matchesDecisionFields, matchesPriorReviewedSource, PRIOR_REVIEWED_FASTFOLD_SOURCE } from '../scripts/lib/fastfold-readiness-sources.mjs';
const workflow=readFileSync(new URL('../../../.github/workflows/deploy-worker.yml',import.meta.url),'utf8');
test('predeploy legacy allowance is pinned to the exact historical five-bet payload and reason-only differences',()=>{
 assert.equal(matchesPriorReviewedSource('five-bet-responses',PRIOR_REVIEWED_FASTFOLD_SOURCE),true);
 assert.equal(matchesPriorReviewedSource('five-bet-responses',{...PRIOR_REVIEWED_FASTFOLD_SOURCE,hash:'0'.repeat(64)}),false);
 assert.equal(matchesPriorReviewedSource('opening-ranges',PRIOR_REVIEWED_FASTFOLD_SOURCE),false);
 const current={spots:[{id:'BTN_vs_BB_five_bet',hands:[{hand:'AA',call:100,reason:'current'}]}]};
 const previous={spots:[{id:'BTN_vs_BB_five_bet',hands:[{hand:'AA',call:100,reason:'prior'}]}]};
 assert.equal(matchesDecisionFields(current,previous),true);
 assert.equal(matchesDecisionFields(current,{spots:[{id:'BTN_vs_BB_five_bet',hands:[{hand:'AA',call:99,reason:'prior'}]}]}),false);
});
test('predeploy API/integrity gate precedes client and exact source gate follows reviewed import',()=>{
 assert.match(workflow, /'apps\/backend\/migrations\/0010_fastfold.sql'/);
 const deploy=workflow.slice(workflow.indexOf('  deploy:'));
 assert.match(deploy,/--file migrations\/0010_fastfold.sql --yes/);
 assert.ok(deploy.indexOf('--file migrations/0010_fastfold.sql')<deploy.indexOf('ranked-api-deployment.log'));
 assert.ok(deploy.indexOf('--configured --predeploy-compatible')<deploy.indexOf('- name: Deploy Worker'));
 assert.ok(deploy.indexOf('- name: Deploy Worker')<deploy.indexOf('import-reviewed-preflop.mjs --remote'));
 const importStep=deploy.indexOf('import-reviewed-preflop.mjs --remote');
 const exactGate=deploy.indexOf('verify-fastfold-readiness.mjs --configured\n',importStep);
 assert.ok(importStep<exactGate);
 assert.doesNotMatch(deploy.split('\n').filter(line=>!line.trimStart().startsWith('#')).join('\n'),/migrations apply|d1 (?:restore|delete)/);
 const fastfold=readFileSync(new URL('../../../.github/workflows/verify-fastfold.yml',import.meta.url),'utf8');assert.match(fastfold,/tests\/fastfold-app-integration.test.mjs/);assert.match(fastfold,/wrangler@4\.147\.0 --call.*verify-fastfold-local-runtime.mjs --wrangler/);
 for(const filename of ['wrangler.jsonc','wrangler.local.jsonc']){const config=readFileSync(new URL('../'+filename,import.meta.url),'utf8');assert.match(config,/"main": "src\/worker.ts"/);assert.match(config,/"name": "FASTFOLD_RUNTIME"/);assert.match(config,/"new_sqlite_classes": \["FastFoldRuntime"\]/);assert.doesNotMatch(config,/"new_classes"/)}
});
test('read-only release probe proves exact38 public sources and rejects corruption',async()=>{
 const rawBodies=Object.fromEntries(FASTFOLD_DATASETS.map(name=>[name,readFileSync(new URL(`../../frontend/src/estimated/${name}.json`,import.meta.url),'utf8')]));
 const bodies=Object.fromEntries(Object.entries(rawBodies).map(([name,body])=>[name,JSON.stringify(JSON.parse(body))]));
 const catalog=Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,{hash:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)}]));
 let corrupt=false,rawPretty=false,copyDrift=false,decisionDrift=false,writes=0;
 const publishedBodies=()=>Object.fromEntries(Object.entries(rawPretty?rawBodies:bodies).map(([name,body])=>{
  if((!copyDrift&&!decisionDrift)||name!=='five-bet-responses')return [name,body];
  const dataset=JSON.parse(body);
  if(copyDrift)dataset.spots[0].hands[0].reason+=' ';
  if(decisionDrift)dataset.spots[0].hands[0].call-=1;
  return [name,JSON.stringify(dataset)];
 }));
 const publishedCatalog=()=>Object.fromEntries(Object.entries(publishedBodies()).map(([name,body])=>[name,{hash:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)}]));
 const server=createServer((req,res)=>{
  if(!['GET','OPTIONS'].includes(req.method))writes++;
  res.setHeader('access-control-allow-origin','https://app.reysonai.com');res.setHeader('access-control-allow-credentials','true');
  res.setHeader('content-type','application/json');
  if(req.method==='OPTIONS'){res.setHeader('access-control-allow-methods','POST');res.setHeader('access-control-allow-headers','content-type');res.writeHead(204);res.end();return}
  const path=req.url;
  if(path==='/v1/fastfold/status')res.end(JSON.stringify({enabled:true}));
  else if(path==='/v1/fastfold/profile'){res.writeHead(401);res.end(JSON.stringify({error:'sign_in_required'}))}
  else if(path==='/v1/preflop/datasets')res.end(JSON.stringify({datasets:publishedCatalog()}));
  else if(path.startsWith('/v1/preflop/datasets/')){const name=decodeURIComponent(path.slice('/v1/preflop/datasets/'.length));res.end(corrupt&&name==='opening-ranges'?'{}':publishedBodies()[name]);}
  else {res.writeHead(404);res.end('{}')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const api='http://127.0.0.1:'+server.address().port;
 const probe=(...flags)=>new Promise(resolve=>{const child=spawn(process.execPath,['--experimental-strip-types',new URL('../scripts/verify-fastfold-readiness.mjs',import.meta.url).pathname,'--api='+api,...flags],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('close',code=>resolve({code,output}));});
 try{const healthy=await probe();assert.equal(healthy.code,0,healthy.output);assert.match(healthy.output,/38 exact published source hashes/);copyDrift=true;const unapprovedCopy=await probe('--predeploy-compatible');assert.notEqual(unapprovedCopy.code,0);assert.match(unapprovedCopy.output,/not an approved compatible previous version/);const exactMismatch=await probe();assert.notEqual(exactMismatch.code,0);assert.match(exactMismatch.output,/Published source differs from exact reviewed checkout: five-bet-responses/);copyDrift=false;decisionDrift=true;const policyMismatch=await probe('--predeploy-compatible');assert.notEqual(policyMismatch.code,0);assert.match(policyMismatch.output,/not an approved compatible previous version/);decisionDrift=false;corrupt=true;const broken=await probe('--predeploy-compatible');assert.notEqual(broken.code,0);assert.match(broken.output,/Published content\/hash differs from its catalog/);corrupt=false;rawPretty=true;const pretty=await probe();assert.notEqual(pretty.code,0);assert.match(pretty.output,/Published source differs from exact reviewed checkout: opening-ranges/);assert.equal(writes,0)}finally{await new Promise(resolve=>server.close(resolve))}
});
