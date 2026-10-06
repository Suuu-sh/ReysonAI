// Declared continuous policy law and finite deterministic execution are distinct contracts.
import { choose, opponentMix, NODES } from './policy.mjs';
import { referenceLaterMix } from './later-policy.mjs';
import { LATER_NODES } from './later-tree.mjs';
import { playedActionMass } from './observable-actions.mjs';
import { contentHash, freezeSnapshot, canonicalJson, assertJsonCompatible } from './effective-law-identity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
export const NEW_HU_EFFECTIVE_MODEL_VERSION = 11;
export const DECLARED_POLICY_LAW_VERSION = 1;
export const NUMERIC_SCHEDULE_VERSION = 1;
export const SAMPLER_CONTRACT_VERSION = 1;
const nodeOrders = { ...NODES, ...LATER_NODES };
const contract = value => freezeSnapshot({ ...value, identity: contentHash(value) });
export function balancedExecutor({ order = 'full-node-order' } = {}) {
  if (order !== 'full-node-order') throw new EffectiveReachError('unsupported-executor-contract', 'Filtered Agent action orders require a separate adapter');
  return contract({ kind: 'balanced-computed', version: 11, order, nodeOrders, fallback: 'saved-capped-on-unavailable-equity',
    belief: 'balanced-vs-balanced', sampler: 'choose-sequential-subtract-final-label-fallback-v1' });
}
export function referenceExecutor(profile = 'standard') {
  if (!['standard','passive','aggressive'].includes(profile)) throw new EffectiveReachError('unsupported-executor-contract', 'Unknown reference profile');
  return contract({ kind: 'reference', version: 1, profile, order: 'full-node-order', nodeOrders,
    fallback: 'existing-reference-deeper-raise', sampler: 'choose-sequential-subtract-final-label-fallback-v1' });
}
export function balancedBeliefContract() {
  return contract({ kind: 'two-live-product-prior', version: 1,
    seats: { ip: { executor: balancedExecutor(), knowledge: 'assumed' }, oop: { executor: balancedExecutor(), knowledge: 'assumed' } },
    scope: 'balanced-vs-balanced-counterfactual; hidden-reference-profiles-excluded' });
}
export function compileDeclaredPolicyLaw(rawMix, actions, observation, provenance = {}) {
  if (!observation || actions.some(action => !observation.byAction[action])) throw new EffectiveReachError('invalid-executor-contract', 'Action order does not match public geometry');
  const raw = Object.fromEntries(actions.map(action => [action, rawMix[action]]));
  let labels;
  try { labels = playedActionMass(raw, actions); } catch (error) { throw new EffectiveReachError('invalid-executor-contract', error.message); }
  const physical = Object.fromEntries(observation.classes.map(group => [group.action, group.aliases.reduce((sum, action) => sum + (labels[action] ?? 0), 0)]));
  return freezeSnapshot({ rawMix: raw, actions, labelMass: labels, physicalMass: physical,
    classes: observation.classes.map(group => ({ action: group.action, aliases: group.aliases, key: group.key, allIn: group.allIn })),
    lawVersion: DECLARED_POLICY_LAW_VERSION, samplerVersion: SAMPLER_CONTRACT_VERSION,
    equalityClaim: 'declared-continuous-policy-law; not finite-RNG-grid probability', provenance });
}
export function sampleEffectiveAction(law, random) {
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new EffectiveReachError('invalid-random-value', 'Expected a random value in [0,1)');
  const label = choose(law.rawMix, random, law.actions);
  const group = law.classes.find(item => item.aliases.includes(label));
  if (!group) throw new EffectiveReachError('invalid-executor-contract', 'Sampled label has no physical class');
  return { label, action: group.action };
}
// Harness-only actual reference adapter. Never supplied as the balanced candidate belief.
export function referenceActionLaw(prefix, combo, descriptor) {
  let verified;
  try {
    assertJsonCompatible(descriptor, 'referenceDescriptor');
    verified = referenceExecutor(descriptor?.profile);
    if (canonicalJson(descriptor) !== canonicalJson(verified)) throw new Error('Reference descriptor content does not match its identity');
  } catch (failure) { throw new EffectiveReachError('invalid-executor-contract', failure.message); }
  // A JSON-reloaded equivalent is safe; supplied mutable content/order is never used after verification.
  const { node, line, observation, street } = prefix.pending;
  const raw = street === 'flop' ? opponentMix(node, combo, prefix.board, verified.profile)
    : referenceLaterMix(node, combo, prefix.board, line, verified.profile);
  return compileDeclaredPolicyLaw(raw, verified.nodeOrders[node], observation, { executor: verified.identity, kind: 'actual-reference-harness-only' });
}
