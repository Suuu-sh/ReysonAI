import assert from "node:assert/strict";
import test from "node:test";
import { postflopUrl } from "../src/estimated/postflop-api.ts";
import { loadPostflopSpot } from "../src/estimated/postflop-browser.ts";

const base = "https://single-size.example.test";
const fixture = (spot, sizing) => ({ kind: "ai_estimate_not_gto", spot: { id: spot, tree: "oop_checks" },
  candidate: { metadata: { ...(sizing ? { sizing } : {}) }, policy: {} },
  laterCandidate: null, report: { marker: sizing ?? "multi" }, ...(sizing ? { sizing } : {}) });

test("published Single Size URL is explicit; omitted/explicit Multi Size URLs remain identical", () => {
  const params = { spot: "BTN_open_BB_call" };
  const multi = `${base}/v1/postflop/spot?spot=BTN_open_BB_call`;
  assert.equal(postflopUrl("spot", params, `${base}/`), multi);
  assert.equal(postflopUrl("spot", { ...params, sizing: "multi" }, base), multi);
  assert.equal(postflopUrl("spot", { ...params, sizing: "single" }, base), `${multi}&sizing=single`);
  assert.throws(() => postflopUrl("spot", { ...params, sizing: "single", opponentProfile: "nit" }, base), /standard profile only/);
});

test("published single succeeds and shares only its own cache, preserving Multi Size payload/cache", async () => {
  const originalFetch = globalThis.fetch, urls = [], spot = "published-sizing-cache-fixture";
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    assert.ok(options.signal instanceof AbortSignal);
    const sizing = new URL(url).searchParams.get("sizing");
    return { ok: true, status: 200, json: async () => fixture(spot, sizing) };
  };
  try {
    const multi = await loadPostflopSpot(spot, undefined, {}, base);
    assert.equal(await loadPostflopSpot(spot, undefined, { sizing: "multi" }, base), multi);
    assert.equal(Object.hasOwn(multi, "sizing"), false);
    const [single, shared] = await Promise.all([
      loadPostflopSpot(spot, undefined, { sizing: "single" }, base),
      loadPostflopSpot(spot, undefined, { sizing: "single" }, base),
    ]);
    assert.equal(single, shared);
    assert.equal(await loadPostflopSpot(spot, undefined, { sizing: "single" }, base), single);
    assert.equal(single.sizing, "single");
    assert.notEqual(single, multi);
    assert.deepEqual(single, fixture(spot, "single"));
    assert.equal(await loadPostflopSpot(spot, undefined, {}, base), multi);
    assert.deepEqual(urls, [`${base}/v1/postflop/spot?spot=${spot}`, `${base}/v1/postflop/spot?spot=${spot}&sizing=single`]);
  } finally { globalThis.fetch = originalFetch; }
});

test("published single 404 always rejects SINGLE_SIZE_MISSING, never falls back, and retries", async () => {
  const originalFetch = globalThis.fetch, urls = [], spot = "published-single-missing-fixture";
  globalThis.fetch = async url => {
    urls.push(String(url));
    return { ok: false, status: 404, json: async () => { throw new Error("404 body need not be JSON"); } };
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(loadPostflopSpot(spot, undefined, { sizing: "single" }, base), { code: "SINGLE_SIZE_MISSING" });
    }
    assert.deepEqual(urls, Array(2).fill(`${base}/v1/postflop/spot?spot=${spot}&sizing=single`));
  } finally { globalThis.fetch = originalFetch; }
});

test("published single fails closed on wrong sizing/identity/candidate, invalid options never fetch", async () => {
  const originalFetch = globalThis.fetch, spot = "published-single-invalid-fixture";
  let body, calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => body }; };
  try {
    for (const invalid of [fixture(spot), { ...fixture(spot, "single"), spot: { id: "different" } },
      { ...fixture(spot, "single"), candidate: null }, { ...fixture(spot, "single"), report: null }]) {
      body = invalid;
      await assert.rejects(loadPostflopSpot(spot, undefined, { sizing: "single" }, base), /局面または形式/);
    }
    for (const options of [{ sizing: "invalid" }, { sizing: "single", opponentProfile: "nit", opponentSeat: "oop" }]) {
      await assert.rejects(loadPostflopSpot(spot, undefined, options, base));
    }
    assert.equal(calls, 4);
  } finally { globalThis.fetch = originalFetch; }
});
