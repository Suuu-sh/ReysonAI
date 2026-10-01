import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.mjs";
import { DefencePathError, comboId, defenceFor, isFacingNode, logistic, rankTable, replayDecision, requiredEquity, splitMix, tierArray } from "../scripts/postflop-ai/defence.mjs";
import { rake } from "../scripts/postflop-ai/engine.mjs";
import { boardTexture, handTier, parseCards, runoutTexture, TIERS } from "../scripts/postflop-ai/model.mjs";
import { referencePolicy, referencePolicyFor, policyMix } from "../scripts/postflop-ai/policy.mjs";
import { laterPolicyMix, referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { buildLaterView } from "../scripts/postflop-ai/local-view.mjs";
import { laterHandEvForHand } from "../scripts/postflop-ai/later-hand-ev.mjs";
import { seededRandom } from "../scripts/lib/equity.mjs";

// These tests exercise the plain bluff cap and defence; null turns the SPR all-in rule off (tested separately).
const noShoveRule = inputs => ({ ...inputs, config: { ...inputs.config, river_allin_max_pot_ratio: null } });
const base = noShoveRule(loadInputs("BTN_open_BB_call"));
const rows = (hands, freq = 100) => hands.map(hand => ({ hand, freq }));
// Same spot with tiny synthetic ranges: BB (out of position, the bettor) and BTN (the defender).
const synthetic = (bb, btn) => ({ ...base, seatRows: { BTN: btn, BB: bb } });
// A later policy in which every river_oop_first hand shoves, so the bettor range is exactly the saved range.
function alwaysShoves() {
  const policy = structuredClone(referenceLaterPolicy());
  for (const rule of policy.streets.river.rules) if (rule.node === "river_oop_first") {
    rule.mix = { check: 0, bet33: 0, bet75: 0, bet125: 0, allin: 100 };
  }
  return policy;
}
const board = parseCards("9h8d4c2s6h", 5);
const path = { flop: ["check"], turn: ["check", "check"], river: ["allin"] };
const NODE = "river_ip_vs_allin";

function river(inputs, laterPolicy = alwaysShoves(), options = {}) {
  const defence = defenceFor(inputs, referencePolicy, laterPolicy, options);
  const table = replayDecision(inputs, board, path);
  const mixOf = text => {
    const combo = parseCards(text, 2);
    return defence.mix(table, board, NODE, combo, laterPolicyMix(laterPolicy, NODE, combo, board, "checked"));
  };
  const factsOf = text => defence.facts(table, board, NODE, parseCards(text, 2));
  return { defence, table, mixOf, factsOf };
}

test("required equity is call / (final pot - capped rake), with stack caps", () => {
  // Small pot: 5% rake. 20 + 10 + 10 = 40, rake 2, need 10 / 38.
  let chips = requiredEquity({ potBefore: 20, wager: 10, call: 10 });
  assert.equal(chips.finalPot, 40);
  assert.equal(chips.rake, 2);
  assert.ok(Math.abs(chips.required - 10 / 38) < 1e-12);
  assert.ok(Math.abs(chips.mdf - 20 / 30) < 1e-12);
  // Big pot: the rake caps at 3bb. 100 + 50 + 50 = 200, rake 3, need 50 / 197.
  chips = requiredEquity({ potBefore: 100, wager: 50, call: 50 });
  assert.equal(chips.rake, 3);
  assert.ok(Math.abs(chips.required - 50 / 197) < 1e-12);
  // A call capped by the defender's stack (raise 60 over a bet of 20, only 25 more behind): C < W.
  chips = requiredEquity({ potBefore: 30, wager: 60, call: 25 });
  assert.equal(chips.finalPot, 115);
  assert.ok(Math.abs(chips.required - 25 / (115 - rake(115))) < 1e-12);
  // The engine's chips: a river shove into 5.5bb costs the whole 97.5bb stack.
  const requirement = river(base).defence.requirement(river(base).table, board, NODE);
  assert.equal(requirement.potBefore, 5.5);
  assert.equal(requirement.wager, 97.5);
  assert.equal(requirement.call, 97.5);
  assert.ok(Math.abs(requirement.required - 97.5 / (200.5 - 3)) < 1e-9);
  // A flop raise in a 3bet pot: the call is the raise minus the money already in.
  const threeBet = loadInputs("UTG_open_BB_3bet_call");
  const flop = parseCards("Js8s5d", 3);
  const table = replayDecision(threeBet, flop, { flop: ["bet75", "raise"] });
  const pending = table.log.at(-1);
  assert.equal(pending.node, "oop_vs_raise");
  const raise = defenceFor(threeBet, referencePolicyFor(threeBet.spot.tree), null).requirement(table, flop, pending.node);
  const raiser = table.log.at(-2).seat;
  assert.ok(raise.call > 0 && raise.call <= threeBet.spot.stackBb);
  assert.ok(Math.abs(raise.call - (table.invested[raiser] - table.invested[pending.seat])) < 1e-9);
  assert.ok(Math.abs(raise.finalPot - (table.pot + raise.call)) < 1e-9);
});

test("the logistic split keeps the policy raise share and sums to 100", () => {
  assert.ok(Math.abs(logistic(2) - 0.8808) < 1e-4); // +4pt at scale 0.02: about 88 / 12
  const random = seededRandom(3);
  for (let round = 0; round < 500; round++) {
    const raise = Math.floor(random() * 101), share = random();
    const mix = splitMix({ fold: 100 - raise, call: 0, raise }, share);
    assert.equal(mix.raise, raise);
    assert.equal(mix.fold + mix.call + mix.raise, 100);
    assert.ok(Object.values(mix).every(value => Number.isInteger(value) && value >= 0));
    assert.deepEqual(Object.keys(mix), ["fold", "call", "raise"]);
  }
  assert.deepEqual(splitMix({ fold: 60, call: 40 }, 0.25), { fold: 75, call: 25 });
  assert.deepEqual(splitMix({ fold: 0, call: 0, raise: 100 }, 0.5), { fold: 0, call: 0, raise: 100 });
});

test("river: a pure value range makes top pair fold to a shove, a bluffy range makes it call", () => {
  const defenderRange = rows(["AQo", "KQo", "T9s"]);
  // The defence alone (no bluff cap on the bettor), so the bettor range is exactly the saved range.
  const uncapped = { bluffCap: false };
  const valueOnly = river(synthetic(rows(["88", "44"]), defenderRange), undefined, uncapped);
  assert.deepEqual(valueOnly.mixOf("Ac9d"), { fold: 100, call: 0 });
  assert.equal(valueOnly.factsOf("Ac9d").equity, 0);
  assert.equal(valueOnly.factsOf("Ac9d").bettor_range.bluff_pct, 0);

  // Sets of eights plus a growing number of air hands (JTo): the break-even is C / (F - rake) = 49.4%.
  const points = [0, 2, 3.5, 6, 8, 12, 30, 100].map(freq => {
    const scenario = river(synthetic([{ hand: "88", freq: 100 }, { hand: "JTo", freq }], defenderRange), undefined, uncapped);
    const facts = scenario.factsOf("Ac9d");
    return { freq, bluff: facts.bettor_range.bluff_pct, call: scenario.mixOf("Ac9d").call, equity: facts.equity };
  });
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i].bluff >= points[i - 1].bluff, JSON.stringify(points));
    assert.ok(points[i].call >= points[i - 1].call, JSON.stringify(points));
  }
  for (const point of points) {
    if (point.bluff <= 40) assert.ok(point.call <= 25, JSON.stringify(point));
    if (point.bluff >= 60) assert.ok(point.call >= 75, JSON.stringify(point));
  }
  assert.ok(points.some(point => point.bluff <= 40) && points.some(point => point.bluff >= 60), JSON.stringify(points));
  // Top pair beats every bluff and loses to every set: its equity is the bluff share.
  for (const point of points) assert.ok(Math.abs(point.equity - point.bluff / 100) < 1e-3, JSON.stringify(point));
});

