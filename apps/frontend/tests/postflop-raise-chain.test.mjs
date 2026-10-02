import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RAISES, NODES, flopState, historyFor, nodeRole, raiseDepth, raiseNode, treeHistories } from "../scripts/postflop-ai/tree.mjs";
import { LATER_NODES, streetHistories, streetState } from "../scripts/postflop-ai/later-tree.mjs";
import { RAISE_LAST, RAISE_REFERENCE, effectiveMix, policyMix, referencePolicyFor, validatePolicy } from "../scripts/postflop-ai/policy.mjs";
import { laterPolicyMix, referenceLaterPolicy, validateLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { parseCards, TIERS } from "../scripts/postflop-ai/model.mjs";
import { createTable, playFlop } from "../scripts/postflop-ai/engine.mjs";
import { spotById } from "../scripts/postflop-ai/spots.mjs";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { decisionOptions, flopDecision } from "../src/estimated/postflop-trial.ts";

test("flop raise chains alternate seats up to MAX_RAISES and the last node is fold/call", () => {
  assert.equal(MAX_RAISES, 4);
  assert.deepEqual([1, 2, 3, 4].map(k => raiseNode(k, "ip")), ["btn_vs_raise", "bb_vs_raise2", "btn_vs_raise3", "bb_vs_raise4"]);
  assert.deepEqual([1, 2, 3, 4].map(k => raiseNode(k, "oop")), ["oop_vs_raise", "ip_vs_raise2", "oop_vs_raise3", "ip_vs_raise4"]);
  assert.deepEqual(NODES.bb_vs_raise4, ["fold", "call"]);
  assert.deepEqual(NODES.btn_vs_raise3, ["fold", "call", "raise"]);
  assert.equal(nodeRole("bb_vs_raise2"), "oop");
  assert.equal(nodeRole("ip_vs_raise2"), "ip");
  assert.equal(raiseDepth("ip_vs_raise4"), 4);
  assert.equal(raiseDepth("bb_vs_75"), 0);
  const raises = n => ["bet75", ...Array(n).fill("raise")];
  assert.deepEqual([1, 2, 3, 4].map(n => flopState("oop_checks", raises(n)).node), ["btn_vs_raise", "bb_vs_raise2", "btn_vs_raise3", "bb_vs_raise4"]);
  assert.deepEqual([1, 2, 3, 4].map(n => flopState("oop_leads", raises(n)).node), ["oop_vs_raise", "ip_vs_raise2", "oop_vs_raise3", "ip_vs_raise4"]);
  assert.throws(() => flopState("oop_checks", raises(5)), /Illegal/);
  assert.deepEqual(flopState("oop_checks", [...raises(3), "fold"]).end, { type: "raise-fold", winner: "oop", raises: 3 });
  assert.deepEqual(flopState("oop_checks", [...raises(2), "call"]).end, { type: "raise-call", raises: 2 });
  assert.equal(historyFor("oop_checks", "bb_vs_raise2", "bet75").join(), "bet75,raise,raise");
  assert.equal(Object.keys(treeHistories("oop_checks")).length, 4 + 12);
});

test("turn and river raise chains", () => {
  for (const street of ["turn", "river"]) {
    assert.deepEqual(LATER_NODES[`${street}_ip_vs_raise4`], ["fold", "call"]);
    assert.deepEqual(LATER_NODES[`${street}_oop_vs_raise3`], ["fold", "call", "raise"]);
    const bet = ["bet75", "raise", "raise", "raise", "raise"];
    assert.deepEqual([1, 2, 3, 4].map(n => streetState(street, ["check", ...bet.slice(0, n + 1)]).node),
      [`${street}_ip_vs_raise`, `${street}_oop_vs_raise2`, `${street}_ip_vs_raise3`, `${street}_oop_vs_raise4`]);
    assert.deepEqual(streetState(street, [...bet.slice(0, 3), "fold"]).end, { type: "raise-fold", winner: "oop", raises: 2 });
    assert.throws(() => streetState(street, [...bet, "raise"]), /Illegal/);
  }
  assert.equal(streetHistories("river")["allin"].node, "river_ip_vs_allin");
  assert.deepEqual(LATER_NODES.river_ip_vs_allin, ["fold", "call"]);
});

test("policies saved before re-raises stay valid and fall back to the reference mixes", () => {
  const full = referencePolicyFor("oop_checks");
  const legacy = structuredClone(full);
  legacy.rules = legacy.rules.filter(rule => raiseDepth(rule.node) < 2);
  for (const rule of legacy.rules) if (rule.node === "btn_vs_raise") rule.mix = { fold: rule.mix.fold, call: rule.mix.call + rule.mix.raise };
  assert.equal(validatePolicy(legacy, "oop_checks"), legacy);
  const snapshot = JSON.stringify(legacy);
  const hole = parseCards("AsAd", 2), flop = parseCards("Ks7d2c", 3);
  assert.equal(policyMix(legacy, "btn_vs_raise", hole, flop).raise, 0);
  assert.deepEqual(policyMix(legacy, "bb_vs_raise2", hole, flop), policyMix(full, "bb_vs_raise2", hole, flop));
  assert.equal(JSON.stringify(legacy), snapshot, "rules are never mutated");
  const later = referenceLaterPolicy(), legacyLater = structuredClone(later);
  for (const street of ["turn", "river"]) legacyLater.streets[street].rules = legacyLater.streets[street].rules.filter(rule => raiseDepth(rule.node) < 2);
  assert.equal(validateLaterPolicy(legacyLater), legacyLater);
  const board = parseCards("Ks7d2c9h", 4);
  assert.deepEqual(laterPolicyMix(legacyLater, "turn_ip_vs_raise2", hole, board, "aggressor"), laterPolicyMix(later, "turn_ip_vs_raise2", hole, board, "aggressor"));
});

test("re-raise frequency is tiered and shrinks with depth; raise folds into call when impossible", () => {
  // Value tiers raise less as they get weaker and as the raise chain deepens; re-raises (depth 2+)
  // also keep a few draw/air bluffs, which never exceed the monster share and shrink with depth.
  const value = ["monster", "strong", "medium"], bluffs = ["draw", "air"];
  for (const depth of [1, 2, 3]) {
    const raises = value.map(tier => RAISE_REFERENCE[depth][tier][2]);
    assert.deepEqual(raises, [...raises].sort((a, b) => b - a));
    for (const tier of TIERS) {
      assert.equal(RAISE_REFERENCE[depth][tier].reduce((a, b) => a + b), 100);
      assert.ok(RAISE_REFERENCE[depth][tier][2] <= RAISE_REFERENCE[depth].monster[2]);
    }
  }
  for (const tier of value) assert.ok(RAISE_REFERENCE[1][tier][2] >= RAISE_REFERENCE[2][tier][2] && RAISE_REFERENCE[2][tier][2] >= RAISE_REFERENCE[3][tier][2]);
  for (const tier of bluffs) assert.ok(RAISE_REFERENCE[2][tier][2] > 0 && RAISE_REFERENCE[2][tier][2] >= RAISE_REFERENCE[3][tier][2]);
  for (const tier of TIERS) assert.equal(RAISE_LAST[tier].reduce((a, b) => a + b), 100);
  assert.deepEqual(effectiveMix({ fold: 10, call: 60, raise: 30 }, false), { fold: 10, call: 90, raise: 0 });
  const mix = { fold: 10, call: 60, raise: 30 };
  assert.equal(effectiveMix(mix, true), mix);
});

test("all-in cutoff: after an all-in raise only fold/call is offered and a requested raise plays as a call", () => {
  const spot = spotById("UTG_open_HJ_4bp_call");
  const facingAllIn = flopDecision(["bet75", "raise"], spot);
  assert.deepEqual(facingAllIn.options.map(option => option.action), ["fold", "call"]);
  assert.equal(facingAllIn.node, "oop_vs_raise");
  // The requested raise over an all-in is a call (it ends the flop); nothing may follow it.
  const asCall = flopDecision(["bet75", "raise", "raise"], spot);
  assert.equal(asCall.history.at(-1), "UTG Call All-in");
  assert.throws(() => flopDecision(["bet75", "raise", "raise", "call"], spot), /Illegal/);
  const done = flopDecision(["bet75", "raise", "call"], spot);
  assert.ok(done.result);
  // Engine: the same request is recorded as a call.
  const table = createTable(spot);
  playFlop(table, spot.tree, (seat, node) => ({ oop_first: "bet75", ip_vs_75: "raise" })[node] ?? "raise", { ...loadInputs("BTN_open_BB_call").config });
  assert.deepEqual(table.path.flop, ["bet75", "raise", "raise"].slice(0, 2).concat(table.path.flop.slice(2)));
  assert.equal(table.log.at(-1).canRaise, false);
  assert.equal(table.log.at(-1).action, "call");
});

test("labels carry real amounts (ja/en), never '3×' or a bare percentage", () => {
  const first = flopDecision([], undefined);
  assert.deepEqual(first.labels, { check: "Check", bet33: "Bet 1.82 (33%)", bet75: "Bet 4.13 (75%)", bet125: "Bet 6.88 (125%)" });
  assert.equal(first.labelsJa.bet75, "ベット 4.13 (75%)");
  const facing = flopDecision(["bet75"]);
  assert.equal(facing.labels.call, "Call 4.13");
  assert.equal(facing.labels.raise, "Raise 12.39 (60%)");
  assert.equal(facing.labelsJa.raise, "レイズ 12.39 (60%)");
  assert.match(flopDecision(["bet75", "raise"]).labels.raise, /^Raise 37\.17 \(\d+%\)$/);
  const all = [first, facing, flopDecision(["bet75", "raise"]), flopDecision(["bet75", "raise", "raise"])]
    .flatMap(decision => [...Object.values(decision.labels), ...Object.values(decision.labelsJa)]);
  for (const label of all) {
    assert.doesNotMatch(label, /3×|3倍/);
    assert.ok(!label.includes("%") || /\(\d+%\)$/.test(label), label);
  }
  const spot = spotById("UTG_open_SB_4bp_call");
    assert.match(flopDecision([], spot).labels.bet125, /^All-in 74$/);
  assert.match(flopDecision([], spot).labelsJa.bet125, /^オールイン 74$/);
  const turn = decisionOptions({ pot: 10, committed: { ip: 0, oop: 0 }, stacks: { ip: 90, oop: 90 } }, "turn_oop_first", "turn", "ja");
  assert.deepEqual(turn.map(option => option.label), ["チェック", "ベット 3.3 (33%)", "ベット 7.5 (75%)", "ベット 12.5 (125%)"]);
});

test("engine and replay agree on chips for repeated raises", () => {
  const spot = spotById("BTN_open_BB_call");
  const paths = [["bet33", "raise", "raise", "call"], ["bet75", "raise", "raise", "raise", "call"], ["bet33", "raise", "raise", "raise", "raise", "call"],
    ["bet33", "raise", "raise", "fold"], ["bet125", "raise", "call"]];
  for (const path of paths) {
    const decision = flopDecision(path, spot);
    const table = createTable(spot);
    playFlop(table, spot.tree, (seat, node, step) => path[step], loadInputs(spot.id).config);
    assert.equal(decision.potBb ?? decision.pot, table.winner && ["fold", "raise-fold"].includes(flopState(spot.tree, path).end?.type)
      ? decision.potBb : table.pot, path.join());
    if (!flopState(spot.tree, path).end || !["fold", "raise-fold"].includes(flopState(spot.tree, path).end.type)) assert.equal(decision.potBb, table.pot, path.join());
  }
});
