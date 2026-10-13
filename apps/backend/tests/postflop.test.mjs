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
import { installEdgeCache } from "./helpers/edge-cache.mjs";

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
          if (table === "postflop_profile_policies") rows = rows.filter(row => row.profile === args[0] && row.spot_id === args[1] && row.opponent_seat === args[2] && row.role === args[3] && row.stage === args[4]);
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

const savedSpot = ' { "id": "BTN_open_BB_call" } ';
const savedFlop = ' { "metadata": {"policy_hash":"saved"}, "policy": {"check":0.75} } ';
const savedLater = '{ "policy": { "fold": 1 } }';
const savedReport = ' {"note":"AI estimate, not GTO"} ';
const savedEnvelope = (single = false, later = savedLater, report = savedReport) =>
  `{"kind":"ai_estimate_not_gto","spot":${savedSpot},"candidate":${savedFlop},"laterCandidate":${later},"report":${report}${single ? ',"sizing":"single"' : ""}}`;
const storedSizingTables = () => ({
  postflop_spots: [{ spot_id: spot.id, spot_json: savedSpot }],
  postflop_policies: [{ spot_id: spot.id, stage: "flop", policy_json: savedFlop }, { spot_id: spot.id, stage: "later", policy_json: savedLater }],
  postflop_reports: [{ spot_id: spot.id, payload_json: savedReport }],
  postflop_single_policies: [{ spot_id: spot.id, stage: "flop", policy_json: savedFlop }, { spot_id: spot.id, stage: "later", policy_json: savedLater }],
  postflop_single_reports: [{ spot_id: spot.id, payload_json: savedReport }],
});

test("absent and explicit multi sizing preserve the exact standard SQL and response bytes", async () => {
  for (const sizing of [null, "multi"]) {
    const queries = [];
    const env = { DB: mockDb(storedSizingTables(), (sql, args) => queries.push({ sql, args })) };
    const params = new URLSearchParams({ spot: spot.id });
    if (sizing !== null) params.set("sizing", sizing);
    const response = await worker.fetch(new Request(`https://edge.test/v1/postflop/spot?${params}`), env);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(savedEnvelope()));
    assert.deepEqual(queries, [
      { sql: "SELECT spot_json FROM postflop_spots WHERE spot_id = ?", args: [spot.id] },
      { sql: "SELECT stage, policy_json FROM postflop_policies WHERE spot_id = ?", args: [spot.id] },
      { sql: "SELECT payload_json FROM postflop_reports WHERE spot_id = ?", args: [spot.id] },
    ]);
  }
});

test("single sizing passes through only its saved artifacts with the old envelope plus sizing", async () => {
  for (const complete of [true, false]) {
    const queries = [];
    const tables = storedSizingTables();
    // Standard rows and another spot must never leak into the Single envelope.
    tables.postflop_policies[0].policy_json = '{"wrong_standard":true}';
    tables.postflop_single_policies.unshift({ spot_id: "different_spot", stage: "flop", policy_json: '{"wrong_spot":true}' });
    if (!complete) {
      tables.postflop_single_policies = tables.postflop_single_policies.filter(row => row.stage !== "later");
      tables.postflop_single_reports = [];
    }
    const env = { DB: mockDb(tables, (sql, args) => queries.push({ sql, args })) };
    const response = await worker.fetch(new Request(`https://edge.test/v1/postflop/spot?spot=${spot.id}&sizing=single`), env);
    assert.equal(response.status, 200);
    const expected = savedEnvelope(true, complete ? savedLater : "null", complete ? savedReport : "null");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(expected));
    assert.deepEqual(Object.keys(JSON.parse(expected)), ["kind", "spot", "candidate", "laterCandidate", "report", "sizing"]);
    assert.deepEqual(queries, [
      { sql: "SELECT spot_json FROM postflop_spots WHERE spot_id = ?", args: [spot.id] },
      { sql: "SELECT stage, policy_json FROM postflop_single_policies WHERE spot_id = ?", args: [spot.id] },
      { sql: "SELECT payload_json FROM postflop_single_reports WHERE spot_id = ?", args: [spot.id] },
    ]);
  }
});

