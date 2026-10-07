import { DEFENCE_VERSION } from "./defence.ts";
import { EVALUATOR_VERSION } from "../lib/equity.ts";
import { hasPostflopDeal } from "./range-support.mjs";
// SQL for the canonical local postflop artifacts in the reysonai D1 database (schema:
// apps/backend/migrations). Spots whose flop policy or report is missing or stale are
// skipped. Run through scripts/publish-d1.mjs.
import { createHash, randomUUID } from "node:crypto";
import { loadInputs, readArtifact, config, boards, laterSizingHash } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha as policySha } from "./generate.mjs";
import { SIMULATION_VERSION, PROFILES } from "./simulation.mjs";
import { POSTFLOP_SPOTS } from "./spots.ts";

// D1 rejects SQL statements over 100 KB, so every stored JSON value must stay below this.
export const MAX_VALUE_BYTES = 90_000;
export const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sha = value => createHash("sha256").update(value).digest("hex");

function jsonValue(value, label) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > MAX_VALUE_BYTES) throw new Error(`${label} is ${Buffer.byteLength(text)} bytes, over the ${MAX_VALUE_BYTES}-byte D1 statement budget`);
  return quote(text);
}

// Artifacts of one spot, or null with a reason when it is not publishable.
export function spotArtifacts(spot) {
  if (!spot.reachable) return { skip: "unreachable" };
  let inputs, candidate, laterCandidate;
  try {
    inputs = loadInputs(spot.id);
    candidate = loadCandidate(inputs);
    laterCandidate = loadLaterCandidate(inputs, candidate);
  } catch (error) { return { skip: error.message }; }
  if (spot.history && !laterCandidate) return { skip: "new HU spot requires its own later policy" };
  const report = readArtifact(spot, "report");
  if (!isFreshSimulationReport(inputs, candidate, laterCandidate, report)) return { skip: "report missing, stale or incomplete" };
  // These are the adopted development-v7 policies, not the abandoned v10 experiment.
  // Retain the actual generator attribution; an independent reviewer is not a generator.
  if (spot.history && [candidate, laterCandidate].some(item =>
      item.metadata.model !== "gpt-6.1-sol" || item.metadata.reasoning_effort !== "high")) {
    return { skip: "adopted HU-v7 policies require their recorded Sol/high attribution" };
  }
  return { spot, candidate, laterCandidate, report };
}

// Cheap publication identity gate; full audit/replay remains a separate
// acceptance step. Version identities refer to the adopted development-v7 runtime,
// including its evaluator. The unchanged v7 report schema has no evaluator field:
// do not invent one or accept a v10 execution merely because a spot has history.
const ADOPTED_RUNTIME = Object.freeze({ defence: 7, simulation: 3, evaluator: 2, config: 2 });
const isHash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const hasActionModelMarker = value => value != null && Object.hasOwn(value, "action_model_version");

export function isFreshSimulationReport(inputs, candidate, laterCandidate, report) {
  if (DEFENCE_VERSION !== ADOPTED_RUNTIME.defence || SIMULATION_VERSION !== ADOPTED_RUNTIME.simulation ||
      EVALUATOR_VERSION !== ADOPTED_RUNTIME.evaluator || config.version !== ADOPTED_RUNTIME.config) return false;
  if (!inputs?.spot || !isHash(inputs.fingerprint) || !candidate?.policy || !candidate.metadata ||
      candidate.metadata.kind !== "ai_estimate_not_gto" || candidate.metadata.config_version !== config.version ||
      candidate.metadata.spot !== inputs.spot.id || candidate.metadata.tree !== inputs.spot.tree ||
      candidate.metadata.source_hash !== inputs.fingerprint || !isHash(candidate.metadata.policy_hash) ||
      candidate.metadata.policy_hash !== policySha(candidate.policy) || hasActionModelMarker(candidate.metadata)) return false;
  if (inputs.spot.history && !laterCandidate) return false;
  if (laterCandidate && (!laterCandidate.policy || !laterCandidate.metadata ||
      laterCandidate.metadata.kind !== "ai_estimate_not_gto" || laterCandidate.metadata.config_version !== config.version ||
      laterCandidate.metadata.spot !== inputs.spot.id || laterCandidate.metadata.source_hash !== inputs.fingerprint ||
      laterCandidate.metadata.flop_policy_hash !== candidate.metadata.policy_hash || !isHash(laterCandidate.metadata.policy_hash) ||
      laterCandidate.metadata.policy_hash !== policySha(laterCandidate.policy) || hasActionModelMarker(laterCandidate.metadata))) return false;
  if (!report || report.kind !== "ai_estimate_not_gto" || report.version !== 1 || report.spot !== inputs.spot.id ||
      report.policy_hash !== candidate.metadata.policy_hash || report.source_hash !== inputs.fingerprint ||
      report.simulation_version !== SIMULATION_VERSION || hasActionModelMarker(report) || report.defence_version !== DEFENCE_VERSION ||
      (Object.hasOwn(report, "evaluator_version") && report.evaluator_version !== EVALUATOR_VERSION) ||
      report.later_sizing_hash !== laterSizingHash() || report.seed !== config.seed ||
      report.samples_per_board_profile_seat !== config.samples_per_board_profile_seat ||
      (report.later_policy_hash ?? null) !== (laterCandidate?.metadata.policy_hash ?? null)) return false;
  const available = boards().filter(board => !inputs.spot.history || hasPostflopDeal(inputs, board.cards));
  const absent = boards().filter(board => !available.some(item => item.id === board.id)).map(board => board.id);
  if (JSON.stringify(report.unreachable_boards ?? []) !== JSON.stringify(absent)) return false;
  const expected = new Map(available.flatMap(board => PROFILES.flatMap(profile => [inputs.spot.ip, inputs.spot.oop].map(hero =>
    [`${board.id}|${profile}|${hero}`, board.split]))));
  if (!Array.isArray(report.results) || report.results.length !== expected.size) return false;
  for (const row of report.results) {
    if (!row || typeof row !== "object") return false;
    const key = `${row.board}|${row.opponent}|${row.hero}`;
    if (!expected.has(key) || row.split !== expected.get(key)) return false;
    expected.delete(key);
    for (const metric of [row.candidate_ev_bb, row.baseline_ev_bb, row.delta_bb]) {
      if (!Number.isFinite(metric?.mean) || !Array.isArray(metric.ci95) || metric.ci95.length !== 2 ||
          metric.ci95.some(value => !Number.isFinite(value)) || metric.ci95[0] > metric.mean || metric.ci95[1] < metric.mean) return false;
    }
  }
  return expected.size === 0;
}

