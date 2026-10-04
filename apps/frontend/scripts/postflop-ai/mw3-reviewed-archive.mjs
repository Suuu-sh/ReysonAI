// Byte-only, single-spot Mw3 preservation. Packaging is not policy acceptance.
// Reuse the already-reviewed writer/safe-IO primitives without changing HU code.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync, crc32 } from 'node:zlib';
import { assertSafeFile, assertRecords, encodeArchive, jsonBytes, readSafeFile, sha256, validHash } from './reviewed-postflop-archive.mjs';
export { jsonBytes, readSafeFile, sha256 };
export const MW3_ARCHIVE_LIMITS = Object.freeze({ file: 16 * 1024 * 1024, total: 48 * 1024 * 1024, compressed: 8 * 1024 * 1024, manifest: 2 * 1024 * 1024 });
export const MW3_ARTIFACT_PREFIX = 'apps/frontend/.local/postflop-ai/mw3/';
export const MW3_REPORT_NAMES = Object.freeze(['all-flops', 'joint-defence', 'later-runouts', 'simulation', 'simulation-replay']);
const fail = message => { throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SOURCE_PATH = /^(?:apps\/frontend\/(?:scripts\/(?:postflop-ai|lib|data)\/[^.][A-Za-z0-9_./-]*\.(?:mjs|json|py)|src\/[A-Za-z0-9_/-]+\.(?:ts|tsx|json|css|png|svg)|(?:package(?:-lock)?|tsconfig)\.json|docs\/[A-Za-z0-9_./-]+\.md)|apps\/backend\/(?:src|scripts|tests)\/[A-Za-z0-9_./-]+|apps\/shared\/[A-Za-z0-9_-]+\.ts|configs\/[A-Za-z0-9_-]+\.json|\.gitattributes)$/;
export function mw3ArchiveContentHash(manifest) {
  const { archive, content_sha256, ...content } = manifest;
  return sha256(jsonBytes(content));
}
export function mw3ArchivePaths(spot) {
  return { candidate: `${MW3_ARTIFACT_PREFIX}${spot.slug}-policy.json`, laterCandidate: `${MW3_ARTIFACT_PREFIX}${spot.slug}-later-policy.json`,
    ...Object.fromEntries(MW3_REPORT_NAMES.map(name => [name, `${spot.gate_directory}/${name}.json`])) };
}
export function assertMw3ArchiveManifest(manifest) {
  if (manifest?.schema_version !== 1 || manifest.kind !== 'mw3-artifact-snapshot' || manifest.approval !== 'unapproved' || !/^[a-f0-9]{40}$/.test(manifest.source_tree)) fail('Invalid unapproved Mw3 manifest');
  const spot = manifest.spot;
  if (!spot || !/^[A-Za-z0-9_]{1,100}$/.test(spot.id) || !/^[a-z0-9-]{1,160}$/.test(spot.slug) ||
      !Number.isSafeInteger(spot.author_version) || spot.author_version < 1 || spot.author_model !== 'gpt-6-astra' ||
      !['source_hash', 'implementation_hash', 'verification_hash', 'recipe_sha256', 'flop_policy_hash', 'later_policy_hash'].every(key => validHash(spot[key]))) fail('Invalid Mw3 spot identity');
  const suffix = `v${spot.author_version}-${spot.source_hash.slice(0, 12)}-${spot.implementation_hash.slice(0, 12)}-${spot.verification_hash.slice(0, 12)}`;
  const directories = [`${MW3_ARTIFACT_PREFIX}gates/${spot.slug}/${suffix}-${spot.recipe_sha256.slice(0, 12)}`];
  if (spot.id === 'CO_open_BTN_call_BB_call' && spot.author_version === 4) directories.push(`${MW3_ARTIFACT_PREFIX}pilot-gate/${suffix}`);
  if (!directories.includes(spot.gate_directory)) fail('Mw3 evidence directory does not match its pinned identity');
  for (const key of ['sources', 'inputs']) {
    const records = manifest[key];
    // These are hash-only provenance records, not payloads extracted/restored.
    // Shared preflop delivery inputs can exceed the per-policy payload limit.
    assertRecords(records, key);
    if (!records.length || records.length > 256 || records.some(row => !SOURCE_PATH.test(row.path) || row.path.includes('/.')) || manifest[`${key}_sha256`] !== sha256(jsonBytes(records))) fail('Invalid Mw3 source/input inventory');
  }
  const sourcePaths = new Set(manifest.sources.map(row => row.path));
  if (manifest.inputs.some(row => sourcePaths.has(row.path))) fail('Duplicate source/input path');
  assertRecords(manifest.artifacts, 'Mw3 artifact', MW3_ARCHIVE_LIMITS.file);
  const expected = mw3ArchivePaths(spot), entries = Object.entries(expected);
  if (manifest.artifacts.length !== entries.length || manifest.artifacts.reduce((sum, row) => sum + row.bytes, 0) > MW3_ARCHIVE_LIMITS.total ||
      !same(sorted(manifest.artifacts.map(row => row.path)), sorted(Object.values(expected))) ||
      manifest.artifacts.some(row => row.spot !== spot.id || expected[row.kind] !== row.path || row.entry !== `objects/${row.sha256}`)) fail('Incomplete or disallowed Mw3 artifact inventory');
  const archive = manifest.archive;
  if (!archive || archive.path !== `artifacts/postflop/mw3-${spot.slug}.tar.gz` || archive.format !== 'ustar+gzip-content-addressed-v1' ||
      !validHash(archive.sha256) || !Number.isSafeInteger(archive.bytes) || archive.bytes < 1 || archive.bytes > MW3_ARCHIVE_LIMITS.compressed) fail('Invalid Mw3 archive identity');
  if (manifest.content_sha256 !== mw3ArchiveContentHash(manifest) || jsonBytes(manifest).length > MW3_ARCHIVE_LIMITS.manifest) fail('Mw3 manifest content identity mismatch');
  return manifest;
}
function headerFor(name, size) {
  const header = Buffer.alloc(512);
  const text = (start, length, value) => header.write(value, start, length, 'ascii');
  const octal = (start, length, value) => text(start, length, value.toString(8).padStart(length - 1, '0') + '\0');
  text(0, 100, name); octal(100, 8, 0o644); octal(108, 8, 0); octal(116, 8, 0); octal(124, 12, size); octal(136, 12, 0);
  header.fill(32, 148, 156); header[156] = 48; text(257, 6, 'ustar\0'); text(263, 2, '00'); octal(329, 8, 0); octal(337, 8, 0);
  text(148, 8, `${[...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0')}\0 `);
  return header;
}
export function encodeMw3Archive(artifacts, bodies) {
  if (!Array.isArray(artifacts) || artifacts.length !== 7 || artifacts.reduce((sum, row) => sum + row.bytes, 0) > MW3_ARCHIVE_LIMITS.total) fail('Mw3 single-spot archive exceeds limit');
  const compressed = encodeArchive(artifacts, bodies);
  if (compressed.length > MW3_ARCHIVE_LIMITS.compressed) fail('Compressed Mw3 archive exceeds limit');
  return compressed;
}
export function decodeMw3Archive(compressed, manifest) {
  assertMw3ArchiveManifest(manifest);
  if (!Buffer.isBuffer(compressed) || compressed.length > MW3_ARCHIVE_LIMITS.compressed || compressed.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1')) fail('Mw3 Git LFS payload is missing; a pointer is not delivery');
  if (compressed.length !== manifest.archive.bytes || sha256(compressed) !== manifest.archive.sha256) fail('Mw3 archive bytes/hash mismatch');
  const expected = new Map();
  for (const item of manifest.artifacts) {
    if (expected.has(item.entry) && expected.get(item.entry).bytes !== item.bytes) fail('Conflicting content-addressed object');
    expected.set(item.entry, item);
  }
  const expandedLimit = [...expected.values()].reduce((sum, row) => sum + 512 + Math.ceil(row.bytes / 512) * 512, 0) + 1024;
  let tar;
  try {
    // A single fixed-header gzip member only. gunzipSync accepts concatenated
    // empty members, so inspect the raw DEFLATE consumption and its one trailer.
    if (compressed.length < 18 || !compressed.subarray(0, 9).equals(Buffer.from([31,139,8,0,0,0,0,0,2]))) fail('Noncanonical Mw3 gzip header');
    const decoded = inflateRawSync(compressed.subarray(10), { maxOutputLength: expandedLimit, info: true });
    const used = decoded.engine.bytesWritten;
    if (!Number.isSafeInteger(used) || used < 1 || used !== compressed.length - 18) fail('Mw3 gzip has trailing bytes or extra members');
    tar = decoded.buffer;
    if (compressed.readUInt32LE(10 + used) !== crc32(tar) || compressed.readUInt32LE(14 + used) !== tar.length) fail('Mw3 gzip CRC/size mismatch');
  } catch { fail('Invalid/truncated/oversized/trailing Mw3 gzip archive'); }
  const objects = new Map(); let offset = 0, previous = '';
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const nul = header.subarray(0, 100).indexOf(0), name = header.subarray(0, nul < 0 ? 100 : nul).toString('ascii'), item = expected.get(name);
    if (!item || objects.has(name) || name <= previous) fail('Unexpected, duplicate or unsorted Mw3 archive entry');
    if (!header.equals(headerFor(name, item.bytes))) fail('Noncanonical or nonregular Mw3 USTAR header');
    const start = offset + 512, end = start + item.bytes, padded = start + Math.ceil(item.bytes / 512) * 512;
    if (padded > tar.length || sha256(tar.subarray(start, end)) !== item.sha256 || !tar.subarray(end, padded).every(byte => byte === 0)) fail('Truncated or changed Mw3 archive object');
    objects.set(name, tar.subarray(start, end)); previous = name; offset = padded;
  }
  if (objects.size !== expected.size || tar.length !== offset + 1024 || !tar.subarray(offset).every(byte => byte === 0)) fail('Incomplete Mw3 archive or trailing bytes');
  return new Map(manifest.artifacts.map(item => [item.path, objects.get(item.entry)]));
}
export function restoreMw3ArchiveBytes(root, manifest, files) {
  assertMw3ArchiveManifest(manifest);
  if (!(files instanceof Map) || files.size !== manifest.artifacts.length) fail('Mw3 restore file set differs');
  for (const item of manifest.artifacts) {
    const body = files.get(item.path);
    if (!Buffer.isBuffer(body) || body.length !== item.bytes || sha256(body) !== item.sha256) fail('Mw3 restore bytes differ');
    assertSafeFile(root, item.path, { missing: true });
    if (existsSync(join(root, item.path)) && !readFileSync(join(root, item.path)).equals(body)) fail('Existing Mw3 artifact differs and is preserved');
  }
  for (const [path, body] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); assertSafeFile(root, path, { missing: true });
    if (existsSync(join(root, path))) {
      if (!readFileSync(join(root, path)).equals(body)) fail('Mw3 artifact changed during restoration');
    } else writeFileSync(join(root, path), body, { flag: 'wx', mode: 0o644 });
  }
  return { files: files.size, bytes: manifest.artifacts.reduce((sum, row) => sum + row.bytes, 0) };
}
