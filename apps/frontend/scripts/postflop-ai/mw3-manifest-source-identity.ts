// Source-only compatibility for immutable pre-TypeScript MW3 archive manifests.
// This adapter is used only by saved-archive verification/preservation, never
// by authoring a candidate or assigning a new numerical identity.
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import proposal from '../../../../configs/source-identity-mw3-typescript-archive.json' with { type: 'json' };

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIRECTORY, '../../../..');
const INVENTORY = 'configs/source-identity-mw3-typescript-archive.json';
const REVIEW = 'configs/source-identity-mw3-typescript-archive.review.json';
const EVIDENCE = 'apps/frontend/docs/mw3-source-identity/typescript-archive-sources-parity.json';
const ADAPTER = 'apps/frontend/scripts/postflop-ai/mw3-manifest-source-identity.ts';
const EXTRA_CURRENT_PATHS = Object.freeze([ADAPTER, INVENTORY, REVIEW, EVIDENCE,
  'apps/frontend/docs/mw3-source-identity/typescript-executable-parity.json',
  'apps/frontend/scripts/postflop-ai/flop-isomorphism.d.mts',
  'apps/frontend/scripts/postflop-ai/later-policy.d.mts',
  'apps/frontend/scripts/postflop-ai/mw3-typescript-source-identity-pairs.json',
  'apps/frontend/scripts/postflop-ai/policy.d.mts',
  'configs/source-identity-typescript.review.json'].sort());
const BASELINE = 'df2370690e9b3172f2c109f80113b320880f940a';
const SHA = /^[a-f0-9]{64}$/;
const fail = (message: string): never => { throw new Error(`Unapproved or changed MW3 archive source identity: ${message}`); };
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const exactKeys = (value: any, keys: string[], label: string) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(label);
};
const safePath = (path: unknown): path is string => typeof path === 'string' && !!path && !path.startsWith('/') && !path.includes('\\')
  && path.split('/').every(part => !!part && part !== '.' && part !== '..');

function readBound(path: string, limit = 2 * 1024 * 1024): Buffer {
  if (!safePath(path)) fail('unsafe path');
  let parent = ROOT;
  for (const part of path.split('/')) { parent = join(parent, part); if (lstatSync(parent).isSymbolicLink()) fail('symlink'); }
  const fd = openSync(join(ROOT, path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before: any = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(limit)) fail('bounded regular file');
    const body = Buffer.alloc(Number(before.size) + 1); let at = 0;
    while (at < body.length) { const count = readSync(fd, body, at, body.length - at, null); if (!count) break; at += count; }
    const after: any = fstatSync(fd, { bigint: true }), named: any = lstatSync(join(ROOT, path), { bigint: true });
    if (at !== Number(before.size) || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key] || after[key] !== named[key])) fail('file changed while read');
    return body.subarray(0, at);
  } finally { closeSync(fd); }
}

