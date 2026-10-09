// Verify an already-reviewed delivery file against real LOCAL D1. Never generates
// strategies, uses credentials, reads production configuration or executes remotely.
// Node >=22.20; Wrangler is pinned and its version is checked before any import.
// node scripts/verify-preflop-local-d1.mjs --sql .local/reviewed-preflop/preflop.sql \
//   --manifest .local/reviewed-preflop/delivery.json [--wrangler /path/to/wrangler.js]
// --bounded-local checks content in disposable 2 MiB groups; this diagnostic mode
// does NOT establish whole-delivery rollback. CI must use the strict default.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const WRANGLER_VERSION = "4.147.0";
const BINDING = "PREFLOP_LOCAL_VERIFY";
const ROLLBACK_NAME = "__local_d1_rollback_sentinel__";
const STALE_NAME = "__local_d1_stale_sentinel__";
const SENTINEL_BODY = '{"localVerification":true,"label":"preserve 雪 ; \'"}';
const sha256 = text => createHash("sha256").update(text).digest("hex");
const quote = text => `'${text.replaceAll("'", "''")}'`;

export function validateManifest(manifest) {
  assert.equal(manifest?.schema_version, 1, "Unsupported delivery manifest schema");
  const checkHash = (value, label) => assert.match(value, /^[a-f0-9]{64}$/, `${label} must be a SHA-256`);
  const checkInteger = (value, label) => assert.ok(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer`);
  checkHash(manifest.sql?.sha256, "sql.sha256");
  checkInteger(manifest.sql?.bytes, "sql.bytes");
  assert.ok(Array.isArray(manifest.datasets) && manifest.datasets.length > 0, "datasets must not be empty");
  const names = new Set();
  for (const dataset of manifest.datasets) {
    assert.ok(typeof dataset.name === "string" && dataset.name.length > 0 && !dataset.name.includes("\0"), "Invalid dataset name");
    assert.ok(!names.has(dataset.name), `Duplicate dataset: ${dataset.name}`);
    assert.ok(![ROLLBACK_NAME, STALE_NAME].includes(dataset.name), "Reserved local verification dataset name");
    names.add(dataset.name);
    checkHash(dataset.sha256, `${dataset.name}.sha256`);
    checkInteger(dataset.bytes, `${dataset.name}.bytes`);
    checkInteger(dataset.parts, `${dataset.name}.parts`);
  }
  return manifest;
}

export async function hashFile(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest("hex"), bytes };
}

export function localEnvironment(directory) {
  // An allowlist prevents inherited Cloudflare/API/OAuth credentials, proxy URLs,
  // NODE_OPTIONS and Wrangler overrides from entering the local-only subprocess.
  return {
    PATH: process.env.PATH ?? "",
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: join(directory, "home"),
    XDG_CONFIG_HOME: join(directory, "home", ".config"),
    TMPDIR: directory,
    CI: "true",
    NO_COLOR: "1",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: join(directory, "wrangler.log"),
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    npm_config_cache: join(ROOT, ".local", "wrangler-npm-cache"),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
}

export function validateLocalConfig(config) {
  assert.deepEqual(config, {
    name: "reysonai-preflop-local-verification",
    compatibility_date: "2026-09-01",
    send_metrics: false,
    d1_databases: [{ binding: BINDING, database_name: "reysonai-preflop-local-verification", database_id: "00000000-0000-0000-0000-000000000000" }],
  }, "Local verification config must contain only the isolated dummy D1 binding");
  return config;
}


export const LOCAL_GROUP_BYTES = 2 * 1024 * 1024;

// Delivery SQL contains CREATE TABLE, DELETE and INSERT statements, never
// triggers/procedural SQL. Preserve every original byte, including comments,
// quoted semicolons, doubled quotes and newlines. Streaming bounds JS memory.
export async function* sqlStatements(path) {
  let buffer = "";
  let cursor = 0;
  let state = "normal";
  const scan = function* (final) {
    while (cursor < buffer.length) {
      const char = buffer[cursor];
      const next = buffer[cursor + 1];
      if (!final && next === undefined && ["'", '"', "`", "-", "/", "*"].includes(char)) break;
      if (state === "line") { if (char === "\n") state = "normal"; }
      else if (state === "block") { if (char === "*" && next === "/") { state = "normal"; cursor++; } }
      else if (state !== "normal") {
        if (char === state) {
          if (next === state && state !== "]") cursor++;
          else state = "normal";
        }
      } else if (char === "-" && next === "-") { state = "line"; cursor++; }
      else if (char === "/" && next === "*") { state = "block"; cursor++; }
      else if (["'", '"', "`"].includes(char)) state = char;
      else if (char === "[") state = "]";
      else if (char === ";") {
        yield buffer.slice(0, cursor + 1);
        buffer = buffer.slice(cursor + 1);
        cursor = 0;
        continue;
      }
      cursor++;
    }
  };
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    buffer += chunk;
    yield* scan(false);
  }
  yield* scan(true);
  assert.ok(["normal", "line"].includes(state), "Unterminated SQL literal/comment in reviewed file");
  if (buffer.length) yield buffer;
}