test("a missing single flop returns the structured 404 without standard fallback", async () => {
  for (const tables of [{}, { ...storedSizingTables(), postflop_single_policies: [{ spot_id: spot.id, stage: "later", policy_json: savedLater }] }]) {
    const queries = [];
    const response = await worker.fetch(new Request(`https://edge.test/v1/postflop/spot?spot=${spot.id}&sizing=single`),
      { DB: mockDb(tables, sql => queries.push(sql)) });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '{"error":"No single-size policy","code":"SINGLE_SIZE_MISSING"}');
    assert.equal(response.headers.get("cache-control"), null);
    assert.ok(!queries.some(sql => /FROM postflop_(policies|reports)\b/.test(sql)));
  }
});

test("invalid or duplicate sizing bypasses stale cache entries and returns 400 without D1 reads", async t => {
  const cache = installEdgeCache(t);
  const db = mockDb({}, () => assert.fail("invalid sizing must not query D1"));
  for (const selector of ["sizing=", "sizing=Single", "sizing=unknown", "sizing=single&sizing=single", "sizing=multi&sizing=single", "sizing=multi&sizing=multi"]) {
    const path = `https://edge.test/v1/postflop/spot?spot=${spot.id}&${selector}`;
    // Simulate an old successful response for the exact invalid selector.
    cache.entries.set(`${path}&dataset=standard-version`, { response: new Response(savedEnvelope()), expires: Infinity });
    const response = await worker.fetch(new Request(path), { DB: db });
    assert.equal(response.status, 400, selector);
    assert.equal(response.headers.get("cache-control"), null);
  }
  assert.deepEqual(cache.matches, []);
  assert.deepEqual(cache.puts, []);
});

test("single cache uses its independent dataset revision and republish never changes multi keys", async t => {
  const cache = installEdgeCache(t);
  const queries = [];
  const tables = { ...storedSizingTables(), dataset_versions: [
    { name: "postflop", content_hash: "standard-version" },
    { name: "postflop-single", content_hash: "single-version-a" },
  ] };
  const env = { DB: mockDb(tables, (sql, args) => queries.push({ sql, args })) };
  const get = suffix => worker.fetch(new Request(`https://edge.test/v1/postflop/spot?spot=${spot.id}${suffix}`), env);
  const multi = await get("");
  assert.equal(multi.headers.get("x-reysonai-cache"), "MISS");
  assert.equal(await multi.text(), savedEnvelope());
  const single = await get("&sizing=single");
  assert.equal(single.headers.get("x-reysonai-cache"), "MISS");
  assert.equal(await single.text(), savedEnvelope(true));
  assert.equal((await get("&sizing=single")).headers.get("x-reysonai-cache"), "HIT");
  const multiKey = `https://edge.test/v1/postflop/spot?spot=${spot.id}&dataset=standard-version`;
  assert.ok(cache.puts.includes(multiKey));
  assert.ok(cache.puts.some(key => key.includes("sizing=single&dataset=single-version-a")));
  assert.deepEqual(queries.filter(({ sql }) => sql.includes("FROM dataset_versions")).map(({ args }) => args[0]), ["postflop", "postflop-single"]);
  tables.dataset_versions[1].content_hash = "single-version-b";
  tables.postflop_single_policies[0].policy_json = '{"new_single":true}';
  cache.advance(60_000);
  const republished = await get("&sizing=single");
  assert.equal(republished.headers.get("x-reysonai-cache"), "MISS");
  assert.deepEqual((await republished.json()).candidate, { new_single: true });
  assert.equal((await get("&sizing=single")).headers.get("x-reysonai-cache"), "HIT");
  const unchangedMulti = await get("");
  assert.equal(unchangedMulti.headers.get("x-reysonai-cache"), "HIT");
  assert.equal(await unchangedMulti.text(), savedEnvelope());
  assert.equal(cache.puts.filter(key => key === multiKey).length, 1);
});