export function buildSql(published, publishedAt = new Date().toISOString(), publicationRevision = randomUUID()) {
  // Missing local artifacts must never erase an unrelated published spot.
  if (!published.length) return "-- No publishable postflop artifacts; no database changes.\n";
  if (new Set(published.map(item => item.spot.id)).size !== published.length) throw new Error("Duplicate published postflop spot");
  const lines = ["-- spot-scoped postflop upsert; preserves every unmentioned spot."];
  for (const { spot, candidate, laterCandidate, report } of published) {
    const id = quote(spot.id);
    for (const table of ["postflop_policies", "postflop_reports", "postflop_reasons", "postflop_spots"]) {
      lines.push(`DELETE FROM ${table} WHERE spot_id = ${id};`);
    }
    lines.push(`INSERT INTO postflop_spots (spot_id, slug, kind, tree, ip, oop, pot_bb, stack_bb, spot_json) VALUES (${id}, ${quote(spot.slug)}, ${quote(spot.kind)}, ${quote(spot.tree)}, ${quote(spot.ip)}, ${quote(spot.oop)}, ${Number(spot.potBb)}, ${Number(spot.stackBb ?? 100)}, ${jsonValue(spot, `${spot.id} spot`)});`);
    for (const [stage, item] of [["flop", candidate], ["later", laterCandidate]]) {
      if (!item) continue;
      lines.push(`INSERT INTO postflop_policies (spot_id, stage, policy_hash, metadata_json, policy_json) VALUES (${id}, '${stage}', ${quote(item.metadata.policy_hash)}, ${jsonValue(item.metadata, `${spot.id} ${stage} metadata`)}, ${jsonValue(item, `${spot.id} ${stage} policy`)});`);
    }
    lines.push(`INSERT INTO postflop_reports (spot_id, payload_json) VALUES (${id}, ${jsonValue(report, `${spot.id} report`)});`);
  }
  const hashes = Object.fromEntries(published.map(({ spot, candidate, laterCandidate }) =>
    [spot.id, { flop: candidate.metadata.policy_hash, later: laterCandidate?.metadata.policy_hash ?? null }]));
  lines.push("DELETE FROM dataset_versions WHERE name = 'postflop';");
  lines.push(`INSERT INTO dataset_versions (name, content_hash, published_at, detail_json) VALUES ('postflop', ${quote(sha(JSON.stringify({ publicationRevision, publishedAt, hashes })))}, ${quote(publishedAt)}, ${jsonValue({ mode: "spot-upsert", publication_revision: publicationRevision, touched_spots: hashes }, "dataset detail")});`);
  return `${lines.join("\n")}\n`;
}

// Every publishable spot, logging what is skipped and why.
// requireAll (CI): every reachable spot must have fresh flop and turn/river policies.
// SQL remains spot-scoped so unmentioned published histories are preserved.
export function publishableSpots(log = console.log, { requireAll = false } = {}) {
  const published = [];
  for (const spot of POSTFLOP_SPOTS) {
    const result = spotArtifacts(spot);
    if (result.skip) {
      if (requireAll && result.skip !== "unreachable") throw new Error(`${spot.id} is not publishable: ${result.skip}`);
      log(`skip ${spot.id}: ${result.skip}`); continue;
    }
    if (requireAll && !result.laterCandidate) throw new Error(`${spot.id} has no turn/river policy`);
    published.push(result);
    log(`publish ${spot.id}${result.laterCandidate ? " +later" : ""}`);
  }
  return published;
}
