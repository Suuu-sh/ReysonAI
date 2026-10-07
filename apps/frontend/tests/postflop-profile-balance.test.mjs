import test from "node:test";
import assert from "node:assert/strict";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { checkFlopBalance, checkLaterBalance, checkProfileBalance } from "../scripts/postflop-ai/balance.mjs";
import { referencePolicyFor, NODES } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.ts";
import { parseCards } from "../scripts/postflop-ai/model.ts";

const base = loadInputs("BTN_open_BB_call");
const inputs = { ...base, opponentProfile: "station", opponentSeat: "oop" };
const flop = referencePolicyFor(base.spot.tree);
const later = referenceLaterPolicy();
const clone = value => structuredClone(value);
const errors = result => result.findings.filter(item => item.severity === "error");
const pure = (node, action) => Object.fromEntries((NODES[node] ?? LATER_NODES[node])
  .map(name => [name, name === action ? 100 : 0]));
const board = parseCards("As7h2d", 3);
const request = (cards, path) => ({ requestedPaths: [{ board: cards, path }] });

test("profile structural validation rejects illegal actions, sums, nodes and missing coverage", () => {
  const illegal = clone(flop);
  illegal.rules[0].mix.fold = 0;
  const wrongSum = clone(flop);
  wrongSum.rules[0].mix.check -= 1;
  const badNode = clone(flop);
  badNode.rules[0].node = "oop_first"; // Not present in the oop_checks tree.
  const uncovered = clone(flop);
  uncovered.rules = uncovered.rules.filter(rule => rule.node !== "btn_first" || rule.tier !== "air");
  for (const policy of [illegal, wrongSum, badNode, uncovered]) {
    const result = checkProfileBalance(inputs, policy);
    assert.equal(errors(result).length, 1);
    assert.equal(errors(result)[0].check, "profile-structure");
  }
  const invalidLater = clone(later);
  invalidLater.streets.turn.rules[0].mix.fold = 0;
  assert.equal(errors(checkLaterBalance(inputs, flop, invalidLater))[0].check, "profile-structure");
});

test("profile extremes warn without errors or applying standard balance targets", () => {
  const policy = clone(flop), continuation = clone(later);
  for (const rule of policy.rules) if (rule.node === "bb_vs_33" && rule.tier === "monster") rule.mix = pure(rule.node, "fold");
  for (const rule of continuation.streets.river.rules) if (rule.node === "river_oop_first" && rule.tier === "air") rule.mix = pure(rule.node, "allin");
  const result = checkLaterBalance(inputs, policy, continuation, { authored: true });
  assert.deepEqual(errors(result), []);
  assert.ok(result.findings.some(item => item.check === "monster-fold" && item.node === "bb_vs_33"));
  assert.ok(result.findings.some(item => item.check === "air-allin" && item.node === "river_oop_first"));
  assert.ok(result.findings.some(item => item.check === "profile-contradiction" && item.role === "oop"));
  assert.ok(result.findings.every(item => !["no-overrides", "overfold", "overcall", "bluff-ratio"].includes(item.check)));
  assert.ok(checkProfileBalance({ ...inputs, opponentProfile: "maniac" }, policy, continuation).findings
    .some(item => item.check === "air-allin" && item.severity === "warn"));
});

test("nit/station trait advisories constrain the opponent seat, not exploit bluffs", () => {
  const policy = clone(flop);
  for (const rule of policy.rules) if (rule.tier === "air") {
    if (rule.node === "btn_first") rule.mix = pure(rule.node, "bet33");
    if (rule.node === "bb_vs_33") rule.mix = pure(rule.node, "raise");
  }
  const warnings = checkFlopBalance(inputs, policy).findings.filter(item => item.check === "profile-contradiction");
  assert.ok(warnings.some(item => item.node === "bb_vs_33"));
  assert.ok(warnings.every(item => item.role === "oop"));
  assert.ok(!warnings.some(item => item.node === "btn_first"));
});

