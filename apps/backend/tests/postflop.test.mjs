import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import worker from "../src/index.ts";
import { routePostflop } from "../src/postflop.ts";
import { spotArtifacts } from "../../frontend/scripts/postflop-ai/publish-d1.mjs";
import { postflopResponse } from "../../frontend/scripts/postflop-ai/local-view.mjs";
import { boards } from "../../frontend/scripts/postflop-ai/inputs.mjs";
import { spotById } from "../../frontend/scripts/postflop-ai/spots.ts";

// In-memory D1 answering the worker's queries: WHERE spot_id = ?.
function mockDb(tables, onQuery = () => {}) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async all() {
          onQuery(sql, args);
          const table = sql.match(/FROM (\w+)/)[1];
          let rows = tables[table] ?? [];
          if (sql.includes("WHERE spot_id")) rows = rows.filter(row => row.spot_id === args[0]);
          if (table === "postflop_profile_policies") rows = rows.filter(row => row.profile === args[0] && row.spot_id === args[1] && row.role === args[2] && row.stage === args[3]);
          if (table === "dataset_versions") rows = rows.filter(row => row.name === args[0]);
          if (table === "postflop_flop_base_br") rows = rows.filter(row => row.flop_key === args[1]).sort((a, b) => a.part - b.part);
          return { results: rows };
        },
      };
      return statement;
    },
  };
}

function tablesFor(published) {
  const tables = { postflop_spots: [], postflop_policies: [], postflop_reports: [] };
  for (const { spot, candidate, laterCandidate, report } of published) {
    tables.postflop_spots.push({ spot_id: spot.id, spot_json: JSON.stringify(spot) });
    for (const [stage, item] of [["flop", candidate], ["later", laterCandidate]]) {
      if (item) tables.postflop_policies.push({ spot_id: spot.id, stage, policy_hash: item.metadata.policy_hash, policy_json: JSON.stringify(item) });
    }
    tables.postflop_reports.push({ spot_id: spot.id, payload_json: JSON.stringify(report) });
  }
  return tables;
}

test("postflop routes validate the spot and serve no computed views", async () => {
  const env = { SOLUTIONS: null, DB: mockDb({}) };
  const status = async path => (await worker.fetch(new Request(`https://edge.test${path}`), env)).status;
  assert.equal(await status("/v1/postflop/spot"), 400);
  assert.equal(await status("/v1/postflop/spot?spot=a'b"), 400);
  assert.equal(await status("/v1/postflop/spot?spot=BTN_open_BB_call"), 404);
  for (const route of ["board", "later", "explain", "later-explain", "later-hand-ev", "hand-ev"]) {
    assert.equal(await status(`/v1/postflop/${route}?spot=BTN_open_BB_call`), 404, route);
  }
});

const spot = spotById("BTN_open_BB_call");
const profileParams = overrides => new URLSearchParams({ profile: "nit", spot: spot.id, role: "villain", stage: "flop", ...overrides });
const profilePath = params => `/v1/postflop/profile-policy?${params}`;

