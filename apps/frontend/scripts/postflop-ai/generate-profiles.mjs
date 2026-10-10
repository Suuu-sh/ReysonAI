// Explicit offline authoring only. Importing this module never starts a provider.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { generate, generateLater, loadCandidate } from "./generate.mjs";
import { generationInputOptions } from "./generation-options.mjs";
import { artifactPaths, loadInputs, root } from "./inputs.mjs";
import { POSTFLOP_SPOTS } from "./spots.ts";

export const PROFILE_IDS = ["nit", "station", "lag", "maniac"];
export const POLICY_ROLES = ["villain", "exploit"];
export const GENERATION_REPORT_PATH = join(root, ".local/postflop-ai/profiles/generation-report.json");
const USAGE = "Usage: generate-profiles [--profiles nit,station,lag,maniac] [--roles villain,exploit] [--spots all|id,...] [--stage flop|later|both] [--concurrency N] [--model M] [--effort E] [--force] [--opponent-seat ip|oop]";
const FLAGS = ["profiles", "roles", "spots", "stage", "concurrency", "model", "effort", "force", "opponentSeat"];

function list(value, defaults, name) {
  const values = value === undefined ? [...defaults] : typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(values) || !values.length || values.some(item => typeof item !== "string" || !item) || new Set(values).size !== values.length) {
    throw new Error(`Invalid ${name}: use a nonempty comma-separated list without duplicates`);
  }
  return values;
}

/** Validation happens before loading inputs, candidates, or invoking any provider. */
export function normalizeBatchOptions(options = {}, catalog = POSTFLOP_SPOTS) {
  for (const key of Object.keys(options)) if (!FLAGS.includes(key)) throw new Error(`Unknown option: ${key}`);
  const profiles = list(options.profiles, PROFILE_IDS, "profiles");
  if (profiles.some(profile => !PROFILE_IDS.includes(profile))) throw new Error("Invalid profiles: expected nit, station, lag or maniac");
  const roles = list(options.roles, POLICY_ROLES, "roles");
  if (roles.some(role => !POLICY_ROLES.includes(role))) throw new Error("Invalid roles: expected villain or exploit");
  const spots = options.spots === undefined || options.spots === "all" ? catalog.map(spot => spot.id) : list(options.spots, [], "spots");
  if (!spots.length || spots.some(id => !catalog.some(spot => spot.id === id))) throw new Error("Invalid spots: select registered postflop spot IDs or all");
  const stage = options.stage ?? "both";
  if (!["flop", "later", "both"].includes(stage)) throw new Error("Invalid stage: expected flop, later or both");
  const concurrencyValue = options.concurrency ?? 4;
  if (typeof concurrencyValue !== "number" && (typeof concurrencyValue !== "string" || !/^[1-9][0-9]*$/.test(concurrencyValue))) throw new Error("Invalid concurrency: expected a positive integer");
  const concurrency = Number(concurrencyValue);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("Invalid concurrency: expected a positive integer");
  if (options.model !== undefined && (typeof options.model !== "string" || !/^[a-z0-9][a-z0-9.-]*$/.test(options.model))) throw new Error("Invalid model");
  if (options.effort !== undefined && !["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(options.effort)) throw new Error("Invalid effort");
  if (options.opponentSeat !== undefined && !["ip", "oop"].includes(options.opponentSeat)) throw new Error("Invalid opponent seat: expected ip or oop");
  if (options.force !== undefined && typeof options.force !== "boolean") throw new Error("Invalid force: expected a boolean");
  return { profiles, roles, spots, stage, concurrency, force: options.force ?? false,
    ...(options.model === undefined ? {} : { model: options.model }), ...(options.effort === undefined ? {} : { effort: options.effort }),
    ...(options.opponentSeat === undefined ? {} : { opponentSeat: options.opponentSeat }) };
}

export function parseBatchArgs(args, catalog = POSTFLOP_SPOTS) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const key = flag === "--opponent-seat" ? "opponentSeat" : flag.startsWith("--") ? flag.slice(2) : "";
    if (!FLAGS.includes(key) || Object.hasOwn(options, key)) throw new Error(USAGE);
    if (key === "force") { options.force = true; continue; }
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(USAGE);
    options[key] = value;
  }
  return normalizeBatchOptions(options, catalog);
}

async function boundedMap(jobs, concurrency, work) {
  const results = new Array(jobs.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      results[index] = await work(jobs[index]);
    }
  }));
  return results;
}