function approvedArchiveSources(): any {
  const inventoryBytes = readBound(INVENTORY), adapterBytes = readBound(ADAPTER), reviewBytes = readBound(REVIEW), evidenceBytes = readBound(EVIDENCE);
  let inventory: any, review: any, evidence: any;
  try { inventory = JSON.parse(inventoryBytes.toString('utf8')); review = JSON.parse(reviewBytes.toString('utf8')); evidence = JSON.parse(evidenceBytes.toString('utf8')); }
  catch { fail('malformed JSON'); }
  if (!same(inventory, proposal)) fail('imported inventory differs from current bytes');
  exactKeys(inventory, ['schema_version', 'kind', 'status', 'rows', 'archived_recipe_sources', 'accepted_manifests', 'extra_current_sources'], 'inventory shape');
  if (inventory.schema_version !== 1 || inventory.kind !== 'mw3-typescript-archive-source-inventory' || inventory.status !== 'source-only-proposal'
      || !Array.isArray(inventory.rows) || inventory.rows.length !== 152 || !Array.isArray(inventory.archived_recipe_sources)
      || !Array.isArray(inventory.accepted_manifests) || inventory.accepted_manifests.length !== 16
      || !Array.isArray(inventory.extra_current_sources)) fail('inventory scope');
  exactKeys(review, ['schema_version', 'kind', 'status', 'scope', 'baseline_commit', 'source_head_sha', 'reviewer', 'requested_model', 'runtime_model_attestation',
    'inventory_sha256', 'adapter_sha256', 'evidence_sha256', 'source_count', 'extra_current_paths'], 'review shape');
  if (review.schema_version !== 1 || review.kind !== 'mw3-typescript-archive-source-compatibility-review' || review.status !== 'approved'
      || review.scope !== 'source-only-no-strategy-or-runtime-renewal' || review.baseline_commit !== BASELINE
      || !/^[a-f0-9]{40}$/.test(review.source_head_sha) || typeof review.reviewer !== 'string' || !review.reviewer.trim()
      || review.requested_model !== 'gpt-6.1-sol' || typeof review.runtime_model_attestation !== 'string' || !review.runtime_model_attestation.trim()
      || review.inventory_sha256 !== digest(inventoryBytes) || review.adapter_sha256 !== digest(adapterBytes)
      || review.evidence_sha256 !== digest(evidenceBytes) || review.source_count !== 152 || !same(review.extra_current_paths, EXTRA_CURRENT_PATHS)) fail('independent review binding');
  if (typeof evidence !== 'object' || Array.isArray(evidence) || evidence.kind !== 'mw3-typescript-archive-source-parity' || evidence.status !== 'independently-reviewed') fail('parity evidence shape');
  if (!Array.isArray(inventory.rows) || !Array.isArray(evidence.rows) || evidence.rows.length !== inventory.rows.length) fail('closed evidence rows');
  const byHistorical = new Map<string, any>(), byCurrent = new Map<string, any>();
  for (const [index, row] of inventory.rows.entries()) {
    exactKeys(row, ['historical', 'current', 'classification'], 'source pair shape');
    exactKeys(row.historical, ['path', 'bytes', 'sha256'], 'historical source shape');
    exactKeys(row.current, ['path', 'bytes', 'sha256'], 'current source shape');
    if (!safePath(row.historical.path) || !safePath(row.current.path) || !SHA.test(row.historical.sha256) || !SHA.test(row.current.sha256)
        || !Number.isSafeInteger(row.historical.bytes) || row.historical.bytes < 1 || !Number.isSafeInteger(row.current.bytes) || row.current.bytes < 1
        || byHistorical.has(row.historical.path) || byCurrent.has(row.current.path)) fail('unique source pair');
    const relocated = row.historical.path.replace(/\.(?:mjs|js)$/, '.ts');
    if (row.current.path !== row.historical.path && (row.current.path !== relocated || !/\.(?:mjs|js)$/.test(row.historical.path))) fail('unapproved path relocation');
    const expectedClassification = row.current.path !== row.historical.path ? 'typescript-source-parity'
      : row.current.bytes === row.historical.bytes && row.current.sha256 === row.historical.sha256 ? 'exact-byte-identity' : 'same-path-source-parity';
    if (row.classification !== expectedClassification) fail('pair classification');
    const { current, historical, classification } = row;
    if (!same(evidence.rows[index], { historical, current, classification })) fail('evidence pair differs');
    if (index > 0 && inventory.rows[index - 1].historical.path >= historical.path) fail('source pairs are not canonically sorted');
    const currentBytes = readBound(current.path);
    if (currentBytes.length !== current.bytes || digest(currentBytes) !== current.sha256) fail(`current source drift: ${current.path}`);
    byHistorical.set(historical.path, row); byCurrent.set(current.path, row);
  }
  const recipePaths = ['apps/frontend/scripts/data/mw3-authored/context-judgments.mjs', 'apps/frontend/scripts/data/mw3-authored/emit.mjs',
    'apps/frontend/scripts/data/mw3-authored/registry.mjs', 'apps/frontend/scripts/data/mw3-co-btn-bb-authored.mjs'];
  if (!same(inventory.archived_recipe_sources.map((row: any) => row.path), recipePaths)) fail('archived recipe source scope');
  const archiveRecipeSources = new Map<string, string>();
  for (const row of inventory.archived_recipe_sources) {
    exactKeys(row, ['path', 'bytes', 'sha256', 'source'], 'archived recipe source shape');
    const pinned = byHistorical.get(row.path), bytes = Buffer.from(row.source, 'utf8');
    if (!pinned || !SHA.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || typeof row.source !== 'string'
        || bytes.length !== row.bytes || digest(bytes) !== row.sha256 || row.bytes !== pinned.historical.bytes || row.sha256 !== pinned.historical.sha256) fail('archived recipe source bytes');
    archiveRecipeSources.set(row.path, row.source);
  }
  const extras = inventory.extra_current_sources;
  const expectedPinnedExtras = EXTRA_CURRENT_PATHS.filter(path => ![ADAPTER, INVENTORY, REVIEW, EVIDENCE].includes(path));
  if (extras.length !== expectedPinnedExtras.length || !same(extras.map((row: any) => row.path), expectedPinnedExtras)) fail('extra current source scope');
  for (const row of extras) {
    exactKeys(row, ['path', 'bytes', 'sha256'], 'extra current source pin');
    if (!SHA.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 1) fail('extra current source pin shape');
    const bytes = readBound(row.path);
    if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) fail(`extra current source drift: ${row.path}`);
  }
  const acceptedManifests = new Map<string, any>();
  for (const [index, record] of inventory.accepted_manifests.entries()) {
    exactKeys(record, ['spot', 'manifest', 'receipt', 'archive', 'artifacts'], 'accepted manifest shape');
    exactKeys(record.manifest, ['path', 'bytes', 'sha256'], 'accepted manifest pin');
    exactKeys(record.receipt, ['path', 'bytes', 'sha256'], 'accepted receipt pin');
    exactKeys(record.archive, ['path', 'format', 'bytes', 'sha256'], 'accepted archive pin');
    if (typeof record.spot !== 'string' || !/^[A-Za-z0-9_]{1,100}$/.test(record.spot) || acceptedManifests.has(record.spot)
        || !safePath(record.manifest.path) || !safePath(record.receipt.path) || !safePath(record.archive.path)
        || !SHA.test(record.manifest.sha256) || !SHA.test(record.receipt.sha256) || !SHA.test(record.archive.sha256)
        || !Number.isSafeInteger(record.manifest.bytes) || record.manifest.bytes < 1 || !Number.isSafeInteger(record.receipt.bytes) || record.receipt.bytes < 1
        || !Number.isSafeInteger(record.archive.bytes) || record.archive.bytes < 1 || !Array.isArray(record.artifacts) || record.artifacts.length !== 7
        || new Set(record.artifacts.map((row: any) => row.kind)).size !== 7) fail('accepted manifest identity');
    if (index > 0 && inventory.accepted_manifests[index - 1].spot >= record.spot) fail('accepted manifests are not canonically sorted');
    // The selected manifest, receipt and compressed payload are checked at use
    // time; merely loading the closed inventory does not scan unrelated large archives.
    for (const artifact of record.artifacts) {
      exactKeys(artifact, ['path', 'kind', 'spot', 'bytes', 'sha256', 'entry'], 'accepted artifact pin');
      if (!safePath(artifact.path) || !SHA.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.spot !== record.spot) fail('accepted artifact scope');
    }
    acceptedManifests.set(record.spot, record);
  }
  return { byHistorical, byCurrent, archiveRecipeSources, acceptedManifests };
}

