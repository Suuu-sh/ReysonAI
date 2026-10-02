// Fresh balanced bases stored as ordered D1 BLOB parts holding the Brotli bytes of the JSON
// (the same bytes as the .json.br files), each INSERT statement under a 90KB SQL budget.
import { existsSync, readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { join } from "node:path";
import { POSTFLOP_SPOTS, DEFAULT_SPOT_ID } from "./spots.mjs";
import { isCanonicalFlopKey } from "./flop-isomorphism.mjs";
import { loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { flopBaseIdentity } from "./flop-base-core.mjs";
import { flopBaseDir, readFreshFlopBase, textHash } from "./flop-base-files.mjs";
import { MAX_VALUE_BYTES, quote } from "./publish-d1.mjs";

// The on-disk .json.br bytes when present (readFreshFlopBase prefers them), else compress the text.
function storedBytes(spot, key, text) {
  const path = join(flopBaseDir(spot), `${key}.json.br`);
  return existsSync(path) ? readFileSync(path) : brotliText(text);
}
export function* publishableFlopBases(log = console.log, { spotId } = {}) {
  for (const spot of POSTFLOP_SPOTS.filter(spot => !spotId || spot.id === spotId)) {
    const directory = flopBaseDir(spot), path = join(directory, "manifest.json");
    if (!existsSync(path)) continue;
    let inputs, candidate, laterCandidate, manifest;
    try {
      inputs = loadInputs(spot.id); candidate = loadCandidate(inputs); laterCandidate = loadLaterCandidate(inputs, candidate);
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) { log(`skip flop-base ${spot.id}: ${error.message}`); continue; }
    if (manifest.spot !== spot.id || JSON.stringify(manifest.metadata) !== JSON.stringify(flopBaseIdentity(inputs, candidate, laterCandidate))) {
      log(`skip flop-base ${spot.id}: stale manifest`); continue;
    }
    for (const [key, entry] of Object.entries(manifest.entries).sort(([a], [b]) => a.localeCompare(b))) {
      const file = readFreshFlopBase(spot, key, inputs, candidate, laterCandidate);
      if (!file || entry.hash !== textHash(file.text)) { log(`skip flop-base ${spot.id}/${key}: missing, corrupt or stale`); continue; }
      yield { spot: spot.id, flop: key, text: file.text, hash: entry.hash, compressed: storedBytes(spot, key, file.text) };
    }
  }
}

// Hex literals cost two SQL characters per byte, so a part holds (budget - statement overhead) / 2 bytes.
export function flopBaseBytesParts(bytes, maximum = Math.floor((MAX_VALUE_BYTES - 1000) / 2)) {
  const parts = [];
  for (let start = 0; start < bytes.length; start += maximum) parts.push(bytes.subarray(start, start + maximum));
  return parts.length ? parts : [bytes];
}
export const brotliText = text => brotliCompressSync(text, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } });
export function* flopBaseSqlLines(entries, publishedAt = new Date().toISOString()) {
  yield "-- Fresh precomputed balanced flop bases: Brotli bytes as BLOB parts, under 90KB per statement.\n";
  yield "DELETE FROM postflop_flop_base_br;\n";
  const counts = {}, hashes = [];
  for (const entry of entries) {
    const parts = flopBaseBytesParts(entry.compressed ?? brotliText(entry.text));
    for (const [part, body] of parts.entries()) {
      const statement = `INSERT INTO postflop_flop_base_br (spot_id, flop_key, part, parts, content_hash, body) VALUES (${quote(entry.spot)}, ${quote(entry.flop)}, ${part}, ${parts.length}, ${quote(entry.hash)}, X'${Buffer.from(body).toString("hex")}');\n`;
      if (Buffer.byteLength(statement) > MAX_VALUE_BYTES) throw new Error("Flop-base statement exceeds 90KB");
      yield statement;
    }
    counts[entry.spot] = (counts[entry.spot] ?? 0) + 1;
    hashes.push(`${entry.spot}/${entry.flop}/${entry.hash}`);
  }
  yield "DELETE FROM dataset_versions WHERE name = 'flop-base';\n";
  yield `INSERT INTO dataset_versions (name, content_hash, published_at, detail_json) VALUES ('flop-base', ${quote(textHash(hashes.join("\n")))}, ${quote(publishedAt)}, ${quote(JSON.stringify({ spots: counts }))});\n`;
}
export const buildFlopBaseSql = (entries, at) => [...flopBaseSqlLines(entries, at)].join("");

export function flopBaseResponse(params) {
  const spotId = params.get("spot") || DEFAULT_SPOT_ID, key = params.get("flop");
  try {
    if (!/^[A-Za-z0-9_]+$/.test(spotId) || !isCanonicalFlopKey(key)) return { status: 400, body: { error: "A spot and canonical flop key are required" } };
    const inputs = loadInputs(spotId), candidate = loadCandidate(inputs), laterCandidate = loadLaterCandidate(inputs, candidate);
    const file = readFreshFlopBase(inputs.spot, key, inputs, candidate, laterCandidate);
    return file ? { status: 200, bytes: storedBytes(inputs.spot, key, file.text), text: file.text } : { status: 404, body: { error: "No fresh stored flop base" } };
  } catch (error) { return { status: 404, body: { error: error.message } }; }
}
export function flopBaseMiddleware(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/local-postflop-flop") return next();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.writeHead(405).end(JSON.stringify({ error: "Read-only" }));
  const host = req.headers.host?.split(":")[0];
  if (!["localhost", "127.0.0.1"].includes(host)) return res.writeHead(403).end(JSON.stringify({ error: "Local-only" }));
  const result = flopBaseResponse(url.searchParams);
  if (result.status !== 200) return res.writeHead(result.status).end(JSON.stringify(result.body));
  // Same bytes and headers as the worker: stored Brotli, or plain JSON for clients without br.
  if (/\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""))) { res.setHeader("Content-Encoding", "br"); res.setHeader("Vary", "Accept-Encoding"); return res.writeHead(200).end(result.bytes); }
  res.setHeader("Vary", "Accept-Encoding");
  res.writeHead(200).end(result.text);
}
