// New explicit representative composite behavior gate; strict/all-board drivers stay frozen.
import { createModel11BehaviorCompletion } from './offpath-behavior-model11.mjs';
import { playModel11Hand } from './simulation-model11.mjs';
import { playHand, dealRunout, simulate } from './simulation.mjs';
import { referencePolicyFor } from './policy.mjs';
import { referenceLaterPolicy } from './later-policy.mjs';
import { makeSampler, seatRange, samplePair } from './inputs.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { seedFor, seededRandom } from '../lib/equity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { checkModel11Balance } from './gate-model11.mjs';
import { expandedModel11Legality, validateModel11Balance, exactKeys, gateFail, same } from './model11-gate-contract.mjs';
import { completionRepresentativeCells, compactCompletionDecision, validateCompletionRepresentativeDecision, completionCellAccumulator,
  accountCompletionRepresentativeTrial, completionRepresentativeCellSummary, COMPLETION_COUNT_FIELDS } from './model11-completion-representative-contract.mjs';
import { openCompletionRepresentativeEvidence, persistCompletionRepresentativeBalance, readCompletionRepresentativeBalance } from './model11-completion-representative-store.mjs';

export function produceCompletionRepresentativeCell(inputs, flop, later, binding, store, index, cell) {
  const board = binding.plan.boardList.find(item => item.id === cell.board), bindingHash = contentHash(binding), cellIdentity = contentHash(cell);
  if (!hasPostflopDeal(inputs, board.cards)) return { kind: 'model11-completion-representative-cell', version: 1, bindingHash, cell, cellIdentity,
    unreachable: true, row: { board: board.id, status: 'unreachable-base-deal' }, chunks: [], proofs: [] };
  const execution = createModel11BehaviorCompletion(inputs, flop, later), acc = completionCellAccumulator(), stream = store.beginCell(index, cell);
  const ip = makeSampler(seatRange(inputs, inputs.spot.ip, board.cards)), oop = makeSampler(seatRange(inputs, inputs.spot.oop, board.cards));
  const random = seededRandom(seedFor(`${inputs.config.seed}|${board.id}|${cell.opponent}|${cell.hero}`));
  const reference = referencePolicyFor(inputs.spot.tree), referenceLater = referenceLaterPolicy();
  try {
    for (let trialIndex = 0; trialIndex < cell.samples; trialIndex++) {
      if (trialIndex % cell.cacheBatchSize === 0) execution.releaseBoardCaches();
      const hands = samplePair(ip, oop, random, inputs.spot), runout = dealRunout(hands, board.cards, random);
      const randoms = Array.from({ length: 24 }, () => random());
      const baseline = playHand({ hands, flop: board.cards, runout, hero: cell.hero, policy: reference, laterPolicy: referenceLater, profile: cell.opponent, randoms, spot: inputs.spot });
      const completionDecisions = []; let randomIndex = 0, result, failure;
      try {
        result = playModel11Hand({ execution, hands, flop: board.cards, runout, hero: cell.hero, profile: cell.opponent, randoms,
          onDecision: row => {
            const at = randomIndex++;
            if (row.law.provenance.kind === 'off-model-saved-policy-behavior-completion') completionDecisions.push(compactCompletionDecision(row, hands[row.seat], at, store.putProof));
          } });
      } catch (error) {
        if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
        failure = { index: trialIndex, status: error.status, message: error.message, decision: error.decision, zeroLikelihoodProof: error.zeroLikelihoodProof ?? null };
      }
      const trial = { index: trialIndex, status: failure ? 'unresolved-off-model' : 'complete',
        ...(failure ? { unresolved: failure } : { candidateReturn: result.returns[cell.hero] }), baselineReturn: baseline.returns[cell.hero], completionDecisions };
      accountCompletionRepresentativeTrial(acc, trial, trialIndex, cell.samples); stream.append(trial);
    }
    const chunks = stream.finish(), proofs = [...acc.proofHashes].sort().map(hash => store.record(`${hash}.proof.json`));
    return { kind: 'model11-completion-representative-cell', version: 1, bindingHash, cell, cellIdentity,
      unreachable: false, row: completionRepresentativeCellSummary(cell, acc), chunks, proofs };
  } finally { execution.releaseBoardCaches(); }
}

