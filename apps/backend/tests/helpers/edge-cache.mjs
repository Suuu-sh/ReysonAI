import assert from "node:assert/strict";

export function installEdgeCache(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const entries = new Map();
  const matches = [];
  const puts = [];
  let now = 0;
  let failMatch = false;
  let failPut = false;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    async match(key) {
      matches.push(key.url);
      if (failMatch) throw new Error("cache match failed");
      const entry = entries.get(key.url);
      return entry && entry.expires > now ? entry.response.clone() : undefined;
    },
    async put(key, response) {
      puts.push(key.url);
      if (failPut) throw new Error("cache put failed");
      assert.equal(response.status, 200);
      const ttl = Number(response.headers.get("cache-control")?.match(/s-maxage=(\d+)/)?.[1]);
      assert.ok(ttl > 0, "cache entries require an explicit edge TTL");
      entries.set(key.url, { response: response.clone(), expires: now + ttl * 1000 });
    },
  } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "caches", original); else delete globalThis.caches; });
  return { entries, matches, puts, advance(ms) { now += ms; }, fail({ match = false, put = false }) { failMatch = match; failPut = put; } };
}
