// Bounded fresh-process worker and approved-byte delivery. Never chooses releases.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { POSTFLOP_SPOTS } from './spots.mjs';
import { REPOSITORY, assertCurrentCandidates, assertCurrentSources, assertIndependentReview } from './reviewed-postflop.mjs';
import { artifactPath, assertSafeFile, compare, decodeArchive, jsonBytes, readSafeFile, restoreBytes, safeRelativePath, sha256 } from './reviewed-postflop-archive.mjs';
import { buildSql, quote } from './publish-d1.mjs';
import { assertBoundedChild, assertCapturedBytes, assertCollectionReceipt, COLLECTION_LIMITS, readBoundedShard, readIndex, recheckCollection, recheckIndex, requireDisk, runShard, verifyChildren } from './reviewed-postflop-index.mjs';

export const MAX_STATEMENT_BYTES = 90_000;
function writeAll(fd, data) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  for (let offset = 0; offset < body.length;) {
    const count = writeSync(fd, body, offset, body.length - offset);
    if (count < 1) throw new Error('Short/failed exclusive output write');
    offset += count;
  }
}
export const ROW_COLUMNS = Object.freeze({
  postflop_spots: ['spot_id', 'slug', 'kind', 'tree', 'ip', 'oop', 'pot_bb', 'stack_bb', 'spot_json'],
  postflop_policies: ['spot_id', 'stage', 'policy_hash', 'metadata_json', 'policy_json'],
  postflop_reports: ['spot_id', 'payload_json'],
});
// Only a bounded single-spot serializer string is held here. Quoted semicolons,
// doubled apostrophes, Unicode and comments are treated as bytes of a statement.
export function* statements(text) {
  let start = 0, state = 'normal';
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (state === 'line') { if (char === '\n') state = 'normal'; }
    else if (state === 'block') { if (char === '*' && next === '/') { state = 'normal'; i++; } }
    else if (state === "'") { if (char === "'") { if (next === "'") i++; else state = 'normal'; } }
    else if (char === '-' && next === '-') { state = 'line'; i++; }
    else if (char === '/' && next === '*') { state = 'block'; i++; }
    else if (char === "'") state = "'";
    else if (char === ';') { yield text.slice(start, i + 1); start = i + 1; }
  }
  if (!['normal', 'line'].includes(state)) throw new Error('Unterminated SQL literal/comment');
  if (text.slice(start).replace(/--[^\n]*(?:\n|$)/g, '').trim()) throw new Error('Incomplete trailing SQL statement');
  if (start < text.length) yield text.slice(start);
}
export function checkStatements(sql) {
  for (const statement of statements(sql)) if (Buffer.byteLength(statement) > MAX_STATEMENT_BYTES) throw new Error('Complete escaped SQL statement exceeds 90,000 bytes');
  return sql;
}
export function hashFile(path) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Hash requires regular file');
  const fd = openSync(path, 'r'), buffer = Buffer.alloc(64 * 1024), hash = createHash('sha256'); let bytes = 0;
  try { for (let count; (count = readSync(fd, buffer, 0, buffer.length, null)) > 0;) { hash.update(buffer.subarray(0, count)); bytes += count; } }
  finally { closeSync(fd); }
  const after = lstatSync(path);
  if (bytes !== before.size || after.size !== before.size || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs) throw new Error('File changed while hashing');
  return { bytes, sha256: hash.digest('hex') };
}
export function compareFiles(left, right) {
  const a = openSync(left, 'r'), b = openSync(right, 'r'), x = Buffer.alloc(64 * 1024), y = Buffer.alloc(64 * 1024);
  try {
    for (;;) {
      const n = readSync(a, x, 0, x.length, null), m = readSync(b, y, 0, y.length, null);
      if (n !== m || !x.subarray(0, n).equals(y.subarray(0, m))) throw new Error('Delivery bytes/EOF/trailing content differ');
      if (!n) break;
    }
  } finally { closeSync(a); closeSync(b); }
}
export function spotRows({ spot, candidate, laterCandidate, report }) {
  return [
    { table: 'postflop_spots', key: spot.id, value: { spot_id: spot.id, slug: spot.slug, kind: spot.kind, tree: spot.tree,
      ip: spot.ip, oop: spot.oop, pot_bb: Number(spot.potBb), stack_bb: Number(spot.stackBb ?? 100), spot_json: JSON.stringify(spot) } },
    ...[['flop', candidate], ['later', laterCandidate]].map(([stage, policy]) => ({ table: 'postflop_policies', key: `${spot.id}/${stage}`,
      value: { spot_id: spot.id, stage, policy_hash: policy.metadata.policy_hash, metadata_json: JSON.stringify(policy.metadata), policy_json: JSON.stringify(policy) } })),
    { table: 'postflop_reports', key: spot.id, value: { spot_id: spot.id, payload_json: JSON.stringify(report) } },
  ];
}
export function ledgerRows(item) { return spotRows(item).map(({ table, key, value }) => ({ table, key, sha256: sha256(jsonBytes(value)) })); }
function acceptedItem(snapshot, id) {
  const spot = POSTFLOP_SPOTS.find(spot => spot.id === id);
  if (!spot?.history) throw new Error('Only exact accepted new catalog spots may be serialized');
  const get = kind => {
    const body = snapshot.files.get(artifactPath(spot, kind));
    if (!body) throw new Error('Missing accepted archive artifact');
    return JSON.parse(body);
  };
  return { spot, candidate: get('candidate'), laterCandidate: get('laterCandidate'), report: get('report') };
}
export function publicationFooter(collection, expected) {
  const { index } = collection, { published_at: publishedAt, revision: publicationRevision } = index.publication;
  const hashes = Object.fromEntries(index.accepted_new_spot_ids.map(id => [id, expected.policy_hashes[id]]));
  if (Object.values(hashes).some(value => !value)) throw new Error('Missing accepted policy identity');
  const contentHash = sha256(JSON.stringify({ publicationRevision, publishedAt, hashes }));
  const detail = { mode: 'spot-upsert', publication_revision: publicationRevision, touched_spots: hashes,
    collection_content_sha256: index.content_sha256, delivery_sources_sha256: index.delivery_sources_sha256,
    row_value_ledger_sha256: expected.row_value_ledger_sha256 };
  const row = { name: 'postflop', content_hash: contentHash, published_at: publishedAt, detail_json: JSON.stringify(detail) };
  const sql = checkStatements(`DELETE FROM dataset_versions WHERE name = 'postflop';\nINSERT INTO dataset_versions (name, content_hash, published_at, detail_json) VALUES ('postflop', ${quote(contentHash)}, ${quote(publishedAt)}, ${quote(row.detail_json)});\n`);
  return { row, sql };
}
export function predecessorSql(publication, finalHash) {
  const expected = publication.predecessor_content_hash;
  const predecessor = expected === null ? "NOT EXISTS (SELECT 1 FROM dataset_versions WHERE name = 'postflop')" :
    `EXISTS (SELECT 1 FROM dataset_versions WHERE name = 'postflop' AND content_hash = ${quote(expected)})`;
  return checkStatements(`SELECT json(CASE WHEN (${predecessor}) OR EXISTS (SELECT 1 FROM dataset_versions WHERE name = 'postflop' AND content_hash = ${quote(finalHash)}) THEN 'null' ELSE 'blocked-publication-predecessor' END);\n`);
}
function localDestination(root, path) {
  if (!safeRelativePath(path) || !path.startsWith('apps/frontend/.local/')) throw new Error('Output must be an explicit ignored local path');
  assertSafeFile(root, path, { missing: true });
  return join(root, path);
}
export function preflightArtifactRecords(root, records, files) {
  for (const record of records) {
    const body = files.get(record.path);
    if (!Buffer.isBuffer(body) || body.length !== record.bytes || sha256(body) !== record.sha256) throw new Error('Preflight artifact bytes differ');
    assertSafeFile(root, record.path, { missing: true });
    if (existsSync(join(root, record.path)) && !readSafeFile(root, record.path).equals(body)) throw new Error(`Existing local artifact differs: ${record.path}`);
  }
}
function freezeJson(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
export function snapshotFromBoundedCapture(collection, shard, captured) {
  // Private copies sever caller-owned Buffer references as well as filesystem
  // identities. Decode only the pinned, bounded capture, never a reopened path.
  assertCapturedBytes(captured.manifestBytes, shard.manifest, COLLECTION_LIMITS.manifest);
  assertCapturedBytes(captured.archiveBytes, shard.archive, COLLECTION_LIMITS.compressed);
  assertCapturedBytes(captured.receiptBytes, shard.receipt, COLLECTION_LIMITS.manifest);
  const manifestBytes = Buffer.from(captured.manifestBytes), archiveBytes = Buffer.from(captured.archiveBytes), receiptBytes = Buffer.from(captured.receiptBytes);
  assertCapturedBytes(manifestBytes, shard.manifest, COLLECTION_LIMITS.manifest);
  assertCapturedBytes(archiveBytes, shard.archive, COLLECTION_LIMITS.compressed);
  assertCapturedBytes(receiptBytes, shard.receipt, COLLECTION_LIMITS.manifest);
  const manifest = freezeJson(JSON.parse(manifestBytes)), receipt = freezeJson(JSON.parse(receiptBytes));
  assertBoundedChild(collection, shard, manifest, receipt);
  assertCurrentSources(collection.root, manifest);
  const files = decodeArchive(archiveBytes, manifest);
  assertCurrentCandidates(collection.root, manifest, files);
  const snapshot = Object.freeze({ root: collection.root, manifest, manifestBytes, files });
  const approval = assertIndependentReview(receipt, snapshot);
  if (!isDeepStrictEqual(approval.accepted_new_spots.sort(compare), shard.accepted_new_spot_ids) || approval.preserved_legacy_spots.length) throw new Error('Unaccepted or legacy worker selection');
  return { snapshot, approval };
}
export function worker(request, hooks = {}) {
  const collection = readIndex({ indexPath: request.indexPath });
  if (request.index_sha256 !== collection.index_sha256) throw new Error('Index changed before worker');
  const shard = collection.index.shards.find(item => item.id === request.shardId);
  if (!shard || !['inspect', 'preflight', 'serialize', 'restore'].includes(request.action)) throw new Error('Unknown worker shard/action');
  const captured = readBoundedShard(collection, shard);
  // Hooks receive no snapshot/approval values and are not part of the JSON CLI
  // request. They let actual-worker regression tests swap filesystem paths.
  hooks.afterBoundedRead?.();
  const { snapshot } = snapshotFromBoundedCapture(collection, shard, captured);
  hooks.afterSnapshotVerified?.();
  const rows = [], policyHashes = {};
  let fd;
  try {
    if (request.action === 'serialize') fd = openSync(localDestination(collection.root, request.fragmentPath), 'wx', 0o600);
    for (const id of shard.accepted_new_spot_ids) {
      const item = acceptedItem(snapshot, id);
      rows.push(...ledgerRows(item));
      policyHashes[id] = { flop: item.candidate.metadata.policy_hash, later: item.laterCandidate.metadata.policy_hash };
      if (fd !== undefined) writeAll(fd, checkStatements(buildSql([item], collection.index.publication.published_at, collection.index.publication.revision)));
    }
    if (request.action === 'preflight' || request.action === 'restore') {
      preflightArtifactRecords(collection.root, snapshot.manifest.artifacts, snapshot.files);
    }
    recheckIndex(collection);
    readBoundedShard(collection, shard);
    if (request.action === 'restore') {
      hooks.beforeRestore?.();
      // Restore exactly what passed the bounded capture and unchanged v1 gates.
      // restoreBytes rechecks ALL captured file hashes/destinations before writes.
      restoreBytes(collection.root, snapshot.manifest, snapshot.files);
      hooks.afterRestore?.();
      // Persistent source/index/child mutation is never a completed success.
      recheckIndex(collection);
      readBoundedShard(collection, shard);
    }
  } finally { if (fd !== undefined) closeSync(fd); }
  return { status: 'verified-reviewed-child', index_sha256: collection.index_sha256, shard_id: shard.id,
    rows, policy_hashes: policyHashes, artifacts: snapshot.manifest.artifacts,
    slugs: snapshot.manifest.spots.map(spot => spot.slug), worker_pid: process.pid, max_rss_kib: process.resourceUsage().maxRSS,
    ...(request.action === 'serialize' ? { fragment: hashFile(join(collection.root, request.fragmentPath)) } : {}) };
}
function appendFile(fd, path) {
  const input = openSync(path, 'r'), buffer = Buffer.alloc(64 * 1024);
  try { for (let n; (n = readSync(input, buffer, 0, buffer.length, null)) > 0;) writeAll(fd, buffer.subarray(0, n)); }
  finally { closeSync(input); }
}
export function prepareDelivery({ indexPath, reviewPath = null, out, checkBundle = null, candidate = false } = {}) {
  if (!out) throw new Error('Explicit ignored --out path required');
  if (!candidate && !reviewPath) throw new Error('Formal delivery requires separate independent --review');
  const collection = readIndex({ indexPath }), expected = verifyChildren(collection), footer = publicationFooter(collection, expected);
  const reviewBytes = reviewPath ? readSafeFile(collection.root, reviewPath, COLLECTION_LIMITS.manifest) : null;
  const receipt = reviewBytes ? assertCollectionReceipt(JSON.parse(reviewBytes), collection, expected) : null;
  if (candidate && receipt) throw new Error('Candidate mode cannot claim independent approval');
  const destination = localDestination(collection.root, out);
  if (existsSync(destination)) throw new Error('Output already exists; use a fresh immutable local destination');
  mkdirSync(dirname(destination), { recursive: true });
  assertSafeFile(collection.root, out, { missing: true });
  const budget = collection.index.aggregate_artifact_bytes * 2 + (receipt?.sql.bytes ?? 128 * 1024 * 1024);
  requireDisk(dirname(destination), budget);
  const staging = mkdtempSync(join(dirname(destination), 'hu-delivery-staging-'));
  let installed = false;
  try {
    const sqlPath = join(staging, 'postflop.sql'), fd = openSync(sqlPath, 'wx', 0o600);
    try {
      writeAll(fd, predecessorSql(collection.index.publication, footer.row.content_hash));
      for (const shard of collection.index.shards) {
        recheckIndex(collection);
        const fragmentPath = relative(collection.root, join(staging, `${shard.id}.sql`)).replaceAll('\\', '/');
        const result = runShard(collection, shard, 'serialize', { fragmentPath });
        const sorted = [...result.rows].sort((a, b) => compare(`${a.table}/${a.key}`, `${b.table}/${b.key}`));
        const acceptedIds = new Set(shard.accepted_new_spot_ids);
        const pinned = expected.rows.filter(row => acceptedIds.has(row.key.split('/')[0]));
        if (!isDeepStrictEqual(sorted, pinned)) throw new Error('Archive rows changed between delivery passes');
        const fragment = join(collection.root, fragmentPath);
        if (!isDeepStrictEqual(hashFile(fragment), result.fragment)) throw new Error('Fragment changed before streaming');
        appendFile(fd, fragment); rmSync(fragment);
      }
      writeAll(fd, footer.sql);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    const sql = hashFile(sqlPath);
    if (receipt && !isDeepStrictEqual(sql, receipt.sql)) throw new Error('SQL bytes/hash differ from separate review');
    recheckCollection(collection);
    if (reviewBytes && !readSafeFile(collection.root, reviewPath, COLLECTION_LIMITS.manifest).equals(reviewBytes)) throw new Error('Review changed between passes');
    const manifest = { schema_version: 1, kind: 'postflop-reviewed-delivery', status: receipt ? 'independently-reviewed-delivery-bytes' : 'unapproved-delivery-candidate',
      index: { path: indexPath, bytes: collection.index_bytes, sha256: collection.index_sha256, content_sha256: collection.index.content_sha256 },
      review: receipt ? { path: reviewPath, bytes: reviewBytes.length, sha256: sha256(reviewBytes) } : null,
      delivery_sources_sha256: collection.index.delivery_sources_sha256, accepted_new_spot_ids: collection.index.accepted_new_spot_ids,
      coverage: collection.index.coverage, publication: collection.index.publication, sql, rows: expected.rows,
      row_value_ledger_sha256: expected.row_value_ledger_sha256, dataset_version: footer.row };
    if (checkBundle) {
      const bundle = localDestination(collection.root, `${checkBundle}/postflop.sql`);
      compareFiles(sqlPath, bundle);
      const saved = readSafeFile(collection.root, `${checkBundle}/delivery.json`, COLLECTION_LIMITS.index);
      if (!saved.equals(jsonBytes(manifest))) throw new Error('Derived delivery manifest differs');
    }
    writeFileSync(join(staging, 'delivery.json'), jsonBytes(manifest), { flag: 'wx', mode: 0o600 });
    // Reserve an absent destination and exclusive-link completed files. Marker last.
    mkdirSync(destination); installed = true;
    assertSafeFile(collection.root, `${out}/postflop.sql`, { missing: true });
    linkSync(sqlPath, join(destination, 'postflop.sql'));
    if (!isDeepStrictEqual(hashFile(join(destination, 'postflop.sql')), sql)) throw new Error('Published SQL changed');
    assertSafeFile(collection.root, `${out}/delivery.json`, { missing: true });
    linkSync(join(staging, 'delivery.json'), join(destination, 'delivery.json'));
    if (!readSafeFile(collection.root, `${out}/delivery.json`, COLLECTION_LIMITS.index).equals(jsonBytes(manifest))) throw new Error('Published completion marker changed');
    return { status: manifest.status, out, sql, accepted_spots: manifest.accepted_new_spot_ids.length, manifest,
      serial_worker_telemetry: expected.telemetry };
  } catch (error) {
    if (installed) rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--worker') throw new Error('This entry accepts only the internal bounded worker contract');
  console.log(JSON.stringify(worker(JSON.parse(readFileSync(0, 'utf8')))));
}
