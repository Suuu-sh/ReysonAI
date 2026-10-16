import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import worker from "../src/index.ts";
import { routePostflop } from "../src/postflop.ts";
import { spotArtifacts } from "../../frontend/scripts/postflop-ai/publish-d1.ts";
import { postflopResponse } from "../../frontend/scripts/postflop-ai/local-view.ts";
import { boards } from "../../frontend/scripts/postflop-ai/inputs.ts";
import { spotById } from "../../frontend/scripts/postflop-ai/spots.ts";
import { installEdgeCache } from "./helpers/edge-cache.ts";

// In-memory D1 answering the worker's queries: WHERE spot_id = ?.
function mockDb(tables?: any, onQuery: any = (): any => {}): any {
  return {
    prepare(sql?: any): any {
      let args: any[] = [];
      const statement = {
        bind(...values: any[]): any { args = values; return statement; },
        async all(): Promise<any> {
          onQuery(sql, args);
          const table = sql.match(/FROM (\w+)/)[1];
          let rows = tables[table] ?? [];
          if (sql.includes("WHERE spot_id")) rows = rows.filter((row?: any): any => row.spot_id === args[0]);
          if (table === "postflop_profile_policies") rows = rows.filter((row?: any): any => row.profile === args[0] && row.spot_id === args[1] && row.opponent_seat === args[2] && row.role === args[3] && row.stage === args[4]);
          if (table === "dataset_versions") rows = rows.filter((row?: any): any => row.name === args[0]);
          if (table === "postflop_flop_base_br") rows = rows.filter((row?: any): any => row.flop_key === args[1]).sort((a?: any, b?: any): any => a.part - b.part);
          return { results: rows };
        },
      };
      return statement;
    },
  };
}

function tablesFor(published?: any): any {
  const tables: Record<string, any[]> = { postflop_spots: [], postflop_policies: [], postflop_reports: [] };
  for (const { spot, candidate, laterCandidate, report } of published) {
    tables.postflop_spots.push({ spot_id: spot.id, spot_json: JSON.stringify(spot) });
    for (const [stage, item] of [["flop", candidate], ["later", laterCandidate]]) {
      if (item) tables.postflop_policies.push({ spot_id: spot.id, stage, policy_hash: item.metadata.policy_hash, policy_json: JSON.stringify(item) });
    }
    tables.postflop_reports.push({ spot_id: spot.id, payload_json: JSON.stringify(report) });
  }
  return tables;
}

test("postflop routes validate the spot and serve no computed views", async (): Promise<any> => {
  const env: any = { SOLUTIONS: null, DB: mockDb({}) };
  const status = async (path?: any): Promise<any> => (await worker.fetch(new Request(`https://edge.test${path}`), env)).status;
  assert.equal(await status("/v1/postflop/spot"), 400);
  assert.equal(await status("/v1/postflop/spot?spot=a'b"), 400);
  assert.equal(await status("/v1/postflop/spot?spot=BTN_open_BB_call"), 404);
  for (const route of ["board", "later", "explain", "later-explain", "later-hand-ev", "hand-ev"]) {
    assert.equal(await status(`/v1/postflop/${route}?spot=BTN_open_BB_call`), 404, route);
  }
});

const spot = spotById("BTN_open_BB_call");
const profileParams: any = (overrides?: any): any => new URLSearchParams({ profile: "nit", spot: spot.id, opponentSeat: "ip", role: "villain", stage: "flop", ...overrides });
const profilePath = (params?: any): any => `/v1/postflop/profile-policy?${params}`;

test("profile policies validate every required selector before reading policies", async (): Promise<any> => {
  const db = mockDb({}, (): any => assert.fail("invalid selectors must not query D1"));
  const env: any = { DB: db };
  const invalid: any[] = [];
  for (const key of ["profile", "spot", "opponentSeat", "role", "stage"]) {
    const missing = profileParams(); missing.delete(key); invalid.push(missing);
    const empty = profileParams({ [key]: "" }); invalid.push(empty);
    const duplicate = profileParams(); duplicate.append(key, duplicate.get(key)); invalid.push(duplicate);
  }
  for (const profile of ["balanced", "Nit", "nit'", "unknown"]) invalid.push(profileParams({ profile }));
  for (const spot of ["a'b", "../secret", "BTN open BB call", "a".repeat(129)]) invalid.push(profileParams({ spot }));
  for (const role of ["hero", "Villain", "exploit'"]) invalid.push(profileParams({ role }));
  for (const stage of ["turn", "river", "Flop", "later'"]) invalid.push(profileParams({ stage }));
  for (const params of invalid) {
    const response = await worker.fetch(new Request(`https://edge.test${profilePath(params)}`), env);
    assert.equal(response.status, 400, params.toString());
    assert.equal(response.headers.get("cache-control"), null);
  }
});

