// Independent source-scope review: saved-byte collection only, no numerical generation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const [repo,out,expectedTree,remoteCommit]=process.argv.slice(2);
assert.ok(repo&&out&&/^[a-f0-9]{40}$/.test(expectedTree)&&/^[a-f0-9]{40}$/.test(remoteCommit));
const git=(...args)=>execFileSync('git',['--no-replace-objects',...args],{cwd:repo,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
const load=name=>import(pathToFileURL(join(repo,'apps/frontend/scripts/postflop-ai',name)).href);
const { jsonBytes,sha256,readSafeFile,MW3_ARCHIVE_LIMITS,decodeMw3Archive,restoreMw3ArchiveBytes }=await load('mw3-reviewed-archive.mjs');
const { collectMw3Snapshot,verifyMw3Snapshot }=await load('mw3-reviewed-snapshot.mjs');
const { prepareMw3SnapshotDeliveries,mw3DeliveryPins,assertMw3IndependentReceipt }=await load('mw3-reviewed-delivery.mjs');
const { clearMw3ContractCache }=await load('mw3-artifacts.mjs');
const { verifyMw3SourceTree }=await load('mw3-source-tree.mjs');
const { assertMw3CommittedFile,parseMw3ApprovedRegistry }=await load('mw3-reviewed-restore.mjs');
const put=(path,value)=>{const target=join(out,path),bytes=Buffer.isBuffer(value)?value:jsonBytes(value);mkdirSync(dirname(target),{recursive:true});if(existsSync(target))assert.deepEqual(readFileSync(target),bytes);else writeFileSync(target,bytes,{flag:'wx'});};
const record=path=>{const bytes=readFileSync(join(repo,path));return{path,bytes:bytes.length,sha256:sha256(bytes)};};
assert.equal(git('rev-parse','HEAD^{tree}'),expectedTree);
assert.equal(typeof globalThis.gc,'function');
const manifests=git('ls-files','artifacts/postflop/mw3-*.manifest.json').split('\n');
assert.equal(manifests.length,16);
const registryBytes=readFileSync(join(repo,'apps/shared/mw3-approved.ts'));
const registry=parseMw3ApprovedRegistry(registryBytes);assert.equal(registry.length,32);
const historical=manifests.map(path=>{const bytes=readFileSync(join(repo,path));const manifest=JSON.parse(bytes);const receiptPath=`configs/mw3-${manifest.spot.slug}.review.json`;const receiptBytes=readFileSync(join(repo,receiptPath));return {path,bytes,manifest,receiptPath,receiptBytes,receipt:JSON.parse(receiptBytes)};});
const oldRecords=historical.flatMap(x=>[x.path,x.receiptPath,x.manifest.archive.path,`artifacts/postflop/mw3-${x.manifest.spot.slug}.sql`]).concat('apps/shared/mw3-approved.ts').map(record);
put('prior-hash-ledger.json',{kind:'compact-prior-source-context-provenance',commit:'5478e49ac5281485dea308902449a6a6f69ccf61',records:oldRecords});
const oldSourceTrees=new Map();
for(const row of historical){
  assertMw3CommittedFile(repo,row.path,row.bytes);assertMw3CommittedFile(repo,row.receiptPath,row.receiptBytes);
  assert.equal(sha256(row.bytes),row.receipt.manifest_sha256);
  let sources=oldSourceTrees.get(row.manifest.source_tree);if(!sources)oldSourceTrees.set(row.manifest.source_tree,sources=new Map());
  for(const source of [...row.manifest.sources,...row.manifest.inputs]){const old=sources.get(source.path);if(old)assert.deepEqual(source,old);sources.set(source.path,source);}
}
for(const [tree,records] of oldSourceTrees)verifyMw3SourceTree(repo,tree,[...records.values()]);
let restoredFiles=0,restoredBytes=0;
for(const row of historical){
  const compressed=readSafeFile(repo,row.manifest.archive.path,MW3_ARCHIVE_LIMITS.compressed);
  assertMw3CommittedFile(repo,row.manifest.archive.path,compressed,{lfs:true});
  const files=decodeMw3Archive(compressed,row.manifest);
  for(const path of files.keys()){
    assert.ok(path.startsWith('apps/frontend/.local/postflop-ai/mw3/'));
    assert.equal(git('ls-files','--',path),'');
    assert.equal(git('check-ignore','--',path),path);
  }
  const result=restoreMw3ArchiveBytes(repo,row.manifest,files);restoredFiles+=result.files;restoredBytes+=result.bytes;
}
assert.equal(restoredFiles,112);assert.equal(restoredBytes,235515283);
const subjects=[],pins=[],sourceImpact=[];
for(const row of historical){
  try{
    let collected=collectMw3Snapshot(row.manifest.spot.id);
    const original=readSafeFile(repo,row.manifest.archive.path,MW3_ARCHIVE_LIMITS.compressed);
    assert.deepEqual(collected.compressed,original,'Canonical original gzip must reproduce exactly on this Linux reviewer');
    assert.deepEqual(collected.manifest.spot,row.manifest.spot);
    assert.deepEqual(collected.manifest.artifacts,row.manifest.artifacts);
    assert.deepEqual(collected.manifest.inputs,row.manifest.inputs);
    assert.deepEqual(collected.manifest.archive,row.manifest.archive);
    const manifestBytes=collected.manifestBytes;collected=null;clearMw3ContractCache();globalThis.gc();
    const snapshot=verifyMw3Snapshot(manifestBytes,original);
    const deliveries=await prepareMw3SnapshotDeliveries(snapshot),pair=mw3DeliveryPins(snapshot,deliveries);
    assert.deepEqual(pair,row.receipt.deliveries);assert.deepEqual(snapshot.evidence,row.receipt.evidence);
    assert.deepEqual(snapshot.evidence.limitations,row.receipt.accepted_limitations);
    assertMw3IndependentReceipt(row.receipt,{...snapshot,manifest:row.manifest,manifestBytes:row.bytes},deliveries);
    for(const pin of pair)assert.deepEqual(pin,registry.find(x=>x.spotId===pin.spotId&&x.stage===pin.stage));
    for(const item of snapshot.manifest.artifacts)assert.deepEqual(record(item.path),{path:item.path,bytes:item.bytes,sha256:item.sha256});
    const previous=new Map(row.manifest.sources.map(x=>[x.path,x])),current=new Map(snapshot.manifest.sources.map(x=>[x.path,x]));
    const added=[...current.keys()].filter(x=>!previous.has(x));
    const removed=[...previous.keys()].filter(x=>!current.has(x));
    const modified=[...current.keys()].filter(x=>previous.has(x)&&JSON.stringify(previous.get(x))!==JSON.stringify(current.get(x)));
    assert.deepEqual(removed,[],'The protected-edge revision must retain the previously accepted numerical source closure');
    assert.ok(modified.includes('apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs'));
    assert.ok(added.every(x=>x.startsWith('apps/frontend/scripts/postflop-ai/')),'Only reviewed verification dependencies may be added');
    assert.ok(![...current.keys()].some(x=>/\.(tsx|css)$/.test(x)));
    sourceImpact.push({spot:row.manifest.spot.id,old_sources:previous.size,new_sources:current.size,added,modified,removed});
    const path=`drafts/mw3-${row.manifest.spot.slug}.manifest.json`;put(path,manifestBytes);
    subjects.push({spot:row.manifest.spot.id,slug:row.manifest.spot.slug,manifest:path,manifest_sha256:sha256(manifestBytes),sources_sha256:snapshot.manifest.sources_sha256,content_sha256:snapshot.manifest.content_sha256,inputs_sha256:snapshot.manifest.inputs_sha256,archive:snapshot.manifest.archive,raw_artifacts:snapshot.manifest.artifacts,pins:pair,evidence:snapshot.evidence,prior_receipt:record(row.receiptPath)});pins.push(...pair);
    console.log(`Independent saved-byte collection and verification PASS: ${row.manifest.spot.id}`);
  }finally{clearMw3ContractCache();globalThis.gc();}
}
assert.equal(pins.length,32);assert.deepEqual(oldRecords.map(x=>record(x.path)),oldRecords);
assert.equal(git('rev-parse','HEAD^{tree}'),expectedTree);
put('source-impact.json',{kind:'independent-mw3-source-scope-impact',source_commit:remoteCommit,source_tree:git('rev-parse','HEAD^{tree}'),subjects:sourceImpact});
put('preservation.json',{status:'PASS',source_commit:remoteCommit,source_tree:git('rev-parse','HEAD^{tree}'),node:process.version,platform:process.platform,completed_at:new Date().toISOString(),raw_files:restoredFiles,raw_bytes:restoredBytes,archives:16,canonical_compressed_bytes_identical:true,pins:32,joint_warnings:subjects.reduce((s,x)=>s+x.evidence.jointWarningCount,0),strategy_generation:false,new_simulation:false,old_source_trees:[...oldSourceTrees.keys()],subjects});
console.log(JSON.stringify({status:'PASS',subjects:subjects.length,raw_files:restoredFiles,raw_bytes:restoredBytes,canonical_archives:16,pins:32}));
