import { createHash } from "node:crypto";
import { assertPublishedMetadata } from "./reviewed-preflop.mjs";

export const METADATA_SQL = "SELECT name, content_hash, bytes, parts FROM preflop_datasets ORDER BY name";
export const PART_BATCH = 128;
// Query only preflop tables, in bounded pages, bypassing HTTP/browser caches.
export async function verifyPublishedPreflop(query, manifest) {
  assertPublishedMetadata(await query(METADATA_SQL), manifest);
  const expected = new Map(manifest.datasets.map(item => [item.name, item]));
  const count = await query("SELECT COUNT(*) AS count FROM preflop_dataset_parts");
  const total = manifest.datasets.reduce((sum, item) => sum + item.parts, 0);
  if (count.length !== 1 || count[0].count !== total) throw new Error("D1 preflop part count changed (missing or orphan rows)");
  let current, hash, bytes = 0, part = 0;
  const seen = new Set();
  function finish() {
    if (!current) return;
    const item = expected.get(current);
    if (part !== item.parts || bytes !== item.bytes || hash.digest("hex") !== item.sha256) throw new Error(`D1 preflop payload hash/bytes/parts differ: ${current}`);
  }
  for (let offset = 0; offset < total; offset += PART_BATCH) {
    const rows = await query(`SELECT name, part, body FROM preflop_dataset_parts ORDER BY name COLLATE BINARY, part LIMIT ${PART_BATCH} OFFSET ${offset}`);
    if (rows.length !== Math.min(PART_BATCH, total - offset)) throw new Error("D1 preflop part query is incomplete");
    for (const row of rows) {
      if (row.name !== current) {
        finish();
        if (!expected.has(row.name) || seen.has(row.name)) throw new Error("D1 preflop has an unknown or repeated dataset");
        seen.add(row.name); current = row.name; hash = createHash("sha256"); bytes = 0; part = 0;
      }
      if (row.part !== part++ || typeof row.body !== "string") throw new Error(`D1 preflop part order/body changed: ${row.name}`);
      hash.update(row.body); bytes += Buffer.byteLength(row.body);
    }
  }
  finish();
  if (seen.size !== expected.size) throw new Error("D1 preflop datasets have missing bodies");
  return { datasets: seen.size, parts: total };
}

// A transport/permission error is not evidence that the schema is absent.
export function missingPreflopSchema(error) {
  return /no such table:\s*(?:main\.)?preflop_datasets\b/.test(String(error?.message ?? error));
}
