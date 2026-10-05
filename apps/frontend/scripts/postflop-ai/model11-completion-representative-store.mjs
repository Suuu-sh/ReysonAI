// Fixed representative evidence partitions, using existing immutable path/writer guards.
import { closeSync, constants, fstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openBoardCheckpoints, writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { auditFileRecord } from './audit-identity.mjs';
import { exactKeys, gateFail, same } from './model11-gate-contract.mjs';
import { contentHash } from './effective-law-identity.mjs';
const CHUNK_BYTES = 8 * 1024 * 1024;
export function openCompletionRepresentativeEvidence(base, binding, { fresh = false } = {}) {
  const bindingHash = contentHash(binding);
  const cache = openBoardCheckpoints(base, { kind: 'model11-completion-representative-evidence', version: 1, bindingHash }, []);
  const file = name => join(cache.dir, name);
  const record = name => auditFileRecord(cache.dir, name);
  const write = (name, value) => { writeImmutableAllBoardOutput(file(name), JSON.stringify(value) + '\n'); return record(name); };
  const read = (name, expected = null) => {
    const before = record(name);
    if (before.bytes > 16 * 1024 * 1024 || expected && !same(before, expected)) gateFail('Persisted completion evidence is oversized or changed');
    const fd = openSync(file(name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size !== before.bytes) gateFail('Completion evidence changed before bounded read');
      const bytes = Buffer.alloc(stat.size); let at = 0;
      while (at < bytes.length) { const n = readSync(fd, bytes, at, bytes.length - at, at); if (!n) gateFail('Truncated completion evidence'); at += n; }
      const extra = Buffer.alloc(1), after = fstatSync(fd);
      if (readSync(fd, extra, 0, 1, at) || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino ||
          createHash('sha256').update(bytes).digest('hex') !== before.sha256 || !same(record(name), before)) gateFail('Completion evidence changed during bounded read');
      return JSON.parse(bytes.toString('utf8'));
    } finally { closeSync(fd); }
  };
  const cellName = index => `${String(index).padStart(3, '0')}.cell.json`;
  const hasCell = index => { try { record(cellName(index)); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
  if (fresh) {
    // Audit cannot reuse a report/checkpoint. Any old cell/chunk/proof evidence blocks
    // this destination; the caller must supply a new independently empty root.
    if (readdirSync(cache.dir).some(name => name !== 'identity.json')) gateFail('Fresh audit evidence directory already contains results');
  }
  const putProof = proof => {
    const { proofHash, ...body } = proof ?? {};
    if (!/^[a-f0-9]{64}$/.test(proofHash) || contentHash(body) !== proofHash) gateFail('Invalid proof bytes for immutable store');
    write(`${proofHash}.proof.json`, { bindingHash, proof });
  };
  const readProof = hash => {
    if (!/^[a-f0-9]{64}$/.test(hash)) gateFail('Invalid proof reference');
    const envelope = read(`${hash}.proof.json`);
    if (!exactKeys(envelope, ['bindingHash', 'proof']) || envelope.bindingHash !== bindingHash || envelope.proof?.proofHash !== hash) gateFail('Proof belongs to another binding');
    return envelope.proof;
  };
  const beginCell = (index, cell) => {
    let pending = [], pendingBytes = 0, startIndex = 0;
    const chunks = [], cellIdentity = contentHash(cell);
    const flush = () => {
      if (!pending.length) return;
      const name = `${String(index).padStart(3, '0')}.${String(chunks.length).padStart(3, '0')}.trials.json`;
      const body = { kind: 'model11-completion-representative-trial-chunk', version: 1, bindingHash, cellIdentity, startIndex, trials: pending };
      chunks.push({ ...write(name, body), startIndex, count: pending.length, trialHash: contentHash(pending) });
      startIndex += pending.length; pending = []; pendingBytes = 0;
    };
    return { append(trial) {
      const bytes = Buffer.byteLength(JSON.stringify(trial));
      if (bytes > CHUNK_BYTES) gateFail('A single completion trial exceeds the bounded evidence partition');
      if (pending.length && pendingBytes + bytes > CHUNK_BYTES) flush();
      pending.push(trial); pendingBytes += bytes;
      // Evidence boundaries do not call the RNG or release/reseed execution caches.
      if ((trial.index + 1) % cell.cacheBatchSize === 0) flush();
    }, finish() { flush(); if (startIndex !== cell.samples) gateFail('Partial cell cannot receive a completion marker'); return chunks; } };
  };
  return { dir: cache.dir, bindingHash, cellName, hasCell, record, read, write, putProof, readProof, beginCell };
}

// Partition the *already computed original aggregate* without changing thresholds,
// board aggregation, coverage rows or warnings. Rehydration must recover every byte.
export function persistCompletionRepresentativeBalance(store, balance) {
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
    findings: balance.findings, results: balance.results, prefixCoverageCount: prefixCoverage.length, balanceHash: contentHash(balance),
    header: store.write('balance.header.json', { bindingHash: store.bindingHash, header }), prefixChunks: chunks,
    proofs: [...proofHashes].sort().map(hash => store.record(`${hash}.proof.json`)) };
}
export function readCompletionRepresentativeBalance(store, saved) {
  if (!exactKeys(saved, ['kind', 'version', 'bindingHash', 'originalKind', 'originalVersion', 'complete', 'selectedBoards', 'findings', 'results', 'prefixCoverageCount', 'balanceHash', 'header', 'prefixChunks', 'proofs']) ||
      saved.kind !== 'model11-original-strict-balance-partitioned-evidence' || saved.version !== 1 || saved.bindingHash !== store.bindingHash ||
      !Array.isArray(saved.prefixChunks) || !Array.isArray(saved.proofs)) gateFail('Malformed/stale strict balance evidence');
  const header = store.read(saved.header.path, saved.header);
  if (!exactKeys(header, ['bindingHash', 'header']) || header.bindingHash !== store.bindingHash) gateFail('Strict balance header binding differs');
  const prefixCoverage = [], hashes = new Set();
  for (const ref of saved.prefixChunks) {
    if (!exactKeys(ref, ['path', 'bytes', 'sha256', 'startIndex', 'count', 'rowHash']) || ref.startIndex !== prefixCoverage.length ||
        !Number.isSafeInteger(ref.count) || ref.count < 1 || ref.count > 128) gateFail('Strict balance prefix partition is incomplete');
    const { startIndex, count, rowHash, ...record } = ref, part = store.read(ref.path, record);
    if (!exactKeys(part, ['kind', 'version', 'bindingHash', 'startIndex', 'rows']) || part.kind !== 'model11-original-strict-balance-prefix-part' || part.version !== 1 ||
        part.bindingHash !== store.bindingHash || part.startIndex !== startIndex || !Array.isArray(part.rows) || part.rows.length !== count || contentHash(part.rows) !== rowHash) gateFail('Strict balance prefix evidence changed');
    for (const row of part.rows) {
      if (row.zeroLikelihoodProof) {
        if (!exactKeys(row.zeroLikelihoodProof, ['proofHash'])) gateFail('Invalid strict zero-proof reference');
        const hash = row.zeroLikelihoodProof.proofHash, proofRecord = saved.proofs.find(record => record.path === `${hash}.proof.json`);
        if (!proofRecord || !same(store.record(proofRecord.path), proofRecord)) gateFail('Missing/tampered strict balance zero proof');
        hashes.add(hash); prefixCoverage.push({ ...row, zeroLikelihoodProof: store.readProof(hash) });
      } else prefixCoverage.push(row);
    }
  }
  const result = { ...header.header, prefixCoverage };
  if (prefixCoverage.length !== saved.prefixCoverageCount || contentHash(result) !== saved.balanceHash ||
      !same(saved.proofs.map(record => record.path), [...hashes].sort().map(hash => `${hash}.proof.json`)) ||
      result.kind !== saved.originalKind || result.version !== saved.originalVersion || result.complete !== saved.complete || result.selectedBoards !== saved.selectedBoards ||
      !same(result.findings, saved.findings) || !same(result.results, saved.results)) gateFail('Strict balance aggregate/coverage/hash differs');
  return result;
}
