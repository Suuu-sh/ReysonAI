// Production delivery of existing independently accepted bytes only. This entry
// never authors estimates, changes a receipt/pin, deletes rows, or reads secrets.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MW3_REPOSITORY, verifyMw3Snapshot } from './postflop-ai/mw3-reviewed-snapshot.mjs';
import { verifyMw3SavedInventory, discoverMw3SavedInventory, assertMw3CommittedFile, parseMw3ApprovedRegistry } from './postflop-ai/mw3-reviewed-restore.mjs';
import { prepareMw3SnapshotDeliveries, buildMw3DeliverySql, mw3DeliveryPins } from './postflop-ai/mw3-reviewed-delivery.mjs';
import { restoreMw3PolicyParts } from './postflop-ai/mw3-delivery.mjs';
import { buildMw3BrowserInputs, verifyMw3BrowserCandidate } from './postflop-ai/mw3-browser-inputs.mjs';
import { clearMw3ContractCache } from './postflop-ai/mw3-artifacts.mjs';
import { sha256 } from './postflop-ai/mw3-reviewed-archive.mjs';

const ROOT = MW3_REPOSITORY;
const SCHEMA = 'apps/backend/scripts/sql/mw3-schema.sql';
const REGISTRY = 'apps/shared/mw3-approved.ts';
const OUT = join(ROOT, 'apps/frontend/.local/mw3-production');
const tables = ['mw3_policy_deliveries', 'mw3_policy_parts'];
const origin = 'https://app.reysonai.com', api = 'https://api.reysonai.com';
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const git = args => execFileSync('git', ['--no-replace-objects', ...args], { cwd: ROOT, encoding: 'utf8' }).trim();

export async function prepareProductionPlan() {
  // Global verification completes before returning any write-capable plan.
  const verified = await verifyMw3SavedInventory();
  assert.equal(verified.accepted_pairs, 16); assert.equal(verified.registered_pairs, 16);
  const pins = parseMw3ApprovedRegistry(readFileSync(join(ROOT, REGISTRY)));
  assert.equal(pins.length, 32);
  const schema = readFileSync(join(ROOT, SCHEMA));
  assertMw3CommittedFile(ROOT, SCHEMA, schema);
  const entries = [];
  for (const entry of discoverMw3SavedInventory(ROOT)) {
    const snapshot = verifyMw3Snapshot(readFileSync(join(ROOT, entry.manifest)), readFileSync(join(ROOT, entry.archive)));
    const review = JSON.parse(readFileSync(join(ROOT, entry.receipt), 'utf8'));
    const deliveries = await prepareMw3SnapshotDeliveries(snapshot);
    const sql = readFileSync(join(ROOT, entry.sql));
    assertMw3CommittedFile(ROOT, entry.sql, sql);
    assert.equal(sql.toString('utf8'), buildMw3DeliverySql(snapshot, review, deliveries), `Committed SQL differs: ${entry.slug}`);
    for (const pin of mw3DeliveryPins(snapshot, deliveries)) assert.deepEqual(pins.find(p => p.deliveryHash === pin.deliveryHash), pin);
    entries.push({ path: entry.sql, sha256: sha256(sql), bytes: sql.length, deliveries });
    clearMw3ContractCache();
  }
  assert.equal(entries.length, 16);
  const summary = { github_sha: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']),
    schema: { path: SCHEMA, sha256: sha256(schema) }, spots: entries.length, deliveries: pins.length,
    parts: entries.reduce((n, e) => n + e.deliveries.reduce((m, d) => m + d.parts.length, 0), 0),
    sql: entries.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })), pins };
  return { entries, schema, summary };
}

// Present immutable rows must match byte-for-byte. Missing or partial matching
// deliveries can resume; any conflicting header/part stops before the first write.
export function assertExistingDelivery(expected, headers, parts, complete = false) {
  assert.ok(Array.isArray(headers) && headers.length <= 1, 'Duplicate/invalid MW3 headers');
  if (headers.length) assert.deepEqual(headers[0], { spot_id: expected.header.manifest.spotId, stage: expected.stage, header_json: expected.headerText }, 'Conflicting immutable MW3 header');
  assert.ok(Array.isArray(parts) && parts.length <= expected.parts.length, 'Unexpected MW3 parts');
  const seen = new Set();
  for (const row of parts) {
    assert.ok(Number.isInteger(row.part) && !seen.has(row.part) && expected.parts[row.part], 'Unexpected/duplicate MW3 part');
    seen.add(row.part); assert.deepEqual(row, { part: row.part, body: expected.parts[row.part].body }, 'Conflicting immutable MW3 part');
  }
  const isComplete = headers.length === 1 && parts.length === expected.parts.length;
  if (complete) assert.ok(isComplete, 'Incomplete published MW3 delivery');
  return isComplete;
}