test("blockers: holding a card of the bettor's value combos raises equity, and the facts report the removal", () => {
  const scenario = river(synthetic(rows(["AA", "JTo"]), rows(["AQo", "KQo"])));
  const blocking = scenario.factsOf("AcQd"), free = scenario.factsOf("KcQd");
  // Both hands are high card: they beat JTo, lose to AA. The Ac removes half of the aces.
  assert.ok(blocking.equity > free.equity, `${blocking.equity} <= ${free.equity}`);
  const value = blocking.bettor_range.value_weight, bluff = blocking.bettor_range.bluff_weight;
  const expected = bluff / (bluff + value / 2);
  assert.ok(Math.abs(blocking.equity - expected) < 1e-3, `${blocking.equity} vs ${expected}`);
  assert.ok(Math.abs(free.equity - bluff / (bluff + value)) < 1e-3);
  assert.ok(Math.abs(blocking.blockers.value_removed_pct - 50) < 1e-6, JSON.stringify(blocking.blockers));
  assert.equal(blocking.blockers.bluff_removed_pct, 0);
  assert.equal(free.blockers.value_removed_pct, 0);
  // A card of the air range removes bluff weight (JTo: 12 combos, Jc is in 3 of them).
  const bluffBlocker = scenario.factsOf("JcKd");
  assert.ok(Math.abs(bluffBlocker.blockers.bluff_removed_pct - 25) < 1e-6, JSON.stringify(bluffBlocker.blockers));
  assert.equal(bluffBlocker.blockers.value_removed_pct, 0);
  assert.ok(bluffBlocker.equity < free.equity);
});