test("profile policies validate every required selector before reading policies", async () => {
  const db = mockDb({}, () => assert.fail("invalid selectors must not query D1"));
  const env = { DB: db };
  const invalid = [];
  for (const key of ["profile", "spot", "role", "stage"]) {
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

test("profile route returns the exact saved metadata and policy for every profile, role and stage", async () => {
  const rows = [];
  for (const profile of ["nit", "station", "lag", "maniac"]) {
    for (const role of ["villain", "exploit"]) for (const stage of ["flop", "later"]) {
      rows.push({ profile, spot_id: spot.id, role, stage,
        metadata_json: JSON.stringify({ policy_hash: `${profile}-${role}-${stage}`, note: "AI estimate, not GTO" }),
        policy_json: JSON.stringify({ saved: [profile, role, stage], mixes: { check: 0.375, bet: 0.625 } }),
        published_at: "2026-10-08T00:00:00.000Z" });
    }
  }
  // A different spot must not leak through the composite lookup.
  rows.unshift({ ...rows[0], spot_id: "SB_open_BB_call", policy_json: '{"wrong":true}' });
  const env = { DB: mockDb({ postflop_profile_policies: rows }), ALLOWED_ORIGIN: "https://app.example.test" };
  for (const row of rows.slice(1)) {
    const params = profileParams({ profile: row.profile, role: row.role, stage: row.stage });
    const response = await worker.fetch(new Request(`https://edge.test${profilePath(params)}`, { headers: { origin: "https://app.example.test" } }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      kind: "ai_estimate_not_gto", profile: row.profile, spot: spot.id, role: row.role, stage: row.stage,
      metadata: JSON.parse(row.metadata_json), policy: JSON.parse(row.policy_json), publishedAt: row.published_at,
    });
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.test");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});

test("profile misses stay structured and never fall back to another stored policy", async () => {
  const queries = [];
  const env = { DB: mockDb({
    postflop_policies: [{ spot_id: spot.id, stage: "flop", policy_json: '{"balanced":true}' }],
    postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, role: "villain", stage: "flop", metadata_json: "{}", policy_json: "{}", published_at: "now" }],
  }, (sql, args) => queries.push({ sql, args })) };
  for (const change of [{ profile: "maniac" }, { role: "exploit" }, { stage: "later" }, { spot: "unpublished_spot" }]) {
    const response = await worker.fetch(new Request(`https://edge.test${profilePath(profileParams(change))}`), env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "No stored profile policy", code: "PROFILE_POLICY_MISSING", state: "not_generated" });
    assert.equal(response.headers.get("cache-control"), null);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }
  assert.equal(queries.length, 4);
  assert.ok(queries.every(({ sql }) => sql.includes("FROM postflop_profile_policies WHERE profile = ? AND spot_id = ? AND role = ? AND stage = ?")));
});

test("profile JSON payloads pass through as stored text without runtime parsing", async () => {
  // Invalid JSON is intentional: this unit test proves the handler never parses a policy.
  const metadata = "opaque metadata: not parsed";
  const policy = "opaque policy: not parsed";
  const db = mockDb({ postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, role: "villain", stage: "flop",
    metadata_json: metadata, policy_json: policy, published_at: 'timestamp"with\\escapes' }] });
  const response = await routePostflop(db, "/v1/postflop/profile-policy", profileParams());
  assert.equal(response.status, 200);
  assert.equal(response.text, `{"kind":"ai_estimate_not_gto","profile":"nit","spot":"${spot.id}","role":"villain","stage":"flop","metadata":${metadata},"policy":${policy},"publishedAt":${JSON.stringify('timestamp"with\\escapes')}}`);
});

test("only profile-policy uses the profile dataset version and caches successful rows", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const entries = new Map();
  const matched = [];
  const puts = [];
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    async match(key) { matched.push(key.url); return entries.get(key.url)?.clone(); },
    async put(key, response) { puts.push(key.url); entries.set(key.url, response.clone()); },
  } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "caches", original); else delete globalThis.caches; });
  const queries = [];
  const db = mockDb({ dataset_versions: [
    { name: "postflop-profiles", content_hash: "profiles-hash" },
    { name: "postflop", content_hash: "balanced-hash" },
    { name: "flop-base", content_hash: "flop-hash" },
  ], postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, role: "villain", stage: "flop", metadata_json: "{}", policy_json: "{}", published_at: "now" }]
  }, (sql, args) => queries.push({ sql, args }));
  const env = { DB: db, ALLOWED_ORIGIN: "https://one.test,https://two.test" };
  const get = (path, origin) => worker.fetch(new Request(`https://edge.test${path}`, { headers: { origin } }), env);
  const path = profilePath(profileParams());
  assert.equal((await get(path, "https://one.test")).status, 200);
  const cached = await get(path, "https://two.test");
  assert.equal(cached.status, 200);
  assert.equal(cached.headers.get("access-control-allow-origin"), "https://two.test", "CORS is applied after cache lookup");
  assert.equal(queries.filter(({ sql }) => sql.includes("FROM postflop_profile_policies")).length, 1);
  assert.equal((await get(profilePath(profileParams({ stage: "later" })), "https://one.test")).status, 404);
  assert.equal((await get(profilePath(profileParams({ profile: "invalid" })), "https://one.test")).status, 400);
  assert.equal(puts.length, 1, "misses and invalid requests are not cached");
  assert.ok(puts[0].includes("dataset=profiles-hash"));
  assert.equal((await get("/v1/postflop/spots", "https://one.test")).status, 200);
  assert.equal((await get(`/v1/postflop/flop?spot=${spot.id}&flop=Ac7d2h`, "https://one.test")).status, 404);
  assert.ok(matched.some(key => key.includes("/v1/postflop/spots?") && key.includes("dataset=balanced-hash")));
  assert.ok(matched.some(key => key.includes("/v1/postflop/flop?") && key.includes("dataset=flop-hash&enc=id")));
  assert.deepEqual(queries.filter(({ sql }) => sql.includes("FROM dataset_versions")).map(({ args }) => args[0]), ["postflop-profiles", "postflop", "flop-base"]);
});

