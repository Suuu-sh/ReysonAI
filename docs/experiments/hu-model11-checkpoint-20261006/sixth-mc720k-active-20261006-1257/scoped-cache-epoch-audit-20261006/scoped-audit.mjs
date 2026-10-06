// Additive, current-source-bound audit. The historical 4,999 adapter is unchanged.
import { createHash } from 'node:crypto';
import { readdirSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUDIT_KIND = 'hu-cache64-whole-epoch-selected-replay-with-full-stored-integrity';
export const SELECTION_SEED = 'reysonai-hu-selected-cache-epochs-20261006-v1';
export const CURRENT_SPOT = 'CO_open_BTN_call_BB_squeeze_CO_fold_BTN_call';
export const LIMITATIONS = Object.freeze([
  'Numerical replay covers only the explicitly selected conditions and complete cache epochs; this is not a fresh720000-trial replay.',
  'Full stored-row, byte, hash, proof-body and EV-accounting checks establish unchanged evidence and accounting, not numerical correctness of unreplayed trials.',
  'All original RNG indices advance through samplePair, dealRunout and24 action draws. Whole selected epochs reproduce model-law cache history after each cache64 release.',
  'Process-global card/rank cache warmth and cumulative timing/diagnostic counters differ; fresh strict instances do not clear process-global caches.',
  'The original native semantic validator executes once during production for every full cell; its source-bound receipt is reused by the integrity audit.',
  'Selected results are not a new EV estimator, statistical equivalence result, full-policy acceptance, or production authorization.'
]);
const fileOnly = ({ path, bytes, sha256 }) => ({ path, bytes, sha256 });
const sha = value => createHash('sha256').update(value).digest('hex');

export async function loadScopedAuditApi(repository) {
  const root = resolve(repository, 'apps/frontend/scripts/postflop-ai');
  const load = name => import(pathToFileURL(join(root, name)).href);
  const [identity, contract, gate, selected, native, store, support, files, completion, simulation] = await Promise.all([
    load('effective-law-identity.mjs'), load('model11-completion-representative-contract.mjs'), load('model11-gate-contract.mjs'),
    load('model11-selected-regression.mjs'), load('model11-completion-representative.mjs'), load('model11-completion-representative-store.mjs'),
    load('range-support.mjs'), load('model11-allboard-lanes.mjs'), load('offpath-behavior-model11.mjs'), load('simulation-model11.mjs')
  ]);
  return { ...identity, ...contract, ...gate, ...selected, ...native, ...store, ...support, ...files, ...completion, ...simulation,
    repository: resolve(repository), validatorSource: files.pilotFile(join(root, 'model11-completion-representative.mjs')) };
}

export function createScopedManifest(api, inputs, binding, knownWitnesses) {
  const { same, gateFail, contentHash, completionRepresentativeCells } = api;
  const plan = binding.plan, cells = completionRepresentativeCells(inputs, plan);
  if (binding.spot !== CURRENT_SPOT || binding.sourceFingerprint !== inputs.fingerprint || plan.samples !== 10000 ||
      plan.cacheBatchSize !== 64 || plan.seed !== inputs.config.seed || plan.boardList.length !== 12 || cells.length !== 72 ||
      plan.profiles.length !== 3 || plan.heroes.length !== 2 || new Set(plan.boardList.map(b => b.id)).size !== 12 ||
      new Set(plan.profiles).size !== 3 || new Set(plan.heroes).size !== 2) gateFail('Current12-board72-cell10000/cache64 contract required');
  if (!Array.isArray(knownWitnesses) || !same(knownWitnesses.map(w => w.cellIndex), [1, 2, 59]) ||
      knownWitnesses.some(w => !w.reason || !w.evidence || !same(api.pilotFile(w.evidence.path), w.evidence))) gateFail('Exact current001/002/059 witness pins required');
  for (const witness of knownWitnesses) {
    const value = api.pilotJSON(witness.evidence.path, witness.evidence);
    if (value.kind !== 'isolated-hu-monte-carlo-trial-cost' || value.mode !== 'current' || value.originalCellIndex !== witness.cellIndex ||
        value.sourceCommit !== '4b6b39a613afe72a2362f85aa93a305cd61b3586' || value.inputFingerprint !== inputs.fingerprint ||
        value.sourceIdentityHash !== binding.source.strictBalance.identityHash || !same(value.cell, { ...cells[witness.cellIndex], samples: 64 }) ||
        value.completeSavedTrialObjectsEqual !== true || (witness.cellIndex === 1 ? !(value.summary.delta_bb.mean < 0) : !(value.summary.completionDecisions > 0))) gateFail('Known condition witness belongs to another source/cell');
  }
  // Fixed seed sorts two copies of each of the six conditions, assigning one to
  // every board. No EV, trial result, or user-controlled retry seed enters this.
  const slots = Array.from({ length: 12 }, (_, i) => ({ combination: i % 6, copy: Math.floor(i / 6),
    key: sha(`${SELECTION_SEED}|${i % 6}|${Math.floor(i / 6)}`) })).sort((a, b) => a.key.localeCompare(b.key));
  const baseCellIndices = slots.map((slot, boardIndex) => boardIndex * 6 + slot.combination);
  const selectedCellIndices = [...new Set([...baseCellIndices, ...knownWitnesses.map(w => w.cellIndex)])].sort((a, b) => a - b);
  const rows = selectedCellIndices.map(cellIndex => {
    const trialIndices = [0, 78, 156].flatMap(epoch => Array.from({ length: Math.min(64, 10000 - epoch * 64) }, (_, at) => epoch * 64 + at));
    return { cellIndex, cell: cells[cellIndex], epochIndices: [0, 78, 156], trialIndices, selected: trialIndices.length,
      reasons: [...(baseCellIndices.includes(cellIndex) ? ['fixed-seed balanced representative condition'] : []),
        ...knownWitnesses.filter(w => w.cellIndex === cellIndex).map(w => w.reason)] };
  });
  return { kind: AUDIT_KIND, version: 1, selectionSeed: SELECTION_SEED, sourceBindingHash: contentHash(binding),
    sourceIdentity: binding.source, inputFingerprint: inputs.fingerprint, policyIdentity: binding.compositeExecution,
    sourceTrials: 720000, cacheBatchSize: 64, baseCellIndices, knownWitnesses, selectedCellIndices, rows,
    selectedTrials: rows.reduce((n, row) => n + row.selected, 0), advancedRngTrials: 720000, limitations: [...LIMITATIONS] };
}

export function validateScopedManifest(api, inputs, binding, manifest) {
  if (!api.same(manifest, createScopedManifest(api, inputs, binding, manifest.knownWitnesses))) api.gateFail('Explicit fixed manifest differs');
  return manifest;
}

export function createScopedBinding(api, originalBinding, originalReport, manifest, adapterPins) {
  if (!api.same(api.pilotFile(originalReport.path), originalReport) || !Array.isArray(adapterPins) || !adapterPins.length ||
      adapterPins.some(pin => !api.same(api.pilotFile(pin.path), pin)) || manifest.sourceBindingHash !== api.contentHash(originalBinding)) api.gateFail('Audit report/source/adapter binding differs');
  return api.freezeSnapshot({ ...originalBinding, kind: 'hu-current-source-cache64-selected-audit-binding', version: 1,
    originalBindingHash: api.contentHash(originalBinding), originalReport, selectionHash: api.contentHash(manifest), adapterPins,
    audit: { kind: AUDIT_KIND, selectedTrials: manifest.selectedTrials, storedTrials: manifest.sourceTrials,
      advancedRngTrials: manifest.advancedRngTrials, limitations: [...LIMITATIONS] } });
}

export function verifyNativeReceipt(api, binding, store, index, saved, receipt) {
  const { same, contentHash, gateFail } = api, actual = store.record(store.cellName(index));
  if (receipt.kind !== 'next-hu-regression-cell-complete-not-accepted' || receipt.version !== 1 ||
      receipt.started?.bindingHash !== contentHash(binding) || receipt.started.cellIndex !== index || !same(receipt.started.cell, saved.cell) ||
      receipt.diagnostic?.bindingHash !== contentHash(binding) || receipt.diagnostic.cellIndex !== index ||
      !same(receipt.diagnostic.cell, saved.cell) || !same(receipt.diagnostic.rawCell, actual) || receipt.diagnostic.rawEvidenceDirectory !== store.dir ||
      !same(receipt.nativeValidation, { validator: 'validateCompletionRepresentativeCell', source: api.validatorSource, calls: 1,
        fullCell: true, cell: actual, completed: true }) ||
      !same(api.pilotFile(api.validatorSource.path), api.validatorSource)) gateFail('Missing/stale source-bound native semantic-validation receipt');
  // The worker pin and reviewed plan bind the actual call site, rather than
  // treating an unverified boolean as execution evidence.
  for (const pin of [receipt.started.worker, receipt.started.plan, receipt.started.review, receipt.started.job]) {
    if (!pin || !same(api.pilotFile(pin.path), pin)) gateFail('Native validation producer provenance changed');
  }
}

export function scanStoredCell(api, inputs, binding, store, index, expectedCell, record, nativeReceipt) {
  const { same, exactKeys, gateFail, contentHash } = api;
  if (!exactKeys(record, ['path', 'bytes', 'sha256', 'numericalHash']) || record.path !== store.cellName(index)) gateFail('Wrong full-cell record');
  const saved = store.read(record.path, fileOnly(record));
  if (!exactKeys(saved, ['kind', 'version', 'bindingHash', 'cell', 'cellIdentity', 'unreachable', 'row', 'chunks', 'proofs']) ||
      saved.kind !== 'model11-completion-representative-cell' || saved.version !== 1 || saved.bindingHash !== contentHash(binding) ||
      saved.cellIdentity !== contentHash(expectedCell) || !same(saved.cell, expectedCell) || contentHash(saved) !== record.numericalHash ||
      !Array.isArray(saved.chunks) || !Array.isArray(saved.proofs)) gateFail('Wrong full-cell identity/body');
  verifyNativeReceipt(api, binding, store, index, saved, nativeReceipt);
  const board = binding.plan.boardList.find(b => b.id === expectedCell.board);
  if (!board) gateFail('Full cell board missing');
  if (!api.hasPostflopDeal(inputs, board.cards)) {
    if (!saved.unreachable || saved.chunks.length || saved.proofs.length || !same(saved.row, { board: board.id, status: 'unreachable-base-deal' })) gateFail('Invalid unreachable full cell');
    return { saved, trialCount: 0, proofCount: 0, proofBodyHashes: [], evidenceFiles: [record.path] };
  }
  if (saved.unreachable !== false) gateFail('Reachable full cell marked unreachable');
  const acc = api.completionCellAccumulator(); let next = 0;
  const evidenceFiles = [record.path], proofBodyHashes = [];
  for (const [chunkIndex, ref] of saved.chunks.entries()) {
    if (!exactKeys(ref, ['path', 'bytes', 'sha256', 'startIndex', 'count', 'trialHash']) ||
        ref.path !== `${String(index).padStart(3, '0')}.${String(chunkIndex).padStart(3, '0')}.trials.json` || ref.startIndex !== next ||
        !Number.isSafeInteger(ref.count) || ref.count < 1 || ref.count > expectedCell.cacheBatchSize || next + ref.count > expectedCell.samples) gateFail('Full chunk missing/reordered/truncated');
    const chunk = store.read(ref.path, fileOnly(ref)); evidenceFiles.push(ref.path);
    if (!exactKeys(chunk, ['kind', 'version', 'bindingHash', 'cellIdentity', 'startIndex', 'trials']) ||
        chunk.kind !== 'model11-completion-representative-trial-chunk' || chunk.version !== 1 || chunk.bindingHash !== saved.bindingHash ||
        chunk.cellIdentity !== saved.cellIdentity || chunk.startIndex !== next || !Array.isArray(chunk.trials) ||
        chunk.trials.length !== ref.count || contentHash(chunk.trials) !== ref.trialHash) gateFail('Full chunk byte/row/hash identity differs');
    for (const trial of chunk.trials) api.accountCompletionRepresentativeTrial(acc, trial, next++, expectedCell.samples);
  }
  if (next !== expectedCell.samples || !same(saved.row, api.completionRepresentativeCellSummary(expectedCell, acc)) ||
      !same(saved.proofs.map(ref => ref.path), [...acc.proofHashes].sort().map(hash => `${hash}.proof.json`))) gateFail('Full row/EV/status/proof accounting differs');
  for (const ref of saved.proofs) {
    if (!exactKeys(ref, ['path', 'bytes', 'sha256']) || !same(store.record(ref.path), ref)) gateFail('Full proof reference/bytes differs');
    const hash = ref.path.slice(0, 64), proof = store.readProof(hash), { proofHash, ...body } = proof;
    if (proofHash !== hash || contentHash(body) !== hash) gateFail('Full proof body changed');
    proofBodyHashes.push([hash, contentHash(proof)]); evidenceFiles.push(ref.path);
  }
  const statistic = values => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { actualN: values.length, mean, sampleStandardDeviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)),
      normalIntervalMeaning: 'descriptive fixed-seed Monte Carlo; no optimality claim' };
  };
  const statistics = acc.unresolved.length ? null : { candidate: statistic(acc.candidate), baseline: statistic(acc.baseline),
    delta: statistic(acc.candidate.map((value, i) => value - acc.baseline[i])) };
  return { saved, trialCount: next, proofCount: saved.proofs.length, proofBodyHashes, evidenceFiles, statistics };
}

