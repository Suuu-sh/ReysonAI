import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPostflopSpot, loadPostflopFlop } from "../src/estimated/postflop-browser.ts";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("PostflopTrial requests only read-only spot/base artifacts; missing bases compute locally", async () => {
  const [trial, browserClient, handEv, api] = await Promise.all([
    source("../src/estimated/PostflopTrial.tsx"),
    source("../src/estimated/postflop-browser.ts"),
    source("../src/estimated/PostflopHandEv.tsx"),
    source("../src/estimated/postflop-api.ts"),
  ]);
  const routeBlock = api.match(/const LOCAL_PATHS = \{([\s\S]*?)\} as const/)?.[1] ?? "";
  const routes = [...routeBlock.matchAll(/^\s*(?:"([^"]+)"|([\w-]+)):/gm)].map(match => match[1] ?? match[2]).sort();

  assert.deepEqual(routes, ["flop", "hand-ev", "spot"]);
  assert.doesNotMatch(trial, /\bfetch\s*\(|postflopUrl\s*\(/);
  assert.match(browserClient, /fetch\(postflopUrl\("spot"/);
  assert.match(browserClient, /fetch\(postflopUrl\("flop"/);
  assert.doesNotMatch(browserClient, /postflopUrl\("(?:board|explain|later|later-explain|later-hand-ev)"/);
  assert.match(handEv, /postflopUrl\("hand-ev"/);
  assert.match(handEv, /fetch\(url/);
});

test("suit-isomorphic requests share the canonical base; cancelling one caller does not cancel another", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0, finish;
  const spotId = `flop-cache-test-${Date.now()}`;
  globalThis.fetch = (url, options) => {
    calls++;
    assert.match(String(url), /flop=Ac7d2h/);
    assert.equal(options?.signal, undefined);
    return new Promise(resolve => { finish = () => resolve({ ok: true,
      async json() { return { spot: spotId, flop: "Ac7d2h" }; } }); });
  };
  try {
    const controller = new AbortController();
    const cancelled = loadPostflopFlop(spotId, "As7d2c", controller.signal);
    const kept = loadPostflopFlop(spotId, "Ac7s2h");
    controller.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    finish();
    assert.equal((await kept).flop, "Ac7d2h");
    assert.equal(await loadPostflopFlop(spotId, "As7d2c"), await kept);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("missing optional bases fall back and are retried rather than cached", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false }; };
  try {
    const spot = `missing-flop-base-${Date.now()}`;
    assert.equal(await loadPostflopFlop(spot, "AcKc4c"), null);
    assert.equal(await loadPostflopFlop(spot, "AcKc4c"), null);
    assert.equal(calls, 2);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadPostflopFlop(spot, "AcKc4c", controller.signal), { name: "AbortError" });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("a spot artifact request is shared and cached per spot id", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const spotId = `postflop-cache-test-${Date.now()}`;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(String(url), /^\/local-postflop-spot\?spot=/);
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, async json() {
      return { kind: "ai_estimate_not_gto", spot: { id: spotId, tree: "oop_checks" },
        candidate: { metadata: {}, policy: {} }, laterCandidate: null, report: {} };
    } };
  };
  try {
    const controller = new AbortController();
    const [first, second] = await Promise.all([loadPostflopSpot(spotId, controller.signal), loadPostflopSpot(spotId, controller.signal)]);
    const third = await loadPostflopSpot(spotId, controller.signal);
    assert.equal(calls, 1);
    assert.equal(first, second);
    assert.equal(second, third);
    assert.equal(first.spot.id, spotId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
