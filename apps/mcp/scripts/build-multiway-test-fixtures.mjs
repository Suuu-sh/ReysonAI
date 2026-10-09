#!/usr/bin/env node
// Authoring-only: extract the exact indexed chunks used by the 40 published spots.
// CI reads the hash-pinned compressed fixture and never parses the full source datasets.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import sourceIndex from "../src/multiway-source-index.json" with { type: "json" };
import { buildInputs } from "../../frontend/scripts/postflop-ai/browser-inputs.ts";

const INDEX_PATH = "apps/mcp/src/multiway-source-index.json";
const FIXTURE_PATH = "apps/mcp/tests/fixtures/postflop-multiway-source-chunks.json.gz";
const FINGERPRINT_PATH = "apps/mcp/tests/fixtures/postflop-multiway-fingerprints.json";
const SOURCE_ARCHIVE_SHA256 = "b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const indexDigest = sha256(readFileSync(INDEX_PATH, "utf8").trimEnd());

const selectedParts = new Map();
const selectedIds = new Map();
for (const [spotId, datasets] of Object.entries(sourceIndex.spots)) {
  for (const [name, ids] of Object.entries(datasets)) {
    const idsForDataset = selectedIds.get(name) ?? new Set();
    for (const id of ids) {
      idsForDataset.add(id);
      for (const part of sourceIndex.datasets[name].rows[id].parts) selectedParts.set(`${name}\u0000${part.part}`, { name, part: part.part });
    }
    selectedIds.set(name, idsForDataset);
  }
}

const canonicalTexts = {};
const sourceRows = {};
const fixtureDatasets = {};
for (const [name, ids] of selectedIds) {
  const document = JSON.parse(readFileSync(`apps/frontend/src/estimated/${name}.json`, "utf8"));
  const text = JSON.stringify(document);
  const meta = sourceIndex.datasets[name];
  if (Buffer.byteLength(text, "utf8") !== meta.bytes || Math.ceil(text.length / sourceIndex.partChars) !== meta.parts
    || sha256(Buffer.from(text, "utf8")) !== meta.contentHash) throw new Error(`${name}: source no longer matches the pinned published release.`);
  canonicalTexts[name] = text;
  const rowMap = new Map();
  for (const id of ids) {
    const rowIndex = meta.rows[id];
    const rowText = text.slice(rowIndex.start, rowIndex.end);
    if (rowText.length !== rowIndex.codeUnits || Buffer.byteLength(rowText, "utf8") !== rowIndex.bytes
      || sha256(Buffer.from(rowText, "utf8")) !== rowIndex.sha256) throw new Error(`${name}/${id}: row does not match its pinned index.`);
    const row = JSON.parse(rowText);
    if (row.id !== id || !Array.isArray(row.hands) || row.hands.length !== 169) throw new Error(`${name}/${id}: unexpected selected row.`);
    rowMap.set(id, row);
  }
  sourceRows[name] = rowMap;
  fixtureDatasets[name] = { contentHash: meta.contentHash, parts: {} };
}

for (const { name, part } of [...selectedParts.values()].sort((a, b) => a.name.localeCompare(b.name) || a.part - b.part)) {
  const start = part * sourceIndex.partChars;
  const body = canonicalTexts[name].slice(start, start + sourceIndex.partChars);
  const meta = sourceIndex.datasets[name].chunks[String(part)];
  const bytes = Buffer.from(body, "utf8");
  if (body.length !== meta.codeUnits || bytes.length !== meta.bytes || sha256(bytes) !== meta.sha256
    || meta.splitSurrogateAtEnd) throw new Error(`${name}/${part}: selected fixture part does not match the reviewed index.`);
  fixtureDatasets[name].parts[String(part)] = { body, codeUnits: meta.codeUnits, bytes: meta.bytes, sha256: meta.sha256 };
}

const fingerprints = {};
for (const spotId of Object.keys(sourceIndex.spots).sort()) {
  const sources = Object.fromEntries(Object.entries(sourceIndex.spots[spotId]).map(([name, ids]) => [name,
    { contentHash: sourceIndex.datasets[name].contentHash, spots: ids.map(id => sourceRows[name].get(id)) }]));
  fingerprints[spotId] = buildInputs(spotId, sources).fingerprint;
}

const fixture = { schemaVersion: 1, sourceArchiveSha256: SOURCE_ARCHIVE_SHA256, indexSha256: indexDigest,
  partChars: sourceIndex.partChars, datasets: fixtureDatasets };
const fixtureBytes = gzipSync(Buffer.from(JSON.stringify(fixture)), { level: 9, mtime: 0 });
writeFileSync(FIXTURE_PATH, fixtureBytes);
writeFileSync(FINGERPRINT_PATH, `${JSON.stringify({ schemaVersion: 1, sourceArchiveSha256: SOURCE_ARCHIVE_SHA256,
  indexSha256: indexDigest, fingerprints }, null, 2)}\n`);
console.log(JSON.stringify({
  spots: Object.keys(fingerprints).length,
  exactSourceRows: [...selectedIds.values()].reduce((sum, ids) => sum + ids.size, 0),
  selectedParts: selectedParts.size,
  selectedPartBytes: Object.values(fixtureDatasets).flatMap(dataset => Object.values(dataset.parts)).reduce((sum, part) => sum + part.bytes, 0),
  compressedFixtureBytes: fixtureBytes.length,
  fixtureSha256: sha256(fixtureBytes),
  fingerprintFileSha256: sha256(readFileSync(FINGERPRINT_PATH)),
}, null, 2));
