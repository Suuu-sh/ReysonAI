import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { auditExperiment } from "./audit.mjs";
import { generate, loadCandidate, reportPath } from "./generate.mjs";
import { config, loadInputs } from "./inputs.mjs";
import { simulate } from "./simulation.mjs";
import { DEFAULT_SAMPLES, generateHandEv, handEvPath } from "./hand-ev.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["generate", "simulate", "audit", "hand-ev"].includes(command)) throw new Error("Usage: postflop-ai <generate|simulate|audit|hand-ev> [--samples N]");
const inputs = loadInputs();

if (command === "generate") {
  if (args.length) throw new Error("generate takes no arguments");
  const { candidate, reused } = await generate(inputs);
  console.log(`${reused ? "Reused" : "Saved"} local AI candidate: ${candidate.metadata.source_hash.slice(0, 12)} (not GTO; not published)`);
} else if (command === "simulate") {
  const samples = args.length === 2 && args[0] === "--samples" ? Number(args[1]) : config.samples_per_board_profile_seat;
  if (args.length && (args.length !== 2 || args[0] !== "--samples") || !Number.isInteger(samples) || samples < 1) {
    throw new Error("Usage: postflop-ai simulate [--samples N]");
  }
  const candidate = loadCandidate(inputs);
  const report = simulate(inputs, candidate.policy, samples);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const below = report.results.filter(row => row.delta_bb.ci95[1] < 0).length;
  console.log(`${report.results.length} board/profile/seat comparisons, ${samples} paired deals each; ${below} advisory below-reference results.`);
  console.log(`Report: ${reportPath} (AI estimate; 12 representative flops; not GTO or published)`);
} else if (command === "hand-ev") {
  const samples = args.length === 2 && args[0] === "--samples" ? Number(args[1]) : DEFAULT_SAMPLES;
  if (args.length && (args.length !== 2 || args[0] !== "--samples") || !Number.isInteger(samples) || samples < 1) {
    throw new Error("Usage: postflop-ai hand-ev [--samples N]");
  }
  mkdirSync(dirname(handEvPath), { recursive: true });
  generateHandEv({ samples, onBoard: board => console.log(`  ${board}`) });
  console.log(`Per-hand action EV / EQR (${samples} deals per hand and action): ${handEvPath} (AI policy self-play; not GTO)`);
} else {
  if (args.length) throw new Error("audit takes no arguments");
  const candidate = loadCandidate(inputs);
  if (!existsSync(reportPath)) throw new Error("Simulation report missing; run postflop-ai:simulate first");
  const result = auditExperiment(inputs, candidate, JSON.parse(readFileSync(reportPath, "utf8")));
  console.log(`PASS: ${result.checkedCombos} expanded combo decisions, ${result.resultCount} comparisons, fixed-seed replay.`);
  console.log(`Advisory EV warnings: ${result.warnings.length}${result.warnings.length ? `; ${result.warnings.slice(0, 5).join(" | ")}` : ""}`);
  console.log("AI estimate only; human review required before any publication.");
}