test("percentile and MDF facts are consistent", () => {
  const scenario = river(synthetic(rows(["88", "44", "JTo", "Q7o"]), rows(["AQo", "KQo", "T9s", "77", "55", "A5s"])));
  const combos = ["AcQd", "KcQd", "AhQs", "Td9d", "7c7h", "5c5d", "Ac5c", "KdQh"];
  const facts = combos.map(text => ({ text, ...scenario.factsOf(text) }));
  for (const item of facts) {
    assert.ok(item.percentile >= 0 && item.percentile <= 1, JSON.stringify(item));
    assert.ok(item.defence_frequency >= 0 && item.defence_frequency <= 1);
    assert.ok(item.mdf > 0 && item.mdf < 1);
    assert.ok(Math.abs(item.mdf - item.pot_before_bb / (item.pot_before_bb + item.bet_bb)) < 1e-3);
    assert.ok(item.bettor_range.value_pct + item.bettor_range.bluff_pct > 99.99);
    assert.ok(item.blockers.value_removed_pct >= 0 && item.blockers.value_removed_pct <= 100);
    assert.equal(item.required_equity, facts[0].required_equity);
  }
  // Monotone: a hand with a lower realized equity never has a higher percentile.
  for (const a of facts) for (const b of facts) if (a.realized_equity < b.realized_equity) {
    assert.ok(a.percentile <= b.percentile, `${a.text} ${a.percentile} vs ${b.text} ${b.percentile}`);
  }
  // The whole defender range: the best hand sits at the top, the worst at 0.
  const ranked = [...facts].sort((a, b) => a.realized_equity - b.realized_equity);
  assert.equal(ranked[0].percentile, 0);
  assert.ok(ranked.at(-1).percentile > ranked[0].percentile);
  // Overall defence frequency is the weighted continue share of that range.
  const context = scenario.defence.context(scenario.table, board, NODE);
  const summary = scenario.defence.summarize(context);
  assert.ok(summary.defenceFrequency >= 0 && summary.defenceFrequency <= 1);
});