export function assertExactEvidenceFiles(api, store, evidenceFiles) {
  const expected = new Set(['identity.json', ...evidenceFiles]);
  const actual = readdirSync(store.dir);
  if (actual.length !== expected.size || actual.some(name => !expected.has(name) || !lstatSync(join(store.dir, name)).isFile() || lstatSync(join(store.dir, name)).isSymbolicLink())) api.gateFail('Missing/extra/symlink stored evidence');
}

export function verifyFullReport(api, inputs, binding, report, scannedCells) {
  const { same, contentHash, exactKeys, gateFail } = api;
  if (!exactKeys(report, ['kind', 'version', 'binding', 'bindingHash', 'status', 'acceptance', 'cellRecords', 'counts', 'results', 'numericalHash', 'warnings']) ||
      report.kind !== 'model11-composite-behavior-representative-for-independent-replay' || report.version !== 1 || !same(report.binding, binding) ||
      report.bindingHash !== contentHash(binding) || report.numericalHash !== contentHash({ cellRecords: report.cellRecords, counts: report.counts, results: report.results })) gateFail('Full report binding or aggregate hash differs');
  const cells = api.completionRepresentativeCells(inputs, binding.plan), results = scannedCells.map(result => result.saved.row);
  if (scannedCells.length !== cells.length || report.cellRecords.length !== cells.length || !same(results, report.results) ||
      scannedCells.some((r, i) => !same(r.saved.cell, cells[i]) || contentHash(r.saved) !== report.cellRecords[i].numericalHash)) gateFail('Full report cell/row order differs');
  const totals = Object.fromEntries(api.COMPLETION_COUNT_FIELDS.map(field => [field, results.reduce((n, row) => n + (row[field] ?? 0), 0)]));
  totals.uniqueProofs = new Set(scannedCells.flatMap(result => result.saved.proofs.map(ref => ref.path))).size;
  const unreachable = results.filter(row => row.status === 'unreachable-base-deal').length, unresolved = results.filter(row => row.unresolvedCount > 0).length;
  const counts = { requestedBoards: binding.plan.boardList.length, requestedCells: cells.length, evaluatedCells: cells.length - unreachable - unresolved,
    provedUnreachableCells: unreachable, unresolvedCells: unresolved, requestedTrials: cells.length * binding.plan.samples,
    attemptedTrials: totals.attempted, evaluatedTrials: totals.completed, provedUnreachableTrials: unreachable * binding.plan.samples, ...totals };
  const warnings = results.filter(row => row.delta_bb?.ci95?.[1] < 0).map(row => `${row.board}|${row.opponent}|${row.hero}: candidate below reference (${row.delta_bb.mean}bb)`);
  if (!same(report.counts, counts) || !same(report.warnings, warnings) ||
      report.status !== (counts.unresolvedCount ? 'blocked-off-model-coverage' : 'simulation-produced-not-audited') ||
      report.acceptance !== 'not-accepted; separate strict balance, fresh independent replay, all-board evidence and review remain required' ||
      counts.requestedTrials !== counts.completed + counts.unresolvedCount + counts.provedUnreachableTrials ||
      counts.requestedCells !== counts.evaluatedCells + counts.unresolvedCells + counts.provedUnreachableCells) gateFail('Full report counts/status/warnings/partition differs');
  return { storedCells: cells.length, storedTrials: scannedCells.reduce((n, result) => n + result.trialCount, 0),
    uniqueProofs: totals.uniqueProofs, numericalHash: report.numericalHash, nativeSemantics: 'source-bound production receipts checked; not re-executed by integrity scan' };
}

