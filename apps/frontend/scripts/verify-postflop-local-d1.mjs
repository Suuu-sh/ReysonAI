// Strict full-file LOCAL D1 oracle. No split transactions, remote or deploy mode.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localEnvironment, UNRELATED_SEED } from './verify-preflop-local-d1.mjs';
import { POSTFLOP_SPOTS } from './postflop-ai/spots.mjs';
import { REPOSITORY } from './postflop-ai/reviewed-postflop.mjs';
import { artifactPath, compare, jsonBytes, readSafeFile, sha256, validHash } from './postflop-ai/reviewed-postflop-archive.mjs';
import { buildSql, quote } from './postflop-ai/publish-d1.mjs';
import { checkStatements, hashFile, prepareDelivery, predecessorSql, publicationFooter, ROW_COLUMNS } from './postflop-ai/reviewed-postflop-delivery.mjs';
import { readIndex, verifyChildren } from './postflop-ai/reviewed-postflop-index.mjs';

export const WRANGLER_VERSION = '4.147.0';
const BINDING = 'POSTFLOP_LOCAL_VERIFY', FRONTEND = fileURLToPath(new URL('../', import.meta.url));
const identifier = name => `"${name.replaceAll('"', '""')}"`;
export function validateLocalConfig(config) {
  assert.deepEqual(config, { name: 'reysonai-postflop-local-verification', compatibility_date: '2026-09-01', send_metrics: false,
    d1_databases: [{ binding: BINDING, database_name: 'reysonai-postflop-local-verification', database_id: '00000000-0000-0000-0000-000000000000' }] });
  return config;
}
export function validateDelivery(manifest) {
  assert.equal(manifest?.schema_version, 1);
  assert.equal(manifest.kind, 'postflop-reviewed-delivery');
  assert.equal(manifest.status, 'independently-reviewed-delivery-bytes');
  assert.ok(validHash(manifest.sql?.sha256) && Number.isSafeInteger(manifest.sql.bytes) && manifest.sql.bytes > 0);
  assert.ok(Array.isArray(manifest.rows) && manifest.rows.length === manifest.accepted_new_spot_ids?.length * 4);
  assert.equal(manifest.row_value_ledger_sha256, sha256(jsonBytes(manifest.rows)));
  assert.ok(manifest.review?.path && validHash(manifest.review.sha256));
  assert.ok(validHash(manifest.dataset_version?.content_hash));
  return manifest;
}
function inspect(path, callback) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return callback(db); } finally { db.close(); }
}
function findDatabase(directory) {
  const found = [];
  const walk = path => { for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name); if (entry.isDirectory()) walk(child); else if (entry.name.endsWith('.sqlite')) found.push(child);
  } };
  walk(directory);
  const candidates = found.filter(path => inspect(path, db => db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name IN ('postflop_spots','account_users','ranked_matches')").get().n === 3));
  assert.equal(candidates.length, 1, 'Expected one isolated real-schema postflop database');
  return candidates[0];
}
export function databaseSnapshot(db, accepted = null) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all();
  const tables = schema.filter(row => row.type === 'table').map(row => row.name), rows = {};
  for (const table of tables) {
    const rowHashes = [];
    // Per-row iteration: no complete payload dump is retained in the verifier.
    for (const row of db.prepare(`SELECT * FROM ${identifier(table)}`).iterate()) {
      if (accepted && ['postflop_spots', 'postflop_policies', 'postflop_reports', 'postflop_reasons'].includes(table) && accepted.has(row.spot_id)) continue;
      if (accepted && table === 'dataset_versions' && row.name === 'postflop') continue;
      rowHashes.push(sha256(jsonBytes(row)));
    }
    rows[table] = rowHashes.sort(compare);
  }
  return { schema, rows };
}
export function readAcceptedRows(db, manifest) {
  const rows = [];
  for (const id of manifest.accepted_new_spot_ids) {
    for (const [table, columns] of Object.entries(ROW_COLUMNS)) {
      const actual = db.prepare(`SELECT ${columns.map(identifier).join(',')} FROM ${identifier(table)} WHERE spot_id=? ORDER BY ${table === 'postflop_policies' ? 'stage' : 'spot_id'}`).all(id);
      assert.equal(actual.length, table === 'postflop_policies' ? 2 : 1, `${id}: missing or extra accepted rows`);
      for (const value of actual) rows.push({ table, key: table === 'postflop_policies' ? `${id}/${value.stage}` : id, sha256: sha256(jsonBytes(value)) });
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM postflop_reasons WHERE spot_id=?').get(id).n, 0, 'Accepted reasons should be removed only under accepted IDs');
  }
  return rows.sort((a, b) => compare(`${a.table}/${a.key}`, `${b.table}/${b.key}`));
}
function legacySeed() {
  const fingerprints = JSON.parse(readSafeFile(REPOSITORY, 'apps/frontend/tests/fixtures/postflop-legacy-fingerprints.json'));
  const lines = [];
  for (const id of Object.keys(fingerprints).sort(compare)) {
    const spot = POSTFLOP_SPOTS.find(spot => spot.id === id && !spot.history);
    assert.ok(spot, 'Every historical fixture ID must belong to the current legacy catalog');
    const get = kind => JSON.parse(readSafeFile(REPOSITORY, artifactPath(spot, kind)));
    const item = { spot, candidate: get('candidate'), laterCandidate: get('laterCandidate'), report: get('report') };
    assert.equal(item.report.defence_version, 5);
    assert.equal(item.report.source_hash, fingerprints[id]);
    lines.push(checkStatements(buildSql([item], '2000-01-01T00:00:00.000Z', 'local-historical-fixture')));
  }
  assert.equal(lines.length, 45);
  return lines.join('\n'); // The fixed 45 legacy fixtures, not collection payloads.
}
const SUPERVISOR = fileURLToPath(new URL('./ci/postflop-command-supervisor.py', import.meta.url));
const errorRecord = error => error ? { name: error.name, message: error.message, code: error.code ?? null } : null;
function readEvidence(path, limit, causes, label) {
  try {
    const bytes = readFileSync(path);
    if (bytes.length > limit) throw new Error('Evidence file exceeds declared output bound');
    return bytes.toString('utf8');
  } catch (error) { causes.push({ type: label, ...errorRecord(error) }); return ''; }
}
export function assertCompletedCommand(outcome, { nonzero = false } = {}) {
  const resource = outcome?.resource, cleanup = outcome?.parent_cleanup, wrapper = outcome?.wrapper, lease = outcome?.lease;
  assert.ok(outcome && outcome.causes.length === 0 && !wrapper.error && wrapper.status === 0 && wrapper.signal === null,
    'Launcher/buffer/outer timeout/signal/measurement/cleanup failure cannot prove a completed importer command');
  assert.ok(resource?.schema_version === 1 && resource.command_id === outcome.command_id && resource.supervisor_pid === wrapper.pid &&
    resource.group_id === wrapper.pid && Number.isSafeInteger(resource.group_start_ticks) && resource.group_start_ticks > 0 &&
    resource.supervisor_exit_status === wrapper.status && resource.complete === true && resource.classification === 'normal-exit' &&
    resource.normal_exit === true && resource.timed_out === false && resource.interrupted_signal === null &&
    resource.child_signal_number === null && resource.child_signal_name === null && Number.isInteger(resource.actual_returncode) &&
    resource.actual_returncode >= 0 && Number.isSafeInteger(resource.child_pid) && resource.child_pid > 1 &&
    Number.isSafeInteger(resource.child_start_ticks) && resource.child_start_ticks > 0 &&
    resource.supervisor_start_ticks === resource.group_start_ticks,
    'Exact actual child must have normally completed; numeric wrapper statuses are not proof');
  for (const record of [resource, lease, cleanup, resource.cleanup, lease?.final_cleanup]) assert.ok(
    Array.isArray(record?.ownership_conflicts) && record.ownership_conflicts.length === 0,
    'Owned birth conflict is unresolved ownership uncertainty, never completed SQL evidence');
  assert.ok(lease?.schema_version === 1 && lease.supervision_complete === true,
    'The completed supervisor must retain its final anchored discovery proof');
  for (const record of [lease, cleanup, resource.cleanup, lease.final_cleanup]) {
    assert.ok(record && record.command_id === outcome.command_id && record.supervisor_pid === wrapper.pid &&
      record.supervisor_start_ticks === resource.supervisor_start_ticks && record.group_id === wrapper.pid &&
      record.group_start_ticks === resource.group_start_ticks && record.child_pid === resource.child_pid &&
      record.child_start_ticks === resource.child_start_ticks,
      'Lease/resource/cleanup must bind the exact supervisor, group and actual-child births');
  }
  assert.ok(lease.owned.some(item => item.pid === resource.child_pid && item.start_ticks === resource.child_start_ticks),
    'The actual child birth must be retained in its ownership lease');
  for (const record of [cleanup, resource.cleanup, lease.final_cleanup]) assert.ok(record.complete === true &&
    record.ownership_discovery_complete === true && record.no_live_owned_processes === true &&
    record.remaining_live.length === 0 && record.remaining_zombies.length === 0,
    'The exact owned importer descendants must be discovered, terminated and reaped before a completed result');
  assert.ok(Number.isInteger(resource.max_rss_kib) && resource.max_rss_kib > 0 && resource.max_rss_kib <= outcome.rss_limit_kib &&
    resource.observed_owned_group_rss_kib <= outcome.rss_limit_kib && resource.secondary_causes.length === 0,
    'Missing/resource-limited/failed measurement is not completed SQL evidence');
  for (const name of ['stdout', 'stderr']) assert.ok(resource.streams[name].seen_bytes === resource.streams[name].retained_bytes &&
    Buffer.byteLength(outcome[name]) === resource.streams[name].retained_bytes && resource.streams[name].retained_bytes <= outcome.output_limit_bytes,
    'Truncated/mismatched stdout or stderr cannot establish a completed command');
  assert.ok(nonzero ? resource.actual_returncode > 0 : resource.actual_returncode === 0,
    nonzero ? 'Expected a genuine normally completed nonzero child exit' : 'Expected genuine normal child exit zero');
  return outcome;
}
export function runSupervisedCommand({ directory, commandId, command, args = [], timeoutMs = 600000,
  outerTimeoutMs = timeoutMs + 20000, cleanupMs = 2000, outputBytes = 32 * 1024 * 1024,
  rssLimitKiB = 3 * 1024 * 1024, python = 'python3', onSupervisorComplete = null } = {}) {
  assert.equal(process.platform, 'linux');
  assert.match(commandId, /^[a-z0-9-]{1,80}$/);
  for (const value of [timeoutMs, outerTimeoutMs, cleanupMs, outputBytes, rssLimitKiB]) assert.ok(Number.isSafeInteger(value) && value > 0);
  const evidence = join(directory, commandId); mkdirSync(evidence, { mode: 0o700 });
  writeFileSync(join(evidence, 'command.json'), jsonBytes({ command_id: commandId, command, args }), { flag: 'wx', mode: 0o600 });
  const result = spawnSync(python, [SUPERVISOR, '--directory', evidence, '--command-id', commandId,
    '--timeout-ms', String(timeoutMs), '--cleanup-ms', String(cleanupMs), '--output-bytes', String(outputBytes),
    '--rss-limit-kib', String(rssLimitKiB), '--', command, ...args], {
    cwd: directory, env: localEnvironment(directory), detached: true, encoding: 'utf8', timeout: outerTimeoutMs,
    killSignal: 'SIGTERM', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const causes = [];
  // Test-only callback is never accepted through the oracle's CLI/JSON arguments.
  // Even its failure cannot skip group cleanup or erase the original result.
  try { onSupervisorComplete?.(result, evidence); } catch (error) { causes.push({ type: 'test-callback-error', ...errorRecord(error) }); }
  const wrapper = { pid: result.pid ?? null, status: result.status, signal: result.signal,
    error: errorRecord(result.error), stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  if (result.error) causes.push({ type: 'original-execution-error', ...errorRecord(result.error) });
  if (result.signal || result.status !== 0) causes.push({ type: 'supervisor-exit', status: result.status, signal: result.signal });
  const save = (name, body) => {
    try { writeFileSync(join(evidence, name), body, { flag: 'wx', mode: 0o600 }); }
    catch (error) { causes.push({ type: 'evidence-write', file: name, ...errorRecord(error) }); }
  };
  save('supervisor.stdout.log', wrapper.stdout);
  save('supervisor.stderr.log', wrapper.stderr);
  let cleanup = null;
  if (Number.isSafeInteger(result.pid) && result.pid > 1) {
    // This parent-side check runs even after outer timeout/ENOBUFS/signal/error.
    // It can target only the group created by this spawn, with its birth lease.
    const check = spawnSync('python3', [SUPERVISOR, '--directory', evidence, '--command-id', commandId,
      '--cleanup-ms', String(cleanupMs), '--cleanup-pid', String(result.pid)], {
      cwd: directory, env: localEnvironment(directory), encoding: 'utf8', timeout: 2 * cleanupMs + 10000,
      killSignal: 'SIGTERM', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    save('parent-cleanup.stdout.log', check.stdout ?? '');
    save('parent-cleanup.stderr.log', check.stderr ?? '');
    if (check.error || check.signal || check.status !== 0) causes.push({ type: 'cleanup-execution', status: check.status,
      signal: check.signal, error: errorRecord(check.error), stderr: check.stderr ?? '' });
    else { try { cleanup = JSON.parse(check.stdout); } catch (error) { causes.push({ type: 'cleanup-invalid', ...errorRecord(error) }); } }
  } else cleanup = { complete: true, no_process_spawned: true, no_live_owned_processes: true, remaining_live: [], remaining_zombies: [] };
  if (!cleanup?.complete || !cleanup?.no_live_owned_processes || cleanup.remaining_live?.length || cleanup.remaining_zombies?.length) causes.push({ type: 'cleanup-unconfirmed' });
  let lease = null;
  try { lease = JSON.parse(readFileSync(join(evidence, 'lease.json'), 'utf8')); }
  catch (error) { causes.push({ type: 'ownership-lease-invalid-or-missing', ...errorRecord(error) }); }
  let resource = null;
  try { resource = JSON.parse(readFileSync(join(evidence, 'resource.json'), 'utf8')); }
  catch (error) { causes.push({ type: 'measurement-invalid-or-missing', ...errorRecord(error) }); }
  const stdout = readEvidence(join(evidence, 'stdout.log'), outputBytes, causes, 'stdout-evidence'),
    stderr = readEvidence(join(evidence, 'stderr.log'), outputBytes, causes, 'stderr-evidence');
  if (Array.isArray(resource?.secondary_causes)) for (const cause of resource.secondary_causes) causes.push({ type: 'supervisor-secondary', detail: cause });
  if (resource && resource.classification !== 'normal-exit') causes.push({ type: 'actual-command-abnormal', classification: resource.classification,
    actual_returncode: resource.actual_returncode, timed_out: resource.timed_out, child_signal: resource.child_signal_name });
  if (resource && (resource.max_rss_kib > rssLimitKiB || resource.observed_owned_group_rss_kib > rssLimitKiB)) causes.push({ type: 'resource-limit' });
  const outcome = { command_id: commandId, evidence_directory: evidence, wrapper, lease, resource, parent_cleanup: cleanup,
    causes, stdout, stderr, output_limit_bytes: outputBytes, rss_limit_kib: rssLimitKiB,
    original_execution_error: result.error ?? null };
  let validation;
  try { assertCompletedCommand(outcome, { nonzero: resource?.actual_returncode > 0 }); }
  catch (error) { validation = error; }
  const summary = { ...outcome, stdout: { bytes: Buffer.byteLength(stdout), sha256: sha256(stdout) },
    stderr: { bytes: Buffer.byteLength(stderr), sha256: sha256(stderr) }, original_execution_error: errorRecord(result.error),
    validation_error: errorRecord(validation) };
  save('outcome.json', jsonBytes(summary));
  if (!validation && causes.length) validation = new Error('Command evidence could not be retained completely');
  if (validation || resource.actual_returncode !== 0) {
    const primary = result.error ?? new Error(validation?.message ?? `Actual command normally exited ${resource.actual_returncode}`);
    const error = new Error(primary.message, { cause: primary });
    Object.assign(error, { commandOutcome: outcome, stdout, stderr, originalExecutionError: result.error ?? null,
      secondaryCauses: causes, status: resource?.actual_returncode ?? null, signal: resource?.child_signal_name ?? wrapper.signal });
    throw error;
  }
  return outcome;
}
export function expectFinishedFailure(callback, pattern) {
  let error; try { callback(); } catch (caught) { error = caught; }
  assert.ok(error, 'Expected an actual completed SQL failure');
  assertCompletedCommand(error.commandOutcome, { nonzero: true });
  assert.match(`${error.stdout ?? ''}\n${error.stderr ?? ''}`, pattern, 'Failure was not the intended SQL error');
  return error;
}
export function parseArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], key = { '--index': 'indexPath', '--review': 'reviewPath', '--bundle': 'bundle', '--wrangler': 'wrangler' }[arg];
    if (!key || options[key] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Required: --index PATH --review PATH --bundle LOCAL --wrangler PINNED.js');
    options[key] = argv[++i];
  }
  for (const key of ['indexPath', 'reviewPath', 'bundle', 'wrangler']) assert.ok(options[key], `Missing ${key}`);
  return options;
}
export function verifyLocalD1({ indexPath, reviewPath, bundle, wrangler, log = console.log }) {
  const started = performance.now(), [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || major === 22 && minor >= 20, 'Node >=22.20 required');
  assert.ok(wrangler, 'Provide an already installed exact pinned Wrangler entry');
  assert.equal(process.platform, 'linux', 'The measured strict oracle currently supports Linux only');
  const manifest = validateDelivery(JSON.parse(readSafeFile(REPOSITORY, `${bundle}/delivery.json`, 4 * 1024 * 1024)));
  const config = validateLocalConfig(JSON.parse(readFileSync(join(FRONTEND, 'scripts/ci/postflop.wrangler.jsonc'), 'utf8')));
  const local = join(FRONTEND, '.local'); mkdirSync(local, { recursive: true });
  const directory = mkdtempSync(join(local, 'verify-postflop-d1-'));
  let safeToDeleteState = true, originalFailure = null;
  try {
    mkdirSync(join(directory, 'home/.config'), { recursive: true });
    const out = `apps/frontend/.local/${directory.slice(local.length + 1)}/regenerated`;
    const regenerated = prepareDelivery({ indexPath, reviewPath, out, checkBundle: bundle });
    assert.deepEqual(regenerated.manifest, manifest, 'Independent reviewed bundle regeneration differs');
    const collection = readIndex({ indexPath }), expected = verifyChildren(collection);
    const reviewedPath = join(directory, 'reviewed.sql'); copyFileSync(join(REPOSITORY, bundle, 'postflop.sql'), reviewedPath);
    assert.deepEqual(hashFile(reviewedPath), manifest.sql);
    const configPath = join(directory, 'wrangler.json'), persist = join(directory, 'state');
    writeFileSync(configPath, JSON.stringify(config));
    let commandNumber = 0, importerMaxRss = 0;
    const evidenceRoot = join(REPOSITORY, bundle, 'local-d1-evidence');
    mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
    const evidenceDirectory = mkdtempSync(join(evidenceRoot, 'run-'));
    const commandEvidence = [];
    const execute = args => {
      const commandId = `command-${commandNumber++}`;
      let outcome;
      try {
        outcome = runSupervisedCommand({ directory: evidenceDirectory, commandId, command: process.execPath,
          args: [resolve(wrangler), ...args] });
        return outcome.stdout;
      } catch (error) {
        outcome = error.commandOutcome;
        if (!outcome?.parent_cleanup?.complete) safeToDeleteState = false;
        throw error;
      }
      finally {
        if (outcome) {
          importerMaxRss = Math.max(importerMaxRss, outcome.resource?.max_rss_kib ?? 0, outcome.resource?.observed_owned_group_rss_kib ?? 0);
          commandEvidence.push({ command_id: commandId, evidence_directory: outcome.evidence_directory,
            classification: outcome.resource?.classification ?? 'unknown', actual_returncode: outcome.resource?.actual_returncode ?? null,
            cleanup_complete: outcome.parent_cleanup?.complete === true, output: { stdout: { bytes: Buffer.byteLength(outcome.stdout), sha256: sha256(outcome.stdout) },
              stderr: { bytes: Buffer.byteLength(outcome.stderr), sha256: sha256(outcome.stderr) } } });
        }
      }
    };
    assert.equal(execute(['--version']).trim(), WRANGLER_VERSION);
    const importFile = path => {
      const output = execute(['d1', 'execute', BINDING, '--local', '--yes', '--config', configPath, '--persist-to', persist, '--file', path, '--json']);
      let result; try { result = JSON.parse(output); } catch { throw new Error('No completed JSON result: zero launcher exit does not prove import success'); }
      assert.ok(Array.isArray(result) && result.length > 0 && result.every(row => row.success === true), 'Completed strict JSON success required');
      return result;
    };
    const probeFile = (name, sql) => { const path = join(directory, name); writeFileSync(path, sql); return path; };
    const migrations = join(REPOSITORY, 'apps/backend/migrations');
    const schema = readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort(compare).map(name => readFileSync(join(migrations, name), 'utf8')).join('\n');
    const preflop = `INSERT INTO preflop_datasets VALUES ('local-preserved-preflop','${sha256('{}')}',2,1);\nINSERT INTO preflop_dataset_parts VALUES ('local-preserved-preflop',0,'{}');\n`;
    importFile(probeFile('seed.sql', `${schema}\n${legacySeed()}\n${UNRELATED_SEED}\n${preflop}\nDELETE FROM dataset_versions WHERE name='postflop';\n`));
    const dbPath = findDatabase(persist), accepted = new Set(manifest.accepted_new_spot_ids);
    const preserved = inspect(dbPath, db => databaseSnapshot(db, accepted));
    assert.equal(Object.keys(preserved.rows).length, 18, 'All 18 actual application tables must be covered');
    // Positively test both CASE branches with LOCAL D1, including absent/null.
    importFile(probeFile('absent-guard.sql', predecessorSql({ predecessor_content_hash: null }, manifest.dataset_version.content_hash)));
    const badHash = sha256('local-invalid-predecessor');
    importFile(probeFile('wrong-predecessor.sql', `INSERT INTO dataset_versions VALUES ('postflop',${quote(badHash)},'2000-01-01','{}');\n`));
    const beforeRejected = inspect(dbPath, db => databaseSnapshot(db));
    expectFinishedFailure(() => importFile(reviewedPath), /malformed JSON|invalid JSON/i);
    assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db)), beforeRejected, 'Rejected predecessor must preserve the complete database');
    const predecessor = manifest.publication.predecessor_content_hash;
    importFile(probeFile('expected-predecessor.sql', `DELETE FROM dataset_versions WHERE name='postflop';\n${predecessor === null ? '' : `INSERT INTO dataset_versions VALUES ('postflop',${quote(predecessor)},'2000-01-01','{}');\n`}`));
    const verify = () => inspect(dbPath, db => {
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.deepEqual(readAcceptedRows(db, manifest), manifest.rows, 'Exact compact accepted D1 value hashes differ');
      assert.deepEqual({ ...db.prepare("SELECT name,content_hash,published_at,detail_json FROM dataset_versions WHERE name='postflop'").get() }, manifest.dataset_version);
      assert.deepEqual(databaseSnapshot(db, accepted), preserved, 'Schema, all45 legacy rows, preflop/accounts/ranked or unrelated rows changed');
      for (const id of Object.keys(JSON.parse(readSafeFile(REPOSITORY, 'apps/frontend/tests/fixtures/postflop-legacy-fingerprints.json')))) {
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM postflop_policies WHERE spot_id=?').get(id).n, 2);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM postflop_reports WHERE spot_id=?').get(id).n, 1);
      }
    });
    for (let pass = 1; pass <= 2; pass++) { importFile(reviewedPath); verify(); log(`Strict LOCAL D1 import ${pass}/2: exact accepted values and all preserved tables verified.`); }
    // A reason under an ACCEPTED ID is deleted by the actual reviewed SQL. Its
    // survival after the late UNIQUE error makes whole-file rollback observable.
    const id = manifest.accepted_new_spot_ids[0];
    importFile(probeFile('rollback-marker.sql', `INSERT INTO postflop_reasons VALUES (${quote(id)},'local-rollback-marker','{"must_survive_failure":true}');\nUPDATE postflop_reports SET payload_json='{"distinct_pre_failure_report":true}' WHERE spot_id=${quote(id)};\n`));
    const beforeFailure = inspect(dbPath, db => databaseSnapshot(db));
    const failedPath = join(directory, 'complete-reviewed-file-expected-failure.sql'); copyFileSync(reviewedPath, failedPath);
    appendFileSync(failedPath, `\nINSERT INTO postflop_spots SELECT * FROM postflop_spots WHERE spot_id=${quote(id)};\n`);
    expectFinishedFailure(() => importFile(failedPath), /UNIQUE constraint failed: postflop_spots\.spot_id/);
    assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db)), beforeFailure, 'Full-file rollback failed, including accepted-ID marker/report');
    // Disposable A→B→old-A probe. B is clearly an oracle-only revision, not a
    // newly accepted/publishable collection. The original A file must refuse it.
    const bCollection = { ...collection, index: { ...collection.index, publication: { ...collection.index.publication,
      revision: `${collection.index.publication.revision.slice(0, 110)}-local-probe-b`, predecessor_content_hash: manifest.dataset_version.content_hash } } };
    const bFooter = publicationFooter(bCollection, expected), bPath = join(directory, 'local-only-b.sql');
    copyFileSync(reviewedPath, bPath); appendFileSync(bPath, bFooter.sql); importFile(bPath);
    const beforeOldA = inspect(dbPath, db => databaseSnapshot(db));
    expectFinishedFailure(() => importFile(reviewedPath), /malformed JSON|invalid JSON/i);
    assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db)), beforeOldA, 'Old A after B changed rows or revived an obsolete cache revision');
    const result = { local_only: true, mode: 'strict-whole-file', local_transactions_per_import: 1, wrangler_version: WRANGLER_VERSION,
      sql: manifest.sql, index_sha256: manifest.index.sha256, row_value_ledger_sha256: manifest.row_value_ledger_sha256,
      accepted_spots: accepted.size, actual_shards: collection.index.shards.length, preserved_legacy_spots: 45,
      actual_tables_verified: Object.keys(preserved.rows), repeated_imports: 2, full_file_failure_rollback: 'observable accepted-ID marker/report and every database row preserved',
      multi_shard_failure_scope: collection.index.shards.length >= 2 && accepted.size >= 2 ? 'actual full multi-shard/multi-ID file' : 'only supplied one-shard/one-ID scope; multi-shard acceptance remains unestablished',
      predecessor_rejection: true, old_a_after_b_rejected: true, remote_atomicity: 'not tested',
      elapsed_seconds: Number(((performance.now() - started) / 1000).toFixed(3)), verifier_max_rss_kib: process.resourceUsage().maxRSS,
      command_evidence_directory: evidenceDirectory, commands: commandEvidence, importer_max_rss_kib: importerMaxRss, importer_measurement_scope: 'Linux waited-child maxRSS plus sampled owned-group RSS; sampling is not an instantaneous aggregate hard-limit guarantee' };
    log(JSON.stringify(result)); return result;
  } catch (error) { originalFailure = error; throw error; }
  finally {
    // Never delete database state while any owned process cleanup is uncertain.
    // Per-command bounded logs/resources survive outside this disposable state.
    try {
      if (safeToDeleteState) rmSync(directory, { recursive: true, force: true });
      else writeFileSync(join(directory, 'STATE-RETAINED.json'), jsonBytes({ local_only: true,
        reason: 'Owned importer cleanup was not confirmed; state retained for identity-bound recovery.' }), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!originalFailure) throw error;
      originalFailure.secondaryCauses ??= [];
      originalFailure.secondaryCauses.push({ type: 'state-cleanup-or-retention', ...errorRecord(error) });
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = verifyLocalD1({ ...parseArguments(process.argv.slice(2)), log: text => console.error(text) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Strict LOCAL postflop verification failed: ${error.message}`);
    if (error.stdout) console.error(error.stdout); if (error.stderr) console.error(error.stderr); process.exitCode = 1;
  }
}
