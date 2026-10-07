import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { comboId, defenceFor, replayDecision } from "../scripts/postflop-ai/defence.ts";
import { NODES, effectiveMix, referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.ts";
import { parseCards } from "../scripts/postflop-ai/model.ts";
import { rake, settle } from "../scripts/postflop-ai/engine.ts";
import { profileReferenceFacts } from "../scripts/postflop-ai/profile-reference.ts";
import { flopUiComboFactsCanonical } from "../scripts/postflop-ai/flop-ui-facts.ts";
import { explainLaterCombo } from "../scripts/postflop-ai/explain-later.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/profile-mix-cases.json", import.meta.url), "utf8"));
const base = { ...loadInputs("BTN_open_BB_call"), seatRows: {
  BTN: ["AA", "KK", "72o"].map(hand => ({ hand, freq: 100 })),
  BB: ["QQ", "JJ", "T9s", "72o"].map(hand => ({ hand, freq: 100 })),
} };
const flop = parseCards(fixture.flop, 3), river = parseCards(fixture.river, 5);
const profiles = ["nit", "station", "lag", "maniac"];
const inputsFor = (opponentProfile = "maniac", opponentSeat = "oop") => ({ ...base, opponentProfile, opponentSeat, adjusted: true });
function policies() {
  const flopPolicy = referencePolicyFor(base.spot.tree), laterPolicy = referenceLaterPolicy();
  for (const rule of flopPolicy.rules) {
    if (rule.node.endsWith("_first")) rule.mix = { ...fixture.flop_first };
    else if (NODES[rule.node].includes("raise")) rule.mix = { ...fixture.flop_facing };
    else rule.mix = { fold: 74, call: 26 };
  }
  for (const street of ["turn", "river"]) for (const rule of laterPolicy.streets[street].rules) {
    rule.mix = rule.node.endsWith("_first") ? Object.fromEntries(LATER_NODES[rule.node].map(action => [action, action === "bet125" && street === "turn" ? 60 : fixture.later_first[action]]))
      : LATER_NODES[rule.node].includes("raise") ? { ...fixture.later_facing } : { ...fixture.allin_facing };
  }
  return { flopPolicy, laterPolicy };
}
const { flopPolicy, laterPolicy } = policies();
const mixAt = (inputs, board, path, cards) => {
  const table = replayDecision(inputs, board, path), model = defenceFor(inputs, flopPolicy, laterPolicy);
  const node = table.log.at(-1).node, combo = parseCards(cards, 2), raw = model.baseMix(table, board, node, combo);
  return { table, model, node, combo, raw, mix: model.mix(table, board, node, combo, raw) };
};

test("all profile IDs bypass facing defence for both seats on flop/turn/river", () => {
  for (const profile of profiles) for (const opponentSeat of ["ip", "oop"]) {
    const inputs = inputsFor(profile, opponentSeat);
    for (const [board, path, cards, expected] of [
      [flop, { flop: ["bet75"] }, "QsQc", fixture.flop_facing],
      [flop, { flop: ["bet75", "raise"] }, "AsAc", fixture.flop_facing],
      [river.slice(0, 4), { flop: ["check"], turn: ["bet75"] }, "AsAc", fixture.later_facing],
      [river.slice(0, 4), { flop: ["check"], turn: ["check", "bet75"] }, "QsQc", fixture.later_facing],
      [river, { flop: ["check"], turn: ["check", "check"], river: ["bet75"] }, "AsAc", fixture.later_facing],
      [river, { flop: ["check"], turn: ["check", "check"], river: ["check", "bet75"] }, "QsQc", fixture.later_facing],
    ]) {
      const result = mixAt(inputs, board, path, cards);
      assert.deepEqual(result.mix, expected, `${profile}/${opponentSeat}/${result.node}`);
      assert.equal(result.model.betting(result.table, board, result.node), null);
      const context = result.model.context(result.table, board, result.node);
      assert.equal(result.model.floorOf(context), null);
      assert.equal(result.model.ceilingOf(context), null);
    }
  }
});

test("profile river bets and all-ins retain raw bluff share and high-SPR all-in frequency at either seat", () => {
  const inputs = inputsFor();
  for (const [path, cards] of [
    [{ flop: ["check"], turn: ["check", "check"], river: [] }, "7s2d"],
    [{ flop: ["check"], turn: ["check", "check"], river: ["check"] }, "7s2d"],
  ]) {
    const result = mixAt(inputs, river, path, cards);
    assert.deepEqual(result.mix, fixture.later_first);
    assert.equal(result.mix.allin, 45); // 97.5/5.5 is above the balanced SPR cap.
    const balanced = defenceFor(inputs, flopPolicy, laterPolicy, { profileMode: false });
    assert.equal(balanced.mix(result.table, river, result.node, result.combo, result.raw).allin, 0);
  }
});

