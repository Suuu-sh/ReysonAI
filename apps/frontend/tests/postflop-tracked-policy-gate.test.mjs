import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { POSTFLOP_SPOTS } from '../scripts/postflop-ai/spots.ts';
import { readArtifact, useArtifactSource } from '../scripts/postflop-ai/inputs.mjs';
import { buildSql, publishableSpots, spotArtifacts } from '../scripts/postflop-ai/publish-d1.mjs';

test('strict delivery rejects mismatched later report/policy/flop hashes and missing later files', () => {
  const spot = POSTFLOP_SPOTS.find(item => item.reachable);
  assert.equal(Boolean(spot.history), false);
  const saved = Object.fromEntries(['candidate', 'laterCandidate', 'report'].map(kind => [kind, readArtifact(spot, kind)]));
  assert.ok(saved.candidate && saved.laterCandidate && saved.report);
  assert.equal(spotArtifacts(spot).skip, undefined, 'unchanged tracked legacy tuple is fresh');
  const cache = new Map();
  const ranges = new Proxy({}, { get(_object, name) {
    if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url))));
    return cache.get(name);
  } });
  const mutations = [
    ['report later hash', data => { data.report.later_policy_hash = 'wrong'; }],
    ['later content hash', data => { data.laterCandidate.metadata.policy_hash = 'wrong'; }],
    ['later flop binding', data => { data.laterCandidate.metadata.flop_policy_hash = 'wrong'; }],
    ['missing later file', data => { data.laterCandidate = null; }],
  ];
  for (const [label, mutate] of mutations) {
    const artifacts = structuredClone(saved);
    mutate(artifacts);
    const previous = useArtifactSource({ ranges, artifact(requested, kind) {
      assert.equal(requested.id, spot.id, 'strict rejection occurs at the first reachable tuple');
      return artifacts[kind] ?? null;
    } });
    try {
      assert.throws(() => publishableSpots(() => {}, { requireAll: true }), /is not publishable|no turn\/river policy/, label);
    } finally { useArtifactSource(previous); }
  }
  assert.equal(spotArtifacts(spot).skip, undefined, 'tracked numerical files were never edited');
});


test('strict publication accepts all 85 unchanged adopted-v7 tuples with honest generator attribution', () => {
  const published=publishableSpots(()=>{},{requireAll:true});
  assert.equal(POSTFLOP_SPOTS.filter(spot=>spot.reachable).length,85);
  assert.equal(published.length,85);
  assert.equal(new Set(published.map(item=>item.spot.id)).size,85);
  assert.equal(published.filter(item=>item.spot.history).length,40);
  for(const stage of ['candidate','laterCandidate']) {
    const attribution={};
    for(const item of published) {
      const metadata=item[stage].metadata, key=`${metadata.model}/${metadata.reasoning_effort}`;
      attribution[key]=(attribution[key]??0)+1;
      if(item.spot.history)assert.equal(key,'gpt-6.1-sol/high');
      assert.notEqual(metadata.model,'gpt-6-astra','reviewer attribution must not be substituted for the generator');
    }
    assert.deepEqual(attribution,{'claude-sonnet-5-5/max':44,'claude-opus-5-5/high':1,'gpt-6.1-sol/high':40});
  }
  for(const {spot,report} of published) {
    assert.equal(report.defence_version,7,spot.id);
    assert.equal(Object.hasOwn(report,'action_model_version'),false,spot.id);
    assert.equal(report.results.length,72,spot.id);
  }
  // Build only in memory. No D1 command, numerical generation or quality approval.
  const sql=buildSql(published,'2026-10-07T00:00:00Z','adopted-v7-contract-test');
  const lines=sql.split('\n');
  assert.equal(lines.filter(line=>line.startsWith('INSERT INTO postflop_policies')).length,170);
  assert.equal(lines.filter(line=>line.startsWith('INSERT INTO postflop_reports')).length,85);
  assert.equal(lines.filter(line=>line.startsWith('INSERT INTO postflop_spots')).length,85);
  const deletes=lines.filter(line=>line.startsWith('DELETE FROM postflop_'));
  assert.equal(deletes.length,340);
  for(const line of deletes)assert.match(line,/ WHERE spot_id = '[^']+';$/);
});

