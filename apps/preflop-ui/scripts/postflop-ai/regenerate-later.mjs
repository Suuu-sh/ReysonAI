// node scripts/postflop-ai/regenerate-later.mjs <spotId>... — replaces a spot's shared
// (copied) turn/river rules with a spot-specific local Codex candidate, keeping whichever
// simulates better. The copied rules and their report are kept as *.generic.json; nothing
// is deleted. AI estimate, not GTO.
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { artifactPaths, config, loadInputs } from "./inputs.mjs";
import { generateLater, loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { PROFILES, simulate } from "./simulation.mjs";
import { checkLaterBalance } from "./balance.mjs";

export function worstProfileScore(report) {
  if (!Array.isArray(report?.results)) throw new Error("Simulation report has no results");
  const profileScores = PROFILES.map(profile => {
    const rows = report.results.filter(row => row.opponent === profile);
    if (!rows.length || rows.some(row => !Number.isFinite(row.delta_bb?.mean))) {
      throw new Error(`Simulation report is incomplete for ${profile}`);
    }
    return rows.reduce((sum, row) => sum + row.delta_bb.mean, 0) / rows.length;
  });
  return Math.min(...profileScores);
}

// River under-bluffing is flagged for every policy so far (few missed draws survive to the
// river on the sampled lines), so it stays advisory and does not decide adoption; over-bluffing
// — the way a candidate exploits the fold-heavy reference — still counts.
const countsForAdoption = finding => finding.severity === "warn" && !(finding.check === "bluff-ratio" && finding.direction === "under");
export function adoptionDecision({ candidate, candidateReport, genericReport, genericFindings, candidateFindings }) {
  const genericWarningCount = genericFindings.filter(countsForAdoption).length;
  const candidateWarningCount = candidateFindings.filter(countsForAdoption).length;
  const candidateErrors = candidateFindings.filter(finding => finding.severity === "error");
  const genericScore = worstProfileScore(genericReport);
  const candidateScore = worstProfileScore(candidateReport);
  return {
    candidate, adopt: candidateErrors.length === 0 && candidateWarningCount <= genericWarningCount && candidateScore >= genericScore,
    genericScore, candidateScore, genericWarningCount, candidateWarningCount, candidateErrors, genericFindings, candidateFindings,
  };
}

// Pure adoption decision over already-generated candidates and reports. In particular,
// tests pass a candidate directly and never invoke generateLater or write local artifacts.
export function compareLaterCandidate({ inputs, flopPolicy, genericPolicy, candidate, genericReport, candidateReport }) {
  const policy = candidate?.policy ?? candidate;
  const genericFindings = checkLaterBalance(inputs, flopPolicy, genericPolicy).findings;
  const candidateFindings = checkLaterBalance(inputs, flopPolicy, policy).findings;
  return adoptionDecision({ candidate, genericReport, candidateReport, genericFindings, candidateFindings });
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
for (const spotId of isCli ? process.argv.slice(2) : []) {
  const inputs = loadInputs(spotId), paths = artifactPaths(inputs.spot), flop = loadCandidate(inputs);
  const generic = { policy: paths.laterCandidate.replace(/\.json$/, ".generic.json"), report: paths.report.replace(/\.json$/, ".generic.json") };
  if (!existsSync(generic.policy)) {
    renameSync(paths.laterCandidate, generic.policy);
    copyFileSync(paths.report, generic.report);
  }
  const genericPolicy = JSON.parse(readFileSync(generic.policy, "utf8"));
  const genericReport = JSON.parse(readFileSync(generic.report, "utf8"));
  const { candidate } = await generateLater(inputs, flop);
  const report = simulate(inputs, flop.policy, config.samples_per_board_profile_seat, candidate);
  const decision = compareLaterCandidate({ inputs, flopPolicy: flop.policy, genericPolicy: genericPolicy.policy ?? genericPolicy,
    candidate, genericReport, candidateReport: report });
  const comparison = `candidate ${decision.candidateScore.toFixed(3)}bb / ${decision.candidateWarningCount} warn vs copied ${decision.genericScore.toFixed(3)}bb / ${decision.genericWarningCount} warn`;
  if (decision.adopt) {
    writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${spotId}: adopted spot-specific rules (${comparison})`);
  } else {
    renameSync(paths.laterCandidate, paths.laterCandidate.replace(/\.json$/, `.${candidate.metadata.model}.json`));
    copyFileSync(generic.policy, paths.laterCandidate);
    copyFileSync(generic.report, paths.report);
    const reasons = [decision.candidateErrors.length ? `${decision.candidateErrors.length} balance error(s)` : null,
      decision.candidateWarningCount > decision.genericWarningCount ? "more balance warnings" : null,
      decision.candidateScore < decision.genericScore ? "lower worst-profile score" : null].filter(Boolean).join(", ");
    console.log(`${spotId}: kept copied rules (${comparison}${reasons ? `; ${reasons}` : ""})`);
  }
}