export function advanceUnselectedCell(api, inputs, binding, cell) {
  const board = binding.plan.boardList.find(b => b.id === cell.board), hash = createHash('sha256'); let advanced = 0;
  for (const draw of api.originalDealStream(inputs, board, cell)) { hash.update(JSON.stringify(draw) + '\n'); advanced++; }
  if (advanced !== cell.samples) api.gateFail('Incomplete unselected RNG advancement');
  return { advancedRngTrials: advanced, strategyTrials: 0, rngStreamSha256: hash.digest('hex') };
}

export function compareScopedCell(api, originalStore, originalBinding, originalRecord, freshStore, binding, row, fresh) {
  const { same, gateFail, contentHash } = api;
  const original = originalStore.read(originalRecord.path, fileOnly(originalRecord));
  if (original.bindingHash !== contentHash(originalBinding) || contentHash(original) !== originalRecord.numericalHash || !same(original.cell, row.cell)) gateFail('Selected comparison source changed');
  const iterator = api.selectedTrials(freshStore, binding, row, fresh), wanted = new Set(row.trialIndices), proofHashes = new Map(), trialHashes = []; let next = 0;
  for (const ref of original.chunks) {
    const chunk = originalStore.read(ref.path, fileOnly(ref));
    if (chunk.bindingHash !== original.bindingHash || chunk.cellIdentity !== original.cellIdentity || chunk.startIndex !== next ||
        chunk.trials.length !== ref.count || contentHash(chunk.trials) !== ref.trialHash) gateFail('Selected comparison original chunk differs');
    for (const trial of chunk.trials) {
      if (trial.index !== next++) gateFail('Selected comparison original index differs');
      if (!wanted.has(trial.index)) continue;
      const freshTrial = iterator.next();
      if (freshTrial.done || !same(trial, freshTrial.value)) gateFail('Selected complete trial/return/law object differs');
      trialHashes.push(contentHash(trial));
      for (const event of trial.completionDecisions) {
        const path = `${event.proofHash}.proof.json`, oldRef = original.proofs.find(r => r.path === path), newRef = fresh.proofs.find(r => r.path === path);
        if (!oldRef || !newRef || !same(originalStore.record(path), oldRef) || !same(freshStore.record(path), newRef)) gateFail('Selected proof file/reference missing');
        const oldProof = originalStore.readProof(event.proofHash), newProof = freshStore.readProof(event.proofHash), { proofHash, ...body } = oldProof;
        if (contentHash(body) !== proofHash || !same(oldProof, newProof)) gateFail('Selected entire proof body differs');
        proofHashes.set(proofHash, contentHash(oldProof));
      }
    }
  }
  if (next !== row.cell.samples || trialHashes.length !== row.selected || !iterator.next().done) gateFail('Selected comparison incomplete');
  return { cellIndex: row.cellIndex, selectedTrials: trialHashes.length, advancedRngTrials: fresh.counts.advancedRngTrials,
    rngStreamSha256: fresh.rngStreamSha256, proofHashes: [...proofHashes.keys()].sort(),
    numericalPayloadHash: contentHash({ cell: row.cell, trialIndices: row.trialIndices, trialHashes, proofHashes: [...proofHashes.entries()].sort() }) };
}