test("cached tiers and policy lookups equal handTier, policyMix and laterPolicyMix", () => {
  const random = seededRandom(11);
  const flopPolicy = referencePolicy, later = referenceLaterPolicy();
  const defence = defenceFor(base, flopPolicy, later);
  for (let round = 0; round < 40; round++) {
    const cards = new Set();
    while (cards.size < 5) cards.add(Math.floor(random() * 52));
    const full = [...cards], turn = full.slice(0, 4);
    for (let n = 0; n < 60; n++) {
      const a = Math.floor(random() * 52), b = Math.floor(random() * 52);
      if (a === b) continue;
      const id = comboId(a, b), combo = [a, b];
      for (const cardsOfBoard of [full, turn, full.slice(0, 3)]) {
        const tiers = tierArray(cardsOfBoard);
        if (cardsOfBoard.includes(a) || cardsOfBoard.includes(b)) assert.equal(tiers[id], 255);
        else assert.equal(TIERS[tiers[id]], handTier(combo, cardsOfBoard));
      }
    }
  }
  const boards = { flop: parseCards("Kd9s3h", 3), turn: parseCards("Kd9s3h5c", 4), river: parseCards("Kd9s3h5cAs", 5) };
  for (const text of ["AhQd", "9c9d", "7h6h", "Tc2c", "KcJd", "5d5h"]) {
    const combo = parseCards(text, 2);
    const flopTexture = boardTexture(boards.flop);
    assert.deepEqual(defence.policyRule({ street: "flop", node: "bb_vs_75", line: null }, flopTexture, TIERS.indexOf(handTier(combo, boards.flop))),
      policyMix(flopPolicy, "bb_vs_75", combo, boards.flop));
    for (const [street, node] of [["turn", "turn_ip_vs_75"], ["river", "river_ip_vs_33"]]) {
      const cards = boards[street], texture = runoutTexture(cards), tier = TIERS.indexOf(handTier(combo, cards));
      for (const line of ["aggressor", "defender", "checked"]) {
        assert.deepEqual(defence.policyRule({ street, node, line }, texture, tier), laterPolicyMix(later, node, combo, cards, line), `${text} ${node} ${line}`);
      }
    }
  }
});

test("flop and turn realization use the configured tier and position curve while river stays exact", () => {
  const defence = defenceFor(base, referencePolicy, referenceLaterPolicy());
  const flop = parseCards("KhTh4s", 3);
  const tierCases = [
    ["KcTc", "monster", 1, 1],
    ["KcQd", "strong", 0.97, 0.92],
    ["QhJh", "draw", 0.95, 0.88],
    ["9c2d", "air", 0.75, 0.65],
  ];
  for (const [text, tier, ip, oop] of tierCases) {
    const combo = parseCards(text, 2);
    assert.equal(handTier(combo, flop), tier, text);
    assert.equal(defence.realizationFor({ street: "flop", role: "ip", board: flop }, combo), ip, `${text} flop IP`);
    assert.equal(defence.realizationFor({ street: "flop", role: "oop", board: flop }, combo), oop, `${text} flop OOP`);
    assert.equal(defence.realizationFor({ street: "turn", role: "ip", board: [...flop, parseCards("3c", 1)[0]] }, combo), ip, `${text} turn IP`);
  }
  assert.equal(defence.realizationFor({ street: "river", role: "oop", board: parseCards("KhTh4s2h3d", 5) }, parseCards("KcQd", 2)), 1);
});

test("a path that does not reach a pending decision is a DefencePathError", () => {
  assert.throws(() => replayDecision(base, board, { flop: ["check"], turn: ["check", "check"], river: ["allin", "call"] }), DefencePathError);
  assert.throws(() => replayDecision(base, board.slice(0, 4), { flop: ["bet33"], turn: [] }), DefencePathError);
  assert.equal(isFacingNode("bb_vs_33"), true);
  assert.equal(isFacingNode("btn_first"), false);
  assert.equal(isFacingNode("river_ip_vs_allin"), true);
  assert.equal(isFacingNode("turn_oop_first"), false);
  assert.equal(defenceFor(base, referencePolicy, null), defenceFor(base, referencePolicy, null));
});

