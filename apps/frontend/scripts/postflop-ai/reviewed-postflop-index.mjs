// Downstream collection provenance only. Existing numerical/v1 gates are unchanged.
import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readSync, readdirSync, statfsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { captureSourceGraph } from './audit-identity.mjs';
import { REPOSITORY } from './reviewed-postflop.mjs';
import { assertManifest, assertSafeFile, compare, fileRecord, jsonBytes, readSafeFile, safeRelativePath, sha256, validHash } from './reviewed-postflop-archive.mjs';
import { POSTFLOP_SPOTS } from './spots.mjs';

export const COLLECTION_LIMITS = Object.freeze({ index: 4 * 1024 * 1024, manifest: 8 * 1024 * 1024,
  compressed: 8 * 1024 * 1024, expanded: 32 * 1024 * 1024, file: 16 * 1024 * 1024,
  spots: 8, records: 128, shards: 407, destinations: 4096, disk: 2 * 1024 * 1024 * 1024 });
export const CATALOG_PATH = 'apps/frontend/scripts/data/hu-after-multiway-spots.json';
export const ADDED_PATHS = [
  'apps/frontend/scripts/postflop-ai/reviewed-postflop-index.mjs',
  'apps/frontend/scripts/postflop-ai/reviewed-postflop-delivery.mjs',
  'apps/frontend/scripts/postflop-ai/package-reviewed-postflop-index.mjs',
  'apps/frontend/scripts/postflop-ai/verify-reviewed-postflop-delivery.mjs',
  'apps/frontend/scripts/postflop-ai/restore-reviewed-postflop-index.mjs',
  'apps/frontend/scripts/postflop-ai/restore-legacy-postflop-fixture.py',
  'apps/frontend/scripts/verify-postflop-local-d1.mjs',
  'apps/frontend/scripts/ci/postflop.wrangler.jsonc',
  'apps/frontend/scripts/ci/postflop-command-supervisor.py',
  'apps/frontend/docs/specs/hu-postflop-after-multiway-preflop.delivery.md',
  'apps/frontend/tests/postflop-reviewed-index.test.mjs',
  'apps/frontend/tests/postflop-reviewed-delivery.test.mjs',
  'apps/frontend/tests/postflop-local-d1.test.mjs',
  'apps/frontend/tests/postflop-delivery-workflow.test.mjs',
  '.github/workflows/verify-reviewed-postflop.yml',
];
const fail = message => { throw new Error(message); };
export function executingRoot(root = REPOSITORY) {
  if (resolve(root) !== resolve(REPOSITORY)) fail('Execute the modules belonging to the exact repository root; mixed roots are forbidden');
  return resolve(root);
}
export function indexIdentity(index) {
  const { content_sha256, ...content } = index;
  return sha256(jsonBytes(content));
}
export function currentCatalog(root = REPOSITORY) {
  executingRoot(root);
  const catalog = JSON.parse(readSafeFile(root, CATALOG_PATH));
  const ids = POSTFLOP_SPOTS.filter(spot => spot.history).map(spot => spot.id).sort(compare);
  if (catalog.reachable !== 407 || catalog.stageA !== 137 || catalog.stageB !== 270 || ids.length !== 407 ||
      !isDeepStrictEqual(catalog.spots.map(spot => spot.id).sort(compare), ids) ||
      catalog.spots.filter(spot => spot.stage === 'A').length !== 137 || catalog.spots.filter(spot => spot.stage === 'B').length !== 270) fail('Actual 407-ID A137/B270 catalog is required');
  return { file: fileRecord(root, CATALOG_PATH), expected_new_spot_ids: ids, catalog_sha256: sha256(jsonBytes(ids)) };
}
export function deliverySources(root = REPOSITORY) {
  executingRoot(root);
  const migrations = readdirSync(join(root, 'apps/backend/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort(compare)
    .map(name => `apps/backend/migrations/${name}`);
  // All entry points, worker, tests and implicit subprocess dependencies are roots.
  return captureSourceGraph({ root, roots: [...ADDED_PATHS, ...migrations,
    'apps/frontend/scripts/postflop-ai/restore-reviewed-postflop.mjs',
    'apps/frontend/scripts/postflop-ai/preserve-legacy-postflop.py',
    'apps/frontend/tests/fixtures/postflop-legacy-fingerprints.json'] });
}
export function requireSortedIds(ids, label, limit = 407) {
  if (!Array.isArray(ids) || !ids.length || ids.length > limit || ids.some((id, i) =>
    typeof id !== 'string' || !/^[A-Za-z0-9_]+$/.test(id) || i > 0 && id <= ids[i - 1])) fail(`Invalid duplicate/unsorted ${label}`);
}
export function assertPublication(publication) {
  if (!publication || typeof publication.published_at !== 'string' || !Number.isFinite(Date.parse(publication.published_at)) ||
      new Date(publication.published_at).toISOString() !== publication.published_at ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/.test(publication.revision ?? '') ||
      publication.predecessor_content_hash !== null && !validHash(publication.predecessor_content_hash)) fail('Fixed ISO publication time, immutable revision and exact predecessor/null required');
}
function recordShape(record, kind) {
  const pattern = kind === 'manifest' ? /^artifacts\/postflop\/[a-z0-9-]+\.manifest\.json$/ :
    kind === 'archive' ? /^artifacts\/postflop\/[a-z0-9-]+\.tar\.gz$/ : /^configs\/[a-z0-9-]+\.review\.json$/;
  const limit = kind === 'archive' ? COLLECTION_LIMITS.compressed : COLLECTION_LIMITS.manifest;
  if (!record || !pattern.test(record.path ?? '') || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes > limit || !validHash(record.sha256)) fail(`Invalid ${kind} child identity`);
}
export function assertIndex(index, { catalog = null, sources = null } = {}) {
  if (index?.schema_version !== 1 || index.kind !== 'postflop-reviewed-shard-index' || index.approval !== 'unapproved' ||
      !validHash(index.content_sha256) || index.content_sha256 !== indexIdentity(index)) fail('Invalid intrinsically unapproved collection index/content hash');
  requireSortedIds(index.catalog?.expected_new_spot_ids, 'catalog');
  if (index.catalog.expected_new_spot_ids.length !== 407 || index.catalog.catalog_sha256 !== sha256(jsonBytes(index.catalog.expected_new_spot_ids))) fail('Exact full catalog identity required');
  if (catalog && !isDeepStrictEqual(index.catalog, catalog)) fail('Index catalog differs from actual catalog bytes');
  if (!Array.isArray(index.delivery_sources) || !index.delivery_sources.length || index.delivery_sources.length > 4096 ||
      index.delivery_sources.some((record, i) => !safeRelativePath(record.path) || record.path.includes('/.local/') ||
        !Number.isSafeInteger(record.bytes) || record.bytes < 1 || !validHash(record.sha256) || i > 0 && record.path <= index.delivery_sources[i - 1].path) ||
      index.delivery_sources_sha256 !== sha256(jsonBytes(index.delivery_sources)) || sources && !isDeepStrictEqual(sources, index.delivery_sources)) fail('Complete actual delivery source ledger differs');
  const baseline = index.baseline;
  if (!baseline || !Array.isArray(baseline.sources) || !Array.isArray(baseline.inputs) ||
      baseline.sources_sha256 !== sha256(jsonBytes(baseline.sources)) || baseline.inputs_sha256 !== sha256(jsonBytes(baseline.inputs))) fail('Common exact v1 baseline required');
  assertPublication(index.publication);
  if (!Array.isArray(index.shards) || !index.shards.length || index.shards.length > COLLECTION_LIMITS.shards) fail('Bounded nonempty shards required');
  const paths = new Set(), ids = new Set(); let total = 0, records = 0, previous = '';
  for (const shard of index.shards) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(shard.id ?? '') || shard.id <= previous || !validHash(shard.content_sha256)) fail('Invalid duplicate/unsorted shard ID');
    previous = shard.id;
    requireSortedIds(shard.accepted_new_spot_ids, 'child accepted IDs', COLLECTION_LIMITS.spots);
    for (const kind of ['manifest', 'archive', 'receipt']) {
      recordShape(shard[kind], kind);
      if (paths.has(shard[kind].path)) fail('Repeated archive/manifest/receipt path');
      paths.add(shard[kind].path);
    }
    if (!Number.isSafeInteger(shard.expanded_bytes) || shard.expanded_bytes < 1 || shard.expanded_bytes > COLLECTION_LIMITS.expanded ||
        !Number.isSafeInteger(shard.artifact_records) || shard.artifact_records < 1 || shard.artifact_records > COLLECTION_LIMITS.records) fail('Shard exceeds declared expanded/record bounds');
    total += shard.expanded_bytes; records += shard.artifact_records;
    for (const id of shard.accepted_new_spot_ids) {
      if (ids.has(id) || !index.catalog.expected_new_spot_ids.includes(id)) fail('Duplicate, unknown or legacy accepted ID');
      ids.add(id);
    }
  }
  const accepted = [...ids].sort(compare);
  requireSortedIds(index.accepted_new_spot_ids, 'accepted union');
  if (!isDeepStrictEqual(accepted, index.accepted_new_spot_ids) || total > COLLECTION_LIMITS.disk || records > COLLECTION_LIMITS.destinations ||
      index.aggregate_artifact_bytes !== total || index.aggregate_artifact_records !== records) fail('Accepted union/disk declaration differs');
  const coverage = index.coverage, complement = index.catalog.expected_new_spot_ids.filter(id => !ids.has(id));
  if (!['reviewed-subset', 'complete-catalog'].includes(coverage?.scope) || coverage.scope === 'complete-catalog' && complement.length ||
      !Array.isArray(coverage.deferred_new_spots) || !isDeepStrictEqual(coverage.deferred_new_spots.map(row => row.spot), complement) ||
      coverage.deferred_new_spots.some(row => typeof row.reason !== 'string' || !row.reason.trim())) fail('Explicit full-catalog deferral coverage required');
  return index;
}
export function readIdentity(root, record, limit) {
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes > limit) fail('Child length exceeds bound before reading');
  assertSafeFile(root, record.path);
  // Open once, bound the opened regular file BEFORE allocation, and read that
  // same descriptor. A path swap cannot cause an unbounded readFile allocation.
  const fd = openSync(join(root, record.path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size !== record.bytes || before.size > limit) fail(`Exact bounded child size differs: ${record.path}`);
    const bytes = Buffer.alloc(before.size); let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, Math.min(64 * 1024, bytes.length - offset), null);
      if (!count) fail(`Early EOF in bounded child: ${record.path}`);
      offset += count;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null)) fail(`Trailing bytes in bounded child: ${record.path}`);
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) fail(`Child changed while capturing bytes: ${record.path}`);
    if (bytes.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1')) fail('Real LFS object required, not a pointer');
    if (sha256(bytes) !== record.sha256) fail(`Exact child bytes differ: ${record.path}`);
    return bytes;
  } finally { closeSync(fd); }
}
export function readIndex({ root = REPOSITORY, indexPath } = {}) {
  root = executingRoot(root);
  if (!/^artifacts\/postflop\/[a-z0-9-]+\.index\.json$/.test(indexPath ?? '') &&
      !/^apps\/frontend\/\.local\/[A-Za-z0-9_/-]+\.index\.json$/.test(indexPath ?? '')) fail('Explicit safe collection index path required');
  const bytes = readSafeFile(root, indexPath, COLLECTION_LIMITS.index), index = JSON.parse(bytes);
  assertIndex(index, { catalog: currentCatalog(root), sources: deliverySources(root) });
  return { root, indexPath, index, index_sha256: sha256(bytes), index_bytes: bytes.length };
}
export function assertBoundedChild(collection, shard, manifest, receipt) {
  const { index } = collection;
  assertManifest(manifest);
  const total = manifest.artifacts.reduce((n, item) => n + item.bytes, 0);
  if (manifest.spots.length > COLLECTION_LIMITS.spots || manifest.spots.some(spot => spot.classification !== 'new-candidate') ||
      total > COLLECTION_LIMITS.expanded || manifest.artifacts.length > COLLECTION_LIMITS.records || manifest.archive.bytes > COLLECTION_LIMITS.compressed ||
      total !== shard.expanded_bytes || manifest.artifacts.length !== shard.artifact_records || manifest.content_sha256 !== shard.content_sha256 ||
      !isDeepStrictEqual(manifest.archive, { ...shard.archive, format: 'ustar+gzip-content-addressed-v1' }) ||
      !isDeepStrictEqual(manifest.coverage.included_new_spot_ids, shard.accepted_new_spot_ids) ||
      ['sources', 'inputs', 'sources_sha256', 'inputs_sha256'].some(key => !isDeepStrictEqual(manifest[key], index.baseline[key]))) fail('Delivery shard contains extras, legacy, mixed baseline or incorrect bounds');
  if (!isDeepStrictEqual(receipt.accepted_new_spots?.map(row => row.spot).sort(compare), shard.accepted_new_spot_ids) ||
      !isDeepStrictEqual(receipt.preserved_legacy_spots, [])) fail('Every included child spot must be separately accepted; no extras');
}
export function assertCapturedBytes(bytes, record, limit) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > limit || bytes.length !== record.bytes ||
      sha256(bytes) !== record.sha256 || bytes.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1')) fail(`Captured bounded bytes differ: ${record.path}`);
}
export function readBoundedShard(collection, shard) {
  const { root } = collection;
  const manifestBytes = readIdentity(root, shard.manifest, COLLECTION_LIMITS.manifest);
  const manifest = JSON.parse(manifestBytes);
  const receiptBytes = readIdentity(root, shard.receipt, COLLECTION_LIMITS.manifest);
  const receipt = JSON.parse(receiptBytes);
  // Metadata bounds are enforced BEFORE reading or decoding the archive body.
  assertBoundedChild(collection, shard, manifest, receipt);
  const archiveBytes = readIdentity(root, shard.archive, COLLECTION_LIMITS.compressed);
  // Retain the exact capture. No later path read supplies decoding/write bytes.
  return { manifestBytes, archiveBytes, receiptBytes };
}
export function runShard(collection, shard, action, extra = {}) {
  const worker = fileURLToPath(new URL('./reviewed-postflop-delivery.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--max-old-space-size=768', worker, '--worker'], {
    cwd: collection.root, input: JSON.stringify({ indexPath: collection.indexPath, index_sha256: collection.index_sha256,
      shardId: shard.id, action, ...extra }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    timeout: 10 * 60 * 1000, env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8', TZ: 'UTC' },
  });
  if (result.error || result.signal || result.status !== 0) fail(`Shard ${shard.id} ${action} failed: ${result.error?.message ?? result.stderr ?? result.signal}`);
  const value = JSON.parse(result.stdout);
  if (!Number.isInteger(value.max_rss_kib) || value.max_rss_kib < 1 || value.max_rss_kib > 1536 * 1024) fail('Bounded shard worker exceeds the 1.5 GiB measured RSS budget');
  if (value.status !== 'verified-reviewed-child' || value.shard_id !== shard.id || value.index_sha256 !== collection.index_sha256) fail('Missing exact completed shard result');
  return value;
}
export function verifyChildren(collection, action = 'inspect') {
  const artifacts = new Set(), slugs = new Set(), rows = [], policies = {}, telemetry = [];
  for (const shard of collection.index.shards) {
    const result = runShard(collection, shard, action);
    for (const record of result.artifacts) {
      if (artifacts.has(record.path)) fail('Repeated cross-shard artifact destination');
      artifacts.add(record.path);
    }
    for (const slug of result.slugs) { if (slugs.has(slug)) fail('Repeated cross-shard slug'); slugs.add(slug); }
    rows.push(...result.rows);
    Object.assign(policies, result.policy_hashes);
    telemetry.push({ shard_id: shard.id, worker_pid: result.worker_pid, max_rss_kib: result.max_rss_kib });
  }
  rows.sort((a, b) => compare(`${a.table}/${a.key}`, `${b.table}/${b.key}`));
  if (new Set(rows.map(row => `${row.table}/${row.key}`)).size !== rows.length) fail('Duplicate D1 row ledger');
  return { rows, row_value_ledger_sha256: sha256(jsonBytes(rows)), policy_hashes: policies, artifacts: artifacts.size, telemetry };
}
export function assertCollectionReceipt(receipt, collection, expected) {
  const { index, index_sha256 } = collection, review = receipt?.review;
  if (receipt?.schema_version !== 1 || receipt.kind !== 'postflop-independent-delivery-review' || review?.status !== 'independently-reviewed' ||
      typeof review.author !== 'string' || !review.author.trim() || typeof review.reviewer !== 'string' || !review.reviewer.trim() ||
      review.author === review.reviewer || typeof review.scope !== 'string' || !review.scope.trim() ||
      !/^[a-f0-9]{40}$/.test(review.baseline_commit ?? '') || !Number.isFinite(Date.parse(review.reviewed_at ?? '')) ||
      !isDeepStrictEqual(review.blocking_findings, []) || receipt.index_sha256 !== index_sha256 ||
      receipt.content_sha256 !== index.content_sha256 || receipt.delivery_sources_sha256 !== index.delivery_sources_sha256 ||
      !isDeepStrictEqual(receipt.shards, index.shards) || !isDeepStrictEqual(receipt.catalog, index.catalog) ||
      !isDeepStrictEqual(receipt.accepted_new_spot_ids, index.accepted_new_spot_ids) || !isDeepStrictEqual(receipt.coverage, index.coverage) ||
      !isDeepStrictEqual(receipt.publication, index.publication) || receipt.row_value_ledger_sha256 !== expected.row_value_ledger_sha256 ||
      !validHash(receipt.sql?.sha256) || !Number.isSafeInteger(receipt.sql?.bytes) || receipt.sql.bytes < 1) fail('Separate matching independent collection/SQL review is required');
  return receipt;
}
export function recheckIndex(collection) {
  const next = readIndex(collection);
  if (next.index_sha256 !== collection.index_sha256 || next.index_bytes !== collection.index_bytes) fail('Index/source bytes changed between passes');
}
export function recheckCollection(collection) {
  recheckIndex(collection);
  for (const shard of collection.index.shards) readBoundedShard(collection, shard);
}
export function requireDisk(root, bytes) {
  const stat = statfsSync(root, { bigint: true });
  if (stat.bavail * stat.bsize < BigInt(bytes)) fail('Insufficient declared staging/SQL free space');
}
