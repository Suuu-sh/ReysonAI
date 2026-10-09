import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertMw3ApprovedPins, assertMw3CommittedFile, assertMw3SavedRegistry, assertMw3SavedSourceTrees, compactMw3SavedSpot, discoverMw3SavedInventory,
  MW3_REGISTRY_PATH, parseMw3ApprovedRegistry, preflightMw3SavedRestoration } from '../scripts/postflop-ai/mw3-reviewed-restore.mjs';
import { MW3_ARTIFACT_PREFIX, assertMw3ArchiveManifest, decodeMw3Archive, encodeMw3Archive, jsonBytes, mw3ArchiveContentHash,
  mw3ArchivePaths, readSafeFile, restoreMw3ArchiveBytes, sha256 } from '../scripts/postflop-ai/mw3-reviewed-archive.mjs';
import { currentMw3SourceTree, verifyMw3SourceTree } from '../scripts/postflop-ai/mw3-source-tree.mjs';
import { verifyMw3Snapshot } from '../scripts/postflop-ai/mw3-reviewed-snapshot.mjs';
import { assertMw3IndependentReceipt, mw3DeliveryPins, prepareMw3SnapshotDeliveries } from '../scripts/postflop-ai/mw3-reviewed-delivery.mjs';
import { clearMw3ContractCache, mw3Contract } from '../scripts/postflop-ai/mw3-artifacts.mjs';
import { MW3_TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
const emptyRegistry = Buffer.from(readFileSync(new URL('../../shared/mw3-approved.ts', import.meta.url), 'utf8').replace(/Object\.freeze\([\s\S]*?\);/, 'Object.freeze([]);'));
const registry = pins => Buffer.from(emptyRegistry.toString('utf8').replace(/Object\.freeze\([\s\S]*?\);/, `Object.freeze(${JSON.stringify(pins)});`));
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const write = (root, path, bytes) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), bytes); };
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = root => { git(root, ['add', '.']); git(root, ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Mw3 Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-qm', 'synthetic fixture only']); };
async function temporary(run) {
  const root = mkdtempSync(join(tmpdir(), 'mw3-saved-contract-'));
  try { git(root, ['init', '-q']); commit(root); return await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
async function toySnapshot({ id = 'HJ_open_BTN_call_BB_call', slug = 'synthetic-hj-btn-bb-mw3' } = {}) {
  // Pure contract bytes. No real author/recipe, generation, MC or AI acceptance.
  const task = 'synthetic-author-never-a-real-policy', spot = { id, slug, author_version: 1,
    author_model: 'gpt-6-astra', source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64), verification_hash: 'c'.repeat(64), recipe_sha256: 'd'.repeat(64) };
  spot.gate_directory = `${MW3_ARTIFACT_PREFIX}gates/${spot.slug}/v1-${'a'.repeat(12)}-${'b'.repeat(12)}-${'c'.repeat(12)}-${'d'.repeat(12)}`;
  const candidates = {};
  for (const [kind, streets] of [['candidate', ['flop']], ['laterCandidate', ['turn', 'river']]]) {
    const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: spot.id, streets, rules: streets.flatMap(street => MW3_TIERS.map(tier => ({
      node: `mw3_${street}_first_first`, tier, priority: 0, when: { line: 'any', texture: 'any', players: 'any', position: 'any', response: 'any', price: 'any', spr: 'any' },
      mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 } }))) };
    candidates[kind] = { policy, metadata: { spot: spot.id, source_hash: spot.source_hash, implementation_hash: spot.implementation_hash,
      policy_hash: sha256(JSON.stringify(policy)), author_task: task, approval_status: 'candidate_pending_independent_review' } };
  }
  spot.flop_policy_hash = candidates.candidate.metadata.policy_hash; spot.later_policy_hash = candidates.laterCandidate.metadata.policy_hash;
  const files = new Map(), artifacts = Object.entries(mw3ArchivePaths(spot)).map(([kind, path]) => {
    const body = jsonBytes(candidates[kind] ?? { synthetic_contract_report: kind }); files.set(path, body);
    return { ...record(path, body), kind, spot: spot.id, entry: `objects/${sha256(body)}` };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const sources = [record(MW3_REGISTRY_PATH, emptyRegistry)], inputs = [record('apps/frontend/src/estimated/opening-ranges.json', Buffer.from('{}'))];
  const compressed = encodeMw3Archive(artifacts, files), manifest = { schema_version: 1, kind: 'mw3-artifact-snapshot', approval: 'unapproved', source_tree: 'a'.repeat(40),
    spot, sources, inputs, artifacts, sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(inputs)),
    archive: { path: `artifacts/postflop/mw3-${spot.slug}.tar.gz`, format: 'ustar+gzip-content-addressed-v1', bytes: compressed.length, sha256: sha256(compressed) } };
  manifest.content_sha256 = mw3ArchiveContentHash(manifest);
  const evidence = { status: 'complete_evidence_not_acceptance', limitations: ['synthetic contract only; never real approval'] };
  const snapshot = { manifest, manifestBytes: jsonBytes(manifest), compressed, files, candidates, evidence };
  const deliveries = await prepareMw3SnapshotDeliveries(snapshot), pins = mw3DeliveryPins(snapshot, deliveries);
  const receipt = { schema_version: 1, kind: 'mw3-independent-acceptance', status: 'independently-reviewed', strategy_type: 'ai_estimate_not_gto', author_model: 'gpt-6-astra',
    reviewer_model: 'gpt-6-astra', reviewer_task: 'synthetic-reviewer-contract-only', author_task: task, source_tree: manifest.source_tree,
    scope: 'Synthetic contract only, never a real saved snapshot', manifest_sha256: sha256(snapshot.manifestBytes), archive_sha256: manifest.archive.sha256,
    content_sha256: manifest.content_sha256, sources_sha256: manifest.sources_sha256, inputs_sha256: manifest.inputs_sha256,
    spot: spot.id, deliveries: pins, evidence, accepted_limitations: evidence.limitations };
  return { snapshot, deliveries, receipt, pins };
}
function ledgerFor(fixture, snapshot = fixture.snapshot) {
  const entry = { slug: snapshot.manifest.spot.slug, archive: snapshot.manifest.archive.path,
    manifest: snapshot.manifest.archive.path.replace(/\.tar\.gz$/, '.manifest.json'), receipt: `configs/mw3-${snapshot.manifest.spot.slug}.review.json` };
  const savedInputs = [record(entry.archive, snapshot.compressed), record(entry.manifest, snapshot.manifestBytes), record(entry.receipt, jsonBytes(fixture.receipt))]
    .sort((a, b) => a.path < b.path ? -1 : 1);
  return compactMw3SavedSpot(entry, snapshot, savedInputs, fixture.pins);
}
test('zero-data inventory with an empty authority is valid and writes nothing', () => temporary(root => {
  assert.deepEqual(discoverMw3SavedInventory(root), []);
  assert.deepEqual(assertMw3SavedRegistry(emptyRegistry, [], []), []);
  assert.deepEqual(preflightMw3SavedRestoration(root, []), []);
  assert.equal(existsSync(join(root, 'apps')), false);
}));
test('every incomplete manifest/archive/receipt subset and orphan SQL fails closed', async () => {
  const paths = ['artifacts/postflop/mw3-toy.manifest.json', 'artifacts/postflop/mw3-toy.tar.gz', 'configs/mw3-toy.review.json'];
  for (let mask = 1; mask < 7; mask++) await temporary(root => {
    paths.forEach((path, index) => { if (mask & (1 << index)) write(root, path, '{}'); });
    commit(root); assert.throws(() => discoverMw3SavedInventory(root), /Incomplete/);
  });
  await temporary(root => { write(root, 'artifacts/postflop/mw3-toy.sql', 'SELECT 1;'); commit(root); assert.throws(() => discoverMw3SavedInventory(root), /Incomplete/); });
});
test('unknown MW3 inventory, file links and directory links are rejected', async () => {
  await temporary(root => { write(root, 'artifacts/postflop/mw3-toy.extra', 'bad'); commit(root); assert.throws(() => discoverMw3SavedInventory(root), /Unexpected/); });
  await temporary(root => {
    write(root, 'artifacts/postflop/mw3-toy.manifest.json', '{}'); write(root, 'configs/mw3-toy.review.json', '{}');
    symlinkSync('missing', join(root, 'artifacts/postflop/mw3-toy.tar.gz')); commit(root);
    assert.throws(() => discoverMw3SavedInventory(root), /symlink/);
  });
  await temporary(root => {
    mkdirSync(join(root, 'artifacts')); symlinkSync(root, join(root, 'artifacts/postflop'));
    assert.throws(() => discoverMw3SavedInventory(root), /symlink/);
  });
});
test('complete inventory identifies exact paths without treating HU files as MW3', () => temporary(root => {
  for (const path of ['artifacts/postflop/mw3-toy.manifest.json', 'artifacts/postflop/mw3-toy.tar.gz', 'configs/mw3-toy.review.json', 'artifacts/postflop/mw3-toy.sql', 'artifacts/postflop/hu.tar.gz']) write(root, path, '{}');
  commit(root); assert.deepEqual(discoverMw3SavedInventory(root), [{ slug: 'toy', manifest: 'artifacts/postflop/mw3-toy.manifest.json', sql: 'artifacts/postflop/mw3-toy.sql', archive: 'artifacts/postflop/mw3-toy.tar.gz', receipt: 'configs/mw3-toy.review.json' }]);
}));
test('seven-file losslessness rejects corruption, extra files and self-approved preservation', async () => {
  const fixture = await toySnapshot(), { snapshot } = fixture;
  assert.deepEqual(decodeMw3Archive(snapshot.compressed, snapshot.manifest), snapshot.files);
  const corrupt = Buffer.from(snapshot.compressed); corrupt[20] ^= 1;
  assert.throws(() => decodeMw3Archive(corrupt, snapshot.manifest), /hash mismatch/);
  const changed = structuredClone(snapshot.manifest); changed.artifacts.pop(); changed.content_sha256 = mw3ArchiveContentHash(changed);
  assert.throws(() => assertMw3ArchiveManifest(changed), /inventory/);
  const approved = structuredClone(snapshot.manifest); approved.approval = 'approved'; approved.content_sha256 = mw3ArchiveContentHash(approved);
  assert.throws(() => assertMw3ArchiveManifest(approved), /unapproved/);
  await temporary(root => {
    const extra = new Map(snapshot.files); extra.set('other', Buffer.from('bad'));
    assert.throws(() => ledgerFor(fixture, { ...snapshot, files: extra }), /file set/);
    assert.equal(existsSync(join(root, 'apps')), false);
  });
});
test('synthetic receipt cannot substitute for a real source/input/evidence snapshot', async () => {
  const { snapshot, receipt, deliveries } = await toySnapshot();
  assertMw3IndependentReceipt(receipt, snapshot, deliveries); // Receipt-contract test only.
  assert.throws(() => verifyMw3Snapshot(snapshot.manifestBytes, snapshot.compressed), /Stale|source|tree|inventory/);
  for (const mutate of [r => { r.manifest_sha256 = '0'.repeat(64); }, r => { r.source_tree = '0'.repeat(40); }, r => { r.status = 'approved'; },
    r => { r.reviewer_task = r.author_task; }, r => { r.deliveries[0].policyHash = '0'.repeat(64); }, r => { r.accepted_limitations = []; }]) {
    const stale = structuredClone(receipt); mutate(stale);
    assert.throws(() => assertMw3IndependentReceipt(stale, snapshot, deliveries), /receipt required/);
  }
});
test('shared authority accepts only complete exact independently accepted saved pairs', async () => {
  const fixture = await toySnapshot(), { snapshot, pins } = fixture, ledger = ledgerFor(fixture);
  assert.deepEqual(assertMw3SavedRegistry(emptyRegistry, [ledger], pins), []);
  assert.throws(() => assertMw3ApprovedPins([pins[0]]), /complete/);
  assert.throws(() => assertMw3ApprovedPins([...pins, pins[0]]), /duplicate/i);
  assert.throws(() => assertMw3SavedRegistry(registry(pins), [], []), /matching/);
  for (const field of ['deliveryHash', 'implementationHash', 'policyHash', 'sourceHash']) {
    const wrong = structuredClone(pins); wrong[0][field] = '0'.repeat(64);
    const bytes = registry(wrong), changed = structuredClone(snapshot.manifest); changed.sources = [record(MW3_REGISTRY_PATH, bytes)];
    assert.throws(() => assertMw3SavedRegistry(bytes, [{ sources: changed.sources }], pins), /matching/);
  }
  const bytes = registry(pins), changed = structuredClone(snapshot.manifest); changed.sources = [record(MW3_REGISTRY_PATH, bytes)];
  assert.deepEqual(assertMw3SavedRegistry(bytes, [{ sources: changed.sources }], pins), pins);
  assert.throws(() => assertMw3SavedRegistry(bytes, [ledger], pins), /actual shared/); // Empty -> published requires a new source-bound snapshot/receipt.
});
test('build-registry parser never executes expressions or reads alternate authority', async () => {
  const { pins } = await toySnapshot();
  assert.deepEqual(parseMw3ApprovedRegistry(registry(pins)), pins);
  for (const source of [emptyRegistry.toString().replace('Object.freeze([])', 'Object.freeze(fetch("https://example.test"))'),
    emptyRegistry.toString() + '\nexport const other = 1;', emptyRegistry.toString().replace('Object.freeze([])', 'Object.freeze([{spotId:"fake"}])'),
    emptyRegistry.toString().replace('Object.freeze([])', 'Object.freeze([]); Object.freeze = value => value'), '/*' + emptyRegistry.toString()]) {
    assert.throws(() => parseMw3ApprovedRegistry(Buffer.from(source)));
  }
  const commentString = structuredClone(pins); commentString[0].spotId += '/*hidden*/';
  assert.throws(() => parseMw3ApprovedRegistry(registry(commentString)), /pin/);
});
test('committed captures reject dirty/untracked bytes and require the exact materialized LFS pin', () => temporary(root => {
  const bytes = Buffer.from('synthetic saved bytes 雪\n');
  write(root, 'manifest.json', bytes);
  write(root, 'archive.tar.gz', `version https://git-lfs.github.com/spec/v1\noid sha256:${sha256(bytes)}\nsize ${bytes.length}\n`);
  commit(root);
  assert.equal(assertMw3CommittedFile(root, 'manifest.json', bytes).sha256, sha256(bytes));
  assertMw3CommittedFile(root, 'archive.tar.gz', bytes, { lfs: true });
  assert.throws(() => assertMw3CommittedFile(root, 'manifest.json', Buffer.from('dirty')), /differs/);
  assert.throws(() => assertMw3CommittedFile(root, 'archive.tar.gz', bytes), /differs/);
  assert.throws(() => assertMw3CommittedFile(root, 'archive.tar.gz', Buffer.from('wrong bytes'), { lfs: true }), /differs/);
  assert.throws(() => assertMw3CommittedFile(root, 'untracked.json', bytes), /not committed/);
}));
test('global restoration preflight preserves collisions before any first-spot write; exact retries work', async () => {
  const fixture = await toySnapshot(), { snapshot } = fixture, ledger = ledgerFor(fixture);
  await temporary(root => {
    const path = snapshot.manifest.artifacts.at(-1).path; write(root, path, 'keep unreviewed bytes');
    assert.throws(() => preflightMw3SavedRestoration(root, [ledger]), /preserved|limit/);
    assert.equal(existsSync(join(root, snapshot.manifest.artifacts[0].path)), false);
    assert.equal(readFileSync(join(root, path), 'utf8'), 'keep unreviewed bytes');
  });
  await temporary(root => {
    preflightMw3SavedRestoration(root, [ledger]); restoreMw3ArchiveBytes(root, snapshot.manifest, snapshot.files);
    preflightMw3SavedRestoration(root, [ledger]); assert.equal(restoreMw3ArchiveBytes(root, snapshot.manifest, snapshot.files).files, 7);
    assert.throws(() => preflightMw3SavedRestoration(root, [ledger, ledger]), /Duplicate/);
  });
});
test('bounded capture rejects oversized, parent-linked and dangling final-linked files', () => temporary(root => {
  write(root, 'small.json', '1234'); assert.equal(readSafeFile(root, 'small.json', 4).toString(), '1234');
  assert.throws(() => readSafeFile(root, 'small.json', 3), /limit/);
  symlinkSync('missing', join(root, 'link.json')); assert.throws(() => readSafeFile(root, 'link.json', 10), /symlink/);
  symlinkSync(root, join(root, 'linked')); assert.throws(() => readSafeFile(root, 'linked/small.json', 4), /symlink/);
}));
test('CI fetches real provenance and runs inventory validation without a missing-receipt skip', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/verify-mw3-contracts.yml', import.meta.url), 'utf8');
  assert.match(workflow, /fetch-depth: 0/);
  for (const path of ['apps/frontend/scripts/postflop-ai/**', 'apps/frontend/scripts/lib/**', 'apps/frontend/scripts/data/**', 'apps/frontend/src/**',
    'apps/backend/src/**', 'apps/shared/**', '.gitattributes', 'apps/frontend/package.json', 'apps/frontend/package-lock.json']) assert.ok(workflow.includes(`'${path}'`), `Missing CI pinned dependency: ${path}`);
  assert.match(workflow, /node --expose-gc apps\/frontend\/tests\/helpers\/mw3-saved-memory-fixture\.mjs/);
  assert.match(workflow, /run: node apps\/frontend\/scripts\/postflop-ai\/mw3-reviewed-restore\.mjs restore/);
  const source = readFileSync(new URL('../scripts/postflop-ai/mw3-reviewed-restore.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /loadMw3AuthoredContext|\.build\(|compile\(|materializeMw3|gateMw3/);
});

test('committed inventory cannot disappear into false zero-data, including later-of-two deletion', async () => {
  for (const removed of [['first'], ['second'], ['first', 'second']]) await temporary(root => {
    for (const slug of ['first', 'second']) for (const path of [`artifacts/postflop/mw3-${slug}.tar.gz`, `artifacts/postflop/mw3-${slug}.manifest.json`, `configs/mw3-${slug}.review.json`]) write(root, path, '{}');
    commit(root); const tree = currentMw3SourceTree(root);
    assert.equal(discoverMw3SavedInventory(root, tree).length, 2);
    for (const slug of removed) for (const path of [`artifacts/postflop/mw3-${slug}.tar.gz`, `artifacts/postflop/mw3-${slug}.manifest.json`, `configs/mw3-${slug}.review.json`]) rmSync(join(root, path));
    assert.throws(() => discoverMw3SavedInventory(root, tree), /committed inventory differs/);
  });
  await temporary(root => {
    for (const path of ['artifacts/postflop/mw3-added.tar.gz', 'artifacts/postflop/mw3-added.manifest.json', 'configs/mw3-added.review.json']) write(root, path, '{}');
    assert.throws(() => discoverMw3SavedInventory(root), /committed inventory differs/);
  });
});
test('current committed source drift cannot be concealed by dirty historical rollback', () => temporary(root => {
  const path = 'source.mjs', old = Buffer.from('export const value = 1;\n');
  write(root, path, old); commit(root); const historical = currentMw3SourceTree(root), records = [record(path, old)];
  write(root, path, 'export const value = 2;\n'); commit(root); const current = currentMw3SourceTree(root);
  write(root, path, old); // Dirty worktree makes the old live-byte check appear valid.
  assert.equal(readSafeFile(root, path, old.length).equals(old), true);
  verifyMw3SourceTree(root, historical, records);
  assert.throws(() => assertMw3SavedSourceTrees(root, historical, current, records), /bytes differ/);
}));
test('strict LFS archives reject identical direct blobs and noncanonical or mismatched pointers', () => temporary(root => {
  const bytes = Buffer.from('synthetic compressed bytes'), pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${sha256(bytes)}\nsize ${bytes.length}\n`;
  write(root, 'direct.tar.gz', bytes);
  const variants = [pointer, pointer.replaceAll('\n', '\r\n'), pointer + '#extension\n', pointer.slice(0, -1),
    pointer.replace(`size ${bytes.length}`, `size ${bytes.length + 1}`), pointer.replace(sha256(bytes), '0'.repeat(64))];
  variants.forEach((value, index) => write(root, `pointer-${index}.tar.gz`, value)); commit(root);
  assertMw3CommittedFile(root, 'direct.tar.gz', bytes); // Ordinary metadata/source blobs remain supported.
  assert.throws(() => assertMw3CommittedFile(root, 'direct.tar.gz', bytes, { lfs: true }), /canonical LFS pointer/);
  assertMw3CommittedFile(root, 'pointer-0.tar.gz', bytes, { lfs: true });
  for (let index = 1; index < variants.length; index++) assert.throws(() => assertMw3CommittedFile(root, `pointer-${index}.tar.gz`, bytes, { lfs: true }), /canonical LFS pointer|size differs/);
}));
test('a later distinct spot collision prevents every earlier-spot write', async () => {
  const first = await toySnapshot(), second = await toySnapshot({ id: 'UTG_open_CO_call_BB_call', slug: 'synthetic-utg-co-bb-mw3' });
  await temporary(root => {
    const collision = second.snapshot.manifest.artifacts.at(-1).path; write(root, collision, 'keep');
    assert.throws(() => preflightMw3SavedRestoration(root, [ledgerFor(first), ledgerFor(second)]), /preserved/);
    assert.equal(existsSync(join(root, first.snapshot.manifest.artifacts[0].path)), false);
    assert.equal(readFileSync(join(root, collision), 'utf8'), 'keep');
  });
});
test('compact spot ledgers never retain policies/reports/tar/raw receipt/archive buffers', async () => {
  const fixture = await toySnapshot(), ledger = ledgerFor(fixture);
  for (const name of ['manifest', 'manifestBytes', 'compressed', 'files', 'candidates', 'reports', 'receipt', 'deliveries']) assert.equal(Object.hasOwn(ledger, name), false);
  assert.ok(Buffer.byteLength(JSON.stringify(ledger)) < 16 * 1024);
  const source = readFileSync(new URL('../scripts/postflop-ai/mw3-reviewed-restore.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /snapshots\.push|captures\.push/);
  assert.match(source, /finally \{ clearMw3ContractCache\(\); \}/);
});

test('contract cache release preserves returned witnesses and identical recomputation', () => {
  // Tiny legal geometry makes this a cache-lifetime unit test, not a real
  // 100BB strategy or acceptance probe. Keep seat names and geometry keys exact.
  const inputs = { spot: { id: 'synthetic_cache_release_only', kind: 'mw3_srp', seats: ['BB', 'CO', 'BTN'], potBb: 8, stackBb: 0.01 } };
  clearMw3ContractCache();
  try {
    const first = mw3Contract(inputs), before = structuredClone(first);
    assert.strictEqual(mw3Contract(inputs), first);
    assert.equal(clearMw3ContractCache(), 1);
    assert.deepEqual(first, before, 'Clearing cache mutated an already returned contract');
    const recomputed = mw3Contract(inputs);
    assert.notStrictEqual(recomputed, first);
    assert.deepEqual(recomputed, before, 'Recomputation changed contract output');
    assert.deepEqual(first, before, 'Recomputation mutated the old contract reference');
  } finally { clearMw3ContractCache(); }
});
