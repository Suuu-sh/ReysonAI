// Explicit research behavior completion. The balanced belief and its strict law never change.
import { createModel11Execution, validateOwnCombo } from './execution-model11.mjs';
import { Defence, comboId, replayDecision, isFacingNode, requiredEquity } from './defence.mjs';
import { handTier } from './model.mjs';
import { compileDeclaredPolicyLaw, sampleEffectiveAction } from './effective-action-law.mjs';
import { verifyZeroLikelihoodProof } from './model11-zero-proof.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';
export const MODEL11_OFFPATH_BEHAVIOR_VERSION = 1;
const fail = (status, message) => { throw new EffectiveReachError(status, message); };
const r2 = value => Math.round(value * 100) / 100;
const r6 = value => Math.round(value * 1e6) / 1e6;

// This instance is a saved-policy lookup only. Range-dependent behavior is forbidden.
class SavedBehavior extends Defence {
  reach() { fail('forbidden-completion-inference', 'Completion cannot reconstruct a posterior'); }
  context() { fail('forbidden-completion-inference', 'Completion cannot build an equity context'); }
  betting() { fail('forbidden-completion-inference', 'Completion cannot build range-dependent bluff caps'); }
  queryEquity() { fail('forbidden-completion-inference', 'Completion cannot query equity'); }
  queryEquities() { fail('forbidden-completion-inference', 'Completion cannot query equities'); }
  mix() { fail('forbidden-completion-inference', 'Completion cannot use computed defence'); }
  requirement() { fail('forbidden-completion-inference', 'Completion cannot infer a defence requirement'); }
  facts() { fail('forbidden-completion-inference', 'Completion cannot infer range facts'); }
  bettingFacts() { fail('forbidden-completion-inference', 'Completion cannot infer betting facts'); }
  summarize() { fail('forbidden-completion-inference', 'Completion cannot summarize a posterior'); }
  build() { fail('forbidden-completion-inference', 'Completion cannot build a posterior'); }
  buildBetting() { fail('forbidden-completion-inference', 'Completion cannot build betting ranges'); }
}
function geometricReroute(prefix, raw, tier, config, enabled) {
  const order = prefix.pending.observation.actions;
  const bigBet = prefix.pending.street === 'river' ? [...order].reverse().find(action => action.startsWith('bet')) : null;
  const allin = prefix.pending.observation.byAction.allin, maxRatio = config.river_allin_max_pot_ratio;
  if (!enabled || !bigBet || !allin || maxRatio == null || !(raw.allin > 0)) return raw;
  const ratio = r2(allin.pot - prefix.geometry.pot) / prefix.geometry.pot;
  if (!(ratio > maxRatio) && !['medium', 'draw'].includes(tier)) return raw;
  return { ...raw, allin: 0, [bigBet]: r6((raw[bigBet] ?? 0) + raw.allin) };
}
function geometricFacts(table) {
  const target = table.log.at(-1), prior = table.log.at(-2);
  if (!isFacingNode(target.node) || !prior || prior.street !== target.street || prior.seat === target.seat) return null;
  const wager = r2(table.pot - prior.pot);
  const call = Math.min(table.stacks[target.seat], r2(table.invested[prior.seat] - table.invested[target.seat]));
  const chips = requiredEquity({ potBefore: prior.pot, wager, call });
  return { potBefore: prior.pot, wager, call, finalPot: chips.finalPot, rake: chips.rake,
    required: chips.required, geometricMdfTarget: chips.mdf, status: 'public-chip-geometry-only' };
}

