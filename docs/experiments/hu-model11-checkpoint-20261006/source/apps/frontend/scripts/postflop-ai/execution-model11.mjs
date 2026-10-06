// Explicit offline experiment. No legacy factory, browser view or global default imports this.
import { createEffectiveDefence } from './effective-reach.mjs';
import { balancedBeliefContract, referenceActionLaw, sampleEffectiveAction } from './effective-action-law.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';

export const MODEL11_EXECUTION_ADAPTER_VERSION = 2;
const fail = (status, message) => { throw new EffectiveReachError(status, message); };
export function validateOwnCombo(combo, board) {
  if (!Array.isArray(combo) || combo.length !== 2 || combo.some(card => !Number.isInteger(card) || card < 0 || card >= 52) ||
      new Set([...combo, ...board]).size !== board.length + 2) fail('invalid-private-combo', 'Expected only the actor own two unblocked cards');
}

// No actual profile, opponent cards, future board or engine table can be supplied to a decision.
// The only configurable belief is the exact balanced-vs-balanced contract, verified by the factory.
export function createModel11Execution(inputs, flopArtifact, laterArtifact, options = {}) {
  if (Object.keys(options).some(key => !['belief', 'bluffCap', 'cache'].includes(key))) fail('unsupported-executor-contract', 'Unknown model11 execution option');
  const model = createEffectiveDefence(inputs, flopArtifact, laterArtifact, { ...options, belief: options.belief ?? balancedBeliefContract() });
  const spot = freezeSnapshot(inputs.spot), config = freezeSnapshot(inputs.config);
  const descriptor = { kind: 'model11-explicit-numerical-adapter', version: MODEL11_EXECUTION_ADAPTER_VERSION,
    model: model.identity, beliefIdentity: model.belief.identity, actionOrder: 'full-node-order',
    referenceScope: 'actual-only; never candidate-belief', adoption: 'offline-experiment; not accepted or published' };
  const identity = freezeSnapshot({ ...descriptor, identity: contentHash(descriptor) });
  return Object.freeze({ identity, spot, config, belief: model.belief, artifactProvenance: model.artifactProvenance,
    prefix: model.prefix, law: model.law, rangeState: model.rangeState, requirementState: model.requirementState,
    prepareRequest: model.prepareRequest,
    sample(request, ownCombo, random) {
      const law = model.law(request, ownCombo);
      return { ...sampleEffectiveAction(law, random), law };
    },
    // This path does not build candidate reach. Keep reference behavior even on off-model prefixes.
    sampleReference(request, ownCombo, descriptor, random) {
      const prefix = model.prefix(request); validateOwnCombo(ownCombo, prefix.board);
      const law = referenceActionLaw(prefix, ownCombo, descriptor);
      return { ...sampleEffectiveAction(law, random), law };
    },
    releaseBoardCaches: model.releaseBoardCaches, cacheStats: model.cacheStats });
}
