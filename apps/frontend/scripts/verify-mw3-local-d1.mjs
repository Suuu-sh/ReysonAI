// Verify exactly saved, independently reviewed MW3 delivery bytes in LOCAL D1.
// One complete SQL file per import. No remote mode, strategy generation, receipt
// creation, publication-registry edits, credentials, downloads or deployments.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localEnvironment, UNRELATED_SEED } from './verify-preflop-local-d1.mjs';
import { verifyMw3SourceTree } from './postflop-ai/mw3-source-tree.mjs';
import { MW3_REPOSITORY, verifyMw3Snapshot } from './postflop-ai/mw3-reviewed-snapshot.mjs';
import { MW3_ARCHIVE_LIMITS, jsonBytes, readSafeFile, sha256 } from './postflop-ai/mw3-reviewed-archive.mjs';
import { prepareMw3SnapshotDeliveries, assertMw3IndependentReceipt, buildMw3DeliverySql } from './postflop-ai/mw3-reviewed-delivery.mjs';
import { restoreMw3PolicyParts } from './postflop-ai/mw3-delivery.mjs';

export const WRANGLER_VERSION = '4.147.0';
export const RUNTIME_PINS = Object.freeze({ wrangler: WRANGLER_VERSION, miniflare: '5.20261001.0-alpha', workerd: '1.20261001.1', esbuild: '0.28.1' });
export const UNRELATED_TABLES = Object.freeze(['account_data', 'account_native_attempts', 'account_native_oauth_states', 'account_native_sessions',
  'account_oauth_states', 'account_rate_limits', 'account_sessions', 'account_users', 'dataset_versions', 'postflop_flop_base_br',
  'postflop_policies', 'postflop_reasons', 'postflop_reports', 'postflop_spots', 'preflop_dataset_parts', 'preflop_datasets', 'ranked_matches', 'ranked_players']);
const FRONTEND = fileURLToPath(new URL('../', import.meta.url));
const BINDING = 'MW3_LOCAL_VERIFY', NAME = 'reysonai-mw3-local-verification';
const MW3_TABLES = ['mw3_policy_deliveries', 'mw3_policy_parts'];
const SQL_LIMIT = 128 * 1024 * 1024;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const sleep = ms => new Promise(done => setTimeout(done, ms));
const digest = body => ({ bytes: body.length, sha256: sha256(body) });
const SENTINEL_HEADER = JSON.stringify({ synthetic_local_preservation_fixture: true, label: "keep 雪 ; ' 🂡" });
const SENTINEL_HASH = sha256(SENTINEL_HEADER);