export async function localSqlGroups(sqlPath, directory, expectedHash, maxBytes = LOCAL_GROUP_BYTES) {
  const files = [];
  const hash = createHash("sha256");
  let bytes = 0;
  let groupBytes = 0;
  let path;
  for await (const statement of sqlStatements(sqlPath)) {
    const length = Buffer.byteLength(statement);
    assert.ok(length <= maxBytes, "A reviewed SQL statement exceeds the bounded local group size");
    const commentsOnly = statement.replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g, "").trim() === "";
    if (!path || (!commentsOnly && groupBytes + length > maxBytes)) {
      path = join(directory, `group-${files.length.toString().padStart(4, "0")}.sql`);
      files.push(path);
      writeFileSync(path, "");
      groupBytes = 0;
    }
    appendFileSync(path, statement);
    hash.update(statement);
    bytes += length;
    groupBytes += length;
  }
  assert.deepEqual({ sha256: hash.digest("hex"), bytes }, expectedHash, "Local SQL groups changed reviewed bytes");
  return files;
}

function databasePath(directory) {
  const files = [];
  const walk = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".sqlite")) files.push(child);
    }
  };
  walk(directory);
  // Miniflare also creates internal metadata SQLite files. Select only the
  // database containing our seeded preflop schema, never a global state path.
  const databases = files.filter(path => inspectDatabase(path, db => db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name IN ('preflop_datasets', 'preflop_dataset_parts')").get().count === 2));
  assert.equal(databases.length, 1, `Expected exactly one isolated preflop D1 database, found ${databases.length}`);
  return databases[0];
}

function inspectDatabase(path, action) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return action(db); } finally { db.close(); }
}

