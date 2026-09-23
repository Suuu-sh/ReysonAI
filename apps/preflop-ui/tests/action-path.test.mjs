import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNextActionNode, nextActorsAfterRaise } from "../src/estimated/action-path.js";

test("a raise after BB wraps action back to the opener and prior callers in seat order", () => {
  assert.deepEqual(nextActorsAfterRaise("BB", ["BTN", "SB", "BB"]), ["BTN", "SB"]);
});

test("a heads-up BB 3bet creates the opener response node only when the selected hand can 3bet", () => {
  const node = buildNextActionNode({
    rangeType: "response",
    opener: "BTN",
    hero: "BB",
    currentHand: { three_bet: 75 },
  });

  assert.deepEqual(node, {
    branchLabel: "BBが3betした場合",
    title: "3bet後の応答",
    actions: ["Fold", "Call", "4bet"],
    actors: ["BTN"],
    multiway: false,
  });
  assert.equal(buildNextActionNode({
    rangeType: "response",
    opener: "BTN",
    hero: "BB",
    currentHand: { three_bet: 0 },
  }), null);
  assert.equal(buildNextActionNode({
    rangeType: "response",
    opener: "BTN",
    hero: "SB",
    currentHand: { three_bet: 75 },
  }), null);
});

test("a multiway BB raise reopens each live participant without using heads-up frequencies", () => {
  const node = buildNextActionNode({
    rangeType: "response",
    opener: "BTN",
    hero: "BB",
    callers: ["SB"],
  });

  assert.deepEqual(node.actors, ["BTN", "SB"]);
  assert.equal(node.multiway, true);
  assert.equal(buildNextActionNode({
    rangeType: "response",
    opener: "BTN",
    hero: "BB",
    callers: ["SB"],
    foldedHero: true,
  }), null);
});

test("an opener 4bet creates a response node for the original 3bettor", () => {
  const node = buildNextActionNode({
    rangeType: "three_bet",
    opener: "BTN",
    hero: "BB",
    currentHand: { four_bet: 20 },
  });

  assert.deepEqual(node.actors, ["BB"]);
  assert.equal(node.branchLabel, "BTNが4betした場合");
  assert.equal(node.title, "4bet後の応答");
  assert.deepEqual(node.actions, ["Fold", "Call", "All-in"]);
  assert.equal(buildNextActionNode({
    rangeType: "four_bet",
    opener: "BTN",
    hero: "BB",
    currentHand: { all_in: 100 },
  }), null);
});