export function validateCompletionRepresentativeCell(inputs, flop, later, binding, store, expectedCell, saved) {
  if (!exactKeys(saved, ['kind', 'version', 'bindingHash', 'cell', 'cellIdentity', 'unreachable', 'row', 'chunks', 'proofs']) ||
      saved.kind !== 'model11-completion-representative-cell' || saved.version !== 1 || saved.bindingHash !== contentHash(binding) ||
      !same(saved.cell, expectedCell) || saved.cellIdentity !== contentHash(expectedCell) || !Array.isArray(saved.chunks) || !Array.isArray(saved.proofs)) gateFail('Stale/malformed composite behavior cell marker');
  const board = binding.plan.boardList.find(item => item.id === expectedCell.board);
  if (!hasPostflopDeal(inputs, board.cards)) {
    if (saved.unreachable !== true || saved.chunks.length || saved.proofs.length || !same(saved.row, { board: board.id, status: 'unreachable-base-deal' })) gateFail('Base-unreachable composite cell lacks exact support proof');
    return saved;
  }
  if (saved.unreachable !== false || !saved.chunks.length) gateFail('Reachable cell has missing trial evidence');
  const acc = completionCellAccumulator(); let next = 0, execution = null;
  const readProof = hash => {
    const expected = saved.proofs.find(record => record.path === `${hash}.proof.json`);
    if (!expected || !same(store.record(expected.path), expected)) gateFail('Missing/tampered completion proof file');
    return store.readProof(hash);
  };
  try {
    for (const ref of saved.chunks) {
      if (!exactKeys(ref, ['path', 'bytes', 'sha256', 'startIndex', 'count', 'trialHash']) || ref.startIndex !== next || !Number.isSafeInteger(ref.count) || ref.count < 1 ||
          ref.count > expectedCell.cacheBatchSize || next + ref.count > expectedCell.samples) gateFail('Incomplete/duplicate/reordered trial chunks');
      const { startIndex, count, trialHash, ...record } = ref, chunk = store.read(ref.path, record);
      if (!exactKeys(chunk, ['kind', 'version', 'bindingHash', 'cellIdentity', 'startIndex', 'trials']) ||
          chunk.kind !== 'model11-completion-representative-trial-chunk' || chunk.version !== 1 || chunk.bindingHash !== saved.bindingHash ||
          chunk.cellIdentity !== saved.cellIdentity || chunk.startIndex !== next || !Array.isArray(chunk.trials) || chunk.trials.length !== count || contentHash(chunk.trials) !== trialHash) gateFail('Stale/truncated/mixed-binding trial chunk');
      for (const trial of chunk.trials) {
        accountCompletionRepresentativeTrial(acc, trial, next++, expectedCell.samples);
        for (const decision of trial.completionDecisions) {
          execution ??= createModel11BehaviorCompletion(inputs, flop, later);
          validateCompletionRepresentativeDecision(execution, binding, expectedCell, decision, readProof);
        }
        if (next % expectedCell.cacheBatchSize === 0) execution?.releaseBoardCaches();
      }
    }
    if (next !== expectedCell.samples || !same(saved.row, completionRepresentativeCellSummary(expectedCell, acc)) ||
        !same(saved.proofs.map(record => record.path), [...acc.proofHashes].sort().map(hash => `${hash}.proof.json`))) gateFail('Omitted trial/return/event/proof or mismatched cell accounting');
    return saved;
  } finally { execution?.releaseBoardCaches(); }
}

