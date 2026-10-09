// Synthetic lifetime/heap regression only. These byte-size fixtures contain no
// real strategy/evidence/receipt and cannot pass the real saved-snapshot gate.
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { getHeapStatistics } from 'node:v8';
import { compactMw3SavedSpot, MW3_SAVED_SPOT_LIMIT } from '../../scripts/postflop-ai/mw3-reviewed-restore.mjs';
import { MW3_ARTIFACT_PREFIX, jsonBytes, mw3ArchiveContentHash, mw3ArchivePaths, sha256 } from '../../scripts/postflop-ai/mw3-reviewed-archive.mjs';
import { clearMw3ContractCache } from '../../scripts/postflop-ai/mw3-artifacts.mjs';
assert.equal(typeof global.gc, 'function', 'Run with --expose-gc');
const heapLimit = getHeapStatistics().heap_size_limit;
assert.ok(heapLimit <= 320 * 1024 * 1024, 'Use the CI 256 MiB old-space heap limit for this regression');
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const RAW_BYTES = 15 * 1024 * 1024, COMPRESSED_BYTES = 8 * 1024 * 1024, PARSED_BYTES = 16 * 1024 * 1024;
function oneSyntheticSpot(index) {
  const slug = `synthetic-memory-${index}`, id = `synthetic_memory_${index}`, spot = { id, slug, author_version: 1, author_model: 'gpt-6-astra',
    source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64), verification_hash: 'c'.repeat(64), recipe_sha256: 'd'.repeat(64),
    flop_policy_hash: 'e'.repeat(64), later_policy_hash: 'f'.repeat(64) };
  spot.gate_directory = `${MW3_ARTIFACT_PREFIX}gates/${slug}/v1-${'a'.repeat(12)}-${'b'.repeat(12)}-${'c'.repeat(12)}-${'d'.repeat(12)}`;
  const files = new Map(), artifacts = Object.entries(mw3ArchivePaths(spot)).map(([kind, path], ordinal) => {
    const bytes = ordinal === 0 ? Buffer.alloc(RAW_BYTES, index + 1) : Buffer.from(`synthetic memory file ${kind}`);
    files.set(path, bytes); return { ...record(path, bytes), kind, spot: id, entry: `objects/${sha256(bytes)}` };
  }).sort((a, b) => a.path < b.path ? -1 : 1);
  const sources = [record('apps/shared/mw3-approved.ts', Buffer.from('synthetic source, not a real authority'))];
  const inputs = [record('apps/frontend/src/estimated/opening-ranges.json', Buffer.from('synthetic input'))];
  const manifest = { schema_version: 1, kind: 'mw3-artifact-snapshot', approval: 'unapproved', source_tree: 'a'.repeat(40), spot, sources, inputs, artifacts,
    sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(inputs)),
    archive: { path: `artifacts/postflop/mw3-${slug}.tar.gz`, format: 'ustar+gzip-content-addressed-v1', bytes: 1, sha256: 'c'.repeat(64) } };
  manifest.content_sha256 = mw3ArchiveContentHash(manifest);
  const entry = { slug, archive: manifest.archive.path, manifest: manifest.archive.path.replace(/\.tar\.gz$/, '.manifest.json'), receipt: `configs/mw3-${slug}.review.json` };
  const savedInputs = [record(entry.archive, Buffer.from('synthetic archive pin')), record(entry.manifest, jsonBytes(manifest)), record(entry.receipt, Buffer.from('no real receipt'))]
    .sort((a, b) => a.path < b.path ? -1 : 1);
  const pins = ['flop', 'later'].map((stage, ordinal) => ({ spotId: id, stage, deliveryHash: (ordinal ? '2' : '1').repeat(64),
    implementationHash: spot.implementation_hash, policyHash: ordinal ? spot.later_policy_hash : spot.flop_policy_hash, sourceHash: spot.source_hash }));
  const parsed = JSON.parse(JSON.stringify({ synthetic_large_parsed_report: 'x'.repeat(PARSED_BYTES) }));
  const snapshot = { manifest, files, compressed: Buffer.alloc(COMPRESSED_BYTES), manifestBytes: jsonBytes(manifest),
    candidates: { synthetic: parsed }, reports: { synthetic: parsed }, receipt: parsed, transport: parsed };
  return { ledger: compactMw3SavedSpot(entry, snapshot, savedInputs, pins), weak: new WeakRef(snapshot) };
}
const ledgers = [], weak = []; let peakHeap = 0, peakExternal = 0;
for (let index = 0; index < MW3_SAVED_SPOT_LIMIT; index++) {
  const result = oneSyntheticSpot(index); ledgers.push(result.ledger); weak.push(result.weak);
  // A turn boundary makes WeakRef liveness deterministic before explicit GC.
  await setImmediate(); global.gc();
  const memory = process.memoryUsage(); peakHeap = Math.max(peakHeap, memory.heapUsed); peakExternal = Math.max(peakExternal, memory.external);
  assert.ok(memory.heapUsed < 96 * 1024 * 1024, 'Parsed snapshots survived the one-spot metadata boundary');
  assert.ok(memory.external < 64 * 1024 * 1024, 'Raw archives/tars survived the one-spot metadata boundary');
}
await setImmediate(); global.gc();
assert.equal(weak.filter(reference => reference.deref()).length, 0, 'Compact ledgers retained decoded snapshots');
assert.equal(ledgers.length, 16, 'Do not lower the full supported inventory');
const ledgerBytes = Buffer.byteLength(JSON.stringify(ledgers));
assert.ok(ledgerBytes < 256 * 1024, 'Compact ledgers retained large payloads');
assert.equal(clearMw3ContractCache(), 0, 'Synthetic memory test must never create a real contract probe');
console.log(JSON.stringify({ status: 'synthetic-sixteen-spot-ledger-memory-only', spots: ledgers.length,
  synthetic_raw_bytes_per_spot: RAW_BYTES + COMPRESSED_BYTES, synthetic_parsed_bytes_per_spot: PARSED_BYTES,
  heap_limit_bytes: heapLimit, peak_post_gc_heap_bytes: peakHeap, peak_post_gc_external_bytes: peakExternal,
  max_rss_kib: process.resourceUsage().maxRSS, compact_ledger_bytes: ledgerBytes, real_snapshot_acceptance: false }));
