// Opt-in actual installed Wrangler regression, using synthetic transport data
// and two ephemeral localhost registry pins only. Never real authoring,
// acceptance, a registry edit, a remote database, or a deployment.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { MW3_TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
import { prepareMw3SnapshotDeliveries, mw3DeliveryPins } from '../scripts/postflop-ai/mw3-reviewed-delivery.mjs';
import { sha256, jsonBytes } from '../scripts/postflop-ai/mw3-reviewed-archive.mjs';
import { assertApiInputLedger } from '../scripts/ci/mw3-api-oracle.mjs';
import { assertCompletedCommand, WRANGLER_LAUNCHER_PIN } from '../scripts/ci/mw3-local-command.mjs';
import { readRuntimePins, writeCapturedSources, bundleCapturedWorker, bundleCapturedApiControl, localConfig, localWorkerSource,
  runSupervisedCommand, runCapturedApiPhase, assertApiCompletion, completedJson, preservationSeed, UNRELATED_TABLES,
  databaseSnapshot, assertDeliveryRows, corruptionSetup, repairConflict } from '../scripts/ci/mw3-local-d1-oracle.mjs';
import { apiPhaseRows } from '../scripts/ci/mw3-registry-mode.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const quote = text => `'${String(text).replaceAll("'", "''")}'`;
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes), provenance: 'synthetic_actual_runtime_regression_only' });
async function syntheticPrepared() {
  const candidates = {};
  for (const [kind, streets] of [['candidate', ['flop']], ['laterCandidate', ['turn', 'river']]]) {
    const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: 'HJ_open_BTN_call_BB_call', streets,
      rules: streets.flatMap(street => MW3_TIERS.map(tier => ({ node: `mw3_${street}_first_first`, tier, priority: 0,
        when: { line: 'any', texture: 'any', players: 'any', position: 'any', response: 'any', price: 'any', spr: 'any' },
        mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 } }))) };
    candidates[kind] = { policy, metadata: { spot: policy.spot_id, source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64),
      policy_hash: sha256(JSON.stringify(policy)), author_task: 'synthetic-startup-fixture-never-real-policy' } };
  }
  const snapshot = { manifest: { source_tree: 'c'.repeat(40), spot: { id: 'HJ_open_BTN_call_BB_call', source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64),
    flop_policy_hash: candidates.candidate.metadata.policy_hash, later_policy_hash: candidates.laterCandidate.metadata.policy_hash },
    archive: { sha256: 'd'.repeat(64) }, content_sha256: 'e'.repeat(64) }, candidates };
  const deliveries = await prepareMw3SnapshotDeliveries(snapshot), pair = mw3DeliveryPins(snapshot, deliveries);
  const registry = Buffer.from(`// Synthetic test-only authority, never publication.\nexport const MW3_APPROVED_POLICIES = Object.freeze(${JSON.stringify(pair)});\n`);
  const registryContract = { mode: 'activated', entries: 2, source_sha256: sha256(registry), pins_sha256: sha256(JSON.stringify(pair)),
    subject_pair_sha256: sha256(JSON.stringify(pair)), subject_pair: pair, unknown_hash: sha256('synthetic startup unknown delivery') };
  return { snapshot, deliveries, registry, registryContract };
}
function captureSources(registry) {
  const files = new Map();
  function visit(path) {
    if (files.has(path)) return;
    const body = path === 'apps/shared/mw3-approved.ts' ? registry : readFileSync(join(root, path)); files.set(path, body);
    if (!/\.(mjs|js|ts)$/.test(path)) return;
    for (const match of body.toString().matchAll(/(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']/g)) {
      if (match[1].startsWith('.')) visit(relative(root, resolve(root, dirname(path), match[1])));
    }
  }
  for (const path of ['apps/frontend/scripts/ci/mw3-api-oracle.mjs', 'apps/frontend/scripts/ci/postflop-command-supervisor.py',
    'apps/backend/src/mw3-transport.ts', 'apps/shared/mw3-approved.ts']) visit(path);
  return { files, records: [...files].map(([path, bytes]) => record(path, bytes)) };
}
function findDatabase(directory) {
  const paths = [], visit = path => { for (const item of readdirSync(path, { withFileTypes: true })) {
    const next = join(path, item.name); if (item.isDirectory()) visit(next); else if (item.name.endsWith('.sqlite')) paths.push(next);
  } }; visit(directory);
  const found = paths.filter(path => inspect(path, db => db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name IN ('mw3_policy_deliveries','mw3_policy_parts','account_users')").get().n === 3));
  assert.equal(found.length, 1); return found[0];
}
function inspect(path, action) { const db = new DatabaseSync(path, { readOnly: true }); try { return action(db); } finally { db.close(); } }
function assert143MutationsFail(outcome, completion, ledgerBytes, rows) {
  const worker = completion.worker_identity;
  for (const change of [
    (o, c) => { c.worker_runtime.launcher_prelaunch.sha256 = '0'.repeat(64); },
    (o, c) => { c.worker_runtime.launcher_completion.package_version = '4.146.0'; },
    (o, c) => { c.worker_runtime.process.argv.splice(1, 0, '--require', '/tmp/unreviewed.cjs'); },
    (o, c) => { c.worker_runtime.process.argv.push('--remote'); },
    (o, c) => { c.worker_runtime.process.argv[3] = '--remote'; },
    (o, c) => { c.worker_runtime.process.argv[11] = '00080'; },
    (o, c) => { c.worker_runtime.process.cwd = dirname(c.worker_runtime.process.cwd); },
    (o, c) => { c.worker_runtime.process.executable = '/unreviewed/node'; },
    (o, c) => { c.worker_runtime.process.live_before.start_ticks++; },
    (o, c) => { c.worker_runtime.process.live_after.state = 'Z'; },
    (o, c) => { c.input_ledger.sha256 = '0'.repeat(64); },
    (o, c) => { c.success = false; },
    (o, c) => { c.rows.pop(); },
    o => { o.resource.actual_returncode = 143; },
    o => { o.purpose = 'command'; },
    o => { o.resource.timed_out = true; },
    o => { o.wrapper.error = { code: 'ENOBUFS' }; },
    o => { o.parent_cleanup.ownership_discovery_complete = false; },
    o => { o.resource.streams.stderr.seen_bytes++; },
    o => { for (const row of o.resource.cleanup_history) row.term_pids = row.term_pids.filter(pid => pid !== worker.pid); },
    o => { o.parent_cleanup.kill_pids.push(worker.pid); },
    o => { o.resource.cleanup.kill_pids.push(worker.pid); },
    o => { o.lease.final_cleanup.kill_pids.push(worker.pid); },
    o => { o.resource.cleanup_history[0].kill_pids.push(worker.pid); },
    o => { const record = o.resource.cleanup_history.find(row => row.reaped.some(item => item.pid === worker.pid));
      record.reaped.push({ pid: worker.pid, start_ticks: worker.start_ticks, returncode: 143 }); },
    o => { const record = o.resource.cleanup_history.find(row => row.reaped.some(item => item.pid === worker.pid));
      record.reaped.find(item => item.pid === worker.pid).start_ticks++; },
    o => { const record = o.resource.cleanup_history.find(row => row.reaped.some(item => item.pid === worker.pid));
      record.term_pids = record.term_pids.filter(pid => pid !== worker.pid);
      o.resource.cleanup_history.push({ ...structuredClone(record), reaped: [], term_pids: [worker.pid] }); },
  ]) {
    const changedOutcome = structuredClone(outcome), changedCompletion = structuredClone(completion);
    change(changedOutcome, changedCompletion);
    assert.throws(() => assertApiCompletion(changedOutcome, changedCompletion, ledgerBytes, rows));
  }
  const ledger = JSON.parse(ledgerBytes); ledger.wrangler_launcher = null;
  const bytes = jsonBytes(ledger), changed = structuredClone(completion);
  changed.input_ledger = { bytes: bytes.length, sha256: sha256(bytes) };
  changed.worker_runtime.launcher_prelaunch = null; changed.worker_runtime.launcher_completion = null;
  assert.throws(() => assertApiCompletion(outcome, changed, bytes, rows), /Generic worker status 143/);
  assert.throws(() => assertCompletedCommand(outcome));
}
test('actual pinned Wrangler has four owned activated local D1 phases, no module feedback, and narrow attested 143 teardown',
  { skip: !process.env.MW3_REAL_STARTUP_WRANGLER, timeout: 900_000 }, async () => {
  const base = process.env.MW3_REAL_STARTUP_EVIDENCE ?? tmpdir(); mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'mw3-real-startup-'));
  process.stderr.write(`Retained actual synthetic Wrangler regression evidence: ${directory}\n`);
  const report = { kind: 'synthetic-actual-runtime-regression-only', status: 'running', local_only: true, directory, phases: [] };
  const save = () => writeFileSync(join(directory, 'regression.json'), jsonBytes(report)); save();
  try {
    const pins = readRuntimePins(process.env.MW3_REAL_STARTUP_WRANGLER, { directory });
    assert.equal(pins.launcher_attestation.sha256, WRANGLER_LAUNCHER_PIN.sha256); report.runtime_pins = pins;
    const prepared = await syntheticPrepared(), capture = captureSources(prepared.registry); writeCapturedSources(directory, capture);
    writeFileSync(join(directory, 'wrangler.json'), jsonBytes(localConfig()));
    const worker = localWorkerSource(prepared.deliveries, prepared.registryContract); writeFileSync(join(directory, 'worker.mjs'), worker);
    report.worker_bundle = bundleCapturedWorker({ directory, pins, capture, expectedWorkerSha: sha256(worker) });
    const control = bundleCapturedApiControl({ directory, pins, capture }); report.control_bundle = control;
    let command = 0;
    const executeSql = text => {
      const path = join(directory, `synthetic-${command}.sql`); writeFileSync(path, text, { flag: 'wx' });
      const result = runSupervisedCommand({ directory, commandId: `synthetic-sql-${command++}`, command: process.execPath,
        args: [pins.entry, 'd1', 'execute', 'MW3_LOCAL_VERIFY', '--local', '--yes', '--config', join(directory, 'wrangler.json'),
          '--persist-to', join(directory, 'state'), '--file', path, '--json'], timeoutMs: 120_000,
        supervisorPath: join(directory, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py') });
      completedJson(result.stdout); return result;
    };
    const migrations = join(root, 'apps/backend/migrations');
    const schema = readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort().map(name => readFileSync(join(migrations, name), 'utf8')).join('\n') +
      '\n' + readFileSync(join(root, 'apps/backend/scripts/sql/mw3-schema.sql'), 'utf8');
    executeSql(schema + '\n' + preservationSeed());
    const dbPath = findDatabase(join(directory, 'state'));
    const unrelated = inspect(dbPath, db => databaseSnapshot(db, { excludeMw3: true }));
    assert.deepEqual(Object.keys(unrelated.rows).sort(), UNRELATED_TABLES);
    for (const rows of Object.values(unrelated.rows)) assert.equal(rows.length, 1);
    const fixtureSql = prepared.deliveries.map(delivery => `INSERT INTO mw3_policy_deliveries VALUES (${quote(delivery.deliveryHash)},${quote(delivery.header.manifest.spotId)},${quote(delivery.stage)},${quote(delivery.headerText)});\n` +
      delivery.parts.map(part => `INSERT INTO mw3_policy_parts VALUES (${quote(delivery.deliveryHash)},${part.part},${quote(part.body)});`).join('\n')).join('\n');
    executeSql(fixtureSql); inspect(dbPath, db => assertDeliveryRows(db, prepared.deliveries));
    const committed = inspect(dbPath, db => databaseSnapshot(db));
    for (const restart of [0, 1, 2, 3]) {
      const kind = restart === 2 ? 'header' : 'part', late = prepared.deliveries[1];
      const probe = restart < 2 ? null : { kind, delivery_hash: late.deliveryHash, ...(restart === 3 ? { part: late.parts.at(-1).part } : {}) };
      if (probe) executeSql(corruptionSetup(prepared.deliveries, kind));
      const before = inspect(dbPath, db => databaseSnapshot(db));
      if (probe) assert.notDeepEqual(before, committed);
      const rows = runCapturedApiPhase({ directory, pins, capture, prepared, restart, control, probe });
      assert.deepEqual(rows, apiPhaseRows(prepared, probe)); assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db)), before);
      const id = `api-phase-${restart}`, ledgerBytes = readFileSync(join(directory, `${id}.input-ledger.json`));
      assertApiInputLedger(directory, JSON.parse(ledgerBytes));
      const outcome = JSON.parse(readFileSync(join(directory, id, 'outcome.json')));
      outcome.stdout = readFileSync(join(directory, id, 'stdout.log'), 'utf8'); outcome.stderr = readFileSync(join(directory, id, 'stderr.log'), 'utf8');
      const completion = JSON.parse(readFileSync(join(directory, `${id}.complete.json`)));
      const reaped = outcome.resource.cleanup_history.flatMap(row => row.reaped).filter(row => row.pid === completion.worker_identity.pid && row.start_ticks === completion.worker_identity.start_ticks);
      assert.equal(reaped.length, 1); assert.equal(reaped[0].returncode, 143, 'The actual audited launcher 143 path must be exercised');
      assertApiCompletion(outcome, completion, ledgerBytes, rows); assert143MutationsFail(outcome, completion, ledgerBytes, rows);
      assert.doesNotMatch(outcome.stdout + outcome.stderr, /Attaching additional modules|Reloading local server|Reloaded and ready|Detected changes|unknown.*watch|unrecognized.*watch/i);
      assert.deepEqual(readdirSync(join(directory, 'worker-runtime')), ['worker.bundle.mjs']);
      if (probe) executeSql(repairConflict(prepared.deliveries, kind));
      assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db)), committed);
      assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db, { excludeMw3: true })), unrelated);
      inspect(dbPath, db => assertDeliveryRows(db, prepared.deliveries));
      report.phases.push({ command_id: id, rows, worker_identity: completion.worker_identity, reaped_returncode: reaped[0].returncode,
        full_database_unchanged_after_read: true, exact_database_restored: true, parent_cleanup_complete: outcome.parent_cleanup.complete }); save();
    }
    assert.deepEqual(readRuntimePins(pins.entry, { directory }), pins);
    report.unrelated_tables_preserved = UNRELATED_TABLES; report.status = 'pass'; save();
  } catch (error) { report.status = 'fail'; report.error = error.message; save(); throw error; }
});