export function replayAndCompareCell(api, inputs, flop, later, originalBinding, originalStore, originalRecord, binding, freshStore, row) {
  const fresh = api.produceSelectedCell(inputs, flop, later, binding, freshStore, row.cellIndex, row);
  api.validateSelectedCell(inputs, flop, later, binding, freshStore, row, fresh);
  const compared = compareScopedCell(api, originalStore, originalBinding, originalRecord, freshStore, binding, row, fresh);
  freshStore.write(freshStore.cellName(row.cellIndex), fresh);
  assertExactEvidenceFiles(api, freshStore, [freshStore.cellName(row.cellIndex), ...fresh.chunks.map(r => r.path), ...fresh.proofs.map(r => r.path)]);
  return { fresh, compared };
}

export function runCurrentCacheControls(api, inputs, flop, later, binding) {
  const cells = api.completionRepresentativeCells(inputs, binding.plan), results = [];
  for (const [cellIndex, trialIndex] of [[1, 0], [2, 36], [59, 37]]) {
    const cell = cells[cellIndex], board = binding.plan.boardList.find(b => b.id === cell.board); let draw;
    for (const candidate of api.originalDealStream(inputs, board, cell)) if (candidate.index === trialIndex) { draw = candidate; break; }
    const execute = execution => {
      const decisions = [], hand = api.playModel11Hand({ execution, hands: draw.hands, flop: board.cards, runout: draw.runout,
        hero: cell.hero, profile: cell.opponent, randoms: draw.randoms, onDecision: decision => decisions.push(decision) });
      return { hand, decisions };
    };
    const execution = api.createModel11BehaviorCompletion(inputs, flop, later);
    const zero = api.createModel11BehaviorCompletion(inputs, flop, later, { cache: { entries: 0, numericBytes: 0, metadataBytes: 0 } });
    try {
      const cold = execute(execution), warm = execute(execution); execution.releaseBoardCaches();
      const released = execute(execution), unretained = execute(zero);
      if (![warm, released, unretained].every(value => api.same(cold, value)) || zero.cacheStats().entries !== 0) api.gateFail('Current cold/warm/released/zero-retention full trace differs');
      const completionDecisions = cold.decisions.filter(decision => decision.law.provenance.kind === 'off-model-saved-policy-behavior-completion').length;
      if (cellIndex !== 1 && !completionDecisions) api.gateFail('Known current semantic cache control is vacuous');
      results.push({ cellIndex, trialIndex, cell, drawHash: api.contentHash(draw), fullTraceHash: api.contentHash(cold), completionDecisions,
        comparedModes: ['cold-strict-instance', 'warm-same-instance', 'released-strict-instance', 'strict-zero-retention'], handExecutions: 4 });
    } finally { execution.releaseBoardCaches(); zero.releaseBoardCaches(); }
  }
  return { kind: 'hu-current-source-three-condition-cache-controls', version: 1, handExecutions: 12, results,
    limitation: 'Three explicit trace controls only; cold strict instance does not clear process-global rank/card caches or prove all skipped cache histories.' };
}