export function localConfig() {
  return { name: NAME, main: './worker.bundle.mjs', no_bundle: true, compatibility_date: '2026-09-01', send_metrics: false,
    dev: { ip: '127.0.0.1', local_protocol: 'http', watch: false },
    d1_databases: [{ binding: BINDING, database_name: NAME, database_id: '00000000-0000-0000-0000-000000000000' }] };
}
export function validateLocalConfig(config) {
  assert.deepEqual(config, localConfig(), 'Only an isolated dummy LOCAL D1 binding is allowed');
  return config;
}
export function parseArguments(argv) {
  const options = {}, keys = { '--manifest': 'manifest', '--archive': 'archive', '--receipt': 'receipt', '--sql': 'sql', '--wrangler': 'wrangler' };
  for (let index = 0; index < argv.length; index++) {
    const key = keys[argv[index]], value = argv[index + 1];
    assert.ok(key && !Object.hasOwn(options, key) && value && !value.startsWith('--'), 'Unknown, duplicate or missing verification argument');
    options[key] = argv[++index];
  }
  for (const key of Object.values(keys)) assert.ok(options[key], `Required: --${key}`);
  return options;
}
export function validateRuntimePackages(wrangler, miniflare, workerd, esbuild) {
  for (const [name, value] of Object.entries({ wrangler, miniflare, workerd, esbuild })) {
    assert.equal(value?.name, name, `Missing installed ${name} package`);
    assert.equal(value.version, RUNTIME_PINS[name], `Expected pinned ${name} ${RUNTIME_PINS[name]}`);
  }
  for (const name of ['miniflare', 'workerd', 'esbuild']) assert.equal(wrangler.dependencies?.[name], RUNTIME_PINS[name], `Wrangler ${name} dependency differs`);
  return RUNTIME_PINS;
}
// Resolve in a fresh short-lived process on every check. createRequire.resolve
// caches paths in-process and could otherwise miss a newly nested dependency.
export const RUNTIME_RESOLVER_SOURCE = String.raw`import { createRequire } from 'node:module';
import { realpathSync,readFileSync,existsSync } from 'node:fs';
import { join,dirname } from 'node:path';
const entry=realpathSync(process.argv[1]),root=dirname(dirname(entry)),cli=realpathSync(join(root,'wrangler-dist','cli.js'));
function installed(require,name){const file=realpathSync(require.resolve(name));let directory=dirname(file);for(;;){const path=join(directory,'package.json');if(existsSync(path)){const info=JSON.parse(readFileSync(path,'utf8'));if(info.name===name)return {entry:file,package_path:path,info:{name:info.name,version:info.version}};}const parent=dirname(directory);if(parent===directory)throw new Error('Cannot resolve installed '+name);directory=parent;}}
const require=createRequire(cli),dependencies=Object.fromEntries(['miniflare','workerd','esbuild'].map(name=>[name,installed(require,name)]));
const miniflare_workerd=installed(createRequire(dependencies.miniflare.entry),'workerd');
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
process.stdout.write(JSON.stringify({entry,cli_entry:cli,wrangler:{name:pkg.name,version:pkg.version,dependencies:Object.fromEntries(['miniflare','workerd','esbuild'].map(name=>[name,pkg.dependencies?.[name]]))},dependencies,miniflare_workerd}));`;
export function readRuntimePins(entry) {
  assert.ok(entry, 'An already installed pinned Wrangler entry is required; no npx/download fallback');
  const path = realpathSync(resolve(entry));
  assert.equal(basename(path), 'wrangler.js', 'Expected installed Wrangler bin/wrangler.js');
  const found = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', RUNTIME_RESOLVER_SOURCE, path],
    { encoding: 'utf8', env: localEnvironment(join(FRONTEND, '.local', 'mw3-runtime-resolver')), timeout: 10000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  assert.equal(found.entry, path, 'Runtime launcher resolution changed');
  const { dependencies, miniflare_workerd: miniflareWorkerd } = found;
  validateRuntimePackages(found.wrangler, dependencies.miniflare.info, dependencies.workerd.info, dependencies.esbuild.info);
  assert.equal(miniflareWorkerd.info.version, RUNTIME_PINS.workerd, 'Miniflare resolves a different workerd version');
  assert.equal(miniflareWorkerd.entry, dependencies.workerd.entry, 'Wrangler and Miniflare must resolve the same pinned workerd entry');
  return { entry: path, cli_entry: found.cli_entry, esbuild_entry: dependencies.esbuild.entry,
    dependency_resolution: Object.fromEntries([...Object.entries(dependencies), ['miniflare_workerd', miniflareWorkerd]]
      .map(([name, item]) => [name, { entry: item.entry, package_path: item.package_path }])), ...RUNTIME_PINS };
}

export function assertReviewedSql(sqlBytes, snapshot, receipt, deliveries) {
  assert.ok(Buffer.isBuffer(sqlBytes) && sqlBytes.length > 0 && sqlBytes.length <= SQL_LIMIT, 'Missing/oversized saved MW3 SQL');
  assertMw3IndependentReceipt(receipt, snapshot, deliveries);
  const regenerated = Buffer.from(buildMw3DeliverySql(snapshot, receipt, deliveries), 'utf8');
  assert.ok(sqlBytes.equals(regenerated), 'Saved MW3 SQL differs from exact independently reviewed delivery bytes');
  return digest(sqlBytes);
}
const repositoryPath = path => {
  const value = relative(MW3_REPOSITORY, resolve(path)).replaceAll('\\', '/');
  assert.ok(value && !value.startsWith('../') && !value.startsWith('/'), 'Saved input must be inside this repository');
  return value;
};
export function capturePinnedFiles(root, records) {
  const files = new Map();
  for (const record of records) {
    assert.ok(!files.has(record.path), 'Duplicate pinned capture path');
    const body = readSafeFile(root, record.path, record.bytes);
    assert.deepEqual(digest(body), { bytes: record.bytes, sha256: record.sha256 }, `Reviewed source changed during capture: ${record.path}`);
    files.set(record.path, body);
  }
  return files;
}
export function captureRuntimeSources(snapshot) {
  const { manifest } = snapshot, records = manifest.sources.map(row => ({ ...row, provenance: 'reviewed_manifest_source' }));
  const files = capturePinnedFiles(MW3_REPOSITORY, records);
  for (const path of ['apps/backend/src/mw3-transport.ts', 'apps/shared/mw3-approved.ts', 'apps/backend/scripts/sql/mw3-schema.sql']) {
    assert.ok(files.has(path), `Required reviewed runtime/schema source missing: ${path}`);
  }
  // Historical application migrations are fixture setup, not new publication
  // approval. Pin their complete inventory and bytes to the reviewed Git tree.
  const migrationRoot = 'apps/backend/migrations';
  const treePaths = execFileSync('git', ['--no-replace-objects', 'ls-tree', '-r', '-z', '--name-only', manifest.source_tree, '--', migrationRoot],
    { cwd: MW3_REPOSITORY, encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).split('\0')
    .filter(path => /^apps\/backend\/migrations\/\d+[^/]*\.sql$/.test(path)).sort();
  const paths = readdirSync(join(MW3_REPOSITORY, migrationRoot)).filter(name => /^\d+.*\.sql$/.test(name)).sort().map(name => `${migrationRoot}/${name}`);
  assert.ok(treePaths.length > 0, 'Missing application migration inventory in reviewed source tree');
  assert.deepEqual(paths, treePaths, 'Live application migration inventory differs from reviewed source tree');
  const migrationRecords = [];
  for (const path of paths) {
    const body = readSafeFile(MW3_REPOSITORY, path, MW3_ARCHIVE_LIMITS.file);
    const record = { path, ...digest(body), provenance: 'reviewed_git_tree_fixture_migration' };
    migrationRecords.push(record); records.push(record); files.set(path, body);
  }
  verifyMw3SourceTree(MW3_REPOSITORY, manifest.source_tree, migrationRecords);
  const schemaParts = [];
  for (const path of [...paths, 'apps/backend/scripts/sql/mw3-schema.sql']) {
    if (schemaParts.length) schemaParts.push(Buffer.from('\n'));
    schemaParts.push(files.get(path));
  }
  const schemaBytes = Buffer.concat(schemaParts);
  return { files, records: records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0), schemaBytes };
}
export function writeCapturedSources(directory, capture) {
  const root = join(directory, 'captured-source');
  for (const record of capture.records) {
    const body = capture.files.get(record.path);
    assert.ok(Buffer.isBuffer(body));
    assert.deepEqual(digest(body), { bytes: record.bytes, sha256: record.sha256 }, `Captured source bytes changed: ${record.path}`);
    const path = join(root, record.path); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body, { flag: 'wx', mode: 0o444 });
  }
  writeFileSync(join(directory, 'captured-source-ledger.json'), jsonBytes(capture.records), { flag: 'wx' });
  return root;
}
export function assertCapturedSources(directory, capture) {
  capturePinnedFiles(join(directory, 'captured-source'), capture.records);
}
// The child owns a fresh session/process group. Only that recorded group is
// ever terminated. Zombie-only groups have no executable members or D1 locks.
const GROUP_FUNCTIONS = String.raw`
def live_members(group):
 members=[]
 for name in os.listdir('/proc'):
  if not name.isdigit(): continue
  try:
   fields=open('/proc/'+name+'/stat').read().rpartition(')')[2].split()
   if int(fields[2])==group and int(fields[3])==group and fields[0]!='Z': members.append(int(name))
  except (OSError,ValueError,IndexError): pass
 return sorted(members)
def group_start_ticks(group):
 try: return int(open('/proc/'+str(group)+'/stat').read().rpartition(')')[2].split()[19])
 except (OSError,ValueError,IndexError): return None
def clean_group(group,expected_start=None):
 current=group_start_ticks(group)
 if current is not None and expected_start is not None and current!=expected_start: raise ValueError('Owned group identity was reused; refusing to signal it')
 if not isinstance(group,int) or group<=1: raise ValueError('Invalid owned group')
 for sig,seconds in [(signal.SIGTERM,3),(signal.SIGKILL,8)]:
  if not live_members(group): return True
  try: os.killpg(group,sig)
  except ProcessLookupError: pass
  deadline=time.monotonic()+seconds
  while time.monotonic()<deadline:
   if not live_members(group): return True
   time.sleep(0.05)
 return not live_members(group)
`;
export const SUPERVISOR_SOURCE = `import json,os,resource,signal,subprocess,sys,time
${GROUP_FUNCTIONS}
lease_path,metric_path,command_id,stdout_path,stderr_path,seconds=sys.argv[1:7]
child=None; group_birth=None; status=None; timed_out=False; interrupted=None; cleanup_complete=False
class SupervisorSignal(Exception): pass
def interrupt(sig,frame):
 global interrupted
 interrupted=sig
 raise SupervisorSignal()
signal.signal(signal.SIGTERM,interrupt); signal.signal(signal.SIGINT,interrupt)
try:
 with open(stdout_path,'wb') as out,open(stderr_path,'wb') as err:
  previous_mask=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
  try:
   child=subprocess.Popen(sys.argv[7:],start_new_session=True,stdout=out,stderr=err,preexec_fn=lambda:signal.pthread_sigmask(signal.SIG_SETMASK,previous_mask))
   group_birth=group_start_ticks(child.pid)
   if group_birth is None: raise ValueError('Cannot record owned child group birth identity')
   with open(lease_path,'x') as output: json.dump({'command_id':command_id,'group_id':child.pid,'group_start_ticks':group_birth,'supervisor_pid':os.getpid()},output)
  finally: signal.pthread_sigmask(signal.SIG_SETMASK,previous_mask)
  try: status=child.wait(timeout=float(seconds))
  except subprocess.TimeoutExpired: timed_out=True
except SupervisorSignal: pass
finally:
 signal.signal(signal.SIGTERM,signal.SIG_IGN); signal.signal(signal.SIGINT,signal.SIG_IGN)
 if child is not None:
  cleanup_complete=clean_group(child.pid,group_birth)
  try: status=child.wait(timeout=1)
  except subprocess.TimeoutExpired:
   try: os.killpg(child.pid,signal.SIGKILL)
   except ProcessLookupError: pass
   status=child.wait(timeout=8); cleanup_complete=clean_group(child.pid,group_birth)
 wrapper_status=124 if timed_out else 128+interrupted if interrupted else status if status is not None and status>=0 else 128-status if status is not None else 125
 if not cleanup_complete: wrapper_status=125
 with open(metric_path,'x') as output: json.dump({'command_id':command_id,'group_id':child.pid if child is not None else None,'max_rss_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,'exit_status':status,'wrapper_exit_status':wrapper_status,'timed_out':timed_out,'interrupted_signal':interrupted,'group_cleanup_complete':cleanup_complete},output)
sys.exit(wrapper_status)
`;
const CLEANUP_SOURCE = `import json,os,signal,sys,time
${GROUP_FUNCTIONS}
lease=json.loads(sys.argv[1]); complete=clean_group(lease['group_id'],lease['group_start_ticks'])
print(json.dumps({'command_id':lease['command_id'],'group_id':lease['group_id'],'group_cleanup_complete':complete,'live_members':live_members(lease['group_id'])}))
sys.exit(0 if complete else 1)
`;
function confirmOwnedGroupCleanup(directory, commandId, leasePath) {
  if (!existsSync(leasePath)) return null; // No recorded child means no group may be targeted.
  const lease = JSON.parse(readFileSync(leasePath, 'utf8'));
  assert.equal(lease.command_id, commandId, 'Refuse cleanup of a different command group');
  assert.ok(Number.isSafeInteger(lease.group_id) && lease.group_id > 1 && Number.isSafeInteger(lease.group_start_ticks) && lease.group_start_ticks > 0, 'Refuse cleanup of an unrecorded group identity');
  const check = spawnSync('python3', ['-c', CLEANUP_SOURCE, JSON.stringify(lease)],
    { cwd: directory, env: localEnvironment(directory), encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(directory, `${commandId}.group-cleanup.stdout.log`), check.stdout ?? '');
  writeFileSync(join(directory, `${commandId}.group-cleanup.stderr.log`), check.stderr ?? '');
  assert.ok(!check.error && !check.signal && check.status === 0, 'Owned command group did not stop; retained cleanup logs identify it');
  const result = JSON.parse(check.stdout);
  assert.equal(result.command_id, commandId); assert.equal(result.group_id, lease.group_id);
  assert.equal(result.group_cleanup_complete, true); assert.deepEqual(result.live_members, []);
  return result;
}
export function runSupervisedCommand({ directory, commandId, command, args, timeoutSeconds = 600 }) {
  const prefix = join(directory, commandId), stdoutPath = `${prefix}.stdout.log`, stderrPath = `${prefix}.stderr.log`,
    metricPath = `${prefix}.resource.json`, leasePath = `${prefix}.process.json`;
  writeFileSync(stdoutPath, ''); writeFileSync(stderrPath, ''); writeFileSync(`${prefix}.args.json`, JSON.stringify([command, ...args]));
  const result = spawnSync('python3', ['-c', SUPERVISOR_SOURCE, leasePath, metricPath, commandId, stdoutPath, stderrPath, String(timeoutSeconds), command, ...args],
    { cwd: directory, env: localEnvironment(directory), encoding: 'utf8', timeout: (timeoutSeconds + 20) * 1000,
      killSignal: 'SIGTERM', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(`${prefix}.supervisor.stdout.log`, result.stdout ?? ''); writeFileSync(`${prefix}.supervisor.stderr.log`, result.stderr ?? '');
  // This independent parent-side check also runs after outer timeout/buffer/error.
  // The supervisor's finally cannot be assumed to have completed in those cases.
  const cleanup = confirmOwnedGroupCleanup(directory, commandId, leasePath);
  const measurement = existsSync(metricPath) ? JSON.parse(readFileSync(metricPath, 'utf8')) : null;
  const stdout = readFileSync(stdoutPath, 'utf8'), stderr = readFileSync(stderrPath, 'utf8');
  const error = result.error ?? (result.status !== 0 || result.signal ? new Error('Owned local command failed') : null);
  if (error) {
    Object.assign(error, { status: result.status, signal: result.signal, stdout, stderr, command_id: commandId, command_resource: measurement, command_group_cleanup: cleanup });
    throw error;
  }
  assert.ok(measurement && cleanup, 'Successful wrapper has no complete child/group evidence');
  assert.equal(measurement.command_id, commandId); assert.equal(measurement.group_id, cleanup.group_id);
  assert.equal(measurement.exit_status, 0, 'Successful wrapper masked abnormal child exit');
  assert.equal(measurement.wrapper_exit_status, 0); assert.equal(measurement.timed_out, false);
  assert.equal(measurement.interrupted_signal, null); assert.equal(measurement.group_cleanup_complete, true);
  return { stdout, stderr, measurement, cleanup };
}
export function bundleCapturedWorker({ directory, pins, capture, expectedWorkerSha }) {
  assertCapturedSources(directory, capture);
  const runner = `const {build}=require(process.argv[1]);
build({entryPoints:[process.argv[2]],outfile:process.argv[3],absWorkingDir:process.cwd(),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,tsconfigRaw:'{}'})
.then(result=>require('node:fs').writeFileSync(process.argv[4],JSON.stringify(result.metafile)))
.catch(error=>{console.error(error);process.exitCode=1});`;
  const entry = join(directory, 'worker.mjs'), bundle = join(directory, 'worker.bundle.mjs'), metadataPath = join(directory, 'worker.bundle.meta.json');
  assert.equal(sha256(readFileSync(entry)), expectedWorkerSha, 'Local oracle wrapper changed before captured-source bundling');
  runSupervisedCommand({ directory, commandId: 'bundle', command: process.execPath,
    args: ['-e', runner, pins.esbuild_entry, entry, bundle, metadataPath], timeoutSeconds: 60 });
  assertCapturedSources(directory, capture);
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')), inputs = [];
  for (const path of Object.keys(metadata.inputs)) {
    const absolute = resolve(directory, path), capturedPath = relative(join(directory, 'captured-source'), absolute).replaceAll('\\', '/');
    const record = capture.records.find(row => row.path === capturedPath);
    assert.ok(absolute === entry || record, `Bundle read unreviewed/live source outside captured inputs: ${path}`);
    const body = readFileSync(absolute), value = digest(body);
    if (absolute === entry) assert.equal(value.sha256, expectedWorkerSha, 'Bundled oracle wrapper differs from the generated source');
    if (record) assert.deepEqual(value, { bytes: record.bytes, sha256: record.sha256 }, `Bundled input changed: ${path}`);
    assert.equal(metadata.inputs[path].bytes, body.length, `Bundle input byte size differs: ${path}`);
    inputs.push({ path: record?.path ?? 'local-oracle-worker-entry', ...value, provenance: record?.provenance ?? 'local_oracle_wrapper' });
  }
  assert.ok(inputs.some(row => row.path === 'apps/backend/src/mw3-transport.ts'), 'Bundle omitted the actual reviewed transport route');
  assert.ok(inputs.some(row => row.path === 'apps/shared/mw3-approved.ts'), 'Bundle omitted the actual reviewed shared registry');
  const body = readFileSync(bundle);
  assert.ok(body.length > 0, 'Missing compiled local worker');
  writeFileSync(join(directory, 'worker.bundle.input-ledger.json'), jsonBytes(inputs), { flag: 'wx' });
  return { ...digest(body), inputs, input_ledger_sha256: sha256(jsonBytes(inputs)) };
}
export async function loadReviewedDelivery({ manifest, archive, receipt, sql }) {
  // Exactly one bounded read of each saved input. All downstream checks use
  // these same raw bytes; no later receipt/archive/SQL reread can change them.
  const manifestBytes = readSafeFile(MW3_REPOSITORY, repositoryPath(manifest), MW3_ARCHIVE_LIMITS.manifest);
  const archiveBytes = readSafeFile(MW3_REPOSITORY, repositoryPath(archive), MW3_ARCHIVE_LIMITS.compressed);
  const receiptBytes = readSafeFile(MW3_REPOSITORY, repositoryPath(receipt), MW3_ARCHIVE_LIMITS.manifest);
  const sqlBytes = readSafeFile(MW3_REPOSITORY, repositoryPath(sql), SQL_LIMIT);
  const snapshot = verifyMw3Snapshot(manifestBytes, archiveBytes);
  const review = JSON.parse(receiptBytes.toString('utf8'));
  const deliveries = await prepareMw3SnapshotDeliveries(snapshot);
  const sqlRecord = assertReviewedSql(sqlBytes, snapshot, review, deliveries);
  const capture = captureRuntimeSources(snapshot);
  return { snapshot, review, deliveries, sqlBytes, capture, records: { manifest: digest(manifestBytes), archive: digest(archiveBytes),
    receipt: digest(receiptBytes), canonical_receipt: digest(jsonBytes(review)), sql: sqlRecord } };
}
export function completedJson(output) {
  let result;
  try { result = JSON.parse(output); } catch { throw new Error('No completed JSON result; zero Wrangler launcher exit is not import proof'); }
  assert.ok(Array.isArray(result) && result.length > 0 && result.every(row => row.success === true), 'Every LOCAL D1 statement must finish successfully');
  return result;
}
export function assertFinishedSqlFailure(error, pattern) {
  assert.ok(error && Number.isInteger(error.status) && error.status > 0 && error.status < 128 && error.status !== 124 && !error.signal,
    'Rollback requires a completed SQL error, never timeout, signal or launcher failure');
  const measurement = error.command_resource;
  assert.ok(typeof error.command_id === 'string' && measurement?.command_id === error.command_id, 'Rollback resource evidence must belong to this exact command');
  assert.ok(Number.isInteger(measurement.exit_status) && measurement.exit_status > 0 && measurement.exit_status < 128 &&
    measurement.exit_status !== 124 && measurement.timed_out === false && measurement.interrupted_signal === null &&
    measurement.wrapper_exit_status === error.status && measurement.exit_status === error.status && measurement.group_cleanup_complete === true,
    'Original child exit must be a normal completed SQL failure; killed/timed-out children never prove rollback');
  assert.ok(error.command_group_cleanup?.command_id === error.command_id && error.command_group_cleanup.group_id === measurement.group_id &&
    error.command_group_cleanup.group_cleanup_complete === true && Array.isArray(error.command_group_cleanup.live_members) && error.command_group_cleanup.live_members.length === 0,
    'Parent must independently confirm this failed command group has stopped');
  assert.match(`${error.stdout ?? ''}\n${error.stderr ?? ''}`, pattern, 'Rollback failed for an unexpected reason');
}
function inspect(path, callback) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return callback(db); } finally { db.close(); }
}
function findDatabase(directory) {
  const paths = [], visit = path => { for (const item of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, item.name); if (item.isDirectory()) visit(child); else if (item.name.endsWith('.sqlite')) paths.push(child);
  } };
  visit(directory);
  const found = paths.filter(path => inspect(path, db => db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name IN ('mw3_policy_deliveries','mw3_policy_parts','account_users')").get().n === 3));
  assert.equal(found.length, 1, 'Expected exactly one isolated real-schema MW3 D1 database');
  return found[0];
}
export function databaseSnapshot(db, { excludeMw3 = false } = {}) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE substr(name,1,7) <> 'sqlite_' AND substr(name,1,4) <> '_cf_' ORDER BY type,name").all()
    .filter(row => !excludeMw3 || !MW3_TABLES.includes(row.tbl_name));
  const rows = {};
  for (const { name } of schema.filter(row => row.type === 'table')) {
    const hashes = [];
    for (const row of db.prepare(`SELECT * FROM ${identifier(name)}`).iterate()) hashes.push(sha256(jsonBytes(row)));
    rows[name] = hashes.sort();
  }
  return { schema, rows };
}
export function assertDeliveryRows(db, deliveries) {
  const ledger = [];
  for (const delivery of deliveries) {
    const header = db.prepare('SELECT spot_id,stage,header_json FROM mw3_policy_deliveries WHERE delivery_hash=?').get(delivery.deliveryHash);
    assert.ok(header, 'Missing accepted delivery header');
    assert.deepEqual({ ...header }, { spot_id: delivery.header.manifest.spotId, stage: delivery.stage, header_json: delivery.headerText });
    assert.equal(sha256(header.header_json), delivery.deliveryHash, 'Header SHA-256 differs');
    const hash = createHash('sha256'); let count = 0, bytes = 0;
    for (const row of db.prepare('SELECT part,body FROM mw3_policy_parts WHERE delivery_hash=? ORDER BY part').iterate(delivery.deliveryHash)) {
      const expected = delivery.parts[count];
      assert.ok(expected, 'Unexpected extra MW3 part');
      assert.deepEqual({ ...row }, { part: count, body: expected.body }, 'MW3 part bytes/order differ');
      assert.equal(sha256(row.body), expected.bodyHash, 'MW3 per-part SHA-256 differs');
      hash.update(row.body); bytes += Buffer.byteLength(row.body); count++;
    }
    assert.equal(count, delivery.header.manifest.parts, 'Missing MW3 parts');
    assert.equal(bytes, delivery.header.manifest.bytes, 'MW3 payload byte count differs');
    const payloadHash = hash.digest('hex');
    assert.equal(payloadHash, delivery.header.manifest.payloadHash, 'Full MW3 payload SHA-256 differs');
    ledger.push({ delivery_hash: delivery.deliveryHash, stage: delivery.stage, parts: count, bytes, payload_sha256: payloadHash });
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'Orphan MW3/application rows');
  return ledger;
}
export function preservationSeed() {
  return `${UNRELATED_SEED}\nINSERT INTO preflop_datasets VALUES ('local-preserved-preflop','${sha256('{}')}',2,1);
INSERT INTO preflop_dataset_parts VALUES ('local-preserved-preflop',0,'{}');
-- Deliberately synthetic unrelated MW3 preservation fixture, never approval.
INSERT INTO mw3_policy_deliveries VALUES ('${SENTINEL_HASH}','local-unrelated-fixture','flop',${quote(SENTINEL_HEADER)});
INSERT INTO mw3_policy_parts VALUES ('${SENTINEL_HASH}',0,'local unrelated 雪 ; '' 🂡');\n`;
}
export function conflictSetup(deliveries, kind) {
  assert.ok(['part', 'header'].includes(kind), 'Unknown immutable conflict probe');
  assert.equal(deliveries.length, 2); assert.equal(deliveries[0].stage, 'flop'); assert.equal(deliveries[1].stage, 'later');
  const [early, late] = deliveries, last = late.parts.at(-1);
  assert.ok(last && late.parts.length > 0, 'Late immutable part required');
  // Missing earlier rows make partial commits observable. The exact reviewed
  // file repairs them before encountering the late immutable conflict.
  const prefix = `DELETE FROM mw3_policy_parts WHERE delivery_hash=${quote(early.deliveryHash)};\nDELETE FROM mw3_policy_deliveries WHERE delivery_hash=${quote(early.deliveryHash)};\n`;
  return prefix + (kind === 'part'
    ? `UPDATE mw3_policy_parts SET body='synthetic-local-conflicting-immutable-body' WHERE delivery_hash=${quote(late.deliveryHash)} AND part=${last.part};\n`
    : `UPDATE mw3_policy_deliveries SET header_json='{"synthetic_local_conflicting_header":true}' WHERE delivery_hash=${quote(late.deliveryHash)};\n`);
}
function repairConflict(deliveries, kind) {
  const late = deliveries[1], last = late.parts.at(-1);
  return kind === 'part'
    ? `UPDATE mw3_policy_parts SET body=${quote(last.body)} WHERE delivery_hash=${quote(late.deliveryHash)} AND part=${last.part};\n`
    : `UPDATE mw3_policy_deliveries SET header_json=${quote(late.headerText)} WHERE delivery_hash=${quote(late.deliveryHash)};\n`;
}
export function localWorkerSource(deliveries) {
  const pins = deliveries.map(row => ({ spotId: row.header.manifest.spotId, stage: row.stage, deliveryHash: row.deliveryHash }));
  return `// Ephemeral localhost oracle only. These pins never edit or authorize the shared production registry.
import { routeMw3Transport } from ${JSON.stringify('./captured-source/apps/backend/src/mw3-transport.ts')};
import { MW3_APPROVED_POLICIES } from ${JSON.stringify('./captured-source/apps/shared/mw3-approved.ts')};
const LOCAL_ORACLE_PINS = ${JSON.stringify(pins)};
export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (MW3_APPROVED_POLICIES.length !== 0) return new Response('Shared MW3 registry must remain empty for this oracle', { status: 500 });
  if (url.pathname === '/__mw3_verify_health') return Response.json({ local_only: true, registry_entries: MW3_APPROVED_POLICIES.length });
  const proof = url.pathname.startsWith('/__mw3_local_oracle/');
  if (proof) { url.pathname = url.pathname.slice('/__mw3_local_oracle'.length); request = new Request(url, request); }
  return routeMw3Transport(request, env.${BINDING}, proof ? LOCAL_ORACLE_PINS : MW3_APPROVED_POLICIES);
} };\n`;
}
async function availablePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}
async function stopWorker(worker) {
  if (!worker || !worker.pid || worker.__mw3Closed) return;
  const closed = new Promise(done => worker.once('close', done));
  try { if (worker.exitCode === null && worker.signalCode === null) process.kill(-worker.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  const timer = setTimeout(() => { try { process.kill(-worker.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }, 10_000);
  try { await closed; } finally { clearTimeout(timer); }
}
async function startWorker({ wrangler, directory, configPath, persist, restart }) {
  const port = await availablePort(), output = join(directory, `worker-${restart}.stdout.log`), errors = join(directory, `worker-${restart}.stderr.log`);
  writeFileSync(output, ''); writeFileSync(errors, '');
  const worker = spawn(process.execPath, [wrangler, 'dev', '--local', '--config', configPath, '--persist-to', persist,
    '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--show-interactive-dev-session=false'],
    { cwd: directory, env: localEnvironment(directory), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  worker.__mw3Closed = false; worker.once('close', () => { worker.__mw3Closed = true; });
  let spawnError; worker.once('error', error => { spawnError = error; });
  worker.stdout.on('data', body => appendFileSync(output, body)); worker.stderr.on('data', body => appendFileSync(errors, body));
  const origin = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      assert.ok(!spawnError, `Wrangler worker spawn failed: ${spawnError?.message}`);
      assert.ok(worker.exitCode === null && worker.signalCode === null, 'Wrangler worker exited before health verification');
      try {
        const response = await fetch(`${origin}/__mw3_verify_health`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) {
          assert.deepEqual(await response.json(), { local_only: true, registry_entries: 0 });
          return { worker, origin };
        }
      } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
      await sleep(100);
    }
    throw new Error('Pinned LOCAL Wrangler worker did not become ready; retained logs contain details');
  } catch (error) { await stopWorker(worker); throw error; }
}
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

export async function verifyMw3LocalD1(options) {
  const started = performance.now(), [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || major === 22 && minor >= 20, 'Node >=22.20 required');
  assert.equal(process.platform, 'linux', 'Strict process-group lifecycle/resource proof currently requires Linux');
  const local = join(FRONTEND, '.local'); mkdirSync(local, { recursive: true });
  const directory = mkdtempSync(join(local, 'verify-mw3-d1-'));
  const report = { schema_version: 1, status: 'running', local_only: true, mode: 'strict-whole-file', evidence_directory: directory,
    production_approval: 'not granted by this oracle', remote_atomicity: 'not tested', gates: [] };
  let worker;
  const save = () => writeFileSync(join(directory, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  const mark = name => { report.gates.push(name); save(); };
  save();
  try {
    const pins = readRuntimePins(options.wrangler); report.runtime_pins = pins;
    const prepared = await loadReviewedDelivery(options); report.inputs = prepared.records; report.spot = prepared.snapshot.manifest.spot.id;
    mark('saved_snapshot_receipt_and_sql_exact_bytes');
    mkdirSync(join(directory, 'home/.config'), { recursive: true });
    // Only captured, verified bytes are written below. The original saved file
    // is not reread, split, rewritten, or used as a disposable mutable input.
    const reviewedPath = join(directory, 'reviewed.sql'); writeFileSync(reviewedPath, prepared.sqlBytes, { flag: 'wx' });
    assert.deepEqual(digest(readFileSync(reviewedPath)), prepared.records.sql);
    writeCapturedSources(directory, prepared.capture); report.captured_source_ledger_sha256 = sha256(jsonBytes(prepared.capture.records));
    report.captured_sources = prepared.capture.records; report.fixture_schema = digest(prepared.capture.schemaBytes);
    const workerText = localWorkerSource(prepared.deliveries);
    writeFileSync(join(directory, 'worker.mjs'), workerText); report.worker_sha256 = sha256(workerText);
    report.worker_bundle = bundleCapturedWorker({ directory, pins, capture: prepared.capture, expectedWorkerSha: report.worker_sha256 });
    const assertIsolatedInputs = () => {
      assertCapturedSources(directory, prepared.capture);
      assert.deepEqual(readRuntimePins(pins.entry), pins, 'Installed runtime resolution or metadata pins changed');
      assert.equal(sha256(readFileSync(join(directory, 'worker.mjs'))), report.worker_sha256, 'Local oracle source changed');
      validateLocalConfig(JSON.parse(readFileSync(configPath, 'utf8')));
      assert.deepEqual(digest(readFileSync(join(directory, 'worker.bundle.mjs'))), { bytes: report.worker_bundle.bytes, sha256: report.worker_bundle.sha256 }, 'Compiled worker changed after reviewed source bundling');
      assert.deepEqual(digest(readFileSync(reviewedPath)), prepared.records.sql, 'Isolated reviewed SQL changed');
    };
    mark('captured_reviewed_runtime_and_schema_bundle_identity');
    const configPath = join(directory, 'wrangler.json'), persist = join(directory, 'state');
    writeFileSync(configPath, JSON.stringify(validateLocalConfig(localConfig())));
    let commands = 0, importerMaxRss = 0;
    const execute = args => {
      assertIsolatedInputs();
      const commandId = `command-${String(commands++).padStart(3, '0')}`;
      let result, failure;
      try { result = runSupervisedCommand({ directory, commandId, command: process.execPath, args: [pins.entry, ...args] }); }
      catch (error) { failure = error; }
      const measurement = result?.measurement ?? failure?.command_resource;
      assert.ok(measurement && measurement.command_id === commandId, 'Exact command child resource telemetry is missing; original failure logs are retained');
      assert.ok(Number.isInteger(measurement.max_rss_kib) && measurement.max_rss_kib > 0, 'Positive waited-command resource telemetry required');
      importerMaxRss = Math.max(importerMaxRss, measurement.max_rss_kib);
      assert.ok(importerMaxRss <= 3 * 1024 * 1024, 'Strict importer exceeded 3 GiB command RSS; split imports are forbidden');
      if (failure) throw failure;
      return result.stdout;
    };
    assert.equal(execute(['--version']).trim(), WRANGLER_VERSION, 'Actual Wrangler runtime version differs'); mark('installed_and_executed_runtime_pins');
    const importFile = path => {
      assert.deepEqual(digest(readFileSync(reviewedPath)), prepared.records.sql, 'Isolated reviewed SQL changed');
      return completedJson(execute(['d1', 'execute', BINDING, '--local', '--yes', '--config', configPath, '--persist-to', persist, '--file', path, '--json']));
    };
    const setup = (name, text) => { const path = join(directory, name); writeFileSync(path, text, { flag: 'wx' }); importFile(path); };
    setup('synthetic-local-seed.sql', Buffer.concat([prepared.capture.schemaBytes, Buffer.from(`\n${preservationSeed()}`)]));
    const dbPath = findDatabase(persist), all = () => inspect(dbPath, db => databaseSnapshot(db));
    const preserved = inspect(dbPath, db => databaseSnapshot(db, { excludeMw3: true }));
    assert.deepEqual(Object.keys(preserved.rows).sort(), UNRELATED_TABLES, 'All 18 current unrelated tables must be covered');
    for (const [name, rows] of Object.entries(preserved.rows)) assert.equal(rows.length, 1, `${name}: missing unrelated preservation sentinel`);
    const sentinel = inspect(dbPath, db => databaseSnapshot(db));
    const verify = () => inspect(dbPath, db => {
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      report.delivery_rows = assertDeliveryRows(db, prepared.deliveries);
      assert.deepEqual(databaseSnapshot(db, { excludeMw3: true }), preserved, 'Unrelated schema/rows changed');
      const current = databaseSnapshot(db);
      for (const table of MW3_TABLES) for (const hash of sentinel.rows[table]) assert.ok(current.rows[table].includes(hash), 'Unrelated immutable MW3 delivery changed');
      assert.equal(current.rows.mw3_policy_deliveries.length, 3, 'Unexpected MW3 header rows');
      assert.equal(current.rows.mw3_policy_parts.length, 1 + prepared.deliveries.reduce((sum, row) => sum + row.parts.length, 0), 'Unexpected MW3 part rows');
    });
    for (let pass = 1; pass <= 2; pass++) {
      importFile(reviewedPath); verify(); mark(`whole_file_exact_import_${pass}`);
      options.log?.(`Strict MW3 LOCAL D1 import ${pass}/2: exact header/chunk/hash equality and all 18 unrelated tables verified.`);
    }
    const committed = all();
    for (const kind of ['part', 'header']) {
      setup(`synthetic-local-${kind}-conflict.sql`, conflictSetup(prepared.deliveries, kind));
      const before = all(); let failure;
      try { importFile(reviewedPath); } catch (error) { failure = error; }
      assertFinishedSqlFailure(failure, kind === 'part' ? /NOT NULL constraint failed: mw3_policy_parts\.body/i : /NOT NULL constraint failed: mw3_policy_deliveries\.header_json/i);
      assert.deepEqual(all(), before, `Full-file immutable ${kind} conflict rollback changed rows/schema`);
      mark(`whole_file_immutable_${kind}_conflict_rollback`);
      setup(`synthetic-local-${kind}-repair.sql`, repairConflict(prepared.deliveries, kind)); importFile(reviewedPath); verify();
      assert.deepEqual(all(), committed, 'Exact delivery did not restore the committed reference after synthetic conflict repair');
    }
    for (let restart = 0; restart < 2; restart++) {
      assertIsolatedInputs();
      const running = await startWorker({ wrangler: pins.entry, directory, configPath, persist, restart }); worker = running.worker;
      const restored = await assertApiRestoration(running.origin, prepared);
      await stopWorker(worker); worker = undefined;
      assert.deepEqual(all(), committed, 'Persistent D1 changed after worker startup/API/restoration/shutdown'); verify();
      report.api_restoration = restored; mark(restart ? 'runtime_restart_persistence_and_api_restoration' : 'actual_route_api_restoration_and_empty_registry');
    }
    assertIsolatedInputs();
    report.status = 'pass'; report.local_transactions_per_import = 1; report.repeated_imports = 2;
    report.unrelated_tables_preserved = UNRELATED_TABLES; report.full_file_failure_rollback = true;
    report.verifier_max_rss_kib = process.resourceUsage().maxRSS; report.importer_max_rss_kib = importerMaxRss;
    report.importer_measurement_scope = 'Linux RUSAGE_CHILDREN maximum per waited Wrangler command; not simultaneous process-tree aggregate RSS';
    report.elapsed_seconds = Number(((performance.now() - started) / 1000).toFixed(3)); save(); return report;
  } catch (error) {
    report.status = 'fail'; report.error = { message: error.message, status: error.status ?? null, signal: error.signal ?? null };
    report.elapsed_seconds = Number(((performance.now() - started) / 1000).toFixed(3)); save();
    error.message += ` (retained LOCAL evidence: ${directory})`; throw error;
  } finally { await stopWorker(worker); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyMw3LocalD1({ ...parseArguments(process.argv.slice(2)), log: text => console.error(text) }).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(`Strict LOCAL MW3 verification failed: ${error.message}`);
    if (error.stdout) console.error(error.stdout); if (error.stderr) console.error(error.stderr); process.exitCode = 1;
  });
}
