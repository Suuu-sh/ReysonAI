import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { prepareMw3SnapshotDeliveries, mw3DeliveryPins, assertMw3IndependentReceipt, buildMw3DeliverySql, MW3_SQL_STATEMENT_LIMIT } from '../scripts/postflop-ai/mw3-reviewed-delivery.mjs';
import { sha256, jsonBytes } from '../scripts/postflop-ai/mw3-reviewed-archive.mjs';
import { MW3_TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
const fixtureTask = 'synthetic-fixture-author-never-a-real-policy';
async function fixture() {
  const id = 'HJ_open_BTN_call_BB_call', source = 'a'.repeat(64), implementation = 'b'.repeat(64), candidates = {};
  for (const [kind, streets] of [['candidate', ['flop']], ['laterCandidate', ['turn', 'river']]]) {
    const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: id, streets, rules: streets.flatMap(street => MW3_TIERS.map(tier => ({ node: `mw3_${street}_first_first`, tier, priority: 0,
      when: { line: 'any', texture: 'any', players: 'any', position: 'any', response: 'any', price: 'any', spr: 'any' }, mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 } }))) };
    candidates[kind] = { policy, metadata: { spot: id, source_hash: source, implementation_hash: implementation, policy_hash: sha256(JSON.stringify(policy)), author_task: fixtureTask } };
  }
  // Deliberately synthetic transport/receipt contract fixture. This does not pass
  // verifyMw3Snapshot, contain strategy evidence, or authorize a real spot.
  const manifest = { source_tree: 'a'.repeat(40), spot: { id, source_hash: source, implementation_hash: implementation, flop_policy_hash: candidates.candidate.metadata.policy_hash,
    later_policy_hash: candidates.laterCandidate.metadata.policy_hash }, archive: { sha256: 'c'.repeat(64) }, content_sha256: 'd'.repeat(64), sources_sha256: 'e'.repeat(64), inputs_sha256: 'f'.repeat(64) };
  const evidence = { status: 'complete_evidence_not_acceptance', limitations: ['synthetic fixture only'], jointWarningCount: 0 };
  const snapshot = { manifest, manifestBytes: jsonBytes(manifest), candidates, evidence };
  const deliveries = await prepareMw3SnapshotDeliveries(snapshot), pins = mw3DeliveryPins(snapshot, deliveries);
  const review = { schema_version: 1, kind: 'mw3-independent-acceptance', status: 'independently-reviewed', strategy_type: 'ai_estimate_not_gto',
    author_model: 'gpt-6-astra', reviewer_model: 'gpt-6-astra', reviewer_task: 'synthetic-fixture-reviewer', author_task: fixtureTask,
    source_tree: 'a'.repeat(40), scope: 'unit fixture only; never publishable real evidence', manifest_sha256: sha256(snapshot.manifestBytes),
    archive_sha256: manifest.archive.sha256, content_sha256: manifest.content_sha256, sources_sha256: manifest.sources_sha256,
    inputs_sha256: manifest.inputs_sha256, spot: id, deliveries: pins, evidence, accepted_limitations: evidence.limitations };
  return { snapshot, deliveries, review, sql: buildMw3DeliverySql(snapshot, review, deliveries) };
}
test('SQL requires an exact separate acceptance receipt and immutable paired delivery identity', async () => {
  const f = await fixture(); assertMw3IndependentReceipt(f.review, f.snapshot, f.deliveries);
  for (const mutate of [r => { r.status = 'candidate'; }, r => { r.reviewer_task = fixtureTask; }, r => { r.author_model = 'other'; },
    r => { r.source_tree = '0'.repeat(40); }, r => { r.manifest_sha256 = '0'.repeat(64); }, r => { r.spot = 'other'; }, r => { r.accepted_limitations = []; },
    r => { r.deliveries.reverse(); }, r => { r.evidence.jointWarningCount++; }]) {
    const review = structuredClone(f.review); mutate(review); assert.throws(() => buildMw3DeliverySql(f.snapshot, review, f.deliveries), /receipt required/);
  }
  assert.throws(() => buildMw3DeliverySql(f.snapshot, null, f.deliveries));
  const bad = structuredClone(f.deliveries); bad[0].parts[0].body += 'x'; assert.throws(() => buildMw3DeliverySql(f.snapshot, f.review, bad), /parts differ/);
  assert.ok(f.sql.split('\n').every(row => Buffer.byteLength(row) <= MW3_SQL_STATEMENT_LIMIT));
  assert.doesNotMatch(f.sql, /DELETE FROM|INSERT OR REPLACE|postflop_policies|preflop_datasets/);
});
test('SQLite reference: immutable delivery SQL repeats exactly and preserves unrelated HU tables', async () => {
  const f = await fixture(), db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../../backend/scripts/sql/mw3-schema.sql', import.meta.url), 'utf8'));
    db.exec("CREATE TABLE postflop_policies (body TEXT); INSERT INTO postflop_policies VALUES ('sentinel');");
    db.exec(f.sql); db.exec(f.sql);
    assert.equal(db.prepare('SELECT count(*) AS n FROM mw3_policy_deliveries').get().n, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM mw3_policy_parts').get().n, f.deliveries.reduce((sum, row) => sum + row.parts.length, 0));
    assert.equal(db.prepare('SELECT body FROM postflop_policies').get().body, 'sentinel');
    for (const delivery of f.deliveries) assert.equal(db.prepare('SELECT header_json FROM mw3_policy_deliveries WHERE delivery_hash = ?').get(delivery.deliveryHash).header_json, delivery.headerText);
  } finally { db.close(); }
});
test('SQLite reference: a conflicting immutable part fails the transaction without partial writes', async () => {
  const f = await fixture(), db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../../backend/scripts/sql/mw3-schema.sql', import.meta.url), 'utf8'));
    db.exec(f.sql);
    const bad = f.deliveries[1]; db.prepare('UPDATE mw3_policy_parts SET body = ? WHERE delivery_hash = ? AND part = 0').run('old-conflicting-body', bad.deliveryHash);
    db.prepare('DELETE FROM mw3_policy_parts WHERE delivery_hash = ?').run(f.deliveries[0].deliveryHash);
    const before = db.prepare('SELECT delivery_hash, part, body FROM mw3_policy_parts ORDER BY delivery_hash, part').all();
    db.exec('BEGIN');
    try { assert.throws(() => db.exec(f.sql), /NOT NULL/); } finally { db.exec('ROLLBACK'); }
    assert.deepEqual(db.prepare('SELECT delivery_hash, part, body FROM mw3_policy_parts ORDER BY delivery_hash, part').all(), before);
  } finally { db.close(); }
});
