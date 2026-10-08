import { DEFENCE_VERSION } from "./defence.ts";
import { EVALUATOR_VERSION } from "../lib/equity.ts";
import { hasPostflopDeal } from "./range-support.mjs";
// SQL for the canonical local postflop artifacts in the reysonai D1 database (schema:
// apps/backend/migrations). Spots whose flop policy or report is missing or stale are
// skipped. Run through scripts/publish-d1.mjs.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { artifactPaths, config, loadInputs, readArtifact, root, boards, laterSizingHash } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha as policySha } from "./generate.mjs";
import { generationInputOptions } from "./generation-options.mjs";
import { PROFILE_IDS, POLICY_ROLES } from "./generate-profiles.mjs";
import { profileArtifactKey, resolveFlopCandidate, resolveLaterCandidate } from "./candidate-source.ts";
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

export function buildSql(published, publishedAt = new Date().toISOString(), publicationRevision = randomUUID(), profiles = []) {
  // Missing local artifacts must never erase an unrelated published spot.
  if (!published.length && !profiles.length) return "-- No publishable postflop artifacts; no database changes.\n";
  if (new Set(published.map(item => item.spot.id)).size !== published.length) throw new Error("Duplicate published postflop spot");
  if (new Set(profiles.map(item => `${item.profile}|${item.spot.id}`)).size !== profiles.length) throw new Error("Duplicate published postflop profile/spot");
  const lines = ["-- spot-scoped postflop upsert; preserves every unmentioned spot and profile."];
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
  const profileHashes = {};
  for (const { profile, spot, flop, later } of profiles) {
    lines.push(`DELETE FROM postflop_profile_policies WHERE profile = ${quote(profile)} AND spot_id = ${quote(spot.id)};`);
    profileHashes[profile] ??= {};
    const roles = profileHashes[profile][spot.id] = {};
    for (const role of POLICY_ROLES) {
      roles[role] = {};
      for (const [stage, candidate] of [["flop", flop[role]], ["later", later[role]]]) {
        const label = `${profile}/${spot.id}/${role}/${stage}`;
        roles[role][stage] = { policy: candidate.metadata.policy_hash, metadata: sha(JSON.stringify(candidate.metadata)) };
        lines.push(`INSERT INTO postflop_profile_policies (profile, spot_id, role, stage, metadata_json, policy_json, published_at) VALUES (${quote(profile)}, ${quote(spot.id)}, ${quote(role)}, ${quote(stage)}, ${jsonValue(candidate.metadata, `${label} metadata`)}, ${jsonValue(candidate.policy, `${label} policy`)}, ${quote(publishedAt)});`);
      }
    }
  }
  // A partial publication gets a new revision even for A -> B -> A. Hashing
  // only the touched content would revive a stale cache for untouched rows.
  lines.push("DELETE FROM dataset_versions WHERE name = 'postflop';");
  lines.push(`INSERT INTO dataset_versions (name, content_hash, published_at, detail_json) VALUES ('postflop', ${quote(sha(JSON.stringify({ publicationRevision, publishedAt, hashes, profiles: profileHashes })))}, ${quote(publishedAt)}, ${jsonValue({ mode: "spot-upsert", publication_revision: publicationRevision, touched_spots: hashes, profilePolicies: profiles.length * 4 }, "dataset detail")});`);
  if (profiles.length) {
    const profileDetail = { kind: "ai_estimate_not_gto", mode: "profile-spot-upsert", publication_revision: publicationRevision,
      touched_profiles: Object.fromEntries(PROFILE_IDS.map(profile => [profile, {
        spots: Object.keys(profileHashes[profile] ?? {}).length,
        policies: Object.keys(profileHashes[profile] ?? {}).length * 4,
      }])), policies: profiles.length * 4 };
    lines.push("DELETE FROM dataset_versions WHERE name = 'postflop-profiles';");
    lines.push(`INSERT INTO dataset_versions (name, content_hash, published_at, detail_json) VALUES ('postflop-profiles', ${quote(sha(JSON.stringify({ publicationRevision, publishedAt, profiles: profileHashes })))}, ${quote(publishedAt)}, ${jsonValue(profileDetail, "profile dataset detail")});`);
  }
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

// Each generated profile/spot is an indivisible four-file delivery unit. Fully
// absent HU-after-multiway units are still preparing; any present partial/stale
// unit is a hard failure before producing spot/profile-scoped delivery SQL.
export function publishableProfiles(log = console.log, { requireAll = false, spots = POSTFLOP_SPOTS,
  read = readArtifact, inputsFor = loadInputs, hasArtifact } = {}) {
  const published = [];
  if (read === readArtifact) for (const profile of PROFILE_IDS) {
    const expected = new Set(spots.flatMap(spot => POLICY_ROLES.flatMap(role => ["candidate", "laterCandidate"].map(kind =>
      `${profileArtifactKey(spot, kind, profile, role).split("/").at(-1)}.json`))));
    for (const base of ["scripts/data/postflop-ai/profiles", ".local/postflop-ai/profiles"]) {
      const directory = join(root, base, profile);
      if (!existsSync(directory)) continue;
      for (const name of readdirSync(directory)) if (name.endsWith(".json") && !expected.has(name)) {
        throw new Error(`${profile}/${name}: unknown generated profile artifact`);
      }
    }
  }
  for (const profile of PROFILE_IDS) for (const spot of spots) {
    const flop = {}, later = {};
    try {
      let present = 0;
      for (const role of POLICY_ROLES) for (const [kind, pair] of [["candidate", flop], ["laterCandidate", later]]) {
        pair[role] = read(spot, kind, { profile, role });
        // JSON null/false is an invalid present file, not an ungenerated unit.
        const onDisk = hasArtifact ? hasArtifact(spot, kind, { profile, role }) : read === readArtifact &&
          (existsSync(artifactPaths(spot, { profile, role })[kind]) ||
            existsSync(join(root, ".local/postflop-ai", `${profileArtifactKey(spot, kind, profile, role)}.json`)));
        if (onDisk || pair[role] !== null && pair[role] !== undefined) present++;
      }
      if (!present && "history" in spot) { log(`skip ${profile}/${spot.id}: profile policy is not generated`); continue; }
      if (present && present !== 4) throw new Error(`Incomplete generated profile policy: ${present}/4 files`);
      let inputs;
      // A pair generated for a non-default seat (e.g. SB) records it; earlier pairs use the default.
      const seats = new Set(POLICY_ROLES.flatMap(role => [flop[role], later[role]]).map(item => item?.metadata?.opponent_seat).filter(Boolean));
      if (seats.size > 1) throw new Error("Profile policy pair mixes opponent seats");
      try { inputs = inputsFor(spot.id, generationInputOptions(spot.id, profile, [...seats][0])); }
      catch (error) {
        if (!present && /unreachable after range adjustment/.test(error.message)) {
          log(`skip ${profile}/${spot.id}: unreachable adjusted history`); continue;
        }
        throw error;
      }
      if (!present && !requireAll) { log(`skip ${profile}/${spot.id}: profile policy is not generated`); continue; }
      if (present !== 4) throw new Error(`Incomplete generated profile policy: ${present}/4 files`);
      for (const role of POLICY_ROLES) for (const [stage, candidate] of [["flop", flop[role]], ["later", later[role]]]) {
        const metadata = candidate?.metadata;
        if (metadata?.profile !== profile || metadata?.role !== role || metadata?.spot !== spot.id ||
            metadata?.structure_hash !== inputs.structure_hash || metadata?.config_version !== config.version ||
            candidate?.profileCandidates || metadata?.kind !== "ai_estimate_not_gto" ||
            (stage === "flop" ? metadata?.tree !== spot.tree : metadata?.tree !== undefined && metadata.tree !== spot.tree)) {
          throw new Error(`Profile policy identity mismatch: ${stage}/${role}`);
        }
      }
      const resolved = resolveFlopCandidate(inputs, flop);
      resolveLaterCandidate(inputs, later, resolved);
      published.push({ profile, spot, flop, later });
      log(`publish ${profile}/${spot.id}: villain+exploit flop+later`);
    } catch (error) { throw new Error(`${profile}/${spot.id} is not publishable: ${error.message}`, { cause: error }); }
  }
  return published;
}
