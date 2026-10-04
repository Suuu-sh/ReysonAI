import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFlops } from '../scripts/postflop-ai/flop-isomorphism.mjs';
import { combosOf, seededRandom, seedFor } from '../scripts/lib/equity.mjs';
import { assertAllBoardCompanion, buildAllBoardCompanion, summarizeCompanionRows } from '../scripts/postflop-ai/all-board-companion.mjs';
import { sha256 } from '../scripts/postflop-ai/reviewed-postflop-archive.mjs';

const hashJSON = value => sha256(JSON.stringify(value));
const aces = new Set(combosOf('AA').flat());
const fullCoverage = () => ({ flops: 1, reachable_flops: 1, turn_boards: 4, unreachable_turn_boards: 0, river_runouts: 12, unreachable_river_runouts: 0 });
// Independent fixture oracle: two AA-only seats require all four aces in the
// hole cards. A board is possible exactly when it contains no ace.
function aceCoverage(board, seed) {
  const rng = seededRandom(seedFor(`${seed}|balance|${board.id}`));
  const pool = Array.from({ length: 52 }, (_, card) => card).filter(card => !board.cards.includes(card));
  const draw = deck => { const index = Math.floor(rng() * deck.length); const card = deck[index]; deck.splice(index, 1); return card; };
  const turns = []; for (let i = 0; i < 4; i++) turns.push(draw(pool));
  const out = { flops: 1, reachable_flops: 1, turn_boards: 0, unreachable_turn_boards: 0, river_runouts: 0, unreachable_river_runouts: 0 };
  for (const turn of turns) {
    out[aces.has(turn) ? 'unreachable_turn_boards' : 'turn_boards']++;
    const rivers = pool.slice();
    for (let i = 0; i < 3; i++) out[aces.has(draw(rivers)) || aces.has(turn) ? 'unreachable_river_runouts' : 'river_runouts']++;
  }
  return out;
}
function fixture({ aaOnly = false } = {}) {
  const config = { seed: 'independent-companion-fixture-v1' };
  const identity = { version: 1, spot: 'Synthetic_spot', street: 'all', source_hash: 'a'.repeat(64), policy_hash: 'b'.repeat(64), later_policy_hash: 'c'.repeat(64), config, code: [] };
  // AA/KK/QQ on both seats guarantees a legal pair even after any five board cards.
  const range = (aaOnly ? ['AA'] : ['AA', 'KK', 'QQ']).map(hand => ({ hand, freq: 100 }));
  const inputs = { spot: { id: identity.spot, ip: 'IP', oop: 'OOP', history: [] }, fingerprint: identity.source_hash,
    config, seatRows: { IP: range, OOP: range } };
  const key = hashJSON(identity);
  const rows = canonicalFlops().map(board => aaOnly && board.cards.some(card => aces.has(card))
    ? { board: board.id, unreachable: true, findings: [] }
    : { board: board.id, later_coverage: aaOnly ? aceCoverage(board, config.seed) : fullCoverage(), findings: [] });
  const marked = rows.findIndex((row, i) => i > 0 && !row.unreachable);
  rows[marked].findings = [1, 2, 3].map(() => ({ check: 'bluff-ratio', severity: 'warn', node: 'river_ip_first', street: 'later', direction: 'under' }));
  const checkpoints = rows.map(row => ({ key, row, sha256: hashJSON(row) }));
  const summary = { spot: identity.spot, street: 'all', identity_hash: key, source_hash: identity.source_hash,
    policy_hash: identity.policy_hash, later_policy_hash: identity.later_policy_hash, ...summarizeCompanionRows(rows) };
  const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
  const { companion } = buildAllBoardCompanion(identity, summaryBytes, checkpoints, inputs);
  return { identity, inputs, rows, checkpoints, summary, summaryBytes, companion, marked };
}
function refreshRowHash(companion, index) { companion.row_sha256[index] = hashJSON(companion.rows[index]); }
function resignSummary(f, companion) {
  const bytes = Buffer.from(JSON.stringify({ ...f.summary, ...summarizeCompanionRows(companion.rows) }));
  companion.summary.sha256 = sha256(bytes); return bytes;
}

