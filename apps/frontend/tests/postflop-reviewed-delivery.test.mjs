import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSql } from '../scripts/postflop-ai/publish-d1.mjs';
import { REPOSITORY } from '../scripts/postflop-ai/reviewed-postflop.mjs';
import { jsonBytes, sha256 } from '../scripts/postflop-ai/reviewed-postflop-archive.mjs';
import { checkStatements, compareFiles, hashFile, ledgerRows, MAX_STATEMENT_BYTES, preflightArtifactRecords, predecessorSql, spotRows, statements } from '../scripts/postflop-ai/reviewed-postflop-delivery.mjs';
import { parseDeliveryArguments } from '../scripts/postflop-ai/verify-reviewed-postflop-delivery.mjs';
const item = { spot: { id: 'Synthetic_new', slug: 'synthetic-new', kind: 'srp', tree: 'oop_checks', ip: 'BTN', oop: 'BB', potBb: 5.5, stackBb: 97.5, note: "雪 ; it's\nexact" },
  candidate: { metadata: { policy_hash: 'flop' }, policy: { text: "a'; --not a comment\n雪" } },
  laterCandidate: { metadata: { policy_hash: 'later' }, policy: {} }, report: { text: "apostrophe ' ;\n雪" } };
test('golden reuse preserves exact serializer quoting and D1 compact value identity', () => {
  const sql = buildSql([item], '2026-10-04T00:00:00.000Z', 'synthetic-fixed-revision');
  assert.equal(checkStatements(sql), sql);
  assert.equal([...statements(sql)].join(''), sql);
  assert.equal(buildSql([item], '2026-10-04T00:00:00.000Z', 'synthetic-fixed-revision'), sql);
  assert.match(sql, /it''s/); assert.doesNotMatch(sql, /DELETE FROM postflop_\w+;/);
  const values = spotRows(item), ledger = ledgerRows(item);
  assert.equal(values.length, 4);
  for (let i = 0; i < values.length; i++) assert.equal(ledger[i].sha256, sha256(jsonBytes(values[i].value)));
  assert.equal(values.find(row => row.key === 'Synthetic_new/flop').value.policy_json, JSON.stringify(item.candidate));
});
test('complete escaped statement budget covers paired values and quote expansion', () => {
  const at = `SELECT '${'x'.repeat(MAX_STATEMENT_BYTES - 10)}';`;
  assert.equal(Buffer.byteLength(at), MAX_STATEMENT_BYTES); assert.doesNotThrow(() => checkStatements(at));
  assert.throws(() => checkStatements(at.replace("';", "x';")), /Complete escaped/);
  const combined = structuredClone(item); combined.candidate.metadata.text = 'x'.repeat(40000); combined.candidate.policy.text = 'x'.repeat(40000);
  assert.throws(() => checkStatements(buildSql([combined], '2026-10-04T00:00:00.000Z', 'synthetic-fixed-revision')), /Complete escaped/);
  assert.throws(() => checkStatements("SELECT 'unterminated;"), /Unterminated/);
  assert.throws(() => checkStatements('SELECT 1'), /Incomplete/);
});
test('streaming byte comparison checks EOF/trailing bytes and Unicode, fixed chunk boundary', () => {
  const root = mkdtempSync(join(tmpdir(), 'postflop-sql-compare-'));
  try {
    const a = join(root, 'a'), b = join(root, 'b'), body = Buffer.from('雪'.repeat(30000));
    writeFileSync(a, body); writeFileSync(b, body); assert.doesNotThrow(() => compareFiles(a, b));
    assert.deepEqual(hashFile(a), { bytes: body.length, sha256: sha256(body) });
    writeFileSync(b, Buffer.concat([body, Buffer.from('x')])); assert.throws(() => compareFiles(a, b), /EOF/);
    writeFileSync(b, body.subarray(0, -1)); assert.throws(() => compareFiles(a, b));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('formal CLI has no execute/generation/allow-unapproved/fresh-report fallback', () => {
  for (const option of ['--execute', '--remote', '--allow-unapproved', '--generate']) assert.throws(() => parseDeliveryArguments([option, 'x']));
  assert.throws(() => parseDeliveryArguments(['--index', 'x', '--out', 'x']), /independent review/);
  const source = readFileSync(join(REPOSITORY, 'apps/frontend/scripts/postflop-ai/reviewed-postflop-delivery.mjs'), 'utf8');
  assert.doesNotMatch(source, /publishableSpots\s*\(/);
  assert.match(source, /snapshot\.files\.get/);
  const restore = readFileSync(join(REPOSITORY, 'apps/frontend/scripts/postflop-ai/restore-reviewed-postflop-index.mjs'), 'utf8');
  assert.ok(restore.indexOf("verifyChildren(collection, 'preflight')") < restore.indexOf("runShard(collection, shard, 'restore')"));
});
// This is deliberately an explicit proof stage, not a skipped missing-policy
// test. Default contract validation makes no claim of historical acceptance.
test('exact historical-root proof is explicit; current modules cannot interpret a fake root', () => {
  if (!process.env.HU_REQUIRE_HISTORICAL_PROOF) {
    assert.equal(process.env.HU_HISTORICAL_ROOT, undefined, 'Enable HU_REQUIRE_HISTORICAL_PROOF with a supplied exact fixture');
    return;
  }
  const root = resolve(process.env.HU_HISTORICAL_ROOT ?? '');
  assert.ok(process.env.HU_HISTORICAL_ROOT && root !== resolve(REPOSITORY), 'Exact independently pinned historical fixture root required');
  const manifest = JSON.parse(readFileSync(join(root, 'artifacts/postflop/hu-after-multiway.manifest.json')));
  for (const [path, expected] of [
    ['artifacts/postflop/hu-after-multiway.tar.gz', '5fd7f87575a9509d9fa2667ff7f13bf556cdf69a31184c932c1a819849e88c04'],
    ['artifacts/postflop/hu-after-multiway.manifest.json', '8825c4338362d6f79b36f922f5f20eddbe117541ac3561bd59c26b971a76bfa7'],
    ['configs/hu-postflop-after-multiway.review.json', '0cfd4476194ddbd511d2b3108fddb49c9cac83ba5ce4d73bb00c540a7a7c931d'],
  ]) assert.equal(hashFile(join(root, path)).sha256, expected);
  assert.equal(manifest.sources.length + manifest.inputs.length + 3, 95);
  for (const record of [...manifest.sources, ...manifest.inputs]) assert.deepEqual(hashFile(join(root, record.path)), { bytes: record.bytes, sha256: record.sha256 });
  const verified = spawnSync(process.execPath, ['apps/frontend/scripts/postflop-ai/verify-reviewed-postflop.mjs', '--review', 'configs/hu-postflop-after-multiway.review.json'],
    { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  assert.equal(verified.status, 0, verified.stderr); assert.match(verified.stdout, /independently-reviewed-subset-verified/);
  // Current unchanged v1 verifier must reject these historical source records.
  const path = 'apps/frontend/.local/historical-delivery-rejection.manifest.json', absolute = join(REPOSITORY, path);
  assert.equal(existsSync(absolute), false); writeFileSync(absolute, readFileSync(join(root, 'artifacts/postflop/hu-after-multiway.manifest.json')), { flag: 'wx' });
  try {
    const rejected = spawnSync(process.execPath, ['apps/frontend/scripts/postflop-ai/verify-reviewed-postflop.mjs', '--manifest', path], { cwd: REPOSITORY, encoding: 'utf8', timeout: 120000 });
    assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /source\/config\/input identity changed/);
  } finally { rmSync(absolute); }
});

test('synthetic last-shard destination conflict prevents all first-pass writes and parent creation', () => {
  const root = mkdtempSync(join(tmpdir(), 'postflop-all-shard-preflight-'));
  const a = 'apps/frontend/.local/postflop-ai/first-policy.json', b = 'apps/frontend/.local/postflop-ai/last-policy.json';
  const first = Buffer.from('first exact bytes'), last = Buffer.from('last exact bytes');
  const record = (path, body) => ({ path, bytes: body.length, sha256: sha256(body) });
  try {
    mkdirSync(join(root, 'apps/frontend/.local/postflop-ai'), { recursive: true });
    writeFileSync(join(root, b), 'different existing destination');
    assert.doesNotThrow(() => preflightArtifactRecords(root, [record(a, first)], new Map([[a, first]])));
    assert.throws(() => preflightArtifactRecords(root, [record(b, last)], new Map([[b, last]])), /differs/);
    assert.equal(existsSync(join(root, a)), false);
    rmSync(join(root, b));
    symlinkSync(join(root, 'absent'), join(root, b));
    assert.throws(() => preflightArtifactRecords(root, [record(b, last)], new Map([[b, last]])), /symlink/);
    assert.equal(existsSync(join(root, a)), false);
    assert.throws(() => preflightArtifactRecords(root, [record(a, first)], new Map([[a, Buffer.from('altered')]])), /bytes differ/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('actual fresh worker retains bounded approved bytes across child-path swaps', () => {
  if (!process.env.HU_REQUIRE_CURRENT_WORKER_PROOF) {
    assert.equal(process.env.HU_CURRENT_INDEX, undefined, 'Enable the explicit current-worker proof stage with an accepted child/index');
    return; // Code-contract run makes no current-data/worker-swap acceptance claim.
  }
  assert.ok(process.env.HU_CURRENT_INDEX, 'Explicit actual current-source collection index required');
  const program = `
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = pathToFileURL(process.cwd() + '/');
const delivery = await import(new URL('apps/frontend/scripts/postflop-ai/reviewed-postflop-delivery.mjs', base));
const indexModule = await import(new URL('apps/frontend/scripts/postflop-ai/reviewed-postflop-index.mjs', base));
const archive = await import(new URL('apps/frontend/scripts/postflop-ai/reviewed-postflop-archive.mjs', base));
const input = JSON.parse(readFileSync(0, 'utf8'));
const collection = indexModule.readIndex({ indexPath: input.indexPath });
const shard = collection.index.shards[0];
assert.ok(shard, 'Real independently accepted child required');
const request = { indexPath: input.indexPath, index_sha256: collection.index_sha256, shardId: shard.id, action: 'restore' };
const captured = indexModule.readBoundedShard(collection, shard);
const { snapshot } = delivery.snapshotFromBoundedCapture(collection, shard, captured);
const paths = { manifest: shard.manifest.path, archive: shard.archive.path, receipt: shard.receipt.path };
const originals = { manifest: captured.manifestBytes, archive: captured.archiveBytes, receipt: captured.receiptBytes };
const originalDestinations = new Map(snapshot.manifest.artifacts.map(record => [record.path,
  existsSync(join(collection.root, record.path)) ? readFileSync(join(collection.root, record.path)) : null]));
const prefix = 'apps/frontend/.local/postflop-ai';
function tree() {
  const result = new Map();
  function walk(relative) {
    const absolute = join(collection.root, relative);
    if (!existsSync(absolute)) return;
    for (const item of readdirSync(absolute, { withFileTypes: true })) {
      const next = relative + '/' + item.name;
      if (item.isDirectory()) walk(next);
      else { assert.ok(item.isFile(), 'No fixture symlink/nonregular entries'); result.set(next, archive.sha256(readFileSync(join(collection.root, next)))); }
    }
  }
  walk(prefix); return result;
}
const beforeTree = tree(), acceptedPaths = new Set(snapshot.manifest.artifacts.map(record => record.path));
function restoreChildPaths() { for (const kind of Object.keys(paths)) writeFileSync(join(collection.root, paths[kind]), originals[kind]); }
function replace(kind, bytes) { writeFileSync(join(collection.root, paths[kind]), bytes); }
function assertOnlyAuthorizedDestinations() {
  const after = tree();
  for (const [path, hash] of after) {
    if (acceptedPaths.has(path)) continue;
    assert.equal(beforeTree.get(path), hash, 'No collection-external ID/legacy/evidence destination may appear/change: ' + path);
  }
  for (const [path, hash] of beforeTree) if (!acceptedPaths.has(path)) assert.equal(after.get(path), hash, 'Unrelated/legacy destination removed');
}
function assertOriginalRestored() {
  for (const record of snapshot.manifest.artifacts) {
    const bytes = readFileSync(join(collection.root, record.path));
    assert.equal(bytes.length, record.bytes); assert.equal(archive.sha256(bytes), record.sha256);
  }
  assertOnlyAuthorizedDestinations();
}
function overExpandedAlternate() {
  const manifest = structuredClone(snapshot.manifest), files = new Map(snapshot.files);
  for (const record of manifest.artifacts.filter(record => ['candidate','laterCandidate','report'].includes(record.kind))) {
    const value = JSON.parse(files.get(record.path));
    value.__synthetic_unapproved_padding = 'x'.repeat(12 * 1024 * 1024);
    const bytes = Buffer.from(JSON.stringify(value));
    assert.ok(bytes.length < archive.LIMITS.file, 'Alternate stays within unchanged v1 per-file limit');
    files.set(record.path, bytes); record.bytes = bytes.length; record.sha256 = archive.sha256(bytes); record.entry = 'objects/' + record.sha256;
  }
  assert.ok(manifest.artifacts.reduce((n, record) => n + record.bytes, 0) > indexModule.COLLECTION_LIMITS.expanded);
  const bytes = archive.encodeArchive(manifest.artifacts, files);
  manifest.archive.bytes = bytes.length; manifest.archive.sha256 = archive.sha256(bytes); manifest.content_sha256 = archive.contentIdentity(manifest);
  archive.assertManifest(manifest); // Valid old v1 envelope; NOT reviewed/accepted.
  return { manifest: archive.jsonBytes(manifest), archive: bytes };
}
let verifiedPinnedSnapshot = false, restoreReached = false, result, failure;
try {
  if (input.mode === 'capture-identity') {
    // Changing all filesystem paths cannot change already captured decode bytes.
    replace('manifest', Buffer.from('{"unapproved_replacement":true}'));
    replace('archive', Buffer.alloc(indexModule.COLLECTION_LIMITS.compressed + 1));
    replace('receipt', Buffer.from('{"unapproved_replacement":true}'));
    const decoded = delivery.snapshotFromBoundedCapture(collection, shard, captured);
    assert.deepEqual(decoded.snapshot.manifest, snapshot.manifest);
    for (const record of snapshot.manifest.artifacts) assert.equal(archive.sha256(decoded.snapshot.files.get(record.path)), record.sha256);
    assert.throws(() => indexModule.readBoundedShard(collection, shard), /Exact bounded child size differs|Exact child bytes differ/);
    result = { helper_captured_bytes_only: true };
  } else if (['manifest-after-read','receipt-after-read','compressed-after-read','expanded-after-read','late-before-preflight'].includes(input.mode)) {
    const alternate = input.mode === 'expanded-after-read' ? overExpandedAlternate() : null;
    const mutate = () => {
      if (input.mode === 'manifest-after-read') replace('manifest', Buffer.from('{"unapproved_replacement":true}'));
      else if (input.mode === 'receipt-after-read') replace('receipt', Buffer.from('{"unapproved_replacement":true}'));
      else if (alternate) { replace('manifest', alternate.manifest); replace('archive', alternate.archive); }
      else replace('archive', Buffer.alloc(indexModule.COLLECTION_LIMITS.compressed + 1));
    };
    try {
      delivery.worker(request, {
        afterBoundedRead: input.mode === 'late-before-preflight' ? undefined : mutate,
        afterSnapshotVerified: () => { verifiedPinnedSnapshot = true; if (input.mode === 'late-before-preflight') mutate(); },
        beforeRestore: () => { restoreReached = true; },
      });
    } catch (error) { failure = error; }
    assert.ok(verifiedPinnedSnapshot, 'Actual worker must decode/gate pinned A, never reread substituted B');
    assert.ok(failure, 'Persistent between-pass mutation must reject');
    assert.match(failure.message, /Exact bounded child size differs|Exact child bytes differ/, 'Expected exact child identity rejection, not an unrelated throw');
    assert.equal(restoreReached, false, 'Mutation must reject before the restore payload write');
    for (const [path, bytes] of originalDestinations) {
      if (bytes === null) assert.equal(existsSync(join(collection.root, path)), false, 'No first destination may be created');
      else assert.ok(readFileSync(join(collection.root, path)).equals(bytes));
    }
    assertOnlyAuthorizedDestinations(); result = { pinned_a_verified: true, rejected_before_writes: true };
  } else if (['restore-swap-back','restore-persistent'].includes(input.mode)) {
    try {
      result = delivery.worker(request, {
        beforeRestore: () => {
          restoreReached = true;
          replace('manifest', Buffer.from('{"unapproved_replacement":true,"preserved_legacy_spots":["BTN_open_BB_call"],"extra_id":"Outside_collection"}'));
          replace('archive', Buffer.alloc(indexModule.COLLECTION_LIMITS.compressed + 1));
          replace('receipt', Buffer.from('{"unapproved_replacement":true}')); // Never fabricate an independent acceptance.
        },
        afterRestore: () => { if (input.mode === 'restore-swap-back') restoreChildPaths(); },
      });
    } catch (error) { failure = error; }
    assert.ok(restoreReached); assertOriginalRestored();
    if (input.mode === 'restore-persistent') {
      assert.ok(failure, 'Persistent late mutation must prevent completed success');
      assert.match(failure.message, /Exact bounded child size differs|Exact child bytes differ/, 'Expected exact child identity rejection after restoring only A');
    }
    else {
      assert.equal(failure, undefined); assert.equal(result.status, 'verified-reviewed-child');
      assert.deepEqual(result.artifacts, snapshot.manifest.artifacts, 'Returned metadata must describe the actual pinned restored bytes');
    }
  } else if (input.mode === 'repeat-identical') {
    const first = delivery.worker(request), second = delivery.worker(request);
    assert.deepEqual(first.artifacts, second.artifacts); assert.deepEqual(first.rows, second.rows); assertOriginalRestored();
    result = { identical_repeat: true };
  } else throw new Error('Unknown explicit actual-worker regression');
  console.log(JSON.stringify({ mode: input.mode, pass: true, accepted_ids: shard.accepted_new_spot_ids,
    artifact_destinations: snapshot.manifest.artifacts.length, max_rss_kib: process.resourceUsage().maxRSS }));
} finally {
  restoreChildPaths();
  for (const [path, bytes] of originalDestinations) {
    const target = join(collection.root, path);
    if (bytes === null) { if (existsSync(target)) rmSync(target); }
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  }
  assertOnlyAuthorizedDestinations();
}
`;
  for (const mode of ['capture-identity', 'manifest-after-read', 'receipt-after-read', 'compressed-after-read', 'expanded-after-read', 'late-before-preflight', 'restore-swap-back', 'restore-persistent', 'repeat-identical']) {
    const result = spawnSync(process.execPath, ['--max-old-space-size=768', '--input-type=module', '-e', program], {
      cwd: REPOSITORY, input: JSON.stringify({ indexPath: process.env.HU_CURRENT_INDEX, mode }), encoding: 'utf8',
      timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8', TZ: 'UTC' },
    });
    assert.equal(result.signal, null, mode); assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
    const report = JSON.parse(result.stdout); assert.equal(report.pass, true, mode);
    assert.ok(report.max_rss_kib > 0 && report.max_rss_kib <= 1536 * 1024, 'Actual worker subprocess RSS bound');
  }
});
