import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/index.ts";
import { referencePolicyFor } from "../../frontend/scripts/postflop-ai/policy.mjs";
import { referenceLaterPolicy } from "../../frontend/scripts/postflop-ai/later-policy.mjs";

const URL_BASE = "https://edge.test/v1/postflop/runtime-config";
const HASH = "26beae01badcf7010c43376b0b394e06868361813f88817cee7c5bfa7611ef0b";
const ETAG = `"${HASH}"`;
const CACHE = "public, max-age=300, s-maxage=3600, must-revalidate";
const NO_ENV = new Proxy({}, { get(_target, key) { throw new Error(`Unexpected env access: ${String(key)}`); } });
const request = (query = "?version=1", init) => worker.fetch(new Request(URL_BASE + query, init), NO_ENV);
const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const expected = () => ({
  schemaVersion: 1,
  kind: "ai_estimate_not_gto",
  modelVersion: "reysonai-postflop-runtime-v1",
  configs: {
    game: readJson("../../../configs/cash-6max-100bb.json"),
    stage2: readJson("../../../configs/multiway-preflop-stage2.json"),
    pilot: readJson("../../frontend/scripts/data/postflop-ai-pilot.json"),
  },
  references: {
    flop: { oop_checks: referencePolicyFor("oop_checks"), oop_leads: referencePolicyFor("oop_leads") },
    later: referenceLaterPolicy(),
  },
});

test("v1 publishes only the exact existing Web-public inputs, pinned by bytes and SHA256", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(Buffer.byteLength(body, "utf8"), 30221);
  assert.equal(createHash("sha256").update(body).digest("hex"), HASH);
  assert.equal(body, JSON.stringify(expected()));
  const parsed = JSON.parse(body);
  assert.deepEqual(Object.keys(parsed), ["schemaVersion", "kind", "modelVersion", "configs", "references"]);
  assert.deepEqual(Object.keys(parsed.configs), ["game", "stage2", "pilot"]);
  assert.deepEqual(Object.keys(parsed.references), ["flop", "later"]);
  assert.deepEqual(Object.keys(parsed.references.flop), ["oop_checks", "oop_leads"]);
  assert.equal(response.headers.get("etag"), ETAG);
  assert.equal(response.headers.get("cache-control"), CACHE);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-expose-headers"), "ETag");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("conditional GET supports strong, weak, list and wildcard validators with the same cache metadata", async () => {
  for (const value of [ETAG, `W/${ETAG}`, `"older", W/${ETAG}`, "*"]) {
    const response = await request("?version=1", { headers: { "if-none-match": value } });
    assert.equal(response.status, 304, value);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("etag"), ETAG);
    assert.equal(response.headers.get("cache-control"), CACHE);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }
  for (const value of ["", "older", HASH, '"wrong"']) {
    const response = await request("?version=1", { headers: { "if-none-match": value } });
    assert.equal(response.status, 200, value);
    assert.equal(createHash("sha256").update(await response.text()).digest("hex"), HASH);
  }
});

test("versions and extra or duplicate query selectors are rejected before conditional handling", async () => {
  for (const query of ["", "?version=", "?version=0", "?version=2", "?version=01", "?version=1.0",
    "?version=1&version=1", "?version=2&version=1", "?version=1&file=../../account.ts",
    "?version=1&spot=BTN_open_BB_call", "?version=1&user=someone", "?version=1&token=secret"]) {
    const response = await request(query, { headers: { "if-none-match": ETAG } });
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: "unsupported_runtime_config_version" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("etag"), null);
  }
});

test("every supported non-GET method is rejected without consuming a request body", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const input = new Request(URL_BASE + "?version=1", { method, ...(method === "HEAD" ? {} : { body: "unparsed private input" }) });
    const response = await worker.fetch(input, NO_ENV);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("etag"), null);
    assert.equal(input.bodyUsed, false);
  }
});

test("requests never read bindings, dataset caches, remote data or per-user state", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, get() { throw new Error("Unexpected cache access"); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "caches", original); else delete globalThis.caches; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network fetch"); });
  const responses = await Promise.all([
    request("?version=1", { headers: { authorization: "Bearer ignored", cookie: "session=ignored", origin: "https://untrusted.test" } }),
    request(), request("?version=1", { headers: { "accept-encoding": "br", "accept-language": "ja" } }),
  ]);
  const bodies = await Promise.all(responses.map(async response => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    return response.text();
  }));
  assert.ok(bodies.every(body => body === JSON.stringify(expected())));
  assert.equal((await request("?version=1&path=anything")).status, 400);
  assert.equal((await request("?version=1", { method: "POST" })).status, 405);
});

test("digest failure or changed source bytes fail closed without leaking errors or accessing env", async t => {
  const mock = t.mock.method(crypto.subtle, "digest", async () => new Uint8Array(32).buffer);
  for (const implementation of [async () => new Uint8Array(32).buffer, async () => { throw new Error("private detail"); }]) {
    mock.mock.mockImplementation(implementation);
    const response = await request("?version=1", { headers: { "if-none-match": "*" } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "runtime_config_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("etag"), null);
  }
});

test("existing routes retain their configured CORS and D1 requirements", async () => {
  const env = { ALLOWED_ORIGIN: "https://app.example.test" };
  const headers = { origin: "https://app.example.test" };
  const health = await worker.fetch(new Request("https://edge.test/health", { headers }), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", service: "reysonai-api" });
  assert.equal(health.headers.get("access-control-allow-origin"), headers.origin);
  const preflight = await worker.fetch(new Request("https://edge.test/health", { method: "OPTIONS", headers }), env);
  assert.equal(preflight.status, 204);
  const missing = await worker.fetch(new Request("https://edge.test/v1/postflop/spots"), env);
  assert.equal(missing.status, 500);
  assert.deepEqual(await missing.json(), { error: "DB binding is not configured" });
  const nested = await worker.fetch(new Request(URL_BASE + "/file?version=1"), env);
  assert.notEqual(nested.status, 200);
});
