import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import { buildPreflopSql, PART_CHARS } from "../../frontend/scripts/publish-d1.ts";
import { installEdgeCache } from "./helpers/edge-cache.ts";

// D1 mock over preflop_datasets / preflop_dataset_parts rows.
function mockDb(datasets?: any, parts?: any, onQuery: any = (): any => {}): any {
  return { prepare(sql?: any): any {
    let args: any[] = [];
    const statement = { bind(...values: any[]): any { args = values; return statement; }, async all(): Promise<any> {
      onQuery(sql, args);
      if (sql.includes("FROM preflop_dataset_parts")) return { results: parts.filter((row?: any): any => row.name === args[0]).sort((a?: any, b?: any): any => a.part - b.part) };
      return { results: sql.includes("WHERE name") ? datasets.filter((row?: any): any => row.name === args[0]) : datasets };
    } };
    return statement;
  } };
}

const text = JSON.stringify({ spots: [{ id: "UTG_open", note: "x".repeat(PART_CHARS) }] });
const parts = [text.slice(0, PART_CHARS), text.slice(PART_CHARS)].map((body?: any, part?: any): any => ({ name: "opening-ranges", part, body }));
const env: any = { SOLUTIONS: null, DB: mockDb([{ name: "opening-ranges", content_hash: "h", bytes: text.length, parts: 2 }], parts) };
const get: any = (path?: any, headers?: any): any => worker.fetch(new Request(`https://edge.test${path}`, { headers }), env);

test("preflop datasets are listed and served as the concatenated JSON with an etag", async (): Promise<any> => {
  assert.deepEqual((await (await get("/v1/preflop/datasets")).json()).datasets, { "opening-ranges": { hash: "h", bytes: text.length } });
  const response = await get("/v1/preflop/datasets/opening-ranges");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"h"');
  assert.equal(await response.text(), text);
  assert.equal((await get("/v1/preflop/datasets/opening-ranges", { "if-none-match": '"h"' })).status, 304);
});

test("unknown, invalid and incomplete datasets are rejected", async (): Promise<any> => {
  assert.equal((await get("/v1/preflop/datasets/missing")).status, 404);
  assert.equal((await get("/v1/preflop/datasets/..%2Fsecret")).status, 400);
  const broken: any = { SOLUTIONS: null, DB: mockDb([{ name: "a", content_hash: "h", bytes: 1, parts: 2 }], [{ name: "a", part: 0, body: "{" }]) };
  assert.equal((await worker.fetch(new Request("https://edge.test/v1/preflop/datasets/a"), broken)).status, 503);
});

test("public preflop catalog and body use bounded edge TTLs without caching CORS or 304", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  cache.rewriteBrowserMaxAge(14_400);
  const queries: any[] = [];
  const datasets = [{ name: "opening-ranges", content_hash: "old", bytes: 2, parts: 1 }];
  const parts = [{ name: "opening-ranges", part: 0, body: "{}" }];
  const env: any = { DB: mockDb(datasets, parts, (sql?: any): any => queries.push(sql)), ALLOWED_ORIGIN: "https://one.test,https://two.test" };
  const get = (path?: any, origin: any = "https://one.test", headers: any = {}): any => worker.fetch(new Request(`https://edge.test${path}`, { headers: { origin, ...headers } }), env);
  const catalog = await get("/v1/preflop/datasets?ignored=one");
  assert.equal(catalog.headers.get("x-reysonai-cache"), "MISS");
  assert.equal(catalog.headers.get("cache-control"), "public, max-age=60, s-maxage=60");
  const catalogHit = await get("/v1/preflop/datasets?ignored=two");
  assert.equal(catalogHit.headers.get("x-reysonai-cache"), "HIT");
  assert.equal(catalogHit.headers.get("cache-control"), "public, max-age=60, s-maxage=60", "zone browser TTL must not leak from Cache API hit");
  assert.equal(queries.length, 1);

  const path = "/v1/preflop/datasets/opening-ranges";
  const conditional = await get(path, "https://one.test", { "if-none-match": '"old"' });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("x-reysonai-cache"), null);
  assert.equal(queries.length, 3, "a cold conditional request reads metadata and parts once");
  const body = await get(`${path}?ignored=one`, "https://two.test");
  assert.equal(body.headers.get("x-reysonai-cache"), "HIT");
  assert.equal(body.headers.get("access-control-allow-origin"), "https://two.test");
  assert.equal(body.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
  assert.equal(await body.text(), "{}");
  assert.equal((await get(path, "https://one.test", { "if-none-match": '"old"' })).status, 304);
  assert.equal(queries.length, 3);
  assert.ok([...cache.entries.values()].every((entry?: any): any => !entry.response.headers.has("access-control-allow-origin") && !entry.response.headers.has("x-reysonai-cache")));

  cache.advance(60_000);
  datasets.push({ name: "new", content_hash: "x", bytes: 2, parts: 1 });
  const refreshedCatalog = await get("/v1/preflop/datasets");
  assert.equal(refreshedCatalog.headers.get("x-reysonai-cache"), "MISS");
  assert.ok((await refreshedCatalog.json()).datasets.new);
  datasets[0].content_hash = "new";
  parts[0].body = "[]";
  cache.advance(240_000);
  const refreshedBody = await get(path);
  assert.equal(refreshedBody.headers.get("x-reysonai-cache"), "MISS");
  assert.equal(refreshedBody.headers.get("etag"), '"new"');
  assert.equal(await refreshedBody.text(), "[]");
  assert.equal(queries.length, 6);
  assert.equal(cache.puts.length, 4);
});

