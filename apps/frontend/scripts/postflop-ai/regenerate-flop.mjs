// node scripts/postflop-ai/regenerate-flop.mjs <spotId>... — generate a spot-specific
// flop policy, then keep it only when it is no worse than the copied policy. AI estimate,
// not GTO. This command writes local artifacts only when explicitly invoked.
import {
  copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactPaths, config, loadInputs } from "./inputs.mjs";
import { generate, loadCandidate, loadLaterCandidate, resolveEffort, resolveModel, sha } from "./generate.mjs";
import { checkFlopBalance } from "./balance.mjs";
import { PROFILES, simulate } from "./simulation.mjs";

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

// Rebind only the association metadata. The later policy rules and their policy_hash are
// intentionally unchanged because the rules do not depend on the flop policy.
export function rebindLaterPolicy(laterCandidate, flopPolicyHash) {
  if (!laterCandidate || typeof laterCandidate !== "object" || !laterCandidate.metadata ||
      typeof laterCandidate.metadata !== "object" || !laterCandidate.policy ||
      typeof flopPolicyHash !== "string" || !flopPolicyHash) {
    throw new Error("Invalid later policy or flop policy hash");
  }
  return {
    ...laterCandidate,
    metadata: { ...laterCandidate.metadata, flop_policy_hash: flopPolicyHash },
  };
}

// Pure comparison over reports and findings; callers decide how those values were produced.
export function flopAdoptionDecision({ candidate, candidateReport, genericReport, genericFindings, candidateFindings }) {
  if (!Array.isArray(genericFindings) || !Array.isArray(candidateFindings)) {
    throw new Error("Flop balance findings must be arrays");
  }
  const genericWarningCount = genericFindings.filter(finding => finding.severity === "warn").length;
  const candidateWarningCount = candidateFindings.filter(finding => finding.severity === "warn").length;
  const candidateErrors = candidateFindings.filter(finding => finding.severity === "error");
  const genericScore = worstProfileScore(genericReport);
  const candidateScore = worstProfileScore(candidateReport);
  return {
    candidate,
    adopt: candidateErrors.length === 0 && candidateWarningCount <= genericWarningCount && candidateScore >= genericScore,
    genericScore,
    candidateScore,
    genericWarningCount,
    candidateWarningCount,
    candidateErrors,
    genericFindings,
    candidateFindings,
  };
}

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const genericPaths = paths => ({
  candidate: paths.candidate.replace(/\.json$/, ".generic.json"),
  report: paths.report.replace(/\.json$/, ".generic.json"),
});
const restoreSnapshot = (path, contents) => {
  if (contents === null) {
    if (existsSync(path)) unlinkSync(path);
  } else {
    writeFileSync(path, contents);
  }
};

function reasonFor(decision) {
  const reasons = [];
  if (decision.candidateErrors.length) reasons.push(`${decision.candidateErrors.length} balance error(s)`);
  if (decision.candidateWarningCount > decision.genericWarningCount) reasons.push("more balance warnings");
  if (decision.candidateScore < decision.genericScore) reasons.push("lower worst-profile score");
  return reasons.length ? reasons.join(", ") : "no balance errors, warnings not increased, score not lower";
}

