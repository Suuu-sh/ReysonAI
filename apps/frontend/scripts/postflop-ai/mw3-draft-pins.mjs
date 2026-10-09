// Serial transport encoding of already saved candidates. Never authors a policy,
// writes the build registry, creates a receipt, imports D1 or publishes anything.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clearMw3ContractCache } from './mw3-artifacts.mjs';
import { loadMw3Catalog } from './mw3-inputs.mjs';
import { MW3_REPOSITORY, collectMw3Snapshot } from './mw3-reviewed-snapshot.mjs';
import { currentMw3SourceTree } from './mw3-source-tree.mjs';
import { prepareMw3SnapshotDeliveries, mw3DeliveryPins } from './mw3-reviewed-delivery.mjs';
import { MW3_ARTIFACT_PREFIX, MW3_ARCHIVE_LIMITS, readSafeFile, jsonBytes, sha256 } from './mw3-reviewed-archive.mjs';
import { assertSafeFile } from './reviewed-postflop-archive.mjs';
const PREFIX = '.local/postflop-ai/mw3/';
export function assertDraftInventory(inventory, expectedSpots) {
  assert.equal(inventory?.kind, 'coordinator-exact-raw-gate-inventory-not-independent-receipt');
  assert.ok(Array.isArray(expectedSpots) && expectedSpots.length === 16 && new Set(expectedSpots).size === 16);
  assert.equal(inventory.summary?.spots, 16);
  assert.ok(Array.isArray(inventory.spots) && inventory.spots.length === 16);
  assert.deepEqual(inventory.spots.map(row => row.spot).sort(), [...expectedSpots].sort());
  for (const row of inventory.spots) assert.match(row.source, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(inventory.files) && inventory.files.length === 112);
  const paths = new Set();
  for (const row of inventory.files) {
    assert.ok(typeof row.path === 'string' && row.path.startsWith(PREFIX) && row.path.endsWith('.json') &&
      row.path.split('/').every(part => part && part !== '..' && part !== '.') && !row.path.includes('\\') && !paths.has(row.path));
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= MW3_ARCHIVE_LIMITS.file);
    assert.match(row.sha256, /^[a-f0-9]{64}$/); paths.add(row.path);
  }
  return new Map(inventory.files.map(row => [`apps/frontend/${row.path}`, row]));
}
function assertInventoryBytes(records) {
  for (const [path, record] of records) {
    const body = readSafeFile(MW3_REPOSITORY, path, MW3_ARCHIVE_LIMITS.file);
    assert.deepEqual({ bytes: body.length, sha256: sha256(body) }, { bytes: record.bytes, sha256: record.sha256 }, `Inventory-bound raw bytes changed: ${path}`);
  }
}
export async function deriveMw3DraftPins(inventoryPath, inventorySha) {
  assert.equal(typeof globalThis.gc, 'function', 'Serial draft derivation requires node --expose-gc');
  assert.match(inventorySha, /^[a-f0-9]{64}$/);
  assert.ok(inventoryPath.startsWith(MW3_ARTIFACT_PREFIX) && inventoryPath.endsWith('.json'), 'Inventory must remain in the local MW3 directory');
  const bytes = readSafeFile(MW3_REPOSITORY, inventoryPath, MW3_ARCHIVE_LIMITS.manifest);
  assert.equal(sha256(bytes), inventorySha, 'Inventory bytes differ from the explicit requested identity');
  const inventory = JSON.parse(bytes), reachable = loadMw3Catalog().filter(spot => spot.reachable).map(spot => spot.id).sort();
  const records = assertDraftInventory(inventory, reachable), used = new Set(), pins = [], subjects = [];
  const tree = currentMw3SourceTree(MW3_REPOSITORY);
  const registryBytes = readSafeFile(MW3_REPOSITORY, 'apps/shared/mw3-approved.ts', MW3_ARCHIVE_LIMITS.manifest);
  assertInventoryBytes(records);
  for (const spotId of reachable) {
    try {
      // Collect verifies saved candidate provenance, every gate, all seven
      // accepted limitations and current committed source closure. No recipe runs.
      const snapshot = collectMw3Snapshot(spotId);
      assert.equal(snapshot.manifest.source_tree, tree);
      assert.equal(snapshot.manifest.spot.source_hash, inventory.spots.find(row => row.spot === spotId).source);
      for (const artifact of snapshot.manifest.artifacts) {
        const expected = records.get(artifact.path); assert.ok(expected && !used.has(artifact.path), 'Exact inventory must account for every saved artifact once');
        assert.deepEqual({ bytes: artifact.bytes, sha256: artifact.sha256 }, { bytes: expected.bytes, sha256: expected.sha256 }); used.add(artifact.path);
      }
      const deliveries = await prepareMw3SnapshotDeliveries(snapshot);
      pins.push(...mw3DeliveryPins(snapshot, deliveries));
      subjects.push({ spot: spotId, draft_manifest_sha256: sha256(snapshot.manifestBytes), sources_sha256: snapshot.manifest.sources_sha256,
        inputs_sha256: snapshot.manifest.inputs_sha256, artifacts: snapshot.manifest.artifacts, evidence_limitations: snapshot.evidence.limitations });
      process.stderr.write(`Draft transport pair derived from exact saved bytes: ${spotId}\n`);
    } finally { clearMw3ContractCache(); globalThis.gc(); }
  }
  assert.equal(pins.length, 32); assert.equal(new Set(pins.map(pin => pin.deliveryHash)).size, 32); assert.equal(used.size, 112);
  assert.deepEqual(readSafeFile(MW3_REPOSITORY, 'apps/shared/mw3-approved.ts', MW3_ARCHIVE_LIMITS.manifest), registryBytes, 'Draft derivation must preserve the build registry');
  assertInventoryBytes(records); assert.equal(currentMw3SourceTree(MW3_REPOSITORY), tree);
  assert.deepEqual(readSafeFile(MW3_REPOSITORY, inventoryPath, MW3_ARCHIVE_LIMITS.manifest), bytes);
  const draft = { schema_version: 1, kind: 'mw3-draft-transport-pins', status: 'unapproved_transport_encoding_only', source_tree: tree,
    inventory: { path: inventoryPath, bytes: bytes.length, sha256: inventorySha }, pins, subjects,
    publication: 'not-authorized', independent_receipt: 'not-created', registry: 'not-modified' };
  const output = `${MW3_ARTIFACT_PREFIX}activation-draft/${inventorySha}-${tree}.draft-pins.json`, outputBytes = jsonBytes(draft);
  assertSafeFile(MW3_REPOSITORY, output, { missing: true });
  mkdirSync(dirname(join(MW3_REPOSITORY, output)), { recursive: true }); assertSafeFile(MW3_REPOSITORY, output, { missing: true });
  if (existsSync(join(MW3_REPOSITORY, output))) assert.deepEqual(readFileSync(join(MW3_REPOSITORY, output)), outputBytes, 'Differing prior draft is preserved');
  else writeFileSync(join(MW3_REPOSITORY, output), outputBytes, { flag: 'wx' });
  return { status: draft.status, path: output, bytes: outputBytes.length, sha256: sha256(outputBytes), pins: pins.length, spots: subjects.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.equal(args.length, 4, 'Required: --inventory REPO_PATH --inventory-sha256 SHA256');
  assert.equal(args[0], '--inventory'); assert.equal(args[2], '--inventory-sha256');
  console.log(JSON.stringify(await deriveMw3DraftPins(args[1], args[3]), null, 2));
}
