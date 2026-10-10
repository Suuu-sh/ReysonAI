import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import { buildPreflopSql, PART_CHARS } from "../../frontend/scripts/publish-d1.mjs";

// D1 mock over preflop_datasets / preflop_dataset_parts rows.
function mockDb(datasets, parts) {
  const calls = [];
  return { calls, prepare(sql) {
    calls.push(sql);
    let args = [];
    const statement = { bind(...values) { args = values; return statement; }, async all() {
      if (sql.includes("FROM preflop_dataset_parts")) return { results: parts.filter(row => row.name === args[0]).sort((a, b) => a.part - b.part) };
      return { results: sql.includes("WHERE name") ? datasets.filter(row => row.name === args[0]) : datasets };
    } };
    return statement;
  } };
}

const text = JSON.stringify({ spots: [{ id: "UTG_open", note: "x".repeat(PART_CHARS) }] });
const parts = [text.slice(0, PART_CHARS), text.slice(PART_CHARS)].map((body, part) => ({ name: "opening-ranges", part, body }));
const env = { SOLUTIONS: null, DB: mockDb([{ name: "opening-ranges", content_hash: "h", bytes: text.length, parts: 2 }], parts) };
const get = (path, headers) => worker.fetch(new Request(`https://edge.test${path}`, { headers }), env);

test("preflop datasets are listed and served as the concatenated JSON with an etag", async () => {
  const listed = await get("/v1/preflop/datasets");
  assert.deepEqual((await listed.json()).datasets, { "opening-ranges": { hash: "h", bytes: text.length } });
  assert.equal(listed.headers.get("cache-control"), "public, max-age=60, s-maxage=300");
  const response = await get("/v1/preflop/datasets/opening-ranges");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"h"');
  assert.equal(await response.text(), text);
  const notModified = await get("/v1/preflop/datasets/opening-ranges", { "if-none-match": '"h"' });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get("etag"), '"h"');
  assert.equal(notModified.headers.get("cache-control"), null);
  assert.equal((await get("/v1/preflop/datasets/opening-ranges", { "if-none-match": 'W/"h"' })).status, 200,
    "the current endpoint uses exact ETag equality");
  const cache = await get("/v1/preflop/datasets/opening-ranges");
  assert.equal(cache.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
});

test("unknown, invalid and incomplete datasets are rejected", async () => {
  const missing = await get("/v1/preflop/datasets/missing");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "dataset not found: missing" });
  const invalid = await get("/v1/preflop/datasets/..%2Fsecret");
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid dataset name" });
  const broken = { SOLUTIONS: null, DB: mockDb([{ name: "a", content_hash: "h", bytes: 1, parts: 2 }], [{ name: "a", part: 0, body: "{" }]) };
  const incomplete = await worker.fetch(new Request("https://edge.test/v1/preflop/datasets/a"), broken);
  assert.equal(incomplete.status, 503);
  assert.deepEqual(await incomplete.json(), { error: "dataset is incomplete: a" });
  const malformed = await get("/v1/preflop/datasets/%E0%A4%A");
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "invalid dataset name" });
  assert.equal((await get("/v1/preflop/datasets/profiles/evil/villain/opening-ranges")).status, 400);
});

test("encoded published names and raw Unicode chunk text pass through with public CORS", async () => {
  const raw = '{ \n  "note": "あいうえお 🌱", "decimal": 1.00 }\t\n';
  const split = raw.indexOf("🌱");
  const rawParts = [raw.slice(0, split), raw.slice(split)];
  const profileName = "profiles/nit/villain/opening-ranges";
  const db = mockDb([
    { name: "reasons/BB_vs_BTN", content_hash: "raw-hash", bytes: new TextEncoder().encode(raw).byteLength, parts: 2 },
    { name: profileName, content_hash: "profile-hash", bytes: 1, parts: 1 },
  ], [
    ...rawParts.map((body, part) => ({ name: "reasons/BB_vs_BTN", part, body })),
    { name: profileName, part: 0, body: "{}" },
  ]);
  const response = await worker.fetch(new Request("https://edge.test/v1/preflop/datasets/reasons%2FBB_vs_BTN", {
    headers: { origin: "https://allowed.example" },
  }), { SOLUTIONS: null, DB: db, ALLOWED_ORIGIN: "https://allowed.example" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"raw-hash"');
  assert.equal(await response.text(), raw);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://allowed.example");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.equal((await worker.fetch(new Request(`https://edge.test/v1/preflop/datasets/${profileName}`), { SOLUTIONS: null, DB: db })).status, 200);
  assert.ok(db.calls.indexOf("SELECT content_hash, parts FROM preflop_datasets WHERE name = ?")
    < db.calls.indexOf("SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part"));
});

test("publish splits datasets into parts that reassemble exactly", () => {
  const sql = buildPreflopSql({ "reasons/BB_vs_BTN": text });
  assert.match(sql, /INSERT INTO preflop_datasets .*'reasons\/BB_vs_BTN', '[0-9a-f]{64}', \d+, 2\);/);
  assert.equal(sql.split("\n").filter(line => line.startsWith("INSERT INTO preflop_dataset_parts")).length, 2);
  assert.ok(sql.indexOf("DELETE FROM preflop_dataset_parts;") < sql.indexOf("INSERT"));
});
