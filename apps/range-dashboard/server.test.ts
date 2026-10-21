import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ROOT, hash, hands, verifyArtifact, snapshot, createDashboardServer } from './server.ts';

const source=JSON.parse(await readFile(resolve(ROOT,'spots/base/opening-ranges/UTG_open.json'),'utf8'));
test('169 canonical cells, exact saved JA/EN reasons and independent hash/summary verification',()=>{
  const scene=verifyArtifact(source,hash(source));
  assert.equal(scene.cells.length,169);assert.deepEqual(scene.cells.map(c=>c.hand),hands);
  for(const [i,cell] of scene.cells.entries()){
    assert.equal(Object.values(cell.mix).reduce((a,b)=>a+b,0),100);
    assert.equal(cell.reason.en,source.reasons.reasons[i].text);
    assert.equal(cell.reason.ja,source.reasons.reasons[i].text_ja);
  }
  assert.deepEqual(scene.summary.action_frequency_pct,source.metadata.actual_range_summary.action_frequency_pct);
  assert.equal(scene.provenance.verified,true);
});
test('tampered policy/reason/artifact/summary/grid and unreachable candidates fail closed',()=>{
  const change=fn=>{const x=structuredClone(source);fn(x);assert.throws(()=>verifyArtifact(x));};
  change(x=>x.spot.class_defaults[0][0]--);
  change(x=>x.reasons.reasons[0].text+='changed');
  change(x=>x.reasons.reasons[0].text_ja='');
  change(x=>x.metadata.final_hash='0'.repeat(64));
  change(x=>x.metadata.actual_range_summary.action_frequency_pct.open++);
  change(x=>x.spot.hands[0].open--);
  change(x=>x.metadata.generation_mode='unreachable-placeholder');
  assert.throws(()=>verifyArtifact(source,'0'.repeat(64)));
});
test('safe routes, no filesystem leakage, readonly methods, traversal rejected and source polling',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'range-dashboard-'));
  const key='base/opening-ranges/UTG_open';
  await mkdir(resolve(root,'spots/base/opening-ranges'),{recursive:true});
  await writeFile(resolve(root,'spots',key+'.json'),JSON.stringify(source));
  const manifest={method:'llm-range-single-response-v6',status:'running',generated_total:2100,generated_completed:1,new_single_pass:1,running:2,failed:0,nodes:{[key]:{status:'complete',origin:'single-pass-v6',artifact:'/private/path/.env',artifact_hash:hash(source)},'base/unreachable':{status:'complete',origin:'placeholder'}}};
  await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest));
  const server=createDashboardServer(root);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const list=await (await fetch(base+'/api/scenes')).json();
    assert.equal(list.scenes.length,1);assert.equal(list.status.excluded,1);
    assert.equal(list.scenes[0].cells,undefined);
    const detail=await (await fetch(base+'/api/scene?key='+encodeURIComponent(key))).json();
    const json=JSON.stringify(detail);assert.equal(detail.cells.length,169);
    for(const forbidden of ['/Users/','/private/','prompt_hash','source_hash','combo_reach_weights','class_defaults'])assert.equal(json.includes(forbidden),false);
    assert.equal((await fetch(base+'/api/scene?key=../../.env')).status,404);
    for(const route of ['/manifest.json','/.env','/server.ts','/api/generate','/%2e%2e%2f.env','/spots/base/opening-ranges/UTG_open.json','/apps/frontend/package.json'])assert.equal((await fetch(base+route)).status,404,route);
    for(const method of ['POST','PUT','DELETE','PATCH'])assert.equal((await fetch(base+'/api/scene',{method})).status,405);
    const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(html.headers.get('x-robots-tag'),'noindex, nofollow');
    manifest.running=3;await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest));
    assert.equal((await (await fetch(base+'/api/status')).json()).running,3);
    manifest.nodes[key].artifact_hash='bad';await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest));
    const invalid=await snapshot(root);assert.equal(invalid.scenes.length,0);assert.equal(invalid.status.invalid,1);
  }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
