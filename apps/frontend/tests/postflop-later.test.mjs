import test from "node:test";
import assert from "node:assert/strict";
import { seededRandom } from "../scripts/lib/equity.mjs";
import { boards, loadInputs, makeSampler, samplePair, seatRange } from "../scripts/postflop-ai/inputs.mjs";
import { parseCards, runoutTexture } from "../scripts/postflop-ai/model.mjs";
import { LATER_NODES, openingActions, streetHistories, streetNodes, streetState } from "../scripts/postflop-ai/later-tree.ts";
import { laterPolicyMix, referenceLaterMix, referenceLaterPolicy, validateLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.mjs";
import { dealRunout, playHand } from "../scripts/postflop-ai/simulation.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("later trees follow the configured 33/75/125 sizes, with all-in only on the river", () => {
  assert.deepEqual(openingActions("turn"), ["check", "bet33", "bet75", "bet125"]);
  assert.deepEqual(openingActions("river"), ["check", "bet33", "bet75", "bet125", "allin"]);
  assert.equal(streetNodes("turn").length, 16);
  assert.equal(streetNodes("river").length, 18);
  assert.deepEqual(LATER_NODES.river_ip_vs_allin, ["fold", "call"]);
  assert.deepEqual(LATER_NODES.turn_oop_vs_125, ["fold", "call", "raise"]);
  const river = streetHistories("river");
  assert.equal(river[""].node, "river_oop_first");
  assert.equal(river.check.node, "river_ip_first");
  assert.equal(river["check,bet125"].node, "river_oop_vs_125");
  assert.equal(river["bet75,raise"].node, "river_oop_vs_raise");
  assert.equal(river["bet75,raise,raise"].node, "river_ip_vs_raise2");
  assert.equal(river["bet75,raise,raise,raise"].node, "river_oop_vs_raise3");
  assert.equal(river["bet75,raise,raise,raise,raise"].node, "river_ip_vs_raise4");
  assert.deepEqual(LATER_NODES.river_ip_vs_raise4, ["fold", "call"]);
  assert.deepEqual(LATER_NODES.river_ip_vs_raise2, ["fold", "call", "raise"]);
  assert.equal(river.allin.node, "river_ip_vs_allin");
  assert.deepEqual(streetState("turn", ["check", "check"]).end, { type: "check" });
  assert.deepEqual(streetState("turn", ["bet33", "fold"]).end, { type: "fold", winner: "oop", raises: 0 });
  assert.throws(() => streetState("turn", ["allin"]), /Illegal/);
});

test("runoutTexture classifies the new card", () => {
  const t = text => runoutTexture(parseCards(text, text.length / 2));
  assert.equal(t("Ks8d3c2h"), "blank");
  assert.equal(t("9s7d2cAh"), "over");
  assert.equal(t("Ks8d3c8h"), "pair");
  assert.equal(t("Ks8d6c9h"), "straight");
  assert.equal(t("Ks8s3c2s"), "flush");
  assert.equal(t("Ks8s3s2s2d"), "pair");
  assert.equal(t("Ks8d3c2h4d"), "straight");
});

test("validateLaterPolicy accepts the reference and rejects malformed rules", () => {
  const reference = referenceLaterPolicy();
  assert.equal(validateLaterPolicy(reference), reference);
  const broken = mutate => { const copy = clone(reference); mutate(copy); return () => validateLaterPolicy(copy); };
  assert.throws(broken(p => { delete p.streets.turn.rules[0].mix.check; }), /mix/);
  assert.throws(broken(p => { p.streets.turn.rules[0].mix.check += 1; }), /mix/);
  assert.throws(broken(p => { p.streets.turn.rules[0].node = "river_oop_first"; }), /rule/);
  assert.throws(broken(p => { p.streets.turn.rules.shift(); }), /fallback/);
  assert.throws(broken(p => { p.streets.river.rules.push(clone(p.streets.river.rules[0])); }), /Duplicate/);
  assert.throws(broken(p => { p.streets.river.rules.push({ ...clone(p.streets.river.rules[0]), tier: "draw" }); }), /rule/);
});