const candidatesMissing = !existsSync(artifactPaths(base.spot).candidate) || !existsSync(artifactPaths(base.spot).laterCandidate);
const spot = { flop: "As7d2c", flopActions: ["check"], turn: "3s", turnActions: ["check", "check"], river: "9h" };

test("the view mix and the mix inside laterHandEvForHand are the same computed defence", { skip: candidatesMissing && ".local candidate pair is unavailable" }, () => {
  const inputs = noShoveRule(loadInputs("BTN_open_BB_call"));
  const candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
  const view = buildLaterView({ flop: spot.flop, flopActions: "check", turn: spot.turn, turnActions: "check,check", river: spot.river, riverActions: "allin" },
    inputs, candidate, later);
  assert.equal(view.node, NODE);
  for (const hand of ["AKo", "77", "T9s"]) {
    const evs = laterHandEvForHand({ ...spot, riverActions: ["allin"], hand, inputs, flopPolicy: candidate.policy, laterPolicy: later.policy, samples: 20 });
    assert.equal(evs.node, NODE);
    const viewRow = view.rows.find(row => row.hand === hand);
    for (const action of ["fold", "call"]) {
      assert.ok(Math.abs(viewRow.mix[action] * 100 - evs.row.mix[action]) < 0.011, `${hand} ${action}: ${viewRow.mix[action] * 100} vs ${evs.row.mix[action]}`);
    }
    // The same combo through the shared instance.
    const defence = defenceFor(inputs, candidate.policy, later.policy);
    const boardCards = parseCards("As7d2c3s9h", 5);
    const table = replayDecision(inputs, boardCards, { flop: ["check"], turn: ["check", "check"], river: ["allin"] });
    for (const detail of viewRow.combos) {
      const combo = parseCards(detail.cards, 2);
      const mix = defence.mix(table, boardCards, NODE, combo, laterPolicyMix(later.policy, NODE, combo, boardCards, "checked"));
      assert.equal(Math.round(detail.mix.call * 100), mix.call);
      assert.equal(Math.round(detail.mix.fold * 100), mix.fold);
    }
  }
});

