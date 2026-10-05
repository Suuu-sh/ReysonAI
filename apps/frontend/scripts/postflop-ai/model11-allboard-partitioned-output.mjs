// Lossless all-board receipt encoding over the *existing* immutable checkpoint files.
// Materialization is storage validation, never a new numerical acceptance decision.
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { auditFileRecord } from './audit-identity.mjs';
import { openBoardCheckpoints } from './all-board-checkpoints.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { gateFail, same, exactKeys } from './model11-gate-contract.mjs';
import { runModel11AllBoards } from './model11-gate-drivers.mjs';
import { validateModel11GateReceipt } from './evaluate-model11-audit.mjs';
const resultKeys = ['kind', 'version', 'binding', 'bindingHash', 'checkpointIdentityHash', 'status', 'acceptance', 'complete', 'fullScopePassed', 'counts', 'prefixCounts', 'inheritedSummary', 'globalFindings', 'rows', 'rowHashes', 'coverageScope'];
export const model11CheckpointIdentityHash = binding => createHash('sha256').update(JSON.stringify(binding)).digest('hex');
function completedCache(checkpointRoot, binding, identityRecord = null) {
  if (binding?.plan?.kind !== 'all-boards' || !Array.isArray(binding.plan.boardList) || !binding.plan.boardList.length) gateFail('An original explicit all-board binding is required');
  const key = model11CheckpointIdentityHash(binding), dir = resolve(checkpointRoot, key);
  const identity = auditFileRecord(dir, 'identity.json'); // Require existing identity before opening its guarded cache.
  if (identity.bytes > 512 * 1024 || identityRecord && !same(identity, identityRecord)) gateFail('Missing/changed all-board checkpoint identity');
  const cache = openBoardCheckpoints(checkpointRoot, binding, binding.plan.boardList.map(board => board.id));
  if (cache.key !== key || cache.rows.size !== binding.plan.boardList.length) gateFail('Every declared checkpoint must already exist; storage recovery cannot generate missing boards');
  return { cache, identity };
}
function verifyProofFiles(dir, row) {
  for (const ref of row.modelUnreachableProofs ?? []) {
    if (!exactKeys(ref, ['proofHash', 'bytes', 'sha256']) || !/^[a-f0-9]{64}$/.test(ref.proofHash)) gateFail('Malformed original exact-zero proof reference');
    const record = auditFileRecord(dir, `${ref.proofHash}.proof.json`);
    if (record.bytes > 16 * 1024 * 1024 || record.bytes !== ref.bytes || record.sha256 !== ref.sha256) gateFail('Missing/changed all-board exact-zero proof bytes');
  }
}
export function partitionModel11AllBoardReceipt(receipt, checkpointRoot, { outputSourceStart, outputSourceEnd }) {
  const result = validateModel11GateReceipt(receipt, { operation: 'all-boards', binding: receipt.result?.binding });
  if (!exactKeys(result, resultKeys) || result.kind !== 'model11-all-board-gate-result' || result.version !== 1 ||
      result.bindingHash !== contentHash(result.binding) || !same(outputSourceStart, outputSourceEnd)) gateFail('Only an unchanged original all-board receipt can be partitioned');
  const { cache, identity } = completedCache(checkpointRoot, result.binding);
  if (result.checkpointIdentityHash !== cache.key || result.rows.length !== result.binding.plan.boardList.length || result.rowHashes.length !== result.rows.length) gateFail('Original all-board receipt does not cover the exact checkpoint set');
  const rowReferences = result.binding.plan.boardList.map((board, index) => {
    const row = cache.rows.get(board.id), rowHash = contentHash(row);
    if (result.rows[index]?.board !== board.id || !same(result.rows[index], row) || result.rowHashes[index] !== rowHash) gateFail('Original result row/order/hash differs from its checkpoint');
    verifyProofFiles(cache.dir, row);
    const record = auditFileRecord(cache.dir, `${board.id}.json`);
    if (record.bytes > 512 * 1024) gateFail('Original all-board checkpoint exceeds its fixed bound');
    return { index, board: board.id, ...record, rowHash };
  });
  const { result: _result, ...receiptHeader } = receipt, { rows: _rows, ...resultHeader } = result;
  return { kind: 'model11-all-board-partitioned-execution-receipt', version: 1, outputSourceStart, outputSourceEnd,
    originalReceiptHash: contentHash(receipt), receiptHeader, resultHeader, checkpointIdentity: identity, rowReferences };
}
export function materializeModel11AllBoardReceipt(saved, checkpointRoot, { binding, outputSource }) {
  if (!exactKeys(saved, ['kind', 'version', 'outputSourceStart', 'outputSourceEnd', 'originalReceiptHash', 'receiptHeader', 'resultHeader', 'checkpointIdentity', 'rowReferences']) ||
      saved.kind !== 'model11-all-board-partitioned-execution-receipt' || saved.version !== 1 || !same(saved.outputSourceStart, outputSource) ||
      !same(saved.outputSourceEnd, outputSource) || !/^[a-f0-9]{64}$/.test(saved.originalReceiptHash) ||
      !exactKeys(saved.resultHeader, resultKeys.filter(key => key !== 'rows')) || !same(saved.resultHeader.binding, binding) ||
      saved.resultHeader.bindingHash !== contentHash(binding) || !Array.isArray(saved.rowReferences)) gateFail('Stale/malformed partitioned all-board receipt');
  const { cache } = completedCache(checkpointRoot, binding, saved.checkpointIdentity), boards = binding.plan.boardList;
  if (saved.resultHeader.checkpointIdentityHash !== cache.key || saved.rowReferences.length !== boards.length || saved.resultHeader.rowHashes.length !== boards.length) gateFail('Incomplete original all-board partition set');
  const rows = boards.map((board, index) => {
    const ref = saved.rowReferences[index];
    if (!exactKeys(ref, ['index', 'board', 'path', 'bytes', 'sha256', 'rowHash']) || ref.index !== index || ref.board !== board.id || ref.path !== `${board.id}.json`) gateFail('Missing/duplicate/reordered all-board partition reference');
    const { index: _index, board: _board, rowHash, ...record } = ref, row = cache.rows.get(board.id);
    if (!same(auditFileRecord(cache.dir, ref.path), record) || rowHash !== contentHash(row) || rowHash !== saved.resultHeader.rowHashes[index]) gateFail('Changed all-board checkpoint bytes or canonical row hash');
    verifyProofFiles(cache.dir, row); return row;
  });
  const receipt = { ...saved.receiptHeader, result: { ...saved.resultHeader, rows } };
  if (contentHash(receipt) !== saved.originalReceiptHash) gateFail('Lossless original all-board receipt hash differs');
  validateModel11GateReceipt(receipt, { operation: 'all-boards', binding });
  return receipt; // Serialization equality alone is not policy/zero-proof acceptance.
}
export function consumeModel11AllBoardReceipt(saved, checkpointRoot, { inputs, flop, later, binding, outputSource, assertUnchanged }) {
  if (typeof assertUnchanged !== 'function') gateFail('Consumption requires current source/input/artifact identity rechecks');
  const receipt = materializeModel11AllBoardReceipt(saved, checkpointRoot, { binding, outputSource });
  const dir = resolve(checkpointRoot, model11CheckpointIdentityHash(binding));
  const requireExistingUnchanged = () => {
    assertUnchanged();
    if (!same(auditFileRecord(dir, 'identity.json'), saved.checkpointIdentity)) gateFail('All-board checkpoint identity changed while consuming');
    for (const ref of saved.rowReferences) {
      const { index, board, rowHash, ...record } = ref;
      if (!same(auditFileRecord(dir, ref.path), record)) gateFail('Consumption refuses missing/changed checkpoints before any generation');
    }
  };
  requireExistingUnchanged();
  // This is the original semantic row/whole-support zero-proof verifier and exact
  // aggregate/status logic. Every checkpoint exists first; if one disappears,
  // the unchanged driver's pre-generation assertion fails before model11BoardRow.
  const result = runModel11AllBoards(inputs, flop, later, binding, checkpointRoot, { assertUnchanged: requireExistingUnchanged,
    onBoard() { gateFail('Storage consumption must never create a checkpoint'); } });
  if (!same(result, receipt.result)) gateFail('Original semantic all-board validation/aggregate differs from materialized evidence');
  requireExistingUnchanged();
  return receipt;
}
