// npm run postflop-ai:<generate|generate-later|simulate|audit|hand-ev|spots> -- [--spot <id> | --all] [--samples N] [--model M] [--effort E] [--profile P --role villain|exploit] [--opponent-seat ip|oop] [--force]
// Without --spot, the first pilot spot (BTN_open_BB_call) is used. --all runs every reachable
// heads-up spot (single-raised and 3bet pots) in order; a failing spot is logged and skipped, then listed at the end.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { auditExperiment } from "./audit.mjs";
import { generate, generateLater, loadCandidate, loadLaterCandidate, resolveEffort, resolveModel } from "./generate.mjs";
import { generationInputOptions, normalizeGenerationOptions } from "./generation-options.mjs";
import { artifactPaths, config, loadInputs } from "./inputs.mjs";
import { simulateParallel } from "./simulation-parallel.mjs";
import { generateHandEv } from "./hand-ev.mjs";
import { generateLaterHandEv } from "./later-hand-ev.mjs";
import { DEFAULT_SPOT_ID, POSTFLOP_SPOTS, spotById } from "./spots.ts";

const COMMANDS = ["generate", "generate-later", "simulate", "audit", "hand-ev", "later-hand-ev", "spots"];
const USAGE = "Usage: postflop-ai <generate|generate-later|simulate|audit|hand-ev|later-hand-ev|spots> [--spot <id> | --all] [--samples N] [--model M] [--effort E] [--profile P --role villain|exploit] [--opponent-seat ip|oop] [--force]";
const [command, ...rest] = process.argv.slice(2);
if (!COMMANDS.includes(command)) throw new Error(USAGE);

const options = { all: false };
const allowed = { generate: ["spot", "all", "model", "effort", "profile", "role", "force", "opponent-seat"], "generate-later": ["spot", "all", "model", "effort", "profile", "role", "force", "opponent-seat"], simulate: ["spot", "all", "samples"], audit: ["spot", "all"],
  "hand-ev": ["spot", "all"], "later-hand-ev": ["spot", "all"], spots: [] }[command];
for (let i = 0; i < rest.length; i++) {
  const flag = rest[i].replace(/^--/, "");
  if (!rest[i].startsWith("--") || !allowed.includes(flag)) throw new Error(USAGE);
  if (flag === "all" || flag === "force") { options[flag] = true; continue; }
  if (rest[i + 1] === undefined || rest[i + 1].startsWith("--")) throw new Error(USAGE);
  options[flag] = rest[++i];
}
const generationOptions = ["generate", "generate-later"].includes(command) ? normalizeGenerationOptions({ ...options, opponentSeat: options["opponent-seat"] }) : {};
if (options.all && options.spot) throw new Error("Use either --spot or --all");
const samplesOption = fallback => {
  const samples = options.samples === undefined ? fallback : Number(options.samples);
  if (!Number.isInteger(samples) || samples < 1) throw new Error(USAGE);
  return samples;
};

