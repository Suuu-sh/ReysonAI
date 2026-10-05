// Explicit opt-in CLI, deliberately outside every original/default gate source graph.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadInputs } from './inputs.mjs';
import { captureSourceGraph, captureAuditIdentity } from './audit-identity.mjs';
import { contentHash, canonicalJson, freezeSnapshot } from './effective-law-identity.mjs';
import { simulateModel11Completion } from './simulation-model11-completion.mjs';
export function completionSourceIdentity() {
  return { kind: 'model11-offpath-behavior-source-identity', version: 1,
    sources: captureSourceGraph({ roots: ['apps/frontend/scripts/postflop-ai/evaluate-model11-completion.mjs'] }), inputs: captureAuditIdentity().inputs };
}
export function evaluateModel11Completion(inputs, flopArtifact, laterArtifact, plan) {
  const frozen = freezeSnapshot(plan);
  if (!frozen || frozen.mode !== 'simulation-completion-v1' || Object.keys(frozen).some(key =>
      !['mode', 'boardList', 'samples', 'cacheBatchSize', 'profiles', 'heroes', 'executionOptions'].includes(key))) throw new Error('Explicit simulation-completion-v1 plan required');
  const { mode, ...options } = frozen;
  return simulateModel11Completion(inputs, flopArtifact, laterArtifact, options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--spot', '--flop', '--later', '--plan', '--output'].includes(key) || !args[index + 1] || key in options) throw new Error('Five explicit --spot/--flop/--later/--plan/--output arguments required');
    options[key] = args[index + 1];
  }
  if (Object.keys(options).length !== 5) throw new Error('Five explicit arguments required');
  const json = path => JSON.parse(readFileSync(path, 'utf8')), source = completionSourceIdentity();
  const result = evaluateModel11Completion(loadInputs(options['--spot']), json(options['--flop']), json(options['--later']), json(options['--plan']));
  if (canonicalJson(completionSourceIdentity()) !== canonicalJson(source)) throw new Error('Completion source/input changed while running');
  result.sourceIdentity = source; result.sourceIdentityHash = contentHash(source);
  writeFileSync(options['--output'], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: options['--output'], kind: result.kind, counts: result.counts, executionIdentity: result.execution.identity, sourceIdentityHash: result.sourceIdentityHash }));
  if (result.counts.unresolvedCount) process.exitCode = 1;
}