export function produceModel11CompletionRepresentative(inputs, flop, later, binding, evidenceRoot, { assertUnchanged, onCell = () => {}, fresh = false, requireExisting = false } = {}) {
  if (typeof assertUnchanged !== 'function') gateFail('Source/input/plan recheck required');
  assertUnchanged();
  const cells = completionRepresentativeCells(inputs, binding.plan), store = openCompletionRepresentativeEvidence(evidenceRoot, binding, { fresh });
  const results = [], cellRecords = [], proofHashes = new Set(), warnings = [];
  for (const [index, cell] of cells.entries()) {
    assertUnchanged();
    let saved;
    if (store.hasCell(index)) {
      if (fresh) gateFail('Fresh replay cannot consume a concurrently appearing cell marker');
      saved = store.read(store.cellName(index));
    }
    else {
      if (requireExisting) gateFail('Saved report has a missing completed cell marker');
      saved = produceCompletionRepresentativeCell(inputs, flop, later, binding, store, index, cell);
      // No durable completion marker until all trials, support proofs, laws, metrics
      // and hashes validate. Incomplete chunk files never become resumable cells.
      validateCompletionRepresentativeCell(inputs, flop, later, binding, store, cell, saved);
      assertUnchanged(); store.write(store.cellName(index), saved);
    }
    validateCompletionRepresentativeCell(inputs, flop, later, binding, store, cell, saved);
    cellRecords.push({ ...store.record(store.cellName(index)), numericalHash: contentHash(saved) }); results.push(saved.row);
    for (const ref of saved.proofs) proofHashes.add(ref.path.slice(0, 64));
    if (saved.row.delta_bb?.ci95?.[1] < 0) warnings.push(`${cell.board}|${cell.opponent}|${cell.hero}: candidate below reference (${saved.row.delta_bb.mean}bb)`);
    onCell(saved.row, index + 1, cells.length);
  }
  assertUnchanged();
  const totals = Object.fromEntries(COMPLETION_COUNT_FIELDS.map(field => [field, results.reduce((n, row) => n + (row[field] ?? 0), 0)])); totals.uniqueProofs = proofHashes.size;
  const unreachable = results.filter(row => row.status === 'unreachable-base-deal').length, unresolved = results.filter(row => row.unresolvedCount > 0).length;
  const counts = { requestedBoards: binding.plan.boardList.length, requestedCells: cells.length, evaluatedCells: cells.length - unreachable - unresolved,
    provedUnreachableCells: unreachable, unresolvedCells: unresolved, requestedTrials: cells.length * binding.plan.samples,
    attemptedTrials: totals.attempted, evaluatedTrials: totals.completed, provedUnreachableTrials: unreachable * binding.plan.samples,
    ...totals };
  if (counts.requestedTrials !== counts.completed + counts.unresolvedCount + counts.provedUnreachableTrials ||
      counts.requestedCells !== counts.evaluatedCells + counts.unresolvedCells + counts.provedUnreachableCells) gateFail('Incomplete representative trial partition');
  return { kind: 'model11-composite-behavior-representative-for-independent-replay', version: 1, binding, bindingHash: contentHash(binding),
    status: counts.unresolvedCount ? 'blocked-off-model-coverage' : 'simulation-produced-not-audited',
    acceptance: 'not-accepted; separate strict balance, fresh independent replay, all-board evidence and review remain required',
    cellRecords, counts, results, numericalHash: contentHash({ cellRecords, counts, results }), warnings };
}

export function auditModel11CompletionRepresentative(inputs, flop, later, binding, saved, reportEvidenceRoot, freshEvidenceRoot, options) {
  if (!exactKeys(saved, ['kind', 'version', 'binding', 'bindingHash', 'status', 'acceptance', 'cellRecords', 'counts', 'results', 'numericalHash', 'warnings']) ||
      saved.kind !== 'model11-composite-behavior-representative-for-independent-replay' || saved.version !== 1 || !same(saved.binding, binding) ||
      saved.bindingHash !== contentHash(binding) || saved.numericalHash !== contentHash({ cellRecords: saved.cellRecords, counts: saved.counts, results: saved.results })) gateFail('A same-binding composite report is required; strict/legacy reports do not qualify');
  // Read/validate every saved byte and event before fresh execution. Re-entering the
  // report producer uses only fully validated cell markers, never partial files.
  const validated = produceModel11CompletionRepresentative(inputs, flop, later, binding, reportEvidenceRoot, { ...options, requireExisting: true });
  if (!same(validated, saved)) gateFail('Saved report/row/count/hash/identity differs from its full evidence');
  const replay = produceModel11CompletionRepresentative(inputs, flop, later, binding, freshEvidenceRoot, { ...options, fresh: true });
  if (!same(replay, saved)) gateFail('Fresh fixed-seed composite trial/return/event/proof replay differs');
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
  return { kind: 'model11-strict-balance-composite-behavior-representative-gate-result', version: 1, binding, bindingHash: contentHash(binding),
    status: !complete ? 'blocked-off-model-coverage' : !qualityPass ? 'completed-with-quality-errors' : plan.scope === 'full' ? 'representative-composite-numerical-gate-complete-unapproved' : 'diagnostic-complete-not-acceptance',
    acceptance: 'not-accepted; matching complete strict all-board evidence and independent review remain required',
    complete, fullScopePassed: plan.scope === 'full' && qualityPass, counts: saved.counts, ...legality,
    replay: { pass: true, savedNumericalHash: saved.numericalHash, freshNumericalHash: replay.numericalHash,
      comparison: 'every cell, every paired trial return and every completion event/law/proof; independently sampled baseline and candidate, no checkpoint replay' },
    referenceSanity: { samplesPerCell: 12, cells: sanityExpected, zeroDrift: true, numericalHash: contentHash(sanity) },
    balance: balanceEvidence, warnings: [...saved.warnings, ...balanceValidation.warnings.map(f => `balance [${f.check}] ${f.node}: ${f.detail}`)],
    balanceBoardCounts: { requested: plan.boardList.length, evaluated: balancePlan.boardList.length, provedBaseUnreachable: plan.boardList.length - balancePlan.boardList.length },
    balancePrefixCounts: balanceValidation.prefixCounts, offModel: { simulationTrials: saved.counts.unresolvedCount, balanceStages: balanceValidation.offModelStages } };
}