// The strict factory validates immutable source/artifact/belief/config contracts first.
// complete() also supports persisted certificates, but always replays their whole support.
export function createModel11BehaviorCompletion(inputs, flopArtifact, laterArtifact, options = {}) {
  const strict = createModel11Execution(inputs, flopArtifact, laterArtifact, options);
  const source = freezeSnapshot(inputs), flop = freezeSnapshot(flopArtifact.policy), later = freezeSnapshot(laterArtifact.policy);
  const saved = new SavedBehavior(source, flop, later, false);
  const behavior = freezeSnapshot({ kind: 'model11-saved-policy-exact-zero-completion', version: MODEL11_OFFPATH_BEHAVIOR_VERSION,
    activation: 'semantically-verified-whole-support-zero-and-current-public-ancestor',
    order: 'saved-lookup/deep-raise-fixed-rule; withRaise/effectiveMix; public-SPR-tier-reroute; full-label-law; physical-pooling',
    rerouteEnabled: options.bluffCap !== false, inference: 'unknown; strict-balanced-belief-is-not-recovered' });
  const descriptor = { kind: 'model11-composite-offpath-behavior-execution', version: MODEL11_OFFPATH_BEHAVIOR_VERSION,
    model: strict.identity.model, normalExecutionIdentity: strict.identity.identity, beliefIdentity: strict.belief.identity,
    behavior, behaviorIdentity: contentHash(behavior), artifactProvenanceIdentity: contentHash(strict.artifactProvenance),
    adoption: 'offline-opt-in-behavior-experiment; not original-strict-law-acceptance' };
  const identity = freezeSnapshot({ ...descriptor, identity: contentHash(descriptor) });
  const ownPrefix = (request, combo) => {
    const prefix = strict.prefix(request); validateOwnCombo(combo, prefix.board);
    if (!(saved.baseWeights(prefix.pending.seat)[comboId(...combo)] > 0)) fail('outside-base-support', 'Completion requires the actor own frozen base support');
    return prefix;
  };
  const complete = (request, combo, certificate) => {
    const prefix = ownPrefix(request, combo);
    // A hash/claimed zero is insufficient. No memo or cross-trial off-model flag bypasses replay.
    const verification = verifyZeroLikelihoodProof(strict, certificate, request);
    const table = replayDecision(source, prefix.board, prefix.path, strict.config), { node, observation, seat } = prefix.pending;
    const raw = saved.baseMix(table, prefix.board, node, combo), tier = handTier(combo, prefix.board);
    const mix = geometricReroute(prefix, raw, tier, strict.config, behavior.rerouteEnabled);
    const role = seat === strict.spot.ip ? 'ip' : 'oop';
    return compileDeclaredPolicyLaw(mix, strict.belief.seats[role].executor.nodeOrders[node], observation, {
      prefix, modelIdentity: strict.identity.model, beliefIdentity: strict.belief.identity, behaviorIdentity: identity.behaviorIdentity, compositeExecutionIdentity: identity.identity,
      kind: 'off-model-saved-policy-behavior-completion', beliefStatus: 'off-model-observed-action',
      ownRealization: 'unknown-after-zero-model-history', equity: 'unknown-off-model', fallback: 'saved-policy-public-geometry-only',
      exactRiverSign: 'unknown', zeroLikelihoodProof: certificate, zeroLikelihoodVerification: verification,
      facts: { geometry: geometricFacts(table), posterior: null, equity: null, rangeFloor: null, rangeCeiling: null,
        valueBluff: null, blockers: null, inferredMdfAdjustment: null, inferenceStatus: 'unknown-off-model' } });
  };
  const behaviorLaw = (request, combo) => {
    ownPrefix(request, combo);
    try { return strict.law(request, combo); }
    catch (error) {
      if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action' || !error.zeroLikelihoodProof) throw error;
      return complete(request, combo, error.zeroLikelihoodProof);
    }
  };
  return Object.freeze({ identity, behaviorIdentity: identity.behaviorIdentity, belief: strict.belief,
    spot: strict.spot, config: strict.config, artifactProvenance: strict.artifactProvenance,
    prefix: strict.prefix, law: strict.law, rangeState: strict.rangeState, requirementState: strict.requirementState,
    behaviorLaw, complete,
    sample(request, combo, random) { const law = behaviorLaw(request, combo); return { ...sampleEffectiveAction(law, random), law }; },
    sampleReference: strict.sampleReference,
    releaseBoardCaches() { strict.releaseBoardCaches(); saved.releaseBoardCaches(); }, cacheStats: strict.cacheStats });
}