test("laterPolicyMix prefers line+texture, then line, then texture, then the fallback", () => {
  const policy = clone(referenceLaterPolicy());
  const hole = parseCards("AhKd", 2), board = parseCards("Ks8d3c2h", 4); // top pair, blank turn
  const base = { node: "turn_oop_first", tier: "strong" };
  const mix = check => ({ check, bet33: 100 - check, bet75: 0, bet125: 0 });
  policy.streets.turn.rules.push({ ...base, line: "any", texture: "blank", mix: mix(10) });
  assert.equal(laterPolicyMix(policy, "turn_oop_first", hole, board, "aggressor").check, 10);
  policy.streets.turn.rules.push({ ...base, line: "aggressor", texture: "any", mix: mix(20) });
  assert.equal(laterPolicyMix(policy, "turn_oop_first", hole, board, "aggressor").check, 20);
  policy.streets.turn.rules.push({ ...base, line: "aggressor", texture: "blank", mix: mix(30) });
  assert.equal(laterPolicyMix(policy, "turn_oop_first", hole, board, "aggressor").check, 30);
  assert.equal(laterPolicyMix(policy, "turn_oop_first", hole, board, "defender").check, 10);
  const scaled = referenceLaterMix("river_oop_first", parseCards("AhAd", 2), parseCards("As8d3c2h9s", 5), "checked", "aggressive");
  assert.equal(Object.values(scaled).reduce((a, b) => a + b, 0), 100);
});

test("playHand conserves chips through turn/river policies, including low-SPR all-ins", () => {
  for (const spotId of ["BTN_open_BB_call", "UTG_open_SB_4bp_call", "SB_limp_BB_iso_SB_reraise_call"]) {
    const inputs = loadInputs(spotId), { spot } = inputs, board = boards()[0];
    const ip = makeSampler(seatRange(inputs, spot.ip, board.cards)), oop = makeSampler(seatRange(inputs, spot.oop, board.cards));
    const random = seededRandom(42);
    for (let i = 0; i < 400; i++) {
      const hands = samplePair(ip, oop, random, spot);
      const runout = dealRunout(hands, board.cards, random);
      const randoms = Array.from({ length: 24 }, () => random());
      for (const hero of [spot.ip, spot.oop]) for (const profile of ["standard", "passive", "aggressive"]) {
        const result = playHand({ hands, flop: board.cards, runout, hero, policy: referencePolicyFor(spot.tree), profile, randoms, spot });
        assert.ok(result.invested[spot.ip] <= spot.stackBb + 1e-9 && result.invested[spot.oop] <= spot.stackBb + 1e-9);
      }
    }
  }
});

test("flop bets at low SPR merge into all-in (≥ 67% of the remaining stack)", async () => {
  const { flopDecision } = await import("../src/estimated/postflop-trial.ts");
  const { spotById } = await import("../scripts/postflop-ai/spots.mjs");
  const spot = spotById("UTG_open_SB_4bp_call"); // pot 53BB, stacks 74BB
  const big = flopDecision(["bet125"], spot);
  assert.match(big.history.at(-1), /All-in 74/);
  const small = flopDecision(["bet33"], spot);
  assert.match(small.history.at(-1), /Bet 17\.49 \(33%\)$/);
});

test("the turn/river prompt names every later node, feature and the fallback count", async () => {
  const { promptForLater } = await import("../scripts/postflop-ai/generate.mjs");
  const prompt = promptForLater(loadInputs("CO_open_BTN_call"));
  for (const node of Object.keys(LATER_NODES)) assert.ok(prompt.includes(node), node);
  assert.match(prompt, /\(98 in total\)/);
  assert.match(prompt, /blank\/over\/pair\/straight\/flush/);
  assert.doesNotMatch(prompt, /GTO solution|solver output/);
});
