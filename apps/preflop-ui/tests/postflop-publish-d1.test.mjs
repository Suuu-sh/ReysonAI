import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VALUE_BYTES, buildSql, handEvRows } from "../scripts/postflop-ai/publish-d1.mjs";
import { postflopUrl } from "../src/estimated/postflop-api.ts";

const spot = { id: "X_open_Y_call", slug: "x-y-srp-v1", kind: "srp", tree: "oop_checks", ip: "Y", oop: "X", potBb: 5.5, stackBb: 97.5, note: "it's" };
const candidate = { metadata: { policy_hash: "h1" }, policy: {} };
const entry = { spot, candidate, laterCandidate: null, report: { ok: true },
  handEv: { kind: "k", boards: { As7d2c: { "": { node: "a" }, bet33: { node: "b" } } } } };

test("publish SQL replaces every row, escapes quotes and records the dataset version", () => {
  const sql = buildSql([entry], "2026-09-29T00:00:00Z");
  const lines = sql.trim().split("\n");
  const firstInsert = lines.findIndex(line => line.startsWith("INSERT"));
  for (const table of ["postflop_hand_ev", "postflop_policies", "postflop_reports", "postflop_spots"]) {
    assert.ok(lines.indexOf(`DELETE FROM ${table};`) >= 0 && lines.indexOf(`DELETE FROM ${table};`) < firstInsert, table);
  }
  assert.match(sql, /it''s/);
  assert.equal(lines.filter(line => line.startsWith("INSERT INTO postflop_policies")).length, 1);
  assert.equal(lines.filter(line => line.startsWith("INSERT INTO postflop_hand_ev")).length, 3);
  assert.match(sql, /INSERT INTO dataset_versions .*'postflop', '[0-9a-f]{64}', '2026-09-29T00:00:00Z'/);
});

test("publish refuses a value over the D1 statement budget", () => {
  const huge = { ...entry, report: { text: "x".repeat(MAX_VALUE_BYTES) } };
  assert.throws(() => buildSql([huge]), /X_open_Y_call report/);
});

test("hand-EV rows split the flop file by board and history", () => {
  assert.deepEqual(handEvRows(entry.handEv, "flop").map(row => [row.board_key, row.history]), [["", ""], ["As7d2c", ""], ["As7d2c", "bet33"]]);
});

test("postflop URLs use the edge API only when a base is configured", () => {
  assert.equal(postflopUrl("board", { spot: "S", board: "As7d2c" }), "/local-postflop?spot=S&board=As7d2c");
  assert.equal(postflopUrl("hand-ev", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/hand-ev?spot=S");
});