// Returns historical source bytes keyed by exact old recipe paths, but only
// after the complete approved source inventory and current bytes are verified.
export function mw3ArchivedRecipeSources(spot: string, manifestBytes: Buffer): Map<string, string> {
  assertMw3AcceptedArchive(spot, manifestBytes);
  return approvedArchiveSources().archiveRecipeSources;
}

// Only one of the exact sixteen reviewed manifest identities can opt into
// archived recipe provenance. The full saved manifest/archive/artifact bytes
// remain pinned in the independent inventory; caller bytes must match exactly.
export function assertMw3AcceptedArchive(spot: string, manifestBytes: Buffer): any {
  const record = approvedArchiveSources().acceptedManifests.get(spot);
  if (!record || !Buffer.isBuffer(manifestBytes) || manifestBytes.length !== record.manifest.bytes || digest(manifestBytes) !== record.manifest.sha256) fail('unknown or changed accepted manifest');
  const receiptBytes = readBound(record.receipt.path);
  if (receiptBytes.length !== record.receipt.bytes || digest(receiptBytes) !== record.receipt.sha256) fail('accepted receipt changed');
  let manifest: any;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { fail('malformed accepted manifest'); }
  const slug = manifest.spot?.slug;
  if (manifest.spot?.id !== record.spot || !/^[a-z0-9-]{1,160}$/.test(slug ?? '')
      || record.manifest.path !== `artifacts/postflop/mw3-${slug}.manifest.json` || record.receipt.path !== `configs/mw3-${slug}.review.json`
      || record.archive.path !== `artifacts/postflop/mw3-${slug}.tar.gz` || !same(manifest.archive, record.archive)
      || !same(manifest.artifacts, record.artifacts)) fail('accepted manifest fields differ');
  return record;
}

