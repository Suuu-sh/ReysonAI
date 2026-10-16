// node scripts/postflop-ai/authored/tune-later.ts <spotId>... — Claude (Opus 5.5) authoring for a
// spot whose generated turn/river candidates did not beat the shared rules. Starting from the
// shared rules, it tries a small set of reasoned spot adjustments (defend wider or tighter, value-bet
// more, bluff less, check more out of position), keeps the best on a quick worst-profile simulation,
// then runs the normal full-sample adoption decision. AI estimate, not GTO.
import { readFileSync, writeFileSync } from "node:fs";
import { artifactPaths, config, loadInputs } from "../inputs.ts";
import { loadCandidate, sha } from "../generate.ts";
import { validateLaterPolicy } from "../later-policy.ts";
import { simulate } from "../simulation.ts";
import { compareLaterCandidate, worstProfileScore } from "../regenerate-later.ts";
import { checkLaterBalance } from "../balance.ts";
import { copyFileSync } from "node:fs";

const clone = (value: any) : any => JSON.parse(JSON.stringify(value));
const shift = (mix?: any, from?: any, to?: any, share?: any) : any => {
  const moved = Math.round(mix[from] * share);
  mix[from] -= moved; mix[to] += moved;
};
const each = (policy?: any, test?: any, fn?: any) : any => { for (const street of Object.values<any>(policy.streets)) for (const rule of street.rules) if (test(rule)) fn(rule.mix, rule); };
const facing = (rule: any) : any => /_vs_(33|75|125|allin)$/.test(rule.node);
const first = (rule: any) : any => rule.node.endsWith("_first");
export const ADJUSTMENTS = {
  "defend-wider": (p: any) : any => each(p, (r: any) : any => facing(r) && ["strong", "medium", "draw"].includes(r.tier), (m: any) : any => shift(m, "fold", "call", 0.3)),
  "defend-tighter": (p: any) : any => each(p, (r: any) : any => facing(r) && ["medium", "air", "draw"].includes(r.tier), (m: any) : any => shift(m, "call", "fold", 0.3)),
  "value-more": (p: any) : any => each(p, (r: any) : any => first(r) && ["monster", "strong"].includes(r.tier), (m: any) : any => shift(m, "check", "bet75", 0.35)),
  "bluff-less": (p: any) : any => each(p, (r: any) : any => first(r) && r.tier === "air", (m: any) : any => { for (const a of Object.keys(m)) if (a !== "check") shift(m, a, "check", 0.4); }),
  "oop-checks-more": (p: any) : any => each(p, (r: any) : any => r.node.includes("_oop_first") && r.tier !== "monster", (m: any) : any => { for (const a of Object.keys(m)) if (a !== "check") shift(m, a, "check", 0.3); }),
  "raise-less": (p: any) : any => each(p, (r: any) : any => facing(r) && "raise" in r.mix && r.tier !== "monster", (m: any) : any => shift(m, "raise", "call", 0.5)),
};

for (const spotId of process.argv.slice(2)) {
  const inputs = loadInputs(spotId), paths = artifactPaths(inputs.spot), flop = loadCandidate(inputs);
  const generic = JSON.parse(readFileSync(paths.laterCandidate.replace(/\.json$/, ".generic.json"), "utf8"));
  const quick = (policy: any) : any => worstProfileScore(simulate(inputs, flop.policy, 2500, policy));
  // Adjustments may not add balance warnings (overfolding, capped checks, …) over the shared rules.
  const warnings = (policy: any) : any => checkLaterBalance(inputs, flop.policy, policy).findings
    .filter((f: any) : any => f.severity !== "warn" || !(f.check === "bluff-ratio" && f.direction === "under")).length;
  const allowed = warnings(generic.policy);
  let best = { name: "shared", policy: generic.policy, score: quick(generic.policy) };
  // Greedy: apply each adjustment on top of the current best while it improves the quick score.
  const skip = (process.env.TUNE_SKIP ?? "").split(",");
  for (let round = 0; round < 2; round++) for (const [name, apply] of Object.entries<any>(ADJUSTMENTS).filter(([name]: any) : any => !skip.includes(name))) {
    const policy = clone(best.policy); apply(policy); validateLaterPolicy(policy);
    if (warnings(policy) > allowed) continue;
    const score = quick(policy);
    if (score > best.score + 0.01) best = { name: `${best.name}+${name}`, policy, score };
  }
  const candidate = { metadata: { ...generic.metadata, flop_policy_hash: flop.metadata.policy_hash, policy_hash: sha(best.policy),
    model: "claude-opus-5-5", reasoning_effort: "high", authored_adjustments: best.name }, policy: best.policy };
  const report = simulate(inputs, flop.policy, config.samples_per_board_profile_seat, candidate);
  const decision = compareLaterCandidate({ inputs, flopPolicy: flop.policy, genericPolicy: generic.policy, candidate,
    genericReport: JSON.parse(readFileSync(paths.report.replace(/\.json$/, ".generic.json"), "utf8")), candidateReport: report });
  const summary = `${best.name}: ${decision.candidateScore.toFixed(3)}bb / ${decision.candidateWarningCount} warn vs shared ${decision.genericScore.toFixed(3)}bb / ${decision.genericWarningCount} warn`;
  if (decision.adopt && best.name !== "shared") {
    writeFileSync(paths.laterCandidate, `${JSON.stringify(candidate, null, 2)}\n`);
    writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${spotId}: adopted Claude-authored rules (${summary})`);
  } else {
    // Restore the shared rules so a previously adopted (now rejected) authoring does not linger.
    copyFileSync(paths.laterCandidate.replace(/\.json$/, ".generic.json"), paths.laterCandidate);
    copyFileSync(paths.report.replace(/\.json$/, ".generic.json"), paths.report);
    console.log(`${spotId}: not adopted (${summary})`);
  }
}