test("bluff cap: pure value, over-bluffed and under-bluffed ranges", () => {
  const defenderRange = rows(["AQo", "KQo"]);
  const openPath = { flop: ["check"], turn: ["check", "check"], river: [] };
  const at = (bluffFreq, options) => {
    const inputs = synthetic([{ hand: "88", freq: 100 }, { hand: "JTo", freq: bluffFreq }], defenderRange);
    const policy = alwaysShoves(), defence = defenceFor(inputs, referencePolicy, policy, options);
    const table = replayDecision(inputs, board, openPath);
    const mixOf = text => {
      const combo = parseCards(text, 2);
      return defence.mix(table, board, "river_oop_first", combo, laterPolicyMix(policy, "river_oop_first", combo, board, "checked"));
    };
    const shove = defence.bettingFacts(table, board, "river_oop_first", parseCards("JdTh", 2));
    return { defence, table, mixOf, shove };
  };
  // Pure value: sets only, nothing to cap.
  const pure = at(0);
  assert.equal(pure.shove.actions.find(item => item.action === "allin").factor, 1);
  assert.deepEqual(pure.mixOf("8c8h"), { check: 0, bet33: 0, bet75: 0, bet125: 0, allin: 100 });
  // Under-bluffed: a tiny share of air stays as the policy has it.
  const under = at(0.5);
  const underShove = under.shove.actions.find(item => item.action === "allin");
  assert.ok(underShove.bluff_share_before < underShove.alpha, JSON.stringify(underShove));
  assert.equal(underShove.factor, 1);
  assert.deepEqual(under.mixOf("JcTd"), { check: 0, bet33: 0, bet75: 0, bet125: 0, allin: 100 });
  // Over-bluffed: air shoves are scaled down until the bluff share equals the caller's break-even.
  const over = at(100);
  const overShove = over.shove.actions.find(item => item.action === "allin");
  assert.equal(over.shove.combo_class, "bluff");
  assert.ok(overShove.bluff_share_before > overShove.alpha + 0.2, JSON.stringify(overShove));
  assert.ok(Math.abs(overShove.bluff_share_after - overShove.alpha) < 1e-3, JSON.stringify(overShove));
  assert.ok(overShove.bluff_after < overShove.bluff_before && overShove.value_after === overShove.value_before);
  const airMix = over.mixOf("JcTd"), valueMix = over.mixOf("8c8h");
  assert.ok(airMix.allin < 100 && airMix.check > 0, JSON.stringify(airMix));
  assert.ok(Math.abs(Object.values(airMix).reduce((sum, value) => sum + value, 0) - 100) < 1e-9);
  assert.ok(Math.abs(airMix.allin - 100 * overShove.factor) < 1e-2);
  assert.deepEqual(valueMix, { check: 0, bet33: 0, bet75: 0, bet125: 0, allin: 100 });
  // Never more bluffs than the policy: every capped frequency is at most its policy value.
  assert.ok(airMix.allin <= 100 && airMix.check >= 0);
  // The bluff cap can be switched off, and the defence's bettor range then keeps all the bluffs.
  const offMix = at(100, { bluffCap: false }).mixOf("JcTd");
  assert.deepEqual(offMix, { check: 0, bet33: 0, bet75: 0, bet125: 0, allin: 100 });
  // The defence sees the capped range: the faced all-in has a bluff share equal to the break-even.
  const faced = river(synthetic([{ hand: "88", freq: 100 }, { hand: "JTo", freq: 100 }], defenderRange));
  const facts = faced.factsOf("AcQd");
  assert.ok(Math.abs(facts.bettor_range.bluff_pct / 100 - facts.required_equity) < 2e-3, JSON.stringify([facts.bettor_range, facts.required_equity]));
});

test("regression on the saved policy: AKo's all-in EV is below its best bet and the shove range sits at the break-even", { skip: candidatesMissing && ".local candidate pair is unavailable" }, () => {
  const inputs = noShoveRule(loadInputs("BTN_open_BB_call"));
  const candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
  const boardCards = parseCards("As7d2c3s9h", 5);
  const facing = replayDecision(inputs, boardCards, { flop: ["check"], turn: ["check", "check"], river: ["allin"] });
  const capped = defenceFor(inputs, candidate.policy, later.policy), plain = defenceFor(inputs, candidate.policy, later.policy, { bluffCap: false });
  const ako = parseCards("AdKc", 2), base = laterPolicyMix(later.policy, NODE, ako, boardCards, "checked");
  const withCap = capped.facts(facing, boardCards, NODE, ako, base), without = plain.facts(facing, boardCards, NODE, ako, base);
  // The saved shove range is bluffy on this dry board; capped, its bluff share equals the caller's break-even.
  assert.ok(without.bettor_range.bluff_pct / 100 > without.required_equity + 0.15, JSON.stringify(without.bettor_range));
  assert.ok(Math.abs(withCap.bettor_range.bluff_pct / 100 - withCap.required_equity) < 0.01, JSON.stringify(withCap.bettor_range));
  const open = replayDecision(inputs, boardCards, { flop: ["check"], turn: ["check", "check"], river: [] });
  const shoveFacts = capped.bettingFacts(open, boardCards, "river_oop_first", parseCards("Ac5c", 2));
  const allin = shoveFacts.actions.find(item => item.action === "allin");
  assert.ok(allin.bluff_share_before > allin.alpha && Math.abs(allin.bluff_share_after - allin.alpha) < 1e-3, JSON.stringify(allin));
  // The capped range is defended at (no more than) the minimum defence.
  assert.ok(withCap.defence_frequency <= withCap.mdf + 1e-3, JSON.stringify([withCap.defence_frequency, withCap.mdf]));
  const evOf = hand => laterHandEvForHand({ ...spot, riverActions: [], hand, inputs, flopPolicy: candidate.policy, laterPolicy: later.policy, samples: 600 }).row.ev_bb;
  for (const hand of ["AKo", "A5s"]) {
    const ev = evOf(hand);
    assert.ok(ev.allin < Math.max(ev.bet33, ev.bet75, ev.bet125), `${hand}: ${JSON.stringify(ev)}`);
  }
});