const profileParams = overrides => new URLSearchParams({ profile: "nit", spot: spot.id, opponentSeat: "ip", role: "villain", stage: "flop", ...overrides });
const profilePath = params => `/v1/postflop/profile-policy?${params}`;

test("profile policies validate every required selector before reading policies", async () => {
  const db = mockDb({}, () => assert.fail("invalid selectors must not query D1"));
  const env = { DB: db };
  const invalid = [];
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

test("profile route returns the exact saved metadata and policy for every profile, role and stage", async () => {
  const rows = [];
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
  const env = { DB: mockDb({ postflop_profile_policies: rows }), ALLOWED_ORIGIN: "https://app.example.test" };
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

test("profile misses stay structured and never fall back to another stored policy", async () => {
  const queries = [];
  const env = { DB: mockDb({
    postflop_policies: [{ spot_id: spot.id, stage: "flop", policy_json: '{"balanced":true}' }],
    postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, opponent_seat: "ip", role: "villain", stage: "flop", metadata_json: "{}", policy_json: "{}", published_at: "now" }],
  }, (sql, args) => queries.push({ sql, args })) };
  for (const change of [{ profile: "maniac" }, { opponentSeat: "oop" }, { role: "exploit" }, { stage: "later" }, { spot: "unpublished_spot" }]) {
    const response = await worker.fetch(new Request(`https://edge.test${profilePath(profileParams(change))}`), env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "No stored profile policy", code: "PROFILE_POLICY_MISSING", state: "not_generated" });
    assert.equal(response.headers.get("cache-control"), null);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }
  assert.equal(queries.length, 5);
  assert.ok(queries.every(({ sql }) => sql.includes("FROM postflop_profile_policies WHERE profile = ? AND spot_id = ? AND opponent_seat = ? AND role = ? AND stage = ?")));
});

test("profile JSON payloads pass through as stored text without runtime parsing", async () => {
  // Invalid JSON is intentional: this unit test proves the handler never parses a policy.
  const metadata = "opaque metadata: not parsed";
  const policy = "opaque policy: not parsed";
  const db = mockDb({ postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, opponent_seat: "ip", role: "villain", stage: "flop",
    metadata_json: metadata, policy_json: policy, published_at: 'timestamp"with\\escapes' }] });
  const response = await routePostflop(db, "/v1/postflop/profile-policy", profileParams());
  assert.equal(response.status, 200);
  assert.equal(response.text, `{"kind":"ai_estimate_not_gto","profile":"nit","spot":"${spot.id}","opponentSeat":"ip","role":"villain","stage":"flop","metadata":${metadata},"policy":${policy},"publishedAt":${JSON.stringify('timestamp"with\\escapes')}}`);
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
  ], postflop_profile_policies: [{ profile: "nit", spot_id: spot.id, opponent_seat: "ip", role: "villain", stage: "flop", metadata_json: "{}", policy_json: "{}", published_at: "now" }]
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
  assert.equal(puts.length, 2, "profile version metadata and its successful policy are cached");
  assert.ok(puts.some(key => key.includes("dataset=profiles-hash")));
  assert.equal((await get("/v1/postflop/spots", "https://one.test")).status, 200);
  assert.equal((await get(`/v1/postflop/flop?spot=${spot.id}&flop=Ac7d2h`, "https://one.test")).status, 404);
  assert.equal(puts.length, 5, "three version metadata rows and two successful responses are cached");
  assert.equal(puts.filter(key => key.includes("/__reysonai_cache/v1/postflop-dataset-version/")).length, 3);
  assert.ok(matched.some(key => key.includes("/v1/postflop/spots?") && key.includes("dataset=balanced-hash")));
  assert.ok(matched.some(key => key.includes("/v1/postflop/flop?") && key.includes("dataset=flop-hash&enc=id")));
  assert.deepEqual(queries.filter(({ sql }) => sql.includes("FROM dataset_versions")).map(({ args }) => args[0]), ["postflop-profiles", "postflop", "flop-base"]);
});

