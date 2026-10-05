// Explicit selected-board gate bridge. No implicit representative/full-catalog run.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadInputs } from './inputs.mjs';
import { checkModel11Balance } from './gate-model11.mjs';
import { captureSourceGraph, captureAuditIdentity } from './audit-identity.mjs';
import { contentHash, canonicalJson } from './effective-law-identity.mjs';

export function model11GateSourceIdentity() {
  return { kind: 'model11-balance-gate-source-identity', version: 1,
    sources: captureSourceGraph({ roots: ['apps/frontend/scripts/postflop-ai/evaluate-model11-gate.mjs'] }),
    inputs: captureAuditIdentity().inputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--spot', '--flop', '--later', '--plan', '--output'].includes(key) || !args[index + 1] || key in options) throw new Error('Usage: evaluate-model11-gate.mjs --spot ID --flop FILE --later FILE --plan FILE --output NEW_FILE');
    options[key] = args[index + 1];
  }
  if (Object.keys(options).length !== 5) throw new Error('All five explicit arguments are required');
  const json = path => JSON.parse(readFileSync(path, 'utf8')), plan = json(options['--plan']);
  if (!plan || Object.keys(plan).some(key => !['boardList', 'street', 'authored'].includes(key))) throw new Error('Unknown gate plan field');
  const source = model11GateSourceIdentity(), started = performance.now();
  const result = checkModel11Balance(loadInputs(options['--spot']), json(options['--flop']), json(options['--later']), plan);
  if (canonicalJson(model11GateSourceIdentity()) !== canonicalJson(source)) throw new Error('Gate source/input bytes changed while evaluating');
  result.gateSourceIdentity = source; result.gateSourceHash = contentHash(source);
  result.processDiagnostics = { elapsedMs: performance.now() - started, memoryAtReturn: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS };
  writeFileSync(options['--output'], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: options['--output'], status: result.status, complete: result.complete,
    gateSourceHash: result.gateSourceHash, executionIdentity: result.execution.identity }));
  if (!result.complete || result.findings.some(finding => finding.severity === 'error')) process.exitCode = 1;
}
