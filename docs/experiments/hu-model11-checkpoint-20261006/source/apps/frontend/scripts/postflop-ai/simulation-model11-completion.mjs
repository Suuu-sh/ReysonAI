// Separate explicit behavior experiment. Strict simulation and every acceptance gate are untouched.
import { createModel11BehaviorCompletion } from './offpath-behavior-model11.mjs';
import { playModel11Hand, summarizeModel11Trials } from './simulation-model11.mjs';
import { playHand, dealRunout, PROFILES } from './simulation.mjs';
import { referencePolicyFor } from './policy.mjs';
import { referenceLaterPolicy } from './later-policy.mjs';
import { makeSampler, seatRange, samplePair } from './inputs.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { seedFor, seededRandom } from '../lib/equity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { freezeSnapshot, contentHash } from './effective-law-identity.mjs';
const fail = message => { throw new EffectiveReachError('invalid-simulation-completion-contract', message); };

export function summarizeModel11CompletionTrials({ attempted, candidate, baseline, unresolved, trials }) {
  const strictAccounting = summarizeModel11Trials({ attempted, candidate, baseline, unresolved });
  if (!Array.isArray(trials) || trials.length !== attempted || trials.some((trial, index) => trial.index !== index ||
      !Array.isArray(trial.completionDecisions) || !['complete', 'unresolved-off-model'].includes(trial.status)) ||
      trials.filter(trial => trial.status === 'complete').length !== candidate.length) fail('Invalid per-trial completion accounting');
  const stopped = trials.filter(trial => trial.status === 'unresolved-off-model').map(trial => trial.index);
  if (unresolved.some(row => !Number.isInteger(row.index)) || new Set(unresolved.map(row => row.index)).size !== unresolved.length ||
      JSON.stringify(stopped) !== JSON.stringify(unresolved.map(row => row.index))) fail('Unresolved trial index references differ');
  let completedIndex = 0;
  for (const trial of trials) {
    if (trial.status === 'complete' && (trial.candidateReturn !== candidate[completedIndex] || trial.baselineReturn !== baseline[completedIndex++])) fail('All completed trial returns must contribute to paired EV');
    for (const decision of trial.completionDecisions) if (!decision.zeroLikelihoodProof ||
        decision.verification?.eligible !== true || decision.verification.proofHash !== decision.zeroLikelihoodProof.proofHash ||
        decision.originalStatus !== 'off-model-observed-action' || !Number.isFinite(decision.random) || decision.random < 0 || decision.random >= 1 ||
        decision.lawHash !== contentHash(decision.law)) fail('Completion decision lacks validated original off-model evidence');
  }
  const decisions = trials.flatMap(trial => trial.completionDecisions);
  return { ...strictAccounting, status: unresolved.length ? 'unresolved-off-model' : 'complete-composite-behavior',
    completedByPolicy: trials.filter(trial => trial.status === 'complete' && trial.completionDecisions.length > 0).length,
    offModelTrials: trials.filter(trial => trial.completionDecisions.length || trial.status === 'unresolved-off-model').length,
    offModelOccurrences: decisions.length + unresolved.length, completionDecisions: decisions.length,
    validatedProofs: decisions.length, uniqueProofs: new Set(decisions.map(row => row.zeroLikelihoodProof.proofHash)).size,
    unresolvedCount: unresolved.length, trials };
}

