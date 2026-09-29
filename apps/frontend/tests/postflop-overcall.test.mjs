import test from "node:test";
import assert from "node:assert/strict";
import { checkFlopBalance, checkLaterBalance } from "../scripts/postflop-ai/balance.mjs";
import { lowerDefence } from "../scripts/postflop-ai/fix-overcall.mjs";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.mjs";
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
  const flopPolicy = referencePolicyFor(inputs.spot.tree);
  const overcallingFlop = clone(flopPolicy);
  for (const rule of overcallingFlop.rules) if (rule.node === "bb_vs_33") {
    rule.mix = { fold: 0, call: 100, raise: 0 };
  }
  const flopFindings = checkFlopBalance(inputs, overcallingFlop).findings;
  const flopOvercall = flopFindings.find(item => item.check === "overcall" && item.node === "bb_vs_33");
  assert.ok(flopOvercall, JSON.stringify(flopFindings));
  assert.equal(flopOvercall.severity, "warn");
  assert.match(flopOvercall.detail, /non-monster hands defend .* versus the .* the minimum defence of .* still needs \(more than \d+ percentage points over\)\./);

  const reference = referenceLaterPolicy();
  const overcallingLater = clone(reference);
  for (const rule of overcallingLater.streets.river.rules) if (rule.node === "river_ip_vs_allin") {
    rule.mix = { fold: 0, call: 100 };
  }
  const overcallFindings = checkLaterBalance(inputs, flopPolicy, overcallingLater, { authored: false }).findings;
  const laterOvercall = overcallFindings.find(item => item.check === "overcall" && item.node === "river_ip_vs_allin");
  assert.ok(laterOvercall, JSON.stringify(overcallFindings));
  assert.equal(laterOvercall.severity, "warn");
  assert.match(laterOvercall.detail, /non-monster hands defend .* versus the .* the minimum defence of .* still needs \(more than \d+ percentage points over\)\./);

  const balancedLater = clone(reference);
  for (const rule of balancedLater.streets.river.rules) if (rule.node === "river_ip_vs_allin") {
    rule.mix = { fold: 95, call: 5 };
  }
  const balancedFindings = checkLaterBalance(inputs, flopPolicy, balancedLater, { authored: false }).findings;
  assert.equal(balancedFindings.some(item => item.check === "overcall" && item.node === "river_ip_vs_allin"), false,
    JSON.stringify(balancedFindings));
});
