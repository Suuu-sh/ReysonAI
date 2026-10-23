import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { postflopHash } from '../scripts/aiv2-postflop-ondemand.ts';
import { formatOnDemandScene } from '../../range-dashboard/ondemand.ts';
import { onDemandReviewWarnings } from '../../shared/aiv2-ondemand-review-warnings.ts';
test('known child warning binds exact artifact canonical hash and preserves immutable saved policy',()=>{
 const file=new URL('../candidates/aiv2-postflop/llm-postflop-ondemand-v2/decisions/7504f6574de683065bbc208f0cd783282617a7068f1ee55db7bca702684769c1.json',import.meta.url);
 const before=readFileSync(file),envelope=JSON.parse(before.toString()),a=envelope.artifact,unchanged=JSON.stringify(a),artifactHash=postflopHash(a);
 const notes=onDemandReviewWarnings(a.decision_id,artifactHash);assert.equal(notes.length,1);assert.equal(notes[0].resolved,false);assert.ok(notes[0].warning.en.includes('AA'));assert.ok(notes[0].warning.ja.includes('AA'));
 assert.deepEqual(onDemandReviewWarnings(a.decision_id,postflopHash(envelope)),[]);assert.deepEqual(onDemandReviewWarnings('f'.repeat(64),artifactHash),[]);
 const changed=structuredClone(a);changed.summary.text+=' changed';assert.deepEqual(onDemandReviewWarnings(a.decision_id,postflopHash(changed)),[]);
 const scene=formatOnDemandScene(a);assert.equal(scene.provenance.artifact_hash,artifactHash);assert.deepEqual(scene.review.warnings,notes);assert.equal(scene.review.production_approved,false);assert.equal(scene.review.status,'not-independently-reviewed');assert.ok(scene.review.status_warning.en.includes('not independent approval'));
 assert.equal(scene.range_reason.en,a.summary.text);assert.equal(scene.range_reason.ja,a.summary.text_ja);assert.equal(JSON.stringify(a),unchanged);assert.deepEqual(readFileSync(file),before);
 notes[0].warning.en='mutated consumer';assert.ok(onDemandReviewWarnings(a.decision_id,artifactHash)[0].warning.en.includes('Unresolved'));
 const ui=readFileSync(new URL('../src/estimated/Aiv2OnDemandWorkspace.tsx',import.meta.url),'utf8');assert.ok(ui.includes('onDemandReviewWarnings(scene.key,scene.provenance.artifact_hash'));assert.ok(ui.includes('ja?note.warning.ja:note.warning.en'));
});