test('completed companion preserves original summary hash and recomputes every exact aggregate', () => {
  const f = fixture();
  assert.equal(f.companion.rows.length, 1755);
  assert.equal(f.companion.summary.sha256, sha256(f.summaryBytes));
  assert.deepEqual(assertAllBoardCompanion(f.companion, f.summaryBytes, f.identity, f.inputs), f.summary);
  assert.equal(f.summary.later_coverage.turn_boards, 1755 * 4);
  assert.equal(f.summary.later_coverage.river_runouts, 1755 * 12);
  assert.equal(f.summary.findings[0].boards, 3);
  assert.deepEqual(f.summary.findings[0].examples, Array(3).fill(f.rows[f.marked].board));
});
test('cannot build evidence from incomplete, stale or hash-corrupt checkpoints', () => {
  const f = fixture();
  assert.throws(() => buildAllBoardCompanion(f.identity, f.summaryBytes, f.checkpoints.slice(1), f.inputs), /1,755/);
  for (const change of [cp => { cp.key = 'e'.repeat(64); }, cp => { cp.sha256 = 'e'.repeat(64); }, cp => { cp.row.board = 'AsKsQs'; }]) {
    const values = structuredClone(f.checkpoints); change(values[1]);
    assert.throws(() => buildAllBoardCompanion(f.identity, f.summaryBytes, values, f.inputs));
  }
});
test('requires each exact canonical board once, not a count or duplicated samples', () => {
  const f = fixture();
  for (const change of [c => { c.rows.pop(); c.row_sha256.pop(); }, c => { c.rows[1] = c.rows[2]; refreshRowHash(c, 1); },
    c => { c.rows[1].board = 'AsKsQs'; refreshRowHash(c, 1); }, c => { c.rows.reverse(); c.row_sha256.reverse(); }]) {
    const companion = structuredClone(f.companion); change(companion);
    assert.throws(() => assertAllBoardCompanion(companion, f.summaryBytes, f.identity, f.inputs), /canonical|exact completed/);
  }
});
test('aggregate-only 1-turn/1-river claims cannot cover all flops', () => {
  const f = fixture(), companion = structuredClone(f.companion);
  for (let i = 1; i < companion.rows.length; i++) {
    companion.rows[i].later_coverage.turn_boards = i === 1 ? 1 : 0;
    companion.rows[i].later_coverage.river_runouts = i === 1 ? 1 : 0;
    refreshRowHash(companion, i);
  }
  assert.throws(() => assertAllBoardCompanion(companion, resignSummary(f, companion), f.identity, f.inputs), /four sampled turns/);
});
test('per-board coverage has exact sampler totals, typed fields and no fabricated unavailable fallback', () => {
  const f = fixture();
  for (const change of [
    row => { delete row.later_coverage; }, row => { row.later_coverage.flops = 1755; },
    row => { row.later_coverage.unreachable_turn_boards = 1; }, row => { row.later_coverage.river_runouts = 1; },
    row => { row.later_coverage.turn_boards = '4'; }, row => { row.later_coverage.unreachable_river_runouts = -1; },
    row => { row.unreachable = true; }, row => { row.secret = 'unexpected property'; },
  ]) {
    const companion = structuredClone(f.companion); change(companion.rows[1]); refreshRowHash(companion, 1);
    assert.throws(() => assertAllBoardCompanion(companion, f.summaryBytes, f.identity, f.inputs));
  }
});
test('summary count, findings, examples, clean and warning totals must match original rows exactly', () => {
  const f = fixture();
  for (const change of [s => { s.errors = 1; }, s => { s.clean++; }, s => { s.unreachable++; },
    s => { s.findings = []; }, s => { s.findings[0].boards++; }, s => { s.findings[0].examples = []; },
    s => { s.later_coverage.turn_boards++; }, s => { s.source_hash = 'e'.repeat(64); }]) {
    const summary = structuredClone(f.summary); change(summary);
    const bytes = Buffer.from(JSON.stringify(summary)), companion = structuredClone(f.companion);
    companion.summary.sha256 = sha256(bytes);
    assert.throws(() => assertAllBoardCompanion(companion, bytes, f.identity, f.inputs), /recomputed/);
  }
});
test('row hash, summary hash and run identity changes are rejected independently', () => {
  const f = fixture(), corrupt = structuredClone(f.companion); corrupt.row_sha256[1] = 'e'.repeat(64);
  assert.throws(() => assertAllBoardCompanion(corrupt, f.summaryBytes, f.identity, f.inputs), /row hash/);
  assert.throws(() => assertAllBoardCompanion(f.companion, Buffer.concat([f.summaryBytes, Buffer.from('\n')]), f.identity, f.inputs), /summary/);
  assert.throws(() => assertAllBoardCompanion(f.companion, f.summaryBytes, { ...f.identity, policy_hash: 'e'.repeat(64) }, f.inputs), /identity/);
});
test('real matching saved inputs are mandatory, not user-supplied coverage counters', () => {
  const f = fixture();
  for (const inputs of [undefined, {}, { ...f.inputs, fingerprint: 'e'.repeat(64) },
    { ...f.inputs, config: { seed: 'different-seed' } }, { ...f.inputs, seatRows: { IP: [], OOP: [] } }]) {
    assert.throws(() => assertAllBoardCompanion(f.companion, f.summaryBytes, f.identity, inputs), /Actual saved inputs/);
  }
});
test('re-signed fake unreachable flop is rejected despite self-consistent summary and hashes', () => {
  const f = fixture(), companion = structuredClone(f.companion);
  companion.rows[0] = { board: companion.rows[0].board, unreachable: true, findings: [] }; refreshRowHash(companion, 0);
  assert.throws(() => assertAllBoardCompanion(companion, resignSummary(f, companion), f.identity, f.inputs), /unreachable claim/);
});
test('AA-only true impossible flops and exact sampled later coverage are accepted', () => {
  const f = fixture({ aaOnly: true });
  assert.deepEqual(assertAllBoardCompanion(f.companion, f.summaryBytes, f.identity, f.inputs), f.summary);
  assert.equal(f.summary.unreachable, canonicalFlops().filter(board => board.cards.some(card => aces.has(card))).length);
  assert.ok(f.summary.unreachable > 0);
  assert.ok(f.summary.later_coverage.unreachable_turn_boards > 0);
  assert.ok(f.summary.later_coverage.unreachable_river_runouts > 0);
});
test('re-signed false full 4/12 later coverage is rejected for AA-only ranges', () => {
  const f = fixture({ aaOnly: true }), companion = structuredClone(f.companion);
  const index = companion.rows.findIndex(row => !row.unreachable && (row.later_coverage.unreachable_turn_boards || row.later_coverage.unreachable_river_runouts));
  assert.ok(index >= 0); companion.rows[index].later_coverage = fullCoverage(); refreshRowHash(companion, index);
  assert.throws(() => assertAllBoardCompanion(companion, resignSummary(f, companion), f.identity, f.inputs), /fixed seeded runouts/);
});
test('a genuinely impossible AA-only flop cannot be relabeled evaluated', () => {
  const f = fixture({ aaOnly: true }), companion = structuredClone(f.companion), index = companion.rows.findIndex(row => row.unreachable);
  companion.rows[index] = { board: companion.rows[index].board, later_coverage: fullCoverage(), findings: [] }; refreshRowHash(companion, index);
  assert.throws(() => assertAllBoardCompanion(companion, resignSummary(f, companion), f.identity, f.inputs), /unreachable claim/);
});
