// Only the deterministic enumerating gate may use a validated certificate to skip
// a model-unreachable history. Actual-reference observations remain off-model errors.
import { contentHash, canonicalJson, freezeSnapshot } from './effective-law-identity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = message => { throw new EffectiveReachError('invalid-zero-likelihood-proof', message); };
const signOf = value => value === 2 ? 'not-requested' : value === 3 ? 'unknown' : value;
export const ZERO_LIKELIHOOD_PROOF_VERSION = 1;

export function makeZeroLikelihoodProof({ modelIdentity, belief, artifactProvenance, request, prefix, actor, action, vector, beforeWeights, beforeTotal, statusNames }) {
  const actionIndex = vector.physicalActions.indexOf(action), rows = [];
  if (actionIndex < 0 || prefix.pending.seat !== actor) fail('Zero witness actor/action mismatch');
  for (let id = 0; id < beforeWeights.length; id++) if (beforeWeights[id] > 0) rows.push({ comboId: id,
    beforeWeight: beforeWeights[id], physicalMass: vector.physical[actionIndex][id], afterWeight: 0,
    equity: statusNames[vector.equityStatus[id]], fallback: [2, 3, 4].includes(vector.equityStatus[id]) ? 'saved-capped' : null, exactRiverSign: signOf(vector.exactSign[id]) });
  const proof = { kind: 'model11-exact-zero-historical-action', version: ZERO_LIKELIHOOD_PROOF_VERSION,
    request, prefix, actor, physicalAction: action, modelIdentity, beliefIdentity: belief.identity,
    executorIdentity: belief.seats[vector.actorRole].executor.identity,
    artifactProvenanceIdentity: contentHash(artifactProvenance), actionOrder: vector.actions,
    physicalActionOrder: vector.physicalActions, fullVectorLength: beforeWeights.length,
    supportEnumeration: 'every-positive-own-realization-combo-at-this-prefix-in-ascending-combo-id',
    beforeTotal, afterTotal: 0, underflow: false, lawScope: 'declared-continuous-policy-law; not finite-RNG-grid probability', rows };
  return freezeSnapshot({ ...proof, proofHash: contentHash(proof) });
}

export function assertZeroProofAncestor(certificate, currentPrefix) {
  const earlier = certificate.prefix, streets = ['flop', 'turn', 'river'];
  const streetIndex = streets.indexOf(earlier?.pending?.street);
  if (streetIndex < 0 || !currentPrefix || earlier.decisionCount >= currentPrefix.decisionCount ||
      !same(earlier.board, currentPrefix.board.slice(0, earlier.board.length))) fail('Zero certificate is not an earlier revealed-board prefix of this gate request');
  for (let i = 0; i < streetIndex; i++) if (!same(earlier.path[streets[i]] ?? [], currentPrefix.path[streets[i]] ?? [])) fail('Zero certificate belongs to a different earlier-street history');
  const before = earlier.path[streets[streetIndex]] ?? [], target = currentPrefix.path[streets[streetIndex]] ?? [];
  if (!same(target.slice(0, before.length), before) || target[before.length] !== certificate.physicalAction) fail('Gate request does not descend from the certified zero physical action');
  return true;
}

// Reconstruct the earliest prefix from the frozen source. This checks complete
// support, not a sample or a claimed zero total, and rechecks each current law.
// Successful replay here also rules out an earlier zero in either actor's history.
export function verifyZeroLikelihoodProof(execution, certificate, currentRequest) {
  if (!certificate || certificate.kind !== 'model11-exact-zero-historical-action' || certificate.version !== ZERO_LIKELIHOOD_PROOF_VERSION) fail('Missing typed exact-zero certificate');
  const { proofHash, ...body } = certificate;
  if (proofHash !== contentHash(body) || !same(body.modelIdentity, execution.identity.model) || body.beliefIdentity !== execution.belief.identity ||
      body.artifactProvenanceIdentity !== contentHash(execution.artifactProvenance) || body.underflow !== false || body.afterTotal !== 0 || body.fullVectorLength !== 52 * 52 ||
      body.lawScope !== 'declared-continuous-policy-law; not finite-RNG-grid probability' || body.supportEnumeration !== 'every-positive-own-realization-combo-at-this-prefix-in-ascending-combo-id' || !Array.isArray(body.rows) || !body.rows.length) fail('Invalid proof identity or accounting');
  assertZeroProofAncestor(certificate, execution.prefix(currentRequest));
  const prefix = execution.prefix(body.request), role = prefix.pending.seat === execution.spot.ip ? 'ip' : 'oop';
  if (!same(prefix, body.prefix) || body.actor !== prefix.pending.seat || body.executorIdentity !== execution.belief.seats[role].executor.identity ||
      !same(body.actionOrder, execution.belief.seats[role].executor.nodeOrders[prefix.pending.node]) ||
      !same(body.physicalActionOrder, prefix.pending.observation.classes.map(group => group.action)) || !body.physicalActionOrder.includes(body.physicalAction)) fail('Proof public prefix/actor/action order differs');
  const state = execution.rangeState(body.request, body.actor), expectedIds = [];
  for (let id = 0; id < state.weights.length; id++) if (state.weights[id] > 0) expectedIds.push(id);
  if (!same(expectedIds, body.rows.map(row => row.comboId)) || body.beforeTotal !== state.total || !(state.total > 0)) fail('Certificate omits or changes actor support');
  for (const row of body.rows) {
    const law = execution.law(body.request, [Math.floor(row.comboId / 52), row.comboId % 52]);
    if (row.beforeWeight !== state.weights[row.comboId] || !Number.isFinite(row.beforeWeight) || !(row.beforeWeight > 0) ||
        row.physicalMass !== law.physicalMass[body.physicalAction] || row.physicalMass !== 0 || row.afterWeight !== 0 || row.beforeWeight * (row.physicalMass / 100) !== 0 ||
        row.equity !== law.provenance.equity || row.fallback !== law.provenance.fallback || row.exactRiverSign !== law.provenance.exactRiverSign || !same(law.actions, body.actionOrder)) fail('Contemporaneous physical law or zero product differs');
  }
  return { eligible: true, proofHash,
    reason: 'complete-exact-zero-declared-actor-law-support; explicit-fallback-provenance-retained; no-positive-factor-underflow' };
}
