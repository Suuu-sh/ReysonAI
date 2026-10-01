import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VALUE_BYTES, buildSql } from "../scripts/postflop-ai/publish-d1.mjs";
import { postflopUrl } from "../src/estimated/postflop-api.ts";

const spot = { id: "X_open_Y_call", slug: "x-y-srp-v1", kind: "srp", tree: "oop_checks", ip: "Y", oop: "X", potBb: 5.5, stackBb: 97.5, note: "it's" };
const candidate = { metadata: { policy_hash: "h1" }, policy: {} };
const entry = { spot, candidate, laterCandidate: null, report: { ok: true } };

test("publish SQL replaces every row, escapes quotes and records the dataset version", () => {
  const sql = buildSql([entry], "2026-09-29T00:00:00Z");
  const lines = sql.trim().split("\n");
  const firstInsert = lines.findIndex(line => line.startsWith("INSERT"));
  for (const table of ["postflop_policies", "postflop_reports", "postflop_spots"]) {
    assert.ok(lines.indexOf(`DELETE FROM ${table};`) >= 0 && lines.indexOf(`DELETE FROM ${table};`) < firstInsert, table);
  }
  assert.match(sql, /it''s/);
  assert.equal(lines.filter(line => line.startsWith("INSERT INTO postflop_policies")).length, 1);
  assert.doesNotMatch(sql, /postflop_hand_ev/);
  assert.match(sql, /INSERT INTO dataset_versions .*'postflop', '[0-9a-f]{64}', '2026-09-29T00:00:00Z'/);
});

test("publish refuses a value over the D1 statement budget", () => {
  const huge = { ...entry, report: { text: "x".repeat(MAX_VALUE_BYTES) } };
  assert.throws(() => buildSql([huge]), /X_open_Y_call report/);
});

test("postflop URLs expose only read-only spot and flop artifacts, no hand-EV", () => {
  assert.equal(postflopUrl("spot", { spot: "S" }), "/local-postflop-spot?spot=S");
  assert.equal(postflopUrl("spot", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/spot?spot=S");
  assert.equal(postflopUrl("flop", { spot: "S" }, "https://api.test/"), "https://api.test/v1/postflop/flop?spot=S");
});
