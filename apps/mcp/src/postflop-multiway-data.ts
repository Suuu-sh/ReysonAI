// Selective, exact reads for the currently published HU-after-multiway source rows.
// The checked-in index contains only reviewed metadata and offsets, never range rows.
import sourceIndex from "./multiway-source-index.json" with { type: "json" };
import { MAX_POSTFLOP_SOURCE_BYTES, McpDataError, type ReadOnlyDatabase } from "./data.ts";

type SourceName = keyof typeof sourceIndex.datasets;
type SourceRowIndex = { start: number; end: number; codeUnits: number; bytes: number; sha256: string;
  parts: { part: number; from: number; to: number }[] };
type SourceDatasetIndex = { contentHash: string; bytes: number; parts: number;
  chunks: Record<string, { codeUnits: number; bytes: number; sha256: string; splitSurrogateAtEnd: boolean }>;
  rows: Record<string, SourceRowIndex> };
type SnapshotRow = { name: string; expected_hash: string; expected_bytes: number; expected_parts: number;
  actual_hash: string | null; actual_dataset_bytes: number | null; actual_dataset_parts: number | null;
  stored_parts: number | null; stored_bytes: number | null; requested_part: number; expected_part_bytes: number;
  actual_part: number | null; actual_part_bytes: number | null; body: string | null };
type SavedSourceDataset = { contentHash: string; spots: Record<string, unknown>[] };

const PART_CHARS = 30_000;
const MAX_DATASET_PARTS = 1_000;
const MAX_SPOT_SOURCE_ROWS = 12;
const MAX_SPOT_PARTS = 32;
const MAX_SOURCE_BYTES = MAX_POSTFLOP_SOURCE_BYTES;
const MAX_SQL_BINDINGS = 90;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9_]{1,100}$/;
const encoder = new TextEncoder();

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function invalid(): never { throw new McpDataError("invalid_saved_data", "Published postflop source data is incomplete or invalid; no estimate was substituted."); }

function indexedDataset(name: string): SourceDatasetIndex | null {
  return Object.hasOwn(sourceIndex.datasets, name) ? sourceIndex.datasets[name as SourceName] as SourceDatasetIndex : null;
}

// This is an internal allowlist. IDs and source families come from the exact
// published descriptor index; MCP callers cannot choose a dataset or source ID.
export function publishedMultiwaySourceSelections(spotId: string): Record<string, string[]> | null {
  const spot = (sourceIndex.spots as Record<string, Record<string, string[]>>)[spotId];
  if (!spot) return null;
  return Object.fromEntries(Object.entries(spot).map(([name, ids]) => [name, [...ids]]));
}

async function query<T>(db: ReadOnlyDatabase | undefined, sql: string, ...args: unknown[]): Promise<T[]> {
  if (!db) throw new McpDataError("data_unavailable", "Saved postflop source storage is unavailable.");
  try {
    const result = await db.prepare(sql).bind(...args).all<T>();
    if (!Array.isArray(result?.results)) invalid();
    return result.results;
  } catch (error) {
    if (error instanceof McpDataError) throw error;
    throw new McpDataError("data_unavailable", "Saved postflop source data could not be read.");
  }
}

