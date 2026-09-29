// node scripts/postflop-ai/fix-overfold.mjs <spotId>... — mechanically increase
// defence at overfolding nodes, then adopt only if the current report's checks pass.
// This only edits local AI-estimate artifacts when explicitly run as a CLI.
import { constants, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { artifactPaths, config, loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.mjs";
import { checkFlopBalance, checkLaterBalance } from "./balance.mjs";
import { validateLaterPolicy } from "./later-policy.mjs";
import { LATER_NODES, STREETS } from "./later-tree.mjs";
import { NODES, treeNodes, validatePolicy } from "./policy.mjs";
import { simulate } from "./simulation.mjs";
import { worstProfileScore } from "./regenerate-later.mjs";

const FIX_SHARES = [0.25, 0.5, 0.75];
const ADJUSTABLE_TIERS = new Set(["strong", "medium", "draw"]);
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const adoptionWarning = finding => finding.severity === "warn" &&
  !(finding.check === "bluff-ratio" && finding.direction === "under");

function flopTreeFor(policy) {
  return policy?.rules?.some(rule => rule?.node === "oop_first" || rule?.node?.startsWith("ip_vs_") || rule?.node === "oop_vs_raise")
    ? "oop_leads" : "oop_checks";
}

// Return a validated copy. A share is the fraction of each eligible rule's fold
// frequency to move to call, rounded to the nearest whole percentage point.
export function raiseDefence(policy, nodes, kind, share) {
  if (!Array.isArray(nodes) || nodes.some(node => typeof node !== "string")) throw new Error("Nodes must be an array of names");
  if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error("Share must be between 0 and 1");
  const selected = new Set(nodes);
  const result = structuredClone(policy);

  if (kind === "flop") {
    const tree = flopTreeFor(result);
    validatePolicy(result, tree);
    const validNodes = new Set(treeNodes(tree));
    for (const node of selected) if (!validNodes.has(node)) throw new Error(`Unknown flop policy node: ${node}`);
    result.rules = result.rules.map(rule => {
      if (!selected.has(rule.node) || !ADJUSTABLE_TIERS.has(rule.tier)) return rule;
      if (!NODES[rule.node].includes("fold") || !NODES[rule.node].includes("call")) {
        throw new Error(`Cannot raise defence at non-facing flop node: ${rule.node}`);
      }
      const moved = Math.round(rule.mix.fold * share);
      return { ...rule, mix: { ...rule.mix, fold: rule.mix.fold - moved, call: rule.mix.call + moved } };
    });
    return validatePolicy(result, tree);
  }

  if (kind === "later") {
    validateLaterPolicy(result);
    for (const node of selected) if (!LATER_NODES[node]) throw new Error(`Unknown later policy node: ${node}`);
    for (const street of STREETS) {
      result.streets[street].rules = result.streets[street].rules.map(rule => {
        if (!selected.has(rule.node) || !ADJUSTABLE_TIERS.has(rule.tier)) return rule;
        if (!LATER_NODES[rule.node].includes("fold") || !LATER_NODES[rule.node].includes("call")) {
          throw new Error(`Cannot raise defence at non-facing later node: ${rule.node}`);
        }
        const moved = Math.round(rule.mix.fold * share);
        return { ...rule, mix: { ...rule.mix, fold: rule.mix.fold - moved, call: rule.mix.call + moved } };
      });
    }
    return validateLaterPolicy(result);
  }

  throw new Error(`Unknown policy kind: ${kind}`);
}

// Pure adoption check. Under-bluff warnings are advisory in regenerate-later too;
// a fix must strictly reduce counted warnings while staying within 0.05bb of score.
export function overfoldFixDecision({ baselineReport, candidateReport, baselineFindings, candidateFindings }) {
  if (!Array.isArray(baselineFindings) || !Array.isArray(candidateFindings)) {
    throw new Error("Balance findings must be arrays");
  }
  const baselineWarningCount = baselineFindings.filter(adoptionWarning).length;
  const candidateWarningCount = candidateFindings.filter(adoptionWarning).length;
  const candidateErrors = candidateFindings.filter(finding => finding.severity === "error");
  const baselineScore = worstProfileScore(baselineReport);
  const candidateScore = worstProfileScore(candidateReport);
  // Reports are rounded to four decimals; the tiny epsilon only avoids rejecting an
  // exact -0.05 boundary due to binary floating-point representation.
  const scoreWithinAllowance = candidateScore + 1e-12 >= baselineScore - 0.05;
  return {
    adopt: candidateErrors.length === 0 && candidateWarningCount < baselineWarningCount && scoreWithinAllowance,
    baselineScore,
    candidateScore,
    baselineWarningCount,
    candidateWarningCount,
    candidateErrors,
  };
}

function balanceFindings(kind, inputs, flopPolicy, laterPolicy) {
  return kind === "flop"
    ? checkFlopBalance(inputs, flopPolicy).findings
    : checkLaterBalance(inputs, flopPolicy, laterPolicy).findings;
}

function overfoldNodes(findings) {
  return [...new Set(findings.filter(finding => finding.check === "overfold" && finding.severity === "warn")
    .map(finding => finding.node))];
}

function preserveOriginal(path) {
  const backup = path.replace(/\.json$/, ".pre-overfold.json");
  if (!existsSync(backup)) copyFileSync(path, backup, constants.COPYFILE_EXCL);
}

function fixedLine(spotId, kind, nodes, share, decision) {
  const comparison = `score ${decision.candidateScore.toFixed(3)} vs ${decision.baselineScore.toFixed(3)}, ` +
    `warn ${decision.candidateWarningCount} vs ${decision.baselineWarningCount}`;
  if (decision.adopt) return `${spotId}: fixed ${kind} nodes=${nodes.join(",")} share=${share} (${comparison})`;
  const reasons = [
    decision.candidateErrors.length ? `${decision.candidateErrors.length} balance error(s)` : null,
    decision.candidateWarningCount >= decision.baselineWarningCount ? "warnings not reduced" : null,
    decision.candidateScore + 1e-12 < decision.baselineScore - 0.05 ? "score below -0.05 allowance" : null,
  ].filter(Boolean).join(", ");
  return `${spotId}: not adopted ${kind} nodes=${nodes.join(",")} share=${share} (${comparison}; ${reasons})`;
}

function withOverfoldFix(candidate, policy, nodes, share, kind) {
  const policyHash = sha(policy);
  return {
    ...candidate,
    metadata: {
      ...candidate.metadata,
      policy_hash: policyHash,
      overfold_fix: { nodes: [...nodes], share },
    },
    policy,
  };
}

function rebindLaterCandidate(candidate, flopPolicyHash) {
  return { ...candidate, metadata: { ...candidate.metadata, flop_policy_hash: flopPolicyHash } };
}

function readReport(path) {
  if (!existsSync(path)) throw new Error(`Current adopted report is missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateCurrentReport(report, inputs, flopCandidate, laterCandidate) {
  const expectedLaterHash = laterCandidate ? sha(laterCandidate.policy) : null;
  if (report.source_hash !== inputs.fingerprint || report.policy_hash !== flopCandidate.metadata.policy_hash ||
      (report.later_policy_hash ?? null) !== expectedLaterHash) {
    throw new Error("Current adopted simulation report does not match the active policy files");
  }
  return report;
}

function tryShares(policy, nodes, kind, inputs, flopPolicy, laterPolicy) {
  let selectedPolicy;
  let selectedShare = FIX_SHARES.at(-1);
  for (const share of FIX_SHARES) {
    selectedPolicy = raiseDefence(policy, nodes, kind, share);
    selectedShare = share;
    if (!overfoldNodes(balanceFindings(kind, inputs,
      kind === "flop" ? selectedPolicy : flopPolicy,
      kind === "later" ? selectedPolicy : laterPolicy)).length) break;
  }
  return { policy: selectedPolicy, share: selectedShare };
}

async function fixSpot(spotId) {
  const inputs = loadInputs(spotId);
  const paths = artifactPaths(inputs.spot);
  let flopCandidate = loadCandidate(inputs);
  let laterCandidate = loadLaterCandidate(inputs, flopCandidate);
  let currentReport = null;
  const lines = [];

  for (const kind of ["flop", "later"]) {
    // There is no adopted later candidate to patch when that optional artifact is absent.
    if (kind === "later" && !laterCandidate) continue;
    const currentPolicy = kind === "flop" ? flopCandidate.policy : laterCandidate.policy;
    const currentFindings = balanceFindings(kind, inputs, flopCandidate.policy, laterCandidate?.policy);
    const nodes = overfoldNodes(currentFindings);
    if (!nodes.length) continue;
    if (!currentReport) currentReport = validateCurrentReport(readReport(paths.report), inputs, flopCandidate, laterCandidate);

    const { policy, share } = tryShares(currentPolicy, nodes, kind, inputs,
      flopCandidate.policy, laterCandidate?.policy);
    const candidate = withOverfoldFix(kind === "flop" ? flopCandidate : laterCandidate, policy, nodes, share, kind);
    const candidateFlop = kind === "flop" ? candidate : flopCandidate;
    const candidateLater = kind === "later" ? candidate : laterCandidate;
    const candidateReport = simulate(inputs, candidateFlop.policy, config.samples_per_board_profile_seat, candidateLater);
    const candidateFindings = balanceFindings(kind, inputs, candidateFlop.policy, candidateLater?.policy);
    const decision = overfoldFixDecision({ baselineReport: currentReport, candidateReport,
      baselineFindings: currentFindings, candidateFindings });

    if (!decision.adopt) {
      lines.push(fixedLine(spotId, kind, nodes, share, decision));
      continue;
    }

    if (kind === "flop") {
      preserveOriginal(paths.candidate);
      flopCandidate = candidate;
      if (laterCandidate) {
        preserveOriginal(paths.laterCandidate);
        laterCandidate = rebindLaterCandidate(laterCandidate, candidate.metadata.policy_hash);
        writeFileSync(paths.laterCandidate, json(laterCandidate));
      }
      writeFileSync(paths.candidate, json(flopCandidate));
    } else {
      preserveOriginal(paths.laterCandidate);
      laterCandidate = candidate;
      writeFileSync(paths.laterCandidate, json(laterCandidate));
    }
    writeFileSync(paths.report, json(candidateReport));
    currentReport = candidateReport;
    lines.push(fixedLine(spotId, kind, nodes, share, decision));
  }

  return lines.length ? lines : [`${spotId}: no overfold`];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const spotIds = process.argv.slice(2);
  if (!spotIds.length) {
    console.error("Usage: node scripts/postflop-ai/fix-overfold.mjs <spotId>...");
    process.exitCode = 1;
  } else {
    for (const spotId of spotIds) for (const line of await fixSpot(spotId)) console.log(line);
  }
}
