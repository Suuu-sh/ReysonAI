import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { MW3_ARTIFACT_PREFIX, MW3_ARCHIVE_LIMITS, assertMw3ArchiveManifest, mw3ArchiveContentHash, mw3ArchivePaths,
  encodeMw3Archive, decodeMw3Archive, restoreMw3ArchiveBytes, sha256, jsonBytes } from '../scripts/postflop-ai/mw3-reviewed-archive.mjs';
const record = (path, body) => ({ path, bytes: body.length, sha256: sha256(body) });
const resign = manifest => { manifest.content_sha256 = mw3ArchiveContentHash(manifest); return manifest; };
function fixture() {
  const spot = { id: 'HJ_open_BTN_call_BB_call', slug: 'hj-btn-bb-mw3-srp-v1', author_version: 1, author_model: 'gpt-6-astra',
    source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64), verification_hash: 'c'.repeat(64), recipe_sha256: 'd'.repeat(64),
    flop_policy_hash: 'e'.repeat(64), later_policy_hash: 'f'.repeat(64) };
  spot.gate_directory = `${MW3_ARTIFACT_PREFIX}gates/${spot.slug}/v1-${'a'.repeat(12)}-${'b'.repeat(12)}-${'c'.repeat(12)}-${'d'.repeat(12)}`;
  const bodies = new Map(), artifacts = Object.entries(mw3ArchivePaths(spot)).map(([kind, path]) => {
    const body = Buffer.from(JSON.stringify({ kind, synthetic: true })); bodies.set(path, body);
    return { ...record(path, body), kind, spot: spot.id, entry: `objects/${sha256(body)}` };
  }).sort((a, b) => a.path < b.path ? -1 : 1);
  const sources = [record('apps/frontend/scripts/postflop-ai/mw3-reviewed-archive.mjs', Buffer.from('source'))];
  const inputs = [record('apps/frontend/src/estimated/opening-ranges.json', Buffer.from('{}'))];
  const compressed = encodeMw3Archive(artifacts, bodies);
  const manifest = resign({ schema_version: 1, kind: 'mw3-artifact-snapshot', approval: 'unapproved', source_tree: 'a'.repeat(40), spot, sources, inputs,
    sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(inputs)), artifacts,
    archive: { path: `artifacts/postflop/mw3-${spot.slug}.tar.gz`, format: 'ustar+gzip-content-addressed-v1', bytes: compressed.length, sha256: sha256(compressed) } });
  return { manifest, bodies, compressed };
}
function alteredArchive(f, change) {
  const compressed = gzipSync(change(gunzipSync(f.compressed)), { level: 9 });
  const manifest = structuredClone(f.manifest); manifest.archive.bytes = compressed.length; manifest.archive.sha256 = sha256(compressed);
  return () => decodeMw3Archive(compressed, manifest);
}
test('single-spot archive has deterministic raw bytes and complete repeatable restore', () => {
  const f = fixture(), root = mkdtempSync(join(tmpdir(), 'mw3-archive-'));
  try {
    assert.deepEqual(encodeMw3Archive(f.manifest.artifacts, f.bodies), f.compressed);
    assert.deepEqual(decodeMw3Archive(f.compressed, f.manifest), f.bodies);
    assert.deepEqual([...f.compressed.subarray(4, 8)], [0, 0, 0, 0]);
    assert.equal(restoreMw3ArchiveBytes(root, f.manifest, f.bodies).files, 7);
    assert.equal(restoreMw3ArchiveBytes(root, f.manifest, f.bodies).files, 7);
    for (const [path, bytes] of f.bodies) assert.deepEqual(readFileSync(join(root, path)), bytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('manifest requires exactly both policies and all five bound reports; cannot self-approve', () => {
  for (const change of [
    m => { m.approval = 'approved'; }, m => { m.artifacts.pop(); }, m => { m.artifacts.push(m.artifacts[0]); },
    m => { m.artifacts[0].path = MW3_ARTIFACT_PREFIX + '../other-policy.json'; }, m => { m.spot.gate_directory += '-different'; },
    m => { m.spot.author_model = 'other'; }, m => { m.archive.path = 'artifacts/postflop/hu-after-multiway.tar.gz'; },
    m => { m.sources[0].path = 'credentials.json'; m.sources_sha256 = sha256(jsonBytes(m.sources)); },
    m => { m.sources[0].path = 'apps/frontend/scripts/postflop-ai/../private.mjs'; m.sources_sha256 = sha256(jsonBytes(m.sources)); },
    m => { m.artifacts[0].bytes = MW3_ARCHIVE_LIMITS.file + 1; }, m => { m.archive.bytes = MW3_ARCHIVE_LIMITS.compressed + 1; },
  ]) { const f = fixture(); change(f.manifest); assert.throws(() => assertMw3ArchiveManifest(resign(f.manifest))); }
});
test('decoder rejects traversal, symlinks, malformed headers and changed payloads', () => {
  const f = fixture();
  for (const change of [
    data => data.write('../escape', 0), data => { data[156] = 50; }, data => { data[156] = 49; },
    data => { data[148] ^= 1; }, data => { data[512] ^= 1; }, data => data.write('77777777777', 124), data => { data[136] = 49; },
  ]) assert.throws(alteredArchive(f, data => { change(data); return data; }));
  assert.throws(alteredArchive(f, data => Buffer.concat([data.subarray(0, 1024), data])));
  assert.throws(alteredArchive(f, data => data.subarray(1024)));
  assert.throws(alteredArchive(f, data => Buffer.concat([data, Buffer.alloc(512)])));
});
test('LFS pointer-only, truncated or mismatched compressed bytes never count as restored', () => {
  const f = fixture();
  assert.throws(() => decodeMw3Archive(Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64)), f.manifest), /LFS payload/);
  assert.throws(() => decodeMw3Archive(f.compressed.subarray(0, -8), f.manifest), /hash mismatch/);
  const truncated = f.compressed.subarray(0, -8), m = structuredClone(f.manifest); m.archive.bytes = truncated.length; m.archive.sha256 = sha256(truncated);
  assert.throws(() => decodeMw3Archive(truncated, m), /truncated/);
});
test('restore preflights the full file set before writing and never overwrites a collision', () => {
  const f = fixture(), root = mkdtempSync(join(tmpdir(), 'mw3-collision-'));
  try {
    const last = f.manifest.artifacts.at(-1).path; mkdirSync(join(root, last, '..'), { recursive: true }); writeFileSync(join(root, last), 'keep');
    assert.throws(() => restoreMw3ArchiveBytes(root, f.manifest, f.bodies), /preserved/);
    assert.equal(existsSync(join(root, f.manifest.artifacts[0].path)), false);
    assert.equal(readFileSync(join(root, last), 'utf8'), 'keep');
    const extra = new Map(f.bodies); extra.set('unrelated', Buffer.from('no')); assert.throws(() => restoreMw3ArchiveBytes(root, f.manifest, extra), /file set/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('restore rejects parent and dangling-file symlinks', () => {
  for (const mode of ['parent', 'file']) {
    const f = fixture(), root = mkdtempSync(join(tmpdir(), 'mw3-link-')), outside = mkdtempSync(join(tmpdir(), 'mw3-outside-'));
    try {
      if (mode === 'parent') { mkdirSync(join(root, 'apps/frontend'), { recursive: true }); symlinkSync(outside, join(root, 'apps/frontend/.local')); }
      else { const path = f.manifest.artifacts[0].path; mkdirSync(join(root, path, '..'), { recursive: true }); symlinkSync(join(outside, 'missing'), join(root, path)); }
      assert.throws(() => restoreMw3ArchiveBytes(root, f.manifest, f.bodies), /symlink/);
      assert.equal(existsSync(join(outside, 'postflop-ai')), false);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  }
});

test('single gzip framing rejects even empty concatenated members and zero padding', () => {
  const f = fixture();
  for (const compressed of [Buffer.concat([f.compressed, gzipSync(Buffer.alloc(0), { level: 9 })]),
    Buffer.concat([gzipSync(Buffer.alloc(0), { level: 9 }), f.compressed]), Buffer.concat([f.compressed, Buffer.alloc(8)])]) {
    const manifest = structuredClone(f.manifest); manifest.archive.bytes = compressed.length; manifest.archive.sha256 = sha256(compressed);
    assert.throws(() => decodeMw3Archive(compressed, manifest), /gzip archive/);
  }
});
