import assert from "node:assert/strict";
import test from "node:test";
import openingRanges from "../src/estimated/opening-ranges.json" with { type: "json" };
import preflopRanges from "../src/estimated/preflop-ranges.json" with { type: "json" };
import stationOpening from "../src/estimated/profiles/station/villain/opening-ranges.json" with { type: "json" };
import stationPreflop from "../src/estimated/profiles/station/villain/preflop-ranges.json" with { type: "json" };
import { computeBoard, computeLaterView } from "../src/estimated/postflop-compute.ts";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "../scripts/postflop-ai/generate.mjs";
import { resolveFlopCandidate, resolveLaterCandidate } from "../scripts/postflop-ai/candidate-source.ts";
import { comboId, defenceFor, replayOrNull } from "../scripts/postflop-ai/defence.ts";
import { parseCards } from "../scripts/postflop-ai/model.ts";
import { handTier } from "../scripts/postflop-ai/hu-hand-tier.ts";
import { laterPolicyMix, referenceLaterPolicy, referenceLaterTierMix } from "../scripts/postflop-ai/later-policy.ts";
import { policyMix, referenceMix, referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { raiseDepth } from "../scripts/postflop-ai/tree.ts";

const spotId = "HJ_open_BTN_call";
const options = { opponentProfile: "station", opponentSeat: "oop" };
const datasets = {
  "opening-ranges": openingRanges,
  "preflop-ranges": preflopRanges,
  "profiles/station/villain/opening-ranges": stationOpening,
  "profiles/station/villain/preflop-ranges": stationPreflop,
};
const inputs = loadInputs(spotId, options);
const flopPair = Object.fromEntries(["villain", "exploit"].map(role => [role, loadCandidate(inputs, role)]));
const laterPair = Object.fromEntries(["villain", "exploit"].map(role => [role,
  loadLaterCandidate(inputs, flopPair[role], role)]));
const resolvedFlop = resolveFlopCandidate(inputs, flopPair);
const resolvedLater = resolveLaterCandidate(inputs, laterPair, resolvedFlop);

const code = expected => error => error?.code === expected && error?.state === "not_generated";

test("missing deep-node policies fail closed while standard reference behavior stays available", () => {
  const flopNode = "bb_vs_raise2";
  assert.ok(raiseDepth(flopNode) >= 2);
  const flopPolicy = structuredClone(referencePolicyFor("oop_checks"));
  flopPolicy.rules = flopPolicy.rules.filter(rule => rule.node !== flopNode);
  const hand = parseCards("AsKd", 2), flop = parseCards("Jh9c2d", 3);
  assert.throws(() => policyMix(flopPolicy, flopNode, hand, flop, { requireSavedPolicy: true }), code("PROFILE_POLICY_MISSING"));
  assert.deepEqual(policyMix(flopPolicy, flopNode, hand, flop), referenceMix(flopNode, handTier(hand, flop)));

  const laterNode = "turn_oop_vs_raise2";
  const laterPolicy = structuredClone(referenceLaterPolicy());
  laterPolicy.streets.turn.rules = laterPolicy.streets.turn.rules.filter(rule => rule.node !== laterNode);
  const turn = parseCards("Jh9c2d4s", 4), pair = parseCards("JsJc", 2);
  assert.throws(() => laterPolicyMix(laterPolicy, laterNode, pair, turn, "aggressor", { requireSavedPolicy: true }), code("PROFILE_POLICY_MISSING"));
  assert.deepEqual(laterPolicyMix(laterPolicy, laterNode, pair, turn, "aggressor"),
    referenceLaterTierMix(laterNode, handTier(pair, turn)));
});

test("an unsupported flop node is marked on its own while supported profile nodes remain usable", () => {
  const incomplete = structuredClone(flopPair.villain);
  const missingNode = "bb_vs_raise2";
  incomplete.policy.rules = incomplete.policy.rules.filter(rule => rule.node !== missingNode);
  incomplete.metadata.policy_hash = sha(incomplete.policy);
  const candidates = { ...flopPair, villain: incomplete };
  const view = computeBoard({ spotId, datasets, ...options, board: "Jh9c2d", flopCandidate: candidates });
  assert.equal(view.nodes.btn_first.unavailable, undefined);
  assert.equal(view.nodes.btn_first.rows.length, 169);
  assert.equal(view.nodes[missingNode].unavailable, true);
  assert.deepEqual(view.nodes[missingNode].rows, []);
});

test("the published station/HJ branch with positive JJ/99 reach reports a missing deep turn node", () => {
  const board = parseCards("Jh9c2d4s", 4);
  const table = replayOrNull(inputs, board, { flop: ["check", "check"], turn: ["check", "bet33", "raise", "raise"] });
  assert.ok(table, "the reported action history is legal");
  const model = defenceFor(inputs, resolvedFlop.policy, resolvedLater.policy);
  const oopReach = model.rangeOf(table, board, inputs.spot.oop);
  const ipReach = model.rangeOf(table, board, inputs.spot.ip);
  assert.ok(oopReach[comboId(...parseCards("JsJc", 2))] > 0, "HJ JsJc has positive saved reach");
  assert.ok(ipReach[comboId(...parseCards("9h9s", 2))] > 0, "BTN 9h9s has positive saved reach");
  assert.throws(() => model.policyRule({ street: "turn", node: "turn_oop_vs_raise2", line: "aggressor", canRaise: true }, "blank", 0),
    code("PROFILE_POLICY_MISSING"));

  assert.throws(() => computeLaterView({ spotId, datasets, ...options, flop: "Jh9c2d", flopActions: "check,check",
    turn: "4s", turnActions: "check,bet33,raise,raise", flopCandidate: flopPair, laterCandidate: laterPair }),
  code("PROFILE_POLICY_MISSING"));
  const supported = computeLaterView({ spotId, datasets, ...options, flop: "Jh9c2d", flopActions: "check,check",
    turn: "4s", turnActions: "check,bet33", flopCandidate: flopPair, laterCandidate: laterPair });
  assert.equal(supported.node, "turn_oop_vs_33");
  assert.equal(supported.rows.length, 169);
});