test("profile route returns the exact saved metadata and policy for every profile, role and stage", async (): Promise<any> => {
  const rows: any[] = [];
  for (const profile of ["nit", "station", "lag", "maniac"]) {
    for (const role of ["villain", "exploit"]) for (const stage of ["flop", "later"]) {
      rows.push({ profile, spot_id: spot.id, opponent_seat: "ip", role, stage,
        metadata_json: JSON.stringify({ opponent_seat: "ip", policy_hash: `${profile}-${role}-${stage}`, note: "AI estimate, not GTO" }),
        policy_json: JSON.stringify({ saved: [profile, role, stage], mixes: { check: 0.375, bet: 0.625 } }),
        published_at: "2026-10-08T00:00:00.000Z" });
    }
  }
  // A different spot must not leak through the composite lookup.
  rows.unshift({ ...rows[0], spot_id: "SB_open_BB_call", policy_json: '{"wrong":true}' });
  const env: any = { DB: mockDb({ postflop_profile_policies: rows }), ALLOWED_ORIGIN: "https://app.example.test" };
  for (const row of rows.slice(1)) {
    const params = profileParams({ profile: row.profile, role: row.role, stage: row.stage });
    const response = await worker.fetch(new Request(`https://edge.test${profilePath(params)}`, { headers: { origin: "https://app.example.test" } }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      kind: "ai_estimate_not_gto", profile: row.profile, spot: spot.id, opponentSeat: "ip", role: row.role, stage: row.stage,
      metadata: JSON.parse(row.metadata_json), policy: JSON.parse(row.policy_json), publishedAt: row.published_at,
    });
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.test");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});

test("profile misses stay structured and never fall back to another stored policy", async (): Promise<any> => {
  const queries: any[] = [];
  const env: any = { DB: mockDb({
    postflop_policies: [{ spot_id: spot.id, stage: "flop", policy_json: '{"balanced":true}' }],
    postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, opponent_seat: "ip", role: "villain", stage: "flop", metadata_json: "{}", policy_json: "{}", published_at: "now" }],
  }, (sql?: any, args?: any): any => queries.push({ sql, args })) };
  for (const change of [{ profile: "maniac" }, { opponentSeat: "oop" }, { role: "exploit" }, { stage: "later" }, { spot: "unpublished_spot" }]) {
    const response = await worker.fetch(new Request(`https://edge.test${profilePath(profileParams(change))}`), env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "No stored profile policy", code: "PROFILE_POLICY_MISSING", state: "not_generated" });
    assert.equal(response.headers.get("cache-control"), null);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }
  assert.equal(queries.length, 5);
  assert.ok(queries.every(({ sql }: any): any => sql.includes("FROM postflop_profile_policies WHERE profile = ? AND spot_id = ? AND opponent_seat = ? AND role = ? AND stage = ?")));
});

test("profile JSON payloads pass through as stored text without runtime parsing", async (): Promise<any> => {
  // Invalid JSON is intentional: this unit test proves the handler never parses a policy.
  const metadata = "opaque metadata: not parsed";
  const policy = "opaque policy: not parsed";
  const db = mockDb({ postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, opponent_seat: "ip", role: "villain", stage: "flop",
    metadata_json: metadata, policy_json: policy, published_at: 'timestamp"with\\escapes' }] });
  const response = await routePostflop(db, "/v1/postflop/profile-policy", profileParams());
  assert.equal(response.status, 200);
  assert.equal(response.text, `{"kind":"ai_estimate_not_gto","profile":"nit","spot":"${spot.id}","opponentSeat":"ip","role":"villain","stage":"flop","metadata":${metadata},"policy":${policy},"publishedAt":${JSON.stringify('timestamp"with\\escapes')}}`);
});

