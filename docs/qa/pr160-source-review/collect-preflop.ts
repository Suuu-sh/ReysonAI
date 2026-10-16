import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const { reviewedFiles, reviewedSourcePaths, assertReviewRecord, fileRecord, sha256 } = await import(new URL('../review-v3/apps/frontend/scripts/lib/reviewed-preflop.mjs', import.meta.url).href);
const { reviewedStage3Files, reviewedStage3SourcePaths, assertStage3ReviewRecord } = await import(new URL('../review-v3/apps/frontend/scripts/lib/reviewed-stage3.mjs', import.meta.url).href);
const { restoreReviewedPreflop, decodeReviewedArchive } = await import(new URL('../review-v3/apps/frontend/scripts/restore-reviewed-preflop.mjs', import.meta.url).href);
const { restoreReviewedStage3 } = await import(new URL('../review-v3/apps/frontend/scripts/restore-reviewed-stage3.mjs', import.meta.url).href);
const { decodeStage3Archive } = await import(new URL('../review-v3/apps/frontend/scripts/lib/stage3-artifacts.mjs', import.meta.url).href);
const { reviewedSourcePaths: huSourcePaths, reviewedInputPaths: huInputPaths } = await import(new URL('../review-v3/apps/frontend/scripts/postflop-ai/reviewed-postflop.mjs', import.meta.url).href);
const { continuationReasonFingerprint } = await import(new URL('../review-v3/apps/frontend/scripts/lib/continuation-reasons.mjs', import.meta.url).href);
const { stage3ReasonFingerprint } = await import(new URL('../review-v3/apps/frontend/scripts/lib/stage3-reasons.mjs', import.meta.url).href);
const out=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(out,'../review-v3');
const read=(p?: any): any=>JSON.parse(fs.readFileSync(path.join(root,p), "utf8"));
const git=(...args: any[]): any=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:12e6}).trim();
const write=(name?: any,value?: any): any=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const delta=(before?: any,after?: any): any=>{
 const a=new Map(before.map((r?: any): any=>[r.path,r])),b=new Map(after.map((r?: any): any=>[r.path,r]));
 return {added:[...b.keys()].filter((p?: any): any=>!a.has(p)),removed:[...a.keys()].filter((p?: any): any=>!b.has(p)),modified:[...b.keys()].filter((p?: any): any=>a.has(p)&&JSON.stringify(a.get(p))!==JSON.stringify(b.get(p)))};
};
const baseRecord=(p?: any): any=>{try{const b=execFileSync('git',['show',`ea8e7120939493d40794e5249aeeee4b7abecf8a:${p}`],{cwd:root,maxBuffer:12e6,stdio:['ignore','pipe','ignore']});return {path:p,bytes:b.length,sha256:sha256(b)}}catch{return null}};
const result: any={source_commit:git('rev-parse','HEAD'),source_tree:git('rev-parse','HEAD^{tree}'),receipt_issuance:false,stages:{}};
for(const [name,collect,paths,check,restore,decode,count] of [
 ['stage2',reviewedFiles,reviewedSourcePaths,assertReviewRecord,restoreReviewedPreflop,decodeReviewedArchive,1888],
 ['stage3',reviewedStage3Files,reviewedStage3SourcePaths,assertStage3ReviewRecord,restoreReviewedStage3,decodeStage3Archive,1805]]){
 const receiptPath=`configs/multiway-preflop-${name}.review.json`, prior=read(receiptPath);
 let restoreFailure: any;try{restore(root);throw new Error('Old receipt unexpectedly restored')}catch(e: any){assert.match(e.message,/source\/configuration identity changed/);restoreFailure=e.message;}
 const compressed=fs.readFileSync(path.join(root,prior.archive.path));
 assert.equal(compressed.length,prior.archive.bytes);assert.equal(sha256(compressed),prior.archive.sha256);
 // Diagnostic materialization via the official decoder; this is not a successful
 // restore or acceptance. The stale source gate above remains rejected.
 const decoded=decode(compressed,prior.artifacts);
 for(const [p,b] of decoded){const dest=path.join(root,p);assert.ok(dest.startsWith(root+'/apps/frontend/src/estimated/'));fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest))assert.deepEqual(fs.readFileSync(dest),b);else fs.writeFileSync(dest,b,{flag:'wx'});}
 const actual=collect(root);assert.equal(actual.artifacts.length,count);assert.deepEqual(actual.artifacts,prior.artifacts);assert.deepEqual(actual.archive,prior.archive);
 let checkFailure: any;try{check(prior,actual);throw new Error('Old receipt unexpectedly accepted')}catch(e: any){assert.match(e.message,/source\/configuration identity changed/);checkFailure=e.message;}
 const sourcePaths=paths(root);assert.deepEqual(sourcePaths,actual.sources.map((r?: any): any=>r.path));
 const fromBase=actual.sources.map((r?: any): any=>baseRecord(r.path)).filter(Boolean);
 const rawData=read(`apps/frontend/src/estimated/${name==='stage2'?'continuation':'stage3'}-responses.json`);
 const dependencies=['opening-ranges','preflop-ranges','multiway-responses','multiway2-responses','squeeze-responses','cold-three-bet-responses','cold-four-bet-responses',...(name==='stage3'?['continuation-responses']:[])];
 const fingerprint=(name==='stage2'?continuationReasonFingerprint:stage3ReasonFingerprint)({data:rawData,equities:read(`apps/frontend/src/estimated/${name==='stage2'?'continuation':'stage3'}-call-equities.json`),datasets:Object.fromEntries(dependencies.map((n?: any): any=>[n,read(`apps/frontend/src/estimated/${n}.json`)]))});assert.equal(fingerprint,prior.source_fingerprint);
 result.stages[name]={artifact_records:actual.artifacts.length,artifact_bytes:actual.artifacts.reduce((n?: any,r?: any): any=>n+r.bytes,0),archive:actual.archive,saved_fingerprint:prior.source_fingerprint,saved_counts:prior.counts,source_records:actual.sources.length,source_delta_from_prior_receipt:delta(prior.sources,actual.sources),pr_delta_within_current_sources:delta(fromBase,actual.sources),prior_receipt:fileRecord(root,receiptPath),restore_rejected:restoreFailure,assert_review_rejected:checkFailure,raw_counts:{catalog:rawData.catalog_spot_count,saved:rawData.spot_count,unreachable:rawData.omitted_unreachable_count,hands:rawData.entry_count},source_only_candidate_issued:false};
 write(`${name}-actual-records.json`,actual);
 result.stages[name].recomputed_fingerprint=fingerprint;
 console.log(name,JSON.stringify(result.stages[name]));
}
const huPaths=huSourcePaths(root),huInputs=huInputPaths();
const huSources=huPaths.map((p?: any): any=>fileRecord(root,p)),huInputRecords=huInputs.map((p?: any): any=>fileRecord(root,p));
const stage2ArtifactMap=new Map(read('configs/multiway-preflop-stage2.review.json').artifacts.map((r?: any): any=>[r.path,r]));
const baseInputs=huInputRecords.map((r?: any): any=>baseRecord(r.path)??stage2ArtifactMap.get(r.path));assert.ok(baseInputs.every(Boolean));
result.hu={source_records:huPaths.length,input_records:huInputs.length,pr_delta_within_current_sources:delta(huSources.map((r?: any): any=>baseRecord(r.path)).filter(Boolean),huSources),pr_input_delta:delta(baseInputs,huInputRecords),sources:huSources,inputs:huInputRecords,scope:'Current official HU source/input graph compared with exact PR base; ignored continuation data compared with unchanged parent receipt artifact hash. No HU numerical acceptance or archive renewal claimed.'};
write('preflop-and-hu-evidence.json',result);console.log('HU',JSON.stringify({source_records:huPaths.length,source_delta:result.hu.pr_delta_within_current_sources,input_delta:result.hu.pr_input_delta}));
