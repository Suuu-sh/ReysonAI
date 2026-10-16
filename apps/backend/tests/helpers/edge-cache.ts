import assert from "node:assert/strict";

export function installEdgeCache(t?: any): any {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const entries = new Map();
  const matches: any[] = [];
  const puts: any[] = [];
  let now = 0;
  let failMatch = false;
  let failPut = false;
  let browserMaxAge: any = null;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    async match(key?: any): Promise<any> {
      matches.push(key.url);
      if (failMatch) throw new Error("cache match failed");
      const entry = entries.get(key.url);
      if (!entry || entry.expires <= now) return undefined;
      const hit = entry.response.clone();
      if (browserMaxAge !== null) hit.headers.set("cache-control", (hit.headers.get("cache-control") ?? "").replace(/max-age=\d+/, `max-age=${browserMaxAge}`));
      return hit;
    },
    async put(key?: any, response?: any): Promise<any> {
      puts.push(key.url);
      if (failPut) throw new Error("cache put failed");
      assert.equal(response.status, 200);
      const ttl = Number(response.headers.get("cache-control")?.match(/s-maxage=(\d+)/)?.[1]);
      assert.ok(ttl > 0, "cache entries require an explicit edge TTL");
      entries.set(key.url, { response: response.clone(), expires: now + ttl * 1000 });
    },
  } } });
  t.after((): any => { if (original) Object.defineProperty(globalThis, "caches", original); else delete (globalThis as any).caches; });
  return { entries, matches, puts, advance(ms?: any): any { now += ms; }, rewriteBrowserMaxAge(value?: any): any { browserMaxAge = value; }, fail({ match = false, put = false }: any): any { failMatch = match; failPut = put; } };
}
