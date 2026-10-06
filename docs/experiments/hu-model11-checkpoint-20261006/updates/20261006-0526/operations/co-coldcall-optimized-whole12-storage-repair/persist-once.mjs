// Exact frozen persist function; only accepts/reuses the already computed whole-balance hash.
import { gateFail } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
import { contentHash } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
const CHUNK_BYTES = 8 * 1024 * 1024;
export function persistCompletionRepresentativeBalance(store, balance, originalBalanceHash) {
  const { prefixCoverage, ...header } = balance;
  if (!Array.isArray(prefixCoverage)) gateFail('Original strict balance coverage is missing');
  const proofHashes = new Set(), chunks = []; let pending = [], bytes = 0, startIndex = 0;
  const flush = () => {
    if (!pending.length) return;
    const path = `balance.${String(chunks.length).padStart(3, '0')}.prefixes.json`;
    chunks.push({ ...store.write(path, { kind: 'model11-original-strict-balance-prefix-part', version: 1, bindingHash: store.bindingHash, startIndex, rows: pending }),
      startIndex, count: pending.length, rowHash: contentHash(pending) });
    startIndex += pending.length; pending = []; bytes = 0;
  };
  for (const row of prefixCoverage) {
    let compact = row;
    if (row.zeroLikelihoodProof) {
      store.putProof(row.zeroLikelihoodProof); proofHashes.add(row.zeroLikelihoodProof.proofHash);
      compact = { ...row, zeroLikelihoodProof: { proofHash: row.zeroLikelihoodProof.proofHash } };
    }
    const n = Buffer.byteLength(JSON.stringify(compact));
    if (n > CHUNK_BYTES) gateFail('A strict balance row exceeds the evidence bound');
    if (pending.length && (bytes + n > CHUNK_BYTES || pending.length === 128)) flush();
    pending.push(compact); bytes += n;
  }
  flush();
  return { kind: 'model11-original-strict-balance-partitioned-evidence', version: 1, bindingHash: store.bindingHash,
    originalKind: balance.kind, originalVersion: balance.version, complete: balance.complete, selectedBoards: balance.selectedBoards,
    findings: balance.findings, results: balance.results, prefixCoverageCount: prefixCoverage.length, balanceHash: originalBalanceHash,
    header: store.write('balance.header.json', { bindingHash: store.bindingHash, header }), prefixChunks: chunks,
    proofs: [...proofHashes].sort().map(hash => store.record(`${hash}.proof.json`)) };
}
