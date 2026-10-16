import type { Mw3Inputs, Mw3Policy } from './mw3-types.ts';
export type Mw3CandidateMetadata = { schema_version: 3; spot: string; source_hash: string; implementation_hash: string;
  policy_hash: string; strategy_type: 'ai_estimate_not_gto'; model: 'gpt-6-astra'; author_task?: string; generated_at?: string;
  approval_status?: string; recipe_sha256?: string };
import { buildMw3InputMaterial } from './mw3-input-core.ts';
import { mw3TextSha, restoreMw3PolicyParts } from './mw3-delivery.ts';
import { MW3_POLICY_SCHEMA, validateMw3Policy } from './mw3-policy.ts';
import { mw3RequiredPolicyNodes } from './mw3-tree.ts';

export function buildMw3BrowserInputs(id: string, datasets: Record<string, unknown>): Promise<Mw3Inputs>;
export async function buildMw3BrowserInputs(id?: any, datasets?: any) : Promise<any> {
  const { fingerprintMaterial, ...inputs } = buildMw3InputMaterial(id, {
    opening: datasets['opening-ranges'], responses: datasets['preflop-ranges'], multiway: datasets['multiway-responses'],
  });
  return { ...inputs, fingerprint: await mw3TextSha(JSON.stringify(fingerprintMaterial)) };
}
export function verifyMw3BrowserCandidate(inputs: Mw3Inputs, candidate: { metadata: unknown; manifest: unknown; parts: unknown }, expected: {
  stage: 'flop' | 'later'; expectedImplementationHash: string; expectedPolicyHash: string;
}): Promise<{ metadata: Mw3CandidateMetadata; policy: Mw3Policy }>;
export async function verifyMw3BrowserCandidate(inputs: any, { metadata, manifest, parts }: any, { stage, expectedImplementationHash, expectedPolicyHash }: any) : Promise<any> {
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