test("profile reach follows the same saved mixes, including high-SPR river shoves and legal raise-to-call", () => {
  const inputs = inputsFor();
  const paths = { flop: ["bet75", "call"], turn: ["check", "check"], river: ["allin"] };
  const table = replayDecision(inputs, river, paths), model = defenceFor(inputs, flopPolicy, laterPolicy);
  const id = comboId(...parseCards("AsAc", 2));
  assert.ok(Math.abs(model.rangeOf(table, river, "BTN")[id] - 0.35 * 0.2) < 1e-12);
  const bbId = comboId(...parseCards("QsQc", 2));
  assert.ok(Math.abs(model.rangeOf(table, river, "BB")[bbId] - 0.26 * 0.2 * 0.45) < 1e-12);
  // Create a real stack-capped raise response rather than manually marking legality.
  const small = { ...inputs, spot: { ...inputs.spot, stackBb: 3 } };
  const facing = mixAt(small, flop, { flop: ["bet125"] }, "QsQc");
  assert.equal(facing.table.log.at(-1).canRaise, false);
  assert.deepEqual(facing.mix, effectiveMix(fixture.flop_facing, false));
  // All-in paths end before later decisions; the saved log still proves legal action mixing.
  assert.equal(facing.mix.call, 37);
});

test("profile facts keep raw shown mix separate from the fully evaluated one-step EV reference", () => {
  const inputs = inputsFor("station", "oop");
  const result = mixAt(inputs, river, { flop: ["check"], turn: ["check", "check"], river: ["check"] }, "AsAc");
  const beforeReach = result.model.rangeOf(result.table, river, "BB").slice();
  const facts = profileReferenceFacts(inputs, flopPolicy, laterPolicy, result.table, river, result.node, result.combo, result.raw);
  assert.equal(facts.kind, "profile_policy_supplement_not_solver");
  assert.equal(facts.role, "exploit");
  assert.deepEqual(facts.shown_mix, fixture.later_first);
  assert.equal(facts.balanced_mix.allin, 0);
  assert.deepEqual(facts.evaluated_actions, facts.legal_actions);
  assert.ok(facts.evaluated_actions.includes("allin"));
  assert.ok(facts.max_ev_action);
  assert.equal(facts.unsupported_reason, null);
  assert.deepEqual(result.model.mix(result.table, river, result.node, result.combo, result.raw), fixture.later_first);
  assert.deepEqual(result.model.rangeOf(result.table, river, "BB"), beforeReach);
  const missing = profileReferenceFacts(inputs, flopPolicy, laterPolicy, null, river, result.node, result.combo, result.raw);
  assert.equal(missing.max_ev_action, null);
  assert.match(missing.unsupported_reason, /replayed/);
});

test("facing reference evaluates raise too, or explicitly withholds a complete maximum", () => {
  const inputs = inputsFor();
  const result = mixAt(inputs, river, { flop: ["check"], turn: ["check", "check"], river: ["bet75"] }, "AsAc");
  const facts = profileReferenceFacts(inputs, flopPolicy, laterPolicy, result.table, river, result.node, result.combo, result.raw);
  assert.deepEqual(facts.legal_actions, ["fold", "call", "raise"]);
  assert.ok(facts.evaluated_actions.includes("raise"));
  assert.ok(facts.max_ev_action);
  assert.equal(facts.action_ev_bb.fold, 0);
  assert.deepEqual(facts.shown_mix, fixture.later_facing);
});

test("incomplete opponent support does not claim a call/fold-only maximum when raising is legal", () => {
  const inputs = { ...inputsFor(), seatRows: { ...base.seatRows, BB: [] } };
  const result = mixAt(inputs, river, { flop: ["check"], turn: ["check", "check"], river: ["bet75"] }, "AsAc");
  const facts = profileReferenceFacts(inputs, flopPolicy, laterPolicy, result.table, river, result.node, result.combo, result.raw);
  assert.deepEqual(facts.legal_actions, ["fold", "call", "raise"]);
  assert.deepEqual(facts.evaluated_actions, ["fold"]);
  assert.equal(facts.max_ev_action, null);
  assert.ok(facts.unsupported_actions.call);
  assert.ok(facts.unsupported_actions.raise);
  assert.match(facts.unsupported_reason, /unsupported/);
});

