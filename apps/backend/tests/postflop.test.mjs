import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import worker from "../src/index.ts";
import { handEvRows, spotArtifacts } from "../../frontend/scripts/postflop-ai/publish-d1.mjs";
import { postflopResponse } from "../../frontend/scripts/postflop-ai/local-view.mjs";
import { handEvResponse } from "../../frontend/scripts/postflop-ai/hand-ev.mjs";
import { boards } from "../../frontend/scripts/postflop-ai/inputs.mjs";
import { spotById } from "../../frontend/scripts/postflop-ai/spots.mjs";

// In-memory D1 answering the worker's queries: WHERE spot_id = ?, plus the hand-EV header/node filter.
function mockDb(tables) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async all() {
          const table = sql.match(/FROM (\w+)/)[1];
          let rows = tables[table] ?? [];
          if (sql.includes("WHERE spot_id")) rows = rows.filter(row => row.spot_id === args[0]);
          if (table === "postflop_hand_ev") rows = rows.filter(row => row.stage === "flop" &&
            ((row.board_key === "" && row.history === "") || (row.board_key === args[1] && row.history === args[2])));
          if (table === "postflop_flop_base_br") rows = rows.filter(row => row.flop_key === args[1]).sort((a, b) => a.part - b.part);
          return { results: rows };
        },
      };
      return statement;
    },
  };
}

function tablesFor(published) {
  const tables = { postflop_spots: [], postflop_policies: [], postflop_reports: [], postflop_hand_ev: [] };
  for (const { spot, candidate, laterCandidate, report, handEv } of published) {
    tables.postflop_spots.push({ spot_id: spot.id, spot_json: JSON.stringify(spot) });
    for (const [stage, item] of [["flop", candidate], ["later", laterCandidate]]) {
      if (item) tables.postflop_policies.push({ spot_id: spot.id, stage, policy_hash: item.metadata.policy_hash, policy_json: JSON.stringify(item) });
    }
    tables.postflop_reports.push({ spot_id: spot.id, payload_json: JSON.stringify(report) });
    if (handEv) for (const row of handEvRows(handEv, "flop")) tables.postflop_hand_ev.push({ spot_id: spot.id, stage: "flop", board_key: row.board_key, history: row.history, payload_json: JSON.stringify(row.payload) });
  }
  return tables;
}

test("postflop routes validate the spot and serve no computed views", async () => {
  const env = { SOLUTIONS: null, DB: mockDb({}) };
  const status = async path => (await worker.fetch(new Request(`https://edge.test${path}`), env)).status;
  assert.equal(await status("/v1/postflop/spot"), 400);
  assert.equal(await status("/v1/postflop/spot?spot=a'b"), 400);
  assert.equal(await status("/v1/postflop/spot?spot=BTN_open_BB_call"), 404);
  for (const route of ["board", "later", "explain", "later-explain", "later-hand-ev"]) {
    assert.equal(await status(`/v1/postflop/${route}?spot=BTN_open_BB_call`), 404, route);
  }
});

const spot = spotById("BTN_open_BB_call");
const local = existsSync(new URL(`../../frontend/.local/postflop-ai/${spot.slug}-policy.json`, import.meta.url));
test("worker artifacts and hand-EV equal the local middleware", { skip: !local && "no local postflop artifacts" }, async () => {
  const artifacts = spotArtifacts(spot);
  assert.ok(!artifacts.skip, artifacts.skip);
  const env = { SOLUTIONS: null, DB: mockDb(tablesFor([artifacts])) };
  const get = async path => worker.fetch(new Request(`https://edge.test${path}`), env);
  assert.equal((await (await get("/v1/postflop/spots")).json()).spots[spot.id].flop, artifacts.candidate.metadata.policy_hash);

  const response = await get(`/v1/postflop/spot?spot=${spot.id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), postflopResponse("/local-postflop-spot", new URLSearchParams({ spot: spot.id })).body);

  const params = new URLSearchParams({ spot: spot.id, board: boards()[0].id, history: "", hand: "AKo" });
  const ev = await get(`/v1/postflop/hand-ev?${params}`);
  const expected = handEvResponse(params);
  assert.equal(ev.status, expected.status);
  assert.deepEqual(await ev.json(), expected.body);
  params.delete("hand");
  const node = await (await get(`/v1/postflop/hand-ev?${params}`)).json();
  assert.equal(node.node.rows.AKo.ev_bb != null || node.node.rows.AKo != null, true);
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
