// Captured, bundled localhost-only MW3 API phase. The Python subreaper owns
// Wrangler and all descendants. This controller never sends process signals.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { restoreMw3PolicyParts } from '../postflop-ai/mw3-delivery.mjs';
import { localEnvironment, assertWranglerLauncherAttestation, wranglerDevArguments, assertWranglerWorkerProcess } from './mw3-local-command.mjs';
import { assertRegistryMode, assertApiPhase, registryHealth, apiPhaseRows } from './mw3-registry-mode.mjs';
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
export function captureLiveWorkerProcess(identity) {
  const live_before = assertLiveIdentity(identity);
  const executable = readlinkSync(`/proc/${identity.pid}/exe`), cwd = readlinkSync(`/proc/${identity.pid}/cwd`);
  const commandBytes = readFileSync(`/proc/${identity.pid}/cmdline`);
  assert.equal(commandBytes.at(-1), 0, 'Worker argv is not NUL terminated');
  const argv = commandBytes.toString('utf8').slice(0, -1).split('\0');
  return { worker_identity: identity, live_before, executable, argv, cwd, live_after: assertLiveIdentity(identity) };
}
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function expectFailure(url, status, error, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('etag'), null);
  if (status === 405) assert.equal(response.headers.get('allow'), 'GET');
}
export async function assertApiRestoration(origin, prepared) {
  const contract = prepared.registryContract ?? { mode: 'empty', entries: 0 }, mode = assertRegistryMode(contract.mode);
  const base = mode === 'empty' ? '/__mw3_local_oracle/v1/mw3' : '/v1/mw3';
  const probe = prepared.probe ?? null;
  assert.ok(!probe || mode === 'activated', 'Empty mode does not accept corruption phases');
  if (mode === 'activated') {
    registryHealth(contract);
    assert.match(contract.unknown_hash, /^[a-f0-9]{64}$/); assert.match(prepared.databaseOnlyHash, /^[a-f0-9]{64}$/);
    for (const hash of [contract.unknown_hash, prepared.databaseOnlyHash]) {
      for (const path of ['manifest', 'part']) {
        const url = `${origin}${base}/${path}?delivery=${hash}${path === 'part' ? '&part=0' : ''}`;
        await expectFailure(url, 404, 'unpublished_delivery');
        await expectFailure(url, 404, 'unpublished_delivery', { headers: { 'if-none-match': '*' } });
      }
    }
    // Activated public proof never falls back to receipt-injected local pins.
    await expectFailure(`${origin}/__mw3_local_oracle/v1/mw3/manifest?delivery=${prepared.deliveries[0].deliveryHash}`, 404, 'not_found');
  }
  for (const delivery of prepared.deliveries) {
    const query = `delivery=${delivery.deliveryHash}`, actual = `${origin}/v1/mw3/manifest?${query}`;
    if (mode === 'empty') {
      const sealed = await fetch(actual, { signal: AbortSignal.timeout(5000) });
      assert.equal(sealed.status, 404, 'D1 rows must never bypass the actual empty build registry');
      assert.equal((await sealed.json()).error, 'unpublished_delivery');
    }
    const manifestUrl = `${origin}${base}/manifest?${query}`, corrupt = probe?.delivery_hash === delivery.deliveryHash ? probe : null;
    if (corrupt?.kind === 'header') {
      for (const url of [manifestUrl, `${origin}${base}/part?${query}&part=0`]) {
        await expectFailure(url, 503, 'delivery_unavailable');
        await expectFailure(url, 503, 'delivery_unavailable', { headers: { 'if-none-match': '*' } });
      }
    } else {
      const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); assert.equal(await response.text(), delivery.headerText);
      assert.equal(response.headers.get('etag'), `"${delivery.deliveryHash}"`);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control'), /must-revalidate/);
      const unchanged = await fetch(manifestUrl, { headers: { 'if-none-match': `W/"${delivery.deliveryHash}"` }, signal: AbortSignal.timeout(5000) });
      assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
      const parts = [];
      for (const expected of delivery.parts) {
        const url = `${origin}${base}/part?${query}&part=${expected.part}`;
        if (corrupt?.kind === 'part' && corrupt.part === expected.part) {
          await expectFailure(url, 503, 'delivery_unavailable');
          await expectFailure(url, 503, 'delivery_unavailable', { headers: { 'if-none-match': '*' } });
          continue;
        }
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200);
        const text = await response.text(), row = JSON.parse(text);
        assert.deepEqual(row, { part: expected.part, body: expected.body });
        assert.equal(sha256(row.body), expected.bodyHash);
        assert.equal(response.headers.get('etag'), `"${sha256(text)}"`);
        if (mode === 'activated') { assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.match(response.headers.get('cache-control'), /must-revalidate/); }
        const unchanged = await fetch(url, { headers: { 'if-none-match': response.headers.get('etag') }, signal: AbortSignal.timeout(5000) });
        assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
        parts.push(row);
      }
      if (!corrupt) {
        const policy = await restoreMw3PolicyParts(delivery.header.manifest, parts);
        const expected = prepared.snapshot.candidates[delivery.stage === 'flop' ? 'candidate' : 'laterCandidate'].policy;
        assert.deepEqual(policy, expected, 'API-restored strategy differs from exact saved candidate');
        const absent = await fetch(`${origin}${base}/part?${query}&part=${delivery.parts.length}`, { signal: AbortSignal.timeout(5000) });
        assert.equal(absent.status, 404); assert.equal((await absent.json()).error, 'part_not_found');
      } else assert.equal(parts.length, delivery.parts.length - 1, 'Only the exact corrupted final part may be unavailable');
    }
    if (mode === 'activated') {
      for (const extra of ['&approved=true', '&stage=flop', '&part=0', '&delivery=' + delivery.deliveryHash]) await expectFailure(manifestUrl + extra, 400, 'invalid_query');
      for (const part of ['', '-1', '00', '1.0', '1e1', '10000', '0&part=0']) await expectFailure(`${origin}${base}/part?${query}&part=${part}`, 400, 'invalid_query');
      for (const method of ['PUT', 'DELETE']) await expectFailure(manifestUrl, 405, 'method_not_allowed', { method, body: 'cannot-authorize' });
      const head = await fetch(manifestUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      assert.equal(head.status, 405); assert.equal(head.headers.get('allow'), 'GET'); assert.equal(await head.text(), '');
    } else {
      const invalid = await fetch(`${manifestUrl}&delivery=${delivery.deliveryHash}`, { signal: AbortSignal.timeout(5000) });
      assert.equal(invalid.status, 400);
    }
    // Keep POST as the genuinely final response of each delivery, preserving
    // the existing final-worker-death fixtures and owner acceptance predicates.
    const post = await fetch(manifestUrl, { method: 'POST', ...(mode === 'activated' ? { body: 'cannot-authorize' } : {}), signal: AbortSignal.timeout(5000) });
    assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET');
    if (mode === 'activated') { assert.deepEqual(await post.json(), { error: 'method_not_allowed' }); assert.equal(post.headers.get('cache-control'), 'no-store'); assert.equal(post.headers.get('etag'), null); }
  }
  return apiPhaseRows(prepared, probe);
}

