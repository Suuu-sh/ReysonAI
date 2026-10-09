// Source-only compatibility for the one independently reviewed MW3 migration.
// Historical bytes are identity evidence only; they are never executed or exported.
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import proposal from './mw3-source-identity-pairs.json' with { type: 'json' };
const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIRECTORY, '../../../..');
const PREFIX = 'apps/frontend/scripts/postflop-ai/';
const INVENTORY = `${PREFIX}mw3-source-identity-pairs.json`;
const ADAPTER = `${PREFIX}mw3-source-identity.mjs`;
const REVIEW = 'configs/source-identity-mw3.review.json';
const EVIDENCE = Object.freeze([['exact-pair-parity', 'apps/frontend/docs/mw3-source-identity/exact-pair-parity.json'], ['gate-identity-wiring-amendment', 'apps/frontend/docs/mw3-source-identity/gate-identity-wiring-amendment.json'], ['transitive-mw3-input-review', 'apps/frontend/docs/mw3-source-identity/transitive-mw3-input-review.json']]);
const SEMANTIC = Object.freeze(['mw3-engine.mjs', 'mw3-hand-features.mjs', 'mw3-actions.mjs', 'mw3-tree.mjs', 'mw3-policy.mjs', 'mw3-spots.mjs', 'mw3-inputs.mjs', 'mw3-input-core.mjs', 'mw3-runtime.mjs', 'mw3-joint-defence.mjs', 'model.mjs', '../lib/equity.mjs', '../lib/continuation-evaluator.mjs']);
const GATE = Object.freeze(['mw3-audit.mjs', 'mw3-simulation.mjs', 'mw3-simulation-report.mjs', 'flop-isomorphism.mjs', '../data/postflop-ai-pilot.json']);
const GROUPS = Object.freeze({ semantic: SEMANTIC, pilot: Object.freeze(['gate-mw3-pilot.mjs', ...GATE]), authored: Object.freeze(['gate-mw3-authored.mjs', 'mw3-author-cli.mjs', 'mw3-authored-source.mjs', ...GATE]) });
const KEYS = Object.freeze([...new Set(Object.values(GROUPS).flat())]);
const RELOCATED = Object.freeze({ 'model.mjs': 'model.ts', '../lib/equity.mjs': '../lib/equity.ts', '../lib/continuation-evaluator.mjs': '../lib/continuation-evaluator.ts', 'flop-isomorphism.mjs': 'flop-isomorphism.ts' });
const GATE_KEYS = new Set(['gate-mw3-pilot.mjs', 'gate-mw3-authored.mjs']);
const SHA = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(`Unapproved or changed MW3 source identity: ${message}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const objectHash = value => sha(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(label);
}
function currentPath(key) { return relative(ROOT, resolve(DIRECTORY, RELOCATED[key] ?? key)).split(sep).join('/'); }
function readBound(path, limit = 2 * 1024 * 1024) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(piece => !piece || piece === '.' || piece === '..')) fail('unsafe path');
  let parent = ROOT;
  for (const piece of path.split('/')) { parent = join(parent, piece); if (lstatSync(parent).isSymbolicLink()) fail('symlink'); }
  const fd = openSync(join(ROOT, path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(limit)) fail('bounded regular file');
    const body = Buffer.alloc(Number(before.size) + 1); let at = 0;
    while (at < body.length) { const count = readSync(fd, body, at, body.length - at, null); if (!count) break; at += count; }
    const after = fstatSync(fd, { bigint: true }), named = lstatSync(join(ROOT, path), { bigint: true });
    if (at !== Number(before.size) || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key] || after[key] !== named[key])) fail('file changed while read');
    return body.subarray(0, at);
  } finally { closeSync(fd); }
}
function verifiedPairs() {
  const inventoryBytes = readBound(INVENTORY), adapterBytes = readBound(ADAPTER), reviewBytes = readBound(REVIEW);
  let inventory, review;
  try { inventory = JSON.parse(inventoryBytes); review = JSON.parse(reviewBytes); } catch { fail('malformed JSON'); }
  if (!same(inventory, proposal)) fail('imported proposal differs from actual current bytes');
  exactKeys(inventory, ['schema_version', 'kind', 'status', 'groups', 'pairs'], 'inventory shape');
  if (inventory.schema_version !== 1 || inventory.kind !== 'mw3-exact-source-pair-proposal' || inventory.status !== 'unapproved-proposal' || !same(inventory.groups, GROUPS)) fail('inventory scope');
  exactKeys(review, ['schema_version', 'kind', 'status', 'scope', 'reviewer', 'reviewer_model', 'reviewer_task', 'inventory_sha256', 'adapter_sha256', 'pairs', 'evidence'], 'review shape');
  if (review.schema_version !== 1 || review.kind !== 'mw3-independent-source-compatibility-review' || review.status !== 'approved' || review.scope !== 'source-only-no-strategy-or-runtime-renewal' ||
      review.reviewer_model !== 'gpt-6-astra' || typeof review.reviewer_task !== 'string' || !review.reviewer_task.trim() || typeof review.reviewer !== 'string' || !review.reviewer.trim() || review.inventory_sha256 !== sha(inventoryBytes) || review.adapter_sha256 !== sha(adapterBytes)) fail('independent review binding');
  if (!Array.isArray(inventory.pairs) || inventory.pairs.length !== KEYS.length || !Array.isArray(review.pairs) || review.pairs.length !== KEYS.length) fail('closed pair inventory');
  if (!Array.isArray(review.evidence) || review.evidence.length !== 3 || !same(review.evidence.map(row => [row.kind, row.path]), EVIDENCE)) fail('complete review evidence');
  for (const record of review.evidence) {
    exactKeys(record, ['kind', 'path', 'bytes', 'sha256'], 'evidence record');
    if (!record.path.startsWith('apps/frontend/docs/mw3-source-identity/') || !record.path.endsWith('.json') || !SHA.test(record.sha256) || !Number.isSafeInteger(record.bytes) || record.bytes < 1) fail('evidence path or digest');
    const bytes = readBound(record.path); if (bytes.length !== record.bytes || sha(bytes) !== record.sha256) fail('evidence changed');
  }
  const pairs = new Map(), records = [];
  for (const [index, key] of KEYS.entries()) {
    const pair = inventory.pairs[index], accepted = review.pairs[index];
    exactKeys(pair, ['historical_key', 'current_path', 'classification', 'current_bytes', 'current_sha256', 'historical_bytes', 'historical_sha256', 'historical_source'], 'pair shape');
    const classification = GATE_KEYS.has(key) ? 'identity-wiring-amendment' : 'exact-executable-parity';
    if (pair.historical_key !== key || pair.current_path !== currentPath(key) || pair.classification !== classification || typeof pair.historical_source !== 'string' ||
        !SHA.test(pair.current_sha256) || !SHA.test(pair.historical_sha256) || !Number.isSafeInteger(pair.current_bytes) || pair.current_bytes < 1 || !Number.isSafeInteger(pair.historical_bytes) || pair.historical_bytes < 1) fail('exact pair scope');
    const { historical_source, ...binding } = pair;
    if (!same(accepted, binding)) fail('reviewed exact pair differs');
    const historical = Buffer.from(historical_source, 'utf8'), current = readBound(pair.current_path);
    if (historical.length !== pair.historical_bytes || sha(historical) !== pair.historical_sha256 || current.length !== pair.current_bytes || sha(current) !== pair.current_sha256 ||
        !Buffer.from(current.toString('utf8'), 'utf8').equals(current)) fail('pair raw bytes');
    pairs.set(key, { historical: historical_source, current: current.toString('utf8') });
    records.push({ path: pair.current_path, bytes: current.length, sha256: sha(current) });
  }
  return { pairs, currentRecords: records.sort((a, b) => a.path.localeCompare(b.path)), inventorySha256: sha(inventoryBytes), reviewSha256: sha(reviewBytes) };
}
// Only saved-archive consumers use historicalHash. Fresh authoring gates use
// mw3CurrentVerificationHash, preventing new evidence under an archived identity.
export function mw3CompatibilityIdentity(group) {
  if (!Object.hasOwn(GROUPS, group)) fail('unknown group');
  const result = verifiedPairs(), keys = GROUPS[group];
  const historicalHash = objectHash(Object.fromEntries(keys.map(key => [key, result.pairs.get(key).historical])));
  const currentRawHash = objectHash(Object.fromEntries(keys.map(key => [key, result.pairs.get(key).current])));
  return Object.freeze({ historicalHash, currentRawHash, currentSourcesSha256: objectHash(result.currentRecords), inventorySha256: result.inventorySha256, reviewSha256: result.reviewSha256 });
}
export function mw3CurrentVerificationHash(group) {
  if (!['pilot', 'authored'].includes(group)) fail('unknown gate group');
  return mw3CompatibilityIdentity(group).currentRawHash;
}
export const MW3_CURRENT_IDENTITY_PATHS = Object.freeze(KEYS.map(currentPath));
export const MW3_COMPATIBILITY_SOURCE_PATHS = Object.freeze([ADAPTER, INVENTORY, REVIEW, ...EVIDENCE.map(([, path]) => path)]);
