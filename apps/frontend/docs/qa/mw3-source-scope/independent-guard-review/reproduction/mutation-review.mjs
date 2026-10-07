import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const [repo,out]=process.argv.slice(2);
const load=name=>import(pathToFileURL(join(repo,'apps/frontend/scripts/postflop-ai',name)));
const {verifyMw3Snapshot}=await load('mw3-reviewed-snapshot.mjs');
const {clearMw3ContractCache}=await load('mw3-artifacts.mjs');
const {jsonBytes,sha256}=await load('mw3-reviewed-archive.mjs');
const proof=JSON.parse(readFileSync(join(out,'preservation.json')));
const {assertMw3IndependentReceipt,prepareMw3SnapshotDeliveries}=await load('mw3-reviewed-delivery.mjs');
const results=[];
const baseline=new Map();
async function mutated(path,body,run){const full=join(repo,path),old=readFileSync(full);baseline.set(path,old);try{writeFileSync(full,body(old));return await run();}finally{writeFileSync(full,old);assert.deepEqual(readFileSync(full),old);}}
const verify=subject=>verifyMw3Snapshot(readFileSync(join(out,subject.manifest)),readFileSync(join(repo,subject.archive.path)));
const pilot=proof.subjects.find(x=>x.spot==='CO_open_BTN_call_BB_call');
execFileSync('git',['switch','-c','review/mw3-protected-edge-ui-probe'],{cwd:repo,stdio:'pipe'});
const ui=['apps/frontend/src/agent/gameplay-mobile.css','apps/frontend/src/trainer/RankedStats.tsx'];
await mutated(ui[0],x=>Buffer.concat([x,Buffer.from('\n/* Independent MW3 source-scope CSS comment probe. */\n')]),async()=>{
 await mutated(ui[1],x=>Buffer.concat([x,Buffer.from('\n// Independent MW3 source-scope TSX comment probe.\n')]),async()=>{
  for(const subject of proof.subjects){verify(subject);clearMw3ContractCache();globalThis.gc();}
  results.push({probe:'simultaneous CSS and RankedStats TSX comments on temporary branch',paths:ui,expected:'PASS',actual:'PASS',subjects:16});
 });
});
const protectedPaths=[
 'apps/backend/src/mw3-transport.ts','apps/shared/mw3-approved.ts','apps/frontend/src/estimated/mw3-browser.ts',
 'apps/frontend/src/agent/mw3-hand.ts','apps/frontend/scripts/postflop-ai/mw3-engine.mjs',
 'apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs','apps/frontend/src/estimated/opening-ranges.json',
 'apps/frontend/scripts/postflop-ai/mw3-source-identity-pairs.json','apps/frontend/src/locales/product-direct.json',
 'apps/frontend/scripts/data/mw3-co-btn-bb-authored.mjs',
 'apps/frontend/scripts/postflop-ai/mw3-source-dependencies.mjs',
 'apps/frontend/scripts/postflop-ai/vendor/babel-parser-7.29.7.mjs',
 'apps/frontend/scripts/postflop-ai/vendor/babel-parser-7.29.7.provenance.json',
 'apps/frontend/scripts/postflop-ai/vendor/babel-parser-7.29.7.license.json'
];
for(const path of protectedPaths){
 await mutated(path,x=>Buffer.concat([x,Buffer.from('\n')]),async()=>{
  let error;try{verify(pilot);}catch(e){error=e;}assert.ok(error,`Protected mutation incorrectly passed: ${path}`);
  assert.match(error.message,/changed|differs|Stale|stale|identity|source/i);results.push({probe:'protected file mutation',path,expected:'FAIL',actual:'FAIL',error:error.message});
 });clearMw3ContractCache();globalThis.gc();
}
const bytes=readFileSync(join(out,pilot.manifest)),compressed=readFileSync(join(repo,pilot.archive.path));
const badArchive=Buffer.from(compressed);badArchive[badArchive.length-1]^=1;
let archiveError;try{verifyMw3Snapshot(bytes,badArchive);}catch(e){archiveError=e;}assert.ok(archiveError);results.push({probe:'canonical archive mutation',expected:'FAIL',actual:'FAIL',error:archiveError.message});
const manifest=JSON.parse(bytes);manifest.sources_sha256='0'.repeat(64);
let manifestError;try{verifyMw3Snapshot(jsonBytes(manifest),compressed);}catch(e){manifestError=e;}assert.ok(manifestError);results.push({probe:'manifest source-hash mutation',expected:'FAIL',actual:'FAIL',error:manifestError.message});
const snapshot=verify(pilot),deliveries=await prepareMw3SnapshotDeliveries(snapshot),old=JSON.parse(readFileSync(join(repo,`configs/mw3-${pilot.slug}.review.json`)));
assert.throws(()=>assertMw3IndependentReceipt(old,snapshot,deliveries),/Separate matching/);
results.push({probe:'historical receipt reused with new source manifest',expected:'FAIL',actual:'FAIL'});
for(const [path,oldBytes] of baseline)assert.deepEqual(readFileSync(join(repo,path)),oldBytes);
const result={status:'PASS',reviewer_task:'/root/verify_mw3_guard_revision',source_tree:proof.source_tree,results,temporary_modifications_discarded:true,read_only_numerical_verification:true,original_inputs_verified_after_probes:true,completed_at:new Date().toISOString()};
writeFileSync(join(out,'mutation-review.json'),jsonBytes(result));console.log(JSON.stringify(result,null,2));
