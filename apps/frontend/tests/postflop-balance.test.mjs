import test from "node:test";
import assert from "node:assert/strict";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { checkFlopBalance, checkLaterBalance } from "../scripts/postflop-ai/balance.mjs";
import { referenceLaterPolicy, validateLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.mjs";
import { referencePolicy, referencePolicyFor, NODES } from "../scripts/postflop-ai/policy.mjs";
import { adoptionDecision, worstProfileScore } from "../scripts/postflop-ai/regenerate-later.mjs";

const clone = value => structuredClone(value);
const inputs = loadInputs("BTN_open_BB_call");

function setMix(policy, street, node, tier, mix) {
  for (const rule of policy.streets[street].rules) if (rule.node === node && rule.tier === tier) rule.mix = { ...mix };
}

function actionMix(actions, selected) {
  return Object.fromEntries(actions.map(action => [action, action === selected ? 100 : 0]));
}

function report(profileMeans) {
  return { results: Object.entries(profileMeans).flatMap(([opponent, mean]) => [
    { opponent, delta_bb: { mean } }, { opponent, delta_bb: { mean } },
  ]) };
}

test("flop balance flags monster-only betting and value-only raises", () => {
  const policy = clone(referencePolicy);
  const allBet = actionMix(NODES.btn_first, "bet33");
  for (const rule of policy.rules) if (rule.node === "btn_first" && rule.tier === "monster") rule.mix = { ...allBet };
  for (const rule of policy.rules) if (rule.node === "bb_vs_33") {
    rule.mix = actionMix(NODES.bb_vs_33, rule.tier === "monster" ? "raise" : "call");
  }

  const findings = checkFlopBalance(inputs, policy).findings;
  assert.ok(findings.some(item => item.check === "capped-check" && item.node === "btn_first"), JSON.stringify(findings));
  assert.ok(findings.some(item => item.check === "value-only-raise" && item.node === "bb_vs_33"), JSON.stringify(findings));
});

test("the defence floor keeps flop defence near MDF even against a value-only bettor", () => {
  // Facing nodes are judged on the computed defence (defence.mjs). A bettor whose range is only
  // monsters would make the best response fold far below MDF; the defence floor adds the
  // strongest folding hands back until defence is within 10 points of MDF, so no overfold remains.
  const reference = referencePolicyFor(inputs.spot.tree);
  const valueOnly = clone(reference);
  for (const rule of valueOnly.rules) if (rule.node === "btn_first") {
    rule.mix = actionMix(NODES.btn_first, rule.tier === "monster" ? "bet33" : "check");
  }
  const findings = checkFlopBalance(inputs, valueOnly).findings;
  assert.deepEqual(findings.filter(item => item.severity === "error"), []);
  assert.deepEqual(findings.filter(item => item.check === "overfold" && item.node === "bb_vs_33"), []);
  // Rewriting the policy's own call / fold split (keeping its raise share) does not move the finding.
  const foldOnly = clone(reference);
  for (const rule of foldOnly.rules) if (/^(?:bb|ip)_vs_\d+$/.test(rule.node)) rule.mix = { fold: 100 - rule.mix.raise, call: 0, raise: rule.mix.raise };
  assert.deepEqual(checkFlopBalance(inputs, foldOnly).findings.filter(item => item.check === "overfold"),
    checkFlopBalance(inputs, reference).findings.filter(item => item.check === "overfold"));
});

test("later balance catches excess river air, value-only raises, capped checks, missing overrides and copied roles", () => {
  const policy = clone(referenceLaterPolicy());
  for (const node of ["turn_oop_first", "turn_ip_first"]) {
    for (const tier of ["monster", "strong", "draw", "medium", "air"]) {
      setMix(policy, "turn", node, tier, actionMix(LATER_NODES[node], tier === "air" ? "check" : "bet33"));
    }
  }
  for (const node of ["river_oop_first", "river_ip_first"]) {
    for (const tier of ["monster", "strong", "draw", "medium", "air"]) {
      if (LATER_NODES[node]) setMix(policy, "river", node, tier, actionMix(LATER_NODES[node], "bet33"));
    }
  }
  for (const tier of ["monster", "strong", "draw", "medium", "air"]) {
    setMix(policy, "turn", "turn_ip_vs_33", tier,
      actionMix(LATER_NODES.turn_ip_vs_33, tier === "monster" ? "raise" : "call"));
  }
  policy.streets.river.rules = policy.streets.river.rules.filter(rule => rule.node !== "river_oop_first" ||
    rule.line === "any" && rule.texture === "any");
  validateLaterPolicy(policy);

  const findings = checkLaterBalance(inputs, referencePolicy, policy).findings;
  assert.ok(findings.some(item => item.check === "bluff-ratio" && item.node.startsWith("river_")), JSON.stringify(findings));
  assert.ok(findings.some(item => item.check === "value-only-raise" && item.node === "turn_ip_vs_33"), JSON.stringify(findings));
  assert.ok(findings.some(item => item.check === "capped-check" && item.node === "turn_oop_first"), JSON.stringify(findings));
  assert.ok(findings.some(item => item.check === "no-overrides" && item.severity === "error" && item.node === "river_oop_first"), JSON.stringify(findings));
  assert.ok(findings.some(item => item.check === "role-copy" && item.node.includes("turn_oop_first")), JSON.stringify(findings));
});

test("the defence floor keeps turn defence near MDF even against a value-only bettor", () => {
  const referenceLater = referenceLaterPolicy();
  const valueOnly = clone(referenceLater);
  for (const node of ["turn_oop_first", "turn_ip_first"]) for (const tier of ["monster", "strong", "draw", "medium", "air"]) {
    setMix(valueOnly, "turn", node, tier, actionMix(LATER_NODES[node], tier === "monster" ? "bet33" : "check"));
  }
  const findings = checkLaterBalance(inputs, referencePolicyFor(inputs.spot.tree), valueOnly, { authored: false }).findings;
  assert.deepEqual(findings.filter(item => item.severity === "error"), []);
  // Only the 33% responses are reachable: this bettor never bets 75% or 125%, so those nodes have no
  // bettor range and fall back to the policy mix.
  assert.deepEqual(findings.filter(item => item.check === "overfold" && /^turn_(ip|oop)_vs_33$/.test(item.node)), []);
});

test("later generation prompt contains the balance requirements verbatim", async () => {
  const { promptForLater } = await import("../scripts/postflop-ai/generate.mjs");
  const prompt = promptForLater(inputs);
  for (const requirement of [
    "For every *_first node on each street, add at least 3 overrides keyed by line (aggressor/defender/checked) and at least 3 keyed by texture (e.g. slow down on flush/pair cards, barrel blanks and overcards as the aggressor, probe when the previous street checked through).",
    "OOP and IP play differently: the out-of-position player checks more and leads less; do not copy oop_first into ip_first.",
    "Keep river bluffs proportional to the bet size: among hands that bet, the share of air should be about 20% for 33% pot, 30% for 75%, 36% for 125% and 40% for all-in. Raises must include some bluffs or draws, not only monsters.",
    "The opponent is not a fixed bot; do not exploit an opponent that folds too often.",
  ]) assert.ok(prompt.includes(requirement), requirement);
});

test("later adoption compares worst profile and refuses errors or extra warnings", () => {
  const candidate = { policy: referenceLaterPolicy() };
  const genericReport = report({ standard: 0, passive: 0, aggressive: 0 });
  const candidateReport = report({ standard: 2, passive: -0.5, aggressive: 3 });
  assert.equal(worstProfileScore(candidateReport), -0.5);
  const warnings = [{ check: "role-copy", severity: "warn", node: "turn_oop_first", detail: "baseline" }];
  const worse = adoptionDecision({ candidate, candidateReport, genericReport, genericFindings: warnings, candidateFindings: warnings });
  assert.equal(worse.adopt, false); // Its overall average is positive; its worst profile is not.
  assert.equal(worse.candidateScore, -0.5);

  const better = adoptionDecision({ candidate, candidateReport: report({ standard: 1, passive: 1, aggressive: 1 }),
    genericReport, genericFindings: warnings, candidateFindings: warnings });
  assert.equal(better.adopt, true);
  const withError = adoptionDecision({ candidate, candidateReport: report({ standard: 10, passive: 10, aggressive: 10 }),
    genericReport, genericFindings: warnings, candidateFindings: [...warnings, { check: "no-overrides", severity: "error", node: "river_oop_first" }] });
  assert.equal(withError.adopt, false);
  const extraWarnings = adoptionDecision({ candidate, candidateReport: report({ standard: 10, passive: 10, aggressive: 10 }),
    genericReport, genericFindings: warnings, candidateFindings: [...warnings, { check: "role-copy", severity: "warn", node: "river_oop_first" }] });
  assert.equal(extraWarnings.adopt, false);
});