async function runSpot(spotId) {
  const inputs = loadInputs(spotId, generationInputOptions(spotId, generationOptions.profile, generationOptions.opponentSeat));
  const paths = artifactPaths(inputs.spot, generationOptions);
  if (command === "generate") {
    const model = resolveModel(options.model), effort = resolveEffort(options.effort);
    const { candidate, reused } = await generate(inputs, { model, effort, ...generationOptions });
    const meta = candidate.metadata;
    return `${reused ? "Reused" : "Saved"} local AI candidate (${inputs.spot.tree}) ${meta.source_hash.slice(0, 12)} (${meta.model}${meta.reasoning_effort ? `, effort ${meta.reasoning_effort}` : ""}; not GTO; not published)`;
  }
  if (command === "generate-later") {
    const model = resolveModel(options.model), effort = resolveEffort(options.effort);
    const { candidate, reused } = await generateLater(inputs, loadCandidate(inputs, generationOptions.role), { model, effort, ...generationOptions });
    return `${reused ? "Reused" : "Saved"} local AI turn/river candidate ${candidate.metadata.policy_hash.slice(0, 12)} (${candidate.metadata.model}; not GTO; not published)`;
  }
  if (command === "simulate") {
    const samples = samplesOption(config.samples_per_board_profile_seat);
    const candidate = loadCandidate(inputs);
    const report = await simulateParallel(inputs, candidate.policy, samples, loadLaterCandidate(inputs, candidate));
    mkdirSync(dirname(paths.report), { recursive: true });
    writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
    const below = report.results.filter(row => row.delta_bb.ci95[1] < 0).length;
    return `${report.results.length} board/profile/seat comparisons, ${samples} paired deals each; ${below} advisory below-reference results. Report: ${paths.report}`;
  }
  if (command === "hand-ev") {
    mkdirSync(dirname(paths.handEv), { recursive: true });
    const started = Date.now();
    await generateHandEv({ spotId, onBoard: board => console.log(`  ${board} (${Math.round((Date.now() - started) / 1000)}s)`) });
    return `Per-hand action EV / EQR (exact expectation when both players follow the shown strategy): ${paths.handEv} (AI policy; not GTO)`;
  }
  if (command === "later-hand-ev") {
    const started = Date.now();
    const result = await generateLaterHandEv({ spotId, onBoard: board => console.log(`  ${board} (${Math.round((Date.now() - started) / 1000)}s)`) });
    const path = paths.laterHandEv ?? paths.handEv.replace(/-hand-ev\.json$/, "-later-hand-ev.json");
    return `Turn/river per-hand action EV / EQR (exact expectation when both players follow the shown strategy): ${path} (AI policy; not GTO)`;
  }
  const candidate = loadCandidate(inputs);
  if (!existsSync(paths.report)) throw new Error("Simulation report missing; run postflop-ai:simulate first");
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  const replay = await simulateParallel(inputs, candidate.policy, config.samples_per_board_profile_seat, laterCandidate);
  const result = auditExperiment(inputs, candidate, JSON.parse(readFileSync(paths.report, "utf8")), laterCandidate, { replay });
  return [`PASS: ${result.checkedCombos} expanded combo decisions, ${result.resultCount} comparisons, fixed-seed replay.`,
    `Advisory EV warnings: ${result.warnings.length}${result.warnings.length ? `; ${result.warnings.slice(0, 5).join(" | ")}` : ""}`,
    "AI estimate only; human review required before any publication."].join("\n");
}

if (command === "spots") {
  const mark = path => existsSync(path) ? "yes" : "-";
  console.log(["id", "IP", "OOP", "pot", "stack", "tree", "reachable", "policy", "later", "report", "hand-ev"].join("\t"));
  for (const spot of POSTFLOP_SPOTS) {
    const paths = artifactPaths(spot);
    console.log([spot.id, spot.ip, spot.oop, `${spot.potBb}BB`, `${spot.stackBb}BB`, spot.tree, spot.reachable ? "yes" : "no (caller never calls)", mark(paths.candidate), mark(paths.laterCandidate), mark(paths.report), mark(paths.handEv)].join("\t"));
  }
  console.log("AI estimate pilot (not GTO). Artifacts stay in .local/postflop-ai/.");
} else if (!options.all) {
  const spotId = options.spot ?? DEFAULT_SPOT_ID;
  spotById(spotId);
  console.log(`[${spotId}] ${await runSpot(spotId)}`);
} else {
  const profileMode = generationOptions.profile && generationOptions.profile !== "standard";
  const attempted = profileMode ? POSTFLOP_SPOTS : POSTFLOP_SPOTS.filter(item => item.reachable);
  const failures = [], skipped = profileMode ? [] : POSTFLOP_SPOTS.filter(spot => !spot.reachable).map(spot => spot.id);
  for (const spot of attempted) {
    const started = Date.now();
    try {
      console.log(`[${spot.id}] ${await runSpot(spot.id)} (${Math.round((Date.now() - started) / 1000)}s)`);
    } catch (error) {
      // Standard registry reachability must not pre-skip profile-only callers.
      // Only explicit zero adjusted reach is skippable; missing sources/policies
      // and malformed/stale artifacts remain failures, never fallback strategy.
      if (profileMode && /saved history is unreachable after range adjustment/.test(error.message)) {
        skipped.push(spot.id);
        console.log(`[${spot.id}] SKIPPED: ${error.message}`);
        continue;
      }
      failures.push(`${spot.id}: ${error.message}`);
      console.error(`[${spot.id}] FAILED: ${error.message}`);
    }
  }
  const reachable = POSTFLOP_SPOTS.length - skipped.length;
  console.log(`${command} --all: ${reachable - failures.length}/${reachable} reachable spots succeeded; skipped (the saved caller range never calls): ${skipped.join(", ") || "none"}.`);
  if (failures.length) { console.log(`Failed:\n  ${failures.join("\n  ")}`); process.exitCode = 1; }
}
