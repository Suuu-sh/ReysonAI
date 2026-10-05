import test from "node:test";
import assert from "node:assert/strict";
import { checkFlopBalance, checkLaterBalance } from "../scripts/postflop-ai/balance.mjs";
import { lowerDefence } from "../scripts/postflop-ai/fix-overcall.mjs";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.ts";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.mjs";

const clone = value => structuredClone(value);
const inputs = loadInputs("BTN_open_BB_call");

function setMix(policy, street, node, tier, mix) {
  for (const rule of policy.streets[street].rules) {
    if (rule.node === node && rule.tier === tier) rule.mix = { ...mix };
  }
}

test("lowerDefence moves whole call percentage points to fold while preserving raise and monsters", () => {
  const policy = referenceLaterPolicy();
  const node = "turn_ip_vs_33";
  setMix(policy, "turn", node, "strong", { fold: 40, call: 40, raise: 20 });
  setMix(policy, "turn", node, "medium", { fold: 10, call: 65, raise: 25 });
  setMix(policy, "turn", node, "draw", { fold: 25, call: 55, raise: 20 });
  setMix(policy, "turn", node, "air", { fold: 70, call: 20, raise: 10 });
  setMix(policy, "turn", node, "monster", { fold: 20, call: 50, raise: 30 });
  const strong = policy.streets.turn.rules.find(rule => rule.node === node && rule.tier === "strong");
  policy.streets.turn.rules.push({ ...strong, line: "aggressor", texture: "flush", mix: { fold: 80, call: 10, raise: 10 } });
  const before = clone(policy);

  const fixed = lowerDefence(policy, [node], "later", 0.25);
  const rules = fixed.streets.turn.rules.filter(rule => rule.node === node);
  const find = (tier, line = "any", texture = "any") => rules.find(rule =>
    rule.tier === tier && rule.line === line && rule.texture === texture);
  assert.deepEqual(find("strong").mix, { fold: 50, call: 30, raise: 20 }); // round(40 × .25) = 10 points.
  assert.deepEqual(find("medium").mix, { fold: 26, call: 49, raise: 25 }); // round(65 × .25) = 16 points.
  assert.deepEqual(find("draw").mix, { fold: 39, call: 41, raise: 20 });
  assert.deepEqual(find("air").mix, { fold: 75, call: 15, raise: 10 });
  assert.deepEqual(find("strong", "aggressor", "flush").mix, { fold: 83, call: 7, raise: 10 });
  assert.deepEqual(find("monster").mix, before.streets.turn.rules.find(rule =>
    rule.node === node && rule.tier === "monster").mix);
  assert.deepEqual(fixed.streets.turn.rules.find(rule => rule.node === "turn_ip_vs_75").mix,
    before.streets.turn.rules.find(rule => rule.node === "turn_ip_vs_75").mix);
  for (const rule of rules) {
    assert.equal(Object.keys(rule.mix).sort().join(","), [...LATER_NODES[node]].sort().join(","));
    assert.equal(Object.values(rule.mix).reduce((sum, value) => sum + value, 0), 100);
  }
  assert.deepEqual(policy, before);
});

test("lowerDefence applies the same call-to-fold adjustment to flop responses", () => {
  const policy = referencePolicyFor(inputs.spot.tree);
  const node = "bb_vs_33";
  const ruleFor = tier => policy.rules.find(rule => rule.node === node && rule.tier === tier && rule.texture === "any");
  Object.assign(ruleFor("strong"), { mix: { fold: 20, call: 50, raise: 30 } });
  Object.assign(ruleFor("medium"), { mix: { fold: 10, call: 40, raise: 50 } });
  Object.assign(ruleFor("draw"), { mix: { fold: 10, call: 10, raise: 80 } });
  Object.assign(ruleFor("air"), { mix: { fold: 90, call: 1, raise: 9 } });
  Object.assign(ruleFor("monster"), { mix: { fold: 0, call: 70, raise: 30 } });
  const before = clone(policy);

  const fixed = lowerDefence(policy, [node], "flop", 0.25);
  const find = tier => fixed.rules.find(rule => rule.node === node && rule.tier === tier && rule.texture === "any");
  assert.deepEqual(find("strong").mix, { fold: 33, call: 37, raise: 30 });
  assert.deepEqual(find("medium").mix, { fold: 20, call: 30, raise: 50 });
  assert.deepEqual(find("draw").mix, { fold: 13, call: 7, raise: 80 });
  assert.deepEqual(find("air").mix, { fold: 90, call: 1, raise: 9 });
  assert.deepEqual(find("monster").mix, before.rules.find(rule => rule.node === node && rule.tier === "monster").mix);
  for (const rule of fixed.rules.filter(rule => rule.node === node)) {
    assert.equal(Object.values(rule.mix).reduce((sum, value) => sum + value, 0), 100);
  }
  assert.deepEqual(policy, before);
});

