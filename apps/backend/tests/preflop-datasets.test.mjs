import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import { buildPreflopSql, PART_CHARS } from "../../frontend/scripts/publish-d1.mjs";

// D1 mock over preflop_datasets / preflop_dataset_parts rows.
function mockDb(datasets, parts) {
  return { prepare(sql) {
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
  assert.deepEqual((await (await get("/v1/preflop/datasets")).json()).datasets, { "opening-ranges": { hash: "h", bytes: text.length } });
  const response = await get("/v1/preflop/datasets/opening-ranges");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"h"');
  assert.equal(await response.text(), text);
  assert.equal((await get("/v1/preflop/datasets/opening-ranges", { "if-none-match": '"h"' })).status, 304);
});

test("unknown, invalid and incomplete datasets are rejected", async () => {
  assert.equal((await get("/v1/preflop/datasets/missing")).status, 404);
  assert.equal((await get("/v1/preflop/datasets/..%2Fsecret")).status, 400);
  const broken = { SOLUTIONS: null, DB: mockDb([{ name: "a", content_hash: "h", bytes: 1, parts: 2 }], [{ name: "a", part: 0, body: "{" }]) };
  assert.equal((await worker.fetch(new Request("https://edge.test/v1/preflop/datasets/a"), broken)).status, 503);
});

test("publish splits datasets into parts that reassemble exactly", () => {
  const sql = buildPreflopSql({ "reasons/BB_vs_BTN": text });
  assert.match(sql, /INSERT INTO preflop_datasets .*'reasons\/BB_vs_BTN', '[0-9a-f]{64}', \d+, 2\);/);
  assert.equal(sql.split("\n").filter(line => line.startsWith("INSERT INTO preflop_dataset_parts")).length, 2);
  assert.ok(sql.indexOf("DELETE FROM preflop_dataset_parts;") < sql.indexOf("INSERT"));
});
