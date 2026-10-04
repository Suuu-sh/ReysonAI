import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublishedPreflop, METADATA_SQL, PART_BATCH, missingPreflopSchema } from "../scripts/lib/preflop-delivery.mjs";
import { sha256 } from "../scripts/lib/reviewed-preflop.mjs";
const body = JSON.stringify({ reason: "検証済み", fold: 100 });
const manifest = { datasets: [{ name: "a", sha256: sha256(body), bytes: Buffer.byteLength(body), parts: 2 }] };
const metadata = [{ name: "a", content_hash: sha256(body), bytes: Buffer.byteLength(body), parts: 2 }];
const parts = [{ name: "a", part: 0, body: body.slice(0, 10) }, { name: "a", part: 1, body: body.slice(10) }];
const queryFor = (rows, meta = metadata, count = rows.length) => async sql => {
  if (sql === METADATA_SQL) return meta;
  if (sql.startsWith("SELECT COUNT")) return [{ count }];
  assert.match(sql, new RegExp(`LIMIT ${PART_BATCH} OFFSET \\d+$`));
  const offset = Number(sql.match(/OFFSET (\d+)$/)[1]);
  return rows.slice(offset, offset + PART_BATCH);
};
test("published preflop verification hashes actual Unicode bodies", async () => {
  assert.deepEqual(await verifyPublishedPreflop(queryFor(parts), manifest), { datasets: 1, parts: 2 });
});
test("copied metadata cannot hide corruption, orphan/missing or misordered parts", async () => {
  for (const rows of [parts.slice(0, 1), [...parts, { name: "orphan", part: 0, body: "x" }],
    [{ ...parts[0], body: "wrong" }, parts[1]], [{ ...parts[0], part: 1 }, parts[1]],
    [parts[0], { ...parts[1], name: "unknown" }]]) await assert.rejects(verifyPublishedPreflop(queryFor(rows), manifest));
  await assert.rejects(verifyPublishedPreflop(queryFor(parts.slice(0, 1), metadata, 2), manifest), /incomplete/);
});
test("only a missing preflop table allows schema initialization", () => {
  assert.equal(missingPreflopSchema(new Error("D1_ERROR: no such table: preflop_datasets")), true);
  for (const message of ["Authentication error", "no such table: account_users", "Network timeout"])
    assert.equal(missingPreflopSchema(new Error(message)), false);
});
