import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { AUDIT_REPOSITORY, captureSourceGraph } from './audit-identity.ts';

const sha = (value: any) : any => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sourceRoot = 'apps/frontend/scripts/postflop-ai/audit-all-boards.ts';
const sourceDirectory = resolve(AUDIT_REPOSITORY, 'apps/frontend/scripts/postflop-ai');

export function allBoardIdentity(inputs?: any, candidate?: any, laterCandidate?: any, street?: any) : any {
  return { version: 1, spot: inputs.spot.id, street, source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, later_policy_hash: laterCandidate?.metadata.policy_hash ?? null,
    config: inputs.config,
    code: captureSourceGraph({ roots: [sourceRoot] }).map((item: any) : any => ({
      path: relative(sourceDirectory, resolve(AUDIT_REPOSITORY, item.path)).replaceAll('\\', '/'), sha256: item.sha256 })),
    // Unadjusted HU retains the adopted identity shape. Adjusted/profile runs
    // additionally pin provenance of both raw roles, not only their composition.
    ...(inputs.adjusted || inputs.opponentProfile && inputs.opponentProfile !== 'standard' ? {
      adjustment: { structure_hash: inputs.structure_hash, tableProfile: inputs.tableProfile ?? null,
        opponentProfile: inputs.opponentProfile ?? 'standard', opponentSeat: inputs.opponentSeat ?? null,
        flop_role_policy_hashes: candidate.metadata.role_policy_hashes ?? null,
        later_role_policy_hashes: laterCandidate?.metadata.role_policy_hashes ?? null,
        flop_role_source_hashes: candidate.profileCandidates ? Object.fromEntries(Object.entries<any>(candidate.profileCandidates)
          .map(([role, raw]: any) : any => [role, raw.metadata.source_hash])) : null,
        later_role_source_hashes: laterCandidate?.profileCandidates ? Object.fromEntries(Object.entries<any>(laterCandidate.profileCandidates)
          .map(([role, raw]: any) : any => [role, raw.metadata.source_hash])) : null },
    } : {}) };
}

export function assertAllBoardRunIdentity(inputs?: any, candidate?: any, laterCandidate?: any, street?: any, expectedIdentityHash?: any) : any {
  if (!/^[a-f0-9]{64}$/.test(expectedIdentityHash ?? '') ||
      sha(allBoardIdentity(inputs, candidate, laterCandidate, street)) !== expectedIdentityHash) {
    throw new Error('All-board source/config/input/policy identity changed during execution');
  }
}

// Result lineage is separate from the mutable summary.md index. Never truncate
// an earlier revision, or replace different bytes under the same run identity.
export function allBoardSummaryName(spotId?: any, identityHash?: any) : any {
  if (!/^[A-Za-z0-9_]+$/.test(spotId) || !/^[a-f0-9]{64}$/.test(identityHash)) throw new Error('Exact spot and full all-board identity hash are required');
  return `${spotId}--${identityHash}.json`;
}

const MAX_CHECKPOINT_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

// Check ancestors from the filesystem root downward so an existing file or
// dangling symlink is rejected before inspecting/creating any child beneath it.
function assertSafePath(path?: any, kind: any = 'file') : any {
  const target = resolve(path), paths: any[] = [];
  for (let current = target;; current = dirname(current)) {
    paths.push(current);
    if (dirname(current) === current) break;
  }
  let targetStat: any = null;
  for (const current of paths.reverse()) {
    let stat: any;
    try { stat = lstatSync(current); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    const directory = current !== target || kind === 'directory';
    if (stat && (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))) throw new Error('Refuse symlink or nonregular all-board output/checkpoint path');
    if (current === target) targetStat = stat ?? null;
  }
  return targetStat;
}

function readSafeBytes(path?: any, limit: any = MAX_OUTPUT_BYTES) : any {
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
function commitExclusive(path?: any, body?: any, validateExisting?: any, limit: any = MAX_OUTPUT_BYTES) : any {
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
    catch (error: any) {
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

export function writeImmutableAllBoardOutput(path?: any, value?: any) : any {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return commitExclusive(resolve(path), body, () : any => {});
}

export function validBoardCheckpoint(row?: any, allowedBoards?: any) : any {
  return Boolean(row && allowedBoards.has(row.board) && Array.isArray(row.findings) &&
    (row.unreachable === undefined || row.unreachable === true && row.findings.length === 0) &&
    row.findings.every((f: any) : any => ['warn','error'].includes(f.severity) && ['flop','later'].includes(f.street) &&
      typeof f.check === 'string' && typeof f.node === 'string') &&
    Object.values<any>(row.later_coverage ?? {}).every((n: any) : any => Number.isInteger(n) && n >= 0));
}

export function openBoardCheckpoints(base?: any, identity?: any, boardIds?: any) : any {
  const key = sha(identity), dir = resolve(base, key), allowed = new Set(boardIds), rows = new Map();
  if (!Array.isArray(boardIds) || allowed.size !== boardIds.length || boardIds.some((id: any) : any => !/^(?:[2-9TJQKA][cdhs]){3}$/.test(id))) throw new Error('Invalid checkpoint board set');
  assertSafePath(dir, 'directory');
  mkdirSync(dir, { recursive: true });
  assertSafePath(dir, 'directory');
  const identityPath = join(dir, 'identity.json');
  const identityBytes = Buffer.from(JSON.stringify(identity, null, 2) + '\n');
  const validateIdentity = (bytes: any) : any => {
    let saved: any;
    try { saved = JSON.parse(bytes); } catch { throw new Error('Checkpoint identity is malformed'); }
    if (JSON.stringify(saved) !== JSON.stringify(identity) || !bytes.equals(identityBytes)) throw new Error('Checkpoint identity differs');
  };
  commitExclusive(identityPath, identityBytes, validateIdentity, MAX_CHECKPOINT_BYTES);
  const file = (id: any) : any => {
    if (!allowed.has(id) || !/^(?:[2-9TJQKA][cdhs]){3}$/.test(id)) throw new Error('Invalid checkpoint board');
    return join(dir, `${id}.json`);
  };
  const validateCheckpoint = (bytes?: any, id?: any, expectedRow: any = null) : any => {
    let value: any;
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
  return { key, dir, rows, write(row?: any) : any {
    if (!validBoardCheckpoint(row, allowed)) throw new Error('Invalid board audit result');
    const prior = rows.get(row.board);
    if (prior && sha(prior) !== sha(row)) throw new Error(`Non-deterministic board checkpoint ${row.board}`);
    // Revalidate disk state even for a row already cached in this process.
    validateIdentity(readSafeBytes(identityPath, MAX_CHECKPOINT_BYTES));
    const path = file(row.board), body = Buffer.from(JSON.stringify({ key, row, sha256: sha(row) }) + '\n');
    commitExclusive(path, body, (bytes: any) : any => validateCheckpoint(bytes, row.board, row), MAX_CHECKPOINT_BYTES);
    rows.set(row.board, row);
  } };
}
