import test from 'node:test';
import assert from 'node:assert/strict';
import { boundReview } from './postflop.ts';
test('independent warning binds both report artifact and finding to exact raw SHA, preserving original scene',()=>{
 const digest='b'.repeat(64),scene={key:'a'.repeat(64),provenance:{artifact_hash:digest},range_reason:{en:'Original generated text',ja:'生成時の原文'}};
 const report={schema_version:'aiv2-postflop-independent-review-v1',approved:false,artifacts:[{decision_id:scene.key,raw_file_sha256:digest}],findings:[{id:'reason-error',severity:'high',decision_id:scene.key,artifact_raw_file_sha256:digest,warning:{en:'Correction needed',ja:'要修正'},affected_combos:['8s5s'],source_path:'/private/never-expose'}]};
 const before=JSON.stringify(scene),result=boundReview(scene,report);assert.equal(result.status,'needs_correction');assert.equal(result.production_approved,false);assert.equal(result.warnings[0].warning.ja,'要修正');assert.equal(JSON.stringify(result).includes('/private/'),false);assert.equal(JSON.stringify(scene),before);
 const staleFinding=structuredClone(report);staleFinding.findings[0].artifact_raw_file_sha256='c'.repeat(64);assert.equal(boundReview(scene,staleFinding).warnings.length,0);
 const staleArtifact=structuredClone(report);staleArtifact.artifacts[0].raw_file_sha256='c'.repeat(64);assert.equal(boundReview(scene,staleArtifact).warnings.length,0);
 assert.equal(boundReview({...scene,provenance:{artifact_hash:'d'.repeat(64)}},report).warnings.length,0);assert.equal(boundReview(scene,null).production_approved,false);
});
