// Verify exactly saved, independently reviewed MW3 delivery bytes in LOCAL D1.
// One complete SQL file per import. No remote mode, strategy generation, receipt
// creation, publication-registry edits, credentials, downloads or deployments.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { UNRELATED_SEED } from '../verify-preflop-local-d1.mjs';
import { localEnvironment, runSupervisedCommand, assertCompletedCommand, readWranglerLauncherAttestation, assertWranglerLauncherAttestation, assertWranglerWorkerProcess, assertWranglerSigtermTeardown } from './mw3-local-command.mjs';
export { runSupervisedCommand } from './mw3-local-command.mjs';
export { assertApiRestoration } from './mw3-api-oracle.mjs';
import { assertApiInputLedger } from './mw3-api-oracle.mjs';
import { verifyMw3SourceTree } from '../postflop-ai/mw3-source-tree.mjs';
import { MW3_REPOSITORY, verifyMw3Snapshot } from '../postflop-ai/mw3-reviewed-snapshot.mjs';
import { MW3_ARCHIVE_LIMITS, jsonBytes, readSafeFile, sha256 } from '../postflop-ai/mw3-reviewed-archive.mjs';
import { MW3_APPROVED_POLICIES } from '../../../shared/mw3-approved.ts';
import { parseMw3ApprovedRegistry } from '../postflop-ai/mw3-reviewed-restore.mjs';
import { assertRegistryMode, assertApiPhase, registryHealth, apiPhaseRows } from './mw3-registry-mode.mjs';
import { prepareMw3SnapshotDeliveries, mw3DeliveryPins, assertMw3IndependentReceipt, buildMw3DeliverySql } from '../postflop-ai/mw3-reviewed-delivery.mjs';

export const WRANGLER_VERSION = '4.147.0';
export const RUNTIME_PINS = Object.freeze({ wrangler: WRANGLER_VERSION, miniflare: '5.20261001.0-alpha', workerd: '1.20261001.1', esbuild: '0.28.1' });
export const UNRELATED_TABLES = Object.freeze(['account_data', 'account_native_attempts', 'account_native_oauth_states', 'account_native_sessions',
  'account_oauth_states', 'account_rate_limits', 'account_sessions', 'account_users', 'dataset_versions',
  'fastfold_actions', 'fastfold_dataset_parts', 'fastfold_players', 'fastfold_results', 'fastfold_sessions',
  'human_rank_players', 'human_rank_receipts', 'human_rank_results', 'human_rank_tables', 'postflop_flop_base_br',
  'postflop_policies', 'postflop_reasons', 'postflop_reports', 'postflop_spots', 'preflop_dataset_parts', 'preflop_datasets', 'ranked_matches', 'ranked_players']);
const FRONTEND = fileURLToPath(new URL('../../', import.meta.url));
const BINDING = 'MW3_LOCAL_VERIFY', NAME = 'reysonai-mw3-local-verification';
const MW3_TABLES = ['mw3_policy_deliveries', 'mw3_policy_parts'];
const SQL_LIMIT = 128 * 1024 * 1024;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const digest = body => ({ bytes: body.length, sha256: sha256(body) });
const SENTINEL_HEADER = JSON.stringify({ synthetic_local_preservation_fixture: true, label: "keep 雪 ; ' 🂡" });
const SENTINEL_HASH = sha256(SENTINEL_HEADER);

