// Additive targeted evidence. Never an adapter for the full replay contract.
import { createHash } from 'node:crypto';
import { createModel11BehaviorCompletion } from './offpath-behavior-model11.mjs';
import { playModel11Hand } from './simulation-model11.mjs';
import { playHand, dealRunout } from './simulation.mjs';
import { referencePolicyFor } from './policy.mjs';
import { referenceLaterPolicy } from './later-policy.mjs';
import { makeSampler, seatRange, samplePair } from './inputs.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { seedFor, seededRandom } from '../lib/equity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';
import { exactKeys, same, gateFail } from './model11-gate-contract.mjs';
import { completionRepresentativeCells, compactCompletionDecision, completionCellAccumulator,
  accountCompletionRepresentativeTrial, validateCompletionRepresentativeDecision } from './model11-completion-representative-contract.mjs';

export const SELECTED_KIND = 'model11-selected-index-regression-not-full-replay';
export const CACHE_CONTROL_CASES = Object.freeze([{ cellIndex: 0, trialIndex: 0 }, { cellIndex: 3, trialIndex: 10 },
  { cellIndex: 3, trialIndex: 511 }, { cellIndex: 3, trialIndex: 512 }]);
const eq = (a, b, label) => { if (!same(a, b)) gateFail(`Selected regression ${label} differs`); };
const fileOnly = ({ path, bytes, sha256 }) => ({ path, bytes, sha256 });
export function validateSelectedManifest(selection, inputs, originalPlan) {
  const cells = completionRepresentativeCells(inputs, originalPlan);
  if (selection.kind !== 'model11-authorized-targeted-replay-selection' || ![1, 2].includes(selection.version) ||
      selection.strata !== 72 || selection.originalTrials !== 720000 || selection.selectedTrials !== 4999 ||
      selection.unselectedTrials !== 715001 || selection.boundarySelectedTotal !== 2880 || selection.completionTrialTotal !== 2125 ||
      selection.overlapCount !== 6 || !Array.isArray(selection.rows) || selection.rows.length !== 72 || cells.length !== 72) gateFail('Only the explicitly reviewed4999 selection is admitted');
  let total = 0;
  for (const [index, row] of selection.rows.entries()) {
    if (!exactKeys(row, ['cellIndex', 'cell', 'trialIndices', 'boundaryCount', 'completionTrials', 'selected']) || row.cellIndex !== index ||
        !same(row.cell, cells[index]) || !Array.isArray(row.trialIndices) || row.selected !== row.trialIndices.length || row.boundaryCount !== 40 ||
        row.trialIndices.some((trial, at, all) => !Number.isSafeInteger(trial) || trial < 0 || trial >= 10000 || at > 0 && trial <= all[at - 1])) gateFail('Missing/reordered/foreign selected cell or index');
    const required = [0, 9999]; for (let boundary = 512; boundary < 10000; boundary += 512) required.push(boundary - 1, boundary);
    if (required.some(trial => !row.trialIndices.includes(trial))) gateFail('Required first/last/cache-boundary index omitted');
    total += row.selected;
  }
  if (total !== 4999) gateFail('Selected trial budget differs');
  return cells;
}
export function selectedBinding(inputs, flop, later, originalPlan, source, files, selection, selectionRecord) {
  validateSelectedManifest(selection, inputs, originalPlan);
  const execution = createModel11BehaviorCompletion(inputs, flop, later);
  try {
    return freezeSnapshot({ kind: 'model11-selected-index-regression-binding', version: 1, spot: inputs.spot.id,
      sourceFingerprint: inputs.fingerprint, source, files, originalReport: selection.originalReport,
      selectionRecord, selectionHash: contentHash(selection),
      plan: { kind: SELECTED_KIND, version: 1, boardList: originalPlan.boardList, profiles: originalPlan.profiles, heroes: originalPlan.heroes,
        sourceTrialsPerCell: 10000, selectedTrials: 4999, unselectedTrials: 715001, seed: originalPlan.seed, cacheBatchSize: 512,
        cacheHistory: 'sparse strategy history; original-index resets; no original warm-cache claim',
        statisticalClaim: 'none; selected rows are not a new EV estimator or full replay' },
      compositeExecution: execution.identity, behaviorPolicyIdentity: execution.behaviorIdentity,
      belief: execution.belief, artifactProvenance: execution.artifactProvenance });
  } finally { execution.releaseBoardCaches(); }
}
// Sampling advances at EVERY original index. No 24*index seek and no saved
// hand/return/law/proof can enter this generator.
export function* originalDealStream(inputs, board, sourceCell, beforeIndex = () => {}) {
  const ip = makeSampler(seatRange(inputs, inputs.spot.ip, board.cards)), oop = makeSampler(seatRange(inputs, inputs.spot.oop, board.cards));
  const random = seededRandom(seedFor(`${inputs.config.seed}|${board.id}|${sourceCell.opponent}|${sourceCell.hero}`));
  for (let index = 0; index < sourceCell.samples; index++) {
    beforeIndex(index);
    const hands = samplePair(ip, oop, random, inputs.spot), runout = dealRunout(hands, board.cards, random);
    const randoms = Array.from({ length: 24 }, () => random());
    yield { index, hands, runout, randoms };
  }
}
function selectedStorageCell(row) {
  return { ...row.cell, samples: row.selected, sourceSamples: row.cell.samples, selectedIndices: row.trialIndices,
    kind: SELECTED_KIND, version: 1 };
}
function counts(acc, row) {
  return { advancedRngTrials: row.cell.samples, requestedSelectedTrials: row.selected, completedSelectedTrials: acc.candidate.length,
    unresolvedSelectedTrials: acc.unresolved.length, completionEvents: acc.completionDecisions, uniqueProofs: acc.proofHashes.size };
}
export function produceSelectedCell(inputs, flop, later, binding, store, index, row) {
  const board = binding.plan.boardList.find(item => item.id === row.cell.board), selected = new Set(row.trialIndices);
  if (!hasPostflopDeal(inputs, board.cards)) gateFail('Reviewed source cell unexpectedly became base-unreachable');
  const storageCell = selectedStorageCell(row), execution = createModel11BehaviorCompletion(inputs, flop, later), acc = completionCellAccumulator();
  const stream = store.beginCell(index, storageCell), schedule = createHash('sha256'), resetIndices = []; let advanced = 0;
  const reference = referencePolicyFor(inputs.spot.tree), referenceLater = referenceLaterPolicy();
  try {
    for (const draw of originalDealStream(inputs, board, row.cell, index => {
      // Same before-draw reset placement as the original full loop, including skipped strategy trials.
      if (index % row.cell.cacheBatchSize === 0) { execution.releaseBoardCaches(); resetIndices.push(index); }
    })) {
      schedule.update(JSON.stringify(draw) + '\n'); advanced++;
      if (!selected.has(draw.index)) continue;
      const { hands, runout, randoms } = draw;
      const baseline = playHand({ hands, flop: board.cards, runout, hero: row.cell.hero, policy: reference, laterPolicy: referenceLater,
        profile: row.cell.opponent, randoms, spot: inputs.spot });
      const completionDecisions = []; let randomIndex = 0, result, failure;
      try {
        result = playModel11Hand({ execution, hands, flop: board.cards, runout, hero: row.cell.hero, profile: row.cell.opponent, randoms,
          onDecision: decision => {
            const at = randomIndex++;
            if (decision.law.provenance.kind === 'off-model-saved-policy-behavior-completion') completionDecisions.push(compactCompletionDecision(decision, hands[decision.seat], at, store.putProof));
          } });
      } catch (error) {
        if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
        failure = { index: draw.index, status: error.status, message: error.message, decision: error.decision, zeroLikelihoodProof: error.zeroLikelihoodProof ?? null };
      }
      const trial = { index: draw.index, status: failure ? 'unresolved-off-model' : 'complete',
        ...(failure ? { unresolved: failure } : { candidateReturn: result.returns[row.cell.hero] }), baselineReturn: baseline.returns[row.cell.hero], completionDecisions };
      accountCompletionRepresentativeTrial(acc, trial, draw.index, row.cell.samples); stream.append(trial);
    }
    if (advanced !== row.cell.samples || acc.candidate.length + acc.unresolved.length !== row.selected) gateFail('Incomplete RNG stream or selected execution');
    return { kind: 'model11-selected-regression-cell', version: 1, bindingHash: contentHash(binding), index, sourceCell: row.cell,
      storageCell, storageCellIdentity: contentHash(storageCell), selectionHash: contentHash(row), counts: counts(acc, row),
      rngStreamSha256: schedule.digest('hex'), resetIndices, chunks: stream.finish(), proofs: [...acc.proofHashes].sort().map(hash => store.record(`${hash}.proof.json`)) };
  } finally { execution.releaseBoardCaches(); }
}
export function* selectedTrials(store, binding, row, saved) {
  if (!exactKeys(saved, ['kind', 'version', 'bindingHash', 'index', 'sourceCell', 'storageCell', 'storageCellIdentity', 'selectionHash', 'counts', 'rngStreamSha256', 'resetIndices', 'chunks', 'proofs']) ||
      saved.kind !== 'model11-selected-regression-cell' || saved.version !== 1 || saved.index !== row.cellIndex || saved.bindingHash !== contentHash(binding) ||
      !same(saved.sourceCell, row.cell) || !same(saved.storageCell, selectedStorageCell(row)) || saved.storageCellIdentity !== contentHash(saved.storageCell) ||
      saved.selectionHash !== contentHash(row) || !/^[a-f0-9]{64}$/.test(saved.rngStreamSha256) ||
      !same(saved.resetIndices, Array.from({ length: Math.ceil(row.cell.samples / row.cell.cacheBatchSize) }, (_, i) => i * row.cell.cacheBatchSize)) ||
      !Array.isArray(saved.chunks) || !Array.isArray(saved.proofs)) gateFail('Malformed selected cell wrapper');
  let cursor = 0;
  for (const [chunkIndex, ref] of saved.chunks.entries()) {
    if (!exactKeys(ref, ['path', 'bytes', 'sha256', 'startIndex', 'count', 'trialHash']) || ref.path !== `${String(row.cellIndex).padStart(3, '0')}.${String(chunkIndex).padStart(3, '0')}.trials.json` ||
        ref.startIndex !== cursor || !Number.isSafeInteger(ref.count) || ref.count < 1 || ref.count > row.selected) gateFail('Selected chunk order/count differs');
    const chunk = store.read(ref.path, fileOnly(ref));
    if (!exactKeys(chunk, ['kind', 'version', 'bindingHash', 'cellIdentity', 'startIndex', 'trials']) || chunk.kind !== 'model11-completion-representative-trial-chunk' ||
        chunk.version !== 1 || chunk.bindingHash !== saved.bindingHash || chunk.cellIdentity !== saved.storageCellIdentity || chunk.startIndex !== cursor ||
        !Array.isArray(chunk.trials) || chunk.trials.length !== ref.count || contentHash(chunk.trials) !== ref.trialHash) gateFail('Selected chunk bytes/source differs');
    for (const trial of chunk.trials) {
      if (trial.index !== row.trialIndices[cursor++]) gateFail('Omitted/duplicate/reordered selected original index');
      yield trial;
    }
  }
  if (cursor !== row.selected) gateFail('Selected cell is incomplete');
}
export function validateSelectedCell(inputs, flop, later, binding, store, row, saved) {
  const acc = completionCellAccumulator(); let execution;
  const readProof = hash => {
    const ref = saved.proofs.find(record => record.path === `${hash}.proof.json`);
    if (!ref || !exactKeys(ref, ['path', 'bytes', 'sha256']) || !same(store.record(ref.path), ref)) gateFail('Selected proof reference differs');
    const proof = store.readProof(hash), { proofHash, ...body } = proof;
    if (contentHash(body) !== proofHash) gateFail('Selected full proof body changed'); return proof;
  };
  try {
    for (const trial of selectedTrials(store, binding, row, saved)) {
      if (trial.index % row.cell.cacheBatchSize === 0) execution?.releaseBoardCaches();
      accountCompletionRepresentativeTrial(acc, trial, trial.index, row.cell.samples);
      for (const event of trial.completionDecisions) {
        execution ??= createModel11BehaviorCompletion(inputs, flop, later);
        validateCompletionRepresentativeDecision(execution, binding, saved.storageCell, event, readProof);
      }
    }
    eq(saved.counts, counts(acc, row), 'selected counts');
    eq(saved.proofs.map(ref => ref.path), [...acc.proofHashes].sort().map(hash => `${hash}.proof.json`), 'complete proof coverage');
    return saved;
  } finally { execution?.releaseBoardCaches(); }
}
export function compareSelectedCell(originalStore, originalBinding, originalRecord, freshStore, binding, row, fresh) {
  const { numericalHash, ...record } = originalRecord;
  const old = originalStore.read(record.path, record);
  if (old.kind !== 'model11-completion-representative-cell' || old.bindingHash !== contentHash(originalBinding) || contentHash(old) !== numericalHash || !same(old.cell, row.cell)) gateFail('Original selected comparison source differs');
  const iterator = selectedTrials(freshStore, binding, row, fresh), wanted = new Set(row.trialIndices), proofs = new Map(), hashes = []; let originalIndex = 0, completionTrials = 0;
  for (const ref of old.chunks) {
    const chunk = originalStore.read(ref.path, fileOnly(ref));
    if (chunk.bindingHash !== old.bindingHash || chunk.cellIdentity !== old.cellIdentity || chunk.startIndex !== originalIndex ||
        chunk.trials.length !== ref.count || contentHash(chunk.trials) !== ref.trialHash) gateFail('Original chunk source/order changed');
    for (const trial of chunk.trials) {
      if (trial.index !== originalIndex++) gateFail('Original stream order differs');
      if (trial.completionDecisions.length) { completionTrials++; if (!wanted.has(trial.index)) gateFail('A known original completion trial was omitted'); }
      if (!wanted.has(trial.index)) continue;
      const next = iterator.next(); if (next.done) gateFail('Fresh selected trial missing');
      eq(trial, next.value, 'stored paired return/completion event/full law'); hashes.push(contentHash(trial));
      for (const event of trial.completionDecisions) {
        const path = `${event.proofHash}.proof.json`, oldRef = old.proofs.find(ref => ref.path === path), freshRef = fresh.proofs.find(ref => ref.path === path);
        if (!oldRef || !freshRef) gateFail('Selected full proof reference omitted');
        eq(originalStore.record(path), oldRef, 'original proof file'); eq(freshStore.record(path), freshRef, 'fresh proof file');
        const oldProof = originalStore.readProof(event.proofHash), freshProof = freshStore.readProof(event.proofHash);
        const { proofHash, ...body } = oldProof;
        if (contentHash(body) !== proofHash) gateFail('Original full proof body changed');
        eq(oldProof, freshProof, 'full proof body including every row'); proofs.set(proofHash, contentHash(oldProof));
      }
    }
  }
  if (originalIndex !== row.cell.samples || hashes.length !== row.selected || !iterator.next().done || completionTrials !== row.completionTrials) gateFail('Selected/source coverage differs');
  return { cellIndex: row.cellIndex, selectedTrials: hashes.length, completionTrials, proofHashes: [...proofs.keys()].sort(),
    numericalPayloadHash: contentHash({ originalCell: row.cell, selectedIndices: row.trialIndices, orderedTrialHashes: hashes, completeProofHashes: [...proofs.entries()].sort() }) };
}
export function runSelectedCacheControls(api, inputs, flop, later, originalPlan, sourceCells) {
  const cases = [];
  for (const control of CACHE_CONTROL_CASES) {
    const cell = sourceCells[control.cellIndex], board = originalPlan.boardList.find(item => item.id === cell.board);
    let selected;
    for (const draw of originalDealStream(inputs, board, cell)) if (draw.index === control.trialIndex) { selected = draw; break; }
    if (!selected) gateFail('Cache control draw missing');
    const execute = execution => {
      const decisions = [], hand = api.playModel11Hand({ execution, hands: selected.hands, flop: board.cards, runout: selected.runout,
        hero: cell.hero, profile: cell.opponent, randoms: selected.randoms, onDecision: row => decisions.push(row) });
      return { hand, decisions };
    };
    const execution = api.createModel11BehaviorCompletion(inputs, flop, later);
    const zero = api.createModel11BehaviorCompletion(inputs, flop, later, { cache: { entries: 0, numericBytes: 0, metadataBytes: 0 } });
    try {
      const cold = execute(execution), warm = execute(execution); execution.releaseBoardCaches();
      const released = execute(execution), noRetention = execute(zero);
      eq(cold, warm, 'cold/warm full control trace'); eq(cold, released, 'released full control trace'); eq(cold, noRetention, 'zero-retention full control trace');
      if (zero.cacheStats().entries !== 0) gateFail('Zero-retention control retained strict model entries');
      const completionEvents = cold.decisions.filter(row => row.law.provenance.kind === 'off-model-saved-policy-behavior-completion').length;
      if (control.cellIndex === 3 && control.trialIndex === 10 && completionEvents === 0) gateFail('Known index10 completion control is vacuous');
      cases.push({ ...control, sourceCell: cell, draw: selected, coldTrace: cold, traceHash: contentHash(cold), completionEvents,
        modesCompared: ['cold-strict-instance', 'warm-same-instance', 'released-strict-instance', 'strict-zero-retention'], strictZeroRetentionEntries: 0, controlHandExecutions: 4 });
    } finally { execution.releaseBoardCaches(); zero.releaseBoardCaches(); }
  }
  return { kind: 'model11-four-case-cache-purity-controls', version: 1, controlHandExecutions: 16, cases,
    limitation: 'Four real controls, not proof of every skipped warm-cache history. Cold means a fresh strict execution instance, not cleared process-global rank caches. Original cold traces are separate fresh controls, not recovered original720k traces.' };
}
