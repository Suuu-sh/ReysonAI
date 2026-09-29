import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import worker from "../src/index.ts";
import { assembleHandEv } from "../src/postflop.ts";
import { handEvRows, spotArtifacts } from "../../preflop-ui/scripts/postflop-ai/publish-d1.mjs";
import { postflopResponse } from "../../preflop-ui/scripts/postflop-ai/local-view.mjs";
import { boards, useArtifactSource } from "../../preflop-ui/scripts/postflop-ai/inputs.mjs";
import { spotById } from "../../preflop-ui/scripts/postflop-ai/spots.mjs";

// In-memory D1 that answers the worker's three per-spot queries and the spot listing.
function mockDb(tables) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async all() {
          const table = sql.match(/FROM (\w+)/)[1];
          const rows = (tables[table] ?? []).filter(row => !sql.includes("WHERE spot_id") || row.spot_id === args[0]);
          return { results: rows };
        },
      };
      return statement;
    },
  };
}

function tablesFor(published) {
  const tables = { postflop_policies: [], postflop_reports: [], postflop_hand_ev: [] };
  for (const { spot, candidate, laterCandidate, report, handEv } of published) {
    for (const [stage, item] of [["flop", candidate], ["later", laterCandidate]]) {
      if (item) tables.postflop_policies.push({ spot_id: spot.id, stage, policy_hash: item.metadata.policy_hash, policy_json: JSON.stringify(item) });
    }
    tables.postflop_reports.push({ spot_id: spot.id, payload_json: JSON.stringify(report) });
    if (handEv) for (const row of handEvRows(handEv, "flop")) tables.postflop_hand_ev.push({ spot_id: spot.id, stage: "flop", board_key: row.board_key, history: row.history, payload_json: JSON.stringify(row.payload) });
  }
  return tables;
}

test("hand-EV rows reassemble into the original file", () => {
  const flop = { kind: "k", version: 1, boards: { As7d2c: { "": { node: "a" }, bet33: { node: "b" } }, Kh9s4c: { "": { node: "c" } } } };
  const later = { kind: "k", samples: 3, boards: { "x|y": { node: "t" } } };
  const rows = [...handEvRows(flop, "flop").map(row => ({ ...row, stage: "flop" })), ...handEvRows(later, "later").map(row => ({ ...row, stage: "later" }))]
    .map(row => ({ ...row, payload_json: JSON.stringify(row.payload) }));
  assert.deepEqual(assembleHandEv(rows, "flop"), flop);
  assert.deepEqual(assembleHandEv(rows, "later"), later);
  assert.equal(assembleHandEv([], "flop"), null);
});

test("postflop routes validate the spot", async () => {
  const env = { SOLUTIONS: null, POSTFLOP_DB: mockDb({}) };
  assert.equal((await worker.fetch(new Request("https://edge.test/v1/postflop/board?board=As7d2c"), env)).status, 400);
  assert.equal((await worker.fetch(new Request("https://edge.test/v1/postflop/board?spot=nope"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://edge.test/v1/postflop/unknown?spot=BTN_open_BB_call"), env)).status, 404);
});

// Importing the worker redirects artifact reads to D1 rows; read the local files meanwhile.
function fromFiles(read) {
  const workerSource = useArtifactSource(null);
  try { return read(); } finally { useArtifactSource(workerSource); }
}

const spot = spotById("BTN_open_BB_call");
const local = existsSync(new URL(`../../preflop-ui/.local/postflop-ai/${spot.slug}-policy.json`, import.meta.url));
test("worker views equal the local middleware views for published artifacts", { skip: !local && "no local postflop artifacts" }, async () => {
  const artifacts = fromFiles(() => spotArtifacts(spot));
  assert.ok(!artifacts.skip, artifacts.skip);
  const env = { SOLUTIONS: null, POSTFLOP_DB: mockDb(tablesFor([artifacts])) };
  const spotsResponse = await worker.fetch(new Request("https://edge.test/v1/postflop/spots"), env);
  assert.equal((await spotsResponse.json()).spots[spot.id].flop, artifacts.candidate.metadata.policy_hash);
  const cases = [
    ["board", "/local-postflop", { spot: spot.id, board: boards()[0].id }],
    ["later", "/local-postflop-later", { spot: spot.id, flop: "As7d2c", flopActions: "check", turn: "3s" }],
  ];
  for (const [route, path, query] of cases) {
    const params = new URLSearchParams(query);
    const response = await worker.fetch(new Request(`https://edge.test/v1/postflop/${route}?${params}`), env);
    const expected = fromFiles(() => postflopResponse(path, params));
    assert.equal(response.status, expected.status, route);
    assert.deepEqual(await response.json(), expected.body, route);
  }
});