export function simulateModel11Completion(inputs, flopArtifact, laterArtifact, options = {}) {
  if (!options || Object.keys(options).some(key => !['boardList', 'samples', 'cacheBatchSize', 'profiles', 'heroes', 'executionOptions'].includes(key))) fail('Unknown completion simulation option');
  const { boardList, samples, cacheBatchSize = 1, profiles = PROFILES, heroes, executionOptions = {} } = options;
  if (!Array.isArray(boardList) || !boardList.length || !Number.isInteger(samples) || samples < 1 || !Number.isInteger(cacheBatchSize) || cacheBatchSize < 1) fail('Explicit boards and positive samples/cache batch required');
  const execution = createModel11BehaviorCompletion(inputs, flopArtifact, laterArtifact, executionOptions);
  const frozen = freezeSnapshot(inputs), plan = freezeSnapshot(boardList), { spot, config } = execution;
  const selectedProfiles = freezeSnapshot(profiles), selectedHeroes = freezeSnapshot(heroes ?? [spot.ip, spot.oop]);
  if (new Set(plan.map(board => board.id)).size !== plan.length || !Array.isArray(selectedProfiles) || !selectedProfiles.length ||
      new Set(selectedProfiles).size !== selectedProfiles.length || selectedProfiles.some(profile => !PROFILES.includes(profile)) ||
      !Array.isArray(selectedHeroes) || !selectedHeroes.length || new Set(selectedHeroes).size !== selectedHeroes.length ||
      selectedHeroes.some(hero => ![spot.ip, spot.oop].includes(hero))) fail('Invalid boards/profiles/heroes');
  const started = performance.now(), results = [], referencePolicy = referencePolicyFor(spot.tree), laterPolicy = referenceLaterPolicy();
  try {
    for (const board of plan) {
      execution.prefix({ board: board.cards, path: { flop: [] } });
      if (board.cards.length !== 3 || typeof board.id !== 'string' || !board.id) fail('Invalid explicit flop');
      execution.releaseBoardCaches();
      if (!hasPostflopDeal(frozen, board.cards)) { results.push({ board: board.id, status: 'unreachable-base-deal' }); continue; }
      const ip = makeSampler(seatRange(frozen, spot.ip, board.cards)), oop = makeSampler(seatRange(frozen, spot.oop, board.cards));
      for (const profile of selectedProfiles) for (const hero of selectedHeroes) {
        const random = seededRandom(seedFor(`${config.seed}|${board.id}|${profile}|${hero}`));
        const candidate = [], baseline = [], unresolved = [], trials = [];
        for (let index = 0; index < samples; index++) {
          if (index % cacheBatchSize === 0) execution.releaseBoardCaches();
          const hands = samplePair(ip, oop, random, spot), runout = dealRunout(hands, board.cards, random);
          const randoms = Array.from({ length: 24 }, () => random());
          const base = playHand({ hands, flop: board.cards, runout, hero, policy: referencePolicy, laterPolicy, profile, randoms, spot });
          // Evidence is scoped to this trial, never used to alter another trial's execution.
          const completionDecisions = [];
          const onDecision = row => {
            const provenance = row.law.provenance;
            if (provenance.kind !== 'off-model-saved-policy-behavior-completion') return;
            completionDecisions.push({ request: row.request, seat: row.seat, node: row.node, random: row.random, label: row.label, action: row.action,
              law: row.law, lawHash: contentHash(row.law),
              originalStatus: provenance.beliefStatus, zeroLikelihoodProof: provenance.zeroLikelihoodProof,
              verification: provenance.zeroLikelihoodVerification, behaviorIdentity: provenance.behaviorIdentity, compositeExecutionIdentity: provenance.compositeExecutionIdentity });
          };
          let trial;
          try { trial = playModel11Hand({ execution, hands, flop: board.cards, runout, hero, profile, randoms, onDecision }); }
          catch (error) {
            if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
            unresolved.push({ index, status: error.status, message: error.message, decision: error.decision, zeroLikelihoodProof: error.zeroLikelihoodProof ?? null });
            trials.push({ index, status: 'unresolved-off-model', baselineReturn: base.returns[hero], completionDecisions }); continue;
          }
          candidate.push(trial.returns[hero]); baseline.push(base.returns[hero]);
          trials.push({ index, status: 'complete', candidateReturn: trial.returns[hero], baselineReturn: base.returns[hero], completionDecisions });
        }
        results.push({ board: board.id, split: board.split ?? null, hero, opponent: profile,
          ...summarizeModel11CompletionTrials({ attempted: samples, candidate, baseline, unresolved, trials }) });
      }
    }
    const fields = ['attempted', 'completed', 'completedByPolicy', 'offModelTrials', 'offModelOccurrences', 'completionDecisions', 'validatedProofs', 'unresolvedCount'];
    const counts = Object.fromEntries(fields.map(field => [field, results.reduce((n, row) => n + (row[field] ?? 0), 0)]));
    counts.uniqueProofs = new Set(results.flatMap(row => (row.trials ?? []).flatMap(trial => trial.completionDecisions.map(decision => decision.zeroLikelihoodProof.proofHash)))).size;
    return { kind: 'model11-composite-behavior-simulation-not-strict-acceptance', version: 1, execution: execution.identity,
      artifactProvenance: execution.artifactProvenance, belief: execution.belief,
      acceptance: 'not-original-strict-law-acceptance; no-gate-threshold-or-belief-recovery-claim',
      planIdentity: contentHash({ boards: plan, samples, seed: config.seed, cacheBatchSize, profiles: selectedProfiles, heroes: selectedHeroes, execution: execution.identity.identity }),
      samples_per_board_profile_seat: samples, seed: config.seed, profiles: selectedProfiles, heroes: selectedHeroes, counts,
      diagnostics: { elapsedMs: performance.now() - started, cache: execution.cacheStats(), memoryAtReturn: process.memoryUsage(),
        processLifetimeMaxRssKiB: process.resourceUsage().maxRSS, memoryScope: 'process-lifetime-high-water; heap-limit-is-not-RSS-limit' }, results };
  } finally { execution.releaseBoardCaches(); }
}