test("conditional dataset GET uses weak tag comparison on MISS and HIT without another D1 read", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  const queries: any[] = [];
  const env: any = { DB: mockDb([{ name: "opening-ranges", content_hash: "old", bytes: 2, parts: 1 }], [{ name: "opening-ranges", part: 0, body: "{}" }], (sql?: any): any => queries.push(sql)), ALLOWED_ORIGIN: "https://one.test" };
  const path = "https://edge.test/v1/preflop/datasets/opening-ranges";
  const get = (condition?: any): any => worker.fetch(new Request(path, { headers: { origin: "https://one.test", ...(condition ? { "if-none-match": condition } : {}) } }), env);
  const miss = await get('W/"old"');
  assert.equal(miss.status, 304);
  assert.equal(miss.headers.get("etag"), '"old"');
  assert.equal(miss.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
  assert.equal(miss.headers.get("access-control-allow-origin"), "https://one.test");
  assert.equal(await miss.text(), "");
  assert.equal(queries.length, 2);
  assert.equal(cache.puts.length, 1, "the 200 representation, not the 304, is cached");

  const cached = [...cache.entries.values()][0].response;
  cached.headers.set("etag", 'W/"old"');
  cached.headers.set("cache-control", "public, max-age=14400");
  cached.headers.set("date", "Sun, 11 Oct 2026 00:00:00 GMT");
  cached.headers.set("content-location", "/v1/preflop/datasets/opening-ranges");
  cached.headers.set("expires", "Sun, 11 Oct 2026 00:05:00 GMT");
  cached.headers.set("vary", "Accept-Encoding");
  const hit = await get('"other", "old"');
  assert.equal(hit.status, 304);
  assert.equal(hit.headers.get("etag"), 'W/"old"');
  assert.equal(hit.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
  assert.equal(hit.headers.get("date"), "Sun, 11 Oct 2026 00:00:00 GMT");
  assert.equal(hit.headers.get("content-location"), "/v1/preflop/datasets/opening-ranges");
  assert.equal(hit.headers.get("expires"), "Sun, 11 Oct 2026 00:05:00 GMT");
  assert.equal(hit.headers.get("vary"), "Origin, Accept-Encoding");
  assert.equal(hit.headers.get("x-reysonai-cache"), null);
  assert.equal((await get("*")).status, 304);
  assert.equal((await get('"other"')).status, 200);
  assert.equal((await get('"old", junk')).status, 200);
  assert.equal(queries.length, 2, "warm conditional and nonmatching requests do not query D1");
});

test("quoted commas in If-None-Match tags are not list separators", async (): Promise<any> => {
  const env: any = { DB: mockDb([{ name: "opening-ranges", content_hash: "old,part", bytes: 2, parts: 1 }], [{ name: "opening-ranges", part: 0, body: "{}" }]) };
  const get = (condition?: any): any => worker.fetch(new Request("https://edge.test/v1/preflop/datasets/opening-ranges", { headers: { "if-none-match": condition } }), env);
  assert.equal((await get('"other,tag", W/"old,part"')).status, 304);
  assert.equal((await get('"old", "part"')).status, 200);
});

test("wildcard matches an existing catalog without an ETag", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  const queries: any[] = [];
  const env: any = { DB: mockDb([{ name: "opening-ranges", content_hash: "h", bytes: 2, parts: 1 }], [], (sql?: any): any => queries.push(sql)) };
  const get = (condition?: any): any => worker.fetch(new Request("https://edge.test/v1/preflop/datasets", { headers: { "if-none-match": condition } }), env);
  for (let n = 0; n < 2; n++) {
    const response = await get("*");
    assert.equal(response.status, 304);
    assert.equal(response.headers.get("etag"), null);
    assert.equal(response.headers.get("cache-control"), "public, max-age=60, s-maxage=60");
  }
  assert.equal(queries.length, 1);
  assert.equal(cache.puts.length, 1);
  assert.equal((await get('"h"')).status, 200, "a list only matches an actual response ETag");
  assert.equal(queries.length, 1);
});

