import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { hashFile, localEnvironment, parseArguments, localSqlGroups, sqlStatements, readPreflopSnapshot, validateLocalConfig, validateManifest, verifyLocalD1, WRANGLER_VERSION, UNRELATED_SEED } from "../scripts/verify-preflop-local-d1.mjs";

const hash = text => createHash("sha256").update(text).digest("hex");
const body = JSON.stringify({ text: "日本語; apostrophe ' and emoji 🂡", value: [1, 2, 3] });
const expected = { name: "reasons/local-fixture", sha256: hash(body), bytes: Buffer.byteLength(body), parts: 2 };
const manifest = () => ({ schema_version: 1, sql: { sha256: hash("SQL"), bytes: 3 }, datasets: [expected] });
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../backend/migrations/0003_preflop.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO preflop_datasets VALUES (?, ?, ?, ?)").run(expected.name, expected.sha256, expected.bytes, expected.parts);
  const insert = db.prepare("INSERT INTO preflop_dataset_parts VALUES (?, ?, ?)");
  insert.run(expected.name, 0, body.slice(0, 8));
  insert.run(expected.name, 1, body.slice(8));
  return db;
}

test("local verifier pins Wrangler and rejects remote/unknown/duplicate CLI options", () => {
  assert.equal(WRANGLER_VERSION, "4.147.0");
  assert.deepEqual(parseArguments(["--sql", "reviewed.sql", "--manifest", "delivery.json", "--wrangler", "/local/wrangler.js"]), {
    sql: "reviewed.sql", manifest: "delivery.json", wrangler: "/local/wrangler.js",
  });
  assert.equal(parseArguments(["--sql", "a", "--manifest", "b", "--bounded-local"]).boundedLocal, true);
  for (const argv of [["--remote"], ["--config", "prod.json"], ["--sql"], ["--manifest", "x"], ["--sql", "x", "--sql", "y", "--manifest", "z"]]) assert.throws(() => parseArguments(argv));
});

test("delivery manifest fails closed on invalid metadata or duplicate dataset names", () => {
  assert.equal(validateManifest(manifest()).datasets.length, 1);
  for (const transform of [
    value => { value.schema_version = 2; },
    value => { value.sql.sha256 = "bad"; },
    value => { value.sql.bytes = 0; },
    value => { value.datasets = []; },
    value => { value.datasets.push({ ...expected }); },
    value => { value.datasets[0] = { ...expected, bytes: 1.5 }; },
    value => { value.datasets[0] = { ...expected, parts: -1 }; },
    value => { value.datasets[0] = { ...expected, name: "__local_d1_rollback_sentinel__" }; },
  ]) {
    const value = manifest();
    transform(value);
    assert.throws(() => validateManifest(value));
  }
});

