// Local authoring/storage boundary for already-authored Astra mw3 policies.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mw3ArtifactPaths, mw3Root, mw3Sha } from './mw3-inputs.mjs';
import { MW3_POLICY_SCHEMA, validateMw3Policy } from './mw3-policy.mjs';
import { probeMw3Hand } from './mw3-tree.mjs';
export const MW3_SEMANTIC_SOURCES = Object.freeze(['mw3-engine.mjs', 'mw3-tree.mjs', 'mw3-policy.mjs', 'mw3-spots.mjs', 'mw3-inputs.mjs',
  'model.mjs', '../lib/continuation-evaluator.mjs']);
export function mw3ImplementationHash() {
  return mw3Sha(Object.fromEntries(MW3_SEMANTIC_SOURCES.map(path => [path,
    readFileSync(join(mw3Root, 'scripts/postflop-ai', path), 'utf8')])));
}
const probes = new Map();
export function mw3Contract(inputs) {
  const key = `${inputs.spot.id}|${inputs.spot.potBb}|${inputs.spot.stackBb}`;
  if (!probes.has(key)) probes.set(key, probeMw3Hand(inputs.spot));
  return probes.get(key);
}
export function makeMw3Artifact(inputs, policy, { authorTask, generatedAt, implementationHash = mw3ImplementationHash() }) {
  if (typeof authorTask !== 'string' || !authorTask || typeof generatedAt !== 'string' || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Explicit Astra author provenance is required');
  }
  validateMw3Policy(policy, { spotId: inputs.spot.id, nodes: mw3Contract(inputs).nodes });
  return { metadata: { schema_version: MW3_POLICY_SCHEMA, spot: inputs.spot.id, source_hash: inputs.fingerprint,
    implementation_hash: implementationHash, policy_hash: mw3Sha(policy), model: 'gpt-6-astra',
    author_task: authorTask, generated_at: generatedAt, strategy_type: 'ai_estimate_not_gto',
    approval_status: 'candidate_pending_independent_review' }, policy };
}
export function verifyMw3Artifact(inputs, artifact, { kind = 'candidate', implementationHash = mw3ImplementationHash() } = {}) {
  if (!['candidate', 'laterCandidate'].includes(kind)) throw new Error('Invalid mw3 artifact kind');
  if (!artifact || artifact.metadata?.schema_version !== MW3_POLICY_SCHEMA || artifact.metadata.spot !== inputs.spot.id ||
      artifact.metadata.source_hash !== inputs.fingerprint || artifact.metadata.implementation_hash !== implementationHash ||
      artifact.metadata.policy_hash !== mw3Sha(artifact.policy) || artifact.metadata.model !== 'gpt-6-astra' ||
      !artifact.metadata.author_task || artifact.metadata.strategy_type !== 'ai_estimate_not_gto') throw new Error('Missing, malformed or stale mw3 artifact');
  const expected = kind === 'candidate' ? 'flop' : 'turn,river';
  if (artifact.policy?.streets?.join() !== expected) throw new Error('Wrong mw3 artifact street scope');
  validateMw3Policy(artifact.policy, { spotId: inputs.spot.id, nodes: mw3Contract(inputs).nodes });
  return artifact;
}
export function readMw3Artifact(inputs, kind) {
  const path = mw3ArtifactPaths(inputs.spot)[kind];
  if (!path || !existsSync(path)) throw new Error(`Saved mw3 ${kind} is missing; no policy fallback is available`);
  return verifyMw3Artifact(inputs, JSON.parse(readFileSync(path, 'utf8')), { kind });
}
export function saveMw3Artifact(inputs, artifact, kind) {
  verifyMw3Artifact(inputs, artifact, { kind });
  const path = mw3ArtifactPaths(inputs.spot)[kind];
  if (existsSync(path)) {
    const current = JSON.parse(readFileSync(path, 'utf8'));
    if (mw3Sha(current) === mw3Sha(artifact)) return { path, reused: true };
    throw new Error('Existing mw3 artifact is preserved; archive it explicitly before replacing');
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact)}\n`, { flag: 'wx' });
  return { path, reused: false };
}
