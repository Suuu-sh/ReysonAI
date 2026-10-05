// Collection-wide read-only first pass; existing bounded v1 restore second pass.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { jsonBytes, readSafeFile, sha256 } from './reviewed-postflop-archive.mjs';
import { assertCollectionReceipt, COLLECTION_LIMITS, readIndex, recheckCollection, recheckIndex, requireDisk, runShard, verifyChildren } from './reviewed-postflop-index.mjs';
export function restoreCollection({ indexPath, reviewPath }) {
  if (!reviewPath) throw new Error('Separate independent collection review required');
  const collection = readIndex({ indexPath });
  const reviewBytes = readSafeFile(collection.root, reviewPath, COLLECTION_LIMITS.manifest);
  // EVERY destination, including the last shard, is inspected before any write.
  const expected = verifyChildren(collection, 'preflight');
  assertCollectionReceipt(JSON.parse(reviewBytes), collection, expected);
  requireDisk(collection.root, collection.index.aggregate_artifact_bytes);
  recheckCollection(collection);
  const results = [];
  for (const shard of collection.index.shards) {
    if (!readSafeFile(collection.root, reviewPath, COLLECTION_LIMITS.manifest).equals(reviewBytes)) throw new Error('Collection receipt changed during restoration');
    recheckIndex(collection);
    const result = runShard(collection, shard, 'restore');
    results.push({ shard: shard.id, files: result.artifacts.length, max_rss_kib: result.max_rss_kib });
  }
  recheckCollection(collection);
  return { status: 'restored-independently-reviewed-collection-bytes', index_sha256: collection.index_sha256,
    review_sha256: sha256(reviewBytes), row_value_ledger_sha256: sha256(jsonBytes(expected.rows)), shards: results,
    filesystem_atomicity: 'Complete ordinary preflight; disk faults and hostile concurrent mutation are not a filesystem transaction.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2), options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = { '--index': 'indexPath', '--review': 'reviewPath' }[argv[i]];
    if (!key || options[key] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Required: --index PATH --review PATH');
    options[key] = argv[++i];
  }
  console.log(JSON.stringify(restoreCollection(options)));
}
