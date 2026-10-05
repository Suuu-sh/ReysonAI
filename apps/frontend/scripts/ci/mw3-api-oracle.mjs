// Captured, bundled localhost-only MW3 API phase. The Python subreaper owns
// Wrangler and all descendants. This controller never sends process signals.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { restoreMw3PolicyParts } from '../postflop-ai/mw3-delivery.mjs';
import { localEnvironment } from './mw3-local-command.mjs';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = bytes => ({ bytes: bytes.length, sha256: sha256(bytes) });
export function processIdentity(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'), fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
  const start_ticks = Number(fields[19]); assert.ok(Number.isSafeInteger(pid) && pid > 1 && Number.isSafeInteger(start_ticks) && start_ticks > 0);
  return { pid, start_ticks };
}
export function assertLiveIdentity(identity) {
  const stat = readFileSync(`/proc/${identity.pid}/stat`, 'utf8'), fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
  assert.equal(Number(fields[19]), identity.start_ticks, 'Worker birth changed before completion');
  assert.ok(!['Z', 'X', 'x'].includes(fields[0]), 'Worker died before completion');
  return { ...identity, state: fields[0] };
}
const sleep = ms => new Promise(done => setTimeout(done, ms));
export async function assertApiRestoration(origin, prepared) {
  const rows = [];
  for (const delivery of prepared.deliveries) {
    const query = `delivery=${delivery.deliveryHash}`, actual = `${origin}/v1/mw3/manifest?${query}`;
    const sealed = await fetch(actual, { signal: AbortSignal.timeout(5000) });
    assert.equal(sealed.status, 404, 'D1 rows must never bypass the actual empty build registry');
    assert.equal((await sealed.json()).error, 'unpublished_delivery');
    const manifestUrl = `${origin}/__mw3_local_oracle/v1/mw3/manifest?${query}`;
    const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200); assert.equal(await response.text(), delivery.headerText);
    assert.equal(response.headers.get('etag'), `"${delivery.deliveryHash}"`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('cache-control'), /must-revalidate/);
    const unchanged = await fetch(manifestUrl, { headers: { 'if-none-match': `W/"${delivery.deliveryHash}"` }, signal: AbortSignal.timeout(5000) });
    assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
    const parts = [];
    for (const expected of delivery.parts) {
      const url = `${origin}/__mw3_local_oracle/v1/mw3/part?${query}&part=${expected.part}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      const text = await response.text(), row = JSON.parse(text);
      assert.deepEqual(row, { part: expected.part, body: expected.body });
      assert.equal(sha256(row.body), expected.bodyHash);
      assert.equal(response.headers.get('etag'), `"${sha256(text)}"`);
      const unchanged = await fetch(url, { headers: { 'if-none-match': response.headers.get('etag') }, signal: AbortSignal.timeout(5000) });
      assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
      parts.push(row);
    }
    const policy = await restoreMw3PolicyParts(delivery.header.manifest, parts);
    const expected = prepared.snapshot.candidates[delivery.stage === 'flop' ? 'candidate' : 'laterCandidate'].policy;
    assert.deepEqual(policy, expected, 'API-restored strategy differs from exact saved candidate');
    const absent = await fetch(`${origin}/__mw3_local_oracle/v1/mw3/part?${query}&part=${delivery.parts.length}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(absent.status, 404); assert.equal((await absent.json()).error, 'part_not_found');
    const invalid = await fetch(`${manifestUrl}&delivery=${delivery.deliveryHash}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(invalid.status, 400);
    const post = await fetch(manifestUrl, { method: 'POST', signal: AbortSignal.timeout(5000) });
    assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET');
    rows.push({ stage: delivery.stage, delivery_hash: delivery.deliveryHash, restored_policy_sha256: sha256(JSON.stringify(policy)), parts: parts.length });
  }
  return rows;
}

export function assertApiInputLedger(directory, ledger) {
  assert.equal(ledger?.schema_version, 1);
  assert.match(ledger.command_id, /^api-phase-[01]$/);
  assert.equal(ledger.local_only, true);
  assert.ok(Array.isArray(ledger.files) && ledger.files.length === 5);
  assert.deepEqual(ledger.files.map(row => row.path).sort(),
    ['api.control.bundle.mjs', 'api.expected.json', 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py', 'worker.bundle.mjs', 'wrangler.json']);
  for (const row of ledger.files) {
    const body = readFileSync(join(directory, row.path));
    assert.deepEqual(digest(body), { bytes: row.bytes, sha256: row.sha256 }, `API input changed: ${row.path}`);
  }
  const config = JSON.parse(readFileSync(join(directory, 'wrangler.json'), 'utf8'));
  assert.deepEqual(config, { name: 'reysonai-mw3-local-verification', main: './worker.bundle.mjs', no_bundle: true,
    compatibility_date: '2026-09-01', send_metrics: false, dev: { ip: '127.0.0.1', local_protocol: 'http', watch: false },
    d1_databases: [{ binding: 'MW3_LOCAL_VERIFY', database_name: 'reysonai-mw3-local-verification', database_id: '00000000-0000-0000-0000-000000000000' }] });
}
export async function runApiOracle(directory, ledgerPath, { beforeCompletionForTest = null } = {}) {
  assert.equal(process.platform, 'linux');
  const ledgerBytes = readFileSync(ledgerPath), ledger = JSON.parse(ledgerBytes);
  assertApiInputLedger(directory, ledger);
  const expected = JSON.parse(readFileSync(join(directory, 'api.expected.json'), 'utf8'));
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  const args = [ledger.wrangler, 'dev', '--local', '--config', join(directory, 'wrangler.json'), '--persist-to', join(directory, 'state'),
    '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--show-interactive-dev-session=false'];
  writeFileSync(join(directory, `${ledger.command_id}.worker-command.json`), JSON.stringify({ command: process.execPath, args }), { flag: 'wx' });
  const worker = spawn(process.execPath, args, { cwd: directory, env: localEnvironment(directory), stdio: ['ignore', 'inherit', 'inherit'] });
  let spawnError; worker.once('error', error => { spawnError = error; });
  // An unreferenced ChildProcess cannot keep the controller alive after proof.
  // Inherited bounded streams belong to the outer owner, including teardown.
  worker.unref();
  const controllerIdentity = processIdentity(process.pid), workerIdentity = processIdentity(worker.pid);
  const origin = `http://127.0.0.1:${port}`, deadline = Date.now() + 90_000;
  let healthy = false;
  while (Date.now() < deadline) {
    assert.ok(!spawnError, `Wrangler spawn failed: ${spawnError?.message}`);
    assert.ok(worker.exitCode === null && worker.signalCode === null, 'Wrangler exited before/during health verification');
    try {
      const response = await fetch(`${origin}/__mw3_verify_health`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { assert.deepEqual(await response.json(), { local_only: true, registry_entries: 0 }); healthy = true; break; }
    } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
    await sleep(100);
  }
  assert.ok(healthy, 'Pinned local worker did not become ready');
  const rows = await assertApiRestoration(origin, expected);
  assert.ok(!spawnError && worker.exitCode === null && worker.signalCode === null, 'Worker exited during API proof');
  assertApiInputLedger(directory, ledger);
  assert.deepEqual(readFileSync(ledgerPath), ledgerBytes, 'API ledger changed during phase');
  const liveWorker = assertLiveIdentity(workerIdentity);
  // Fault injection is an in-process test API only; no CLI/JSON option accepts
  // it. Downstream owner evidence must reject a death during this exact gap.
  beforeCompletionForTest?.({ worker_identity: workerIdentity });
  writeFileSync(join(directory, `${ledger.command_id}.complete.json`), JSON.stringify({ schema_version: 1,
    command_id: ledger.command_id, controller_identity: controllerIdentity, worker_identity: workerIdentity, live_worker_before_completion: liveWorker, local_only: true, success: true,
    input_ledger: digest(ledgerBytes), rows }), { flag: 'wx' });
  // Deliberate normal controller completion. The anchored owner cleans/reaps the
  // worker before parent inspection/restart. No positive or negative PID kills.
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, 'Required: captured controller DIRECTORY LEDGER');
  runApiOracle(resolve(process.argv[2]), resolve(process.argv[3])).then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
}
