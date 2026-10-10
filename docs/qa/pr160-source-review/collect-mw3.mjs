import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {collectMw3Snapshot,verifyMw3Snapshot,sourcePathsFor,currentMw3ArchiveIdentity} from '../review-v3/apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs';
import {jsonBytes,sha256} from '../review-v3/apps/frontend/scripts/postflop-ai/mw3-reviewed-archive.mjs';
import {clearMw3ContractCache} from '../review-v3/apps/frontend/scripts/postflop-ai/mw3-artifacts.mjs';
import {parseMw3ApprovedRegistry,assertMw3CommittedFile} from '../review-v3/apps/frontend/scripts/postflop-ai/mw3-reviewed-restore.mjs';
import {prepareMw3SnapshotDeliveries,mw3DeliveryPins,assertMw3IndependentReceipt,buildMw3DeliverySql} from '../review-v3/apps/frontend/scripts/postflop-ai/mw3-reviewed-delivery.mjs';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../review-v3');
const record=p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,bytes:b.length,sha256:sha256(b)}};
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const put=(p,v)=>{const dest=path.join(out,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,Buffer.isBuffer(v)?v:jsonBytes(v));};
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:12e6}).trim();
const delta=(before,after)=>{const a=new Map(before.map(r=>[r.path,r])),b=new Map(after.map(r=>[r.path,r]));return {added:[...b.keys()].filter(p=>!a.has(p)),removed:[...a.keys()].filter(p=>!b.has(p)),modified:[...b.keys()].filter(p=>a.has(p)&&JSON.stringify(a.get(p))!==JSON.stringify(b.get(p)))};};
const files=fs.readdirSync(path.join(root,'artifacts/postflop')).filter(p=>/^mw3-.*\.manifest\.json$/.test(p)).sort();assert.equal(files.length,16);
const registry=parseMw3ApprovedRegistry(fs.readFileSync(path.join(root,'apps/shared/mw3-approved.ts')));assert.equal(registry.length,32);
const result={source_commit:git('rev-parse','HEAD'),source_tree:git('rev-parse','HEAD^{tree}'),status:'COLLECTION_IN_PROGRESS',receipt_issuance:false,subjects:[]};
for(const file of files){try{
 console.log('BEGIN',file);
 const manifestPath='artifacts/postflop/'+file,oldBytes=fs.readFileSync(path.join(root,manifestPath)),old=JSON.parse(oldBytes),receiptPath=`configs/mw3-${old.spot.slug}.review.json`,receipt=read(receiptPath),sqlPath=`artifacts/postflop/mw3-${old.spot.slug}.sql`;
 const archive=fs.readFileSync(path.join(root,old.archive.path));assert.equal(archive.length,old.archive.bytes);assert.equal(sha256(archive),old.archive.sha256);assertMw3CommittedFile(root,old.archive.path,archive,{lfs:true});
 for(const r of old.artifacts)assert.deepEqual(record(r.path),{path:r.path,bytes:r.bytes,sha256:r.sha256});
 let staleFailure;try{verifyMw3Snapshot(oldBytes,archive);throw Error('Prior manifest unexpectedly accepted')}catch(e){assert.match(e.message,/source\/input (dependency inventory differs|bytes changed)|source tree/i);staleFailure=e.message;}
 console.log('COLLECTING',old.spot.id);let snapshot=collectMw3Snapshot(old.spot.id);console.log('COLLECTED',old.spot.id);
 assert.equal(snapshot.manifest.source_tree,result.source_tree);const diffOffsets=[];for(let i=0;i<Math.max(archive.length,snapshot.compressed.length);i++)if(archive[i]!==snapshot.compressed[i])diffOffsets.push(i);const gzipComparison={identical:snapshot.compressed.equals(archive),saved_sha256:sha256(archive),local_sha256:sha256(snapshot.compressed),saved_bytes:archive.length,local_bytes:snapshot.compressed.length,differing_offsets:diffOffsets,saved_OS_byte:archive[9],local_OS_byte:snapshot.compressed[9]};assert.deepEqual(diffOffsets,[9]);assert.equal(archive[9],3);assert.equal(snapshot.compressed[9],19);
 for(const k of ['spot','inputs','artifacts'])assert.deepEqual(snapshot.manifest[k],old[k]);
 assert.deepEqual(snapshot.evidence,receipt.evidence);assert.deepEqual(snapshot.evidence.limitations,receipt.accepted_limitations);assert.equal(snapshot.evidence.limitations.length,7);
 assert.deepEqual(sourcePathsFor(currentMw3ArchiveIdentity(old.spot.id)),snapshot.manifest.sources.map(r=>r.path));
 let verified=verifyMw3Snapshot(snapshot.manifestBytes,snapshot.compressed);assert.deepEqual(verified.evidence,receipt.evidence);verified=null;
 let deliveries=await prepareMw3SnapshotDeliveries(snapshot);const pins=mw3DeliveryPins(snapshot,deliveries);assert.deepEqual(pins,receipt.deliveries);for(const pin of pins)assert.deepEqual(pin,registry.find(r=>r.spotId===pin.spotId&&r.stage===pin.stage));
 // Confirm historical SQL's canonical body with the historical receipt, without
 // representing that historical receipt as approval for the new source tree.
 const historicalSnapshot={...snapshot,manifest:old,manifestBytes:oldBytes};assertMw3IndependentReceipt(receipt,historicalSnapshot,deliveries);
 const sql=fs.readFileSync(path.join(root,sqlPath));assert.equal(buildMw3DeliverySql(historicalSnapshot,receipt,deliveries),sql.toString());
 assert.throws(()=>assertMw3IndependentReceipt(receipt,snapshot,deliveries),/Separate matching independent/);
 assert.throws(()=>verifyMw3Snapshot(snapshot.manifestBytes,archive));const affected=delta(old.sources,snapshot.manifest.sources),collected=`collected-manifests/${file}`;put(collected,snapshot.manifestBytes);
 result.subjects.push({gzip_comparison:gzipComparison,official_collector_completed:true,official_verify_local_serialization_completed:true,official_verify_local_manifest_with_saved_archive_rejected:true,spot:old.spot.id,slug:old.spot.slug,source_records:snapshot.manifest.sources.length,source_delta_from_prior_manifest:affected,archive:old.archive,raw_artifacts:old.artifacts,spot_identity:old.spot,inputs:old.inputs,source_hash:snapshot.manifest.sources_sha256,content_hash:snapshot.manifest.content_sha256,evidence:snapshot.evidence,pins,prior_receipt:record(receiptPath),historical_sql:record(sqlPath),sql_statements_sha256:sha256(Buffer.from(sql.toString().split('\n').slice(2).join('\n'))),canonical_historical_sql_verified:true,prior_manifest_rejection:staleFailure,collected_manifest:{path:collected,bytes:snapshot.manifestBytes.length,sha256:sha256(snapshot.manifestBytes)},historical_author_model:receipt.author_model,historical_author_task:receipt.author_task,historical_reviewer_model:receipt.reviewer_model,historical_reviewer_task:receipt.reviewer_task});
 snapshot=null;deliveries=null;
 console.log('Independent saved-byte/source collection:',old.spot.id,JSON.stringify(affected));
 put('mw3-evidence.json',result);
}finally{clearMw3ContractCache();global.gc();}}
result.raw_files=result.subjects.reduce((n,s)=>n+s.raw_artifacts.length,0);result.raw_bytes=result.subjects.flatMap(s=>s.raw_artifacts).reduce((n,r)=>n+r.bytes,0);result.archives=16;result.pins=32;result.joint_warnings=result.subjects.reduce((n,s)=>n+s.evidence.jointWarningCount,0);result.limitations_per_subject=7;result.registry=record('apps/shared/mw3-approved.ts');assert.equal(result.raw_files,112);assert.equal(result.raw_bytes,235515283);assert.equal(result.joint_warnings,561);result.status='DIAGNOSTIC_COLLECTION_COMPLETE_CANONICAL_SAVED_GZIP_MISMATCH';result.qualifications=['Not an independent acceptance receipt; no reviewer identity assertion.','Historical numerical evidence rehashed and validated, not newly simulated.','Current snapshot verification uses the collector native Darwin gzip. That output differs from saved Linux gzip only at byte9 for every subject; equality and direct local-manifest/saved-archive pairing do NOT pass. Saved archive bytes are untouched and no normalization or gate changes were made.'];assert.equal(git('diff','--name-only'),'');put('mw3-evidence.json',result);console.log(JSON.stringify({status:result.status,subjects:16,raw_files:result.raw_files,raw_bytes:result.raw_bytes,joint_warnings:result.joint_warnings}));