test("only profile-policy uses the profile dataset version and caches successful rows", async (t?: any): Promise<any> => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const entries = new Map();
  const matched: any[] = [];
  const puts: any[] = [];
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    async match(key?: any): Promise<any> { matched.push(key.url); return entries.get(key.url)?.clone(); },
    async put(key?: any, response?: any): Promise<any> { puts.push(key.url); entries.set(key.url, response.clone()); },
  } } });
  t.after((): any => { if (original) Object.defineProperty(globalThis, "caches", original); else delete (globalThis as any).caches; });
  const queries: any[] = [];
  const db = mockDb({ dataset_versions: [
    { name: "postflop-profiles", content_hash: "profiles-hash" },
    { name: "postflop", content_hash: "balanced-hash" },
    { name: "flop-base", content_hash: "flop-hash" },
  ], postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, opponent_seat: "ip", role: "villain", stage: "flop", metadata_json: "{}", policy_json: "{}", published_at: "now" }]
  }, (sql?: any, args?: any): any => queries.push({ sql, args }));
  const env: any = { DB: db, ALLOWED_ORIGIN: "https://one.test,https://two.test" };
  const get = (path?: any, origin?: any): any => worker.fetch(new Request(`https://edge.test${path}`, { headers: { origin } }), env);
  const path = profilePath(profileParams());
  assert.equal((await get(path, "https://one.test")).status, 200);
  const cached = await get(path, "https://two.test");
  assert.equal(cached.status, 200);
  assert.equal(cached.headers.get("access-control-allow-origin"), "https://two.test", "CORS is applied after cache lookup");
  assert.equal(queries.filter(({ sql }: any): any => sql.includes("FROM postflop_profile_policies")).length, 1);
  assert.equal((await get(profilePath(profileParams({ stage: "later" })), "https://one.test")).status, 404);
  assert.equal((await get(profilePath(profileParams({ profile: "invalid" })), "https://one.test")).status, 400);
  assert.equal(puts.length, 2, "profile version metadata and its successful policy are cached");
  assert.ok(puts.some((key?: any): any => key.includes("dataset=profiles-hash")));
  assert.equal((await get("/v1/postflop/spots", "https://one.test")).status, 200);
  assert.equal((await get(`/v1/postflop/flop?spot=${spot.id}&flop=Ac7d2h`, "https://one.test")).status, 404);
  assert.equal(puts.length, 5, "three version metadata rows and two successful responses are cached");
  assert.equal(puts.filter((key?: any): any => key.includes("/__reysonai_cache/v1/postflop-dataset-version/")).length, 3);
  assert.ok(matched.some((key?: any): any => key.includes("/v1/postflop/spots?") && key.includes("dataset=balanced-hash")));
  assert.ok(matched.some((key?: any): any => key.includes("/v1/postflop/flop?") && key.includes("dataset=flop-hash&enc=id")));
  assert.deepEqual(queries.filter(({ sql }: any): any => sql.includes("FROM dataset_versions")).map(({ args }: any): any => args[0]), ["postflop-profiles", "postflop", "flop-base"]);
});

test("postflop version metadata expires after 60s and a republish changes the body cache key", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  cache.rewriteBrowserMaxAge(14_400);
  const queries: any[] = [];
  const tables = {
    dataset_versions: [{ name: "postflop", content_hash: "old-version" }],
    postflop_policies: [{ spot_id: spot.id, stage: "flop", policy_hash: "old-policy" }],
  };
  const env: any = { DB: mockDb(tables, (sql?: any, args?: any): any => queries.push({ sql, args })) };
  const get = (origin: any = "https://edge.test", suffix: any = ""): any => worker.fetch(new Request(`${origin}/v1/postflop/spots${suffix}`), env);
  const first = await get();
  assert.equal(first.headers.get("x-reysonai-cache"), "MISS");
  assert.equal((await first.json()).spots[spot.id].flop, "old-policy");
  const hit = await get("https://edge.test", "?dataset=forged&enc=br");
  assert.equal(hit.headers.get("x-reysonai-cache"), "HIT", "client query cannot override internal cache selectors");
  assert.equal(hit.headers.get("cache-control"), "public, max-age=300, s-maxage=86400", "zone browser TTL must not leak from Cache API hit");
  assert.equal(queries.length, 2);
  assert.ok(cache.puts.some((key?: any): any => key.includes("/__reysonai_cache/v1/postflop-dataset-version/postflop")));
  assert.equal((await get("https://other.test")).headers.get("x-reysonai-cache"), "MISS", "cache keys are scoped to the request origin");
  assert.equal(queries.length, 4);

  tables.dataset_versions[0].content_hash = "new-version";
  tables.postflop_policies[0].policy_hash = "new-policy";
  assert.equal((await (await get()).json()).spots[spot.id].flop, "old-policy", "metadata remains fresh before expiry");
  cache.advance(60_000);
  const republished = await get();
  assert.equal(republished.headers.get("x-reysonai-cache"), "MISS");
  assert.equal((await republished.json()).spots[spot.id].flop, "new-policy");
  assert.equal((await get()).headers.get("x-reysonai-cache"), "HIT");
  assert.deepEqual(queries.filter(({ sql }: any): any => sql.includes("FROM dataset_versions")).map(({ args }: any): any => args[0]), ["postflop", "postflop", "postflop"]);
  assert.equal(queries.filter(({ sql }: any): any => sql.includes("FROM postflop_policies")).length, 3);
  assert.ok(cache.puts.some((key?: any): any => key.includes("dataset=new-version")));
});

