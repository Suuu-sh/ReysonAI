// node scripts/postflop-ai/authored/tune-flop.mjs <spotId>... — Claude (Opus 5.5) authoring for a
// spot whose generated flop candidates did not beat the shared flop rules. Starting from the shared
// rules, it tries reasoned adjustments (value-bet more, bluff less, check more out of position,
// defend wider/tighter, raise less), never adding balance warnings, keeps the best on a quick
// worst-profile simulation and runs the same full-sample adoption decision against the shared rules
// played with the spot's current turn/river rules. AI estimate, not GTO.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { artifactPaths, config, loadInputs } from "../inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "../generate.mjs";
import { validatePolicy } from "../policy.mjs";
import { simulate } from "../simulation.mjs";
import { checkFlopBalance } from "../balance.mjs";
import { flopAdoptionDecision, rebindLaterPolicy, worstProfileScore } from "../regenerate-flop.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const shift = (mix, from, to, share) => { const moved = Math.round(mix[from] * share); mix[from] -= moved; mix[to] += moved; };
const bets = mix => Object.keys(mix).filter(action => action.startsWith("bet"));
const first = rule => rule.node.endsWith("_first");
const facing = rule => /_vs_\d+$/.test(rule.node);
const each = (policy, test, fn) => { for (const rule of policy.rules) if (test(rule)) fn(rule.mix); };
const ADJUSTMENTS = {
  "value-more": p => each(p, r => first(r) && ["monster", "strong"].includes(r.tier), m => shift(m, "check", bets(m)[1] ?? bets(m)[0], 0.3)),
  "bluff-less": p => each(p, r => first(r) && r.tier === "air", m => { for (const a of bets(m)) shift(m, a, "check", 0.4); }),
  "oop-checks-more": p => each(p, r => r.node === "oop_first" && r.tier !== "monster", m => { for (const a of bets(m)) shift(m, a, "check", 0.3); }),
  "defend-wider": p => each(p, r => facing(r) && ["strong", "medium", "draw"].includes(r.tier), m => shift(m, "fold", "call", 0.3)),
  "defend-tighter": p => each(p, r => facing(r) && ["medium", "air"].includes(r.tier), m => shift(m, "call", "fold", 0.25)),
  "raise-less": p => each(p, r => facing(r) && r.tier !== "monster", m => shift(m, "raise", "call", 0.5)),
};

for (const spotId of process.argv.slice(2)) {
  const inputs = loadInputs(spotId), paths = artifactPaths(inputs.spot), tree = inputs.spot.tree;
  const genericPath = paths.candidate.replace(/\.json$/, ".generic.json");
  if (!existsSync(genericPath)) { console.log(`${spotId}: no shared flop rules to start from`); continue; }
  const current = loadCandidate(inputs), later = loadLaterCandidate(inputs, current);
  const generic = JSON.parse(readFileSync(genericPath, "utf8"));
  // TUNE_BASE=<suffix> starts from another saved candidate of this spot (e.g. a rejected
  // gpt-6-sol attempt) instead of the shared rules; adoption is still judged against the shared rules.
  const base = process.env.TUNE_BASE ? JSON.parse(readFileSync(paths.candidate.replace(/\.json$/, `.${process.env.TUNE_BASE}.json`), "utf8")) : generic;
  const warnings = policy => checkFlopBalance(inputs, policy).findings.filter(f => f.severity !== "info").length;
  const allowed = warnings(generic.policy);
  const quick = policy => worstProfileScore(simulate(inputs, policy, 2500, later));
  let best = { name: process.env.TUNE_BASE ?? "shared", policy: base.policy, score: quick(base.policy) };
  for (let round = 0; round < 2; round++) for (const [name, apply] of Object.entries(ADJUSTMENTS)) {
    const policy = clone(best.policy); apply(policy); validatePolicy(policy, tree);
    if (warnings(policy) > allowed) continue;
    const score = quick(policy);
    if (score > best.score + 0.01) best = { name: `${best.name}+${name}`, policy, score };
  }
  const genericReport = simulate(inputs, generic.policy, config.samples_per_board_profile_seat, later);
  const report = simulate(inputs, best.policy, config.samples_per_board_profile_seat, later);
  const decision = flopAdoptionDecision({ candidate: best.policy, candidateReport: report, genericReport,
    genericFindings: checkFlopBalance(inputs, generic.policy).findings, candidateFindings: checkFlopBalance(inputs, best.policy).findings });
  const summary = `${best.name}: ${decision.candidateScore.toFixed(3)}bb / ${decision.candidateWarningCount} warn vs shared ${decision.genericScore.toFixed(3)}bb / ${decision.genericWarningCount} warn`;
  if (!decision.adopt || best.policy === generic.policy) { console.log(`${spotId}: not adopted (${summary})`); continue; }
  const candidate = { metadata: { ...generic.metadata, policy_hash: sha(best.policy), model: "claude-opus-5-5", reasoning_effort: "high", authored_adjustments: best.name }, policy: best.policy };
  writeFileSync(paths.candidate, `${JSON.stringify(candidate, null, 2)}\n`);
  if (later) writeFileSync(paths.laterCandidate, `${JSON.stringify(rebindLaterPolicy(later, candidate.metadata.policy_hash), null, 2)}\n`);
  writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${spotId}: adopted Claude-authored flop rules (${summary})`);
}