test('the 255 adopted development policy/report files retain their exact raw bytes', () => {
  // Filename + NUL + raw bytes + NUL, sorted by filename. Independently computed
  // after the turn/river bluff raise selection regenerated every simulation report.
  const directory=new URL('../scripts/data/postflop-ai/policies/',import.meta.url);
  const files=readdirSync(directory).filter(file=>file.endsWith('.json')).sort();
  assert.equal(files.length,255);
  const digest=createHash('sha256');
  for(const file of files)digest.update(file).update('\0').update(readFileSync(new URL(file,directory))).update('\0');
  assert.equal(digest.digest('hex'),'2bfd7ae9d1bed70758cc65ca62c93cef0ad59f889441b4dc8b251af8e7047126');
});

test('a missing artifact from either end of the required 85 tuples fails strict publication', () => {
  const reachable=POSTFLOP_SPOTS.filter(spot=>spot.reachable);
  const saved=new Map(reachable.map(spot=>[spot.id,Object.fromEntries(['candidate','laterCandidate','report'].map(kind=>[kind,readArtifact(spot,kind)]))]));
  const cache=new Map();
  const ranges=new Proxy({},{get(_object,name){
    if(!cache.has(name))cache.set(name,JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url))));
    return cache.get(name);
  }});
  for(const target of [reachable[0],reachable.at(-1)])for(const missing of ['candidate','laterCandidate','report']) {
    const previous=useArtifactSource({ranges,artifact(spot,kind){return spot.id===target.id&&kind===missing?null:saved.get(spot.id)?.[kind]??null;}});
    try {
      assert.throws(()=>publishableSpots(()=>{},{requireAll:true}),error=>error.message.startsWith(`${target.id} is not publishable:`),`${target.id}: missing ${missing}`);
    } finally {useArtifactSource(previous);}
  }
});

test('selected HU publication rejects stale source/content, v10 reports and false generation attribution', () => {
  const spot=POSTFLOP_SPOTS.find(item=>item.reachable&&item.history);
  const saved=Object.fromEntries(['candidate','laterCandidate','report'].map(kind=>[kind,readArtifact(spot,kind)]));
  const cache=new Map();
  const ranges=new Proxy({},{get(_object,name){
    if(!cache.has(name))cache.set(name,JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url))));
    return cache.get(name);
  }});
  const mutations=[
    ['missing report',data=>{data.report=null;}],
    ['missing flop',data=>{data.candidate=null;}],
    ['missing later',data=>{data.laterCandidate=null;}],
    ['changed source',data=>{data.report.source_hash='wrong';}],
    ['stale flop source',data=>{data.candidate.metadata.source_hash='wrong';}],
    ['stale later source',data=>{data.laterCandidate.metadata.source_hash='wrong';}],
    ['changed flop content',data=>{data.candidate.metadata.policy_hash='wrong';}],
    ['changed later content',data=>{data.laterCandidate.metadata.policy_hash='wrong';}],
    ['wrong later binding',data=>{data.laterCandidate.metadata.flop_policy_hash='wrong';}],
    ['v10 report',data=>{data.report.defence_version=10;data.report.action_model_version=10;}],
    ['v7 relabelled v10 report',data=>{data.report.action_model_version=10;}],
    ['Astra flop attribution',data=>{data.candidate.metadata.model='gpt-6-astra';}],
    ['Astra later attribution',data=>{data.laterCandidate.metadata.model='gpt-6-astra';}],
    ['wrong flop effort',data=>{data.candidate.metadata.reasoning_effort='xhigh';}],
    ['missing later effort',data=>{delete data.laterCandidate.metadata.reasoning_effort;}],
  ];
  for(const [label,mutate] of mutations) {
    const artifacts=structuredClone(saved);mutate(artifacts);
    const previous=useArtifactSource({ranges,artifact(requested,kind){assert.equal(requested.id,spot.id);return artifacts[kind]??null;}});
    try {assert.ok(spotArtifacts(spot).skip,label);} finally {useArtifactSource(previous);}
  }
  assert.equal(spotArtifacts(spot).skip,undefined);
});