test("postflop cache failures and absence fall through to D1", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  const queries: any[] = [];
  const env: any = { DB: mockDb({ dataset_versions: [{ name: "postflop", content_hash: "h" }], postflop_policies: [] }, (sql?: any): any => queries.push(sql)) };
  const get = (): any => worker.fetch(new Request("https://edge.test/v1/postflop/spots"), env);
  cache.fail({ match: true, put: true });
  for (let i = 0; i < 2; i++) {
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-reysonai-cache"), "MISS");
  }
  assert.equal(queries.length, 4);
  delete (globalThis as any).caches;
  const bypass = await get();
  assert.equal(bypass.status, 200);
  assert.equal(bypass.headers.get("x-reysonai-cache"), "BYPASS");
  assert.equal(queries.length, 5, "no cache API means no version lookup and one body query");
});

test("Brotli and identity flop cache variants stay separate, including conditional hits", async (t?: any): Promise<any> => {
  const cache = installEdgeCache(t);
  cache.rewriteBrowserMaxAge(14_400);
  const queries: any[] = [];
  const packed = brotliCompressSync("{\"saved\":true}");
  const env: any = { DB: mockDb({
    dataset_versions: [{ name: "flop-base", content_hash: "flop-version" }],
    postflop_flop_base_br: [{ spot_id: spot.id, flop_key: "Ac7d2h", part: 0, parts: 1, content_hash: "flop-body", body: [...packed] }],
  }, (sql?: any): any => queries.push(sql)) };
  const get = (headers?: any): any => worker.fetch(new Request(`https://edge.test/v1/postflop/flop?spot=${spot.id}&flop=Ac7d2h`, { headers }), env);
  const br = await get({ "accept-encoding": "br" });
  assert.equal(br.headers.get("x-reysonai-cache"), "MISS");
  assert.equal(br.headers.get("content-encoding"), "br");
  assert.equal(brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString(), '{"saved":true}');
  const conditional = await get({ "accept-encoding": "br", "if-none-match": '"flop-body"' });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
  assert.equal(conditional.headers.get("vary"), "Origin, accept-encoding");
  assert.equal(conditional.headers.get("content-encoding"), null);
  assert.equal(conditional.headers.get("content-length"), null);
  assert.equal(await conditional.text(), "");
  assert.equal(queries.filter((sql?: any): any => sql.includes("FROM postflop_flop_base_br")).length, 1);
  const brHit = await get({ "accept-encoding": "br" });
  assert.equal(brHit.headers.get("x-reysonai-cache"), "HIT");
  assert.equal(brHit.headers.get("content-encoding"), "br");
  assert.equal(brHit.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
  const plain = await get({});
  if (plain.status === 200) {
    assert.equal(plain.headers.get("x-reysonai-cache"), "MISS");
    assert.equal(plain.headers.get("content-encoding"), null);
    assert.equal(await plain.text(), '{"saved":true}');
    const plainHit = await get({});
    assert.equal(plainHit.headers.get("x-reysonai-cache"), "HIT");
    assert.equal(await plainHit.text(), '{"saved":true}');
    assert.ok(cache.puts.some((key?: any): any => key.includes("enc=br")));
    assert.ok(cache.puts.some((key?: any): any => key.includes("enc=id")));
  } else assert.equal(plain.status, 406);
  assert.equal(queries.filter((sql?: any): any => sql.includes("FROM dataset_versions")).length, 1);
});

const local = existsSync(new URL(`../../frontend/.local/postflop-ai/${spot.slug}-policy.json`, import.meta.url));
test("worker preserves local artifacts while historical preview status stays local", { skip: !local && "no local postflop artifacts" }, async (): Promise<any> => {
  const preview = postflopResponse("/local-postflop-spot", new URLSearchParams({ spot: spot.id }));
  assert.equal(preview.status, 200);
  const { report_status, ...artifacts } = preview.body;
  const publication = spotArtifacts(spot);
  if (report_status === "preserved-historical") {
    assert.match(publication.skip, /report missing, stale or incomplete/,
      "Historical read-only data must not acquire publication approval");
  } else {
    assert.equal(report_status, "current");
    assert.ok(!publication.skip, publication.skip);
  }
  const env: any = { SOLUTIONS: null, DB: mockDb(tablesFor([artifacts])) };
  const get = async (path?: any): Promise<any> => worker.fetch(new Request(`https://edge.test${path}`), env);
  assert.equal((await (await get("/v1/postflop/spots")).json()).spots[spot.id].flop, artifacts.candidate.metadata.policy_hash);

  const response = await get(`/v1/postflop/spot?spot=${spot.id}`);
  assert.equal(response.status, 200);
  // The edge serves existing D1 artifacts unchanged. The local preview's
  // freshness annotation is not a rewrite of the stored report or API schema.
  assert.deepEqual(await response.json(), artifacts);
});


test("flop base route validates keys and returns joined stored Brotli bytes without parsing", async (): Promise<any> => {
  // Deliberately invalid JSON proves no payload parse happens on this route.
  const payload = "opaque stored JSON text: not parsed";
  const packed = brotliCompressSync(payload);
  const cut = 5; // D1 returns BLOBs as arrays of byte values
  const rows = [
    { spot_id: spot.id, flop_key: "Ac7d2h", part: 1, parts: 2, content_hash: "fresh", body: [...packed.subarray(cut)] },
    { spot_id: spot.id, flop_key: "Ac7d2h", part: 0, parts: 2, content_hash: "fresh", body: [...packed.subarray(0, cut)] },
    { spot_id: spot.id, flop_key: "KcKd4h", part: 0, parts: 2, content_hash: "fresh", body: [1] },
  ];
  const env: any = { DB: mockDb({ postflop_flop_base_br: rows }) };
  const get = (key?: any, headers: any = { "accept-encoding": "gzip, br" }): any => worker.fetch(new Request(`https://edge.test/v1/postflop/flop?spot=${spot.id}&flop=${key}`, { headers }), env);
  assert.equal((await get("As7d2c")).status, 400, "actual suits are not a canonical API key");
  assert.equal((await get("AcAc2h")).status, 400);
  assert.equal((await get("Ac7d2h%27")).status, 400);
  assert.equal((await get("AcKc4c")).status, 404);
  assert.equal((await get("KcKd4h")).status, 409);
  const response = await get("Ac7d2h");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-encoding"), "br");
  assert.equal(brotliDecompressSync(Buffer.from(await response.arrayBuffer())).toString(), payload);
  assert.match(response.headers.get("cache-control"), /s-maxage/);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("etag"), '"fresh"');
  // Without br the body is decompressed when the runtime can, otherwise 406.
  const plain = await get("Ac7d2h", {});
  if (plain.status === 200) { assert.equal(plain.headers.get("content-encoding"), null); assert.equal(await plain.text(), payload); }
  else assert.equal(plain.status, 406);
});