export function assertApiInputLedger(directory, ledger) {
  assert.equal(ledger?.schema_version, 1);
  const phase = /^api-phase-([0-3])$/.exec(ledger.command_id); assert.ok(phase);
  const mode = assertRegistryMode(ledger.registry_mode); assertApiPhase(mode, Number(phase[1]));
  const expectedPath = Number(phase[1]) < 2 ? 'api.expected.json' : `${ledger.command_id}.expected.json`;
  assert.equal(ledger.expected_path ?? 'api.expected.json', expectedPath);
  assert.equal(ledger.local_only, true);
  if (ledger.wrangler_launcher != null) assertWranglerLauncherAttestation(ledger.wrangler_launcher, ledger.wrangler);
  assert.ok(Array.isArray(ledger.files) && ledger.files.length === 5);
  assert.deepEqual(ledger.files.map(row => row.path).sort(),
    ['api.control.bundle.mjs', expectedPath, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py', 'worker-runtime/worker.bundle.mjs', 'wrangler.json'].sort());
  for (const row of ledger.files) {
    const body = readFileSync(join(directory, row.path));
    assert.deepEqual(digest(body), { bytes: row.bytes, sha256: row.sha256 }, `API input changed: ${row.path}`);
  }
  const runtime = join(directory, 'worker-runtime');
  assert.ok(lstatSync(runtime).isDirectory() && !lstatSync(runtime).isSymbolicLink(), 'Worker runtime must be a private real directory');
  assert.deepEqual(readdirSync(runtime), ['worker.bundle.mjs'], 'Worker module root contains an unledgered file');
  assert.ok(lstatSync(join(runtime, 'worker.bundle.mjs')).isFile() && !lstatSync(join(runtime, 'worker.bundle.mjs')).isSymbolicLink(), 'Worker bundle must be a regular ledger-bound file');
  const config = JSON.parse(readFileSync(join(directory, 'wrangler.json'), 'utf8'));
  assert.deepEqual(config, { name: 'reysonai-mw3-local-verification', main: './worker-runtime/worker.bundle.mjs', no_bundle: true, find_additional_modules: false,
    compatibility_date: '2026-09-01', send_metrics: false, dev: { ip: '127.0.0.1', local_protocol: 'http' },
    d1_databases: [{ binding: 'MW3_LOCAL_VERIFY', database_name: 'reysonai-mw3-local-verification', database_id: '00000000-0000-0000-0000-000000000000' }] });
}
export async function runApiOracle(directory, ledgerPath, { beforeCompletionForTest = null } = {}) {
  assert.equal(process.platform, 'linux');
  const ledgerBytes = readFileSync(ledgerPath), ledger = JSON.parse(ledgerBytes);
  assertApiInputLedger(directory, ledger);
  const expected = JSON.parse(readFileSync(join(directory, ledger.expected_path ?? 'api.expected.json'), 'utf8'));
  const mode = assertRegistryMode(ledger.registry_mode), phase = Number(ledger.command_id.slice(-1));
  assert.equal(expected.registryContract?.mode ?? 'empty', mode);
  assert.deepEqual(expected.probe ?? null, phase < 2 ? null : { kind: phase === 2 ? 'header' : 'part', delivery_hash: expected.deliveries[1].deliveryHash, ...(phase === 3 ? { part: expected.deliveries[1].parts.at(-1).part } : {}) });
  const expectedHealth = registryHealth(expected.registryContract ?? { mode: 'empty', entries: 0 });
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  const launcherPrelaunch = ledger.wrangler_launcher == null ? null : assertWranglerLauncherAttestation(ledger.wrangler_launcher, ledger.wrangler);
  const args = wranglerDevArguments(directory, ledger.wrangler, port);
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
      if (response.status === 200) { assert.deepEqual(await response.json(), expectedHealth); healthy = true; break; }
    } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
    await sleep(100);
  }
  assert.ok(healthy, 'Pinned local worker did not become ready');
  const rows = await assertApiRestoration(origin, expected);
  assert.ok(!spawnError && worker.exitCode === null && worker.signalCode === null, 'Worker exited during API proof');
  assertApiInputLedger(directory, ledger);
  assert.deepEqual(readFileSync(ledgerPath), ledgerBytes, 'API ledger changed during phase');
  const launcherCompletion = ledger.wrangler_launcher == null ? null : assertWranglerLauncherAttestation(ledger.wrangler_launcher, ledger.wrangler);
  const workerProcess = captureLiveWorkerProcess(workerIdentity);
  assertWranglerWorkerProcess(workerProcess, directory, ledger.wrangler, workerIdentity);
  const liveWorker = workerProcess.live_after;
  // Fault injection is an in-process test API only; no CLI/JSON option accepts
  // it. Downstream owner evidence must reject a death during this exact gap.
  beforeCompletionForTest?.({ worker_identity: workerIdentity });
  writeFileSync(join(directory, `${ledger.command_id}.complete.json`), JSON.stringify({ schema_version: 1,
    command_id: ledger.command_id, controller_identity: controllerIdentity, worker_identity: workerIdentity, live_worker_before_completion: liveWorker, local_only: true, success: true,
    input_ledger: digest(ledgerBytes), worker_runtime: { launcher_prelaunch: launcherPrelaunch, launcher_completion: launcherCompletion, process: workerProcess }, rows }), { flag: 'wx' });
  // Deliberate normal controller completion. The anchored owner cleans/reaps the
  // worker before parent inspection/restart. No positive or negative PID kills.
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, 'Required: captured controller DIRECTORY LEDGER');
  runApiOracle(resolve(process.argv[2]), resolve(process.argv[3])).then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
}
