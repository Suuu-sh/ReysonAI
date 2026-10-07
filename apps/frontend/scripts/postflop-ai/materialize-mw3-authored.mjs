// Explicit local compile only. The registry contains previously authored Astra
// recipes; this command does not author, approve, replace, upload or publish.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseMw3AuthorArgs } from './mw3-author-cli.mjs';
import { loadMw3AuthoredContext } from './mw3-authored-source.mjs';
import { mw3ArtifactPaths, mw3Sha } from './mw3-inputs.mjs';
import { makeMw3Artifact, saveMw3Artifact, verifyMw3Artifact } from './mw3-artifacts.mjs';
export function materializeMw3Authored(options) {
  const { author, inputs, policies, recipeSha256, implementationHash, authorTask } = loadMw3AuthoredContext(options);
  const paths = mw3ArtifactPaths(inputs.spot), generatedAt = new Date().toISOString();
  const plans = [['candidate', policies.flop], ['laterCandidate', policies.later]].map(([kind, policy]) => {
    if (existsSync(paths[kind])) {
      const current = verifyMw3Artifact(inputs, JSON.parse(readFileSync(paths[kind], 'utf8')), { kind, implementationHash });
      if (current.metadata.approval_status !== 'candidate_pending_independent_review' || current.metadata.policy_hash !== mw3Sha(policy) ||
          current.metadata.recipe_sha256 !== recipeSha256 || current.metadata.author_task !== authorTask) throw new Error(`Existing Mw3 ${kind} differs and is preserved; archive it explicitly first`);
      return { kind, artifact: current, existing: true };
    }
    const artifact = makeMw3Artifact(inputs, policy, { authorTask, generatedAt, implementationHash });
    artifact.metadata.recipe_sha256 = recipeSha256;
    verifyMw3Artifact(inputs, artifact, { kind, implementationHash });
    return { kind, artifact, existing: false };
  });
  return { spotId: inputs.spot.id, sourceHash: inputs.fingerprint, implementationHash, recipeSha256, authorVersion: author.version,
    status: 'candidate_pending_independent_review', files: plans.map(plan => ({ kind: plan.kind, policyHash: plan.artifact.metadata.policy_hash,
      ...(plan.existing ? { path: paths[plan.kind], reused: true } : saveMw3Artifact(inputs, plan.artifact, plan.kind)) })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(materializeMw3Authored(parseMw3AuthorArgs(process.argv.slice(2))), null, 2));
