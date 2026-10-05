import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ARTIFACT_PREFIX, LIMITS, artifactPath, assertManifest, contentIdentity, decodeArchive, encodeArchive,
  fileRecord, jsonBytes, restoreBytes, sha256 } from '../scripts/postflop-ai/reviewed-postflop-archive.mjs';
import { REPOSITORY, assertAuditEvidence, assertCapturedAuditIdentity, assertIndependentReview, reviewedSourcePaths } from '../scripts/postflop-ai/reviewed-postflop.mjs';

const record = (path, body) => ({ path, bytes: body.length, sha256: sha256(body) });
function fixture({ legacy = false, id = null } = {}) {
  const spot = { id: id ?? (legacy ? 'Legacy_spot' : 'New_spot'), slug: 'x'.repeat(85), classification: legacy ? 'preserved-legacy' : 'new-candidate', identity: {}, evidence: [] };
  const bodies = new Map(['candidate', 'laterCandidate', 'report'].map(kind => [artifactPath(spot, kind), Buffer.from(JSON.stringify({ kind, exact: 'bytes\n', historical_defence_version: 5 }))]));
  const artifacts = [...bodies].map(([path, body]) => ({ ...record(path, body), spot: spot.id,
    kind: ['candidate', 'laterCandidate', 'report'].find(kind => artifactPath(spot, kind) === path), entry: `objects/${sha256(body)}` })).sort((a, b) => a.path.localeCompare(b.path));
  const sources = [record('scripts/source.mjs', Buffer.from('source'))], inputs = [record('inputs/input.json', Buffer.from('{}'))];
  const compressed = encodeArchive(artifacts, bodies);
  const ids = legacy ? [] : [spot.id];
  const manifest = { schema_version: 1, kind: 'postflop-artifact-snapshot', approval: 'unapproved', spots: [spot],
    coverage: { scope: 'candidate-preservation', expected_new_spot_ids: ids, included_new_spot_ids: ids, unavailable_new_spots: [], catalog_sha256: sha256(jsonBytes(ids)) },
    sources, inputs, sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(inputs)), artifacts,
    archive: { path: 'artifacts/postflop/fixture.tar.gz', format: 'ustar+gzip-content-addressed-v1', bytes: compressed.length, sha256: sha256(compressed) } };
  manifest.content_sha256 = contentIdentity(manifest);
  return { manifest, bodies, compressed, spot };
}
const resign = manifest => { manifest.content_sha256 = contentIdentity(manifest); return manifest; };
function alteredTar(f, change) {
  const compressed = gzipSync(change(gunzipSync(f.compressed)), { level: 9 });
  const manifest = structuredClone(f.manifest);
  manifest.archive = { ...manifest.archive, bytes: compressed.length, sha256: sha256(compressed) };
  return () => decodeArchive(compressed, manifest);
}
test('deterministic raw-byte round trip preserves long slugs without USTAR truncation', () => {
  const f = fixture();
  assert.ok(f.manifest.artifacts.some(item => item.path.split('/').at(-1).length > 100));
  assert.deepEqual(encodeArchive(f.manifest.artifacts, f.bodies), f.compressed);
  assert.deepEqual(decodeArchive(f.compressed, f.manifest), f.bodies);
  assert.deepEqual([...f.compressed.subarray(4, 8)], [0, 0, 0, 0]);
  const tar = gunzipSync(f.compressed);
  assert.equal(tar.subarray(0, 72).toString(), f.manifest.artifacts.map(item => item.entry).sort()[0]);
  const root = mkdtempSync(join(tmpdir(), 'postflop-restore-'));
  try {
    assert.equal(restoreBytes(root, f.manifest, f.bodies).files, 3);
    assert.equal(restoreBytes(root, f.manifest, f.bodies).files, 3);
    for (const [path, body] of f.bodies) assert.deepEqual(readFileSync(join(root, path)), body);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('archive has exactly the manifest object set; rejects duplicates and unexpected entries', () => {
  const f = fixture(), tar = gunzipSync(f.compressed), block = tar.subarray(0, 1024);
  assert.throws(alteredTar(f, data => Buffer.concat([block, data])), /oversized|duplicate/);
  assert.throws(alteredTar(f, data => { data.write('objects/' + 'f'.repeat(64), 0); return data; }), /Unexpected/);
  assert.throws(alteredTar(f, data => data.subarray(1024)), /incomplete|Truncated/);
});
test('rejects traversal, symlinks, hard links, malformed metadata and bad checksum headers', () => {
  const f = fixture();
  for (const mutate of [
    data => data.write('../escape', 0), data => { data[156] = 50; }, data => { data[156] = 49; },
    data => { data[148] ^= 1; }, data => data.write('77777777777', 124),
    data => { data[136] = 49; }, data => data.write('../', 345),
  ]) assert.throws(alteredTar(f, data => { mutate(data); return data; }), /Unexpected|Noncanonical/);
});
test('rejects changed bytes, truncated gzip/tar, oversize and pointer-only payloads', () => {
  const f = fixture();
  assert.throws(() => decodeArchive(f.compressed.subarray(0, -8), f.manifest), /hash mismatch/);
  assert.throws(alteredTar(f, data => data.subarray(0, -512)), /Truncated/);
  assert.throws(alteredTar(f, data => { data[512] ^= 1; return data; }), /changed/);
  assert.throws(alteredTar(f, data => Buffer.concat([data, Buffer.alloc(512)])), /oversized/);
  const truncated = f.compressed.subarray(0, -8), copy = structuredClone(f.manifest);
  copy.archive.bytes = truncated.length; copy.archive.sha256 = sha256(truncated);
  assert.throws(() => decodeArchive(truncated, copy), /truncated/);
  assert.throws(() => decodeArchive(Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64)), f.manifest), /Git LFS payload/);
  const huge = structuredClone(f.manifest); huge.artifacts[0].bytes = LIMITS.file + 1;
  assert.throws(() => assertManifest(resign(huge)), /artifact record/);
});
test('manifest rejects extra/missing policies, duplicate paths and arbitrary local evidence', () => {
  const f = fixture();
  for (const change of [
    m => { m.artifacts.push(m.artifacts[0]); },
    m => { m.artifacts = m.artifacts.filter(item => item.kind !== 'laterCandidate'); },
    m => { m.artifacts[0].path = ARTIFACT_PREFIX + '../credentials.json'; },
    m => { m.spots[0].evidence = [ARTIFACT_PREFIX + 'private.log']; },
    m => { m.spots.push(m.spots[0]); },
    m => { m.spots[0].classification = 'accepted-new'; },
    m => { m.approval = 'independently-reviewed'; },
  ]) {
    const manifest = structuredClone(f.manifest); change(manifest);
    assert.throws(() => assertManifest(resign(manifest)));
  }
});
test('preflight rejects every differing destination before writing any new file', () => {
  const f = fixture(), root = mkdtempSync(join(tmpdir(), 'postflop-collision-'));
  try {
    const last = f.manifest.artifacts.at(-1).path;
    mkdirSync(join(root, ARTIFACT_PREFIX), { recursive: true }); writeFileSync(join(root, last), 'different');
    assert.throws(() => restoreBytes(root, f.manifest, f.bodies), /Existing local artifact differs/);
    assert.equal(existsSync(join(root, f.manifest.artifacts[0].path)), false);
    assert.equal(readFileSync(join(root, last), 'utf8'), 'different');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('restoration rejects parent/file/dangling symlinks and non-directory parents', () => {
  for (const mode of ['parent', 'file', 'dangling', 'nondirectory']) {
    const f = fixture(), root = mkdtempSync(join(tmpdir(), 'postflop-link-')), elsewhere = mkdtempSync(join(tmpdir(), 'postflop-outside-'));
    try {
      mkdirSync(join(root, 'apps/frontend'), { recursive: true });
      if (mode === 'parent') symlinkSync(elsewhere, join(root, 'apps/frontend/.local'));
      else if (mode === 'nondirectory') writeFileSync(join(root, 'apps/frontend/.local'), 'not a directory');
      else { mkdirSync(join(root, ARTIFACT_PREFIX), { recursive: true }); symlinkSync(mode === 'dangling' ? join(elsewhere, 'absent') : elsewhere, join(root, f.manifest.artifacts[0].path)); }
      assert.throws(() => restoreBytes(root, f.manifest, f.bodies), /symlink|regular file/);
      assert.equal(existsSync(join(elsewhere, 'postflop-ai')), false);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(elsewhere, { recursive: true, force: true }); }
  }
});
test('preserved legacy bytes are never promoted to fresh or accepted by packaging', () => {
  const f = fixture({ legacy: true });
  assert.deepEqual(decodeArchive(f.compressed, f.manifest), f.bodies);
  assert.equal(f.manifest.spots[0].classification, 'preserved-legacy');
  assert.equal(f.manifest.approval, 'unapproved');
  assert.throws(() => assertIndependentReview({}, { manifest: f.manifest, manifestBytes: jsonBytes(f.manifest), files: f.bodies }), /separate matching independent/);
});
test('review gate cannot accept a candidate with fresh-report metadata alone or partial board audit', () => {
  const f = fixture();
  f.spot.identity = { policy_status: 'fresh-pair', report_status: 'fresh' };
  resign(f.manifest);
  const snapshot = { manifest: f.manifest, manifestBytes: jsonBytes(f.manifest), files: f.bodies };
  const review = { schema_version: 1, review: { status: 'independently-reviewed', author: 'author', reviewer: 'reviewer', scope: 'test fixture only', baseline_commit: 'a'.repeat(40) },
    manifest_sha256: sha256(snapshot.manifestBytes), archive_sha256: f.manifest.archive.sha256, content_sha256: f.manifest.content_sha256,
    accepted_new_spots: [{ spot: f.spot.id }], preserved_legacy_spots: [] };
  review.coverage = { scope: 'complete-catalog', catalog_sha256: f.manifest.coverage.catalog_sha256, expected_new_spot_ids: [f.spot.id], deferred_new_spots: [] };
  assert.throws(() => assertIndependentReview(review, snapshot), /evidence is missing/);
  assert.throws(() => assertIndependentReview({ ...review, review: { ...review.review, reviewer: 'author' } }, snapshot), /independent/);
  assert.throws(() => assertAuditEvidence({ schema_version: 1, status: 'pass', boards: 1755, errors: 0 }, f.spot, 'all-boards', f.manifest, f.bodies), /actual successful audit/);
});
test('postflop source graph binds archive tooling, numerical dependencies and configs', () => {
  const paths = reviewedSourcePaths();
  for (const suffix of ['scripts/postflop-ai/defence.ts', 'scripts/postflop-ai/board-worker.mjs', 'scripts/postflop-ai/reviewed-postflop-archive.mjs',
    'scripts/data/postflop-ai-pilot.json', 'scripts/lib/equity.ts']) assert.ok(paths.includes('apps/frontend/' + suffix), suffix);
  assert.ok(paths.includes('configs/cash-6max-100bb.json'));
  assert.ok(paths.includes('configs/multiway-preflop-stage2.json'));
  assert.equal(paths.some(path => path.includes('/.local/')), false);
});

test('partial manifest names omitted catalog spots; a receipt cannot silently claim complete coverage', () => {
  const f = fixture();
  const expected = ['New_spot', 'Other_spot'];
  f.manifest.coverage.expected_new_spot_ids = expected;
  f.manifest.coverage.catalog_sha256 = sha256(jsonBytes(expected));
  f.manifest.coverage.unavailable_new_spots = [{ spot: 'Other_spot', reason: 'No policy authored for this synthetic spot' }];
  resign(f.manifest); assert.doesNotThrow(() => assertManifest(f.manifest));
  const snapshot = { manifest: f.manifest, manifestBytes: jsonBytes(f.manifest), files: f.bodies };
  const receipt = { schema_version: 1, review: { status: 'independently-reviewed', author: 'fixture author', reviewer: 'fixture reviewer', scope: 'Synthetic test only', baseline_commit: 'a'.repeat(40) },
    manifest_sha256: sha256(snapshot.manifestBytes), archive_sha256: f.manifest.archive.sha256, content_sha256: f.manifest.content_sha256,
    accepted_new_spots: [{ spot: 'New_spot' }], preserved_legacy_spots: [],
    coverage: { scope: 'complete-catalog', catalog_sha256: f.manifest.coverage.catalog_sha256, expected_new_spot_ids: ['New_spot'], deferred_new_spots: [{ spot: 'Other_spot', reason: 'not audited' }] } };
  assert.throws(() => assertIndependentReview(receipt, snapshot), /complete catalog/);
  receipt.coverage.scope = 'reviewed-subset'; receipt.coverage.deferred_new_spots = [];
  assert.throws(() => assertIndependentReview(receipt, snapshot), /complete catalog/);
  delete f.manifest.coverage.unavailable_new_spots[0].reason;
  assert.throws(() => assertManifest(resign(f.manifest)), /unavailable/);
});

test('independent synthetic review needs both exact successful proofs and rejects partial/stale all-board proof', async t => {
  const { config, loadInputs } = await import('../scripts/postflop-ai/inputs.mjs');
  const { allBoardIdentity } = await import('../scripts/postflop-ai/all-board-checkpoints.mjs');
  const hashJSON = value => sha256(JSON.stringify(value));
  const f = fixture({ id: 'UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call' }), id = f.spot.id;
  const actualInputs = loadInputs(id);
  f.spot.identity = { policy_status: 'fresh-pair', report_status: 'fresh', current_source_fingerprint: actualInputs.fingerprint, flop_policy_hash: 'b'.repeat(64), later_policy_hash: 'c'.repeat(64) };
  f.bodies.set(artifactPath(f.spot, 'report'), Buffer.from(JSON.stringify({ results: [{}] })));
  const { captureAuditIdentity } = await import('../scripts/postflop-ai/audit-identity.mjs');
  const { canonicalFlops } = await import('../scripts/postflop-ai/flop-isomorphism.ts');
  const { buildAllBoardCompanion, companionPathFor, summaryPathFor } = await import('../scripts/postflop-ai/all-board-companion.mjs');
  const auditIdentity = captureAuditIdentity();
  f.manifest.sources = reviewedSourcePaths().map(path => fileRecord(REPOSITORY, path));
  f.manifest.inputs = auditIdentity.inputs;
  f.manifest.sources_sha256 = sha256(jsonBytes(f.manifest.sources));
  f.manifest.inputs_sha256 = sha256(jsonBytes(f.manifest.inputs));
  const identity = allBoardIdentity({ spot: { id }, fingerprint: f.spot.identity.current_source_fingerprint, config },
    { metadata: { policy_hash: f.spot.identity.flop_policy_hash } }, { metadata: { policy_hash: f.spot.identity.later_policy_hash } }, 'all');
  const identityHash = hashJSON(identity);
  const coverage = { flops: 1755, reachable_flops: 1755, turn_boards: 7020, unreachable_turn_boards: 0, river_runouts: 21060, unreachable_river_runouts: 0 };
  const resultPath = summaryPathFor(id, identityHash);
  const result = { spot: id, street: 'all', identity_hash: identityHash, source_hash: f.spot.identity.current_source_fingerprint, policy_hash: f.spot.identity.flop_policy_hash,
    later_policy_hash: f.spot.identity.later_policy_hash, boards: 1755, evaluated_boards: 1755, unreachable: 0, later_coverage: coverage, clean: 1755, errors: 0, findings: [] };
  const resultBytes = jsonBytes(result), log = `[${id}] PASS: 1 expanded combo decisions, 1 comparisons, fixed-seed replay.\n`;
  const common = { schema_version: 1, status: 'pass', spot: id, exit_code: 0, started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:01:00Z',
    source_fingerprint: f.spot.identity.current_source_fingerprint, flop_policy_hash: f.spot.identity.flop_policy_hash, later_policy_hash: f.spot.identity.later_policy_hash,
    artifact_sha256: Object.fromEntries(['candidate', 'laterCandidate', 'report'].map(kind => [kind, sha256(f.bodies.get(artifactPath(f.spot, kind)))])),
    log: { text: log, sha256: sha256(log) } };
  const representative = { ...common, command: `node scripts/postflop-ai/cli.mjs audit --spot ${id}`, checkedCombos: 1, comparisons: 1, fixed_seed_replay_pass: true, audit_identity: { start: auditIdentity, end: auditIdentity, sha256: hashJSON(auditIdentity) } };
  const allBoards = { ...common, command: `node scripts/postflop-ai/audit-all-boards.mjs --spot ${id}`, street: 'all', canonical_flops: 1755,
    evaluated_boards: 1755, proven_unreachable: 0, later_coverage: coverage, errors: 0, identity_hash: identityHash, result: { path: resultPath, sha256: sha256(resultBytes) } };
  const allBoardLog = `${id}: 1755 boards (0 proven unreachable), 1755 clean, 0 error findings, 1s\n`;
  allBoards.log = { text: allBoardLog, sha256: sha256(allBoardLog) };
  const representativePath = ARTIFACT_PREFIX + `audit-evidence/${id}-representative.json`, allBoardPath = ARTIFACT_PREFIX + `audit-evidence/${id}-all-boards.json`;
  const checkpoints = canonicalFlops().map(({ id: board }) => {
    const row = { board, later_coverage: { flops: 1, reachable_flops: 1, turn_boards: 4, unreachable_turn_boards: 0, river_runouts: 12, unreachable_river_runouts: 0 }, findings: [] };
    return { key: identityHash, row, sha256: hashJSON(row) };
  });
  const companion = buildAllBoardCompanion(identity, resultBytes, checkpoints, actualInputs), companionPath = companionPathFor(id, identityHash);
  allBoards.checkpoint_companion = { path: companionPath, sha256: sha256(companion.bytes) };
  f.bodies.set(companionPath, companion.bytes);
  f.bodies.set(resultPath, resultBytes); f.bodies.set(representativePath, jsonBytes(representative)); f.bodies.set(allBoardPath, jsonBytes(allBoards));
  f.spot.evidence = [resultPath, representativePath, allBoardPath, companionPath].sort();
  f.manifest.artifacts = [...f.bodies].map(([path, body]) => ({ ...record(path, body), spot: id, kind: f.spot.evidence.includes(path) ? 'auditEvidence' :
    ['candidate', 'laterCandidate', 'report'].find(kind => artifactPath(f.spot, kind) === path), entry: `objects/${sha256(body)}` })).sort((a, b) => a.path < b.path ? -1 : 1);
  const compressed = encodeArchive(f.manifest.artifacts, f.bodies);
  f.manifest.archive.bytes = compressed.length; f.manifest.archive.sha256 = sha256(compressed); resign(f.manifest);
  const snapshot = { manifest: f.manifest, manifestBytes: jsonBytes(f.manifest), files: f.bodies };
  const receipt = { schema_version: 1, review: { status: 'independently-reviewed', author: 'fixture author', reviewer: 'fixture reviewer', scope: 'Synthetic unit test only, never production', baseline_commit: 'a'.repeat(40) },
    manifest_sha256: sha256(snapshot.manifestBytes), archive_sha256: f.manifest.archive.sha256, content_sha256: f.manifest.content_sha256,
    coverage: { scope: 'complete-catalog', catalog_sha256: f.manifest.coverage.catalog_sha256, expected_new_spot_ids: [id], deferred_new_spots: [] },
    accepted_new_spots: [{ spot: id, representative_evidence: representativePath, all_board_evidence: allBoardPath }], preserved_legacy_spots: [] };
  assert.deepEqual(assertIndependentReview(receipt, snapshot).accepted_new_spots, [id]);
  await t.test('type-reached exact preflop inputs still reject a changed raw-input digest', () => {
    const path = 'apps/frontend/src/estimated/preflop-ranges.json';
    assert.ok(f.manifest.inputs.some(item => item.path === path));
    const changed = { ...f.manifest, inputs: f.manifest.inputs.map(item => item.path === path ? { ...item, sha256: '0'.repeat(64) } : item) };
    assert.throws(() => assertAuditEvidence(allBoards, f.spot, 'all-boards', changed, f.bodies), /numerical identity differs/);
  });
  await t.test('an allowlisted input cannot be accepted from source records instead', () => {
    const path = 'apps/frontend/src/estimated/preflop-ranges.json';
    const input = f.manifest.inputs.find(item => item.path === path); assert.ok(input);
    const moved = { ...f.manifest, inputs: f.manifest.inputs.filter(item => item.path !== path), sources: [...f.manifest.sources, input] };
    assert.throws(() => assertAuditEvidence(allBoards, f.spot, 'all-boards', moved, f.bodies), /numerical identity differs/);
  });
  await t.test('a non-allowlisted numerical source cannot be reclassified as an input', () => {
    const path = 'apps/frontend/scripts/postflop-ai/audit-all-boards.mjs';
    const source = f.manifest.sources.find(item => item.path === path); assert.ok(source);
    const moved = { ...f.manifest, sources: f.manifest.sources.filter(item => item.path !== path), inputs: [...f.manifest.inputs, source] };
    assert.throws(() => assertAuditEvidence(allBoards, f.spot, 'all-boards', moved, f.bodies), /numerical identity differs/);
  });
  for (const update of [{ canonical_flops: 12 }, { street: 'flop' }, { errors: 1 }, { identity_hash: 'e'.repeat(64) }, { evaluated_boards: 1754 }, { later_coverage: {} }, { exit_code: 1 }]) {
    assert.throws(() => assertAuditEvidence({ ...allBoards, ...update }, f.spot, 'all-boards', f.manifest, f.bodies));
  }
  assert.throws(() => assertAuditEvidence({ ...representative, comparisons: 2 }, f.spot, 'representative', f.manifest, f.bodies), /fixed-seed/);
  assert.throws(() => assertAuditEvidence({ ...representative, audit_identity: undefined }, f.spot, 'representative', f.manifest, f.bodies), /official start\/end/);
  assert.throws(() => assertAuditEvidence({ ...allBoards, checkpoint_companion: undefined }, f.spot, 'all-boards', f.manifest, f.bodies), /companion/);
  const reduced = { ...auditIdentity, sources: auditIdentity.sources.slice(1) };
  assert.throws(() => assertCapturedAuditIdentity({ start: reduced, end: reduced, sha256: hashJSON(reduced) }, auditIdentity, f.manifest), /transitive/);
});

test('identical bytes share a short object without dropping either destination', () => {
  const f = fixture(), body = Buffer.from('{"same":"raw bytes"}\n');
  for (const item of f.manifest.artifacts) {
    f.bodies.set(item.path, body); item.bytes = body.length; item.sha256 = sha256(body); item.entry = `objects/${item.sha256}`;
  }
  const compressed = encodeArchive(f.manifest.artifacts, f.bodies);
  f.manifest.archive.bytes = compressed.length; f.manifest.archive.sha256 = sha256(compressed); resign(f.manifest);
  assert.equal(gunzipSync(compressed).length, 2048);
  assert.deepEqual(decodeArchive(compressed, f.manifest), f.bodies);
});
