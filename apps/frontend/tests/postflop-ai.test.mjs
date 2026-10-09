import test from "node:test";
import { DEFENCE_VERSION } from "../scripts/postflop-ai/defence.ts";
import assert from "node:assert/strict";
import { evaluate } from "../scripts/lib/equity.ts";
import { boards, comboRange, loadInputs, makeSampler, samplePair } from "../scripts/postflop-ai/inputs.mjs";
import { boardTexture, parseCards } from "../scripts/postflop-ai/model.ts";
import { handTier } from "../scripts/postflop-ai/hu-hand-tier.ts";
import { NODES, policyMix, referencePolicy, validatePolicy } from "../scripts/postflop-ai/policy.ts";
import { dealRunout, playHand, simulate } from "../scripts/postflop-ai/simulation.mjs";
import { promptFor } from "../scripts/postflop-ai/generate.mjs";
import { auditExperiment } from "../scripts/postflop-ai/audit.mjs";
import { sha } from "../scripts/postflop-ai/generate.mjs";

const hand = text => parseCards(text, 2);
const flop = parseCards("As7d2c", 3);
const runout = parseCards("3h4h", 2);
const randoms = (first, second = 0.99, third = 0.99) => [first, second, third, ...Array(9).fill(0.01)];
function forced(overrides) {
  const policy = structuredClone(referencePolicy);
  for (const rule of policy.rules) {
    const action = overrides[rule.node];
    if (action) rule.mix = Object.fromEntries(NODES[rule.node].map(key => [key, key === action ? 100 : 0]));
  }
  return validatePolicy(policy);
}

test("representative flops are unique, split 8/4, and holdouts are absent from the Codex prompt", () => {
  const all = boards(), prompt = promptFor(loadInputs());
  assert.equal(all.length, 12);
  assert.equal(all.filter(board => board.split === "design").length, 8);
  assert.equal(all.filter(board => board.split === "holdout").length, 4);
  for (const board of all) assert.equal(prompt.includes(board.id), board.split === "design");
  assert.equal(boardTexture(flop), "dry");
  assert.equal(boardTexture(parseCards("AhKh4h", 3)), "monotone");
  assert.equal(boardTexture(parseCards("KcKd4h", 3)), "paired");
});

test("source ranges expand into weighted, board-unblocked private combinations", () => {
  const inputs = loadInputs();
  const btn = comboRange(inputs.opening.hands, "open", flop);
  const bb = comboRange(inputs.response.hands, "call", flop);
  assert.ok(btn.length > 0 && bb.length > 0);
  for (const { combo, weight } of [...btn, ...bb]) {
    assert.equal(combo.length, 2);
    assert.ok(weight > 0 && weight <= 1);
    assert.ok(combo.every(card => !flop.includes(card)));
  }
  const pair = samplePair(makeSampler(btn), makeSampler(bb), () => 0.123456);
  assert.equal(new Set([...pair.BTN, ...pair.BB, ...flop]).size, 7);
  const board = [...flop, ...dealRunout(pair, flop, () => 0.5)];
  assert.equal(new Set([...pair.BTN, ...pair.BB, ...board]).size, 9);
  assert.throws(() => comboRange([{ hand: "AA", open: 101 }], "open", flop));
});

test("known hand ranks, ties and tier features", () => {
  const board = parseCards("AhKhQhJh2c", 5);
  assert.ok(evaluate([...hand("Th3d"), ...board]) > evaluate([...hand("9h9d"), ...board]));
  assert.equal(evaluate([...hand("3d4c"), ...parseCards("AsKsQsJsTs", 5)]),
    evaluate([...hand("5d6c"), ...parseCards("AsKsQsJsTs", 5)]));
  assert.equal(handTier(hand("AhAd"), flop), "monster");
  assert.equal(handTier(hand("KhKc"), flop), "medium");
  assert.equal(handTier(hand("QsJc"), flop), "air");
  assert.equal(handTier(hand("6h5h"), parseCards("6d7c8s", 3)), "draw");
  assert.throws(() => parseCards("AsAs", 2), /Duplicate/);
});

test("malformed LLM policy output is rejected before any combo expansion", () => {
  const good = structuredClone(referencePolicy);
  assert.equal(validatePolicy(good), good);
  const badTotal = structuredClone(good);
  badTotal.rules[0].mix.check = 99;
  assert.throws(() => validatePolicy(badTotal), /Invalid action mix/);
  const illegal = structuredClone(good);
  illegal.rules[0].mix.raise = 0;
  assert.throws(() => validatePolicy(illegal), /Invalid action mix/);
  const missing = structuredClone(good);
  missing.rules.shift();
  assert.throws(() => validatePolicy(missing), /Invalid postflop policy envelope|Missing fallback/);
  const duplicate = structuredClone(good);
  duplicate.rules.push(structuredClone(good.rules[0]));
  assert.throws(() => validatePolicy(duplicate), /Duplicate/);
  const mix = policyMix(good, "btn_first", hand("AhAd"), flop);
  assert.equal(Object.values(mix).reduce((sum, n) => sum + n, 0), 100);
});

