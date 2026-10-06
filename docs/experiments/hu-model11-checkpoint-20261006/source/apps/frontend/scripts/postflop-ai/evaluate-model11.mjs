// Explicit opt-in evaluation of saved authoring/revision envelopes. Never writes legacy paths.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadInputs } from './inputs.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';
import { simulateModel11 } from './simulation-model11.mjs';
import { balanceModel11, auditModel11Boards } from './balance-model11.mjs';
import { newHuAuthoringContract, promptFor, promptForLater } from './generate.mjs';

// Export only: no new paid authoring call, file rewrite or mass-generation assertion.
// Reuse schema/spot instructions while replacing all model10-specific execution paragraphs.
export function model11AuthoringPrompt(inputs, street) {
  if (!inputs.spot.history || !['flop', 'later'].includes(street)) throw new Error('Model11 authoring requires a new-HU spot and flop/later scope');
  const old = newHuAuthoringContract(inputs), revised = [...old];
  if (!revised[0].startsWith('New-HU execution model 10:')) throw new Error('Authoring execution source changed; adapter update required');
  revised[0] = revised[0].replace('execution model 10:', 'execution model 11 (explicit opt-in evaluation only):');
  revised[2] = 'The balanced candidate belief is balanced-vs-balanced. Every earlier public action conditions its actor own realization by the exact contemporaneous computed/capped declared physical action probability, recomputed at that earlier prefix. Current fold/call uses blocker-aware equity, price, realization and the existing floor/ceiling; saved fold/call remains the explicit unavailable-equity fallback. Legal raises and betting mixtures still matter. Never condition on actual reference profiles, opponent hole cards, future cards or future history. Preserve every required action key and the full fixed node order.';
  revised[3] = 'Individual bluff-cap reduction remains provenance for the inherited defence ceiling. Only on new-HU rivers, an exact negative call-EV sign against known compatible effective support suppresses added MDF-floor calls. Unknown equity keeps the declared saved/capped fallback. Fixed reference opponents are actual evaluation opponents, never inputs to candidate belief. Zero-model-likelihood observations are explicit unresolved diagnostics. None of these checks prove equilibrium.';
  let prompt = street === 'flop' ? promptFor(inputs) : promptForLater(inputs);
  for (let index = 0; index < old.length; index++) {
    if (!prompt.includes(old[index])) throw new Error('Authoring source changed; explicit adapter update required');
    prompt = prompt.replace(old[index], revised[index]);
  }
  return { kind: 'model11-authoring-prompt-export-not-generation', street, prompt, promptIdentity: contentHash(prompt) };
}

export function evaluateModel11(inputs, flopArtifact, laterArtifact, plan) {
  const frozen = freezeSnapshot(plan);
  const fields = { simulation: ['mode', 'boardList', 'samples', 'cacheBatchSize', 'profiles', 'heroes'], balance: ['mode', 'requests', 'includeRows'], boards: ['mode', 'boardPlan', 'includeRows'] };
  if (!frozen || !fields[frozen.mode] || Object.keys(frozen).some(key => !fields[frozen.mode].includes(key))) throw new Error('Unknown model11 evaluation mode or plan field');
  if (frozen.mode === 'simulation') return simulateModel11(inputs, flopArtifact, laterArtifact, frozen);
  if (frozen.mode === 'balance') return balanceModel11(inputs, flopArtifact, laterArtifact, frozen);
  if (frozen.mode === 'boards') return auditModel11Boards(inputs, flopArtifact, laterArtifact, frozen);
  throw new Error('Explicit mode simulation, balance or boards required');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--spot', '--flop', '--later', '--plan', '--output'].includes(key) || !args[index + 1] || key in options) throw new Error('Usage: evaluate-model11.mjs --spot ID --flop FILE --later FILE --plan FILE --output NEW_FILE');
    options[key] = args[index + 1];
  }
  if (Object.keys(options).length !== 5) throw new Error('All five explicit arguments are required');
  const json = path => JSON.parse(readFileSync(path, 'utf8'));
  const started = performance.now();
  const result = evaluateModel11(loadInputs(options['--spot']), json(options['--flop']), json(options['--later']), json(options['--plan']));
  result.processDiagnostics = { elapsedMs: performance.now() - started, memoryAtReturn: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS };
  writeFileSync(options['--output'], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: options['--output'], kind: result.kind, executionIdentity: result.execution.identity, planIdentity: result.planIdentity }));
}
