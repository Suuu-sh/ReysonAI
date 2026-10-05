import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureSourceGraph } from '../scripts/postflop-ai/audit-identity.mjs';
import { REPOSITORY, reviewedSourcePaths } from '../scripts/postflop-ai/reviewed-postflop.mjs';
import { jsonBytes, sha256 } from '../scripts/postflop-ai/reviewed-postflop-archive.mjs';
import { ADDED_PATHS, assertCapturedBytes, assertCollectionReceipt, assertIndex, COLLECTION_LIMITS, currentCatalog, deliverySources,
  executingRoot, indexIdentity, readIdentity, requireSortedIds } from '../scripts/postflop-ai/reviewed-postflop-index.mjs';

const record = (path, body = 'synthetic') => ({ path, bytes: Buffer.byteLength(body), sha256: sha256(body) });
export function indexFixture(count = 1) {
  const catalog = currentCatalog(), ids = catalog.expected_new_spot_ids.slice(0, count), sources = [record('synthetic/source.mjs')];
  const input = [record('synthetic/input.json', '{}')];
  const shards = ids.map((id, i) => ({ id: `batch-${String(i).padStart(4, '0')}`,
    manifest: record(`artifacts/postflop/fixture-${i}.manifest.json`), archive: record(`artifacts/postflop/fixture-${i}.tar.gz`),
    receipt: record(`configs/fixture-${i}.review.json`), content_sha256: sha256(`synthetic-${i}`), accepted_new_spot_ids: [id], expanded_bytes: 3, artifact_records: 3 }));
  const index = { schema_version: 1, kind: 'postflop-reviewed-shard-index', approval: 'unapproved', catalog,
    baseline: { sources, inputs: input, sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(input)) },
    delivery_sources: sources, delivery_sources_sha256: sha256(jsonBytes(sources)), shards, accepted_new_spot_ids: ids,
    coverage: { scope: count === 407 ? 'complete-catalog' : 'reviewed-subset',
      deferred_new_spots: catalog.expected_new_spot_ids.slice(count).map(spot => ({ spot, reason: 'Synthetic schema test only; no policy or numerical acceptance.' })) },
    publication: { published_at: '2026-10-04T00:00:00.000Z', revision: 'synthetic-schema-0001', predecessor_content_hash: null },
    aggregate_artifact_bytes: count * 3, aggregate_artifact_records: count * 3 };
  index.content_sha256 = indexIdentity(index); return index;
}
const resign = index => { index.content_sha256 = indexIdentity(index); return index; };
test('synthetic schema validates bounded disjoint subsets and actual full catalog, never policy approval', () => {
  for (const count of [1, 8, 137, 407]) assert.equal(assertIndex(indexFixture(count)).approval, 'unapproved');
  assert.equal(COLLECTION_LIMITS.expanded, 32 * 1024 * 1024);
  assert.equal(COLLECTION_LIMITS.compressed, 8 * 1024 * 1024);
  assert.equal(currentCatalog().expected_new_spot_ids.length, 407);
});
test('rehashed schema mutations reject duplicates, extras, mixed coverage and bounds', () => {
  const changes = [
    i => { i.shards.push(structuredClone(i.shards[0])); },
    i => { i.shards[1].archive = i.shards[0].archive; },
    i => { i.shards[1].receipt = i.shards[0].receipt; },
    i => { i.shards[1].accepted_new_spot_ids = i.shards[0].accepted_new_spot_ids; },
    i => { i.shards[0].manifest.path = 'artifacts/postflop/../escape.manifest.json'; },
    i => { i.shards[0].archive.bytes = COLLECTION_LIMITS.compressed + 1; },
    i => { i.shards[0].expanded_bytes = COLLECTION_LIMITS.expanded + 1; },
    i => { i.shards[0].artifact_records = 129; },
    i => { i.shards[0].accepted_new_spot_ids = [...i.catalog.expected_new_spot_ids.slice(0, 9)]; },
    i => { i.accepted_new_spot_ids.pop(); },
    i => { i.catalog.expected_new_spot_ids[0] = 'BTN_open_BB_call'; i.catalog.catalog_sha256 = sha256(jsonBytes(i.catalog.expected_new_spot_ids)); },
    i => { i.coverage.scope = 'complete-catalog'; },
    i => { i.coverage.deferred_new_spots.pop(); },
    i => { i.coverage.deferred_new_spots[0].reason = '  '; },
    i => { i.coverage.deferred_new_spots[0].spot = i.accepted_new_spot_ids[0]; },
    i => { i.aggregate_artifact_bytes++; },
    i => { i.publication.predecessor_content_hash = ''; },
    i => { i.publication.published_at = '2026-10-04'; },
    i => { i.delivery_sources.push(i.delivery_sources[0]); i.delivery_sources_sha256 = sha256(jsonBytes(i.delivery_sources)); },
  ];
  for (const mutate of changes) {
    const index = indexFixture(2); mutate(index);
    assert.throws(() => assertIndex(resign(index), { catalog: currentCatalog() }));
  }
  assert.throws(() => assertIndex(indexFixture(), { sources: deliverySources() }), /source ledger/);
});
test('raw identity rejects changed bytes, LFS pointer and symlink, before parsing', () => {
  const root = mkdtempSync(join(tmpdir(), 'postflop-index-bytes-'));
  try {
    writeFileSync(join(root, 'file.json'), '{}');
    assert.deepEqual(readIdentity(root, record('file.json', '{}'), 100), Buffer.from('{}'));
    writeFileSync(join(root, 'file.json'), '[]');
    assert.throws(() => readIdentity(root, record('file.json', '{}'), 100), /bytes differ/);
    const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64);
    writeFileSync(join(root, 'pointer'), pointer);
    assert.throws(() => readIdentity(root, record('pointer', pointer), 1000), /LFS object/);
    symlinkSync(join(root, 'file.json'), join(root, 'link'));
    assert.throws(() => readIdentity(root, record('link', '[]'), 100), /symlink/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('collection receipt is a separate gate; self-approval and every changed binding fail', () => {
  const index = indexFixture(), collection = { index, index_sha256: sha256(jsonBytes(index)) }, expected = { row_value_ledger_sha256: sha256('synthetic-ledger') };
  const receipt = { schema_version: 1, kind: 'postflop-independent-delivery-review',
    review: { author: 'Synthetic fixture author', reviewer: 'Synthetic fixture reviewer', status: 'independently-reviewed',
      scope: 'Schema unit fixture only; not approval of policies or delivery', baseline_commit: 'a'.repeat(40), reviewed_at: '2026-10-04T00:00:00.000Z', blocking_findings: [] },
    index_sha256: collection.index_sha256, content_sha256: index.content_sha256, delivery_sources_sha256: index.delivery_sources_sha256,
    shards: index.shards, catalog: index.catalog, accepted_new_spot_ids: index.accepted_new_spot_ids, coverage: index.coverage,
    publication: index.publication, row_value_ledger_sha256: expected.row_value_ledger_sha256, sql: { bytes: 1, sha256: sha256('x') } };
  assert.equal(assertCollectionReceipt(receipt, collection, expected), receipt);
  for (const field of ['index_sha256', 'content_sha256', 'delivery_sources_sha256', 'row_value_ledger_sha256']) assert.throws(() => assertCollectionReceipt({ ...receipt, [field]: sha256('changed') }, collection, expected));
  assert.throws(() => assertCollectionReceipt({ ...receipt, review: { ...receipt.review, reviewer: receipt.review.author } }, collection, expected), /independent/);
  assert.throws(() => assertCollectionReceipt({ ...receipt, shards: [] }, collection, expected));
  assert.throws(() => assertCollectionReceipt({ ...receipt, review: { ...receipt.review, blocking_findings: ['unresolved'] } }, collection, expected));
});
test('new graph binds every addition/helper/migration but has no incoming numeric/v1 import', () => {
  const sources = deliverySources(), paths = new Set(sources.map(row => row.path));
  for (const path of ADDED_PATHS) assert.ok(paths.has(path), path);
  for (const name of ['0001_postflop.sql', '0009_ranked.sql']) assert.ok(paths.has(`apps/backend/migrations/${name}`));
  const roots = ['cli.mjs', 'board-worker.mjs', 'audit-all-boards.mjs', 'package-all-board-companion.mjs', 'serial-validation-proof.mjs'].map(name => `apps/frontend/scripts/postflop-ai/${name}`);
  const numerical = captureSourceGraph({ roots });
  for (const graph of [numerical, reviewedSourcePaths().map(path => ({ path }))]) for (const row of graph) assert.ok(!ADDED_PATHS.includes(row.path), `Incoming frozen graph edge: ${row.path}`);
  assert.throws(() => executingRoot('/tmp/mixed-historical-root'), /mixed roots/);
  assert.throws(() => requireSortedIds(['same', 'same'], 'ids'), /duplicate/);
});

test('official, all-board and full serial source graphs match the exact frozen checkpoint', () => {
  const pins = {"official": {"records": 50, "sha256": "dbc4b1cf5a877b973de5870fde5fe10765a16c5e8b9c559f4fa91b20d630bc7a"}, "all_boards": {"records": 31, "sha256": "50eff7958f8bedfcacadee4c2dd92ec68ed4ce25a348e3deb974b6e3fb8ed0af"}, "serial": {"records": 57, "sha256": "48e81021476eb0899d43c4f80c415b6917948f50339153b8ffeca3daaee9aeb7"}};
  const prefix = 'apps/frontend/scripts/postflop-ai/';
  const roots = {
    official: ['cli.mjs', 'board-worker.mjs'],
    all_boards: ['audit-all-boards.mjs'],
    serial: ['cli.mjs', 'board-worker.mjs', 'audit-all-boards.mjs', 'package-all-board-companion.mjs', 'serial-validation-proof.mjs', 'serial-validation.py'],
  };
  for (const [name, files] of Object.entries(roots)) {
    const graph = captureSourceGraph({ roots: files.map(file => prefix + file) });
    assert.equal(graph.length, pins[name].records, name);
    assert.equal(sha256(jsonBytes(graph)), pins[name].sha256, name);
  }
});

test('bounded capture validates length/hash before snapshot copy or decompression', () => {
  const body = Buffer.from('approved exact capture'), identity = record('artifacts/postflop/captured.tar.gz', body.toString());
  assert.doesNotThrow(() => assertCapturedBytes(body, identity, COLLECTION_LIMITS.compressed));
  assert.throws(() => assertCapturedBytes(Buffer.from('changed capture'), identity, COLLECTION_LIMITS.compressed), /Captured bounded/);
  assert.throws(() => assertCapturedBytes(Buffer.alloc(COLLECTION_LIMITS.compressed + 1), identity, COLLECTION_LIMITS.compressed), /Captured bounded/);
  assert.throws(() => assertCapturedBytes(body, { ...identity, sha256: sha256('different') }, COLLECTION_LIMITS.compressed), /Captured bounded/);
});
