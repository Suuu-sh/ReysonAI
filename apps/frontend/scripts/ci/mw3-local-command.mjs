// MW3-only synchronous adapter for the exact independently reviewed Linux owner.
// A normal nonzero child exit is SQL evidence only after every lifecycle bound.
// API teardown has its own narrow classifier; it never qualifies SQL rollback.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const SUPERVISOR_SHA256 = '61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d';
export function localEnvironment(directory) {
  return { PATH: process.env.PATH ?? '', HOME: join(directory, 'home'), XDG_CONFIG_HOME: join(directory, 'home', '.config'),
    TMPDIR: directory, CI: 'true', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', npm_config_cache: join(directory, 'npm-cache'),
    npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' };
}
const SUPERVISOR = fileURLToPath(new URL('./postflop-command-supervisor.py', import.meta.url));
const errorRecord = error => error ? { name: error.name, message: error.message, code: error.code ?? null } : null;
function readEvidence(path, limit, causes, label) {
  try {
    const bytes = readFileSync(path);
    if (bytes.length > limit) throw new Error('Evidence file exceeds declared output bound');
    return bytes.toString('utf8');
  } catch (error) { causes.push({ type: label, ...errorRecord(error) }); return ''; }
}
export function assertCompletedCommand(outcome, { nonzero = false, apiTeardown = false } = {}) {
  assert.equal(outcome?.purpose, apiTeardown ? 'api-oracle' : 'command', 'API and SQL completion evidence have separate purposes');
  assert.ok(!(apiTeardown && nonzero), 'API completion requires normal controller exit zero');
  const resource = outcome?.resource, cleanup = outcome?.parent_cleanup, wrapper = outcome?.wrapper, lease = outcome?.lease;
  assert.ok(outcome && outcome.causes.length === 0 && !wrapper.error && wrapper.status === 0 && wrapper.signal === null,
    'Launcher/buffer/outer timeout/signal/measurement/cleanup failure cannot prove a completed importer command');
  assert.ok(resource?.schema_version === 1 && resource.command_id === outcome.command_id && resource.supervisor_pid === wrapper.pid &&
    resource.group_id === wrapper.pid && Number.isSafeInteger(resource.group_start_ticks) && resource.group_start_ticks > 0 &&
    resource.supervisor_exit_status === wrapper.status && resource.complete === true && (!apiTeardown && resource.classification === 'normal-exit' && resource.normal_exit === true ||
      apiTeardown && resource.actual_returncode === 0 && resource.normal_exit === false &&
      ['descendant-leak', 'owned-descendant-interrupted'].includes(resource.classification)) && resource.timed_out === false && resource.interrupted_signal === null &&
    resource.child_signal_number === null && resource.child_signal_name === null && Number.isInteger(resource.actual_returncode) &&
    resource.actual_returncode >= 0 && resource.actual_returncode <= 255 && Number.isSafeInteger(resource.child_pid) && resource.child_pid > 1 &&
    Number.isSafeInteger(resource.child_start_ticks) && resource.child_start_ticks > 0 &&
    resource.supervisor_start_ticks === resource.group_start_ticks,
    'Exact actual child must have normally completed; numeric wrapper statuses are not proof');
  assert.ok(Array.isArray(resource.cleanup_history) && resource.cleanup_history.length > 0, 'Missing cleanup history');
  for (const record of [resource, lease, cleanup, resource.cleanup, lease?.final_cleanup, ...resource.cleanup_history]) assert.ok(
    Array.isArray(record?.ownership_conflicts) && record.ownership_conflicts.length === 0,
    'Owned birth conflict is unresolved ownership uncertainty, never completed SQL evidence');
  assert.ok(lease?.schema_version === 1 && lease.supervision_complete === true,
    'The completed supervisor must retain its final anchored discovery proof');
  for (const record of [lease, cleanup, resource.cleanup, lease.final_cleanup, ...resource.cleanup_history]) {
    assert.ok(record && record.command_id === outcome.command_id && record.supervisor_pid === wrapper.pid &&
      record.supervisor_start_ticks === resource.supervisor_start_ticks && record.group_id === wrapper.pid &&
      record.group_start_ticks === resource.group_start_ticks && record.child_pid === resource.child_pid &&
      record.child_start_ticks === resource.child_start_ticks,
      'Lease/resource/cleanup must bind the exact supervisor, group and actual-child births');
  }
  assert.ok(lease.owned.some(item => item.pid === resource.child_pid && item.start_ticks === resource.child_start_ticks),
    'The actual child birth must be retained in its ownership lease');
  assert.ok(Array.isArray(lease.owned) && lease.owned.every(item => Number.isSafeInteger(item.pid) && item.pid > 1 &&
    Number.isSafeInteger(item.start_ticks) && item.start_ticks > 0 && item.pid !== wrapper.pid), 'Malformed birth ownership inventory');
  for (const record of [cleanup, resource.cleanup, lease.final_cleanup, ...resource.cleanup_history]) {
    for (const key of ['remaining_live', 'remaining_zombies', 'term_pids', 'kill_pids', 'reaped']) assert.ok(Array.isArray(record[key]), `Missing cleanup ${key} array`);
    for (const pid of [...record.term_pids, ...record.kill_pids]) assert.ok(Number.isSafeInteger(pid) && pid > 1 &&
      pid !== wrapper.pid && lease.owned.some(item => item.pid === pid), 'Cleanup target is not an exact recorded owned child');
    for (const item of record.reaped) assert.ok(Number.isSafeInteger(item.returncode) && item.returncode >= -64 && item.returncode <= 255 &&
      lease.owned.some(owned => owned.pid === item.pid && owned.start_ticks === item.start_ticks), 'Reaped status does not bind a recorded owned birth');
  }
  for (const record of [cleanup, resource.cleanup, lease.final_cleanup]) assert.ok(record.complete === true &&
    record.ownership_discovery_complete === true && record.no_live_owned_processes === true &&
    record.remaining_live.length === 0 && record.remaining_zombies.length === 0,
    'The exact owned importer descendants must be discovered, terminated and reaped before a completed result');
  assert.ok(Number.isInteger(resource.max_rss_kib) && resource.max_rss_kib > 0 && resource.max_rss_kib <= outcome.rss_limit_kib &&
    resource.observed_owned_group_rss_kib <= outcome.rss_limit_kib && resource.secondary_causes.length === 0,
    'Missing/resource-limited/failed measurement is not completed SQL evidence');
  assert.ok(Number.isSafeInteger(resource.observed_owned_group_rss_kib) && resource.observed_owned_group_rss_kib >= 0 &&
    Number.isFinite(resource.elapsed_seconds) && resource.elapsed_seconds > 0 &&
    resource.elapsed_seconds <= (outcome.timeout_ms + 2 * outcome.cleanup_ms + 1000) / 1000, 'Invalid measured resource/time bounds');
  for (const name of ['stdout', 'stderr']) assert.ok(Number.isSafeInteger(resource.streams[name].seen_bytes) && resource.streams[name].seen_bytes >= 0 &&
    Number.isSafeInteger(resource.streams[name].retained_bytes) && resource.streams[name].retained_bytes >= 0 && resource.streams[name].seen_bytes === resource.streams[name].retained_bytes &&
    Buffer.byteLength(outcome[name]) === resource.streams[name].retained_bytes && resource.streams[name].retained_bytes <= outcome.output_limit_bytes,
    'Truncated/mismatched stdout or stderr cannot establish a completed command');
  assert.ok(nonzero ? resource.actual_returncode > 0 : resource.actual_returncode === 0,
    nonzero ? 'Expected a genuine normally completed nonzero child exit' : 'Expected genuine normal child exit zero');
  return outcome;
}
export function runSupervisedCommand({ directory, commandId, command, args = [], timeoutMs = 600000,
  outerTimeoutMs = timeoutMs + 20000, cleanupMs = 2000, outputBytes = 32 * 1024 * 1024,
  rssLimitKiB = 3 * 1024 * 1024, python = 'python3', onSupervisorComplete = null, supervisorPath = SUPERVISOR, apiTeardown = false } = {}) {
  assert.equal(process.platform, 'linux');
  const supervisorBytes = readFileSync(supervisorPath);
  assert.equal(sha256(supervisorBytes), SUPERVISOR_SHA256, 'Reviewed supervisor bytes changed');
  assert.match(commandId, /^[a-z0-9-]{1,80}$/);
  for (const value of [timeoutMs, outerTimeoutMs, cleanupMs, outputBytes, rssLimitKiB]) assert.ok(Number.isSafeInteger(value) && value > 0);
  const evidence = join(directory, commandId); mkdirSync(evidence, { mode: 0o700 });
  const ownerPath = join(evidence, 'supervisor.py');
  writeFileSync(ownerPath, supervisorBytes, { flag: 'wx', mode: 0o444 });
  writeFileSync(join(evidence, 'command.json'), jsonBytes({ command_id: commandId, command, args, supervisor: { source_path: supervisorPath, executed_path: ownerPath, bytes: supervisorBytes.length, sha256: SUPERVISOR_SHA256 },
    limits: { timeout_ms: timeoutMs, outer_timeout_ms: outerTimeoutMs, cleanup_ms: cleanupMs, output_bytes: outputBytes, rss_limit_kib: rssLimitKiB } }), { flag: 'wx', mode: 0o600 });
  const result = spawnSync(python, [ownerPath, '--directory', evidence, '--command-id', commandId,
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
  let ownerUnchanged = false;
  try { ownerUnchanged = sha256(readFileSync(ownerPath)) === SUPERVISOR_SHA256; }
  catch (error) { causes.push({ type: 'cleanup-owner-source', ...errorRecord(error) }); }
  if (!ownerUnchanged) causes.push({ type: 'cleanup-owner-source-changed' });
  if (Number.isSafeInteger(result.pid) && result.pid > 1 && ownerUnchanged) {
    // This parent-side check runs even after outer timeout/ENOBUFS/signal/error.
    // It can target only the group created by this spawn, with its birth lease.
    const check = spawnSync('python3', [ownerPath, '--directory', evidence, '--command-id', commandId,
      '--cleanup-ms', String(cleanupMs), '--cleanup-pid', String(result.pid)], {
      cwd: directory, env: localEnvironment(directory), encoding: 'utf8', timeout: 2 * cleanupMs + 10000,
      killSignal: 'SIGTERM', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    save('parent-cleanup.stdout.log', check.stdout ?? '');
    save('parent-cleanup.stderr.log', check.stderr ?? '');
    if (check.error || check.signal || check.status !== 0) causes.push({ type: 'cleanup-execution', status: check.status,
      signal: check.signal, error: errorRecord(check.error), stderr: check.stderr ?? '' });
    else { try { cleanup = JSON.parse(check.stdout); } catch (error) { causes.push({ type: 'cleanup-invalid', ...errorRecord(error) }); } }
  } else if (!Number.isSafeInteger(result.pid) || result.pid <= 1) cleanup = { complete: true, no_process_spawned: true, no_live_owned_processes: true, remaining_live: [], remaining_zombies: [] };
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
  if (resource && resource.classification !== 'normal-exit' && !(apiTeardown && resource.actual_returncode === 0 &&
      ['descendant-leak', 'owned-descendant-interrupted'].includes(resource.classification))) causes.push({ type: 'actual-command-abnormal', classification: resource.classification,
    actual_returncode: resource.actual_returncode, timed_out: resource.timed_out, child_signal: resource.child_signal_name });
  if (resource && (resource.max_rss_kib > rssLimitKiB || resource.observed_owned_group_rss_kib > rssLimitKiB)) causes.push({ type: 'resource-limit' });
  const outcome = { purpose: apiTeardown ? 'api-oracle' : 'command', command_id: commandId, evidence_directory: evidence, wrapper, lease, resource, parent_cleanup: cleanup,
    causes, stdout, stderr, output_limit_bytes: outputBytes, rss_limit_kib: rssLimitKiB, timeout_ms: timeoutMs, cleanup_ms: cleanupMs,
    original_execution_error: result.error ?? null };
  let validation;
  try { assertCompletedCommand(outcome, { nonzero: resource?.actual_returncode > 0, apiTeardown }); }
  catch (error) { validation = error; }
  const summary = { ...outcome, stdout: { bytes: Buffer.byteLength(stdout), sha256: sha256(stdout) },
    stderr: { bytes: Buffer.byteLength(stderr), sha256: sha256(stderr) }, original_execution_error: errorRecord(result.error),
    validation_error: errorRecord(validation) };
  save('outcome.json', jsonBytes(summary));
  if (!validation && causes.length) validation = new Error('Command evidence could not be retained completely');
  if (validation || resource.actual_returncode !== 0) {
    const primary = result.error ?? new Error(validation?.message ?? `Actual command normally exited ${resource.actual_returncode}`);
    const error = new Error(primary.message, { cause: primary });
    Object.assign(error, { commandOutcome: outcome, stdout, stderr, command_id: commandId, command_resource: resource,
      command_group_cleanup: cleanup, originalExecutionError: result.error ?? null,
      secondaryCauses: causes, status: resource?.actual_returncode ?? null, signal: resource?.child_signal_name ?? wrapper.signal });
    throw error;
  }
  return { ...outcome, measurement: resource, cleanup };
}
export function expectFinishedFailure(callback, pattern) {
  let error; try { callback(); } catch (caught) { error = caught; }
  assert.ok(error, 'Expected an actual completed SQL failure');
  assertCompletedCommand(error.commandOutcome, { nonzero: true });
  assert.match(`${error.stdout ?? ''}\n${error.stderr ?? ''}`, pattern, 'Failure was not the intended SQL error');
  return error;
}
