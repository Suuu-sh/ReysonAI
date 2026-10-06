// Post-replay conditions copied exactly from the frozen same-source audit.
// Only result.kind and the distinct dual-source replay receipt differ. The old
// audit remains unchanged; no quality, coverage, all-board or review waiver.
import { expandedModel11Legality, validateModel11Balance, same, gateFail } from './model11-gate-contract.mjs';
import { checkModel11Balance } from './gate-model11.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { referencePolicyFor } from './policy.mjs';
import { simulate } from './simulation.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { openCompletionRepresentativeEvidence, persistCompletionRepresentativeBalance, readCompletionRepresentativeBalance } from './model11-completion-representative-store.mjs';
export function finishDualSourceQuality(inputs, flop, later, binding, saved, replay, freshEvidenceRoot, options, equivalence) {
  const plan = binding.plan, strictBinding = binding.strictBalance;
  const legality = expandedModel11Legality(inputs, flop, later, plan.boardList);
  const balancePlan = { ...plan, boardList: plan.boardList.filter(board => hasPostflopDeal(inputs, board.cards)) };
  if (!balancePlan.boardList.length) gateFail('Representative gate has no reachable board');
  const balance = checkModel11Balance(inputs, flop, later, { boardList: balancePlan.boardList, street: plan.street, authored: true });
  const balanceValidation = validateModel11Balance(balancePlan, strictBinding, balance);
  const balanceStore = openCompletionRepresentativeEvidence(freshEvidenceRoot, binding);
  const balanceEvidence = persistCompletionRepresentativeBalance(balanceStore, balance);
  const restoredBalance = readCompletionRepresentativeBalance(balanceStore, balanceEvidence);
  if (!same(restoredBalance, balance)) gateFail('Partitioned strict balance did not preserve the original aggregate');
  validateModel11Balance(balancePlan, strictBinding, restoredBalance);
  const sanity = simulate(inputs, referencePolicyFor(inputs.spot.tree), 12, null, { computedDefence: false, boardList: plan.boardList });
  const sanityExpected = balancePlan.boardList.length * 3 * 2;
  if (sanity.results.length !== sanityExpected || sanity.results.some(row => row.delta_bb.mean !== 0 || row.delta_bb.ci95.some(value => value !== 0))) gateFail('Reference-versus-reference sanity drifted or is incomplete');
  options.assertUnchanged();
  const complete = saved.counts.unresolvedCount === 0 && replay.counts.unresolvedCount === 0 && balanceValidation.complete;
  const qualityPass = complete && legality.checkedCombos > 0 && balanceValidation.errorCount === 0 && saved.counts.evaluatedCells > 0;
  return { kind: 'model11-dual-source-strict-balance-composite-behavior-representative-gate-result', version: 1, binding, bindingHash: contentHash(binding),
    status: !complete ? 'blocked-off-model-coverage' : !qualityPass ? 'completed-with-quality-errors' : plan.scope === 'full' ? 'representative-composite-numerical-gate-complete-unapproved' : 'diagnostic-complete-not-acceptance',
    acceptance: 'not-accepted; matching complete strict all-board evidence and independent review remain required',
    complete, fullScopePassed: plan.scope === 'full' && qualityPass, counts: saved.counts, ...legality,
    replay: equivalence,
    referenceSanity: { samplesPerCell: 12, cells: sanityExpected, zeroDrift: true, numericalHash: contentHash(sanity) },
    balance: balanceEvidence, warnings: [...saved.warnings, ...balanceValidation.warnings.map(f => `balance [${f.check}] ${f.node}: ${f.detail}`)],
    balanceBoardCounts: { requested: plan.boardList.length, evaluated: balancePlan.boardList.length, provedBaseUnreachable: plan.boardList.length - balancePlan.boardList.length },
    balancePrefixCounts: balanceValidation.prefixCounts, offModel: { simulationTrials: saved.counts.unresolvedCount, balanceStages: balanceValidation.offModelStages } };
}