test("postflop version metadata expires after 60s and a republish changes the body cache key", async t => {
  const cache = installEdgeCache(t);
  cache.rewriteBrowserMaxAge(14_400);
  const queries = [];
  const tables = {
    dataset_versions: [{ name: "postflop", content_hash: "old-version" }],
    postflop_policies: [{ spot_id: spot.id, stage: "flop", policy_hash: "old-policy" }],
  };
  const env = { DB: mockDb(tables, (sql, args) => queries.push({ sql, args })) };
  const get = (origin = "https://edge.test", suffix = "") => worker.fetch(new Request(`${origin}/v1/postflop/spots${suffix}`), env);
  const first = await get();
  assert.equal(first.headers.get("x-reysonai-cache"), "MISS");
  assert.equal((await first.json()).spots[spot.id].flop, "old-policy");
  const hit = await get("https://edge.test", "?dataset=forged&enc=br");
  assert.equal(hit.headers.get("x-reysonai-cache"), "HIT", "client query cannot override internal cache selectors");
  assert.equal(hit.headers.get("cache-control"), "public, max-age=300, s-maxage=86400", "zone browser TTL must not leak from Cache API hit");
  assert.equal(queries.length, 2);
  assert.ok(cache.puts.some(key => key.includes("/__reysonai_cache/v1/postflop-dataset-version/postflop")));
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
  assert.deepEqual(queries.filter(({ sql }) => sql.includes("FROM dataset_versions")).map(({ args }) => args[0]), ["postflop", "postflop", "postflop"]);
  assert.equal(queries.filter(({ sql }) => sql.includes("FROM postflop_policies")).length, 3);
  assert.ok(cache.puts.some(key => key.includes("dataset=new-version")));
});

test("postflop cache failures and absence fall through to D1", async t => {
  const cache = installEdgeCache(t);
  const queries = [];
  const env = { DB: mockDb({ dataset_versions: [{ name: "postflop", content_hash: "h" }], postflop_policies: [] }, sql => queries.push(sql)) };
  const get = () => worker.fetch(new Request("https://edge.test/v1/postflop/spots"), env);
  cache.fail({ match: true, put: true });
  for (let i = 0; i < 2; i++) {
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-reysonai-cache"), "MISS");
  }
  assert.equal(queries.length, 4);
  delete globalThis.caches;
  const bypass = await get();
  assert.equal(bypass.status, 200);
  assert.equal(bypass.headers.get("x-reysonai-cache"), "BYPASS");
  assert.equal(queries.length, 5, "no cache API means no version lookup and one body query");
});

test("Brotli and identity flop cache variants stay separate, including conditional hits", async t => {
  const cache = installEdgeCache(t);
  cache.rewriteBrowserMaxAge(14_400);
  const queries = [];
  const packed = brotliCompressSync("{\"saved\":true}");
  const env = { DB: mockDb({
    dataset_versions: [{ name: "flop-base", content_hash: "flop-version" }],
    postflop_flop_base_br: [{ spot_id: spot.id, flop_key: "Ac7d2h", part: 0, parts: 1, content_hash: "flop-body", body: [...packed] }],
  }, sql => queries.push(sql)) };
  const get = headers => worker.fetch(new Request(`https://edge.test/v1/postflop/flop?spot=${spot.id}&flop=Ac7d2h`, { headers }), env);
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
  assert.equal(queries.filter(sql => sql.includes("FROM postflop_flop_base_br")).length, 1);
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
    assert.ok(cache.puts.some(key => key.includes("enc=br")));
    assert.ok(cache.puts.some(key => key.includes("enc=id")));
  } else assert.equal(plain.status, 406);
  assert.equal(queries.filter(sql => sql.includes("FROM dataset_versions")).length, 1);
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
