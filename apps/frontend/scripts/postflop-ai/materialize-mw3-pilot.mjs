// Explicit local compiler for the already-authored, source-pinned Astra pilot.
// No model API is called here. This cannot author a missing spot, approve a policy,
// overwrite an existing different candidate, upload to LFS, or publish to D1.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildMw3PilotPolicies, MW3_PILOT_AUTHORSHIP } from '../data/mw3-co-btn-bb-authored.mjs';
import { loadMw3Inputs, mw3ArtifactPaths, mw3Root, mw3Sha } from './mw3-inputs.mjs';
import { makeMw3Artifact, mw3Contract, mw3ImplementationHash, saveMw3Artifact, verifyMw3Artifact } from './mw3-artifacts.mjs';

export function parseMw3MaterializeArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1];
    if (!['--spot', '--model', '--source-hash'].includes(name) || typeof value !== 'string' || value.startsWith('--') || Object.hasOwn(result, name)) throw new Error('Use exactly --spot <id> --model gpt-6-astra --source-hash <sha256>');
    result[name] = value;
  }
  if (Object.keys(result).length !== 3 || result['--spot'] !== MW3_PILOT_AUTHORSHIP.spotId || result['--model'] !== 'gpt-6-astra' ||
      !/^[a-f0-9]{64}$/.test(result['--source-hash'])) throw new Error('Only the explicitly authored Astra pilot is materializable; other spots remain unavailable');
  return { spotId: result['--spot'], model: result['--model'], sourceHash: result['--source-hash'] };
}

export function materializeMw3Pilot({ spotId, model, sourceHash }) {
  if (spotId !== MW3_PILOT_AUTHORSHIP.spotId || model !== MW3_PILOT_AUTHORSHIP.model || sourceHash !== MW3_PILOT_AUTHORSHIP.sourceFingerprint) throw new Error('Missing or mismatched explicit Astra author identity');
  const inputs = loadMw3Inputs(spotId);
  if (inputs.fingerprint !== sourceHash) throw new Error('Stale mw3 authored source');
  const contract = mw3Contract(inputs), policies = buildMw3PilotPolicies(inputs, contract), paths = mw3ArtifactPaths(inputs.spot);
  const recipeSha256 = createHash('sha256').update(readFileSync(join(mw3Root, 'scripts/data/mw3-co-btn-bb-authored.mjs'))).digest('hex');
  const implementationHash = mw3ImplementationHash(), generatedAt = new Date().toISOString();
  const authorTask = `mw3-co-btn-bb-authored-v${MW3_PILOT_AUTHORSHIP.version}`;
  // Preflight BOTH destinations before writing either one. Existing candidates
  // are reusable only when every semantic/source/recipe/policy identity matches.
  const plans = [['candidate', policies.flop], ['laterCandidate', policies.later]].map(([kind, policy]) => {
    if (existsSync(paths[kind])) {
      const current = verifyMw3Artifact(inputs, JSON.parse(readFileSync(paths[kind], 'utf8')), { kind, implementationHash });
      if (current.metadata.approval_status !== 'candidate_pending_independent_review' || current.metadata.policy_hash !== mw3Sha(policy) ||
          current.metadata.recipe_sha256 !== recipeSha256 || current.metadata.author_task !== authorTask) throw new Error(`Existing mw3 ${kind} differs and is preserved; archive it explicitly first`);
      return { kind, artifact: current, existing: true };
    }
    const artifact = makeMw3Artifact(inputs, policy, { authorTask, generatedAt, implementationHash });
    artifact.metadata.recipe_sha256 = recipeSha256;
    verifyMw3Artifact(inputs, artifact, { kind, implementationHash });
    return { kind, artifact, existing: false };
  });
  return { spotId, sourceHash, implementationHash, recipeSha256, status: 'candidate_pending_independent_review',
    files: plans.map(plan => ({ kind: plan.kind, policyHash: plan.artifact.metadata.policy_hash,
      ...(plan.existing ? { path: paths[plan.kind], reused: true } : saveMw3Artifact(inputs, plan.artifact, plan.kind)) })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(materializeMw3Pilot(parseMw3MaterializeArgs(process.argv.slice(2))), null, 2));
}