// Iterate individual parts: do not materialize every payload, a SQL dump, or a
// dataset-sized concatenated string. Hashes cover ALL bytes, including Unicode.
export function readPreflopSnapshot(db) {
  const metadata = db.prepare("SELECT name, content_hash, bytes, parts FROM preflop_datasets ORDER BY name").all();
  const rows = db.prepare("SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part");
  let totalParts = 0;
  const snapshot = metadata.map(dataset => {
    const hash = createHash("sha256");
    let bytes = 0;
    let parts = 0;
    for (const row of rows.iterate(dataset.name)) {
      assert.equal(row.part, parts, `${dataset.name}: missing, duplicate or unordered part`);
      assert.equal(typeof row.body, "string", `${dataset.name}: part body is not text`);
      hash.update(row.body);
      bytes += Buffer.byteLength(row.body);
      parts++;
    }
    totalParts += parts;
    const digest = hash.digest("hex");
    assert.equal(bytes, dataset.bytes, `${dataset.name}: payload byte count mismatch`);
    assert.equal(parts, dataset.parts, `${dataset.name}: payload part count mismatch`);
    assert.equal(digest, dataset.content_hash, `${dataset.name}: payload SHA-256 mismatch`);
    return { name: dataset.name, sha256: digest, bytes, parts };
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM preflop_dataset_parts").get().count, totalParts, "Orphan preflop parts found");
  return snapshot;
}

export const UNRELATED_SEED = `
INSERT INTO postflop_spots VALUES ('local-sentinel', 'local-sentinel', 'srp', 'oop_checks', 'BTN', 'BB', 5.5, 97.5, '{"keep":true}');
INSERT INTO postflop_policies VALUES ('local-sentinel', 'flop', 'local-hash', '{"keep":true}', '{"keep":true}');
INSERT INTO postflop_reasons VALUES ('local-sentinel', 'flop', '{"keep":true}');
INSERT INTO dataset_versions VALUES ('local-sentinel', 'local-hash', '2000-01-01T00:00:00Z', '{"keep":true}');
INSERT INTO postflop_reports VALUES ('local-sentinel', '{"keep":true}');
INSERT INTO postflop_flop_base_br VALUES ('local-sentinel', 'AsKh2d', 0, 1, 'local-hash', X'0001FF');
INSERT INTO postflop_profile_policies VALUES ('nit', 'local-sentinel', 'ip', 'villain', 'flop', '{"keep":true}', '{"keep":true}', '2000-01-01T00:00:00Z');
INSERT INTO account_users VALUES ('local-user', 'local-subject', 'local@example.invalid', 0);
INSERT INTO account_sessions VALUES ('local-session', 'local-user', 1);
INSERT INTO account_oauth_states VALUES ('local-state', 'local-verifier', 'local-nonce', 1);
INSERT INTO account_rate_limits VALUES ('local-bucket', 1, 1);
INSERT INTO account_data VALUES ('local-user', '{"keep":true}', 1);
INSERT INTO account_native_attempts (attempt_hash, code_challenge, app_state, redirect_id, status, oauth_state_hash, user_id, expires_at) VALUES ('local-native-attempt', 'local-native-challenge', 'local-native-app-state', 'reysonai-mobile', 'authorizing', 'local-native-state', 'local-user', 1);
INSERT INTO account_native_oauth_states VALUES ('local-native-state', 'local-native-attempt', 'local-native-verifier', 'local-native-nonce', 1);
INSERT INTO account_native_sessions VALUES ('local-native-session', 'local-user', 'native', 'local-native-session-attempt', 1);
INSERT INTO ranked_players VALUES ('local-user', 'Local ranked sentinel', 1200, 1250, 1);
INSERT INTO ranked_matches (id, user_id, day, slot, started_at, expires_at, status, questions_json, actions_json, completed_at, before_rating, after_rating, score) VALUES ('local-ranked-match', 'local-user', '2000-01-01', 1, 1, 2, 'complete', '[{"keep":true}]', '["fold"]', 2, 1180, 1200, 1);
INSERT INTO fastfold_players (user_id, public_name) VALUES ('local-user', 'Local FastFold sentinel');
INSERT INTO fastfold_sessions (id, user_id, status, private_json, updated_at) VALUES ('local-fastfold-session', 'local-user', 'paused', '{"keep":true}', 1);
INSERT INTO fastfold_results (id, user_id, at, net_bb, before_rating, after_rating, public_json) VALUES ('local-fastfold-result', 'local-user', 1, 0, 1000, 1000, '{"keep":true,"ratingEvidenceBb":0}');
INSERT INTO fastfold_actions VALUES ('local-fastfold-session', 'local-fastfold-action', '{"keep":true}', 'local-fastfold-result');
INSERT INTO human_rank_players (user_id, public_id, public_name) VALUES ('local-user', '00000000-0000-0000-0000-000000000001', 'Local human sentinel');
INSERT INTO human_rank_tables (id, status, private_json, created_at, expires_at, updated_at) VALUES ('local-human-table', 'done', '{"users":["local-user"],"hand":null}', 1, 0, 1);
INSERT INTO human_rank_receipts VALUES ('local-user', '00000000-0000-0000-0000-000000000002', '{"keep":true}');
INSERT INTO human_rank_results (table_id, user_id, at, net_cents, public_json) VALUES ('local-human-table', 'local-user', 1, 0, '{"keep":true}');
INSERT INTO fastfold_dataset_parts VALUES ('local-sentinel', '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a', 0, '{}', 1);
`;

function sentinelInsert(name) {
  return `INSERT INTO preflop_datasets VALUES (${quote(name)}, ${quote(sha256(SENTINEL_BODY))}, ${Buffer.byteLength(SENTINEL_BODY)}, 1);\nINSERT INTO preflop_dataset_parts VALUES (${quote(name)}, 0, ${quote(SENTINEL_BODY)});\n`;
}

function unrelatedSnapshot(db) {
  const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND tbl_name NOT IN ('preflop_datasets', 'preflop_dataset_parts') ORDER BY type, name").all();
  const tables = schema.filter(row => row.type === "table").map(row => row.name);
  const rows = Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]));
  return { schema, rows };
}

