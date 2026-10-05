// Explicit already-reviewed children only. This builder never writes a receipt.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPOSITORY } from './reviewed-postflop.mjs';
import { assertManifest, assertSafeFile, compare, fileRecord, jsonBytes, readSafeFile, sha256 } from './reviewed-postflop-archive.mjs';
import { assertIndex, COLLECTION_LIMITS, currentCatalog, deliverySources, indexIdentity, readIndex, verifyChildren } from './reviewed-postflop-index.mjs';
import { prepareDelivery } from './reviewed-postflop-delivery.mjs';

export function packageIndex({ shards, deferrals, publication, out, deliveryOut = null }) {
  if (!/^apps\/frontend\/\.local\/[A-Za-z0-9_/-]+\.index\.json$/.test(out ?? '')) throw new Error('Builder writes only explicit ignored .local collection metadata');
  if (!Array.isArray(shards) || !shards.length || shards.length > COLLECTION_LIMITS.shards) throw new Error('Explicit bounded child descriptors required');
  let baseline;
  const children = shards.map(child => {
    const manifest = JSON.parse(readSafeFile(REPOSITORY, child.manifest, COLLECTION_LIMITS.manifest));
    assertManifest(manifest);
    const receipt = JSON.parse(readSafeFile(REPOSITORY, child.receipt, COLLECTION_LIMITS.manifest));
    const compressed = readSafeFile(REPOSITORY, manifest.archive.path, COLLECTION_LIMITS.compressed);
    baseline ??= Object.fromEntries(['sources', 'inputs', 'sources_sha256', 'inputs_sha256'].map(key => [key, manifest[key]]));
    return { id: child.id, manifest: fileRecord(REPOSITORY, child.manifest), archive: { path: manifest.archive.path, bytes: compressed.length, sha256: sha256(compressed) },
      receipt: fileRecord(REPOSITORY, child.receipt), content_sha256: manifest.content_sha256,
      accepted_new_spot_ids: receipt.accepted_new_spots?.map(row => row.spot).sort(compare),
      expanded_bytes: manifest.artifacts.reduce((n, record) => n + record.bytes, 0), artifact_records: manifest.artifacts.length };
  }).sort((a, b) => compare(a.id, b.id));
  const sources = deliverySources(), accepted = children.flatMap(child => child.accepted_new_spot_ids).sort(compare);
  const index = { schema_version: 1, kind: 'postflop-reviewed-shard-index', approval: 'unapproved', catalog: currentCatalog(), baseline,
    delivery_sources: sources, delivery_sources_sha256: sha256(jsonBytes(sources)), shards: children,
    accepted_new_spot_ids: accepted, coverage: { scope: accepted.length === 407 ? 'complete-catalog' : 'reviewed-subset', deferred_new_spots: deferrals },
    publication, aggregate_artifact_bytes: children.reduce((n, child) => n + child.expanded_bytes, 0),
    aggregate_artifact_records: children.reduce((n, child) => n + child.artifact_records, 0) };
  index.content_sha256 = indexIdentity(index); assertIndex(index, { catalog: currentCatalog(), sources });
  const bytes = jsonBytes(index);
  if (bytes.length > COLLECTION_LIMITS.index) throw new Error('Collection index exceeds 4 MiB');
  const target = join(REPOSITORY, out);
  assertSafeFile(REPOSITORY, out, { missing: true });
  if (existsSync(target)) throw new Error('Refuse overwriting collection metadata');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  // Metadata remains explicitly unapproved even after children pass unchanged gates.
  try {
    const collection = readIndex({ indexPath: out }), verified = verifyChildren(collection);
    const delivery = deliveryOut ? prepareDelivery({ indexPath: out, out: deliveryOut, candidate: true }) : null;
    return { status: 'unapproved-collection-candidate', index: { path: out, bytes: bytes.length, sha256: sha256(bytes) },
      accepted_child_spots: accepted.length, row_value_ledger_sha256: verified.row_value_ledger_sha256, delivery };
  } catch (error) { rmSync(target); throw error; }
}
export function parsePackageArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!['--shards', '--deferrals', '--publication', '--out', '--delivery-out'].includes(arg) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Required: --shards JSON --deferrals JSON --publication JSON --out LOCAL.index.json [--delivery-out LOCAL]');
    const key = arg === '--delivery-out' ? 'deliveryOut' : arg.slice(2);
    if (Object.hasOwn(options, key)) throw new Error('Duplicate argument');
    options[key] = argv[++i];
  }
  for (const key of ['shards', 'deferrals', 'publication']) {
    if (!options[key]) throw new Error(`Missing --${key}`);
    options[key] = JSON.parse(readSafeFile(REPOSITORY, options[key], COLLECTION_LIMITS.index));
  }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(packageIndex(parsePackageArguments(process.argv.slice(2)))));