export function localConfig() {
  return { name: NAME, main: './worker-runtime/worker.bundle.mjs', no_bundle: true, find_additional_modules: false, compatibility_date: '2026-09-01', send_metrics: false,
    dev: { ip: '127.0.0.1', local_protocol: 'http' },
    d1_databases: [{ binding: BINDING, database_name: NAME, database_id: '00000000-0000-0000-0000-000000000000' }] };
}
export function validateLocalConfig(config) {
  assert.deepEqual(config, localConfig(), 'Only an isolated dummy LOCAL D1 binding is allowed');
  return config;
}
export function parseArguments(argv) {
  const options = {}, keys = { '--manifest': 'manifest', '--archive': 'archive', '--receipt': 'receipt', '--sql': 'sql', '--wrangler': 'wrangler', '--registry-mode': 'registryMode' };
  for (let index = 0; index < argv.length; index++) {
    const key = keys[argv[index]], value = argv[index + 1];
    assert.ok(key && !Object.hasOwn(options, key) && value && !value.startsWith('--'), 'Unknown, duplicate or missing verification argument');
    options[key] = argv[++index];
  }
  for (const key of ['manifest', 'archive', 'receipt', 'sql', 'wrangler']) assert.ok(options[key], `Required: --${key}`);
  assertRegistryMode(options.registryMode);
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
export function readRuntimePins(entry, { directory = null, supervisorPath } = {}) {
  assert.ok(entry, 'An already installed pinned Wrangler entry is required; no npx/download fallback');
  const path = realpathSync(resolve(entry));
  assert.equal(basename(path), 'wrangler.js', 'Expected installed Wrangler bin/wrangler.js');
  if (!directory) {
    const local = join(FRONTEND, '.local'); mkdirSync(local, { recursive: true });
    directory = mkdtempSync(join(local, 'mw3-runtime-resolver-'));
  }
  const resolverRoot = mkdtempSync(join(directory, 'resolver-'));
  const found = JSON.parse(runSupervisedCommand({ directory: resolverRoot, commandId: 'runtime-resolution', command: process.execPath,
    args: ['--input-type=module', '-e', RUNTIME_RESOLVER_SOURCE, path], timeoutMs: 10000, outputBytes: 1024 * 1024, supervisorPath }).stdout);
  assert.equal(found.entry, path, 'Runtime launcher resolution changed');
  const { dependencies, miniflare_workerd: miniflareWorkerd } = found;
  validateRuntimePackages(found.wrangler, dependencies.miniflare.info, dependencies.workerd.info, dependencies.esbuild.info);
  assert.equal(miniflareWorkerd.info.version, RUNTIME_PINS.workerd, 'Miniflare resolves a different workerd version');
  assert.equal(miniflareWorkerd.entry, dependencies.workerd.entry, 'Wrangler and Miniflare must resolve the same pinned workerd entry');
  return { entry: path, cli_entry: found.cli_entry, launcher_attestation: readWranglerLauncherAttestation(path), esbuild_entry: dependencies.esbuild.entry,
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
export function bundleCapturedWorker({ directory, pins, capture, expectedWorkerSha }) {
  assertCapturedSources(directory, capture);
  const runner = `process.env.ESBUILD_WORKER_THREADS='0';const {buildSync}=require(process.argv[1]);
try {const result=buildSync({entryPoints:[process.argv[2]],outfile:process.argv[3],absWorkingDir:process.cwd(),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,tsconfigRaw:'{}'});
require('node:fs').writeFileSync(process.argv[4],JSON.stringify(result.metafile));}
catch(error){console.error(error);process.exitCode=1};`;
  const entry = join(directory, 'worker.mjs'), bundle = join(directory, 'worker-runtime', 'worker.bundle.mjs'), metadataPath = join(directory, 'worker.bundle.meta.json');
  mkdirSync(join(directory, 'worker-runtime'), { mode: 0o700 });
  assert.equal(sha256(readFileSync(entry)), expectedWorkerSha, 'Local oracle wrapper changed before captured-source bundling');
  runSupervisedCommand({ directory, commandId: 'bundle', command: process.execPath,
    args: ['-e', runner, pins.esbuild_entry, entry, bundle, metadataPath], timeoutMs: 60000, supervisorPath: join(directory, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py') });
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
export function bundleCapturedApiControl({ directory, pins, capture }) {
  assertCapturedSources(directory, capture);
  const entry = join(directory, 'captured-source/apps/frontend/scripts/ci/mw3-api-oracle.mjs');
  const bundle = join(directory, 'api.control.bundle.mjs'), metadataPath = join(directory, 'api.control.bundle.meta.json');
  const runner = `process.env.ESBUILD_WORKER_THREADS='0';const {buildSync}=require(process.argv[1]);
try {const result=buildSync({entryPoints:[process.argv[2]],outfile:process.argv[3],absWorkingDir:process.cwd(),bundle:true,format:'esm',platform:'node',target:'node22',metafile:true,tsconfigRaw:'{}'});
require('node:fs').writeFileSync(process.argv[4],JSON.stringify(result.metafile));}
catch(error){console.error(error);process.exitCode=1};`;
  runSupervisedCommand({ directory, commandId: 'bundle-api-control', command: process.execPath,
    args: ['-e', runner, pins.esbuild_entry, entry, bundle, metadataPath], timeoutMs: 60000,
    supervisorPath: join(directory, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py') });
  assertCapturedSources(directory, capture);
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')), inputs = [];
  for (const path of Object.keys(metadata.inputs)) {
    const absolute = resolve(directory, path), capturedPath = relative(join(directory, 'captured-source'), absolute).replaceAll('\\', '/');
    const record = capture.records.find(row => row.path === capturedPath);
    assert.ok(record, `API bundle read unreviewed/live source: ${path}`);
    const body = readFileSync(absolute);
    assert.deepEqual(digest(body), { bytes: record.bytes, sha256: record.sha256 });
    assert.equal(metadata.inputs[path].bytes, body.length);
    inputs.push({ ...record });
  }
  for (const path of ['apps/frontend/scripts/ci/mw3-api-oracle.mjs', 'apps/frontend/scripts/ci/mw3-local-command.mjs', 'apps/frontend/scripts/postflop-ai/mw3-delivery.mjs']) {
    assert.ok(inputs.some(row => row.path === path), `API control bundle omitted reviewed input: ${path}`);
  }
  const body = readFileSync(bundle); assert.ok(body.length > 0);
  writeFileSync(join(directory, 'api.control.input-ledger.json'), jsonBytes(inputs), { flag: 'wx' });
  return { ...digest(body), inputs, input_ledger_sha256: sha256(jsonBytes(inputs)) };
}
export function assertApiCompletion(outcome, completion, inputLedgerBytes, expectedRows) {
  assertCompletedCommand(outcome, { apiTeardown: true });
  assert.ok(completion?.worker_identity && outcome.lease.owned.some(row => row.pid === completion.worker_identity.pid && row.start_ticks === completion.worker_identity.start_ticks), 'API worker birth is absent from owned lease');
  assert.deepEqual(Object.keys(completion.worker_identity).sort(), ['pid', 'start_ticks'], 'Malformed worker identity fields');
  assert.deepEqual(Object.keys(completion.live_worker_before_completion ?? {}).sort(), ['pid', 'start_ticks', 'state'], 'Malformed live-worker handoff fields');
  const worker = completion.worker_identity, history = outcome.resource.cleanup_history;
  assert.ok(completion.live_worker_before_completion?.pid === worker.pid &&
    completion.live_worker_before_completion.start_ticks === worker.start_ticks &&
    typeof completion.live_worker_before_completion.state === 'string' &&
    !['Z', 'X', 'x'].includes(completion.live_worker_before_completion.state), 'Worker was not live at completion handoff');
  const reaped = history.flatMap(record => record.reaped).filter(row => row.pid === worker.pid && row.start_ticks === worker.start_ticks);
  assert.equal(reaped.length, 1, 'Require one unambiguous anchored reaped status for the exact worker birth');
  const terminated = history.some(record => record.term_pids.includes(worker.pid));
  const killed = history.some(record => record.kill_pids.includes(worker.pid));
  const ledger = JSON.parse(inputLedgerBytes), runtime = completion.worker_runtime;
  assert.deepEqual(Object.keys(runtime ?? {}).sort(), ['launcher_completion', 'launcher_prelaunch', 'process']);
  assert.deepEqual(runtime.launcher_prelaunch, ledger.wrangler_launcher ?? null);
  assert.deepEqual(runtime.launcher_completion, ledger.wrangler_launcher ?? null);
  assertWranglerWorkerProcess(runtime.process, dirname(outcome.evidence_directory), ledger.wrangler, worker);
  assert.deepEqual(completion.live_worker_before_completion, runtime.process.live_after);
  const launcherTerm = reaped[0].returncode === 143 && assertWranglerSigtermTeardown(outcome, completion, inputLedgerBytes);
  assert.ok((reaped[0].returncode === 0 || reaped[0].returncode === -15) && terminated || reaped[0].returncode === -9 && killed || launcherTerm,
    'Worker must have a compatible controlled owner teardown; spontaneous failure/exit is not successful API lifecycle evidence');
  assert.deepEqual(completion, { schema_version: 1, command_id: outcome.command_id,
    controller_identity: { pid: outcome.resource.child_pid, start_ticks: outcome.resource.child_start_ticks }, worker_identity: completion.worker_identity, live_worker_before_completion: completion.live_worker_before_completion,
    local_only: true, success: true, input_ledger: digest(inputLedgerBytes), worker_runtime: runtime, rows: expectedRows },
    'API completion must bind exact successful controller, inputs and every restored delivery');
  return completion.rows;
}
export function runCapturedApiPhase({ directory, pins, capture, prepared, restart, control, probe = null }) {
  const registryContract = prepared.registryContract ?? { mode: 'empty', entries: 0 };
  assertApiPhase(registryContract.mode, restart);
  assert.deepEqual(probe, restart < 2 ? null : { kind: restart === 2 ? 'header' : 'part', delivery_hash: prepared.deliveries[1].deliveryHash, ...(restart === 3 ? { part: prepared.deliveries[1].parts.at(-1).part } : {}) }, 'Only the two fixed activated corruption probes are allowed');
  assertCapturedSources(directory, capture);
  assert.deepEqual(digest(readFileSync(join(directory, 'api.control.bundle.mjs'))), { bytes: control.bytes, sha256: control.sha256 });
  const launcherAttestation = pins.wrangler === WRANGLER_VERSION || pins.launcher_attestation != null ?
    assertWranglerLauncherAttestation(pins.launcher_attestation, pins.entry) : null;
  const commandId = `api-phase-${restart}`, ledgerPath = join(directory, `${commandId}.input-ledger.json`);
  const expectedName = restart < 2 ? 'api.expected.json' : `${commandId}.expected.json`;
  const expectedPath = join(directory, expectedName), expectedBytes = jsonBytes({ registryContract, probe, databaseOnlyHash: SENTINEL_HASH, deliveries: prepared.deliveries,
    snapshot: { candidates: { candidate: { policy: prepared.snapshot.candidates.candidate.policy }, laterCandidate: { policy: prepared.snapshot.candidates.laterCandidate.policy } } } });
  if (restart !== 1) writeFileSync(expectedPath, expectedBytes, { flag: 'wx', mode: 0o444 });
  assert.deepEqual(readFileSync(expectedPath), expectedBytes, 'Expected API restoration bytes changed');
  const paths = ['api.control.bundle.mjs', expectedName, 'worker-runtime/worker.bundle.mjs', 'wrangler.json',
    'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py'];
  const ledgerBytes = jsonBytes({ schema_version: 1, command_id: commandId, registry_mode: registryContract.mode, expected_path: expectedName, local_only: true, wrangler: pins.entry, wrangler_launcher: launcherAttestation,
    files: paths.map(path => ({ path, ...digest(readFileSync(join(directory, path))) })) });
  writeFileSync(ledgerPath, ledgerBytes, { flag: 'wx', mode: 0o444 });
  assertApiInputLedger(directory, JSON.parse(ledgerBytes));
  const outcome = runSupervisedCommand({ directory, commandId, command: process.execPath,
    args: [join(directory, 'api.control.bundle.mjs'), directory, ledgerPath], timeoutMs: 180000,
    supervisorPath: join(directory, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py'), apiTeardown: true });
  if (launcherAttestation !== null) assertWranglerLauncherAttestation(launcherAttestation, pins.entry);
  assertCapturedSources(directory, capture);
  assert.deepEqual(readFileSync(ledgerPath), ledgerBytes, 'API phase ledger changed');
  assertApiInputLedger(directory, JSON.parse(ledgerBytes));
  const expectedRows = apiPhaseRows(prepared, probe);
  const completion = JSON.parse(readFileSync(join(directory, `${commandId}.complete.json`), 'utf8'));
  return assertApiCompletion(outcome, completion, ledgerBytes, expectedRows);
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
  assert.ok(error?.commandOutcome, 'Rollback requires complete identity-bound command evidence');
  assertCompletedCommand(error.commandOutcome, { nonzero: true });
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
export function repairConflict(deliveries, kind) {
  const late = deliveries[1], last = late.parts.at(-1);
  return kind === 'part'
    ? `UPDATE mw3_policy_parts SET body=${quote(last.body)} WHERE delivery_hash=${quote(late.deliveryHash)} AND part=${last.part};\n`
    : `UPDATE mw3_policy_deliveries SET header_json=${quote(late.headerText)} WHERE delivery_hash=${quote(late.deliveryHash)};\n`;
}
function emptyLocalWorkerSource(deliveries) {
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
export function bindCapturedRegistry(prepared, mode = 'empty', evaluatedRegistry = MW3_APPROVED_POLICIES) {
  assertRegistryMode(mode);
  const source = prepared.capture.files.get('apps/shared/mw3-approved.ts');
  assert.ok(source, 'Captured shared registry source is required');
  const pins = parseMw3ApprovedRegistry(source);
  assert.deepEqual(evaluatedRegistry, pins, 'Actual evaluated build registry differs from captured static authority');
  assert.ok(Object.isFrozen(evaluatedRegistry), 'Build authority must remain immutable');
  const subjectPair = mw3DeliveryPins(prepared.snapshot, prepared.deliveries);
  assertMw3IndependentReceipt(prepared.review, prepared.snapshot, prepared.deliveries);
  if (mode === 'empty') assert.equal(pins.length, 0, 'Empty-registry proof requires the actual empty build authority');
  else {
    assert.ok(pins.length > 0, 'Activated mode cannot grant approval to an empty build registry');
    assert.deepEqual(pins.filter(pin => pin.spotId === prepared.snapshot.manifest.spot.id).sort((a,b) => a.stage.localeCompare(b.stage)),
      subjectPair, 'Captured build subject pair must exactly equal every independent-receipt/source/policy pin');
  }
  assert.ok(pins.every(pin => pin.deliveryHash !== SENTINEL_HASH), 'Database-only sentinel cannot be a build-approved delivery');
  let unknownHash = sha256('mw3-unknown-delivery-not-an-approval');
  while (pins.some(pin => pin.deliveryHash === unknownHash)) unknownHash = sha256(unknownHash);
  const contract = { mode, unknown_hash: unknownHash, entries: pins.length, source_sha256: sha256(source), pins_sha256: sha256(JSON.stringify(pins)),
    subject_pair_sha256: sha256(JSON.stringify(subjectPair)), subject_pair: subjectPair };
  registryHealth(contract);
  return contract;
}
export function localWorkerSource(deliveries, contract = { mode: 'empty', entries: 0 }) {
  if (assertRegistryMode(contract.mode) === 'empty') return emptyLocalWorkerSource(deliveries);
  const health = registryHealth(contract);
  return `// Captured build authority only. Selecting activated verification grants no approval.
import { routeMw3Transport } from ${JSON.stringify('./captured-source/apps/backend/src/mw3-transport.ts')};
import { MW3_APPROVED_POLICIES } from ${JSON.stringify('./captured-source/apps/shared/mw3-approved.ts')};
const CONTRACT = ${JSON.stringify(contract)}, HEALTH = ${JSON.stringify(health)};
const sha = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2,'0')).join('');
export default { async fetch(request, env) {
  if (MW3_APPROVED_POLICIES.length !== CONTRACT.entries || await sha(JSON.stringify(MW3_APPROVED_POLICIES)) !== CONTRACT.pins_sha256 ||
      JSON.stringify(MW3_APPROVED_POLICIES.filter(pin => pin.spotId === CONTRACT.subject_pair[0].spotId).sort((a,b) => a.stage.localeCompare(b.stage))) !== JSON.stringify(CONTRACT.subject_pair))
    return new Response('Captured registry identity differs', { status: 500 });
  if (new URL(request.url).pathname === '/__mw3_verify_health') return Response.json(HEALTH);
  return routeMw3Transport(request, env.${BINDING}, MW3_APPROVED_POLICIES);
} };\n`;
}
export function corruptionSetup(deliveries, kind) {
  assert.ok(['header', 'part'].includes(kind));
  const late = deliveries[1], last = late.parts.at(-1);
  return kind === 'header'
    ? `UPDATE mw3_policy_deliveries SET header_json=header_json || ' ' WHERE delivery_hash=${quote(late.deliveryHash)};\n`
    : `UPDATE mw3_policy_parts SET body=body || ' ' WHERE delivery_hash=${quote(late.deliveryHash)} AND part=${last.part};\n`;
}
export async function verifyMw3LocalD1(options) {
  assert.ok(options.parentBoundary && options.parentBoundary.root === MW3_REPOSITORY, 'Strict oracle must execute through its captured parent boundary');
  options.parentBoundary.assertReady(import.meta.url);
  const started = performance.now(), [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || major === 22 && minor >= 20, 'Node >=22.20 required');
  assert.equal(process.platform, 'linux', 'Strict birth-owned lifecycle/resource proof currently requires Linux');
  const local = join(FRONTEND, '.local'); mkdirSync(local, { recursive: true });
  const directory = mkdtempSync(join(local, 'verify-mw3-d1-'));
  const report = { schema_version: 1, status: 'running', local_only: true, mode: 'strict-whole-file', evidence_directory: directory,
    parent_execution_ledger: options.parentBoundary.executionLedgerPath, production_approval: 'not granted by this oracle', remote_atomicity: 'not tested', registry_mode: assertRegistryMode(options.registryMode), gates: [] };
  const save = () => writeFileSync(join(directory, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  const mark = name => { report.gates.push(name); save(); };
  save();
  try {
    const pins = readRuntimePins(options.wrangler, { directory }); report.runtime_pins = pins;
    const prepared = await loadReviewedDelivery(options); options.parentBoundary.assertSnapshot(prepared.snapshot.manifestBytes, prepared.snapshot.manifest); report.inputs = prepared.records; report.spot = prepared.snapshot.manifest.spot.id;
    mark('saved_snapshot_receipt_and_sql_exact_bytes');
    prepared.registryContract = bindCapturedRegistry(prepared, report.registry_mode); report.registry_contract = prepared.registryContract;
    mark('captured_build_registry_bound_to_independent_receipt_subject_pair');
    mkdirSync(join(directory, 'home/.config'), { recursive: true });
    // Only captured, verified bytes are written below. The original saved file
    // is not reread, split, rewritten, or used as a disposable mutable input.
    const reviewedPath = join(directory, 'reviewed.sql'); writeFileSync(reviewedPath, prepared.sqlBytes, { flag: 'wx' });
    assert.deepEqual(digest(readFileSync(reviewedPath)), prepared.records.sql);
    writeCapturedSources(directory, prepared.capture); report.captured_source_ledger_sha256 = sha256(jsonBytes(prepared.capture.records));
    report.captured_sources = prepared.capture.records; report.fixture_schema = digest(prepared.capture.schemaBytes);
    const workerText = localWorkerSource(prepared.deliveries, prepared.registryContract);
    writeFileSync(join(directory, 'worker.mjs'), workerText); report.worker_sha256 = sha256(workerText);
    report.worker_bundle = bundleCapturedWorker({ directory, pins, capture: prepared.capture, expectedWorkerSha: report.worker_sha256 });
    report.api_control_bundle = bundleCapturedApiControl({ directory, pins, capture: prepared.capture });
    const assertIsolatedInputs = () => {
      assertCapturedSources(directory, prepared.capture);
      assert.deepEqual(readRuntimePins(pins.entry, { directory, supervisorPath: join(directory, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py') }), pins, 'Installed runtime resolution or metadata pins changed');
      assert.equal(sha256(readFileSync(join(directory, 'worker.mjs'))), report.worker_sha256, 'Local oracle source changed');
      validateLocalConfig(JSON.parse(readFileSync(configPath, 'utf8')));
      assert.deepEqual(digest(readFileSync(join(directory, 'api.control.bundle.mjs'))), { bytes: report.api_control_bundle.bytes, sha256: report.api_control_bundle.sha256 }, 'API controller bundle changed');
      assert.deepEqual(digest(readFileSync(join(directory, 'worker-runtime', 'worker.bundle.mjs'))), { bytes: report.worker_bundle.bytes, sha256: report.worker_bundle.sha256 }, 'Compiled worker changed after reviewed source bundling');
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
      try { result = runSupervisedCommand({ directory, commandId, command: process.execPath, args: [pins.entry, ...args], supervisorPath: join(directory, 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py') }); }
      catch (error) { failure = error; }
      const measurement = result?.measurement ?? failure?.command_resource;
      (report.commands ??= []).push({ command_id: commandId, evidence_directory: result?.evidence_directory ?? failure?.commandOutcome?.evidence_directory ?? null,
        classification: measurement?.classification ?? null, actual_returncode: measurement?.actual_returncode ?? null,
        parent_cleanup_complete: (result?.cleanup ?? failure?.command_group_cleanup)?.complete === true }); save();
      // An unavailable metric adds uncertainty; it must never erase the
      // launcher's original signal/error already retained by the adapter.
      if (failure) throw failure;
      assert.ok(measurement && measurement.command_id === commandId, 'Exact command child resource telemetry is missing; original failure logs are retained');
      assert.ok(Number.isInteger(measurement.max_rss_kib) && measurement.max_rss_kib > 0, 'Positive waited-command resource telemetry required');
      importerMaxRss = Math.max(importerMaxRss, measurement.max_rss_kib, measurement.observed_owned_group_rss_kib);
      assert.ok(importerMaxRss <= 3 * 1024 * 1024, 'Strict importer exceeded 3 GiB command RSS; split imports are forbidden');
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
    assert.deepEqual(Object.keys(preserved.rows).sort(), UNRELATED_TABLES, `All ${UNRELATED_TABLES.length} current unrelated tables must be covered`);
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
      options.log?.(`Strict MW3 LOCAL D1 import ${pass}/2: exact header/chunk/hash equality and all ${UNRELATED_TABLES.length} unrelated tables verified.`);
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
      const restored = runCapturedApiPhase({ directory, pins, capture: prepared.capture, prepared, restart, control: report.api_control_bundle });
      assert.deepEqual(all(), committed, 'Persistent D1 changed after worker startup/API/restoration/shutdown'); verify();
      (report.api_phases ??= []).push({ command_id: `api-phase-${restart}`, evidence_directory: join(directory, `api-phase-${restart}`), completion_record: join(directory, `api-phase-${restart}.complete.json`) });
      report.api_restoration = restored; mark(restart ? 'runtime_restart_persistence_and_api_restoration' : (report.registry_mode === 'empty' ? 'actual_route_api_restoration_and_empty_registry' : 'actual_public_route_api_restoration_and_captured_registry'));
    }
    if (report.registry_mode === 'activated') {
      for (const [restart, kind] of [[2, 'header'], [3, 'part']]) {
        const late = prepared.deliveries[1], probe = { kind, delivery_hash: late.deliveryHash, ...(kind === 'part' ? { part: late.parts.at(-1).part } : {}) };
        setup(`synthetic-local-api-${kind}-corruption.sql`, corruptionSetup(prepared.deliveries, kind));
        const corrupted = all(); assert.notDeepEqual(corrupted, committed, 'Corruption fixture must actually change saved D1 bytes');
        assert.deepEqual(inspect(dbPath, db => databaseSnapshot(db, { excludeMw3: true })), preserved, 'Corruption setup changed unrelated application data');
        const rows = runCapturedApiPhase({ directory, pins, capture: prepared.capture, prepared, restart, control: report.api_control_bundle, probe });
        assert.deepEqual(all(), corrupted, 'Read-only rejection API phase changed corrupt database state');
        (report.api_phases ??= []).push({ command_id: `api-phase-${restart}`, evidence_directory: join(directory, `api-phase-${restart}`), completion_record: join(directory, `api-phase-${restart}.complete.json`), probe, rows });
        setup(`synthetic-local-api-${kind}-exact-repair.sql`, repairConflict(prepared.deliveries, kind));
        verify(); assert.deepEqual(all(), committed, 'Exact source bytes/database ledger were not restored after API corruption probe');
        mark(`actual_public_${kind}_hash_corruption_rejected_and_exact_database_restored`);
      }
    }
    assertIsolatedInputs();
    report.status = 'pass'; report.local_transactions_per_import = 1; report.repeated_imports = 2;
    report.unrelated_tables_preserved = UNRELATED_TABLES; report.full_file_failure_rollback = true;
    report.verifier_max_rss_kib = process.resourceUsage().maxRSS; report.importer_max_rss_kib = importerMaxRss;
    report.importer_measurement_scope = 'Linux waited-child maximum plus sampled birth-owned descendant aggregate; sampling is not a hard total-memory guarantee';
    report.elapsed_seconds = Number(((performance.now() - started) / 1000).toFixed(3)); save(); return report;
  } catch (error) {
    report.status = 'fail'; report.error = { message: error.message, status: error.status ?? null, signal: error.signal ?? null,
      command_id: error.commandOutcome?.command_id ?? null, command_evidence_directory: error.commandOutcome?.evidence_directory ?? null,
      original_execution_error: error.commandOutcome?.wrapper?.error ?? null, classification: error.commandOutcome?.resource?.classification ?? null,
      parent_cleanup_complete: error.commandOutcome?.parent_cleanup?.complete ?? null, secondary_causes: error.secondaryCauses ?? [] };
    report.elapsed_seconds = Number(((performance.now() - started) / 1000).toFixed(3)); save();
    error.message += ` (retained LOCAL evidence: ${directory})`; throw error;
  }
}
// The strict CLI is the builtin-only ../verify-mw3-local-d1.mjs bootstrap.