export async function verifyLocalD1({ sql, manifest: manifestPath, wrangler, boundedLocal = false, log = console.log }) {
  const started = performance.now();
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const sqlPath = resolve(sql);
  assert.deepEqual(await hashFile(sqlPath), { sha256: manifest.sql.sha256, bytes: manifest.sql.bytes }, "SQL does not match reviewed manifest");
  const config = validateLocalConfig(JSON.parse(readFileSync(join(ROOT, "scripts/ci/preflop.wrangler.jsonc"), "utf8")));
  const local = join(ROOT, ".local");
  mkdirSync(local, { recursive: true });
  const directory = mkdtempSync(join(local, "verify-preflop-d1-"));
  try {
    mkdirSync(join(directory, "home", ".config"), { recursive: true });
    const reviewedPath = join(directory, "reviewed.sql");
    copyFileSync(sqlPath, reviewedPath);
    assert.deepEqual(await hashFile(reviewedPath), { sha256: manifest.sql.sha256, bytes: manifest.sql.bytes }, "SQL changed while preparing local verification");
    const inputFiles = boundedLocal ? await localSqlGroups(reviewedPath, directory, { sha256: manifest.sql.sha256, bytes: manifest.sql.bytes }) : [reviewedPath];
    if (boundedLocal) log(`Bounded LOCAL diagnostic: ${inputFiles.length} byte-exact SQL groups; whole-delivery rollback is NOT established.`);
    const configPath = join(directory, "wrangler.json");
    writeFileSync(configPath, JSON.stringify(config));
    const persist = join(directory, "state");
    const command = wrangler ? process.execPath : "npx";
    const prefix = wrangler ? [resolve(wrangler)] : ["--yes", `wrangler@${WRANGLER_VERSION}`];
    const execute = args => execFileSync(command, [...prefix, ...args], {
      cwd: directory, env: localEnvironment(directory), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60 * 1000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const version = execute(["--version"]).trim();
    assert.equal(version, WRANGLER_VERSION, `Expected pinned Wrangler ${WRANGLER_VERSION}`);
    const importFile = path => {
      const output = execute(["d1", "execute", BINDING, "--local", "--yes", "--config", configPath, "--persist-to", persist, "--file", path, "--json"]);
      // Wrangler's launcher can return 0 if its child dies from a signal. Require
      // a completed success response, then independently inspect the database.
      let results;
      try { results = JSON.parse(output); } catch { throw new Error("Local D1 returned no completed JSON result; a zero launcher status does not prove import success"); }
      assert.ok(Array.isArray(results) && results.length > 0 && results.every(result => result.success === true), "Local D1 import did not return successful statement results");
      return results;
    };
    const seedPath = join(directory, "seed.sql");
    // Apply existing backend migrations only in this empty disposable database.
    // This also catches changes to actual account/postflop schemas in future PRs.
    const migrations = join(ROOT, "../backend/migrations");
    const schema = readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort().map(name => readFileSync(join(migrations, name), "utf8")).join("\n");
    writeFileSync(seedPath, `${schema}\n${UNRELATED_SEED}\n${sentinelInsert(STALE_NAME)}`);
    importFile(seedPath);
    const dbPath = databasePath(persist);
    const preserved = inspectDatabase(dbPath, unrelatedSnapshot);
    assert.ok(Object.keys(preserved.rows).length >= 11, "Expected postflop and account sentinel tables");
    for (const [name, rows] of Object.entries(preserved.rows)) assert.equal(rows.length, 1, `${name}: expected one unrelated sentinel row`);
    const expected = [...manifest.datasets].map(({ name, sha256, bytes, parts }) => ({ name, sha256, bytes, parts })).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
    const verify = () => inspectDatabase(dbPath, db => {
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.deepEqual(readPreflopSnapshot(db), expected, "Imported datasets do not exactly match the reviewed manifest");
      assert.deepEqual(unrelatedSnapshot(db), preserved, "Import changed unrelated schemas or sentinel rows");
    });
    for (let pass = 1; pass <= 2; pass++) {
      for (const [index, file] of inputFiles.entries()) {
        importFile(file);
        if (boundedLocal && ((index + 1) % 8 === 0 || index + 1 === inputFiles.length)) log(`Local D1 pass ${pass}: ${index + 1}/${inputFiles.length} exact-content groups imported.`);
      }
      verify();
      log(`Local D1 import ${pass}/2: full SHA-256 roundtrip and unrelated sentinels verified.`);
    }
    // Add a preexisting row that the reviewed DELETEs remove. Append a duplicate
    // primary key after the FULL reviewed file. If Wrangler ever commits chunks,
    // a failure at the end leaves this sentinel missing and the check fails.
    const beforeProbePath = join(directory, "before-failure.sql");
    writeFileSync(beforeProbePath, sentinelInsert(ROLLBACK_NAME));
    importFile(beforeProbePath);
    const beforeFailure = inspectDatabase(dbPath, readPreflopSnapshot);
    const failedPath = join(directory, "expected-failure.sql");
    if (boundedLocal) {
      // This is deliberately a separate small failed-file transaction probe.
      // It verifies rollback semantics for ONE local batch, not the grouped load.
      writeFileSync(failedPath, `DELETE FROM preflop_dataset_parts;\nDELETE FROM preflop_datasets;\n${sentinelInsert(ROLLBACK_NAME)}${sentinelInsert(ROLLBACK_NAME)}`);
    } else {
      copyFileSync(reviewedPath, failedPath);
      appendFileSync(failedPath, `\nINSERT INTO preflop_datasets (name, content_hash, bytes, parts) VALUES (${quote(expected[0].name)}, 'intentional-local-failure', 1, 1);\n`);
    }
    let failure;
    try { importFile(failedPath); } catch (error) { failure = error; }
    assert.ok(failure, "Expected full-file duplicate-key failure, but local D1 accepted it");
    assert.ok(Number.isInteger(failure.status) && failure.status !== 0, "Rollback probe did not finish with a SQL error (it may have timed out)");
    const failureOutput = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
    assert.match(failureOutput, /UNIQUE constraint failed: preflop_datasets\.name/, "Rollback probe failed for an unexpected reason");
    inspectDatabase(dbPath, db => {
      assert.deepEqual(readPreflopSnapshot(db), beforeFailure, "LOCAL D1 FAILED-FILE ROLLBACK DID NOT PRESERVE DATA: Wrangler may have committed partial transactions");
      assert.deepEqual(unrelatedSnapshot(db), preserved, "Failed-file import changed unrelated schemas or sentinel rows");
    });
    const result = {
      local_only: true,
      mode: boundedLocal ? "bounded-local-diagnostic" : "strict-whole-file",
      local_transactions_per_import: inputFiles.length,
      wrangler_version: version,
      datasets: expected.length,
      parts: expected.reduce((sum, dataset) => sum + dataset.parts, 0),
      bytes: expected.reduce((sum, dataset) => sum + dataset.bytes, 0),
      repeated_imports: 2,
      full_payload_sha256_roundtrip: true,
      stale_preflop_row_removed: true,
      unrelated_tables_preserved: Object.keys(preserved.rows),
      failed_transaction_rollback: "preserved all preexisting preflop rows and unrelated sentinels",
      full_file_failure_rollback: boundedLocal ? "NOT ESTABLISHED: delivery was imported in independent local transactions" : "preserved all preexisting preflop rows and unrelated sentinels",
      remote_atomicity: "not tested; local D1 evidence is not a remote atomicity guarantee",
      elapsed_seconds: Number(((performance.now() - started) / 1000).toFixed(3)),
      verifier_process_max_rss_kib: process.resourceUsage().maxRSS,
      memory_measurement_scope: "verifier Node process only; excludes Wrangler/workerd subprocesses",
    };
    log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    // Only remove the unique disposable directory this invocation just created.
    rmSync(directory, { recursive: true, force: true });
  }
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === "--bounded-local") {
      assert.ok(!options.boundedLocal, "Duplicate argument: --bounded-local");
      options.boundedLocal = true;
      continue;
    }
    assert.ok(["--sql", "--manifest", "--wrangler"].includes(key), `Unknown argument: ${key}`);
    assert.ok(argv[index + 1] && !argv[index + 1].startsWith("--"), `Missing value for ${key}`);
    assert.ok(!(key.slice(2) in options), `Duplicate argument: ${key}`);
    options[key.slice(2)] = argv[++index];
  }
  assert.ok(options.sql && options.manifest, "Required: --sql <reviewed.sql> --manifest <delivery.json>");
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyLocalD1(parseArguments(process.argv.slice(2))).catch(error => {
    console.error(`Local preflop D1 verification failed: ${error.message}`);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exitCode = 1;
  });
}
