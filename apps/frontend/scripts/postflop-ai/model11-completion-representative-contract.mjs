// Explicit composite behavior evidence; never a strict simulation-report adapter.
import { createModel11BehaviorCompletion } from './offpath-behavior-model11.mjs';
import { model11GateBinding } from './model11-gate-drivers.mjs';
import { summarizeModel11Trials } from './simulation-model11.mjs';
import { sampleEffectiveAction } from './effective-action-law.mjs';
import { exactKeys, gateFail, same } from './model11-gate-contract.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';
export const COMPLETION_REPRESENTATIVE_VERSION = 1;
export const COMPLETION_COUNT_FIELDS = ['attempted', 'completed', 'completedByPolicy', 'offModelTrials', 'offModelOccurrences', 'completionDecisions', 'validatedProofs', 'unresolvedCount'];
export function model11CompletionRepresentativeBinding(inputs, flop, later, plan, source, files) {
  if (plan.kind !== 'representative') gateFail('Completion requires the explicit representative plan');
  const strictBalance = model11GateBinding(inputs, flop, later, plan, source.strictBalance, files);
  const execution = createModel11BehaviorCompletion(inputs, flop, later);
  try {
    if (execution.identity.normalExecutionIdentity !== strictBalance.execution.identity || !same(execution.belief, strictBalance.belief) || !same(execution.artifactProvenance, strictBalance.artifactProvenance)) gateFail('Strict balance/composite behavior pairing differs');
    return freezeSnapshot({ kind: 'model11-strict-balance-composite-behavior-representative-binding', version: 1,
      spot: inputs.spot.id, sourceFingerprint: inputs.fingerprint, source, files, plan, planIdentity: contentHash(plan),
      strictBalance, compositeExecution: execution.identity, behaviorPolicyIdentity: execution.behaviorIdentity,
      belief: execution.belief, artifactProvenance: execution.artifactProvenance });
  } finally { execution.releaseBoardCaches(); }
}
export function completionRepresentativeCells(inputs, plan) {
  if (plan.kind !== 'representative') gateFail('Representative cells required');
  return plan.boardList.flatMap(board => plan.profiles.flatMap(opponent => plan.heroes.map(hero => ({ board: board.id, split: board.split ?? null, opponent, hero,
    samples: plan.samples, seed: plan.seed, cacheBatchSize: plan.cacheBatchSize }))));
}
export function compactCompletionDecision(row, ownCombo, randomIndex, putProof) {
  const { zeroLikelihoodProof: proof, zeroLikelihoodVerification: verification, ...provenance } = row.law.provenance;
  if (!proof || verification?.eligible !== true || verification.proofHash !== proof.proofHash) gateFail('Unproven completion cannot enter evidence');
  putProof(proof);
  return { request: row.request, seat: row.seat, node: row.node, ownCombo: [...ownCombo], randomIndex, random: row.random,
    label: row.label, action: row.action, law: { ...row.law, provenance }, lawHash: contentHash(row.law),
    originalStatus: 'off-model-observed-action', proofHash: proof.proofHash, verification,
    behaviorPolicyIdentity: provenance.behaviorIdentity, compositeExecutionIdentity: provenance.compositeExecutionIdentity };
}
export function rehydrateCompletionDecision(decision, proof) {
  return { ...decision.law, provenance: { ...decision.law.provenance, zeroLikelihoodProof: proof, zeroLikelihoodVerification: decision.verification } };
}
export function validateCompletionRepresentativeDecision(execution, binding, cell, decision, readProof) {
  if (!exactKeys(decision, ['request', 'seat', 'node', 'ownCombo', 'randomIndex', 'random', 'label', 'action', 'law', 'lawHash', 'originalStatus', 'proofHash', 'verification', 'behaviorPolicyIdentity', 'compositeExecutionIdentity']) ||
      decision.originalStatus !== 'off-model-observed-action' || decision.seat !== cell.hero ||
      !Number.isSafeInteger(decision.randomIndex) || decision.randomIndex < 0 || decision.randomIndex >= 24 ||
      !Number.isFinite(decision.random) || decision.random < 0 || decision.random >= 1 ||
      decision.behaviorPolicyIdentity !== binding.behaviorPolicyIdentity || decision.compositeExecutionIdentity !== binding.compositeExecution.identity ||
      !/^[a-f0-9]{64}$/.test(decision.proofHash) || !decision.law?.provenance ||
      'zeroLikelihoodProof' in decision.law.provenance || 'zeroLikelihoodVerification' in decision.law.provenance) gateFail('Malformed/stale completion event');
  const proof = readProof(decision.proofHash), law = rehydrateCompletionDecision(decision, proof);
  const prefix = execution.prefix(decision.request);
  if (prefix.pending.seat !== decision.seat || prefix.pending.node !== decision.node ||
      !same(prefix.board.slice(0, 3), [...(binding.plan.boardList.find(board => board.id === cell.board)?.cards ?? [])].sort((a, b) => b - a)) ||
      contentHash(law) !== decision.lawHash || proof.proofHash !== decision.proofHash) gateFail('Completion event public prefix/law/proof differs');
  // complete() checks own support + current ancestor and replays every proof row. No
  // self-hash, saved eligible flag, cross-binding memo or recovered posterior suffices.
  const verifiedLaw = execution.complete(decision.request, decision.ownCombo, proof);
  if (!same(verifiedLaw, law) || !same(sampleEffectiveAction(verifiedLaw, decision.random), { label: decision.label, action: decision.action })) gateFail('Completion law or sequential sample differs');
  return proof.proofHash;
}
export function completionCellAccumulator() {
  return { candidate: [], baseline: [], unresolved: [], completedByPolicy: 0, offModelTrials: 0, offModelOccurrences: 0, completionDecisions: 0, proofHashes: new Set() };
}
export function accountCompletionRepresentativeTrial(acc, trial, index, samples) {
  const complete = trial?.status === 'complete', unresolved = trial?.status === 'unresolved-off-model';
  if ((!complete && !unresolved) || !exactKeys(trial, ['index', 'status', ...(complete ? ['candidateReturn'] : ['unresolved']), 'baselineReturn', 'completionDecisions']) ||
      trial.index !== index || index >= samples || !Number.isFinite(trial.baselineReturn) || !Array.isArray(trial.completionDecisions) ||
      trial.completionDecisions.some((event, i, events) => i > 0 && event.randomIndex <= events[i - 1].randomIndex)) gateFail('Missing, duplicate, reordered or malformed trial');
  if (complete) {
    if (!Number.isFinite(trial.candidateReturn)) gateFail('Completed paired return is not finite');
    acc.candidate.push(trial.candidateReturn); acc.baseline.push(trial.baselineReturn);
    if (trial.completionDecisions.length) acc.completedByPolicy++;
  } else {
    const stopped = trial.unresolved;
    if (!exactKeys(stopped, ['index', 'status', 'message', 'decision', 'zeroLikelihoodProof']) || stopped.index !== index || stopped.status !== 'off-model-observed-action' ||
        typeof stopped.message !== 'string' || !stopped.decision?.request || !Number.isSafeInteger(stopped.decision.randomIndex) || stopped.decision.randomIndex < 0 || stopped.decision.randomIndex >= 24) gateFail('Stopped trial lacks original typed pending evidence');
    acc.unresolved.push(stopped);
  }
  const n = trial.completionDecisions.length;
  if (n || unresolved) acc.offModelTrials++;
  acc.offModelOccurrences += n + (unresolved ? 1 : 0); acc.completionDecisions += n;
  for (const event of trial.completionDecisions) acc.proofHashes.add(event.proofHash);
}
export function completionRepresentativeCellSummary(cell, acc) {
  return { board: cell.board, split: cell.split, hero: cell.hero, opponent: cell.opponent,
    ...summarizeModel11Trials({ attempted: cell.samples, candidate: acc.candidate, baseline: acc.baseline, unresolved: acc.unresolved }),
    status: acc.unresolved.length ? 'unresolved-off-model' : 'complete-composite-behavior', completedByPolicy: acc.completedByPolicy,
    offModelTrials: acc.offModelTrials, offModelOccurrences: acc.offModelOccurrences, completionDecisions: acc.completionDecisions,
    validatedProofs: acc.completionDecisions, uniqueProofs: acc.proofHashes.size, unresolvedCount: acc.unresolved.length };
}
