// The experiment consumes unchanged saved envelopes. It never rewrites authoring provenance.
import { validatePolicy } from './policy.mjs';
import { validateLaterPolicy } from './later-policy.mjs';
import { assertJsonCompatible, contentHash, savedPayloadHash, freezeSnapshot, canonicalJson } from './effective-law-identity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { multiwayInputData } from './multiway-inputs.mjs';
import { sha } from './browser-inputs.mjs';
import { gameConfig } from '../../src/estimated/sizing.ts';
import pilotConfig from '../data/postflop-ai-pilot.json' with { type: 'json' };
const hashPattern = /^[a-f0-9]{64}$/;
const fail = (status, message) => { throw new EffectiveReachError(status, message); };
const requireHash = (value, field) => { if (typeof value !== 'string' || !hashPattern.test(value)) fail('invalid-artifact-provenance', `Missing or malformed ${field}`); };

export function validateEffectiveArtifacts(inputs, flopArtifact, laterArtifact) {
  // Inspect originals before snapshotting, lookup, caps or computed fold/call replacement.
  try {
    assertJsonCompatible(inputs, 'inputs');
    if (flopArtifact !== undefined) assertJsonCompatible(flopArtifact, 'flopArtifact');
    if (laterArtifact !== undefined) assertJsonCompatible(laterArtifact, 'laterArtifact');
  } catch (failure) { fail('invalid-source-contract', failure.message); }
  requireHash(inputs?.fingerprint, 'inputs.fingerprint');
  if (!inputs?.spot?.id || !['oop_leads','oop_checks'].includes(inputs.spot.tree) || !inputs.config ||
      !Array.isArray(inputs.sources) || !inputs.seatRows || [inputs.spot.ip, inputs.spot.oop].some(seat => !Array.isArray(inputs.seatRows[seat]) ||
        inputs.seatRows[seat].some(row => !row || typeof row.hand !== 'string' || !Number.isFinite(row.freq) || row.freq < 0 || row.freq > 100))) {
    fail('invalid-source-contract', 'Missing or malformed frozen input contract');
  }
  // Recheck the existing saved source construction; an unchanged fingerprint string cannot
  // authorize modified seat rows. No synthetic prior is silently accepted as a frozen source.
  try {
    const rebuilt = multiwayInputData(inputs.spot, dataset => ({ spots: inputs.sources.filter(source => source.dataset === dataset).map(source => source.spot) }));
    const excluded = ['later_streets','later_raise_multiplier','later_all_in_merge_ratio','defence_realization','river_allin_max_pot_ratio','max_raises_per_street'];
    const flopConfig = Object.fromEntries(Object.entries(pilotConfig).filter(([key]) => !excluded.includes(key)));
    const expected = sha({ spot: inputs.spot, sources: rebuilt.sources, gameConfig, config: flopConfig });
    if (expected !== inputs.fingerprint || canonicalJson(rebuilt.sources) !== canonicalJson(inputs.sources) || canonicalJson(rebuilt.seatRows) !== canonicalJson(inputs.seatRows)) {
      fail('stale-source-contract', 'Frozen input fingerprint/source factors/seat rows do not match original source construction');
    }
  } catch (failure) {
    if (failure instanceof EffectiveReachError) throw failure;
    fail('invalid-source-contract', failure.message);
  }
  const envelope = (artifact, name, isFlop) => {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
        Object.keys(artifact).sort().join(',') !== 'metadata,policy' || !artifact.metadata || typeof artifact.metadata !== 'object' || Array.isArray(artifact.metadata)) {
      fail('missing-executor-policy', `${name} must be the saved {metadata,policy} artifact envelope`);
    }
    const metadata = artifact.metadata;
    requireHash(metadata.source_hash, `${name}.metadata.source_hash`);
    requireHash(metadata.policy_hash, `${name}.metadata.policy_hash`);
    if (metadata.source_hash !== inputs.fingerprint || metadata.spot !== inputs.spot.id || metadata.config_version !== inputs.config.version ||
        metadata.kind !== 'ai_estimate_not_gto' || (isFlop ? metadata.tree !== inputs.spot.tree : metadata.tree !== undefined && metadata.tree !== inputs.spot.tree)) {
      fail('stale-executor-policy', `${name} source/spot/tree/config metadata does not match frozen inputs`);
    }
    try { isFlop ? validatePolicy(artifact.policy, inputs.spot.tree) : validateLaterPolicy(artifact.policy); }
    catch (failure) { fail('invalid-executor-policy', `${name}: ${failure.message}`); }
    if (metadata.policy_hash !== savedPayloadHash(artifact.policy)) fail('invalid-artifact-provenance', `${name} saved policy hash does not match its original payload`);
    return freezeSnapshot({ artifactContentHash: contentHash(artifact), payloadContentHash: contentHash(artifact.policy),
      savedPolicyHash: metadata.policy_hash, originalGenerationProvenance: metadata });
  };
  const flop = envelope(flopArtifact, 'flopArtifact', true), later = envelope(laterArtifact, 'laterArtifact', false);
  requireHash(laterArtifact.metadata.flop_policy_hash, 'laterArtifact.metadata.flop_policy_hash');
  if (laterArtifact.metadata.flop_policy_hash !== flopArtifact.metadata.policy_hash) fail('stale-executor-policy', 'Later artifact references a different flop payload');
  return { flopPolicy: flopArtifact.policy, laterPolicy: laterArtifact.policy, provenance: freezeSnapshot({ kind: 'unchanged-saved-artifact-pair', flop, later }) };
}
