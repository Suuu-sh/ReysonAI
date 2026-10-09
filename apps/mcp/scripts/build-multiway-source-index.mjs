#!/usr/bin/env node
// Rebuild the bounded MCP row/part index from the reviewed published source files.
// Restore the reviewed Stage 2 archive before running this script; it never writes
// strategy data or a database and emits only hashes, spans, and source identifiers.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describeSourcePart } from "./multiway-source-index-utils.mjs";

const PART_CHARS = 30_000;
const DESCRIPTOR_PATH = "apps/frontend/scripts/data/hu-after-multiway-spots.json";
const OUTPUT_PATH = "apps/mcp/src/multiway-source-index.json";
const PINNED_DATASETS = {
  "opening-ranges": { contentHash: "9f172583e5ef281655d3bbb9fc264de9b052c0fe82501f75d3f7edf765932b0f", bytes: 52_886, parts: 2 },
  "preflop-ranges": { contentHash: "f61186b52005f184872df0d6f4a3ccf4c96b0e91180f9b0b4da4183a448fb114", bytes: 191_955, parts: 7 },
  "multiway-responses": { contentHash: "46014bf93140ea3cfd81e2651b56badf6a7f6ef1f785766be9768f94dfe5981d", bytes: 241_196, parts: 9 },
  "squeeze-responses": { contentHash: "9207dce4f11e0c4f885ee6d740c93005114021f09a7720d1a662b30bb7dc9f0e", bytes: 745_761, parts: 25 },
  "cold-three-bet-responses": { contentHash: "a947c12d276fa2c9c769f9fe71434db73538d55a316292fb0bd1d62a06184b74", bytes: 248_985, parts: 9 },
  "cold-four-bet-responses": { contentHash: "7611329b3ebc338d97be4cba500bf62e03ec3d6bb90929834a177c570188abfc", bytes: 475_201, parts: 16 },
  "continuation-responses": { contentHash: "6f6c8b20cb65ab14bdc70dab34b053dbc5a2de67a000ab4424e712d8ca878aab", bytes: 27_736_907, parts: 925 },
};

const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const descriptors = readJson(DESCRIPTOR_PATH).spots;
if (!Array.isArray(descriptors) || descriptors.length !== 40) throw new Error("Expected the 40 published HU-after-multiway descriptors.");

const requiredByDataset = new Map(Object.keys(PINNED_DATASETS).map(name => [name, new Set()]));
const spotSources = {};
for (const spot of descriptors) {
  if (!spot?.reachable || typeof spot.id !== "string" || spotSources[spot.id]) throw new Error("Invalid or duplicate postflop descriptor.");
  const grouped = new Map();
  for (const factors of Object.values(spot.ranges ?? {})) for (const factor of factors ?? []) {
    if (!Array.isArray(factor) || factor.length !== 3 || !requiredByDataset.has(factor[0]) || typeof factor[1] !== "string") {
      throw new Error(`${spot.id}: unsupported source factor.`);
    }
    requiredByDataset.get(factor[0]).add(factor[1]);
    const ids = grouped.get(factor[0]) ?? new Set();
    ids.add(factor[1]); grouped.set(factor[0], ids);
  }
  spotSources[spot.id] = Object.fromEntries([...grouped].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, ids]) => [name, [...ids].sort()]));
}

const datasets = {};
for (const [name, pinned] of Object.entries(PINNED_DATASETS)) {
  const document = readJson(`apps/frontend/src/estimated/${name}.json`);
  if (!Array.isArray(document.spots)) throw new Error(`${name}: source has no spots array.`);
  const text = JSON.stringify(document);
  const bytes = Buffer.byteLength(text, "utf8");
  const contentHash = sha256(Buffer.from(text, "utf8"));
  const parts = Math.ceil(text.length / PART_CHARS);
  if (contentHash !== pinned.contentHash || bytes !== pinned.bytes || parts !== pinned.parts) {
    throw new Error(`${name}: canonical source no longer matches the reviewed published metadata; stop and review the new release.`);
  }

  const chunkMeta = {};
  const rows = {};
  const uniqueRows = new Map();
  for (const id of [...requiredByDataset.get(name)].sort()) {
    const matches = document.spots.filter(row => row?.id === id);
    if (matches.length !== 1) throw new Error(`${name}/${id}: expected exactly one saved source row.`);
    const rowText = JSON.stringify(matches[0]);
    const start = text.indexOf(rowText);
    if (start < 0 || text.indexOf(rowText, start + 1) >= 0) throw new Error(`${name}/${id}: source row span is not unique.`);
    const end = start + rowText.length;
    const slices = [];
    for (let part = Math.floor(start / PART_CHARS); part <= Math.floor((end - 1) / PART_CHARS); part++) {
      const partStart = part * PART_CHARS;
      const { metadata: meta } = describeSourcePart(text, partStart, PART_CHARS);
      const previous = chunkMeta[String(part)];
      if (previous && JSON.stringify(previous) !== JSON.stringify(meta)) throw new Error(`${name}/${part}: inconsistent part metadata.`);
      chunkMeta[String(part)] = meta;
      slices.push({ part, from: Math.max(0, start - partStart), to: Math.min(PART_CHARS, end - partStart) });
    }
    const row = { start, end, codeUnits: rowText.length, bytes: Buffer.byteLength(rowText, "utf8"), sha256: sha256(Buffer.from(rowText, "utf8")), parts: slices };
    if (uniqueRows.has(id)) throw new Error(`${name}/${id}: duplicate index key.`);
    uniqueRows.set(id, row); rows[id] = row;
  }
  datasets[name] = { ...pinned, chunks: Object.fromEntries(Object.entries(chunkMeta).sort(([a], [b]) => Number(a) - Number(b))), rows };
}

const index = { schemaVersion: 1, partChars: PART_CHARS, datasets, spots: spotSources };
writeFileSync(OUTPUT_PATH, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote ${OUTPUT_PATH}: ${descriptors.length} spots, ${Object.values(datasets).reduce((sum, item) => sum + Object.keys(item.rows).length, 0)} exact source rows.`);
