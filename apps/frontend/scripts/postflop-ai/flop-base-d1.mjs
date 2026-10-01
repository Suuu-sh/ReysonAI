// Fresh balanced bases as ordered D1 JSON TEXT parts, under a 90KB SQL statement budget.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { POSTFLOP_SPOTS, DEFAULT_SPOT_ID } from "./spots.mjs";
import { isCanonicalFlopKey } from "./flop-isomorphism.mjs";
import { loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { FLOP_BASE_EV_SAMPLES, flopBaseIdentity } from "./flop-base-core.mjs";
import { flopBaseDir, readFreshFlopBase, textHash } from "./flop-base-files.mjs";
import { MAX_VALUE_BYTES, quote } from "./publish-d1.mjs";

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
      yield { spot: spot.id, flop: key, text: file.text, hash: entry.hash };
    }
  }
}

export function flopBaseTextParts(text, maximum = MAX_VALUE_BYTES - 1000) {
  const parts = [];
  let start = 0, bytes = 0, index = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character) + (character === "'" ? 1 : 0);
    if (bytes + size > maximum) { parts.push(text.slice(start, index)); start = index; bytes = 0; }
    bytes += size; index += character.length;
  }
  if (index > start) parts.push(text.slice(start));
  return parts;
}
export function* flopBaseSqlLines(entries, publishedAt = new Date().toISOString()) {
  yield "-- Fresh precomputed balanced flop bases, split under 90KB per statement.\n";
  yield "DELETE FROM postflop_flop_base;\n";
  const counts = {}, hashes = [];
  for (const entry of entries) {
    const parts = flopBaseTextParts(entry.text);
    for (const [part, body] of parts.entries()) {
      const statement = `INSERT INTO postflop_flop_base (spot_id, flop_key, part, parts, content_hash, body) VALUES (${quote(entry.spot)}, ${quote(entry.flop)}, ${part}, ${parts.length}, ${quote(entry.hash)}, ${quote(body)});\n`;
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
    const file = readFreshFlopBase(inputs.spot, key, inputs, candidate, laterCandidate, FLOP_BASE_EV_SAMPLES);
    return file ? { status: 200, text: file.text } : { status: 404, body: { error: "No fresh stored flop base" } };
  } catch (error) { return { status: 404, body: { error: error.message } }; }
}
export function flopBaseMiddleware(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/local-postflop-flop") return next();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.writeHead(405).end(JSON.stringify({ error: "Read-only" }));
  const host = req.headers.host?.split(":")[0];
  if (!["localhost", "127.0.0.1"].includes(host)) return res.writeHead(403).end(JSON.stringify({ error: "Local-only" }));
  const result = flopBaseResponse(url.searchParams);
  res.writeHead(result.status).end(result.text ?? JSON.stringify(result.body));
}
