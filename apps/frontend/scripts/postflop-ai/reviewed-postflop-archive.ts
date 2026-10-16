// Byte-only archive primitives. These functions never author a policy or approve a review.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

export const ARTIFACT_PREFIX = 'apps/frontend/.local/postflop-ai/';
export const LIMITS = Object.freeze({ file: 16 * 1024 * 1024, total: 256 * 1024 * 1024, compressed: 64 * 1024 * 1024, files: 4096, manifest: 8 * 1024 * 1024 });
export const compare = (a?: any, b?: any) : any => a < b ? -1 : a > b ? 1 : 0;
export const sha256 = (value: any) : any => createHash('sha256').update(value).digest('hex');
export const jsonBytes = (value: any) : any => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const validHash = (value: any) : any => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (message: any) : any => { throw new Error(message); };
export function safeRelativePath(path?: any) : any {
  return typeof path === 'string' && path.length > 0 && path.length <= 512 && /^[A-Za-z0-9_./-]+$/.test(path) &&
    !path.startsWith('/') && path.split('/').every((part: any) : any => part && part !== '.' && part !== '..');
}
export function assertSafeFile(root?: any, path?: any, { missing = false }: any = {}) : any {
  if (!safeRelativePath(path)) fail(`Unsafe repository path: ${path}`);
  root = resolve(root);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) fail('Repository root must be a real directory');
  const parts = path.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let stat: any;
    try { stat = lstatSync(current); } catch (error: any) {
      if (error.code === 'ENOENT' && missing) return;
      throw error;
    }
    if (stat.isSymbolicLink()) fail(`Refuse symlink: ${path}`);
    if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) fail(`Not a regular file path: ${path}`);
  }
}
export function readSafeFile(root?: any, path?: any, limit: any = LIMITS.file) : any {
  assertSafeFile(root, path);
  const size = lstatSync(join(root, path)).size;
  if (size > limit) fail(`File exceeds byte limit: ${path}`);
  const body = readFileSync(join(root, path));
  if (body.length !== size || body.length > limit) fail(`File changed while reading: ${path}`);
  return body;
}
export function fileRecord(root?: any, path?: any) : any {
  const body = readSafeFile(root, path, LIMITS.total);
  return { path, bytes: body.length, sha256: sha256(body) };
}
export function assertRecords(records?: any, label?: any, limit: any = LIMITS.total) : void {
  if (!Array.isArray(records) || records.length > LIMITS.files) fail(`Invalid ${label} records`);
  let previous = '', total = 0;
  for (const item of records) {
    if (!safeRelativePath(item.path) || item.path <= previous || !Number.isSafeInteger(item.bytes) || item.bytes < 1 ||
        item.bytes > limit || !validHash(item.sha256)) fail(`Invalid, duplicate or unsorted ${label} record`);
    previous = item.path; total += item.bytes;
  }
  if (total > LIMITS.total) fail(`${label} exceeds total byte limit`);
}
const suffix: any = { candidate: '-policy.json', laterCandidate: '-later-policy.json', report: '-report.json' };
export function artifactPath(spot?: any, kind?: any) : any {
  if (!suffix[kind]) fail(`Unknown policy artifact kind: ${kind}`);
  return `${ARTIFACT_PREFIX}${spot.slug}${suffix[kind]}`;
}
export function allowedEvidencePath(path?: any) : any {
  return /^apps\/frontend\/\.local\/postflop-ai\/(?:representative-audit-evidence\.json|audit-evidence\/[A-Za-z0-9_-]+\.json|all-boards-audit\/[A-Za-z0-9_]+(?:--[a-f0-9]{64})?(?:\.checkpoints)?\.json)$/.test(path);
}
export function contentIdentity(manifest?: any) : any {
  const { archive, content_sha256, ...content } = manifest;
  return sha256(jsonBytes(content));
}
export function assertManifest(manifest?: any) : any {
  if (manifest?.schema_version !== 1 || manifest.kind !== 'postflop-artifact-snapshot' || manifest.approval !== 'unapproved' ||
      !Array.isArray(manifest.spots) || !manifest.spots.length || manifest.spots.length > LIMITS.files) fail('Invalid unapproved postflop manifest');
  assertRecords(manifest.sources, 'source'); assertRecords(manifest.inputs, 'input');
  if (!manifest.sources.length || !manifest.inputs.length ||
      manifest.sources_sha256 !== sha256(jsonBytes(manifest.sources)) || manifest.inputs_sha256 !== sha256(jsonBytes(manifest.inputs))) fail('Source/input identity mismatch');
  assertRecords(manifest.artifacts, 'artifact', LIMITS.file);
  if (!manifest.artifacts.length) fail('Empty postflop archive');
  const allowed = new Map(), spots = new Map();
  let previous = '';
  for (const spot of manifest.spots) {
    if (!/^[A-Za-z0-9_]+$/.test(spot.id) || spot.id <= previous || !/^[a-z0-9-]{1,160}$/.test(spot.slug) ||
        !['new-candidate', 'preserved-legacy'].includes(spot.classification) ||
        typeof spot.identity !== 'object' || !spot.identity || !Array.isArray(spot.evidence)) fail('Invalid or duplicate manifest spot');
    previous = spot.id; spots.set(spot.id, spot);
    for (const kind of Object.keys(suffix)) {
      const path = artifactPath(spot, kind);
      if (allowed.has(path)) fail('Duplicate artifact destination');
      allowed.set(path, { spot: spot.id, kind });
    }
    const seen = new Set();
    for (const path of spot.evidence) {
      if (!allowedEvidencePath(path) || seen.has(path) || allowed.has(path)) fail('Invalid or duplicate evidence destination');
      seen.add(path); allowed.set(path, { spot: spot.id, kind: 'auditEvidence' });
    }
  }
  for (const item of manifest.artifacts) {
    const expected = allowed.get(item.path);
    if (!expected || item.spot !== expected.spot || item.kind !== expected.kind || item.entry !== `objects/${item.sha256}`) fail(`Disallowed artifact destination: ${item.path}`);
  }
  for (const spot of spots.values()) {
    const items = manifest.artifacts.filter((item: any) : any => item.spot === spot.id);
    if (!items.length || spot.evidence.some((path: any) : any => !items.some((item: any) : any => item.path === path))) fail('Incomplete spot artifact set');
    if (spot.classification === 'new-candidate' && !['candidate', 'laterCandidate'].every((kind: any) : any => items.some((item: any) : any => item.kind === kind))) fail('New candidate must include its own flop and later policy');
  }
  const coverage = manifest.coverage;
  const expected = coverage?.expected_new_spot_ids;
  if (coverage?.scope !== 'candidate-preservation' || !Array.isArray(expected) || expected.length > LIMITS.files ||
      expected.some((id?: any, i?: any) : any => !/^[A-Za-z0-9_]+$/.test(id) || i > 0 && id <= expected[i - 1]) ||
      coverage.catalog_sha256 !== sha256(jsonBytes(expected))) fail('Invalid explicit new-spot catalog coverage');
  const included = manifest.spots.filter((spot: any) : any => spot.classification === 'new-candidate').map((spot: any) : any => spot.id);
  if (!isDeepStrictEqual(included, coverage.included_new_spot_ids) || included.some((id: any) : any => !expected.includes(id)) ||
      !Array.isArray(coverage.unavailable_new_spots) ||
      !isDeepStrictEqual(coverage.unavailable_new_spots.map((row: any) : any => row.spot), expected.filter((id: any) : any => !included.includes(id))) ||
      coverage.unavailable_new_spots.some((row: any) : any => typeof row.reason !== 'string' || !row.reason.trim())) fail('Incomplete explicit unavailable new-spot coverage');
  const archive = manifest.archive;
  if (!archive || !/^artifacts\/postflop\/[a-z0-9-]+\.tar\.gz$/.test(archive.path) || archive.format !== 'ustar+gzip-content-addressed-v1' ||
      !validHash(archive.sha256) || !Number.isSafeInteger(archive.bytes) || archive.bytes < 1 || archive.bytes > LIMITS.compressed) fail('Invalid archive identity');
  if (manifest.content_sha256 !== contentIdentity(manifest)) fail('Postflop manifest content identity mismatch');
  return manifest;
}
function headerFor(name?: any, size?: any) : any {
  const header = Buffer.alloc(512);
  if (Buffer.byteLength(name) > 100) fail('Archive object name exceeds USTAR limit');
  const text = (start?: any, length?: any, value?: any) : any => header.write(value, start, length, 'ascii');
  const octal = (start?: any, length?: any, value?: any) : any => text(start, length, value.toString(8).padStart(length - 1, '0') + '\0');
  text(0, 100, name); octal(100, 8, 0o644); octal(108, 8, 0); octal(116, 8, 0); octal(124, 12, size); octal(136, 12, 0);
  header.fill(32, 148, 156); header[156] = 48; text(257, 6, 'ustar\0'); text(263, 2, '00');
  octal(329, 8, 0); octal(337, 8, 0);
  const sum = [...header].reduce((a?: any, b?: any) : any => a + b, 0);
  text(148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  return header;
}
export function encodeArchive(artifacts?: any, bodies?: any) : any {
  assertRecords(artifacts, 'artifact', LIMITS.file);
  const objects = new Map();
  for (const artifact of artifacts) {
    const body = bodies.get(artifact.path);
    if (!Buffer.isBuffer(body) || body.length !== artifact.bytes || sha256(body) !== artifact.sha256 || artifact.entry !== `objects/${artifact.sha256}`) fail('Artifact bytes differ before packaging');
    objects.set(artifact.entry, body);
  }
  const blocks: any[] = [];
  for (const [name, body] of [...objects].sort(([a]: any, [b]: any) : any => compare(a, b))) {
    blocks.push(headerFor(name, body.length), body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  const compressed = gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 } as Parameters<typeof gzipSync>[1]);
  if (compressed.length > LIMITS.compressed) fail('Compressed archive exceeds byte limit');
  return compressed;
}
export function decodeArchive(compressed?: any, manifest?: any) : any {
  assertManifest(manifest);
  if (!Buffer.isBuffer(compressed) || compressed.length > LIMITS.compressed || compressed.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1')) fail('Git LFS payload is missing: materialize the archive, not its pointer');
  if (compressed.length !== manifest.archive.bytes || sha256(compressed) !== manifest.archive.sha256) fail('Archive bytes/hash mismatch');
  const expected = new Map();
  for (const item of manifest.artifacts) {
    const previous = expected.get(item.entry);
    if (previous && previous.bytes !== item.bytes) fail('Conflicting content-addressed objects');
    expected.set(item.entry, item);
  }
  const expandedLimit = [...expected.values()].reduce((n?: any, item?: any) : any => n + 512 + Math.ceil(item.bytes / 512) * 512, 0) + 1024;
  let tar: any;
  try { tar = gunzipSync(compressed, { maxOutputLength: expandedLimit }); } catch (error: any) { fail(`Invalid/truncated/oversized gzip archive: ${error.message}`); }
  const objects = new Map();
  let offset = 0, previous = '';
  while (offset + 512 <= tar.length) {
    const header: any = (tar as any).subarray(offset, offset + 512);
    if (header.every((byte: any) : any => byte === 0)) break;
    const nul = header.subarray(0, 100).indexOf(0);
    const name = header.subarray(0, nul < 0 ? 100 : nul).toString('ascii');
    const item = expected.get(name);
    if (!item || objects.has(name) || name <= previous) fail(`Unexpected, duplicate or unsorted archive entry: ${name}`);
    // Exact canonical headers reject traversal, symlinks, hard links, devices,
    // PAX/GNU extensions, prefixes, checksums, octal overflow and nonfixed metadata.
    if (!header.equals(headerFor(name, item.bytes))) fail(`Noncanonical or nonregular USTAR header: ${name}`);
    const start = offset + 512, end = start + item.bytes, padded = start + Math.ceil(item.bytes / 512) * 512;
    if (padded > tar.length || sha256((tar as any).subarray(start, end)) !== item.sha256 || !(tar as any).subarray(end, padded).every((byte: any) : any => byte === 0)) fail(`Truncated or changed archive object: ${name}`);
    objects.set(name, (tar as any).subarray(start, end)); previous = name; offset = padded;
  }
  if (objects.size !== expected.size || tar.length !== offset + 1024 || !(tar as any).subarray(offset).every((byte: any) : any => byte === 0)) fail('Truncated/incomplete archive or unexpected trailing bytes');
  return new Map(manifest.artifacts.map((item: any) : any => [item.path, objects.get(item.entry)]));
}
export function restoreBytes(root?: any, manifest?: any, files?: any) : any {
  assertManifest(manifest);
  if (!(files instanceof Map) || files.size !== manifest.artifacts.length) fail('Restore file set differs');
  // Preflight the entire set before making even the first directory or file.
  for (const item of manifest.artifacts) {
    const body = files.get(item.path);
    if (!Buffer.isBuffer(body) || body.length !== item.bytes || sha256(body) !== item.sha256) fail('Restore bytes differ');
    assertSafeFile(root, item.path, { missing: true });
    if (existsSync(join(root, item.path)) && !readFileSync(join(root, item.path)).equals(body)) fail(`Existing local artifact differs: ${item.path}`);
  }
  for (const [path, body] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    // Recheck parent links before each write; never truncate an existing file.
    assertSafeFile(root, path, { missing: true });
    if (existsSync(join(root, path))) {
      if (!readFileSync(join(root, path)).equals(body)) fail(`Existing artifact changed during restoration: ${path}`);
    } else writeFileSync(join(root, path), body, { flag: 'wx', mode: 0o644 });
  }
  return { files: files.size, bytes: manifest.artifacts.reduce((n?: any, item?: any) : any => n + item.bytes, 0) };
}
