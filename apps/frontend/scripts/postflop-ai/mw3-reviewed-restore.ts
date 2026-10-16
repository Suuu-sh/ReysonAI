// Restore only committed, lossless saved bytes with a separate accepted receipt.
// No recipe execution, strategy generation, approval creation, SQL or publication.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clearMw3ContractCache } from './mw3-artifacts.ts';
import { currentMw3SourceTree, verifyMw3SourceTree } from './mw3-source-tree.ts';
import { MW3_REPOSITORY, verifyMw3Snapshot } from './mw3-reviewed-snapshot.ts';
import { mw3ApprovedCurrentSourceRecords } from './mw3-manifest-source-identity.ts';
import { MW3_ARCHIVE_LIMITS, assertMw3ArchiveManifest, readSafeFile, restoreMw3ArchiveBytes, sha256 } from './mw3-reviewed-archive.ts';
import { assertRecords, assertSafeFile, safeRelativePath } from './reviewed-postflop-archive.ts';
import { prepareMw3SnapshotDeliveries, assertMw3IndependentReceipt, mw3DeliveryPins } from './mw3-reviewed-delivery.ts';

export const MW3_REGISTRY_PATH = 'apps/shared/mw3-approved.ts';
export const MW3_SAVED_SPOT_LIMIT = 16;
const TOTAL_LIMIT = 256 * 1024 * 1024;
const fail = (message: any) : any => { throw new Error(message); };
const hash = (value: any) : any => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pinKeys = ['spotId', 'stage', 'deliveryHash', 'implementationHash', 'policyHash', 'sourceHash'];
const pinIdentity = (pin: any) : any => JSON.stringify(pinKeys.map((key: any) : any => pin[key]));
const git = (root?: any, args?: any, options: any = {}) : any => execFileSync('git', ['--no-replace-objects', ...args],
  { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options });