test("flop fold, call and check-raise terminals conserve chips after capped rake", () => {
  const hands = { BTN: hand("AhAd"), BB: hand("KhQd") };
  const fold = playHand({ hands, flop, runout, hero: "BTN", profile: "standard",
    policy: forced({ btn_first: "bet33" }), randoms: randoms(0.5, 0.5) });
  assert.equal(fold.winner, "BTN");
  assert.deepEqual(fold.invested, { BTN: 0, BB: 0 });
  assert.equal(fold.pot, 5.5);
  assert.ok(Math.abs(fold.fee - 0.275) < 1e-10);
  const called = playHand({ hands, flop, runout, hero: "BTN", profile: "standard",
    policy: forced({ btn_first: "bet75" }), randoms: randoms(0.5, 0.95) });
  assert.equal(called.invested.BTN, called.invested.BB);
  const setHands = { BTN: hand("AhAd"), BB: hand("7c7h") };
  const raiseFold = playHand({ hands: setHands, flop, runout, hero: "BTN", profile: "standard",
    policy: forced({ btn_first: "bet33", btn_vs_raise: "fold" }), randoms: randoms(0.5, 0.99) });
  assert.equal(raiseFold.winner, "BB");
  assert.deepEqual(raiseFold.invested, { BTN: 1.82, BB: 1.82 });
  assert.equal(raiseFold.pot, 9.14);
  const raiseCall = playHand({ hands: setHands, flop, runout, hero: "BTN", profile: "standard",
    policy: forced({ btn_first: "bet33", btn_vs_raise: "call" }), randoms: randoms(0.5, 0.99) });
  assert.deepEqual(raiseCall.invested, { BTN: 5.46, BB: 5.46 });
  const capped = playHand({ hands: setHands, flop, runout, hero: "BTN", profile: "standard",
    policy: forced({ btn_first: "bet33", btn_vs_raise: "call" }),
    randoms: [0.5, 0.99, 0.5, ...Array(9).fill(0.99)] });
  assert.equal(capped.fee, 3);
  const sharedBoard = parseCards("AsKsQs", 3);
  const tie = playHand({ hands: { BTN: hand("2d3c"), BB: hand("4d5c") }, flop: sharedBoard,
    runout: parseCards("JsTs", 2), hero: "BTN", profile: "standard",
    policy: forced({ btn_first: "check" }), randoms: randoms(0.01, 0.01, 0.01) });
  assert.equal(tie.winner, "tie");
  const turnFold = playHand({ hands: { BTN: hand("QsJc"), BB: hand("7c7h") }, flop, runout,
    hero: "BTN", profile: "standard", policy: forced({ btn_first: "check" }),
    randoms: [0.5, 0.99, 0.5, ...Array(9).fill(0.01)] });
  assert.equal(turnFold.winner, "BB");
  assert.equal(turnFold.pot, 5.5); // BB's uncalled turn bet is returned.
  for (const result of [fold, called, raiseFold, raiseCall, capped, tie, turnFold]) {
    assert.ok(Math.abs(result.returns.BTN + result.returns.BB - (5.5 - result.fee)) <= 0.02);
    assert.ok(Math.abs(result.fee - Math.min(result.pot * 0.05, 3)) < 1e-10);
  }
  assert.throws(() => playHand({ hands, flop, runout: [flop[0], runout[1]], hero: "BTN",
    policy: referencePolicy, profile: "standard", randoms: randoms(0.5) }), /Invalid simulated hand/);
  assert.throws(() => playHand({ hands, flop, runout, hero: "BTN",
    policy: referencePolicy, profile: "standard", randoms: [0.5] }), /Invalid simulated hand/);
});

test("candidate and baseline share deals and fixed-seed replay is byte-for-byte deterministic", () => {
  const inputs = loadInputs();
  // Without the computed defence the reference policy is its own baseline; with it (the default) the
  // candidate defends by calculation and may differ from the tier-mix baseline.
  const plain = { computedDefence: false };
  const one = simulate(inputs, referencePolicy, 16, null, plain), two = simulate(inputs, referencePolicy, 16, null, plain);
  assert.deepEqual(one, two);
  assert.equal(one.results.length, 72);
  assert.ok(one.results.every(row => row.delta_bb.mean === 0 && row.delta_bb.ci95[0] === 0));
  assert.equal(one.defence_version, undefined);
  const defended = simulate(inputs, referencePolicy, 16), again = simulate(inputs, referencePolicy, 16);
  assert.deepEqual(defended, again);
  assert.equal(defended.defence_version, DEFENCE_VERSION);
  const changed = simulate(inputs, forced({ btn_first: "check" }), 16);
  assert.ok(changed.results.some(row => row.delta_bb.mean !== 0));
  assert.equal(changed.source_hash, inputs.fingerprint);
});

test("audit blocks stale hashes, incomplete reports and altered samples before claiming quality", () => {
  const inputs = loadInputs();
  const candidate = { metadata: { kind: "ai_estimate_not_gto", source_hash: inputs.fingerprint,
    policy_hash: sha(referencePolicy), config_version: inputs.config.version }, policy: referencePolicy };
  const report = simulate(inputs, referencePolicy, 2);
  assert.equal(report.policy_hash, sha(referencePolicy));
  assert.throws(() => auditExperiment(inputs, candidate, report), /stale\/incomplete/);
  const wrongHash = structuredClone(candidate);
  wrongHash.metadata.source_hash = "wrong";
  assert.throws(() => auditExperiment(inputs, wrongHash, report), /stale\/incomplete/);
  const badRule = structuredClone(candidate);
  badRule.policy.rules[0].mix.check = 99;
  assert.throws(() => auditExperiment(inputs, badRule, report), /Invalid action mix/);
});
