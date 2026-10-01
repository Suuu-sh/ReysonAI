// Explicit offline authoring only. Never invoked by a view or middleware.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { availableParallelism } from "node:os";
import { loadInputs, boards, root } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { canonicalFlop, canonicalFlops } from "./flop-isomorphism.mjs";
import { FLOP_BASE_EV_SAMPLES, flopBaseIdentity } from "./flop-base-core.mjs";
import { atomicJson, flopBaseDir, readFreshFlopBase, textHash } from "./flop-base-files.mjs";
import { computeBoardBatch } from "./board-batch.mjs";
import { seedFor, seededRandom } from "../lib/equity.mjs";

export function benchmarkFlops(count = 20) {
  const all = canonicalFlops(), picked = new Map(boards().map(board => {
    const canonical = canonicalFlop(board.cards);
    return [canonical.key, { id: canonical.key, cards: canonical.cards }];
  }));
  const random = seededRandom(seedFor("W2|20-flop-benchmark"));
  while (picked.size < count) { const board = all[Math.floor(random() * all.length)]; picked.set(board.id, board); }
  return [...picked.values()].slice(0, count);
}

export async function generateFlopBase({ spotId = "BTN_open_BB_call", limit, resume = false,
  benchmark = false, measureEv = false, samples = FLOP_BASE_EV_SAMPLES, evScope = "none",
  parallelism = availableParallelism(), outputDir } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("Invalid EV sample count");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("Invalid --limit");
  if (!["none", "representative", "all"].includes(evScope)) throw new Error("Invalid EV scope");
  const inputs = loadInputs(spotId), candidate = loadCandidate(inputs), laterCandidate = loadLaterCandidate(inputs, candidate);
  const identity = flopBaseIdentity(inputs, candidate, laterCandidate, samples);
  // Measurements are retained separately from the product's 1,755-file size budget.
  const directory = outputDir ?? (benchmark ? join(root, ".local/postflop-ai/flop-base-benchmark", inputs.spot.slug,
    `benchmark-${measureEv ? samples : "strategy"}`) : flopBaseDir(inputs.spot));
  mkdirSync(directory, { recursive: true });
  const manifestPath = join(directory, "manifest.json");
  let previous = null;
  if (resume && existsSync(manifestPath)) {
    try { previous = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* interrupted old manifest is ignored */ }
  }
  const freshManifest = previous && JSON.stringify(previous.metadata) === JSON.stringify(identity);
  const manifest = { kind: "ai_estimate_not_gto", mode: "balanced", spot: spotId, canonical_classes: 1755,
    metadata: identity, compression: "brotli-json-q9", ev_scope: evScope, created_at: freshManifest ? previous.created_at : new Date().toISOString(),
    entries: freshManifest ? previous.entries : {}, runs: freshManifest ? previous.runs ?? [] : [] };
  const selected = (benchmark ? benchmarkFlops(limit ?? 20) : canonicalFlops().slice(0, limit));
  const representatives = new Set(boards().map(board => canonicalFlop(board.cards).key));
  const evBoards = selected.filter(board => evScope === "all" || evScope === "representative" && representatives.has(board.id)).map(board => board.id);
  const work = selected.filter(board => {
    const item = resume ? readFreshFlopBase(inputs.spot, board.id, inputs, candidate, laterCandidate, samples, directory) : null;
    if (!item || (measureEv || evBoards.includes(board.id)) && !item.data.ev) return true;
    const entry = manifest.entries[board.id];
    if (!entry || entry.hash !== textHash(item.text)) return true;
    return false;
  });
  const started = performance.now();
  atomicJson(manifestPath, manifest);
  console.log(`${spotId}: ${selected.length} selected / 1755 classes, ${work.length} to compute, ${Math.min(parallelism, work.length)} workers; EV ${benchmark ? measureEv ? "probe" : "none" : evScope}, ${samples} samples`);
  let completed = selected.length - work.length;
  await computeBoardBatch({ kind: benchmark ? "flop-base-probe" : "flop-base", inputs, policy: candidate.policy,
    laterCandidate, samples, boardList: work, parallelism,
    taskOptions: { candidate, laterCandidate, outputDir: directory, evBoards: benchmark ? [] : evBoards,
      measureEv, uncertainty: measureEv || !benchmark },
    onBoard(key, result) {
      manifest.entries[key] = result;
      completed++;
      // Main process is the single manifest writer; a completed board is resumable immediately.
      atomicJson(manifestPath, manifest);
      if (benchmark || completed % 25 === 0 || completed === selected.length) console.log(`${completed}/${selected.length} ${key} ${(result.compute_ms / 1000).toFixed(2)}s ${(result.stored_bytes / 1000).toFixed(1)}KB stored${result.uncertainty ? ` SE<0.1 ${result.uncertainty.below_01}/${result.uncertainty.classes}, p90=${result.uncertainty.p90_se_bb.toFixed(4)}` : ""}`);
    } });
  const wall = (performance.now() - started) / 1000;
  manifest.runs.push({ started_at: new Date(Date.now() - wall * 1000).toISOString(), wall_seconds: wall, generated: work.length, workers: parallelism });
  const entries = Object.values(manifest.entries);
  manifest.totals = { generated: entries.length, bytes: entries.reduce((sum, row) => sum + row.bytes, 0),
    gzip_bytes: entries.reduce((sum, row) => sum + row.gzip_bytes, 0),
    stored_bytes: entries.reduce((sum, row) => sum + (row.stored_bytes ?? row.gzip_bytes), 0),
    compute_seconds: entries.reduce((sum, row) => sum + row.compute_ms / 1000, 0), ev_boards: entries.filter(row => row.ev).length };
  manifest.complete = !benchmark && canonicalFlops().every(board => manifest.entries[board.id]);
  atomicJson(manifestPath, manifest);
  console.log(JSON.stringify({ directory, wall_seconds: wall, ...manifest.totals }));
  return manifest;
}

async function main(argv) {
  const arg = name => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
  const known = new Set(["--spot", "--limit", "--resume", "--benchmark", "--measure-ev", "--samples", "--ev", "--workers", "--out"]);
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!known.has(option)) throw new Error(`Unknown argument: ${option}`);
    if (!["--resume", "--benchmark", "--measure-ev"].includes(option)) {
      if (!argv[++index] || argv[index].startsWith("--")) throw new Error(`Missing value: ${option}`);
    }
  }
  await generateFlopBase({ spotId: arg("--spot"), limit: arg("--limit") === undefined ? undefined : Number(arg("--limit")),
    resume: argv.includes("--resume"), benchmark: argv.includes("--benchmark"), measureEv: argv.includes("--measure-ev"),
    samples: arg("--samples") === undefined ? FLOP_BASE_EV_SAMPLES : Number(arg("--samples")), evScope: arg("--ev") ?? "none",
    parallelism: arg("--workers") === undefined ? availableParallelism() : Number(arg("--workers")), outputDir: arg("--out") });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
