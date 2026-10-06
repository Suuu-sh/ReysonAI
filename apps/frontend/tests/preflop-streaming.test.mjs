import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { PART_CHARS, preflopDatasetEntries, preflopDatasets, preflopSqlChunks, buildPreflopSql,
  preparePreflopSerialization, writePreflopSqlFile, assertPreflopSqlFile } from "../scripts/lib/preflop-sql.mjs";
import { assertDeliveryBundleFile, reviewedSourcePaths } from "../scripts/lib/reviewed-preflop.mjs";
import { reviewedStage3SourcePaths } from "../scripts/lib/reviewed-stage3.mjs";

// Frozen independent pre-streaming serializer. Keep these legacy implementations
// independent of the new iterator, chunker, quote helper and PART_CHARS constant.
function legacyDatasets(dir) {
  const found = {};
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".json")) found[relative(dir, path).replace(/\.json$/, "")] = JSON.stringify(JSON.parse(readFileSync(path, "utf8")));
    }
  };
  walk(dir);
  return found;
}
function legacySql(datasets) {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const lines = ["-- Preflop datasets: delivery copy of apps/frontend/src/estimated/**/*.json.",
    "DELETE FROM preflop_dataset_parts;", "DELETE FROM preflop_datasets;"];
  for (const [name, text] of Object.entries(datasets)) {
    const parts = [];
    for (let index = 0; index < text.length; index += 30_000) parts.push(text.slice(index, index + 30_000));
    const hash = createHash("sha256").update(text).digest("hex");
    lines.push(`INSERT INTO preflop_datasets (name, content_hash, bytes, parts) VALUES (${quote(name)}, ${quote(hash)}, ${Buffer.byteLength(text)}, ${parts.length});`);
    parts.forEach((body, part) => lines.push(`INSERT INTO preflop_dataset_parts (name, part, body) VALUES (${quote(name)}, ${part}, ${quote(body)});`));
  }
  return `${lines.join("\n")}\n`;
}
const sha256 = value => createHash("sha256").update(value).digest("hex");
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "preflop-streaming-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "datasets");
  const put = (name, value) => {
    const path = join(dir, `${name}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  };
  for (const name of ["10", "2", "01", "4294967294", "4294967295", "A", "ä", "z"])
    put(name, { name, 10: "ten", 2: "two", quoted: "' ; 雪 é 😀 \\ \n" });
  put("reasons/o'雪", { body: "x".repeat(30_000 - 1 - '{"body":"'.length) + "😀雪'\\\n" });
  put("nested/many", { body: "雪'".repeat(40_000) });
  put("nested/empty", {});
  put("nested/primitive", null);
  writeFileSync(join(dir, "ignored.txt"), "not a dataset");
  // Object assignment historically does not create this special own property.
  put("__proto__", { historical: "ignored by old traversal" });
  return { root, dir, put, path: join(root, "preflop.sql"), prefix: "-- schema 雪 ' 😀\nCREATE TABLE fixture (name TEXT);\n\n" };
}

test("serial traversal, SQL and metadata equal the frozen serializer including numeric names and UTF-16 splits", t => {
  const { dir, prefix, path } = fixture(t);
  const old = legacyDatasets(dir);
  assert.equal(PART_CHARS, 30_000);
  assert.deepEqual([...preflopDatasetEntries(dir)], Object.entries(old));
  assert.deepEqual(preflopDatasets(dir), old);
  assert.deepEqual(Object.keys(old).slice(0, 3), ["2", "10", "4294967294"]);
  const canonical = prefix + legacySql(old);
  const serialized = preparePreflopSerialization(dir, prefix);
  assert.equal(prefix + buildPreflopSql(old), canonical);
  assert.equal(buildPreflopSql({ empty: "" }), legacySql({ empty: "" }));
  assert.equal(buildPreflopSql({}), legacySql({}));
  assert.equal(Array.from(serialized.sqlChunks()).join(""), canonical);
  assert.deepEqual(serialized.sql, { sha256: sha256(canonical), bytes: Buffer.byteLength(canonical) });
  const expectedDatasets = Object.entries(old).map(([name, text]) => ({ name, sha256: sha256(text),
    bytes: Buffer.byteLength(text), parts: Math.ceil(text.length / 30_000) })).sort((a, b) => compare(a.name, b.name));
  assert.deepEqual(serialized.datasets, expectedDatasets);
  const split = Array.from(preflopSqlChunks([["split", old["reasons/o'雪"]]]));
  assert.equal(split.length, 6);
  assert.ok(split[4].includes("\ud83d"));
  assert.ok(split[5].includes("\ude00"));
  assert.ok(split[5].includes("''"));
  assert.equal(split.at(-1).at(-1), "\n");
  writePreflopSqlFile(path, serialized.sqlChunks(), serialized.sql);
  assert.deepEqual(readFileSync(path), Buffer.from(canonical));
  assert.doesNotThrow(() => assertPreflopSqlFile(path, serialized.sqlChunks(), serialized.sql));
});

test("byte comparison rejects changed, missing, extra and truncated SQL without accepting substitute manifests", t => {
  const { dir, prefix, path } = fixture(t);
  const serialized = preparePreflopSerialization(dir, prefix);
  const canonical = Buffer.from(prefix + legacySql(legacyDatasets(dir)));
  const manifest = { schema_version: 1, sql: serialized.sql, datasets: serialized.datasets };
  const expected = { manifest, sqlChunks: serialized.sqlChunks };
  writeFileSync(path, canonical);
  assert.doesNotThrow(() => assertDeliveryBundleFile(path, structuredClone(manifest), expected));
  for (const bytes of [canonical.subarray(0, canonical.length - 1), Buffer.concat([canonical, Buffer.from("\n--extra")]), Buffer.alloc(0)]) {
    writeFileSync(path, bytes);
    assert.throws(() => assertDeliveryBundleFile(path, manifest, expected), /differs/);
  }
  for (const index of [0, 70_000, canonical.length - 2]) {
    const changed = Buffer.from(canonical);
    changed[index] ^= 1;
    writeFileSync(path, changed);
    assert.throws(() => assertDeliveryBundleFile(path, manifest, expected), /differs/);
  }
  writeFileSync(path, canonical);
  for (const changed of [
    { ...manifest, sql: { ...manifest.sql, bytes: manifest.sql.bytes + 1 } },
    { ...manifest, sql: { ...manifest.sql, sha256: "0".repeat(64) } },
    { ...manifest, datasets: manifest.datasets.slice(1) },
    { ...manifest, datasets: [...manifest.datasets, { name: "extra" }] },
    { ...manifest, datasets: manifest.datasets.map((row, index) => index ? row : { ...row, parts: row.parts + 1 }) },
  ]) assert.throws(() => assertDeliveryBundleFile(path, changed, expected), /differs/);
  assert.throws(() => assertPreflopSqlFile(path, serialized.sqlChunks(), { ...serialized.sql, sha256: "0".repeat(64) }), /differs/);
  rmSync(path);
  assert.throws(() => assertDeliveryBundleFile(path, manifest, expected), { code: "ENOENT" });
});

test("prepared serialization rejects later changed, missing or added datasets on every replay", t => {
  const { dir, prefix, path, put } = fixture(t);
  const serialized = preparePreflopSerialization(dir, prefix);
  const original = readFileSync(join(dir, "z.json"));
  writePreflopSqlFile(path, serialized.sqlChunks(), serialized.sql);
  put("z", { changed: "after preparation" });
  assert.throws(() => Array.from(serialized.sqlChunks()), /differs/);
  assert.throws(() => assertPreflopSqlFile(path, serialized.sqlChunks(), serialized.sql), /differs/);
  assert.throws(() => writePreflopSqlFile(path, serialized.sqlChunks(), serialized.sql), /differs/);
  writeFileSync(join(dir, "z.json"), original);
  rmSync(join(dir, "z.json"));
  assert.throws(() => Array.from(serialized.sqlChunks()), /differs/);
  writeFileSync(join(dir, "z.json"), original);
  put("added", { new: true });
  assert.throws(() => Array.from(serialized.sqlChunks()), /differs/);
});

test("streamed output must still match the prepared overall SQL identity and source graph", t => {
  const { dir, prefix, path } = fixture(t);
  const serialized = preparePreflopSerialization(dir, prefix);
  const changedChunks = function* () {
    yield "--different-prefix\n";
    yield* serialized.sqlChunks();
  };
  assert.throws(() => writePreflopSqlFile(path, changedChunks(), serialized.sql), /differs/);
  assert.throws(() => assertPreflopSqlFile(path, changedChunks(), serialized.sql), /differs/);
  for (const paths of [reviewedSourcePaths(), reviewedStage3SourcePaths()])
    assert.ok(paths.includes("apps/frontend/scripts/lib/preflop-sql.mjs"));
});

test("official build/check and import keep full review gates and immediate bounded pre-import validation", () => {
  const reviewed = readFileSync(new URL("../scripts/lib/reviewed-preflop.mjs", import.meta.url), "utf8");
  const start = reviewed.indexOf("export function preparePreflopDeliveryStream");
  const end = reviewed.indexOf("export function preparePreflopDelivery(", start);
  const prepare = reviewed.slice(start, end);
  assert.match(prepare, /verifyReviewedPreflop\(root\)/);
  assert.match(prepare, /verifyReviewedStage3\(root\)/);
  assert.ok(prepare.indexOf("verifyReviewedPreflop(root)") < prepare.indexOf("preparePreflopSerialization("));
  assert.ok(prepare.indexOf("verifyReviewedStage3(root)") < prepare.indexOf("preparePreflopSerialization("));
  for (const path of ["verify-reviewed-preflop.mjs", "import-reviewed-preflop.mjs"]) {
    const source = readFileSync(new URL(`../scripts/${path}`, import.meta.url), "utf8");
    assert.match(source, /preparePreflopDeliveryStream\(\)/);
    assert.doesNotMatch(source, /preparePreflopDelivery\(\)|expected\.sql\b|readFileSync\([^\n]*"preflop\.sql"/);
    assert.match(source, /assertDeliveryBundleFile/);
    assert.doesNotMatch(source, /\b(?:skipReview|skipVerification|updateReview|approveReview)\b|["'](?:--(?:skip-review|skip-verification|update-review|approve-review)|independently-reviewed)["']/);
  }
  const importer = readFileSync(new URL("../scripts/import-reviewed-preflop.mjs", import.meta.url), "utf8");
  assert.equal((importer.match(/assertDeliveryBundleFile\(join\(directory, "preflop\.sql"\), manifest, expected\)/g) ?? []).length, 2);
  const gate = importer.lastIndexOf('assertDeliveryBundleFile(join(directory, "preflop.sql"), manifest, expected)');
  assert.ok(gate < importer.indexOf('outcome("import-started-outcome-unconfirmed")'));
  assert.ok(gate < importer.indexOf('run(["d1", "execute", "reysonai", "--remote", "--yes", "--config", "wrangler.jsonc", "--file"'));
  const publisher = readFileSync(new URL("../scripts/publish-d1.mjs", import.meta.url), "utf8");
  assert.match(publisher, /preflopSqlChunks\(preflopDatasetEntries\(\)/);
  assert.doesNotMatch(publisher, /const datasets = preflopDatasets\(\)|sql \+= buildPreflopSql/);
});