test("verification config admits only a dummy local D1 and no remote or extra bindings", () => {
  const config = JSON.parse(readFileSync(new URL("../scripts/ci/preflop.wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(validateLocalConfig(config), config);
  assert.throws(() => validateLocalConfig({ ...config, account_id: "real-account" }));
  assert.throws(() => validateLocalConfig({ ...config, d1_databases: [{ ...config.d1_databases[0], database_id: "production" }] }));
  assert.throws(() => validateLocalConfig({ ...config, ai: { binding: "AI" } }));
});

test("local subprocess environment is credential-free and disables dotenv and telemetry", () => {
  const previous = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = "must-not-propagate";
  try {
    const env = localEnvironment("/isolated-verification");
    assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
    assert.equal(env.CLOUDFLARE_ACCOUNT_ID, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.HOME, "/isolated-verification/home");
    assert.equal(env.WRANGLER_SEND_METRICS, "false");
    assert.equal(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, "false");
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previous;
  }
});

test("full payload roundtrip includes every ordered UTF-8 byte", () => {
  const db = database();
  try { assert.deepEqual(readPreflopSnapshot(db), [expected]); } finally { db.close(); }
});

test("current backend schema has a valid preservation sentinel in every unrelated table", () => {
  const db = new DatabaseSync(":memory:");
  const migrations = new URL("../../backend/migrations/", import.meta.url);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const name of readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort())
      db.exec(readFileSync(new URL(name, migrations), "utf8"));
    db.exec(UNRELATED_SEED);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('preflop_datasets', 'preflop_dataset_parts') ORDER BY name").all();
    for (const { name } of tables)
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get().count, 1, `${name}: expected one unrelated sentinel row`);
    for (const name of ["account_native_attempts", "account_native_oauth_states", "account_native_sessions", "ranked_players", "ranked_matches", "fastfold_players", "fastfold_sessions", "fastfold_results", "fastfold_actions", "fastfold_dataset_parts", "human_rank_players", "human_rank_tables", "human_rank_receipts", "human_rank_results"])
      assert.ok(tables.some(table => table.name === name), `${name}: current account/ranked migrations must be covered`);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("roundtrip rejects corrupted content, missing parts, or orphaned rows", () => {
  for (const sql of [
    "UPDATE preflop_dataset_parts SET body = body || 'changed' WHERE part = 1",
    "DELETE FROM preflop_dataset_parts WHERE part = 0",
    "UPDATE preflop_datasets SET content_hash = 'wrong'",
    "UPDATE preflop_datasets SET parts = 3",
    "INSERT INTO preflop_dataset_parts VALUES ('orphan', 0, '{}')",
  ]) {
    const db = database();
    try { db.exec(sql); assert.throws(() => readPreflopSnapshot(db)); } finally { db.close(); }
  }
});

test("SQL byte/hash mismatch aborts before any Wrangler process starts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "preflop-local-d1-test-"));
  try {
    const sql = join(directory, "reviewed.sql");
    const manifestPath = join(directory, "delivery.json");
    writeFileSync(sql, "tampered SQL");
    writeFileSync(manifestPath, JSON.stringify(manifest()));
    assert.deepEqual(await hashFile(sql), { sha256: hash("tampered SQL"), bytes: 12 });
    await assert.rejects(() => verifyLocalD1({ sql, manifest: manifestPath, wrangler: "/must-never-be-executed.js" }), /SQL does not match reviewed manifest/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("pinned Wrangler local integration: Unicode roundtrip, repeated import, isolation and full-file rollback", {
  skip: !process.env.PREFLOP_LOCAL_WRANGLER,
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "preflop-local-integration-"));
  try {
    const escape = value => `'${value.replaceAll("'", "''")}'`;
    const schema = readFileSync(new URL("../../backend/migrations/0003_preflop.sql", import.meta.url), "utf8");
    const sqlText = `${schema}\nDELETE FROM preflop_dataset_parts;\nDELETE FROM preflop_datasets;\nINSERT INTO preflop_datasets VALUES (${escape(expected.name)}, '${expected.sha256}', ${expected.bytes}, 2);\nINSERT INTO preflop_dataset_parts VALUES (${escape(expected.name)}, 0, ${escape(body.slice(0, 8))});\nINSERT INTO preflop_dataset_parts VALUES (${escape(expected.name)}, 1, ${escape(body.slice(8))});\n`;
    const sql = join(directory, "reviewed.sql");
    const manifestPath = join(directory, "delivery.json");
    writeFileSync(sql, sqlText);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest(), sql: { sha256: hash(sqlText), bytes: Buffer.byteLength(sqlText) } }));
    const result = await verifyLocalD1({ sql, manifest: manifestPath, wrangler: process.env.PREFLOP_LOCAL_WRANGLER, log: () => {} });
    assert.equal(result.full_payload_sha256_roundtrip, true);
    assert.equal(result.repeated_imports, 2);
    assert.equal(result.unrelated_tables_preserved.length, 25);
    for (const name of ["ranked_players", "ranked_matches"])
      assert.ok(result.unrelated_tables_preserved.includes(name), `${name}: imports and rollback must preserve ranked records`);
    assert.equal(result.full_file_failure_rollback, "preserved all preexisting preflop rows and unrelated sentinels");
    const bounded = await verifyLocalD1({ sql, manifest: manifestPath, wrangler: process.env.PREFLOP_LOCAL_WRANGLER, boundedLocal: true, log: () => {} });
    assert.equal(bounded.full_payload_sha256_roundtrip, true);
    assert.equal(bounded.mode, "bounded-local-diagnostic");
    assert.match(bounded.full_file_failure_rollback, /NOT ESTABLISHED/);
    assert.equal(bounded.failed_transaction_rollback, "preserved all preexisting preflop rows and unrelated sentinels");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test("bounded local grouping preserves original SQL bytes and quoted semicolons", async () => {
  const directory = mkdtempSync(join(tmpdir(), "preflop-local-groups-"));
  try {
    const source = "-- header; comment\r\nCREATE TABLE [name;test] (body TEXT);\nINSERT INTO [name;test] VALUES ('雪; \'\' quoted'); /* ; block */\nINSERT INTO [name;test] VALUES (\"double; \"\" quote\");\n-- trailing; comment\n";
    const sql = join(directory, "source.sql");
    writeFileSync(sql, source);
    const statements = [];
    for await (const statement of sqlStatements(sql)) statements.push(statement);
    assert.equal(statements.length, 4);
    assert.equal(statements.join(""), source);
    const files = await localSqlGroups(sql, directory, { sha256: hash(source), bytes: Buffer.byteLength(source) }, 100);
    assert.ok(files.length > 1);
    assert.equal(files.map(file => readFileSync(file, "utf8")).join(""), source);
    await assert.rejects(() => localSqlGroups(sql, directory, { sha256: hash("wrong"), bytes: 1 }, 100), /changed reviewed bytes/);
    writeFileSync(sql, "INSERT INTO x VALUES ('unclosed);");
    await assert.rejects(async () => { for await (const _statement of sqlStatements(sql)) { /* exhaust parser */ } }, /Unterminated/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
