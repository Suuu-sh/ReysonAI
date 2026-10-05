import test from "node:test";
import assert from "node:assert/strict";
import { raiseDefence, overfoldFixDecision } from "../scripts/postflop-ai/fix-overfold.mjs";
import { referenceLaterPolicy, validateLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.ts";
import { NODES, referencePolicy, validatePolicy } from "../scripts/postflop-ai/policy.mjs";

const clone = value => structuredClone(value);
const report = score => ({ results: ["standard", "passive", "aggressive"].flatMap(opponent => [
  { opponent, delta_bb: { mean: score } },
]) });
const finding = (check, severity = "warn", direction) => ({ check, severity, ...(direction ? { direction } : {}) });

function setMix(policy, node, tier, mix, street = null, texture = null) {
  const rules = street ? policy.streets[street].rules : policy.rules;
  const rule = rules.find(item => item.node === node && item.tier === tier && (texture === null || item.texture === texture));
  if (!rule) throw new Error(`Test rule not found: ${street ?? "flop"}/${node}/${tier}/${texture}`);
  rule.mix = { ...mix };
}

test("raiseDefence changes only selected flop nodes and strong/medium/draw tiers", () => {
  const policy = clone(referencePolicy);
  setMix(policy, "bb_vs_33", "strong", { fold: 40, call: 40, raise: 20 });
  setMix(policy, "bb_vs_33", "medium", { fold: 81, call: 19, raise: 0 });
  setMix(policy, "bb_vs_33", "draw", { fold: 10, call: 75, raise: 15 });
  setMix(policy, "bb_vs_33", "monster", { fold: 20, call: 50, raise: 30 });
  setMix(policy, "bb_vs_33", "air", { fold: 90, call: 10, raise: 0 });
  policy.rules.push({ node: "bb_vs_33", texture: "dry", tier: "strong", mix: { fold: 20, call: 60, raise: 20 } });
  validatePolicy(policy);
  const before = clone(policy);

  const fixed = raiseDefence(policy, ["bb_vs_33"], "flop", 0.25);
  validatePolicy(fixed);
  const rule = (source, node, tier, texture = "any") => source.rules.find(item => item.node === node && item.tier === tier && item.texture === texture);
  assert.deepEqual(rule(fixed, "bb_vs_33", "strong").mix, { fold: 30, call: 50, raise: 20 });
  assert.deepEqual(rule(fixed, "bb_vs_33", "medium").mix, { fold: 61, call: 39, raise: 0 }); // round(81 × .25) = 20
  assert.deepEqual(rule(fixed, "bb_vs_33", "draw").mix, { fold: 7, call: 78, raise: 15 }); // round(10 × .25) = 3
  assert.deepEqual(rule(fixed, "bb_vs_33", "strong", "dry").mix, { fold: 15, call: 65, raise: 20 });
  assert.deepEqual(rule(fixed, "bb_vs_33", "monster").mix, rule(policy, "bb_vs_33", "monster").mix);
  assert.deepEqual(rule(fixed, "bb_vs_33", "air").mix, rule(policy, "bb_vs_33", "air").mix);
  assert.deepEqual(rule(fixed, "bb_vs_75", "strong").mix, rule(policy, "bb_vs_75", "strong").mix);
  for (const item of fixed.rules) {
    assert.equal(Object.keys(item.mix).sort().join(","), [...NODES[item.node]].sort().join(","));
    assert.equal(Object.values(item.mix).reduce((sum, value) => sum + value, 0), 100);
  }
  assert.deepEqual(policy, before);
  assert.notEqual(fixed, policy);
});

test("raiseDefence changes selected later-street fallback and line/texture overrides only", () => {
  const policy = referenceLaterPolicy();
  const node = "turn_ip_vs_33";
  const rules = policy.streets.turn.rules;
  const strong = rules.find(rule => rule.node === node && rule.tier === "strong");
  strong.mix = { fold: 40, call: 40, raise: 20 };
  const override = { ...strong, line: "aggressor", texture: "flush", mix: { fold: 80, call: 10, raise: 10 } };
  rules.push(override);
  const monster = rules.find(rule => rule.node === node && rule.tier === "monster");
  const air = rules.find(rule => rule.node === node && rule.tier === "air");
  const otherNode = rules.find(rule => rule.node === "turn_ip_vs_75" && rule.tier === "strong");
  const before = clone(policy);

  const fixed = raiseDefence(policy, [node], "later", 0.5);
  validateLaterPolicy(fixed);
  const updated = fixed.streets.turn.rules;
  assert.deepEqual(updated.find(rule => rule.node === node && rule.tier === "strong" && rule.line === "any").mix,
    { fold: 20, call: 60, raise: 20 });
  assert.deepEqual(updated.find(rule => rule.node === node && rule.tier === "strong" && rule.line === "aggressor").mix,
    { fold: 40, call: 50, raise: 10 });
  assert.deepEqual(updated.find(rule => rule.node === node && rule.tier === "monster").mix, monster.mix);
  assert.deepEqual(updated.find(rule => rule.node === node && rule.tier === "air").mix, air.mix);
  assert.deepEqual(updated.find(rule => rule.node === "turn_ip_vs_75" && rule.tier === "strong").mix, otherNode.mix);
  assert.deepEqual(policy, before);
  for (const street of ["turn", "river"]) for (const rule of fixed.streets[street].rules) {
    assert.equal(Object.keys(rule.mix).sort().join(","), [...LATER_NODES[rule.node]].sort().join(","));
    assert.equal(Object.values(rule.mix).reduce((sum, value) => sum + value, 0), 100);
  }
});

test("raiseDefence rejects invalid kinds, shares, and non-facing selected nodes", () => {
  assert.throws(() => raiseDefence(referencePolicy, ["bb_vs_33"], "flop", 1.1), /Share/);
  assert.throws(() => raiseDefence(referencePolicy, ["not_a_node"], "flop", 0.25), /Unknown flop/);
  assert.throws(() => raiseDefence(referencePolicy, ["btn_first"], "flop", 0.25), /non-facing/);
  assert.throws(() => raiseDefence(referencePolicy, [], "other", 0.25), /Unknown policy kind/);
});

test("overfold adoption requires fewer counted warnings and accepts the exact -0.05 score boundary", () => {
  const baselineFindings = [finding("overfold"), finding("bluff-ratio", "warn", "under")];
  const candidateFindings = [];
  const boundary = overfoldFixDecision({ baselineReport: report(0), candidateReport: report(-0.05),
    baselineFindings, candidateFindings });
  assert.equal(boundary.baselineWarningCount, 1); // Under-bluff warnings are excluded.
  assert.equal(boundary.adopt, true);

  const tooLow = overfoldFixDecision({ baselineReport: report(0), candidateReport: report(-0.0501),
    baselineFindings, candidateFindings });
  assert.equal(tooLow.adopt, false);

  const equalWarnings = overfoldFixDecision({ baselineReport: report(0), candidateReport: report(0),
    baselineFindings, candidateFindings: [finding("role-copy")] });
  assert.equal(equalWarnings.candidateWarningCount, equalWarnings.baselineWarningCount);
  assert.equal(equalWarnings.adopt, false);
});
