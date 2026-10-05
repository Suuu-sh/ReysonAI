// Narrow original1e417 -> local-law-memo lineage. No general source migration.
import { contentHash } from './effective-law-identity.mjs';
import { exactKeys, same, gateFail } from './model11-gate-contract.mjs';

export const ORIGINAL_COMMIT = '1e417d24cd123d85039545eecebe0154e5ecf8c4';
export const REVIEWED_MEMO_COMMIT = '7911d9a54acd2c3d67db0e3d48b2aad08bb339fc';
export const EQUIVALENCE_ARCHIVES = Object.freeze({
  fullProof96: 'd02770c7c7412df060e1a4e7f1056138fd3d85a6b370cfed4f484ec868d08f4a',
  independentReview: 'c84ad079d7f3c5d5cb2f6380900e7c9507aea664cc7000c325e49b39156dc9ab',
});
// This is the complete cross-source exclusion list, not recursive key filtering.
// Every excluded value is validated against its own source or referenced bytes.
export const SOURCE_WRAPPER_ALLOWLIST = Object.freeze([
  'binding.source', 'binding.strictBalance.source', 'report.bindingHash',
  'report.cellRecords[].bytes', 'report.cellRecords[].sha256', 'report.cellRecords[].numericalHash', 'report.numericalHash',
  'cell.bindingHash', 'cell.chunks[].bytes', 'cell.chunks[].sha256', 'cell.proofs[].bytes', 'cell.proofs[].sha256',
  'chunk.bindingHash', 'proofEnvelope.bindingHash',
]);
const REPORT_KEYS = ['kind', 'version', 'binding', 'bindingHash', 'status', 'acceptance', 'cellRecords', 'counts', 'results', 'numericalHash', 'warnings'];
const CELL_KEYS = ['kind', 'version', 'bindingHash', 'cell', 'cellIdentity', 'unreachable', 'row', 'chunks', 'proofs'];
const RECORD_KEYS = ['path', 'bytes', 'sha256'];
const hashPattern = /^[a-f0-9]{64}$/;
const eq = (a, b, what) => { if (!same(a, b)) gateFail(`Dual-source ${what} differs`); };
export function validateDualSourceBindingPair(original, fresh) {
  const keys = ['kind', 'version', 'spot', 'sourceFingerprint', 'source', 'files', 'plan', 'planIdentity', 'strictBalance',
    'compositeExecution', 'behaviorPolicyIdentity', 'belief', 'artifactProvenance'];
  const strictKeys = ['kind', 'version', 'spot', 'sourceFingerprint', 'source', 'files', 'execution', 'belief', 'artifactProvenance', 'plan', 'planIdentity'];
  const neutral = binding => {
    if (!exactKeys(binding, keys) || !exactKeys(binding.strictBalance, strictKeys) ||
        binding.kind !== 'model11-strict-balance-composite-behavior-representative-binding' || binding.version !== 1 ||
        binding.planIdentity !== contentHash(binding.plan) || !same(binding.source.strictBalance, binding.strictBalance.source)) gateFail('Invalid dual-source binding');
    const { source, strictBalance, ...rest } = binding, { source: strictSource, ...strictRest } = strictBalance;
    return { ...rest, strictBalance: strictRest };
  };
  eq(neutral(original), neutral(fresh), 'non-source binding fields');
  if (same(original.source, fresh.source) || contentHash(original) === contentHash(fresh)) gateFail('Dual-source audit requires two distinct honest source bindings');
}
export function validateDualSourceReport(report, binding, expectedCells) {
  if (!exactKeys(report, REPORT_KEYS) || report.kind !== 'model11-composite-behavior-representative-for-independent-replay' || report.version !== 1 ||
      !same(report.binding, binding) || report.bindingHash !== contentHash(binding) ||
      report.numericalHash !== contentHash({ cellRecords: report.cellRecords, counts: report.counts, results: report.results }) ||
      !Array.isArray(report.cellRecords) || report.cellRecords.length !== expectedCells ||
      !Array.isArray(report.results) || report.results.length !== expectedCells || !Array.isArray(report.warnings)) gateFail('Malformed or incomplete dual-source report');
  for (const [index, record] of report.cellRecords.entries()) {
    if (!exactKeys(record, [...RECORD_KEYS, 'numericalHash']) || record.path !== `${String(index).padStart(3, '0')}.cell.json` ||
        !hashPattern.test(record.numericalHash)) gateFail('Missing, extra, or reordered dual-source cell reference');
    validateRecord(record, [...RECORD_KEYS, 'numericalHash']);
  }
  return report;
}
function validateRecord(record, keys = RECORD_KEYS) {
  if (!exactKeys(record, keys) || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || !hashPattern.test(record.sha256)) gateFail('Malformed dual-source file record');
}
function readCell(store, index, binding, expectedRecord) {
  const path = store.cellName(index), actual = store.record(path);
  if (expectedRecord) {
    const { numericalHash, ...record } = expectedRecord;
    eq(actual, record, 'cell file reference');
  }
  const cell = store.read(path, actual);
  if (!exactKeys(cell, CELL_KEYS) || cell.kind !== 'model11-completion-representative-cell' || cell.version !== 1 ||
      cell.bindingHash !== contentHash(binding) || cell.cellIdentity !== contentHash(cell.cell) ||
      !Array.isArray(cell.chunks) || !Array.isArray(cell.proofs) || typeof cell.unreachable !== 'boolean' ||
      expectedRecord && contentHash(cell) !== expectedRecord.numericalHash) gateFail('Invalid own-source cell wrapper');
  return cell;
}
function readChunk(store, cell, ref, index, chunkIndex, next) {
  const keys = [...RECORD_KEYS, 'startIndex', 'count', 'trialHash'];
  validateRecord(ref, keys);
  if (ref.path !== `${String(index).padStart(3, '0')}.${String(chunkIndex).padStart(3, '0')}.trials.json` || ref.startIndex !== next ||
      !Number.isSafeInteger(ref.count) || ref.count < 1 || ref.count > cell.cell.cacheBatchSize || !hashPattern.test(ref.trialHash)) gateFail('Reordered/omitted dual-source chunk');
  const { startIndex, count, trialHash, ...record } = ref, chunk = store.read(ref.path, record);
  if (!exactKeys(chunk, ['kind', 'version', 'bindingHash', 'cellIdentity', 'startIndex', 'trials']) ||
      chunk.kind !== 'model11-completion-representative-trial-chunk' || chunk.version !== 1 || chunk.bindingHash !== cell.bindingHash ||
      chunk.cellIdentity !== cell.cellIdentity || chunk.startIndex !== next || !Array.isArray(chunk.trials) || chunk.trials.length !== count ||
      contentHash(chunk.trials) !== trialHash || chunk.trials.some((trial, i) => trial.index !== next + i)) gateFail('Invalid own-source ordered chunk');
  const { bindingHash, ...neutral } = chunk;
  return neutral;
}
function readProof(store, cell, ref) {
  validateRecord(ref);
  if (!/^[a-f0-9]{64}\.proof\.json$/.test(ref.path)) gateFail('Invalid dual-source proof path');
  const envelope = store.read(ref.path, ref);
  if (!exactKeys(envelope, ['bindingHash', 'proof']) || envelope.bindingHash !== cell.bindingHash) gateFail('Wrong proof source attribution');
  const { proofHash, ...body } = envelope.proof ?? {};
  if (ref.path !== `${proofHash}.proof.json` || contentHash(body) !== proofHash) gateFail('Tampered full proof body');
  eq(store.readProof(proofHash), envelope.proof, 'own-source proof read');
  return envelope.proof;
}
// Call only after independent semantic validation under each actual source. This
// additional comparison checks exact values, not only a digest of the two trees.
export function compareDualSourceCell(originalStore, freshStore, originalBinding, freshBinding, index, originalRecord, freshRecord) {
  const a = readCell(originalStore, index, originalBinding, originalRecord), b = readCell(freshStore, index, freshBinding, freshRecord);
  const neutralHeader = cell => { const { bindingHash, chunks, proofs, ...header } = cell; return header; };
  eq(neutralHeader(a), neutralHeader(b), 'cell identity, metrics and counts');
  if (a.chunks.length !== b.chunks.length || a.proofs.length !== b.proofs.length) gateFail('Omitted dual-source chunk/proof');
  const trialChunks = [], proofBodies = []; let next = 0;
  for (let i = 0; i < a.chunks.length; i++) {
    const ac = readChunk(originalStore, a, a.chunks[i], index, i, next), bc = readChunk(freshStore, b, b.chunks[i], index, i, next);
    const neutralRef = ({ bytes, sha256, ...rest }) => rest;
    eq(neutralRef(a.chunks[i]), neutralRef(b.chunks[i]), 'ordered chunk reference');
    eq(ac, bc, 'ordered trial return/event/law payload');
    trialChunks.push(contentHash({ reference: neutralRef(a.chunks[i]), chunk: ac })); next += ac.trials.length;
  }
  if (next !== (a.unreachable ? 0 : a.cell.samples) || a.unreachable && a.proofs.length) gateFail('Incomplete neutral trial coverage');
  const paths = a.proofs.map(ref => ref.path);
  if (new Set(paths).size !== paths.length || !same(paths, [...paths].sort())) gateFail('Reordered/duplicate proof references');
  for (let i = 0; i < a.proofs.length; i++) {
    eq(a.proofs[i].path, b.proofs[i].path, 'ordered proof reference');
    const ap = readProof(originalStore, a, a.proofs[i]), bp = readProof(freshStore, b, b.proofs[i]);
    eq(ap, bp, 'complete rehydrated proof body'); proofBodies.push(contentHash({ path: a.proofs[i].path, proof: ap }));
  }
  return { index, numericalPayloadHash: contentHash({ cell: neutralHeader(a), trialChunks, proofBodies }), trials: next, proofBodies: proofBodies.length };
}
export function compareDualSourceReports(original, fresh, cells) {
  validateDualSourceBindingPair(original.binding, fresh.binding);
  validateDualSourceReport(original, original.binding, cells.length); validateDualSourceReport(fresh, fresh.binding, cells.length);
  const neutral = ({ binding, bindingHash, cellRecords, numericalHash, ...body }) => body;
  eq(neutral(original), neutral(fresh), 'report metrics, counts, statuses and warnings');
  if (cells.some((cell, i) => cell.index !== i || !hashPattern.test(cell.numericalPayloadHash))) gateFail('Incomplete/reordered neutral cell coverage');
  return contentHash({ report: neutral(original), orderedCellPayloads: cells });
}
