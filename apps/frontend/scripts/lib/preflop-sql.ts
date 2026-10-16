// Canonical delivery serialization only. This module never authors strategies
// or approves a snapshot; reviewed callers must run their full verification first.
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const ESTIMATED_DIR = fileURLToPath(new URL("../../src/estimated", import.meta.url));
// Keep the historical UTF-16 code-unit boundaries and SQL quote semantics.
export const PART_CHARS = 30_000;
const quote = (value: any) : any => `'${String(value).replaceAll("'", "''")}'`;
const compare = (a?: any, b?: any) : any => a < b ? -1 : a > b ? 1 : 0;
const differs = () : any => new Error("Delivery bundle differs from the reviewed checkout");

// Retain only paths. Object property enumeration preserves the old numeric-root
// name ordering, in addition to localeCompare traversal and depth-first order.
export function* preflopDatasetEntries(dir: any = ESTIMATED_DIR) : any {
  const paths: Record<string, any> = {};
  const walk = (current: any) : any => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a?: any, b?: any) : any => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".json")) paths[relative(dir, path).replace(/\.json$/, "")] = path;
    }
  };
  walk(dir);
  for (const [name, path] of Object.entries<any>(paths))
    yield [name, JSON.stringify(JSON.parse(readFileSync(path, "utf8")))];
}

// Small-caller compatibility. Delivery entry points use the iterator instead.
export function preflopDatasets(dir: any = ESTIMATED_DIR) : any {
  return Object.fromEntries(preflopDatasetEntries(dir));
}

export function* preflopSqlChunks(datasets?: any, onDataset: any = () : any => {}) : any {
  yield "-- Preflop datasets: delivery copy of apps/frontend/src/estimated/**/*.json.\n";
  yield "DELETE FROM preflop_dataset_parts;\n";
  yield "DELETE FROM preflop_datasets;\n";
  const entries = datasets[Symbol.iterator] ? datasets : Object.entries<any>(datasets);
  for (const [name, text] of entries) {
    const item = { name, sha256: createHash("sha256").update(text).digest("hex"),
      bytes: Buffer.byteLength(text), parts: Math.ceil(text.length / PART_CHARS) };
    onDataset(item);
    yield `INSERT INTO preflop_datasets (name, content_hash, bytes, parts) VALUES (${quote(name)}, ${quote(item.sha256)}, ${item.bytes}, ${item.parts});\n`;
    // Yield complete SQL lines. A surrogate pair split by PART_CHARS historically
    // becomes two replacements in quoted parts; never repair or move that split.
    for (let index = 0, part = 0; index < text.length; index += PART_CHARS, part++)
      yield `INSERT INTO preflop_dataset_parts (name, part, body) VALUES (${quote(name)}, ${part}, ${quote(text.slice(index, index + PART_CHARS))});\n`;
  }
}

export function buildPreflopSql(datasets?: any) : any {
  return Array.from(preflopSqlChunks(datasets)).join("");
}

function fingerprint(chunks?: any, consume: any = () : any => {}) : any {
  const hash = createHash("sha256");
  let bytes = 0;
  for (const chunk of chunks) {
    const body = Buffer.from(chunk);
    hash.update(body); bytes += body.length; consume(body);
  }
  return { sha256: hash.digest("hex"), bytes };
}

// Two serial passes retain one compact dataset, its bounded SQL lines and small
// metadata. Every later pass checks each dataset against the prepared identity.
export function preparePreflopSerialization(dir: any = ESTIMATED_DIR, prefix: any = "") : any {
  const datasets: any[] = [];
  const chunks = function* (onDataset?: any) : any {
    if (prefix) yield prefix;
    yield* preflopSqlChunks(preflopDatasetEntries(dir), onDataset);
  };
  const sql = fingerprint(chunks((item: any) : any => datasets.push(item)));
  datasets.sort((a?: any, b?: any) : any => compare(a.name, b.name));
  const identities = new Map(datasets.map((item: any) : any => [item.name, { ...item }]));
  return { sql, datasets, sqlChunks: function* () : any {
    const seen = new Set();
    yield* chunks((item: any) : any => {
      if (seen.has(item.name) || !isDeepStrictEqual(item, identities.get(item.name))) throw differs();
      seen.add(item.name);
    });
    if (seen.size !== identities.size) throw differs();
  } };
}

export function writePreflopSqlFile(path?: any, chunks?: any, expectedSql?: any) : any {
  const descriptor = openSync(path, "w");
  try {
    const actual = fingerprint(chunks, (body: any) : any => writeFileSync(descriptor, body));
    if (!isDeepStrictEqual(actual, expectedSql)) throw differs();
  } finally { closeSync(descriptor); }
}

// Compare raw bytes, including early EOF and trailing bytes, with a fixed read
// buffer. Also bind the replayed source bytes to the prepared SQL fingerprint.
export function assertPreflopSqlFile(path?: any, chunks?: any, expectedSql?: any) : any {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    const actual = fingerprint(chunks, (body: any) : any => {
      for (let offset = 0; offset < body.length;) {
        const length = readSync(descriptor, buffer, 0, Math.min(buffer.length, body.length - offset), null);
        if (!length || !buffer.subarray(0, length).equals(body.subarray(offset, offset + length))) throw differs();
        offset += length;
      }
    });
    if (readSync(descriptor, buffer, 0, 1, null) !== 0 || !isDeepStrictEqual(actual, expectedSql)) throw differs();
  } finally { closeSync(descriptor); }
}