test("standard checks retain strict validation and authored no-overrides errors", () => {
  const options = { boardList: [] };
  assert.deepEqual(checkFlopBalance(base, flop, options), checkFlopBalance({ ...base, opponentProfile: "standard" }, flop, options));
  const standard = checkLaterBalance({ ...base, opponentProfile: "standard" }, flop, later, options);
  assert.ok(standard.findings.some(item => item.check === "no-overrides" && item.severity === "error"));
  assert.deepEqual(errors(checkLaterBalance(inputs, flop, later, options)), []);
  const invalid = clone(flop);
  invalid.rules[0].mix.check -= 1;
  assert.throws(() => checkFlopBalance(base, invalid, options), /Invalid action mix/);
});

test("zero-weight branches are normal unless a pending decision is explicitly requested", () => {
  const checked = clone(flop);
  for (const rule of checked.rules) if (rule.node === "btn_first") rule.mix = pure(rule.node, "check");
  assert.deepEqual(errors(checkFlopBalance(inputs, checked)), []);
  assert.deepEqual(errors(checkProfileBalance(inputs, checked, null, request(board, { flop: [] }))), []);
  const impossible = checkProfileBalance(inputs, checked, null, request(board, { flop: ["bet33"] }));
  assert.equal(errors(impossible)[0].check, "unreachable-branch");
  assert.match(errors(impossible)[0].detail, /positive-weight/);
  assert.deepEqual(errors(checkProfileBalance(inputs, flop, null, request(board, { flop: ["bet33"] }))), []);
});

test("explicit pending decisions reject invalid actions and terminal or all-in continuations", () => {
  const turn = [...board, ...parseCards("3c", 1)], river = [...turn, ...parseCards("9s", 1)];
  const continuation = clone(later);
  for (const rule of continuation.streets.river.rules) if (rule.node === "river_oop_first") rule.mix = pure(rule.node, "allin");
  // A player can still respond to an all-in; calling ends betting for the hand.
  assert.deepEqual(errors(checkProfileBalance(inputs, flop, continuation,
    request(river, { flop: ["check"], turn: ["check", "check"], river: ["allin"] }))), []);
  for (const [cards, path] of [
    [board, { flop: ["fold"] }],
    [turn, { flop: ["bet33", "fold"], turn: [] }],
    [river, { flop: ["check"], turn: ["check", "check"], river: ["allin", "call"] }],
    [board, { flop: [], turn: ["check"] }],
  ]) {
    assert.equal(errors(checkProfileBalance(inputs, flop, continuation, request(cards, path)))[0].check, "unreachable-branch");
  }
});

test("engine legalization cannot create an explicitly requested extra raise branch", () => {
  const shortStack = { ...inputs, spot: { ...inputs.spot, stackBb: 1 } };
  const result = checkProfileBalance(shortStack, flop, null, request(board, { flop: ["bet33", "raise"] }));
  assert.equal(errors(result)[0].check, "unreachable-branch");
  assert.match(errors(result)[0].detail, /terminal|all-in|legalized/);
});

test("explicit reach requires compatible holecards, not just two nonempty ranges", () => {
  const colliding = { ...inputs, seatRows: {
    [inputs.spot.ip]: [{ hand: "AA", freq: 100 }], [inputs.spot.oop]: [{ hand: "AA", freq: 100 }],
  } };
  // With one ace on the board, both seats have AA combos but cannot hold them jointly.
  assert.deepEqual(errors(checkProfileBalance(colliding, flop)), []);
  const result = checkProfileBalance(colliding, flop, null, request(board, { flop: [] }));
  assert.match(errors(result)[0].detail, /compatible positive-weight/);
});

test("requested profile boards and later-policy requirements fail closed", () => {
  assert.equal(errors(checkProfileBalance(inputs, flop, null, request([0, 0, 1], { flop: [] })))[0].check, "unreachable-branch");
  assert.match(errors(checkProfileBalance(inputs, flop, null, request([...board, 0], { flop: ["check"] })))[0].detail,
    /later policy is required/);
  assert.equal(errors(checkProfileBalance(inputs, flop, null, { requestedPaths: "bad" }))[0].check, "profile-structure");
  assert.equal(errors(checkFlopBalance({ ...inputs, opponentProfile: "unknown" }, flop))[0].check, "profile-structure");
});