test("lowerDefence rejects invalid shares, nodes, policy kinds, and malformed policies", () => {
  const later = referenceLaterPolicy();
  const flop = referencePolicyFor(inputs.spot.tree);
  assert.throws(() => lowerDefence(later, ["turn_ip_vs_33"], "later", 1.1), /Share/);
  assert.throws(() => lowerDefence(later, ["not_a_node"], "later", 0.25), /Unknown later/);
  assert.throws(() => lowerDefence(later, ["turn_ip_first"], "later", 0.25), /non-facing/);
  assert.throws(() => lowerDefence(flop, ["not_a_node"], "flop", 0.25), /Unknown flop/);
  assert.throws(() => lowerDefence(flop, ["btn_first"], "flop", 0.25), /non-facing/);
  assert.throws(() => lowerDefence(later, [], "other", 0.25), /Unknown policy kind/);
  const malformed = clone(later);
  malformed.streets.turn.rules[0].mix.call += 1;
  assert.throws(() => lowerDefence(malformed, ["turn_ip_vs_33"], "later", 0.25), /Invalid later action mix/);
});

test("flop and later balance report overcall above minimum defence, not a balanced response", () => {
  // Facing nodes are judged on the computed defence (defence.mjs): calling too much shows up when the
  // bettor's range is mostly bluffs, not when the policy's own call numbers are raised.
  const flopPolicy = referencePolicyFor(inputs.spot.tree);
  const overcallingFlop = clone(flopPolicy);
  for (const rule of overcallingFlop.rules) if (rule.node === "btn_first") {
    rule.mix = { check: 0, bet33: 100, bet75: 0, bet125: 0 };
  }
  // Isolate the balance check at full realization so the deliberate all-bluff-catcher
  // response exercises its overcall branch despite the calibrated default realization curve.
  const fullRealizationInputs = structuredClone(inputs);
  for (const role of ["ip", "oop"]) for (const tier of ["monster", "strong", "draw", "medium", "air"]) {
    fullRealizationInputs.config.defence_realization.flop[role][tier] = 1;
  }
  const flopFindings = checkFlopBalance(fullRealizationInputs, overcallingFlop).findings;
  const flopOvercall = flopFindings.find(item => item.check === "overcall" && item.node === "bb_vs_33");
  assert.ok(flopOvercall, JSON.stringify(flopFindings));
  assert.equal(flopOvercall.severity, "warn");
  assert.match(flopOvercall.detail, /non-monster hands defend .* versus the .* the minimum defence of .* still needs \(more than \d+ percentage points over\)\./);
  assert.equal(checkFlopBalance(fullRealizationInputs, flopPolicy).findings.some(item => item.check === "overcall" && item.node === "bb_vs_33"), false);

  const reference = referenceLaterPolicy();
  const shoveWith = tiers => {
    const policy = clone(reference);
    for (const rule of policy.streets.river.rules) if (rule.node === "river_oop_first") {
      rule.mix = { check: tiers.includes(rule.tier) ? 0 : 100, bet33: 0, bet75: 0, bet125: 0, allin: tiers.includes(rule.tier) ? 100 : 0 };
    }
    return policy;
  };
  const overcallFindings = checkLaterBalance(inputs, flopPolicy, shoveWith(["air", "medium"]), { authored: false }).findings;
  // River shoves are bluff-capped and defended at no more than the minimum defence, so even a policy that
  // shoves only air and medium hands cannot produce an over-calling response to the all-in.
  assert.equal(overcallFindings.some(item => item.check === "overcall" && item.node === "river_ip_vs_allin"), false, JSON.stringify(overcallFindings));

  const balancedFindings = checkLaterBalance(inputs, flopPolicy, shoveWith(["monster"]), { authored: false }).findings;
  assert.equal(balancedFindings.some(item => item.check === "overcall" && item.node === "river_ip_vs_allin"), false,
    JSON.stringify(balancedFindings));
});
