// Explicit offline authoring only. Never invoked by a view or middleware.
// The base stores strategies and explanation facts only; postflop EV is not part of the product
// (decision 2026-10-01), so the former --ev / --samples / --measure-ev / --benchmark options are unsupported.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { availableParallelism } from "node:os";
import { loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { canonicalFlops } from "./flop-isomorphism.ts";
import { flopBaseIdentity } from "./flop-base-core.ts";
import { atomicJson, flopBaseDir, readFreshFlopBase, textHash } from "./flop-base-files.mjs";
import { computeBoardBatch } from "./board-batch.mjs";

export async function generateFlopBase({ spotId = "BTN_open_BB_call", limit, resume = false,
  parallelism = availableParallelism(), outputDir } = {}) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("Invalid --limit");
  const inputs = loadInputs(spotId), candidate = loadCandidate(inputs), laterCandidate = loadLaterCandidate(inputs, candidate);
  const identity = flopBaseIdentity(inputs, candidate, laterCandidate);
  const directory = outputDir ?? flopBaseDir(inputs.spot);
  mkdirSync(directory, { recursive: true });
  const manifestPath = join(directory, "manifest.json");
  let previous = null;
  if (resume && existsSync(manifestPath)) {
    try { previous = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* interrupted old manifest is ignored */ }
  }
  const freshManifest = previous && JSON.stringify(previous.metadata) === JSON.stringify(identity);
  const manifest = { kind: "ai_estimate_not_gto", mode: "balanced", spot: spotId, canonical_classes: 1755,
    metadata: identity, compression: "brotli-json-q9", created_at: freshManifest ? previous.created_at : new Date().toISOString(),
    entries: freshManifest ? previous.entries : {}, runs: freshManifest ? previous.runs ?? [] : [] };
  const selected = canonicalFlops().slice(0, limit);
  const work = selected.filter(board => {
    const item = resume ? readFreshFlopBase(inputs.spot, board.id, inputs, candidate, laterCandidate, directory) : null;
    if (!item) return true;
    const entry = manifest.entries[board.id];
    return !entry || entry.hash !== textHash(item.text);
  });
  const started = performance.now();
  atomicJson(manifestPath, manifest);
  console.log(`${spotId}: ${selected.length} selected / 1755 classes, ${work.length} to compute, ${Math.min(parallelism, work.length)} workers`);
  let completed = selected.length - work.length;
  await computeBoardBatch({ kind: "flop-base", inputs, policy: candidate.policy, laterCandidate, samples: 1,
    boardList: work, parallelism, taskOptions: { candidate, laterCandidate, outputDir: directory },
    onBoard(key, result) {
      manifest.entries[key] = result;
      completed++;
      // Main process is the single manifest writer; a completed board is resumable immediately.
      atomicJson(manifestPath, manifest);
      if (completed % 25 === 0 || completed === selected.length) console.log(`${completed}/${selected.length} ${key} ${(result.compute_ms / 1000).toFixed(2)}s ${(result.stored_bytes / 1000).toFixed(1)}KB stored`);
    } });
  const wall = (performance.now() - started) / 1000;
  manifest.runs.push({ started_at: new Date(Date.now() - wall * 1000).toISOString(), wall_seconds: wall, generated: work.length, workers: parallelism });
  const entries = Object.values(manifest.entries);
  manifest.totals = { generated: entries.length, bytes: entries.reduce((sum, row) => sum + row.bytes, 0),
    gzip_bytes: entries.reduce((sum, row) => sum + row.gzip_bytes, 0),
    stored_bytes: entries.reduce((sum, row) => sum + (row.stored_bytes ?? row.gzip_bytes), 0),
    compute_seconds: entries.reduce((sum, row) => sum + row.compute_ms / 1000, 0) };
  manifest.complete = canonicalFlops().every(board => manifest.entries[board.id]);
  atomicJson(manifestPath, manifest);
  console.log(JSON.stringify({ directory, wall_seconds: wall, ...manifest.totals }));
  return manifest;
}

async function main(argv) {
  const arg = name => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
  const known = new Set(["--spot", "--limit", "--resume", "--workers", "--out"]);
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!known.has(option)) throw new Error(`Unsupported argument (postflop EV is not stored): ${option}`);
    if (option !== "--resume" && (!argv[++index] || argv[index].startsWith("--"))) throw new Error(`Missing value: ${option}`);
  }
  await generateFlopBase({ spotId: arg("--spot"), limit: arg("--limit") === undefined ? undefined : Number(arg("--limit")),
    resume: argv.includes("--resume"),
    parallelism: arg("--workers") === undefined ? availableParallelism() : Number(arg("--workers")), outputDir: arg("--out") });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