function assertReachable(inputs) {
  // Do not use spot.reachable: SB flats can become reachable with profile ranges.
  for (const seat of [inputs.spot.ip, inputs.spot.oop]) {
    const rows = inputs.seatRows?.[seat];
    if (!Array.isArray(rows) || !rows.length || rows.some(row => !Number.isFinite(row.freq) || row.freq < 0 || row.freq > 100)) throw new Error(`${inputs.spot.id}: malformed ${seat} range`);
    if (!rows.some(row => row.freq > 0)) throw new Error(`${inputs.spot.id}: ${seat} saved history is unreachable after range adjustment`);
  }
}
const unreachable = error => /saved history is unreachable after range adjustment$/.test(error?.message ?? "");
const reason = error => error instanceof Error ? error.message : String(error);
function saveReport(report, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

/** Inject loaders/provider wrappers/report sink for tests; no standard-range fallback. */
export async function runProfileBatch(rawOptions = {}, dependencies = {}) {
  const deps = { spots: POSTFLOP_SPOTS, loadInputs, generationInputOptions, generate, generateLater, loadCandidate, artifactPaths,
    reportPath: GENERATION_REPORT_PATH, writeReport: saveReport, output: () => {}, now: () => new Date().toISOString(), ...dependencies };
  const options = normalizeBatchOptions(rawOptions, deps.spots);
  const startedAt = deps.now();
  const jobs = options.profiles.flatMap(profile => options.spots.flatMap(spot => options.roles.map(role => ({ profile, spot, role }))));
  const prepared = new Map(), flopResults = new Map(), records = [];
  const key = job => `${job.profile}/${job.spot}/${job.role}`;
  async function inputsFor(job) {
    if (prepared.has(key(job))) return prepared.get(key(job));
    const inputs = await deps.loadInputs(job.spot, deps.generationInputOptions(job.spot, job.profile, options.opponentSeat));
    assertReachable(inputs);
    prepared.set(key(job), inputs);
    return inputs;
  }
  async function execute(job, stage) {
    try {
      const inputs = await inputsFor(job);
      const generation = { profile: job.profile, role: job.role, force: options.force,
        ...(options.model === undefined ? {} : { model: options.model }), ...(options.effort === undefined ? {} : { effort: options.effort }),
        ...(deps.generator === undefined ? {} : { generator: deps.generator }) };
      const result = stage === "flop" ? await deps.generate(inputs, generation)
        : await deps.generateLater(inputs, await deps.loadCandidate(inputs, job.role), generation);
      if (!result?.candidate) throw new Error("Generation did not return a candidate");
      const path = deps.artifactPaths(inputs.spot, { profile: job.profile, role: job.role })[stage === "flop" ? "candidate" : "laterCandidate"];
      return { ...job, stage, status: result.reused ? "skipped" : "success", reason: result.reused ? "existing_candidate_reused" : "generated",
        reused: Boolean(result.reused), path, policy_hash: result.candidate.metadata?.policy_hash ?? null };
    } catch (error) {
      return { ...job, stage, status: unreachable(error) ? "skipped" : "failure", reason: unreachable(error) ? "unreachable_adjusted_history" : reason(error),
        ...(error?.code ? { code: error.code } : {}) };
    }
  }
  if (options.stage !== "later") {
    const phase = await boundedMap(jobs, options.concurrency, job => execute(job, "flop"));
    for (const record of phase) flopResults.set(key(record), record);
    records.push(...phase);
  }
  // Barrier: the entire flop phase settles before the first later job starts.
  if (options.stage !== "flop") {
    records.push(...await boundedMap(jobs, options.concurrency, async job => {
      const flop = flopResults.get(key(job));
      if (flop?.status === "failure") return { ...job, stage: "later", status: "skipped", reason: "flop_dependency_failed", dependency_reason: flop.reason };
      if (flop?.reason === "unreachable_adjusted_history") return { ...job, stage: "later", status: "skipped", reason: flop.reason };
      return execute(job, "later");
    }));
  }
  const successes = records.filter(record => record.status === "success");
  const failures = records.filter(record => record.status === "failure");
  const skips = records.filter(record => record.status === "skipped");
  const report = { version: 1, kind: "profile_policy_generation_not_publication", started_at: startedAt, finished_at: deps.now(), options,
    summary: { total: records.length, successes: successes.length, failures: failures.length, skips: skips.length,
      reused: skips.filter(record => record.reused).length }, successes, failures, skips };
  await deps.writeReport(report, deps.reportPath);
  deps.output(`Profile generation: ${report.summary.successes} generated, ${report.summary.failures} failed, ${report.summary.skips} skipped (${report.summary.reused} reused). Report: ${deps.reportPath}`);
  return report;
}

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseBatchArgs(args, dependencies.spots ?? POSTFLOP_SPOTS);
  const report = await runProfileBatch(options, { output: console.log, ...dependencies });
  return report.summary.failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(reason(error)); process.exitCode = 1; }
}