test("three actual generated flop bases are byte-identical to the local middleware", async (): Promise<any> => {
  const { flopBaseResponse, flopBaseBytesParts } = await import("../../frontend/scripts/postflop-ai/flop-base-d1.ts");
  const keys = ["Ac7d2h", "KcKd4h", "AcKc4c"];
  const rows: any[] = [];
  for (const flop of keys) {
    const response = flopBaseResponse(new URLSearchParams({ spot: spot.id, flop }));
    if (response.status !== 200) continue; // CI without local artifacts still exercises synthetic rows above.
    const parts = flopBaseBytesParts(response.bytes);
    parts.forEach((body?: any, part?: any): any => rows.push({ spot_id: spot.id, flop_key: flop, part, parts: parts.length, content_hash: "h", body: [...body] }));
  }
  const env: any = { DB: mockDb({ postflop_flop_base_br: rows }) };
  for (const flop of keys) {
    if (!rows.some((row?: any): any => row.flop_key === flop)) continue;
    const response = await worker.fetch(new Request(`https://edge.test/v1/postflop/flop?spot=${spot.id}&flop=${flop}`, { headers: { "accept-encoding": "br" } }), env);
    assert.equal(response.status, 200);
    const expected: any = flopBaseResponse(new URLSearchParams({ spot: spot.id, flop }));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(expected.bytes));
    assert.equal(brotliDecompressSync(expected.bytes).toString(), expected.text);
  }
});
