// Bounded, byte-pinned companion for an already completed audit. No simulation.
// The active runner/checkpoint format and its original summary are unchanged.
import { isDeepStrictEqual } from 'node:util';
import { canonicalFlops } from './flop-isomorphism.mjs';
import { allBoardSummaryName } from './all-board-checkpoints.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { seededRandom, seedFor } from '../lib/equity.mjs';
import { ARTIFACT_PREFIX, LIMITS, sha256, validHash } from './reviewed-postflop-archive.mjs';

const hashJSON = value => sha256(JSON.stringify(value));
const coverageKeys = ['flops', 'reachable_flops', 'turn_boards', 'unreachable_turn_boards', 'river_runouts', 'unreachable_river_runouts'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const fail = message => { throw new Error(message); };
export const summaryPathFor = (id, identityHash) => `${ARTIFACT_PREFIX}all-boards-audit/${allBoardSummaryName(id, identityHash)}`;
export const companionPathFor = (id, identityHash) => summaryPathFor(id, identityHash).replace(/\.json$/, '.checkpoints.json');

export function assertCompanionRow(row, expectedBoard) {
  if (!row || row.board !== expectedBoard || !Array.isArray(row.findings) || row.findings.length > 2048) fail('Missing, duplicate or noncanonical all-board checkpoint row');
  if (row.unreachable === true) {
    if (!exactKeys(row, ['board', 'unreachable', 'findings']) || row.findings.length) fail('Unreachable checkpoint must have no evaluated findings or coverage');
    return;
  }
  if (!exactKeys(row, ['board', 'later_coverage', 'findings']) || !exactKeys(row.later_coverage, coverageKeys)) fail('Every evaluated board requires its own complete later-street coverage');
  const c = row.later_coverage;
  if (coverageKeys.some(key => !Number.isSafeInteger(c[key]) || c[key] < 0) || c.flops !== 1 || c.reachable_flops !== 1 ||
      c.turn_boards + c.unreachable_turn_boards !== 4 || c.river_runouts + c.unreachable_river_runouts !== 12) fail('Per-board coverage must account for all four sampled turns and twelve sampled rivers');
  for (const f of row.findings) {
    if (!exactKeys(f, f.direction === undefined ? ['check', 'severity', 'node', 'street'] : ['check', 'severity', 'node', 'street', 'direction']) ||
        !['warn', 'error'].includes(f.severity) || !['flop', 'later'].includes(f.street) ||
        typeof f.check !== 'string' || !/^[a-z0-9-]{1,80}$/.test(f.check) ||
        typeof f.node !== 'string' || !/^[A-Za-z0-9_ /-]{1,100}$/.test(f.node) ||
        f.direction !== undefined && !['under', 'over'].includes(f.direction)) fail('Malformed or oversized checkpoint finding');
  }
}

// Match the frozen runner exactly, including duplicate finding occurrences on
// one board. Its historical field name `boards` is an occurrence count.
export function summarizeCompanionRows(rows) {
  const counts = new Map();
  for (const row of rows) for (const f of row.findings) {
    const key = `${f.street} ${f.severity} ${f.check}${f.direction ? `(${f.direction})` : ''} ${f.node}`;
    const entry = counts.get(key) ?? { key, boards: 0, examples: [] };
    entry.boards++; if (entry.examples.length < 5) entry.examples.push(row.board);
    counts.set(key, entry);
  }
  const findings = [...counts.values()].sort((a, b) => b.boards - a.boards || a.key.localeCompare(b.key));
  const unreachable = rows.filter(row => row.unreachable).length;
  const later_coverage = rows.reduce((total, row) => {
    for (const [key, value] of Object.entries(row.later_coverage ?? {})) total[key] = (total[key] ?? 0) + value;
    return total;
  }, {});
  return { boards: rows.length, unreachable, evaluated_boards: rows.length - unreachable, later_coverage,
    clean: rows.filter(row => !row.unreachable && !row.findings.length).length,
    errors: findings.filter(entry => entry.key.includes(' error ')).reduce((sum, entry) => sum + entry.boards, 0), findings };
}

// Independently replay only the frozen board sampler and exact live-range
// existence checks. This does not trust coverage counters supplied by a row,
// and does not run policy/equity/balance evaluation.
export function expectedCompanionCoverage(inputs, board) {
  if (!hasPostflopDeal(inputs, board.cards)) return null;
  const random = seededRandom(seedFor(`${inputs.config.seed}|balance|${board.id}`));
  const deck = Array.from({ length: 52 }, (_, card) => card).filter(card => !board.cards.includes(card));
  const take = pool => pool.splice(Math.floor(random() * pool.length), 1)[0];
  // balance.mjs removes all four chosen turns before drawing each river set.
  // Preserve that exact sampler, including its RNG consumption order.
  const turns = Array.from({ length: 4 }, () => take(deck));
  const coverage = { flops: 1, reachable_flops: 1, turn_boards: 0, unreachable_turn_boards: 0,
    river_runouts: 0, unreachable_river_runouts: 0 };
  for (const turn of turns) {
    const turnBoard = [...board.cards, turn];
    coverage[hasPostflopDeal(inputs, turnBoard) ? 'turn_boards' : 'unreachable_turn_boards']++;
    const rivers = deck.filter(card => card !== turn);
    for (let i = 0; i < 3; i++) {
      const riverBoard = [...turnBoard, take(rivers)];
      coverage[hasPostflopDeal(inputs, riverBoard) ? 'river_runouts' : 'unreachable_river_runouts']++;
    }
  }
  return coverage;
}

export function assertAllBoardCompanion(companion, summaryBytes, identity, inputs) {
  if (!Buffer.isBuffer(summaryBytes) || summaryBytes.length > LIMITS.file) fail('Invalid all-board summary bytes');
  const summary = JSON.parse(summaryBytes);
  if (!inputs?.spot?.history || inputs.spot.id !== identity?.spot || inputs.fingerprint !== identity.source_hash ||
      !isDeepStrictEqual(inputs.config, identity.config) || typeof inputs.config?.seed !== 'string' ||
      inputs.spot.ip === inputs.spot.oop || [inputs.spot.ip, inputs.spot.oop].some(seat =>
        typeof seat !== 'string' || !Array.isArray(inputs.seatRows?.[seat]) ||
        !inputs.seatRows[seat].some(row => row.freq > 0) || inputs.seatRows[seat].some(row =>
          typeof row.hand !== 'string' || !Number.isFinite(row.freq) || row.freq < 0 || row.freq > 100))) {
    fail('Actual saved inputs matching the all-board identity are required');
  }
  const expectedBoards = canonicalFlops(), expectedIds = expectedBoards.map(board => board.id), identityHash = hashJSON(identity);
  if (identity.version !== 1 || identity.street !== 'all' || !/^[A-Za-z0-9_]+$/.test(identity.spot) ||
      !exactKeys(companion, ['schema_version', 'kind', 'spot', 'street', 'identity_hash', 'summary', 'rows', 'row_sha256']) ||
      companion.schema_version !== 1 || companion.kind !== 'completed-all-board-checkpoints' || companion.spot !== identity.spot ||
      companion.street !== 'all' || companion.identity_hash !== identityHash ||
      !exactKeys(companion.summary, ['path', 'sha256']) || companion.summary.path !== summaryPathFor(identity.spot, identityHash) || companion.summary.sha256 !== sha256(summaryBytes) ||
      !Array.isArray(companion.rows) || companion.rows.length !== 1755 || !Array.isArray(companion.row_sha256) || companion.row_sha256.length !== 1755) fail('Companion does not pin the exact completed all-board identity and summary');
  for (let i = 0; i < expectedIds.length; i++) {
    const row = companion.rows[i];
    assertCompanionRow(row, expectedIds[i]);
    if (!validHash(companion.row_sha256[i]) || companion.row_sha256[i] !== hashJSON(row)) fail('All-board checkpoint row hash differs');
    const expectedCoverage = expectedCompanionCoverage(inputs, expectedBoards[i]);
    if (Boolean(row.unreachable) !== (expectedCoverage === null)) fail('Checkpoint unreachable claim differs from exact saved live-range support');
    if (expectedCoverage !== null && !isDeepStrictEqual(row.later_coverage, expectedCoverage)) {
      fail('Checkpoint later coverage differs from exact saved live-range support on the fixed seeded runouts');
    }
  }
  const expected = { spot: identity.spot, street: 'all', identity_hash: identityHash, source_hash: identity.source_hash,
    policy_hash: identity.policy_hash, later_policy_hash: identity.later_policy_hash, ...summarizeCompanionRows(companion.rows) };
  if (!isDeepStrictEqual(summary, expected)) fail('Completed all-board summary differs from recomputed per-board aggregates');
  return expected;
}

export function buildAllBoardCompanion(identity, summaryBytes, checkpoints, inputs) {
  const expectedIds = canonicalFlops().map(board => board.id), identityHash = hashJSON(identity);
  if (!Array.isArray(checkpoints) || checkpoints.length !== expectedIds.length) fail('A companion requires all 1,755 completed checkpoints');
  const rows = checkpoints.map((checkpoint, i) => {
    if (!exactKeys(checkpoint, ['key', 'row', 'sha256']) || checkpoint.key !== identityHash || checkpoint.sha256 !== hashJSON(checkpoint.row)) fail('Checkpoint key or recorded row hash differs');
    assertCompanionRow(checkpoint.row, expectedIds[i]);
    return checkpoint.row;
  });
  const companion = { schema_version: 1, kind: 'completed-all-board-checkpoints', spot: identity.spot, street: 'all', identity_hash: identityHash,
    summary: { path: summaryPathFor(identity.spot, identityHash), sha256: sha256(summaryBytes) }, rows, row_sha256: checkpoints.map(row => row.sha256) };
  const bytes = Buffer.from(JSON.stringify(companion) + '\n');
  if (bytes.length > LIMITS.file) fail('All-board companion exceeds bounded archive file size');
  assertAllBoardCompanion(companion, summaryBytes, identity, inputs);
  return { companion, bytes };
}