test("preflop errors, non-GET requests and unavailable cache never become cached", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  const queries: any[] = [];
  const env: any = { DB: mockDb([{ name: "broken", content_hash: "x", bytes: 1, parts: 2 }], [{ name: "broken", part: 0, body: "{" }], (sql?: any): any => queries.push(sql)) };
  const get = (path?: any): any => worker.fetch(new Request(`https://edge.test${path}`), env);
  for (let n = 0; n < 2; n++) {
    assert.equal((await get("/v1/preflop/datasets/missing")).status, 404);
    assert.equal((await get("/v1/preflop/datasets/broken")).status, 503);
  }
  assert.equal(queries.length, 8);
  assert.equal(cache.puts.length, 0);
  assert.equal((await worker.fetch(new Request("https://edge.test/v1/preflop/datasets", { method: "OPTIONS" }), env)).status, 204);
  assert.equal(cache.matches.length, 4, "preflight never consults the dataset cache");

  cache.fail({ match: true, put: true });
  const catalog = await get("/v1/preflop/datasets");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get("x-reysonai-cache"), "MISS");
  assert.equal((await get("/v1/preflop/datasets")).status, 200);
  assert.equal(queries.length, 10, "cache failures fall through to D1");
  delete (globalThis as any).caches;
  const bypass = await get("/v1/preflop/datasets");
  assert.equal(bypass.headers.get("x-reysonai-cache"), "BYPASS");
});

test("encoded published names and raw Unicode chunk text pass through with public CORS", async (): Promise<any> => {
  const raw = '{ \n  "note": "あいうえお 🌱", "decimal": 1.00 }\t\n';
  const split = raw.indexOf("🌱");
  const rawParts = [raw.slice(0, split), raw.slice(split)];
  const profileName = "profiles/nit/villain/opening-ranges";
  const calls: any[] = [];
  const db = mockDb([
    { name: "reasons/BB_vs_BTN", content_hash: "raw-hash", bytes: new TextEncoder().encode(raw).byteLength, parts: 2 },
    { name: profileName, content_hash: "profile-hash", bytes: 1, parts: 1 },
  ], [
    ...rawParts.map((body?: any, part?: any): any => ({ name: "reasons/BB_vs_BTN", part, body })),
    { name: profileName, part: 0, body: "{}" },
  ], (sql?: any): any => calls.push(sql));
  const response = await worker.fetch(new Request("https://edge.test/v1/preflop/datasets/reasons%2FBB_vs_BTN", {
    headers: { origin: "https://allowed.example" },
  }), { SOLUTIONS: (null as any), DB: db, ALLOWED_ORIGIN: "https://allowed.example" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"raw-hash"');
  assert.equal(await response.text(), raw);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://allowed.example");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.equal((await worker.fetch(new Request(`https://edge.test/v1/preflop/datasets/${profileName}`), { SOLUTIONS: (null as any), DB: db })).status, 200);
  assert.ok(calls.indexOf("SELECT content_hash, parts FROM preflop_datasets WHERE name = ?")
    < calls.indexOf("SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part"));
});

test("publish splits datasets into parts that reassemble exactly", (): any => {
  const sql = buildPreflopSql({ "reasons/BB_vs_BTN": text });
  assert.match(sql, /INSERT INTO preflop_datasets .*'reasons\/BB_vs_BTN', '[0-9a-f]{64}', \d+, 2\);/);
  assert.equal(sql.split("\n").filter((line?: any): any => line.startsWith("INSERT INTO preflop_dataset_parts")).length, 2);
  assert.ok(sql.indexOf("DELETE FROM preflop_dataset_parts;") < sql.indexOf("INSERT"));
});