// Parse the actual build-owned authority as a static literal, without executing
// TS, evaluating expressions or accepting a database/query-supplied registry.
// A future nonempty list must use JSON object/key syntax inside Object.freeze.
function withoutComments(text?: any) : any {
  let result = '', quote: any = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (quote) {
      result += char;
      if (char === '\\') { result += next ?? ''; index++; }
      else if (char === quote) quote = null;
    } else if (['"', "'", '`'].includes(char)) { quote = char; result += char; }
    else if (char === '/' && next === '/') {
      while (index + 1 < text.length && !['\n', '\r'].includes(text[index + 1])) index++;
      result += ' ';
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) fail('Unterminated Mw3 registry comment');
      index = end + 1; result += ' ';
    } else result += char;
  }
  return result.trim();
}
export function parseMw3ApprovedRegistry(bytes?: any) : any {
  if (!Buffer.isBuffer(bytes) || bytes.length > MW3_ARCHIVE_LIMITS.manifest) fail('Missing/oversized Mw3 build registry');
  const text = withoutComments(bytes.toString('utf8'));
  const shape = /^export\s+type\s+Mw3ApprovedPolicy\s*=\s*\{\s*spotId\s*:\s*string\s*;\s*stage\s*:\s*"flop"\s*\|\s*"later"\s*;\s*deliveryHash\s*:\s*string\s*;\s*implementationHash\s*:\s*string\s*;\s*policyHash\s*:\s*string\s*;\s*sourceHash\s*:\s*string\s*;\s*\}\s*;\s*export\s+const\s+MW3_APPROVED_POLICIES\s*:\s*readonly\s+Mw3ApprovedPolicy\[\]\s*=\s*Object\.freeze\(\s*(\[[\s\S]*\])\s*\)\s*;$/;
  const match: any = shape.exec(text);
  if (!match) fail('Mw3 build registry must be the static, literal shared authority');
  let pins: any;
  try { pins = JSON.parse(match[1]); } catch { fail('Mw3 build registry is not a JSON literal'); }
  return assertMw3ApprovedPins(pins);
}
export function assertMw3ApprovedPins(pins?: any) : any {
  if (!Array.isArray(pins) || pins.length > MW3_SAVED_SPOT_LIMIT * 2) fail('Invalid Mw3 build registry pins');
  const stages = new Map(), hashes = new Set();
  for (const pin of pins) {
    if (!pin || Object.keys(pin).sort().join() !== [...pinKeys].sort().join() ||
        typeof pin.spotId !== 'string' || !/^[A-Za-z0-9_]{1,100}$/.test(pin.spotId) || !['flop', 'later'].includes(pin.stage) ||
        !pinKeys.slice(2).every((key: any) : any => hash(pin[key])) || hashes.has(pin.deliveryHash)) fail('Invalid/duplicate Mw3 build registry pin');
    const seen = stages.get(pin.spotId) ?? new Set();
    if (seen.has(pin.stage)) fail('Duplicate Mw3 build registry stage');
    seen.add(pin.stage); stages.set(pin.spotId, seen); hashes.add(pin.deliveryHash);
  }
  if ([...stages.values()].some((seen: any) : any => seen.size !== 2)) fail('Mw3 build registry must register a complete flop/later pair');
  return pins;
}
function namesAt(root?: any, directory?: any) : any {
  assertSafeFile(root, `${directory}/inventory-probe`, { missing: true });
  if (!existsSync(join(root, directory))) return ([] as any[]);
  if (!lstatSync(join(root, directory)).isDirectory()) fail('Mw3 inventory root is not a directory');
  return readdirSync(join(root, directory));
}
export function discoverMw3SavedInventory(root?: any, tree: any = currentMw3SourceTree(root)) : any {
  if (!/^[a-f0-9]{40}$/.test(tree)) fail('Missing captured Mw3 committed inventory tree');
  const workingPaths = ['artifacts/postflop', 'configs'].flatMap((directory: any) : any => namesAt(root, directory)
    .filter((name: any) : any => name.startsWith('mw3-')).map((name: any) : any => `${directory}/${name}`)).sort();
  const committedPaths = git(root, ['ls-tree', '-r', '-z', '--name-only', tree, '--', 'artifacts/postflop', 'configs'])
    .split('\0').filter((path: any) : any => /^(?:artifacts\/postflop|configs)\/mw3-/.test(path)).sort();
  if (JSON.stringify(workingPaths) !== JSON.stringify(committedPaths)) fail('Mw3 committed inventory differs from working inventory: removed or added saved inputs');
  const entries = new Map();
  for (const path of committedPaths) {
    const match = /^(artifacts\/postflop|configs)\/mw3-([a-z0-9-]{1,160})\.(tar\.gz|manifest\.json|sql|review\.json)$/.exec(path);
    if (!match || (match[1] === 'configs') !== (match[3] === 'review.json')) fail(`Unexpected saved Mw3 inventory path: ${path}`);
    const [, , slug, suffix] = match!, kind: any = ({ 'tar.gz': 'archive', 'manifest.json': 'manifest', sql: 'sql', 'review.json': 'receipt' } as any)[suffix];
    const entry = entries.get(slug) ?? { slug };
    if (entry[kind]) fail('Duplicate saved Mw3 inventory part');
    entry[kind] = path; entries.set(slug, entry);
  }
  if (entries.size > MW3_SAVED_SPOT_LIMIT) fail('Saved Mw3 inventory exceeds spot limit');
  const inventory = [...entries.values()].sort((a?: any, b?: any) : any => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  for (const entry of inventory) {
    if (!entry.manifest || !entry.archive || !entry.receipt) fail(`Incomplete saved Mw3 archive/manifest/receipt: ${entry.slug}`);
    for (const kind of ['manifest', 'archive', 'receipt', ...(entry.sql ? ['sql'] : ([] as any[]))]) assertSafeFile(root, entry[kind]);
  }
  return inventory;
}
// HEAD commits small manifests/receipts directly; a materialized LFS archive
// must match the exact canonical pointer committed at HEAD. Dirty inputs fail.
export function assertMw3CommittedFile(root?: any, path?: any, bytes?: any, { lfs = false, tree = 'HEAD' }: any = {}) : any {
  if (!safeRelativePath(path) || !Buffer.isBuffer(bytes) || !(tree === 'HEAD' || /^[a-f0-9]{40}$/.test(tree))) fail('Invalid saved Mw3 committed input');
  const rows = git(root, ['ls-tree', '-z', '--full-tree', tree, '--', path]).split('\0').filter(Boolean);
  if (rows.length !== 1) fail(`Saved Mw3 input is not committed: ${path}`);
  const tab = rows[0].indexOf('\t'), [mode, type, oid] = rows[0].slice(0, tab).split(' ');
  if (rows[0].slice(tab + 1) !== path || !['100644', '100755'].includes(mode) || type !== 'blob' || !/^[a-f0-9]{40}$/.test(oid)) fail('Saved Mw3 input must be a regular committed Git blob');
  const size = Number(git(root, ['cat-file', '-s', oid]).trim());
  if (!Number.isSafeInteger(size) || size < 1 || size > (lfs ? 256 : bytes.length)) fail(`Committed saved Mw3 input size differs: ${path}`);
  const committed: any = git(root, ['cat-file', 'blob', oid], { encoding: 'buffer', maxBuffer: size + 1024 });
  const expected = lfs ? Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${sha256(bytes)}\nsize ${bytes.length}\n`) : bytes;
  if (!committed.equals(expected)) fail(`Saved Mw3 input differs from committed ${lfs ? 'canonical LFS pointer' : 'bytes'}: ${path}`);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}
export function assertMw3SavedRegistry(registryBytes?: any, ledgers?: any, acceptedPins?: any) : any {
  const registry = parseMw3ApprovedRegistry(registryBytes), accepted = new Map();
  for (const pin of acceptedPins) {
    const key = `${pin.spotId}:${pin.stage}`;
    if (accepted.has(key)) fail('Duplicate independently accepted Mw3 saved pair');
    accepted.set(key, pinIdentity(pin));
  }
  for (const ledger of ledgers) {
    const record = ledger.sources.find((row: any) : any => row.path === MW3_REGISTRY_PATH);
    if (!record || record.bytes !== registryBytes.length || record.sha256 !== sha256(registryBytes)) fail('Saved Mw3 source does not bind the actual shared build registry');
  }
  for (const pin of registry) {
    if (accepted.get(`${pin.spotId}:${pin.stage}`) !== pinIdentity(pin)) fail('Mw3 build registry pin has no matching independently accepted saved pair');
  }
  return registry;
}
const copyRecord = (row: any) : any => ({ path: row.path, bytes: row.bytes, sha256: row.sha256 });
// Drop all raw archives/tars, policies, reports, transport parts and receipt
// objects at the spot boundary. Only whitelisted small identity records escape.
export function compactMw3SavedSpot(entry?: any, snapshot?: any, savedInputs?: any, pins?: any, currentSources?: any) : any {
  const manifest = assertMw3ArchiveManifest(snapshot.manifest);
  assertRecords(savedInputs, 'saved Mw3 input');
  if (savedInputs.length !== 3 || !(snapshot.files instanceof Map) || snapshot.files.size !== 7) fail('Incomplete Mw3 saved ledger/file set');
  for (const item of manifest.artifacts) {
    const body = snapshot.files.get(item.path);
    if (!Buffer.isBuffer(body) || body.length !== item.bytes || sha256(body) !== item.sha256) fail('Changed Mw3 saved ledger bytes');
  }
  assertMw3ApprovedPins(pins);
  return { entry: Object.fromEntries(['slug', 'manifest', 'archive', 'receipt', 'sql'].filter((key: any) : any => Object.hasOwn(entry, key)).map((key: any) : any => [key, entry[key]])),
    spotId: manifest.spot.id, sourceTree: manifest.source_tree,
    savedInputs: savedInputs.map(copyRecord), sources: manifest.sources.map(copyRecord), inputs: manifest.inputs.map(copyRecord),
    ...(currentSources ? { currentSources: assertRecords(currentSources, 'current Mw3 source').map(copyRecord) } : {}),
    artifacts: manifest.artifacts.map(copyRecord), pins: pins.map((pin: any) : any => Object.fromEntries(pinKeys.map((key: any) : any => [key, pin[key]]))) };
}
export function assertMw3SavedSourceTrees(root?: any, historicalTree?: any, committedTree?: any, records?: any, currentRecords?: any) : any {
  verifyMw3SourceTree(root, historicalTree, records);
  verifyMw3SourceTree(root, committedTree, currentRecords ?? records);
}
// Global hash-only preflight still covers the last distinct spot before the
// first write, without keeping every decoded body or parsed policy in memory.
export function preflightMw3SavedRestoration(root?: any, ledgers?: any) : any {
  const destinations = new Set(); let total = 0;
  for (const ledger of ledgers) {
    assertRecords(ledger.artifacts, 'Mw3 restore artifact', MW3_ARCHIVE_LIMITS.file);
    if (ledger.artifacts.length !== 7) fail('Incomplete Mw3 restoration file set');
    for (const item of ledger.artifacts) {
      if (destinations.has(item.path)) fail('Duplicate Mw3 restoration destination');
      destinations.add(item.path); total += item.bytes;
      if (total > TOTAL_LIMIT) fail('Saved Mw3 restoration exceeds total byte limit');
      assertSafeFile(root, item.path, { missing: true });
      if (existsSync(join(root, item.path))) {
        const body = readSafeFile(root, item.path, item.bytes);
        if (body.length !== item.bytes || sha256(body) !== item.sha256) fail('Existing Mw3 artifact differs and is preserved');
      }
    }
  }
  return [...destinations];
}
function assertIgnoredDestinations(root?: any, paths?: any) : any {
  if (!paths.length) return;
  if (git(root, ['ls-files', '-z', '--', ...paths])) fail('Reviewed Mw3 restoration may not write a tracked path');
  const ignored = new Set(git(root, ['check-ignore', '--no-index', '-z', '--stdin'], { input: paths.join('\0') + '\0' }).split('\0').filter(Boolean));
  if (ignored.size !== paths.length || paths.some((path: any) : any => !ignored.has(path))) fail('Reviewed Mw3 restoration is restricted to ignored local paths');
}
function assertPinnedBytes(root?: any, record?: any) : any {
  const bytes = readSafeFile(root, record.path, record.bytes);
  if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) fail(`Saved/reviewed Mw3 input changed: ${record.path}`);
}
async function inspectMw3SavedSpot(root?: any, entry?: any, committedTree?: any, registryBytes?: any, { expected, restore = false }: any = {}) : Promise<any> {
  try {
    const manifestBytes = readSafeFile(root, entry.manifest, MW3_ARCHIVE_LIMITS.manifest);
    const compressed = readSafeFile(root, entry.archive, MW3_ARCHIVE_LIMITS.compressed);
    const receiptBytes = readSafeFile(root, entry.receipt, MW3_ARCHIVE_LIMITS.manifest);
    const savedInputs = [[entry.manifest, manifestBytes, false], [entry.archive, compressed, true], [entry.receipt, receiptBytes, false]]
      .map(([path, bytes, lfs]: any) : any => assertMw3CommittedFile(root, path, bytes, { lfs, tree: committedTree })).sort((a?: any, b?: any) : any => a.path < b.path ? -1 : 1);
    const snapshot = verifyMw3Snapshot(manifestBytes, compressed);
    if (snapshot.manifest.spot.slug !== entry.slug || snapshot.manifest.archive.path !== entry.archive) fail('Saved Mw3 inventory identity differs');
    const historicalRecords = [...snapshot.manifest.sources, ...snapshot.manifest.inputs];
    const currentSources = mw3ApprovedCurrentSourceRecords();
    const currentRecords = [...currentSources, ...snapshot.manifest.inputs];
    assertMw3SavedSourceTrees(root, snapshot.manifest.source_tree, committedTree, historicalRecords, currentRecords);
    let receipt: any;
    try { receipt = JSON.parse(receiptBytes.toString('utf8')); } catch { fail('Malformed saved Mw3 independent receipt'); }
    const deliveries = await prepareMw3SnapshotDeliveries(snapshot);
    assertMw3IndependentReceipt(receipt, snapshot, deliveries);
    const pins = mw3DeliveryPins(snapshot, deliveries), ledger = compactMw3SavedSpot(entry, snapshot, savedInputs, pins, currentSources);
    const registrySource = ledger.sources.find((record: any) : any => record.path === MW3_REGISTRY_PATH);
    if (!registrySource || registrySource.bytes !== registryBytes.length || registrySource.sha256 !== sha256(registryBytes)) fail('Saved Mw3 source does not bind the actual shared build registry');
    if (expected && JSON.stringify(ledger) !== JSON.stringify(expected)) fail('Mw3 saved spot changed between verification and restoration');
    if (restore) {
      for (const record of [...ledger.savedInputs, ...ledger.currentSources, ...ledger.inputs]) assertPinnedBytes(root, record);
      if (currentMw3SourceTree(root) !== committedTree) fail('Mw3 committed input tree changed before restoration');
      return { ledger, restored: restoreMw3ArchiveBytes(root, snapshot.manifest, snapshot.files) };
    }
    return { ledger };
  } finally { clearMw3ContractCache(); }
}
export async function verifyMw3SavedInventory({ restore = false }: any = {}) : Promise<any> {
  if (typeof restore !== 'boolean') fail('Mw3 restore mode must be a boolean');
  const root = MW3_REPOSITORY, committedTree = currentMw3SourceTree(root);
  const registryBytes = readSafeFile(root, MW3_REGISTRY_PATH, MW3_ARCHIVE_LIMITS.manifest);
  const registryRecord = assertMw3CommittedFile(root, MW3_REGISTRY_PATH, registryBytes, { tree: committedTree });
  parseMw3ApprovedRegistry(registryBytes);
  const inventory = discoverMw3SavedInventory(root, committedTree), ledgers: any[] = [], acceptedPins: any[] = [], sourceRecords = new Map();
  let total = 0;
  for (const entry of inventory) {
    // The inspector returns identity-only records; its one-spot payloads and
    // parsed objects are unreachable before the next archive is loaded.
    const { ledger } = await inspectMw3SavedSpot(root, entry, committedTree, registryBytes);
    total += ledger.artifacts.reduce((sum?: any, item?: any) : any => sum + item.bytes, 0);
    if (total > TOTAL_LIMIT) fail('Saved Mw3 inventory exceeds total byte limit');
    for (const record of [...ledger.currentSources, ...ledger.inputs]) {
      const previous = sourceRecords.get(record.path);
      if (previous && JSON.stringify(previous) !== JSON.stringify(record)) fail('Mw3 saved spots disagree on source/input identity');
      sourceRecords.set(record.path, record);
    }
    acceptedPins.push(...ledger.pins); ledgers.push(ledger);
  }
  const registry = assertMw3SavedRegistry(registryBytes, ledgers, acceptedPins);
  // Reconcile names again and recheck all hashes before global destination
  // preflight. No payload buffers are retained in this inventory-wide ledger.
  if (JSON.stringify(discoverMw3SavedInventory(root, committedTree)) !== JSON.stringify(inventory)) fail('Mw3 saved inventory changed during verification');
  for (const record of [registryRecord, ...ledgers.flatMap((ledger: any) : any => ledger.savedInputs), ...sourceRecords.values()]) assertPinnedBytes(root, record);
  if (currentMw3SourceTree(root) !== committedTree) fail('Mw3 committed input tree changed during verification');
  let files = 0, bytes = 0;
  if (restore) {
    assertIgnoredDestinations(root, preflightMw3SavedRestoration(root, ledgers));
    for (const ledger of ledgers) {
      const { restored } = await inspectMw3SavedSpot(root, ledger.entry, committedTree, registryBytes, { expected: ledger, restore: true });
      files += (restored as any).files; bytes += (restored as any).bytes;
    }
  }
  return { status: ledgers.length ? (restore ? 'restored-independently-reviewed-saved-bytes' : 'verified-independently-reviewed-saved-bytes') : 'no-reviewed-saved-data',
    spots: ledgers.map((ledger: any) : any => ledger.spotId), accepted_pairs: ledgers.length, registered_pairs: registry.length / 2, restored_files: files, restored_bytes: bytes,
    publication: 'not-authorized-by-restore' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (!['verify', 'restore'].includes(command) || args.length) throw new Error('Specify only verify or restore; no alternate registry, receipt or fixture options exist');
  console.log(JSON.stringify(await verifyMw3SavedInventory({ restore: command === 'restore' }), null, 2));
}