const local = existsSync(new URL(`../../frontend/.local/postflop-ai/${spot.slug}-policy.json`, import.meta.url));
test("worker preserves local artifacts while historical preview status stays local", { skip: !local && "no local postflop artifacts" }, async () => {
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
  const env = { SOLUTIONS: null, DB: mockDb(tablesFor([artifacts])) };
  const get = async path => worker.fetch(new Request(`https://edge.test${path}`), env);
  assert.equal((await (await get("/v1/postflop/spots")).json()).spots[spot.id].flop, artifacts.candidate.metadata.policy_hash);

  const response = await get(`/v1/postflop/spot?spot=${spot.id}`);
  assert.equal(response.status, 200);
  // The edge serves existing D1 artifacts unchanged. The local preview's
  // freshness annotation is not a rewrite of the stored report or API schema.
  assert.deepEqual(await response.json(), artifacts);
});


test("flop base route validates keys and returns joined stored Brotli bytes without parsing", async () => {
  // Deliberately invalid JSON proves no payload parse happens on this route.
  const payload = "opaque stored JSON text: not parsed";
  const packed = brotliCompressSync(payload);
  const cut = 5; // D1 returns BLOBs as arrays of byte values
  const rows = [
    { spot_id: spot.id, flop_key: "Ac7d2h", part: 1, parts: 2, content_hash: "fresh", body: [...packed.subarray(cut)] },
    { spot_id: spot.id, flop_key: "Ac7d2h", part: 0, parts: 2, content_hash: "fresh", body: [...packed.subarray(0, cut)] },
    { spot_id: spot.id, flop_key: "KcKd4h", part: 0, parts: 2, content_hash: "fresh", body: [1] },
  ];
  const env = { DB: mockDb({ postflop_flop_base_br: rows }) };
  const get = (key, headers = { "accept-encoding": "gzip, br" }) => worker.fetch(new Request(`https://edge.test/v1/postflop/flop?spot=${spot.id}&flop=${key}`, { headers }), env);
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

test("three actual generated flop bases are byte-identical to the local middleware", async () => {
  const { flopBaseResponse, flopBaseBytesParts } = await import("../../frontend/scripts/postflop-ai/flop-base-d1.mjs");
  const keys = ["Ac7d2h", "KcKd4h", "AcKc4c"];
  const rows = [];
  for (const flop of keys) {
    const response = flopBaseResponse(new URLSearchParams({ spot: spot.id, flop }));
    if (response.status !== 200) continue; // CI without local artifacts still exercises synthetic rows above.
    const parts = flopBaseBytesParts(response.bytes);
    parts.forEach((body, part) => rows.push({ spot_id: spot.id, flop_key: flop, part, parts: parts.length, content_hash: "h", body: [...body] }));
  }
  const env = { DB: mockDb({ postflop_flop_base_br: rows }) };
  for (const flop of keys) {
    if (!rows.some(row => row.flop_key === flop)) continue;
    const response = await worker.fetch(new Request(`https://edge.test/v1/postflop/flop?spot=${spot.id}&flop=${flop}`, { headers: { "accept-encoding": "br" } }), env);
    assert.equal(response.status, 200);
    const expected = flopBaseResponse(new URLSearchParams({ spot: spot.id, flop }));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(expected.bytes));
    assert.equal(brotliDecompressSync(expected.bytes).toString(), expected.text);
  }
});