export async function ensureMw3Published(plan, io) {
  const existing = await io.tables();
  assert.ok(existing.every(t => tables.includes(t)) && new Set(existing).size === existing.length);
  await io.checkSchema(existing);
  const pending = [];
  for (const entry of plan.entries) {
    let complete = true;
    for (const delivery of entry.deliveries) {
      const headers = existing.includes(tables[0]) ? await io.headers(delivery) : [];
      const parts = existing.includes(tables[1]) ? await io.parts(delivery) : [];
      complete = assertExistingDelivery(delivery, headers, parts) && complete;
    }
    if (!complete) pending.push(entry);
  }
  // No writes/bookmark until every existing approved row passed preflight.
  if (pending.length || existing.length !== 2) {
    await io.bookmark();
    if (existing.length !== 2) await io.schema();
    await io.checkSchema(tables);
    for (const entry of pending) await io.import(entry);
  }
  for (const entry of plan.entries) for (const delivery of entry.deliveries)
    assertExistingDelivery(delivery, await io.headers(delivery), await io.parts(delivery), true);
  return { imported_spots: pending.length, verified_deliveries: plan.summary.deliveries, verified_parts: plan.summary.parts };
}

export function assertProductionContext(env, head) {
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.ok(['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME));
  assert.match(head, /^[a-f0-9]{40}$/); assert.equal(env.GITHUB_SHA, head);
}

function remoteIO(plan) {
  const run = args => execFileSync('npx', ['--yes', 'wrangler@4.147.0', ...args], {
    cwd: join(ROOT, 'apps/backend'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  const query = sql => {
    const value = JSON.parse(run(['d1', 'execute', 'reysonai', '--remote', '--config', 'wrangler.jsonc', '--json', '--command', sql]));
    assert.ok(Array.isArray(value) && value.length === 1 && value[0].success && Array.isArray(value[0].results), 'Invalid D1 response');
    return value[0].results;
  };
  const exactFile = (path, hash) => {
    const bytes = readFileSync(join(ROOT, path)); assert.equal(sha256(bytes), hash); assertMw3CommittedFile(ROOT, path, bytes);
    return run(['d1', 'execute', 'reysonai', '--remote', '--yes', '--config', 'wrangler.jsonc', '--file', join(ROOT, path)]);
  };
  const columns = {
    mw3_policy_deliveries: [['delivery_hash','TEXT',0,1],['spot_id','TEXT',1,0],['stage','TEXT',1,0],['header_json','TEXT',1,0]],
    mw3_policy_parts: [['delivery_hash','TEXT',1,1],['part','INTEGER',1,2],['body','TEXT',1,0]],
  };
  return {
    tables: () => query("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('mw3_policy_deliveries','mw3_policy_parts') ORDER BY name").map(r => r.name),
    checkSchema: names => { for (const name of names) {
      assert.deepEqual(query(`PRAGMA table_info(${name})`).map(r => [r.name,r.type,r.notnull,r.pk]), columns[name], 'Existing MW3 schema differs');
      if (name === 'mw3_policy_parts') assert.deepEqual(query('PRAGMA foreign_key_list(mw3_policy_parts)').map(r => [r.table,r.from,r.to]), [['mw3_policy_deliveries','delivery_hash','delivery_hash']]);
    } },
    headers: d => query(`SELECT spot_id, stage, header_json FROM mw3_policy_deliveries WHERE delivery_hash='${d.deliveryHash}'`),
    parts: d => query(`SELECT part, body FROM mw3_policy_parts WHERE delivery_hash='${d.deliveryHash}' ORDER BY part`),
    bookmark: () => writeFileSync(join(OUT, 'before-import-bookmark.json'), run(['d1', 'time-travel', 'info', 'reysonai', '--config', 'wrangler.jsonc', '--json'])),
    schema: () => exactFile(SCHEMA, plan.summary.schema.sha256),
    import: entry => { writeFileSync(join(OUT, 'import-outcome.json'), json({ state: 'spot-import-started-outcome-unconfirmed', spot_sql: entry.path, ...plan.summary })); exactFile(entry.path, entry.sha256); },
  };
}

const assertCors = response => {
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
};
export async function verifyMw3Live(plan, fetcher = fetch) {
  const request = (path, options = {}) => fetcher(`${api}${path}`, { ...options,
    headers: { Accept: 'application/json', Origin: origin, ...options.headers }, signal: AbortSignal.timeout(15000) });
  const datasets = {};
  for (const name of ['opening-ranges', 'preflop-ranges', 'multiway-responses']) {
    const response = await request(`/v1/preflop/datasets/${name}`); assertCors(response); assert.equal(response.status, 200);
    datasets[name] = await response.json();
    assert.deepEqual(datasets[name], JSON.parse(readFileSync(join(ROOT, `apps/frontend/src/estimated/${name}.json`), 'utf8')), 'Live preflop source differs');
  }
  let count = 0;
  for (const entry of plan.entries) for (const delivery of entry.deliveries) {
    const pin = plan.summary.pins.find(p => p.deliveryHash === delivery.deliveryHash);
    const inputs = await buildMw3BrowserInputs(pin.spotId, datasets);
    assert.equal(inputs.fingerprint, pin.sourceHash, 'Actual live consumer preflop fingerprint differs');
    const path = `/v1/mw3/manifest?delivery=${delivery.deliveryHash}`;
    const response = await request(path); assertCors(response); assert.equal(response.status, 200);
    const text = await response.text(); assert.equal(text, delivery.headerText); assert.equal(sha256(text), delivery.deliveryHash);
    assert.equal(response.headers.get('etag'), `"${delivery.deliveryHash}"`);
    const cached = await request(path, { headers: { 'If-None-Match': `"${delivery.deliveryHash}"` } }); assertCors(cached); assert.equal(cached.status, 304);
    const parts = [];
    for (let offset = 0; offset < delivery.parts.length; offset += 8) {
      const batch = await Promise.all(delivery.parts.slice(offset, offset + 8).map(async part => {
        const fetched = await request(`/v1/mw3/part?delivery=${delivery.deliveryHash}&part=${part.part}`);
        assertCors(fetched); assert.equal(fetched.status, 200);
        const body = await fetched.json(); assert.deepEqual(body, { part: part.part, body: part.body });
        assert.equal(sha256(body.body), delivery.header.partHashes[part.part]); return body;
      }));
      parts.push(...batch); count += batch.length;
    }
    await restoreMw3PolicyParts(delivery.header.manifest, parts);
    await verifyMw3BrowserCandidate(inputs, { metadata: delivery.header.metadata, manifest: delivery.header.manifest, parts }, {
      stage: pin.stage, expectedImplementationHash: pin.implementationHash, expectedPolicyHash: pin.policyHash,
    });
  }
  const pin = plan.entries[0].deliveries[0].deliveryHash;
  for (const [path, status, error, method] of [
    [`/v1/mw3/manifest?delivery=${'0'.repeat(64)}`,404,'unpublished_delivery'],
    [`/v1/mw3/manifest?delivery=${pin}&extra=1`,400,'invalid_query'],
    [`/v1/mw3/manifest?delivery=${pin}&delivery=${pin}`,400,'invalid_query'],
    [`/v1/mw3/part?delivery=${pin}&part=9999`,404,'part_not_found'],
    [`/v1/mw3/manifest?delivery=${pin}`,405,'method_not_allowed','POST'],
    ['/v1/fastfold/human/history',401,'sign_in_required'],
  ]) {
    const response = await request(path, { method: method ?? 'GET' }); assertCors(response);
    assert.equal(response.status, status); assert.equal((await response.json()).error, error);
  }
  const preflight = await request(`/v1/mw3/manifest?delivery=${pin}`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET' } });
  assertCors(preflight); assert.equal(preflight.status, 204);
  return { verified_deliveries: plan.summary.deliveries, verified_parts: count, live_preflop_source_fingerprints: 'all-16-passed',
    browser_candidate_contract: 'all-32-passed', public_cors: 'passed', anonymous_history: 'rejected', real_authenticated_browser: 'not-run' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3); const command = process.argv[2];
  assert.ok(['verify', 'import', 'live'].includes(command), 'Use only verify, import, or live');
  if (command === 'import') assertProductionContext(process.env, git(['rev-parse', 'HEAD']));
  const plan = await prepareProductionPlan(); mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'delivery-plan.json'), json(plan.summary));
  let result = { status: 'verified-existing-independent-acceptance', ...plan.summary };
  if (command === 'import') result = { status: 'published-mw3-full-d1-payload-verified', ...await ensureMw3Published(plan, remoteIO(plan)), ...plan.summary };
  if (command === 'live') result = { status: 'live-mw3-full-http-payload-verified', ...await verifyMw3Live(plan), ...plan.summary };
  writeFileSync(join(OUT, `${command}-outcome.json`), json(result)); console.log(json(result));
}
