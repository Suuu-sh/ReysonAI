// Prepare immutable delivery records. This is packaging only: a hash is not an
// approval, and these records are not connected to any public route or publisher.
import { mw3TextSha, prepareMw3PolicyParts } from './mw3-delivery.mjs';

export async function prepareMw3Transport(artifact, stage) {
  if (!['flop', 'later'].includes(stage) || !artifact?.policy || !artifact.metadata ||
      artifact.metadata.spot !== artifact.policy.spot_id ||
      artifact.metadata.policy_hash !== await mw3TextSha(JSON.stringify(artifact.policy)) ||
      artifact.policy.streets.join() !== (stage === 'flop' ? 'flop' : 'turn,river')) {
    throw new Error('Invalid mw3 transport source');
  }
  const { manifest, parts } = await prepareMw3PolicyParts(artifact.policy);
  const partHashes = await Promise.all(parts.map(part => mw3TextSha(part.body)));
  const header = { version: 1, kind: 'ai_estimate_not_gto', stage, metadata: artifact.metadata, manifest, partHashes };
  const headerText = JSON.stringify(header);
  return { header, headerText, deliveryHash: await mw3TextSha(headerText),
    parts: parts.map((part, index) => ({ ...part, bodyHash: partHashes[index] })) };
}
