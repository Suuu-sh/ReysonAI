import { buildMw3InputMaterial } from './mw3-input-core.mjs';
import { mw3TextSha, restoreMw3PolicyParts } from './mw3-delivery.mjs';
import { MW3_POLICY_SCHEMA, validateMw3Policy } from './mw3-policy.mjs';
import { mw3RequiredPolicyNodes } from './mw3-tree.mjs';

export async function buildMw3BrowserInputs(id, datasets) {
  const { fingerprintMaterial, ...inputs } = buildMw3InputMaterial(id, {
    opening: datasets['opening-ranges'], responses: datasets['preflop-ranges'], multiway: datasets['multiway-responses'],
  });
  return { ...inputs, fingerprint: await mw3TextSha(JSON.stringify(fingerprintMaterial)) };
}
export async function verifyMw3BrowserCandidate(inputs, { metadata, manifest, parts }, { stage, expectedImplementationHash, expectedPolicyHash }) {
  if (!['flop', 'later'].includes(stage) || !/^[a-f0-9]{64}$/.test(expectedImplementationHash) || !/^[a-f0-9]{64}$/.test(expectedPolicyHash) ||
      metadata?.schema_version !== MW3_POLICY_SCHEMA || metadata.spot !== inputs.spot.id || metadata.source_hash !== inputs.fingerprint ||
      metadata.implementation_hash !== expectedImplementationHash || metadata.policy_hash !== expectedPolicyHash ||
      metadata.strategy_type !== 'ai_estimate_not_gto' || metadata.model !== 'gpt-6-astra' || manifest?.policyHash !== expectedPolicyHash) {
    throw new Error('Missing, malformed or stale mw3 browser candidate');
  }
  const policy = await restoreMw3PolicyParts(manifest, parts);
  if (policy.spot_id !== inputs.spot.id || policy.streets.join() !== (stage === 'flop' ? 'flop' : 'turn,river')) throw new Error('Wrong mw3 browser policy scope');
  // Require the entire engine-pinned node inventory, not just whichever nodes the
  // payload happens to contain. Missing a whole node must fail before display.
  const nodes = mw3RequiredPolicyNodes(policy.streets);
  validateMw3Policy(policy, { spotId: inputs.spot.id, nodes });
  return { metadata, policy };
}