test("flop UI and later explanations include profile-only supplement and standard output remains unchanged", () => {
  const common = { boardCards: flop, node: "bb_vs_75", cards: "QsQc", history: ["bet75"], policy: flopPolicy };
  const facts = flopUiComboFactsCanonical({ ...common, inputs: inputsFor("nit", "oop") });
  assert.equal(facts.profile_reference.role, "villain");
  assert.deepEqual(facts.profile_reference.shown_mix, fixture.flop_facing);
  const original = flopUiComboFactsCanonical({ ...common, inputs: base });
  const standard = flopUiComboFactsCanonical({ ...common, inputs: { ...base, opponentProfile: "standard", opponentSeat: "oop" } });
  assert.deepEqual(standard, original);
  assert.equal("profile_reference" in original, false);
  const later = explainLaterCombo({ inputs: inputsFor(), flopPolicy, laterPolicy, flop: fixture.flop,
    flopActions: "check", turn: "2s", turnActions: "check,check", river: "6h", riverActions: "bet75", cards: "AsAc" });
  assert.deepEqual(later.profile_reference.shown_mix, fixture.later_facing);
  assert.equal(later.profile_reference.role, "exploit");
});

test("absent/default options retain the same standard defence instance and policy output", () => {
  const legacy = defenceFor(base, flopPolicy, laterPolicy);
  assert.equal(legacy.profileMode, false);
  assert.equal(legacy, defenceFor(base, flopPolicy, laterPolicy, { profileMode: false }));
  const table = replayDecision(base, river, { flop: ["check"], turn: ["check", "check"], river: ["bet75"] });
  const node = table.log.at(-1).node, combo = parseCards("AsAc", 2), raw = legacy.baseMix(table, river, node, combo);
  assert.deepEqual(legacy.mix(table, river, node, combo, raw), defenceFor({ ...base, opponentProfile: "standard" }, flopPolicy, laterPolicy).mix(table, river, node, combo, raw));
  assert.equal(profileReferenceFacts(base, flopPolicy, laterPolicy, table, river, node, combo, raw), null);
});


test("folded aggressive reference refunds unmatched bets and raises before rake, matching engine settlement", () => {
  const inputs = inputsFor(), alwaysFold = structuredClone(laterPolicy);
  for (const street of ["turn", "river"]) for (const rule of alwaysFold.streets[street].rules) {
    if ("fold" in rule.mix) rule.mix = Object.fromEntries(Object.keys(rule.mix).map(action => [action, action === "fold" ? 100 : 0]));
  }
  const model = defenceFor(inputs, flopPolicy, alwaysFold), combo = parseCards("7s2d", 2);
  for (const [path, aggressiveActions, expectedMax] of [
    [{ flop: ["check"], turn: ["check", "check"], river: [] }, ["bet33", "bet75", "bet125", "allin"], "bet33"],
    [{ flop: ["check"], turn: ["check", "check"], river: ["bet75"] }, ["raise"], "raise"],
  ]) {
    const table = replayDecision(inputs, river, path), node = table.log.at(-1).node;
    const actor = table.log.at(-1).seat, opponent = table.other(actor), originalStack = table.stacks[actor];
    const raw = model.baseMix(table, river, node, combo);
    const facts = profileReferenceFacts(inputs, flopPolicy, alwaysFold, table, river, node, combo, raw);
    assert.deepEqual(facts.evaluated_actions, facts.legal_actions);
    for (const action of aggressiveActions) {
      const folded = replayDecision(inputs, river, { ...path, river: [...path.river, action] });
      const wager = folded.pot - table.pot, excess = Math.max(0, folded.invested[actor] - folded.invested[opponent]);
      const matchedPot = folded.pot - excess;
      assert.ok(excess > 0);
      folded.winner = actor; // The immediate responder chooses Fold.
      settle(folded, {}, river);
      assert.ok(Math.abs(folded.pot - matchedPot) < 1e-12);
      assert.ok(Math.abs(folded.stacks[actor] - (originalStack - wager + excess)) < 1e-12);
      const settledIncrement = folded.stacks[actor] - originalStack + folded.pot - rake(folded.pot);
      const expected = table.pot - rake(matchedPot);
      assert.ok(Math.abs(settledIncrement - expected) < 1e-12);
      assert.equal(facts.action_ev_bb[action], Math.round(expected * 1e4) / 1e4);
    }
    // All first-node bet sizes now have identical fold payoff rather than fake
    // larger-wager rake penalties; the maximum remains deterministic on ties.
    assert.equal(facts.max_ev_action, expectedMax);
    assert.equal(profileReferenceFacts(inputs, flopPolicy, alwaysFold, table, river, node, combo, raw).max_ev_action, expectedMax);
    assert.deepEqual(model.mix(table, river, node, combo, raw), raw);
  }
});