// ---- River all-in sized by SPR ---------------------------------------------------------------------
// Deep stacks: the shove is far above the pot (> river_allin_max_pot_ratio), so its share moves to the largest bet.
// Low SPR: the shove is a natural stack-off, kept for value hands; medium hands get the big bet instead.
function riverFirst(inputs, spotBoard, laterPolicy) {
  const defence = defenceFor(inputs, referencePolicy, laterPolicy);
  const table = replayDecision(inputs, spotBoard, { flop: ["check"], turn: ["check", "check"], river: [] });
  return { table, mix: text => {
    const combo = parseCards(text, 2);
    return defence.mix(table, spotBoard, "river_oop_first", combo, laterPolicyMix(laterPolicy, "river_oop_first", combo, spotBoard, "checked"));
  } };
}

test("deep-stack river: the all-in share moves to bet125 for every hand", () => {
  const inputs = loadInputs("BTN_open_BB_call");
  const policy = structuredClone(referenceLaterPolicy());
  for (const rule of policy.streets.river.rules) if (rule.node === "river_oop_first") rule.mix = { check: 10, bet33: 0, bet75: 0, bet125: 20, allin: 70 };
  const { table, mix } = riverFirst(inputs, board, policy);
  assert.ok(Math.min(table.stacks.BB, table.stacks.BTN) / table.pot > 2.5);
  for (const hand of ["QcJd", "AcQd", "8c8h", "Ac2c", "KsKd"]) {
    const result = mix(hand);
    assert.equal(result.allin, 0, hand);
    assert.ok(Math.abs(Object.values(result).reduce((a, b) => a + b, 0) - 100) < 1e-6, hand);
    assert.ok(result.bet125 >= 20 - 1e-9, hand);
  }
  // The plain bluff cap path without the rule keeps the policy all-in.
  const off = riverFirst(noShoveRule(inputs), board, policy);
  assert.equal(off.mix("8c8h").allin, 70);
});

test("low-SPR river: the all-in is kept for value hands and removed from medium hands", () => {
  const inputs = loadInputs("UTG_open_BB_4bp_call");
  const policy = structuredClone(referenceLaterPolicy());
  for (const rule of policy.streets.river.rules) if (rule.node === "river_oop_first") rule.mix = { check: 0, bet33: 0, bet75: 0, bet125: 0, allin: 100 };
  const { table, mix } = riverFirst(inputs, board, policy);
  assert.ok(Math.min(...Object.values(table.stacks)) / table.pot <= 2.5);
  const tiers = tierArray(board);
  const tierOf = text => { const [a, b] = parseCards(text, 2); return TIERS[tiers[comboId(a, b)]]; };
  assert.equal(tierOf("8c8h"), "monster");
  assert.equal(mix("8c8h").allin, 100);
  const medium = ["Ah9c", "Ad4d", "Kc9d", "Jh8h", "Qs4h", "Ac9s", "Kd4s", "Th9s", "Kc6s"].find(text => tierOf(text) === "medium");
  assert.ok(medium, "a medium hand exists on the board");
  assert.equal(mix(medium).allin, 0);
  assert.equal(mix(medium).bet125, 100);
});
