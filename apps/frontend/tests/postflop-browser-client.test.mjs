import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPostflopSpot } from "../src/estimated/postflop-browser.ts";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("PostflopTrial computes views locally and only requests spot artifacts; flop EV stays read-only", async () => {
  const [trial, browserClient, handEv, api] = await Promise.all([
    source("../src/estimated/PostflopTrial.tsx"),
    source("../src/estimated/postflop-browser.ts"),
    source("../src/estimated/PostflopHandEv.tsx"),
    source("../src/estimated/postflop-api.ts"),
  ]);
  const routeBlock = api.match(/const LOCAL_PATHS = \{([\s\S]*?)\} as const/)?.[1] ?? "";
  const routes = [...routeBlock.matchAll(/^\s*(?:"([^"]+)"|([\w-]+)):/gm)].map(match => match[1] ?? match[2]).sort();

  assert.deepEqual(routes, ["hand-ev", "spot"]);
  assert.doesNotMatch(trial, /\bfetch\s*\(|postflopUrl\s*\(/);
  assert.match(browserClient, /fetch\(postflopUrl\("spot"/);
  assert.doesNotMatch(browserClient, /postflopUrl\("(?:board|explain|later|later-explain|later-hand-ev)"/);
  assert.match(handEv, /postflopUrl\("hand-ev"/);
  assert.match(handEv, /fetch\(url/);
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