async function sha256(text: string): Promise<string> {
  const bytes = encoder.encode(text);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function loadPublishedMultiwayPostflopSourceDatasets(db: ReadOnlyDatabase | undefined, spotId: string) {
  const selections = publishedMultiwaySourceSelections(spotId);
  if (!selections) throw new McpDataError("unsupported_dataset", "This published postflop source family is not indexed for exact MCP reads.");

  const requestedRows: { name: string; id: string; index: SourceRowIndex }[] = [];
  const requestedParts = new Map<string, { name: string; part: number }>();
  const datasetNames = Object.keys(selections).sort();
  if (!datasetNames.length || datasetNames.length > 7) invalid();
  for (const name of datasetNames) {
    const dataset = indexedDataset(name);
    const ids = selections[name];
    if (!dataset || !SHA256.test(dataset.contentHash) || !Number.isInteger(dataset.bytes) || dataset.bytes < 1
      || !Number.isInteger(dataset.parts) || dataset.parts < 1 || dataset.parts > MAX_DATASET_PARTS
      || !Array.isArray(ids) || ids.length < 1 || ids.length > MAX_SPOT_SOURCE_ROWS) invalid();
    for (const id of ids) {
      if (!IDENTIFIER.test(id)) invalid();
      const row = dataset.rows[id];
      if (!row || !Number.isInteger(row.start) || !Number.isInteger(row.end) || row.start < 0 || row.end <= row.start
        || row.end - row.start !== row.codeUnits || !Number.isInteger(row.bytes) || row.bytes < 1 || !SHA256.test(row.sha256)
        || !Array.isArray(row.parts) || row.parts.length < 1) {
        throw new McpDataError("data_unavailable", "An exact published postflop source row is not indexed; no nearby row was substituted.");
      }
      requestedRows.push({ name, id, index: row });
      for (const segment of row.parts) {
        if (!Number.isInteger(segment.part) || segment.part < 0 || segment.part >= dataset.parts
          || !Number.isInteger(segment.from) || !Number.isInteger(segment.to) || segment.from < 0
          || segment.to <= segment.from || segment.to > PART_CHARS) invalid();
        requestedParts.set(`${name}\u0000${segment.part}`, { name, part: segment.part });
      }
    }
  }
  const parts = [...requestedParts.values()].sort((a, b) => a.name.localeCompare(b.name) || a.part - b.part);
  if (requestedRows.length > MAX_SPOT_SOURCE_ROWS || !parts.length || parts.length > MAX_SPOT_PARTS
    || datasetNames.length * 4 + parts.length * 3 > MAX_SQL_BINDINGS) {
    throw new McpDataError("data_unavailable", "This exact postflop source selection exceeds the bounded read limit.");
  }
  let expectedSelectedBytes = 0;
  const expectedPartBytes = new Map<string, number>();
  for (const { name, part } of parts) {
    const chunk = indexedDataset(name)?.chunks[String(part)];
    if (!chunk || !Number.isInteger(chunk.codeUnits) || chunk.codeUnits < 1 || chunk.codeUnits > PART_CHARS
      || !Number.isInteger(chunk.bytes) || chunk.bytes < 1 || !SHA256.test(chunk.sha256) || chunk.splitSurrogateAtEnd) invalid();
    expectedSelectedBytes += chunk.bytes;
    expectedPartBytes.set(`${name}\u0000${part}`, chunk.bytes);
  }
  if (expectedSelectedBytes > MAX_SOURCE_BYTES) {
    throw new McpDataError("data_unavailable", `This exact postflop source selection exceeds the ${MAX_SOURCE_BYTES}-byte read limit.`);
  }

  const expectedValues = datasetNames.map(() => "(?, ?, ?, ?)").join(",");
  const requestedValues = parts.map(() => "(?, ?, ?)").join(",");
  const sql = `WITH expected(name, content_hash, bytes, parts) AS (VALUES ${expectedValues}),\n`+
    `requested(name, part, expected_bytes) AS (VALUES ${requestedValues}),\n`+
    `stored_stats AS (SELECT name, COUNT(*) AS stored_parts, SUM(length(CAST(body AS BLOB))) AS stored_bytes `+
    `FROM preflop_dataset_parts WHERE name IN (SELECT name FROM expected) GROUP BY name)\n`+
    `SELECT e.name, e.content_hash AS expected_hash, e.bytes AS expected_bytes, e.parts AS expected_parts, `+
    `d.content_hash AS actual_hash, d.bytes AS actual_dataset_bytes, d.parts AS actual_dataset_parts, `+
    `s.stored_parts, s.stored_bytes, r.part AS requested_part, r.expected_bytes AS expected_part_bytes, `+
    `p.part AS actual_part, length(CAST(p.body AS BLOB)) AS actual_part_bytes, `+
    `CASE WHEN d.content_hash = e.content_hash AND d.bytes = e.bytes AND d.parts = e.parts `+
    `AND s.stored_parts = e.parts AND s.stored_bytes = e.bytes AND p.part = r.part `+
    `AND length(CAST(p.body AS BLOB)) = r.expected_bytes THEN p.body ELSE NULL END AS body `+
    `FROM expected e JOIN requested r ON r.name = e.name `+
    `LEFT JOIN preflop_datasets d ON d.name = e.name `+
    `LEFT JOIN stored_stats s ON s.name = e.name `+
    `LEFT JOIN preflop_dataset_parts p ON p.name = e.name AND p.part = r.part `+
    `ORDER BY e.name, r.part`;
  const args: unknown[] = [];
  for (const name of datasetNames) {
    const dataset = indexedDataset(name)!;
    args.push(name, dataset.contentHash, dataset.bytes, dataset.parts);
  }
  for (const part of parts) args.push(part.name, part.part, expectedPartBytes.get(`${part.name}\u0000${part.part}`));
  const rows = await query<SnapshotRow>(db, sql, ...args);
  if (rows.length !== parts.length) invalid();
  if (rows.every(row => row.actual_hash === null)) {
    throw new McpDataError("not_found", "A published postflop source dataset is missing; no estimate was substituted.");
  }

  const chunkBodies = new Map<string, string>();
  const seenParts = new Set<string>();
  let actualSelectedBytes = 0;
  for (const row of rows) {
    const dataset = indexedDataset(row.name);
    const expected = dataset && selections[row.name]?.length ? dataset : null;
    if (!expected || row.expected_hash !== expected.contentHash || row.expected_bytes !== expected.bytes || row.expected_parts !== expected.parts) invalid();
    if (row.actual_hash !== expected.contentHash || row.actual_dataset_bytes !== expected.bytes || row.actual_dataset_parts !== expected.parts) {
      throw new McpDataError("data_unavailable", "A published postflop source dataset has changed; this exact MCP reader is pinned to another release.");
    }
    if (row.stored_parts !== expected.parts || row.stored_bytes !== expected.bytes) {
      throw new McpDataError("data_unavailable", "A published postflop source dataset is incomplete; no estimate was substituted.");
    }
    if (!Number.isInteger(row.requested_part) || row.actual_part !== row.requested_part) invalid();
    const chunk = expected.chunks[String(row.requested_part)];
    if (!chunk || row.expected_part_bytes !== chunk.bytes || row.actual_part_bytes !== chunk.bytes || typeof row.body !== "string") invalid();
    const key = `${row.name}\u0000${row.requested_part}`;
    if (seenParts.has(key)) invalid();
    seenParts.add(key);
    if (!chunk || row.body.length !== chunk.codeUnits || row.body.length > PART_CHARS || encoder.encode(row.body).length !== chunk.bytes
      || await sha256(row.body) !== chunk.sha256) invalid();
    actualSelectedBytes += chunk.bytes;
    chunkBodies.set(key, row.body);
  }
  if (seenParts.size !== parts.length || actualSelectedBytes > MAX_SOURCE_BYTES) {
    throw new McpDataError("data_unavailable", `This exact postflop source selection exceeds the ${MAX_SOURCE_BYTES}-byte read limit.`);
  }

  const output: Record<string, SavedSourceDataset> = {};
  for (const name of datasetNames) output[name] = { contentHash: indexedDataset(name)!.contentHash, spots: [] };
  for (const { name, id, index } of requestedRows) {
    let text = "";
    let nextOffset = index.start;
    for (const segment of index.parts) {
      const dataset = indexedDataset(name)!;
      const partStart = segment.part * PART_CHARS;
      const expectedFrom = Math.max(0, index.start - partStart);
      const expectedTo = Math.min(PART_CHARS, index.end - partStart);
      if (segment.from !== expectedFrom || segment.to !== expectedTo || partStart + segment.from !== nextOffset) invalid();
      const body = chunkBodies.get(`${name}\u0000${segment.part}`);
      if (body === undefined || segment.to > body.length) invalid();
      text += body.slice(segment.from, segment.to);
      nextOffset += segment.to - segment.from;
      if (dataset.chunks[String(segment.part)]?.splitSurrogateAtEnd) invalid();
    }
    if (nextOffset !== index.end || text.length !== index.codeUnits || encoder.encode(text).length !== index.bytes
      || await sha256(text) !== index.sha256) invalid();
    let value: unknown;
    try { value = JSON.parse(text); } catch { return invalid(); }
    if (!object(value) || value.id !== id || !Array.isArray(value.hands) || value.hands.length !== 169) invalid();
    output[name].spots.push(value);
  }
  return output;
}
