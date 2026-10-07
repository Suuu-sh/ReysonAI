// Independent compatibility-boundary tests. Receipts below are SYNTHETIC ONLY.
// No fixture is a strategy/source approval or installed in repository configs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ADAPTER = 'apps/frontend/scripts/postflop-ai/mw3-source-identity.mjs';
const INVENTORY = 'apps/frontend/scripts/postflop-ai/mw3-source-identity-pairs.json';
const REVIEW = 'configs/source-identity-mw3.review.json';
const EVIDENCE = [['exact-pair-parity', 'apps/frontend/docs/mw3-source-identity/exact-pair-parity.json'], ['gate-identity-wiring-amendment', 'apps/frontend/docs/mw3-source-identity/gate-identity-wiring-amendment.json'], ['transitive-mw3-input-review', 'apps/frontend/docs/mw3-source-identity/transitive-mw3-input-review.json']];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value) + '\n');
const readJson = path => JSON.parse(readFileSync(path));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mw3-SYNTHETIC-identity-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); };
  put(ADAPTER, readFileSync(join(ROOT, ADAPTER)));
  const inventory = readJson(join(ROOT, INVENTORY));
  for (const row of inventory.pairs) put(row.current_path, readFileSync(join(ROOT, row.current_path)));
  put(INVENTORY, json(inventory));
  const evidence = EVIDENCE.map(([kind, path]) => {
    const body = json({ fixture: 'SYNTHETIC TEST DATA, NOT INDEPENDENT APPROVAL', kind }); put(path, body);
    return { kind, path, bytes: body.length, sha256: sha(body) };
  });
  const review = { schema_version: 1, kind: 'mw3-independent-source-compatibility-review', status: 'approved', scope: 'source-only-no-strategy-or-runtime-renewal',
    reviewer: 'SYNTHETIC TEST FIXTURE ONLY', reviewer_model: 'gpt-6-astra', reviewer_task: 'synthetic-contract-fixture-not-real-review', inventory_sha256: sha(readFileSync(join(root, INVENTORY))),
    adapter_sha256: sha(readFileSync(join(root, ADAPTER))), pairs: inventory.pairs.map(({ historical_source, ...row }) => row), evidence };
  const saveReview = () => put(REVIEW, json(review));
  const saveInventory = () => { put(INVENTORY, json(inventory)); review.inventory_sha256 = sha(readFileSync(join(root, INVENTORY))); review.pairs = inventory.pairs.map(({ historical_source, ...row }) => row); saveReview(); };
  saveReview();
  return { root, put, inventory, review, saveReview, saveInventory, load: () => import(pathToFileURL(join(root, ADAPTER)).href) };
}
async function rejected(t, mutate, group = 'semantic') {
  const f = fixture(t); await mutate(f);
  await assert.rejects(async () => (await f.load()).mw3CompatibilityIdentity(group));
}
test('synthetic adapter fixture reconstructs all historical and actual-current groups exactly', async t => {
  const f = fixture(t), api = await f.load();
  assert.equal(f.inventory.pairs.length, 22);
  for (const group of ['semantic', 'pilot', 'authored']) {
    const keys = f.inventory.groups[group];
    const rows = keys.map(key => f.inventory.pairs.find(row => row.historical_key === key));
    const expectedHistorical = sha(JSON.stringify(Object.fromEntries(rows.map(row => [row.historical_key, row.historical_source]))));
    const expectedCurrent = sha(JSON.stringify(Object.fromEntries(rows.map(row => [row.historical_key, readFileSync(join(f.root, row.current_path), 'utf8')]))));
    const actual = api.mw3CompatibilityIdentity(group);
    assert.equal(actual.historicalHash, expectedHistorical); assert.equal(actual.currentRawHash, expectedCurrent); assert.notEqual(actual.currentRawHash, actual.historicalHash);
    if (group !== 'semantic') assert.equal(api.mw3CurrentVerificationHash(group), expectedCurrent);
    assert.ok(Object.isFrozen(actual));
  }
  assert.throws(() => api.mw3CurrentVerificationHash('semantic'));
  assert.equal(Object.hasOwn(api, 'historical_source'), false);
});
const negative = [
  ['missing review', f => unlinkSync(join(f.root, REVIEW))],
  ['pending review', f => { f.review.status = 'pending'; f.saveReview(); }],
  ['wrong reviewer model', f => { f.review.reviewer_model = 'unreviewed'; f.saveReview(); }],
  ['missing reviewer task', f => { f.review.reviewer_task = ''; f.saveReview(); }],
  ['unknown review field', f => { f.review.skip = true; f.saveReview(); }],
  ['wrong inventory digest', f => { f.review.inventory_sha256 = '0'.repeat(64); f.saveReview(); }],
  ['wrong adapter digest', f => { f.review.adapter_sha256 = '0'.repeat(64); f.saveReview(); }],
  ['missing pair', f => { f.inventory.pairs.pop(); f.saveInventory(); }],
  ['extra pair', f => { f.inventory.pairs.push({ ...f.inventory.pairs[0] }); f.saveInventory(); }],
  ['duplicate pair', f => { f.inventory.pairs[1] = { ...f.inventory.pairs[0] }; f.saveInventory(); }],
  ['reordered pairs', f => { [f.inventory.pairs[0], f.inventory.pairs[1]] = [f.inventory.pairs[1], f.inventory.pairs[0]]; f.saveInventory(); }],
  ['reordered group', f => { f.inventory.groups.semantic.reverse(); f.saveInventory(); }],
  ['extra group', f => { f.inventory.groups.future = []; f.saveInventory(); }],
  ['wrong current path', f => { f.inventory.pairs[0].current_path = f.inventory.pairs[1].current_path; f.saveInventory(); }],
  ['wrong historical key', f => { f.inventory.pairs[0].historical_key = 'future.mjs'; f.saveInventory(); }],
  ['changed current bytes', f => f.put(f.inventory.pairs[0].current_path, 'export const changed = true;\n')],
  ['missing current source', f => unlinkSync(join(f.root, f.inventory.pairs[0].current_path))],
  ['wrong current hash', f => { f.inventory.pairs[0].current_sha256 = '0'.repeat(64); f.saveInventory(); }],
  ['wrong current length', f => { f.inventory.pairs[0].current_bytes++; f.saveInventory(); }],
  ['changed historical source', f => { f.inventory.pairs[0].historical_source += '\n'; f.saveInventory(); }],
  ['wrong historical hash', f => { f.inventory.pairs[0].historical_sha256 = '0'.repeat(64); f.saveInventory(); }],
  ['wrong historical length', f => { f.inventory.pairs[0].historical_bytes++; f.saveInventory(); }],
  ['wrong gate classification', f => { f.inventory.pairs.find(row => row.historical_key === 'gate-mw3-pilot.mjs').classification = 'exact-executable-parity'; f.saveInventory(); }],
  ['gate numerical body drift', f => { const row = f.inventory.pairs.find(row => row.historical_key === 'gate-mw3-pilot.mjs'); f.put(row.current_path, readFileSync(join(f.root, row.current_path), 'utf8').replace('samplesPerEvent: 20000', 'samplesPerEvent: 19999')); }],
  ['mismatched reviewed pair', f => { f.review.pairs[0].current_bytes++; f.saveReview(); }],
  ['missing gate amendment evidence', f => { f.review.evidence.splice(1, 1); f.saveReview(); }],
  ['wrong evidence path despite matching hash', f => { const row = f.review.evidence[0], bytes = readFileSync(join(f.root, row.path)); row.path = 'apps/frontend/docs/mw3-source-identity/other.json'; f.put(row.path, bytes); f.saveReview(); }],
  ['changed evidence bytes', f => f.put(f.review.evidence[0].path, '{}\n')],
  ['missing evidence', f => unlinkSync(join(f.root, f.review.evidence[0].path))],
  ['adapter drift', f => f.put(ADAPTER, readFileSync(join(f.root, ADAPTER), 'utf8') + '\n// changed after review\n')],
  ['malformed review JSON', f => f.put(REVIEW, '{')],
  ['malformed inventory JSON', f => f.put(INVENTORY, '{')],
  ['symlink source', f => { const p = f.inventory.pairs[0].current_path; unlinkSync(join(f.root, p)); symlinkSync(join(f.root, f.inventory.pairs[1].current_path), join(f.root, p)); }],
  ['oversized evidence', f => { const row = f.review.evidence[0], body = Buffer.alloc(2 * 1024 * 1024 + 1, 32); f.put(row.path, body); row.bytes = body.length; row.sha256 = sha(body); f.saveReview(); }],
];
for (const [name, mutate] of negative) test(`synthetic fixture rejects ${name}`, t => rejected(t, mutate));
for (const group of ['future', '__proto__', 'constructor']) test(`synthetic fixture rejects unknown group ${group}`, t => rejected(t, () => {}, group));
test('a successful call cannot cache authority after current source changes', async t => {
  const f = fixture(t), api = await f.load(); api.mw3CompatibilityIdentity('semantic');
  f.put(f.inventory.pairs[0].current_path, 'export const drift = true;\n');
  assert.throws(() => api.mw3CompatibilityIdentity('semantic'));
});
test('raw inventory cannot diverge from the captured imported inventory', async t => {
  const f = fixture(t), api = await f.load(); api.mw3CompatibilityIdentity('semantic');
  f.inventory.pairs[0].historical_source += '\n'; f.inventory.pairs[0].historical_bytes++; f.inventory.pairs[0].historical_sha256 = sha(f.inventory.pairs[0].historical_source); f.saveInventory();
  assert.throws(() => api.mw3CompatibilityIdentity('semantic'));
});

test('compatibility receipt stays outside the reserved saved-delivery namespace', async t => {
  const f = fixture(t), api = await f.load();
  assert.equal(/^configs\/mw3-/.test(REVIEW), false);
  assert.ok(api.MW3_COMPATIBILITY_SOURCE_PATHS.includes(REVIEW));
  assert.ok(!api.MW3_COMPATIBILITY_SOURCE_PATHS.some(path => /^configs\/mw3-/.test(path)));
});
