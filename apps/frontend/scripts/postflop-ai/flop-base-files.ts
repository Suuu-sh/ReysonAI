// Node-only artifact I/O. Per-flop atomic rename + an atomically replaced manifest makes a
// killed job resumable; workers write different keys, the main process owns the manifest.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { createHash } from "node:crypto";
import { root } from "./inputs.ts";
import { isFreshFlopBase } from "./flop-base-core.ts";
export const flopBaseDir = (spot: any) : any => join(root, ".local/postflop-ai/flop-base", spot.slug);
export const textHash = (text: any) : any => createHash("sha256").update(text).digest("hex");
export function atomicJson(path?: any, data?: any) : any {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(data));
  renameSync(temporary, path);
}
export function writeFlopBaseFile(data?: any, directory?: any, computeMs?: any) : any {
  mkdirSync(directory, { recursive: true });
  const text = JSON.stringify(data);
  const gzip = gzipSync(text, { level: 9 });
  const compressed = brotliCompressSync(text, { params: {
    [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
  } });
  const path = join(directory, `${data.flop}.json.br`), temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, compressed); renameSync(temporary, path);
  // Earlier W2 probes used plain JSON. Remove only this generator's superseded file,
  // after its atomic replacement exists; never remove policies or other artifacts.
  for (const suffix of [".json", ".json.gz"]) {
    const old = join(directory, `${data.flop}${suffix}`);
    if (!existsSync(old)) continue;
    try {
      const previous = suffix === ".json.gz" ? gunzipSync(readFileSync(old)).toString("utf8") : readFileSync(old, "utf8");
      if (JSON.parse(previous).mode === "balanced") unlinkSync(old);
    } catch { /* not a W2 JSON: leave untouched */ }
  }
  return { flop: data.flop, bytes: Buffer.byteLength(text), gzip_bytes: gzip.length, stored_bytes: compressed.length,
    hash: textHash(text), compute_ms: computeMs };
}
export function readFreshFlopBase(spot?: any, key?: any, inputs?: any, candidate?: any, laterCandidate?: any, directory: any = flopBaseDir(spot)) : any {
  if (!/^(?:[2-9TJQKA][cdhs]){3}$/.test(key)) return null;
  const brotli = join(directory, `${key}.json.br`), gzip = join(directory, `${key}.json.gz`);
  const path = existsSync(brotli) ? brotli : existsSync(gzip) ? gzip : join(directory, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const text = path === brotli ? brotliDecompressSync(readFileSync(path)).toString("utf8")
      : path === gzip ? gunzipSync(readFileSync(path)).toString("utf8") : readFileSync(path, "utf8"), data = JSON.parse(text);
    return data.flop === key && isFreshFlopBase(data, inputs, candidate, laterCandidate) ? { text, data } : null;
  } catch { return null; }
}