async function regenerateSpot(spotId) {
  const inputs = loadInputs(spotId);
  const paths = artifactPaths(inputs.spot);
  const generic = genericPaths(paths);
  const originalFlop = loadCandidate(inputs);
  const originalLater = loadLaterCandidate(inputs, originalFlop);
  const snapshot = new Map([paths.candidate, paths.report, paths.laterCandidate].map(path => [
    path, existsSync(path) ? readFileSync(path) : null,
  ]));
  const temporaryPolicy = `${paths.candidate}.regenerate-flop-${process.pid}-${Date.now()}.tmp`;
  let archivePath = null;
  let archivedCandidate = false;
  let mutatingArtifacts = false;
  let committed = false;

  try {
    if (!existsSync(generic.candidate)) copyFileSync(paths.candidate, generic.candidate);
    if (!existsSync(generic.report) && existsSync(paths.report)) copyFileSync(paths.report, generic.report);

    const genericArtifact = JSON.parse(readFileSync(generic.candidate, "utf8"));
    const genericPolicy = genericArtifact.policy ?? genericArtifact;
    const genericPolicyHash = sha(genericPolicy);
    let genericReport;
    if (existsSync(generic.report)) {
      genericReport = JSON.parse(readFileSync(generic.report, "utf8"));
    } else {
      const genericLater = originalLater ? rebindLaterPolicy(originalLater, genericPolicyHash) : null;
      genericReport = simulate(inputs, genericPolicy, config.samples_per_board_profile_seat, genericLater);
    }

    const genericFindings = checkFlopBalance(inputs, genericPolicy).findings;
    const model = resolveModel();
    const effort = resolveEffort();

    // generate() deliberately reuses an existing candidate, so move the original aside
    // while generation runs. The try/finally below restores all originals on any failure.
    if (existsSync(temporaryPolicy)) throw new Error(`Temporary policy path already exists: ${temporaryPolicy}`);
    mutatingArtifacts = true;
    renameSync(paths.candidate, temporaryPolicy);

    const { candidate } = await generate(inputs, { model, effort });
    const laterForCandidate = originalLater ? rebindLaterPolicy(originalLater, candidate.metadata.policy_hash) : null;
    const candidateReport = simulate(inputs, candidate.policy, config.samples_per_board_profile_seat, laterForCandidate);
    const candidateFindings = checkFlopBalance(inputs, candidate.policy).findings;
    const decision = flopAdoptionDecision({ candidate, candidateReport, genericReport, genericFindings, candidateFindings });
    const comparison = `candidate ${decision.candidateScore.toFixed(3)} bb / ${decision.candidateWarningCount} warn vs copied ${decision.genericScore.toFixed(3)} bb / ${decision.genericWarningCount} warn`;

    if (decision.adopt) {
      // Both writes are part of the same transaction as the generated candidate.
      mutatingArtifacts = true;
      if (originalLater) {
        writeFileSync(paths.laterCandidate, json(rebindLaterPolicy(originalLater, candidate.metadata.policy_hash)));
      }
      writeFileSync(paths.report, json(candidateReport));
      console.log(`${spotId}: adopted spot-specific flop policy (${comparison}; ${reasonFor(decision)})`);
    } else {
      mutatingArtifacts = true;
      // Keep every rejected attempt: the first is .<model>.json, retries get .<model>.tryN.json.
      archivePath = paths.candidate.replace(/\.json$/, `.${candidate.metadata.model}.json`);
      for (let attempt = 2; existsSync(archivePath); attempt++) archivePath = paths.candidate.replace(/\.json$/, `.${candidate.metadata.model}.try${attempt}.json`);
      renameSync(paths.candidate, archivePath);
      archivedCandidate = true;
      copyFileSync(generic.candidate, paths.candidate);
      if (existsSync(generic.report)) copyFileSync(generic.report, paths.report);
      else writeFileSync(paths.report, json(genericReport));
      // Keep the later artifact valid for the restored generic flop policy without changing
      // its policy or policy_hash.
      if (originalLater) {
        writeFileSync(paths.laterCandidate, json(rebindLaterPolicy(originalLater, genericPolicyHash)));
      }
      console.log(`${spotId}: kept copied flop policy (${comparison}; ${reasonFor(decision)})`);
    }
    committed = true;
  } finally {
    const cleanupErrors = [];
    if (!committed && mutatingArtifacts) {
      for (const [path, contents] of snapshot) {
        try { restoreSnapshot(path, contents); } catch (error) { cleanupErrors.push(error); }
      }
      try {
        if (archivedCandidate && archivePath && existsSync(archivePath)) unlinkSync(archivePath);
      } catch (error) { cleanupErrors.push(error); }
    }
    try {
      if (existsSync(temporaryPolicy)) unlinkSync(temporaryPolicy);
    } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, `Could not fully restore ${spotId} postflop artifacts`);
    }
  }
}

async function main(spotIds) {
  if (!spotIds.length) throw new Error("Usage: node scripts/postflop-ai/regenerate-flop.mjs <spotId>...");
  for (const spotId of spotIds) await regenerateSpot(spotId);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
