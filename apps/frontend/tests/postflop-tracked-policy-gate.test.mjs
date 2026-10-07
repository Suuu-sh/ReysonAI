import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { POSTFLOP_SPOTS } from '../scripts/postflop-ai/spots.ts';
import { readArtifact, useArtifactSource } from '../scripts/postflop-ai/inputs.mjs';
import { publishableSpots, spotArtifacts } from '../scripts/postflop-ai/publish-d1.mjs';

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
