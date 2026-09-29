// node scripts/postflop-ai/fix-later-candidate.mjs <spotId>... — Claude (Opus) review fix for a
// rejected spot-specific turn/river candidate ({slug}-later-policy.<model>.json). It applies only
// the mechanical fix the balance audit asks for — a capped first node gets at least 12% monster
// checks, taken from that rule's largest bet — then re-runs the normal adoption decision against
// the shared rules. Nothing is deleted; the fixed candidate is recorded with its own model tag.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths, config, loadInputs } from "./inputs.mjs";
import { loadCandidate, sha } from "./generate.mjs";
import { validateLaterPolicy } from "./later-policy.mjs";
import { checkLaterBalance } from "./balance.mjs";
import { simulate } from "./simulation.mjs";
import { compareLaterCandidate } from "./regenerate-later.mjs";

const MIN_MONSTER_CHECK = 12;
export function fixCappedChecks(policy, cappedNodes) {
  const fixed = JSON.parse(JSON.stringify(policy));
  for (const street of Object.keys(fixed.streets)) for (const rule of fixed.streets[street].rules) {
    if (!cappedNodes.includes(rule.node) || rule.tier !== "monster" || rule.mix.check >= MIN_MONSTER_CHECK) continue;
    let need = MIN_MONSTER_CHECK - rule.mix.check;
    for (const action of Object.keys(rule.mix).filter(action => action !== "check").sort((a, b) => rule.mix[b] - rule.mix[a])) {
      const take = Math.min(need, rule.mix[action]);
      rule.mix[action] -= take; rule.mix.check += take; need -= take;
      if (!need) break;
    }
  }
  return validateLaterPolicy(fixed);
}

for (const spotId of process.argv.slice(2)) {
  const inputs = loadInputs(spotId), paths = artifactPaths(inputs.spot), flop = loadCandidate(inputs);
  const dir = dirname(paths.laterCandidate), base = paths.laterCandidate.replace(/\.json$/, "").split("/").pop();
  const rejected = readdirSync(dir).filter(name => name.startsWith(`${base}.gpt-`) && name.endsWith(".json")).sort().at(-1);
  const generic = { policy: paths.laterCandidate.replace(/\.json$/, ".generic.json"), report: paths.report.replace(/\.json$/, ".generic.json") };
  if (!rejected || !existsSync(generic.policy)) { console.log(`${spotId}: nothing to fix`); continue; }
  const source = JSON.parse(readFileSync(join(dir, rejected), "utf8"));
  const capped = [...new Set(checkLaterBalance(inputs, flop.policy, source.policy).findings.filter(f => f.check === "capped-check").map(f => f.node))];
  const policy = fixCappedChecks(source.policy, capped);
  const candidate = { metadata: { ...source.metadata, flop_policy_hash: flop.metadata.policy_hash, policy_hash: sha(policy),
    model: `${source.metadata.model}+claude-opus-5-5-fix`, fixed_nodes: capped }, policy };
  const report = simulate(inputs, flop.policy, config.samples_per_board_profile_seat, candidate);
  const genericPolicy = JSON.parse(readFileSync(generic.policy, "utf8"));
  const decision = compareLaterCandidate({ inputs, flopPolicy: flop.policy, genericPolicy: genericPolicy.policy ?? genericPolicy,
    candidate, genericReport: JSON.parse(readFileSync(generic.report, "utf8")), candidateReport: report });
  const summary = `candidate ${decision.candidateScore.toFixed(3)}bb / ${decision.candidateWarningCount} warn vs copied ${decision.genericScore.toFixed(3)}bb / ${decision.genericWarningCount} warn; fixed ${capped.join(",") || "nothing"}`;
  if (!decision.adopt) { console.log(`${spotId}: fix not adopted (${summary})`); continue; }
  writeFileSync(paths.laterCandidate, `${JSON.stringify(candidate, null, 2)}\n`);
  writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${spotId}: adopted fixed candidate (${summary})`);
}
