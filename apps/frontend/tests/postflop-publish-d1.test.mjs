import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VALUE_BYTES, buildSql } from "../scripts/postflop-ai/publish-d1.mjs";
import { postflopUrl } from "../src/estimated/postflop-api.ts";

const spot = { id: "X_open_Y_call", slug: "x-y-srp-v1", kind: "srp", tree: "oop_checks", ip: "Y", oop: "X", potBb: 5.5, stackBb: 97.5, note: "it's" };
const candidate = { metadata: { policy_hash: "h1" }, policy: {} };
const entry = { spot, candidate, laterCandidate: null, report: { ok: true } };

test("publish SQL replaces only supplied spots, escapes quotes and records the patch version", () => {
  const sql = buildSql([entry], "2026-09-29T00:00:00Z");
  const lines = sql.trim().split("\n");
  const firstInsert = lines.findIndex(line => line.startsWith("INSERT"));
  for (const table of ["postflop_policies", "postflop_reports", "postflop_spots"]) {
    assert.ok(lines.indexOf(`DELETE FROM ${table} WHERE spot_id = 'X_open_Y_call';`) >= 0 && lines.indexOf(`DELETE FROM ${table} WHERE spot_id = 'X_open_Y_call';`) < firstInsert, table);
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

test("empty publication cannot erase old policies", () => {
  assert.doesNotMatch(buildSql([]), /DELETE|INSERT/);
  assert.doesNotMatch(buildSql([entry]), /DELETE FROM postflop_\w+;/);
});

test("partial A-to-B-to-A publications never reuse an old cache revision", () => {
  const token = sql => /VALUES \('postflop', '([a-f0-9]+)'/.exec(sql)[1];
  const a1=buildSql([entry],'2026-10-04T00:00:00Z');
  const b=buildSql([{...entry,spot:{...spot,id:'B'}}],'2026-10-04T00:00:00Z');
  const a2=buildSql([entry],'2026-10-04T00:00:00Z');
  assert.equal(new Set([token(a1),token(b),token(a2)]).size,3);
  assert.equal(buildSql([entry],'2026-10-04T00:00:00Z','reviewed-publication-id'),buildSql([entry],'2026-10-04T00:00:00Z','reviewed-publication-id'));
});


test("duplicate publication tuples fail before generating SQL", () => {
  assert.throws(()=>buildSql([entry,entry]),/Duplicate published postflop spot/);
});

test("both policy stages and report attribution are preserved within spot-scoped SQL", () => {
  const policy={metadata:{policy_hash:'flop-hash',model:'gpt-6.1-sol',reasoning_effort:'high'},policy:{}};
  const later={metadata:{policy_hash:'later-hash',flop_policy_hash:'flop-hash',model:'gpt-6.1-sol',reasoning_effort:'high'},policy:{}};
  const report={kind:'ai_estimate_not_gto',defence_version:7,policy_hash:'flop-hash',later_policy_hash:'later-hash'};
  const sql=buildSql([{spot,candidate:policy,laterCandidate:later,report}]);
  assert.equal(sql.split('\n').filter(line=>line.startsWith('INSERT INTO postflop_policies')).length,2);
  assert.match(sql,/"model":"gpt-6.1-sol"/);
  assert.match(sql,/"defence_version":7/);
  assert.doesNotMatch(sql,/gpt-6-astra|action_model_version/);
  for(const line of sql.split('\n').filter(line=>line.startsWith('DELETE FROM postflop_'))) {
    assert.match(line,/ WHERE spot_id = 'X_open_Y_call';$/);
  }
});