export function assertMw3AcceptedArtifactBytes(spot: string, files: Map<string, Buffer>): void {
  const record = approvedArchiveSources().acceptedManifests.get(spot);
  if (!record || !(files instanceof Map) || files.size !== record.artifacts.length) fail('unknown accepted artifact set');
  const expected = new Map(record.artifacts.map((row: any) => [row.path, row]));
  for (const [path, body] of files) {
    const pin: any = expected.get(path);
    if (!pin || !Buffer.isBuffer(body) || body.length !== pin.bytes || digest(body) !== pin.sha256) fail(`accepted artifact changed: ${path}`);
  }
}

// Compare an immutable accepted manifest to current TS paths. The manifest
// records remain unchanged; each must map through the exact reviewed 152-row
// inventory and current dependency graph. No undeclared source is tolerated.
export function verifyMw3ArchivedSourceInventory(currentPaths: string[], manifestSources: any[]): void {
  const identity = approvedArchiveSources(), current = [...currentPaths];
  if (new Set(current).size !== current.length || current.some(path => !safePath(path))) fail('duplicate or unsafe current path');
  const extras = current.filter(path => EXTRA_CURRENT_PATHS.includes(path));
  if (!same(extras.sort(), [...EXTRA_CURRENT_PATHS])) fail('missing approved overlay dependency');
  const graphPaths = current.filter(path => !EXTRA_CURRENT_PATHS.includes(path)).sort();
  if (!Array.isArray(manifestSources) || manifestSources.length !== graphPaths.length) fail('manifest source count differs');
  const mapped: string[] = [];
  for (const row of manifestSources) {
    exactKeys(row, ['path', 'bytes', 'sha256'], 'manifest source record');
    const pair = identity.byHistorical.get(row.path);
    if (!pair || row.bytes !== pair.historical.bytes || row.sha256 !== pair.historical.sha256) fail(`historical source drift: ${row.path}`);
    mapped.push(pair.current.path);
  }
  if (new Set(mapped).size !== mapped.length || !same(mapped.sort(), graphPaths)) fail('historical/current graph inventory differs');
}
