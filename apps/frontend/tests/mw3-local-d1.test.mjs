import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WRANGLER_VERSION, RUNTIME_PINS, UNRELATED_TABLES, parseArguments, localConfig, validateLocalConfig, validateRuntimePackages, readRuntimePins,
  completedJson, assertFinishedSqlFailure, assertReviewedSql, assertDeliveryRows, databaseSnapshot, preservationSeed,
  conflictSetup, repairConflict, corruptionSetup, bindCapturedRegistry, localWorkerSource, loadReviewedDelivery, capturePinnedFiles, writeCapturedSources, assertCapturedSources,
  runSupervisedCommand, verifyMw3LocalD1 } from '../scripts/ci/mw3-local-d1-oracle.mjs';
import { assertRegistryMode, assertApiPhase, registryHealth } from '../scripts/ci/mw3-registry-mode.mjs';
import { parseArguments as parseBoundaryArguments } from '../scripts/verify-mw3-local-d1.mjs';
import { localEnvironment } from '../scripts/ci/mw3-local-command.mjs';
import { prepareMw3SnapshotDeliveries, mw3DeliveryPins, buildMw3DeliverySql } from '../scripts/postflop-ai/mw3-reviewed-delivery.mjs';
import { sha256, jsonBytes } from '../scripts/postflop-ai/mw3-reviewed-archive.mjs';
import { verifyMw3Snapshot } from '../scripts/postflop-ai/mw3-reviewed-snapshot.mjs';
import { MW3_TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';

// Synthetic transport/receipt contract fixtures only. They contain no actual
// authoring evidence, cannot pass verifyMw3Snapshot, and grant no real approval.
async function syntheticFixture() {
  const id = 'HJ_open_BTN_call_BB_call', source = 'a'.repeat(64), implementation = 'b'.repeat(64);
  const authorTask = 'synthetic-local-d1-fixture-author-never-a-real-policy', candidates = {};
  for (const [kind, streets] of [['candidate', ['flop']], ['laterCandidate', ['turn', 'river']]]) {
    const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: id, streets, rules: streets.flatMap(street => MW3_TIERS.map(tier => ({
      node: `mw3_${street}_first_first`, tier, priority: 0,
      when: { line: 'any', texture: 'any', players: 'any', position: 'any', response: 'any', price: 'any', spr: 'any' },
      mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 },
    }))) };
    candidates[kind] = { policy, metadata: { spot: id, source_hash: source, implementation_hash: implementation,
      policy_hash: sha256(JSON.stringify(policy)), author_task: authorTask, synthetic_fixture: "Unicode 雪 ; ' 🂡" } };
  }
  const manifest = { source_tree: 'a'.repeat(40), spot: { id, source_hash: source, implementation_hash: implementation,
    flop_policy_hash: candidates.candidate.metadata.policy_hash, later_policy_hash: candidates.laterCandidate.metadata.policy_hash },
    archive: { sha256: 'c'.repeat(64) }, content_sha256: 'd'.repeat(64), sources_sha256: 'e'.repeat(64), inputs_sha256: 'f'.repeat(64) };
  const evidence = { status: 'complete_evidence_not_acceptance', limitations: ['synthetic fixture only, not real acceptance'] };
  const snapshot = { manifest, manifestBytes: jsonBytes(manifest), candidates, evidence }, deliveries = await prepareMw3SnapshotDeliveries(snapshot);
  const receipt = { schema_version: 1, kind: 'mw3-independent-acceptance', status: 'independently-reviewed', strategy_type: 'ai_estimate_not_gto',
    author_model: 'gpt-6-astra', reviewer_model: 'gpt-6-astra', reviewer_task: 'synthetic-local-d1-fixture-reviewer', author_task: authorTask,
    source_tree: manifest.source_tree, scope: 'unit fixture only; no publishable evidence', manifest_sha256: sha256(snapshot.manifestBytes),
    archive_sha256: manifest.archive.sha256, content_sha256: manifest.content_sha256, sources_sha256: manifest.sources_sha256,
    inputs_sha256: manifest.inputs_sha256, spot: id, deliveries: mw3DeliveryPins(snapshot, deliveries), evidence, accepted_limitations: evidence.limitations };
  const sql = buildMw3DeliverySql(snapshot, receipt, deliveries);
  return { snapshot, receipt, deliveries, sql };
}
function seededDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const migrations = new URL('../../backend/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, migrations), 'utf8'));
  db.exec(readFileSync(new URL('../../backend/scripts/sql/mw3-schema.sql', import.meta.url), 'utf8'));
  db.exec(preservationSeed()); return db;
}
test('strict CLI requires every saved input and a pinned existing runtime, refusing reduced or remote coverage', () => {
  const args = ['--manifest', 'a', '--archive', 'b', '--receipt', 'c', '--sql', 'd', '--wrangler', 'e'];
  assert.deepEqual(parseArguments(args), { manifest: 'a', archive: 'b', receipt: 'c', sql: 'd', wrangler: 'e' });
  for (const mode of ['empty', 'activated']) {
    assert.equal(parseArguments([...args, '--registry-mode', mode]).registryMode, mode);
    assert.deepEqual(parseArguments([...args, '--registry-mode', mode]), parseBoundaryArguments([...args, '--registry-mode', mode]));
  }
  for (const input of [[...args, '--registry-mode', 'approved'], [...args, '--skip-receipt', 'true'], [...args, '--approval', 'true'], [], args.slice(0, -2), [...args, '--remote'], [...args, '--bounded-local'], [...args, '--miniflare', 'e'],
    [...args, '--config', 'production.json'], [...args, '--sql', 'again'], [...args.slice(0, -1)]]) assert.throws(() => parseArguments(input));
});
test('runtime metadata pins actual Wrangler and its exact installed dependencies', () => {
  assert.equal(WRANGLER_VERSION, '4.147.0');
  const packages = () => [{ name: 'wrangler', version: WRANGLER_VERSION, dependencies: { miniflare: RUNTIME_PINS.miniflare, workerd: RUNTIME_PINS.workerd, esbuild: RUNTIME_PINS.esbuild } },
    { name: 'miniflare', version: RUNTIME_PINS.miniflare }, { name: 'workerd', version: RUNTIME_PINS.workerd }, { name: 'esbuild', version: RUNTIME_PINS.esbuild }];
  assert.deepEqual(validateRuntimePackages(...packages()), RUNTIME_PINS);
  for (const change of [p => { p[0].version = '4.146.0'; }, p => { p[1].version = '4.20260515.0'; },
    p => { p[2].version = '1.20260901.0'; }, p => { p[0].dependencies.miniflare = 'latest'; }, p => { p[1].name = 'substitute'; }, p => { p[3].version = '0.25.12'; }]) {
    const p = packages(); change(p); assert.throws(() => validateRuntimePackages(...p));
  }
  assert.throws(() => validateRuntimePackages());
});
test('local config and environment exclude credentials, remote resources, assets and production settings', () => {
  const config = localConfig(); assert.deepEqual(validateLocalConfig(config), config);
  for (const extra of [{ account_id: 'real-account' }, { ai: { binding: 'AI' } }, { assets: { directory: '.' } },
    { d1_databases: [{ ...config.d1_databases[0], remote: true }] }, { dev: { ...config.dev, ip: '0.0.0.0' } }, { no_bundle: false }, { find_additional_modules: true }, { main: './worker.bundle.mjs' }, { dev: { ...config.dev, watch: false } }]) {
    assert.throws(() => validateLocalConfig({ ...config, ...extra }));
  }
  const env = localEnvironment('/isolated-local-test');
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'NODE_OPTIONS', 'HTTP_PROXY', 'HTTPS_PROXY']) assert.equal(env[key], undefined);
  assert.equal(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, 'false'); assert.equal(env.CLOUDFLARE_CF_FETCH_ENABLED, 'false');
  assert.equal(config.main, './worker-runtime/worker.bundle.mjs'); assert.equal(config.find_additional_modules, false); assert.equal(config.dev.watch, undefined); assert.equal(env.WRANGLER_SEND_METRICS, 'false');
});
test('zero launcher status, empty/partial output and failed JSON cannot masquerade as successful import', () => {
  assert.equal(completedJson('[{"success":true}]').length, 1);
  for (const text of ['', '[]', '{}', '[{"success":false}]', '[{"success":true},{}]', 'Wrangler stopped', '[{"success":true}']) assert.throws(() => completedJson(text));
});
test('rollback requires full independently bound command evidence and never merely SQL diagnostics', () => {
  for (const error of [null, { status: 1, signal: null, stderr: 'NOT NULL constraint failed: mw3_policy_parts.body' },
    { status: 1, command_resource: { classification: 'normal-exit' }, commandOutcome: {} }]) {
    assert.throws(() => assertFinishedSqlFailure(error, /mw3_policy_parts\.body/));
  }
});
test('existing migrations get a preservation sentinel in every application table including FastFold and human seasons', () => {
  const db = seededDatabase();
  try {
    const snapshot = databaseSnapshot(db, { excludeMw3: true });
    assert.deepEqual(Object.keys(snapshot.rows).sort(), UNRELATED_TABLES);
    for (const [name, rows] of Object.entries(snapshot.rows)) assert.equal(rows.length, 1, `${name}: missing preservation row`);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(databaseSnapshot(db).rows.mw3_policy_deliveries.length, 1);
  } finally { db.close(); }
});
test('synthetic contract fixture: SQL comparison covers exact raw bytes and matching receipt identity', async () => {
  const f = await syntheticFixture(), body = Buffer.from(f.sql);
  assert.deepEqual(assertReviewedSql(body, f.snapshot, f.receipt, f.deliveries), { bytes: body.length, sha256: sha256(body) });
  for (const sql of [Buffer.from(f.sql + '\n'), Buffer.from('\ufeff' + f.sql), Buffer.from(f.sql.replace(/\n/g, '\r\n')), Buffer.from(f.sql.replace('Immutable', 'Changed'))]) {
    assert.throws(() => assertReviewedSql(sql, f.snapshot, f.receipt, f.deliveries), /exact independently reviewed delivery bytes/);
  }
  assert.throws(() => assertReviewedSql(body, f.snapshot, null, f.deliveries), /receipt required/);
  const bad = structuredClone(f.receipt); bad.manifest_sha256 = '0'.repeat(64);
  assert.throws(() => assertReviewedSql(body, f.snapshot, bad, f.deliveries), /receipt required/);
});
test('synthetic SQLite reference: headers, ordered chunk hashes and full payload hashes match with exact retry', async () => {
  const f = await syntheticFixture(), db = seededDatabase();
  try {
    const before = databaseSnapshot(db, { excludeMw3: true });
    db.exec(f.sql); const first = databaseSnapshot(db); db.exec(f.sql);
    assert.deepEqual(databaseSnapshot(db), first); assert.deepEqual(databaseSnapshot(db, { excludeMw3: true }), before);
    const ledger = assertDeliveryRows(db, f.deliveries);
    assert.deepEqual(ledger.map(row => row.stage), ['flop', 'later']);
    for (const [i, row] of ledger.entries()) assert.equal(row.payload_sha256, f.deliveries[i].header.manifest.payloadHash);
  } finally { db.close(); }
});
test('synthetic SQLite reference: missing, reordered, corrupt and extra chunks fail exact equality', async () => {
  const f = await syntheticFixture();
  const hash = f.deliveries[0].deliveryHash;
  for (const sql of [
    `UPDATE mw3_policy_parts SET body=body||'x' WHERE delivery_hash='${hash}'`,
    `DELETE FROM mw3_policy_parts WHERE delivery_hash='${hash}' AND part=0`,
    `UPDATE mw3_policy_parts SET part=part+10 WHERE delivery_hash='${hash}'`,
    `INSERT INTO mw3_policy_parts VALUES ('${hash}',999,'extra')`,
    `UPDATE mw3_policy_deliveries SET header_json='{}' WHERE delivery_hash='${hash}'`,
  ]) {
    const db = seededDatabase();
    try { db.exec(f.sql); db.exec(sql); assert.throws(() => assertDeliveryRows(db, f.deliveries)); } finally { db.close(); }
  }
});
test('synthetic SQLite reference: late immutable part and header conflicts expose whole-file rollback', async () => {
  const f = await syntheticFixture();
  for (const kind of ['part', 'header']) {
    const db = seededDatabase();
    try {
      db.exec(f.sql); db.exec(conflictSetup(f.deliveries, kind)); const before = databaseSnapshot(db);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mw3_policy_deliveries WHERE delivery_hash=?').get(f.deliveries[0].deliveryHash).n, 0);
      db.exec('BEGIN');
      try { assert.throws(() => db.exec(f.sql), /NOT NULL constraint failed/); } finally { db.exec('ROLLBACK'); }
      assert.deepEqual(databaseSnapshot(db), before);
    } finally { db.close(); }
  }
});
test('database value ledger includes unrelated schema, binary and Unicode row changes', () => {
  for (const sql of ["UPDATE preflop_dataset_parts SET body='雪 changed'", "UPDATE postflop_flop_base_br SET body=X'0002FF'",
    'CREATE INDEX local_extra_index ON account_users(email)', 'DELETE FROM ranked_matches',
    `UPDATE fastfold_actions SET request_json='{"changed":true}'`, `UPDATE fastfold_dataset_parts SET body='{"changed":true}'`,
    "UPDATE fastfold_players SET public_name='Changed FastFold sentinel'", 'UPDATE fastfold_results SET at=2', 'UPDATE fastfold_sessions SET updated_at=2',
    "UPDATE human_rank_players SET public_name='Changed human sentinel'", `UPDATE human_rank_receipts SET request_json='{"changed":true}'`,
    'UPDATE human_rank_results SET at=2', 'UPDATE human_rank_tables SET updated_at=2']) {
    const db = seededDatabase();
    try { const before = databaseSnapshot(db); db.exec(sql); assert.notDeepEqual(databaseSnapshot(db), before); } finally { db.close(); }
  }
});
test('ephemeral actual-route worker keeps the build registry empty and pins only a labelled localhost proof namespace', async () => {
  const f = await syntheticFixture(), worker = localWorkerSource(f.deliveries);
  assert.match(worker, /apps\/backend\/src\/mw3-transport\.ts/); assert.match(worker, /apps\/shared\/mw3-approved\.ts/);
  assert.match(worker, /MW3_APPROVED_POLICIES.length !== 0/); assert.match(worker, /__mw3_local_oracle/);
  assert.match(worker, /proof \? LOCAL_ORACLE_PINS : MW3_APPROVED_POLICIES/);
  assert.doesNotMatch(worker, /UPDATE|INSERT|fetch\(.*https:|process\.env/);
});
test('synthetic receipts cannot pass real saved snapshot preflight; outside inputs are rejected before runtime execution', async () => {
  const fixture = await syntheticFixture();
  assert.throws(() => verifyMw3Snapshot(fixture.snapshot.manifestBytes, Buffer.alloc(0)));
  await assert.rejects(() => loadReviewedDelivery({ manifest: '/outside/manifest.json', archive: 'missing', receipt: 'missing', sql: 'missing' }), /inside this repository/);
});

test('captured reviewed source bytes survive later checkout mutation; isolated mutation fails closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'mw3-capture-source-')), isolated = mkdtempSync(join(tmpdir(), 'mw3-capture-isolated-'));
  const path = 'apps/backend/src/synthetic-route.ts', source = Buffer.from("export const fixture = '雪;🂡';\n");
  const records = [{ path, bytes: source.length, sha256: sha256(source), provenance: 'synthetic_capture_fixture_only' }];
  try {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source);
    const files = capturePinnedFiles(root, records);
    writeFileSync(join(root, path), 'changed live checkout');
    assert.throws(() => capturePinnedFiles(root, records));
    writeCapturedSources(isolated, { files, records }); assertCapturedSources(isolated, { files, records });
    assert.deepEqual(readFileSync(join(isolated, 'captured-source', path)), source);
    rmSync(join(isolated, 'captured-source', path)); writeFileSync(join(isolated, 'captured-source', path), 'changed captured source');
    assert.throws(() => assertCapturedSources(isolated, { files, records }));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(isolated, { recursive: true, force: true }); }
});
test('schema snapshot excludes only literal internal prefixes, never SQL LIKE wildcard matches', () => {
  const db = seededDatabase();
  try {
    db.exec("CREATE TABLE xcfa_user_data (body TEXT); INSERT INTO xcfa_user_data VALUES ('preserve'); CREATE TABLE _cf_internal_fixture (body TEXT);");
    const snapshot = databaseSnapshot(db);
    assert.equal(snapshot.rows.xcfa_user_data.length, 1); assert.equal(snapshot.rows._cf_internal_fixture, undefined);
  } finally { db.close(); }
});
test('the sole ownership implementation is the unchanged reviewed subreaper with anchored discovery', () => {
  const source = readFileSync(new URL('../scripts/ci/postflop-command-supervisor.py', import.meta.url));
  assert.equal(sha256(source), '61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d');
  assert.match(source.toString(), /PR_SET_CHILD_SUBREAPER/); assert.match(source.toString(), /supervision_complete/);
  assert.match(source.toString(), /ownership_conflicts/); assert.match(source.toString(), /start_ticks/);
});
test('synthetic process fixture: supervisor retains successful stdout and stderr without discarding warnings', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-success-'));
  try {
    const result = runSupervisedCommand({ directory, commandId: 'synthetic-success', command: 'python3',
      args: ['-c', "import sys;sys.stdout.write('雪 stdout');sys.stderr.write('warning: synthetic fixture stderr')"], timeoutMs: 5000 });
    assert.equal(result.stdout, '雪 stdout'); assert.equal(result.stderr, 'warning: synthetic fixture stderr');
    assert.equal(result.measurement.actual_returncode, 0); assert.deepEqual(result.cleanup.remaining_live, []);
    assert.equal(readFileSync(join(result.evidence_directory, 'stderr.log'), 'utf8'), result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('synthetic process fixtures: NOT NULL text before killed, timed-out or interrupted children is never completed SQL proof', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-failure-'));
  const prefix = "import os,signal,sys,time;sys.stderr.write('NOT NULL constraint failed: mw3_policy_parts.body\\n');sys.stderr.flush();";
  try {
    const cases = [
      { id: 'synthetic-killed', code: prefix + 'os.kill(os.getpid(),signal.SIGKILL)', seconds: 5 },
      { id: 'synthetic-timeout', code: prefix + 'time.sleep(5)', seconds: 0.15 },
      { id: 'synthetic-interrupted', code: prefix + 'os.kill(os.getppid(),signal.SIGTERM);time.sleep(5)', seconds: 5 },
    ];
    for (const row of cases) {
      let failure;
      try { runSupervisedCommand({ directory, commandId: row.id, command: 'python3', args: ['-c', row.code], timeoutMs: Math.round(row.seconds * 1000), cleanupMs: 200 }); }
      catch (error) { failure = error; }
      assert.ok(failure); assert.match(failure.stderr, /NOT NULL constraint failed/);
      assert.throws(() => assertFinishedSqlFailure(failure, /mw3_policy_parts\.body/));
      assert.equal(failure.command_group_cleanup.complete, true); assert.deepEqual(failure.command_group_cleanup.remaining_live, []);
      if (row.id === 'synthetic-killed') assert.equal(failure.command_resource.actual_returncode, -9);
      if (row.id === 'synthetic-timeout') assert.equal(failure.command_resource.timed_out, true);
      if (row.id === 'synthetic-interrupted') assert.equal(failure.command_resource.interrupted_signal, 15);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('runtime pins follow wrangler-dist and Miniflare dependency resolution rather than sibling guesses', () => {
  // Distinct roots avoid Node's path-resolution cache masking a dependency
  // inserted after an earlier lookup in the same synthetic package tree.
  for (const scenario of ['valid', 'nested-cli', 'nested-miniflare', 'different-copy']) {
    const temporary = mkdtempSync(join(tmpdir(), 'mw3-runtime-resolution-'));
    const root = join(temporary, 'wrangler');
    const packageAt = (directory, name, version, extra = {}) => {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version, main: 'index.js', ...extra }));
      writeFileSync(join(directory, 'index.js'), '// Synthetic resolution fixture. Never executed.\n');
    };
    try {
      packageAt(root, 'wrangler', WRANGLER_VERSION, { dependencies: { miniflare: RUNTIME_PINS.miniflare, workerd: RUNTIME_PINS.workerd, esbuild: RUNTIME_PINS.esbuild } });
      mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'wrangler-dist'));
      const entry = join(root, 'bin', 'wrangler.js'); writeFileSync(entry, readFileSync(new URL('./fixtures/mw3-wrangler-4.147.0-launcher.cjs.txt', import.meta.url))); // Exact audited bytes, never executed in resolution fixture.
      writeFileSync(join(root, 'wrangler-dist', 'cli.js'), '// Synthetic runtime entry. Never executed.\n');
      for (const name of ['miniflare', 'workerd', 'esbuild']) packageAt(join(root, 'node_modules', name), name, RUNTIME_PINS[name]);
      if (scenario === 'nested-cli') packageAt(join(root, 'wrangler-dist', 'node_modules', 'miniflare'), 'miniflare', '0.0.0-wrong-runtime');
      if (scenario === 'nested-miniflare' || scenario === 'different-copy') packageAt(join(root, 'node_modules', 'miniflare', 'node_modules', 'workerd'), 'workerd',
        scenario === 'nested-miniflare' ? '0.0.0-wrong-runtime' : RUNTIME_PINS.workerd);
      if (scenario === 'valid') {
        const pinned = readRuntimePins(entry); assert.equal(pinned.cli_entry, join(root, 'wrangler-dist', 'cli.js'));
        assert.equal(pinned.dependency_resolution.miniflare_workerd.entry, pinned.dependency_resolution.workerd.entry);
        const canonical = readFileSync(entry); writeFileSync(entry, Buffer.concat([canonical, Buffer.from('\n')]));
        assert.throws(() => readRuntimePins(entry), /exact reviewed 143 implementation/); writeFileSync(entry, canonical);
        packageAt(join(root, 'wrangler-dist', 'node_modules', 'miniflare'), 'miniflare', '0.0.0-inserted-after-first-check');
        assert.throws(() => readRuntimePins(entry), /pinned miniflare/, 'fresh check must observe a package added after the first lookup');
      } else assert.throws(() => readRuntimePins(entry), scenario === 'nested-cli' ? /pinned miniflare/ : scenario === 'nested-miniflare' ? /workerd version/ : /same pinned workerd entry/);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
});

test('the application oracle cannot start the strict gate from mutable live imports without its captured parent boundary', async () => {
  await assert.rejects(() => verifyMw3LocalD1({ wrangler: '/unused/synthetic-wrangler.js' }), /captured parent boundary/);
});

test('captured activated registry must match the receipt subject pair and actual evaluated immutable source authority', async () => {
  const f = await syntheticFixture(), pair = f.receipt.deliveries;
  const registrySource = pins => Buffer.from(`export type Mw3ApprovedPolicy = { spotId: string; stage: "flop" | "later"; deliveryHash: string; implementationHash: string; policyHash: string; sourceHash: string; }; export const MW3_APPROVED_POLICIES: readonly Mw3ApprovedPolicy[] = Object.freeze(${JSON.stringify(pins)});`);
  const prepared = pins => ({ ...f, review: f.receipt, capture: { files: new Map([['apps/shared/mw3-approved.ts', registrySource(pins)]]) } });
  const empty = Object.freeze([]);
  assert.equal(bindCapturedRegistry(prepared([]), 'empty', empty).entries, 0);
  assert.throws(() => bindCapturedRegistry(prepared([]), 'activated', empty), /cannot grant approval/);
  const evaluated = Object.freeze(pair.map(pin => Object.freeze({ ...pin })));
  const contract = bindCapturedRegistry(prepared(pair), 'activated', evaluated);
  assert.equal(contract.source_sha256, sha256(registrySource(pair)));
  assert.deepEqual(registryHealth(contract).subject_pair, pair);
  const worker = localWorkerSource(f.deliveries, contract);
  assert.match(worker, /routeMw3Transport\(request, env.MW3_LOCAL_VERIFY, MW3_APPROVED_POLICIES\)/);
  assert.match(worker, /CONTRACT.pins_sha256/); assert.match(worker, /CONTRACT.subject_pair/);
  assert.doesNotMatch(worker, /LOCAL_ORACLE_PINS|__mw3_local_oracle/);
  assert.throws(() => bindCapturedRegistry(prepared(pair), 'empty', evaluated), /actual empty/);
  assert.throws(() => bindCapturedRegistry(prepared(pair), 'activated', empty), /Actual evaluated/);
  for (const change of [pins => { pins.pop(); }, pins => { pins.push(pins[0]); }, pins => { pins[0].sourceHash = '0'.repeat(64); },
    pins => { pins[1].implementationHash = '0'.repeat(64); }, pins => { pins[0].policyHash = '0'.repeat(64); }, pins => { pins[0].deliveryHash = '0'.repeat(64); }]) {
    const changed = structuredClone(pair); change(changed);
    assert.throws(() => bindCapturedRegistry(prepared(changed), 'activated', Object.freeze(changed)));
  }
  const wrongReceipt = prepared(pair); wrongReceipt.review = { ...f.receipt, deliveries: [] };
  assert.throws(() => bindCapturedRegistry(wrongReceipt, 'activated', evaluated), /independent Mw3 acceptance receipt/);
});
test('mode-only phase expansion is bounded and exact API corruption fixtures restore every original database byte', async () => {
  const f = await syntheticFixture();
  for (const phase of [0, 1]) assertApiPhase('empty', phase);
  for (const phase of [0, 1, 2, 3]) assertApiPhase('activated', phase);
  for (const phase of [-1, 2, 3, 4, 1.5]) assert.throws(() => assertApiPhase('empty', phase));
  for (const phase of [-1, 4, 1.5]) assert.throws(() => assertApiPhase('activated', phase));
  assert.throws(() => assertRegistryMode('approved'));
  for (const kind of ['header', 'part']) {
    const db = seededDatabase();
    try {
      db.exec(f.sql); const before = databaseSnapshot(db), unrelated = databaseSnapshot(db, { excludeMw3: true });
      db.exec(corruptionSetup(f.deliveries, kind));
      assert.notDeepEqual(databaseSnapshot(db), before); assert.deepEqual(databaseSnapshot(db, { excludeMw3: true }), unrelated);
      assert.throws(() => assertDeliveryRows(db, f.deliveries));
      db.exec(repairConflict(f.deliveries, kind));
      db.exec(f.sql); assertDeliveryRows(db, f.deliveries); assert.deepEqual(databaseSnapshot(db), before);
    } finally { db.close(); }
  }
});
