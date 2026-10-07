import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { AUDIT_REPOSITORY, captureSourceGraph } from './audit-identity.mjs';

const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sourceRoot = 'apps/frontend/scripts/postflop-ai/audit-all-boards.mjs';
const sourceDirectory = resolve(AUDIT_REPOSITORY, 'apps/frontend/scripts/postflop-ai');

export function allBoardIdentity(inputs, candidate, laterCandidate, street) {
  return { version: 1, spot: inputs.spot.id, street, source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, later_policy_hash: laterCandidate?.metadata.policy_hash ?? null,
    config: inputs.config,
    code: captureSourceGraph({ roots: [sourceRoot] }).map(item => ({
      path: relative(sourceDirectory, resolve(AUDIT_REPOSITORY, item.path)).replaceAll('\\', '/'), sha256: item.sha256 })) };
}

export function assertAllBoardRunIdentity(inputs, candidate, laterCandidate, street, expectedIdentityHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedIdentityHash ?? '') ||
      sha(allBoardIdentity(inputs, candidate, laterCandidate, street)) !== expectedIdentityHash) {
    throw new Error('All-board source/config/input/policy identity changed during execution');
  }
}

// Result lineage is separate from the mutable summary.md index. Never truncate
// an earlier revision, or replace different bytes under the same run identity.
export function allBoardSummaryName(spotId, identityHash) {
  if (!/^[A-Za-z0-9_]+$/.test(spotId) || !/^[a-f0-9]{64}$/.test(identityHash)) throw new Error('Exact spot and full all-board identity hash are required');
  return `${spotId}--${identityHash}.json`;
}

const MAX_CHECKPOINT_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

// Check ancestors from the filesystem root downward so an existing file or
// dangling symlink is rejected before inspecting/creating any child beneath it.
function assertSafePath(path, kind = 'file') {
  const target = resolve(path), paths = [];
  for (let current = target;; current = dirname(current)) {
    paths.push(current);
    if (dirname(current) === current) break;
  }
  let targetStat = null;
  for (const current of paths.reverse()) {
    let stat;
    try { stat = lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const directory = current !== target || kind === 'directory';
    if (stat && (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))) throw new Error('Refuse symlink or nonregular all-board output/checkpoint path');
    if (current === target) targetStat = stat ?? null;
  }
  return targetStat;
}

function readSafeBytes(path, limit = MAX_OUTPUT_BYTES) {
  if (!assertSafePath(path)) throw new Error(`Missing all-board checkpoint/output: ${path}`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('Nonregular or oversized all-board checkpoint/output');
    const bytes = readFileSync(fd);
    if (bytes.length !== stat.size || bytes.length > limit) throw new Error('All-board checkpoint/output changed while reading');
    return bytes;
  } finally { closeSync(fd); }
}

// A fully written temporary inode is linked into the final name exclusively.
// linkSync never replaces a concurrent winner; EEXIST must pass the supplied
// identity/row validation and exact-byte comparison before reuse is allowed.
function commitExclusive(path, body, validateExisting, limit = MAX_OUTPUT_BYTES) {
  if (!Buffer.isBuffer(body) || body.length > limit) throw new Error('Invalid or oversized all-board checkpoint/output bytes');
  assertSafePath(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  let owned = false;
  try {
    assertSafePath(temporary);
    const fd = openSync(temporary, 'wx', 0o644);
    owned = true;
    try { writeFileSync(fd, body); } finally { closeSync(fd); }
    assertSafePath(temporary);
    assertSafePath(path);
    try { linkSync(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = readSafeBytes(path, limit);
      validateExisting(existing);
      if (!existing.equals(body)) throw new Error('Existing identity-specific all-board output differs; historical bytes cannot be overwritten');
      return { reused: true };
    }
    return { reused: false };
  } finally {
    if (owned) unlinkSync(temporary);
  }
}

export function writeImmutableAllBoardOutput(path, value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return commitExclusive(resolve(path), body, () => {});
}

export function validBoardCheckpoint(row, allowedBoards) {
  return Boolean(row && allowedBoards.has(row.board) && Array.isArray(row.findings) &&
    (row.unreachable === undefined || row.unreachable === true && row.findings.length === 0) &&
    row.findings.every(f => ['warn','error'].includes(f.severity) && ['flop','later'].includes(f.street) &&
      typeof f.check === 'string' && typeof f.node === 'string') &&
    Object.values(row.later_coverage ?? {}).every(n => Number.isInteger(n) && n >= 0));
}

export function openBoardCheckpoints(base, identity, boardIds) {
  const key = sha(identity), dir = resolve(base, key), allowed = new Set(boardIds), rows = new Map();
  if (!Array.isArray(boardIds) || allowed.size !== boardIds.length || boardIds.some(id => !/^(?:[2-9TJQKA][cdhs]){3}$/.test(id))) throw new Error('Invalid checkpoint board set');
  assertSafePath(dir, 'directory');
  mkdirSync(dir, { recursive: true });
  assertSafePath(dir, 'directory');
  const identityPath = join(dir, 'identity.json');
  const identityBytes = Buffer.from(JSON.stringify(identity, null, 2) + '\n');
  const validateIdentity = bytes => {
    let saved;
    try { saved = JSON.parse(bytes); } catch { throw new Error('Checkpoint identity is malformed'); }
    if (JSON.stringify(saved) !== JSON.stringify(identity) || !bytes.equals(identityBytes)) throw new Error('Checkpoint identity differs');
  };
  commitExclusive(identityPath, identityBytes, validateIdentity, MAX_CHECKPOINT_BYTES);
  const file = id => {
    if (!allowed.has(id) || !/^(?:[2-9TJQKA][cdhs]){3}$/.test(id)) throw new Error('Invalid checkpoint board');
    return join(dir, `${id}.json`);
  };
  const validateCheckpoint = (bytes, id, expectedRow = null) => {
    let value;
    try { value = JSON.parse(bytes); } catch { throw new Error(`Corrupt board checkpoint ${id}`); }
    if (value.key !== key || value.row?.board !== id || !validBoardCheckpoint(value.row, allowed) || value.sha256 !== sha(value.row) ||
        JSON.stringify(value) !== JSON.stringify({ key, row: value.row, sha256: sha(value.row) }) ||
        !bytes.equals(Buffer.from(JSON.stringify(value) + '\n'))) throw new Error(`Corrupt board checkpoint ${id}`);
    if (expectedRow && sha(value.row) !== sha(expectedRow)) throw new Error(`Non-deterministic board checkpoint ${id}`);
    return value.row;
  };
  for (const id of boardIds) {
    const path = file(id);
    if (assertSafePath(path)) rows.set(id, validateCheckpoint(readSafeBytes(path, MAX_CHECKPOINT_BYTES), id));
  }
  return { key, dir, rows, write(row) {
    if (!validBoardCheckpoint(row, allowed)) throw new Error('Invalid board audit result');
    const prior = rows.get(row.board);
    if (prior && sha(prior) !== sha(row)) throw new Error(`Non-deterministic board checkpoint ${row.board}`);
    // Revalidate disk state even for a row already cached in this process.
    validateIdentity(readSafeBytes(identityPath, MAX_CHECKPOINT_BYTES));
    const path = file(row.board), body = Buffer.from(JSON.stringify({ key, row, sha256: sha(row) }) + '\n');
    commitExclusive(path, body, bytes => validateCheckpoint(bytes, row.board, row), MAX_CHECKPOINT_BYTES);
    rows.set(row.board, row);
  } };
}
