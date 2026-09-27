import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, sha } from "../scripts/postflop-ai/generate.mjs";
import { DEFAULT_SPOT_ID, POSTFLOP_SPOTS, fourBetSpotFor, limpSpotFor, spotById, spotFor, threeBetSpotFor } from "../scripts/postflop-ai/spots.mjs";
import { playHand, simulate } from "../scripts/postflop-ai/simulation.mjs";
import { createTable, playFlop, playLaterStreets, settle } from "../scripts/postflop-ai/engine.mjs";
import { flopState, treeHistories } from "../scripts/postflop-ai/tree.mjs";
import { parseCards } from "../scripts/postflop-ai/model.mjs";
import preflopRanges from "../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBetResponses from "../src/estimated/three-bet-responses.json" with { type: "json" };
import { buildLocalBoard } from "../scripts/postflop-ai/local-view.mjs";
import { referencePolicy, referencePolicyFor, validatePolicy } from "../scripts/postflop-ai/policy.mjs";
import { buildFlopActionBlocks, completedFlopContext, flopDecision, recognizedFlop, representativeFlops } from "../src/estimated/postflop-trial.js";

const end = (result, pot) => [{ kind: "end", result, pot: `ポット ${pot}bb` }];

test("only complete paths can enter the next street, with unsupported paths marked pending", () => {
  const eligible = completedFlopContext({ actionBlocks: end("2人でフロップへ", 5.5), rangeType: "response",
    opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual(eligible, { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true,
    spotId: "BTN_open_BB_call", ip: "BTN", oop: "BB", stackBb: 97.5, tree: "oop_checks" });
  assert.equal(completedFlopContext({ actionBlocks: [], rangeType: "response", opener: "BTN", hero: "BB",
    callers: ["BB"], foldedHero: true, isDefaultTable: true }), null);
  assert.equal(completedFlopContext({ actionBlocks: end("BTNの勝ち", 3), rangeType: "response", opener: "BTN", hero: "BB",
    callers: [], foldedHero: true, isDefaultTable: true }), null);
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 5.5), rangeType: "response", opener: "BTN", hero: "BB",
    callers: ["BB"], foldedHero: true, isDefaultTable: false }).pilotAvailable, false);
  assert.deepEqual(completedFlopContext({ actionBlocks: end("2人でフロップへ", 2), rangeType: "limp",
    opener: "SB", hero: "BB", callers: [], foldedHero: false, isDefaultTable: true }).players, ["SB", "BB"]);
});

test("every saved open response and 3bet response becomes a heads-up flop spot", () => {
  assert.equal(POSTFLOP_SPOTS.length, 48);
  const srp = POSTFLOP_SPOTS.filter(spot => spot.kind === "srp"), threeBet = POSTFLOP_SPOTS.filter(spot => spot.kind === "3bp");
  assert.deepEqual(srp.map(spot => spot.responseId).sort(), preflopRanges.spots.map(spot => spot.id).sort());
  assert.deepEqual(threeBet.map(spot => spot.responseId).sort(), threeBetResponses.spots.map(spot => spot.id).sort());
  const table = spots => Object.fromEntries(spots.map(spot => [spot.id, [spot.ip, spot.oop, spot.potBb, spot.stackBb, spot.tree]]));
  // The tree is "oop_leads" exactly when the OOP player made the last preflop raise.
  assert.deepEqual(table(srp), {
    UTG_open_HJ_call: ["HJ", "UTG", 6.5, 97.5, "oop_leads"], UTG_open_CO_call: ["CO", "UTG", 6.5, 97.5, "oop_leads"], UTG_open_BTN_call: ["BTN", "UTG", 6.5, 97.5, "oop_leads"],
    UTG_open_SB_call: ["UTG", "SB", 6, 97.5, "oop_checks"], UTG_open_BB_call: ["UTG", "BB", 5.5, 97.5, "oop_checks"],
    HJ_open_CO_call: ["CO", "HJ", 6.5, 97.5, "oop_leads"], HJ_open_BTN_call: ["BTN", "HJ", 6.5, 97.5, "oop_leads"], HJ_open_SB_call: ["HJ", "SB", 6, 97.5, "oop_checks"], HJ_open_BB_call: ["HJ", "BB", 5.5, 97.5, "oop_checks"],
    CO_open_BTN_call: ["BTN", "CO", 6.5, 97.5, "oop_leads"], CO_open_SB_call: ["CO", "SB", 6, 97.5, "oop_checks"], CO_open_BB_call: ["CO", "BB", 5.5, 97.5, "oop_checks"],
    BTN_open_SB_call: ["BTN", "SB", 6, 97.5, "oop_checks"], BTN_open_BB_call: ["BTN", "BB", 5.5, 97.5, "oop_checks"], SB_open_BB_call: ["BB", "SB", 7, 96.5, "oop_leads"],
  });
  assert.deepEqual(table(threeBet), {
    UTG_open_HJ_3bet_call: ["HJ", "UTG", 17.5, 92, "oop_checks"], UTG_open_CO_3bet_call: ["CO", "UTG", 17.5, 92, "oop_checks"], UTG_open_BTN_3bet_call: ["BTN", "UTG", 17.5, 92, "oop_checks"],
    UTG_open_SB_3bet_call: ["UTG", "SB", 25, 88, "oop_leads"], UTG_open_BB_3bet_call: ["UTG", "BB", 24.5, 88, "oop_leads"],
    HJ_open_CO_3bet_call: ["CO", "HJ", 17.5, 92, "oop_checks"], HJ_open_BTN_3bet_call: ["BTN", "HJ", 17.5, 92, "oop_checks"], HJ_open_SB_3bet_call: ["HJ", "SB", 25, 88, "oop_leads"], HJ_open_BB_3bet_call: ["HJ", "BB", 24.5, 88, "oop_leads"],
    CO_open_BTN_3bet_call: ["BTN", "CO", 17.5, 92, "oop_checks"], CO_open_SB_3bet_call: ["CO", "SB", 25, 88, "oop_leads"], CO_open_BB_3bet_call: ["CO", "BB", 24.5, 88, "oop_leads"],
    BTN_open_SB_3bet_call: ["BTN", "SB", 25, 88, "oop_leads"], BTN_open_BB_3bet_call: ["BTN", "BB", 24.5, 88, "oop_leads"], SB_open_BB_3bet_call: ["BB", "SB", 21, 89.5, "oop_checks"],
  });
  for (const spot of threeBet) assert.equal(spot.threeBetBb, threeBetResponses.spots.find(item => item.id === spot.responseId).three_bet_size_bb);
  assert.equal(spotById().id, DEFAULT_SPOT_ID);
  assert.equal(spotById("BTN_open_BB_call").slug, "btn-bb-srp-v1");
  assert.equal(spotById("SB_open_BB_call").slug, "sb-bb-srp-v1");
  assert.equal(spotById("BTN_open_BB_3bet_call").slug, "btn-bb-3bp-v1");
  assert.match(artifactPaths(spotById()).candidate, /\.local\/postflop-ai\/btn-bb-srp-v1-policy\.json$/);
  assert.match(artifactPaths(spotById("CO_open_BTN_call")).handEv, /co-btn-srp-v1-hand-ev\.json$/);
  assert.equal(spotFor("BB", "SB"), null);
  assert.equal(threeBetSpotFor("SB", "BB").id, "SB_open_BB_3bet_call");
  assert.throws(() => spotById("BB_open_SB_call"), /Unknown postflop spot/);
  // SB is saved as 3bet-or-fold, so the four SB-call single-raised pots are listed but unreachable.
  assert.deepEqual(POSTFLOP_SPOTS.filter(spot => !spot.reachable).map(spot => spot.id),
    ["UTG_open_SB_call", "HJ_open_SB_call", "CO_open_SB_call", "BTN_open_SB_call"]);
  for (const spot of POSTFLOP_SPOTS) {
    if (!spot.reachable) { assert.throws(() => loadInputs(spot.id), /unreachable/); continue; }
    const inputs = loadInputs(spot.id);
    assert.equal(inputs.opening.id, `${spot.opener}_open`);
    assert.equal(inputs.response.id, spot.responseId);
  }
  assert.notEqual(loadInputs("SB_open_BB_call").fingerprint, loadInputs().fingerprint);
});

test("3bet pot ranges: the 3bettor's saved 3bet and the opener's open × call versus the 3bet", () => {
  const inputs = loadInputs("BTN_open_BB_3bet_call");
  assert.equal(inputs.threeBet.id, "BB_vs_BTN");
  for (const hand of ["AA", "AJs", "76s", "K2o"]) {
    const open = inputs.opening.hands.find(item => item.hand === hand).open;
    const call = inputs.response.hands.find(item => item.hand === hand).call;
    assert.equal(inputs.seatRows.BTN.find(item => item.hand === hand).freq, open * call / 100, hand);
    assert.equal(inputs.seatRows.BB.find(item => item.hand === hand).freq, inputs.threeBet.hands.find(item => item.hand === hand).three_bet, hand);
  }
  assert.ok(inputs.seatRows.BTN.some(item => item.freq > 0) && inputs.seatRows.BB.some(item => item.freq > 0));
});

test("the two flop trees: OOP checks after a flat, the OOP preflop raiser leads", () => {
  assert.deepEqual(Object.keys(treeHistories("oop_checks")), ["", "bet33", "bet75", "bet33,raise", "bet75,raise"]);
  assert.deepEqual(Object.keys(treeHistories("oop_leads")), ["", "check", "bet33", "bet75", "check,bet33", "check,bet75", "bet33,raise", "bet75,raise", "check,bet33,raise", "check,bet75,raise"]);
  assert.deepEqual(flopState("oop_leads", ["bet75", "raise", "fold"]).end, { type: "raise-fold", winner: "ip" });
  assert.deepEqual(flopState("oop_leads", ["check", "check"]).end, { type: "check" });
  assert.throws(() => flopState("oop_checks", ["check", "check"]), /Illegal/);
  assert.throws(() => flopState("oop_leads", ["bet33", "check"]), /Illegal/);
  // A policy is validated against its own tree's nodes and fallbacks.
  assert.throws(() => validatePolicy(referencePolicy, "oop_leads"), /Invalid postflop policy envelope|Missing fallback/);
  assert.throws(() => validatePolicy(referencePolicyFor("oop_leads"), "oop_checks"), /Invalid postflop policy/);
  assert.equal(referencePolicyFor("oop_leads").rules.length, 40);
});

test("4bet pots and SB's limped pots: seats, pot, stacks and tree", () => {
  const table = spots => Object.fromEntries(spots.map(spot => [spot.id, [spot.ip, spot.oop, spot.potBb, spot.stackBb, spot.tree]]));
  // The 4bettor (the opener) is the last raiser: it leads when out of position.
  assert.deepEqual(table(POSTFLOP_SPOTS.filter(spot => spot.kind === "4bp")), {
    UTG_open_HJ_4bp_call: ["HJ", "UTG", 41.5, 80, "oop_leads"], UTG_open_CO_4bp_call: ["CO", "UTG", 41.5, 80, "oop_leads"], UTG_open_BTN_4bp_call: ["BTN", "UTG", 41.5, 80, "oop_leads"],
    UTG_open_SB_4bp_call: ["UTG", "SB", 53, 74, "oop_checks"], UTG_open_BB_4bp_call: ["UTG", "BB", 52.5, 74, "oop_checks"],
    HJ_open_CO_4bp_call: ["CO", "HJ", 41.5, 80, "oop_leads"], HJ_open_BTN_4bp_call: ["BTN", "HJ", 41.5, 80, "oop_leads"], HJ_open_SB_4bp_call: ["HJ", "SB", 53, 74, "oop_checks"], HJ_open_BB_4bp_call: ["HJ", "BB", 52.5, 74, "oop_checks"],
    CO_open_BTN_4bp_call: ["BTN", "CO", 41.5, 80, "oop_leads"], CO_open_SB_4bp_call: ["CO", "SB", 53, 74, "oop_checks"], CO_open_BB_4bp_call: ["CO", "BB", 52.5, 74, "oop_checks"],
    BTN_open_SB_4bp_call: ["BTN", "SB", 53, 74, "oop_checks"], BTN_open_BB_4bp_call: ["BTN", "BB", 52.5, 74, "oop_checks"], SB_open_BB_4bp_call: ["BB", "SB", 48, 76, "oop_leads"],
  });
  assert.deepEqual(table(POSTFLOP_SPOTS.filter(spot => spot.kind === "limp")), {
    SB_limp_BB_check: ["BB", "SB", 2, 99, "oop_leads"],
    SB_limp_BB_iso_call: ["BB", "SB", 7, 96.5, "oop_checks"],
    SB_limp_BB_iso_SB_reraise_call: ["BB", "SB", 21, 89.5, "oop_leads"],
  });
  assert.equal(fourBetSpotFor("SB", "BB").slug, "sb-bb-4bp-v1");
  // Ranges: O = open × 4bet, X = 3bet × call versus the 4bet; limped pots multiply their saved steps.
  const four = loadInputs("CO_open_BTN_4bp_call");
  for (const hand of ["AA", "AKs", "A5s", "QQ"]) {
    const row = (rows, action) => rows.find(item => item.hand === hand)[action];
    assert.equal(four.seatRows.CO.find(item => item.hand === hand).freq, row(four.opening.hands, "open") * row(four.threeBetResponse.hands, "four_bet") / 100, hand);
    assert.equal(four.seatRows.BTN.find(item => item.hand === hand).freq, row(four.threeBet.hands, "three_bet") * row(four.response.hands, "call") / 100, hand);
  }
  const iso = loadInputs("SB_limp_BB_iso_call");
  const sbLimp = iso.opening.hands.find(item => item.hand === "K9s").limp, sbCall = iso.response.hands.find(item => item.hand === "K9s").call;
  assert.equal(iso.seatRows.SB.find(item => item.hand === "K9s").freq, sbLimp * sbCall / 100);
  assert.deepEqual(flopDecision(["bet33"], limpSpotFor("SB_limp_BB_check")), { node: "ip_vs_33", actor: "BB", potBb: 2.66, history: ["SB Bet 33% (0.66BB)"] });
});

test("low-SPR 4bet pots: a raise over the stack is an all-in, the rest is dealt, chips are conserved", () => {
  const spot = spotById("UTG_open_HJ_4bp_call");
  assert.deepEqual(flopDecision(["bet75", "raise"], spot).history, ["UTG Bet 75% (31.13BB)", "HJ Raise 80BB All-in"]);
  assert.deepEqual(flopDecision(["bet75", "raise", "call"], spot), { result: "UTGがコール。フロップの判断は終了です。", potBb: 201.5, history: ["UTG Bet 75% (31.13BB)", "HJ Raise 80BB All-in", "UTG Call All-in"] });
  assert.deepEqual(buildFlopActionBlocks(["bet75", "raise"], spotById("BTN_open_BB_4bp_call")).map(block => [block.position, block.stack]), [["BB", "74"], ["BTN", "74"], ["BB", "74"], ["BTN", "34.62"]]);
  const table = createTable(spot);
  const forced = { oop_first: "bet75", ip_vs_75: "raise", oop_vs_raise: "call" };
  playFlop(table, spot.tree, (seat, node) => forced[node], { flop_bet_fractions: [0.33, 0.75], flop_check_raise_multiplier: 3 });
  assert.deepEqual([table.invested.UTG, table.invested.HJ, table.stacks.UTG, table.stacks.HJ, table.pot], [80, 80, 0, 0, 201.5]);
  const streets = [];
  playLaterStreets(table, parseCards("As7d2c", 3), parseCards("3s4s", 2), seat => { streets.push(seat); return "bet"; }, { continuation_bet_fraction: 0.5 });
  assert.deepEqual(streets, []);
  const hands = { UTG: parseCards("KhKd", 2), HJ: parseCards("QhQd", 2) };
  for (const random of [0.01, 0.3, 0.6, 0.99]) {
    for (const hero of ["UTG", "HJ"]) {
      const result = playHand({ hands, flop: parseCards("As7d2c", 3), runout: parseCards("3s4s", 2), hero, profile: "aggressive",
        policy: referencePolicyFor(spot.tree), randoms: Array(12).fill(random), spot });
      assert.ok(Math.abs(result.returns.UTG + result.returns.HJ - (41.5 - result.fee)) <= 0.02);
      assert.ok(result.invested.UTG <= 80 && result.invested.HJ <= 80 && result.fee <= 3);
    }
  }
  assert.equal(simulate(loadInputs(spot.id), referencePolicyFor(spot.tree), 20).results.length, 72);
});

test("SB vs BB and CO vs BTN let the OOP opener lead, with their own seats, pot and stacks", () => {
  const sb = completedFlopContext({ actionBlocks: end("2人でフロップへ", 7), rangeType: "response",
    opener: "SB", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual(sb, { players: ["SB", "BB"], potBb: 7, pilotAvailable: true, spotId: "SB_open_BB_call", ip: "BB", oop: "SB", stackBb: 96.5, tree: "oop_leads" });
  const co = completedFlopContext({ actionBlocks: end("2人でフロップへ", 6.5), rangeType: "response",
    opener: "CO", hero: "BB", callers: ["BTN"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual([co.spotId, co.ip, co.oop, co.potBb, co.stackBb, co.tree], ["CO_open_BTN_call", "BTN", "CO", 6.5, 97.5, "oop_leads"]);
  // A pot that does not match the heads-up geometry, a multiway pot or an SB call stays unrecorded.
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 8), rangeType: "response",
    opener: "CO", hero: "BB", callers: ["BTN"], foldedHero: true, isDefaultTable: true }).pilotAvailable, false);
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 6), rangeType: "response",
    opener: "BTN", hero: "BB", callers: ["SB"], foldedHero: true, isDefaultTable: true }).pilotAvailable, false);
  const multiway = completedFlopContext({ actionBlocks: end("3人でフロップへ", 8.5), rangeType: "response",
    opener: "CO", hero: "BB", callers: ["BTN", "BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual([multiway.pilotAvailable, multiway.spotId], [false, null]);

  assert.deepEqual(flopDecision([], sb), { node: "oop_first", actor: "SB", potBb: 7, history: [] });
  assert.deepEqual(flopDecision(["bet33"], sb), { node: "ip_vs_33", actor: "BB", potBb: 9.31, history: ["SB Bet 33% (2.31BB)"] });
  assert.deepEqual(flopDecision(["bet33", "raise"], sb).history, ["SB Bet 33% (2.31BB)", "BB Raise 6.93BB"]);
  assert.equal(flopDecision(["bet33", "raise"], sb).node, "oop_vs_raise");
  assert.equal(flopDecision(["bet33", "fold"], sb).result, "BBがフォールド。SBの勝ちです。");
  assert.equal(flopDecision(["bet75", "raise", "call"], sb).potBb, 38.5);
  assert.deepEqual(flopDecision(["check", "bet33"], sb).history, ["SB Check", "BB Bet 33% (2.31BB)"]);
  assert.equal(flopDecision(["check", "bet33", "raise"], sb).history.at(-1), "SB Check-raise 6.93BB");
  const sbBlocks = buildFlopActionBlocks(["check", "bet75", "raise"], sb);
  assert.deepEqual(sbBlocks.map(block => [block.position, block.stack]), [["SB", "96.5"], ["BB", "96.5"], ["SB", "96.5"], ["BB", "91.25"]]);
  assert.ok(!sbBlocks.some(block => block.kind === "flop-forced"));

  assert.deepEqual(buildFlopActionBlocks(["bet33"], co).map(block => block.position), ["CO", "BTN"]);
  assert.equal(flopDecision(["bet33"], co).history[0], "CO Bet 33% (2.15BB)");
  assert.equal(flopDecision(["check", "check"], co).result, "BTNもチェック。フロップの判断は終了です。");
});

test("3bet pots: the SB/BB 3bettor leads out of position, an IP 3bettor faces a check", () => {
  const bb = spotById("UTG_open_BB_3bet_call"), hj = spotById("UTG_open_HJ_3bet_call");
  assert.deepEqual(flopDecision(["bet33"], bb), { node: "ip_vs_33", actor: "UTG", potBb: 32.59, history: ["BB Bet 33% (8.09BB)"] });
  assert.equal(flopDecision(["bet33", "raise"], bb).history.at(-1), "UTG Raise 24.27BB");
  assert.equal(flopDecision(["bet75", "raise", "call"], bb).potBb, 134.78);
  assert.deepEqual(flopDecision(["bet33"], hj), { node: "bb_vs_33", actor: "UTG", potBb: 23.28, history: ["UTG Check", "HJ Bet 33% (5.78BB)"] });
  const sb3 = threeBetSpotFor("SB", "BB");
  assert.deepEqual([sb3.ip, sb3.oop, sb3.tree, flopDecision([], sb3).history[0]], ["BB", "SB", "oop_checks", "SB Check"]);
  const context = completedFlopContext({ actionBlocks: end("2人でフロップへ", 24.5), rangeType: "three_bet",
    opener: "UTG", hero: "BB", callers: [], isDefaultTable: true });
  assert.deepEqual([context.spotId, context.ip, context.oop, context.stackBb, context.tree], ["UTG_open_BB_3bet_call", "UTG", "BB", 88, "oop_leads"]);
  // A 4bet pot with the wrong pot, or a 5bet all-in, is not covered.
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 60), rangeType: "four_bet",
    opener: "UTG", hero: "BB", callers: [], isDefaultTable: true }).pilotAvailable, false);
  assert.equal(completedFlopContext({ actionBlocks: end("オールイン・ショウダウン", 200), rangeType: "four_bet",
    opener: "UTG", hero: "BB", callers: [], isDefaultTable: true }), null);
});

test("bets and raises stop at the stack; an all-in 3bet pot is only dealt out and conserves chips", () => {
  const spot = spotById("UTG_open_BB_3bet_call");
  const table = createTable(spot);
  const forced = { oop_first: "bet75", ip_vs_75: "raise", oop_vs_raise: "call" };
  playFlop(table, "oop_leads", (seat, node) => forced[node], { flop_bet_fractions: [0.33, 0.75], flop_check_raise_multiplier: 3 });
  assert.deepEqual([table.invested.UTG, table.invested.BB, table.pot], [55.14, 55.14, 134.78]);
  const turns = [];
  playLaterStreets(table, parseCards("As7d2c", 3), parseCards("3s4s", 2), (seat, board, facing) => { turns.push(seat); return facing ? "call" : "bet"; }, { continuation_bet_fraction: 0.5 });
  // BB bets 50% of the pot, capped at its 32.86BB left; UTG calls; the river is only dealt.
  assert.deepEqual(turns, ["BB", "UTG"]);
  assert.deepEqual([table.stacks.UTG, table.stacks.BB, table.pot], [0, 0, 200.5]);
  const hands = { UTG: parseCards("AhAd", 2), BB: parseCards("KhKd", 2) };
  assert.equal(settle(table, hands, parseCards("As7d2c3s4s", 5)), "UTG");
  for (const random of [0.01, 0.5, 0.99]) {
    const result = playHand({ hands, flop: parseCards("As7d2c", 3), runout: parseCards("3s4s", 2), hero: "UTG", profile: "aggressive",
      policy: referencePolicyFor("oop_leads"), randoms: Array(12).fill(random), spot });
    assert.ok(Math.abs(result.returns.UTG + result.returns.BB - (24.5 - result.fee)) <= 0.02);
    assert.ok(result.invested.UTG <= 88 && result.invested.BB <= 88);
  }
});

test("the first BTN/BB pilot keeps its files, hashes and report identity", () => {
  const inputs = loadInputs();
  assert.equal(inputs.spot.id, "BTN_open_BB_call");
  assert.deepEqual([inputs.spot.ip, inputs.spot.oop, inputs.spot.potBb, inputs.spot.stackBb], ["BTN", "BB", 5.5, 97.5]);
  const report = simulate(inputs, referencePolicy, 2);
  assert.equal(report.spot, "BTN_open_BB_call");
  assert.deepEqual([...new Set(report.results.map(row => row.hero))], ["BTN", "BB"]);
  // When the local candidate exists (it is git-ignored), it must still load against the unchanged fingerprint.
  if (existsSync(artifactPaths(inputs.spot).candidate)) assert.equal(loadCandidate(inputs).metadata.source_hash, inputs.fingerprint);
});

test("flop navigation has legal actions, consistent pots, refunds, and a step back", () => {
  assert.equal(representativeFlops.length, 12);
  assert.equal(flopDecision().node, "btn_first");
  assert.equal(flopDecision(["check"]).potBb, 5.5);
  assert.equal(flopDecision(["bet33"]).node, "bb_vs_33");
  assert.equal(flopDecision(["bet75"]).node, "bb_vs_75");
  assert.equal(flopDecision(["bet33", "fold"]).potBb, 5.5);
  assert.equal(flopDecision(["bet33", "call"]).potBb, 9.14);
  assert.equal(flopDecision(["bet33", "raise"]).node, "btn_vs_raise");
  assert.equal(flopDecision(["bet33", "raise", "fold"]).potBb, 9.14);
  assert.equal(flopDecision(["bet33", "raise", "call"]).potBb, 16.42);
  assert.equal(flopDecision(["bet75", "raise", "call"]).potBb, 30.28);
  assert.deepEqual(flopDecision(["bet33", "raise"].slice(0, -1)), flopDecision(["bet33"]));
  assert.throws(() => flopDecision(["raise"]), /Illegal/);
  assert.throws(() => flopDecision(["check", "call"]), /Illegal/);
  assert.throws(() => flopDecision(["bet33", "raise", "raise"]), /Illegal/);
});

test("three individually selected cards resolve only an audited representative flop", () => {
  assert.equal(recognizedFlop(["2c", "As", "7d"]), "As7d2c");
  assert.equal(recognizedFlop(["As", "As", "7d"]), null);
  assert.equal(recognizedFlop(["As", "7d", ""]), null);
  assert.equal(recognizedFlop(["As", "7d", "3c"]), null);
});

test("flop decisions reuse preflop-style action blocks without inventing later actions", () => {
  const first = buildFlopActionBlocks();
  assert.deepEqual(first.map(block => block.position), ["BB", "BTN"]);
  assert.equal(first[1].active, true);
  assert.deepEqual(first[1].options.map(option => option.action), ["check", "bet33", "bet75"]);
  const raised = buildFlopActionBlocks(["bet33", "raise"]);
  assert.deepEqual(raised.map(block => block.position), ["BB", "BTN", "BB", "BTN"]);
  assert.deepEqual(raised[3].options.map(option => option.action), ["fold", "call"]);
  assert.equal(raised[2].flopIndex, 1);
  assert.equal(buildFlopActionBlocks(["bet33", "raise", "call"]).at(-1).kind, "end");
});

test("read-only board projection expands saved source combos without revealing another hand", () => {
  const inputs = loadInputs();
  const candidate = { metadata: { source_hash: inputs.fingerprint, policy_hash: sha(referencePolicy) }, policy: referencePolicy };
  const data = buildLocalBoard("As7d2c", inputs, candidate);
  assert.equal(data.kind, "ai_estimate_not_gto");
  assert.equal(data.board, "As7d2c");
  assert.deepEqual(Object.keys(data.nodes), ["btn_first", "bb_vs_33", "bb_vs_75", "btn_vs_raise"]);
  for (const [node, section] of Object.entries(data.nodes)) {
    assert.equal(section.rows.length, 169, node);
    for (const row of section.rows) {
      if (row.reachable) assert.ok(Math.abs(Object.values(row.mix).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
      assert.ok(!("opponentHand" in row) && !("combo" in row));
    }
  }
  const coInputs = loadInputs("CO_open_BTN_call");
  const leads = referencePolicyFor("oop_leads");
  const co = buildLocalBoard("As7d2c", coInputs, { metadata: { source_hash: coInputs.fingerprint, policy_hash: sha(leads) }, policy: leads });
  assert.deepEqual([co.spot, co.tree, co.ip, co.oop, co.pot_bb, co.nodes.oop_first.seat, co.nodes.ip_vs_33.seat, co.nodes.btn_first.seat, co.nodes.bb_vs_33.seat],
    ["CO_open_BTN_call", "oop_leads", "BTN", "CO", 6.5, "CO", "BTN", "BTN", "CO"]);
  assert.equal(Object.keys(co.nodes).length, 8);
  // A policy for the other tree is rejected.
  assert.throws(() => buildLocalBoard("As7d2c", coInputs, { metadata: { source_hash: coInputs.fingerprint, policy_hash: sha(referencePolicy) }, policy: referencePolicy }), /Invalid postflop policy envelope|Missing fallback/);
  assert.throws(() => buildLocalBoard("As7d2c", coInputs, { ...candidate, policy: leads }), /ハッシュ/);
  assert.throws(() => buildLocalBoard("AsAsAs", inputs, candidate), /代表フロップ/);
  candidate.metadata.policy_hash = "wrong";
  assert.throws(() => buildLocalBoard("As7d2c", inputs, candidate), /ハッシュ/);
});

let server, ActionPath, Sidebar, PostflopTrial, FlopCardDialog, buildActionBlocks;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ ActionPath, buildActionBlocks } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.jsx"));
  ({ Sidebar } = await server.ssrLoadModule("/src/components/layout.jsx"));
  ({ PostflopTrial, FlopCardDialog } = await server.ssrLoadModule("/src/estimated/PostflopTrial.jsx"));
});
after(async () => { await server?.close(); });

test("completed preflop end block extends the same action path", () => {
  const blocks = buildActionBlocks({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true });
  const html = renderToStaticMarkup(createElement(ActionPath, { blocks, expanded: true, onEnterPostflop() {} }));
  assert.match(html, /フロップへ進む →/);
  const unfinished = renderToStaticMarkup(createElement(ActionPath, { blocks: buildActionBlocks({ rangeType: "response", opener: "BTN", hero: "BB", callers: [], foldedHero: false }), expanded: true, onEnterPostflop() {} }));
  assert.doesNotMatch(unfinished, /フロップへ進む/);
  const combined = renderToStaticMarkup(createElement(ActionPath, { blocks: [...blocks.filter(block => block.kind !== "end"), { key: "flop-board", kind: "board", cards: ["As", "7d", "2c"] }, ...buildFlopActionBlocks()], expanded: true, onOpenFlopCards() {}, onFlopAction() {}, onEnterPostflop() {} }));
  assert.match(combined, /aria-label="フロップカードを変更"[\s\S]*A<span class="suit">♠<\/span>[\s\S]*7<span class="suit">♦<\/span>[\s\S]*2<span class="suit">♣<\/span>[\s\S]*action-seat-flop-forced[\s\S]*action-seat-flop active/);
  assert.doesNotMatch(combined, /終了|フロップへ進む →/);
  const navigation = renderToStaticMarkup(createElement(Sidebar, { activeSection: "レンジ分析", onSectionChange() {} }));
  assert.doesNotMatch(navigation, /aria-label="ポストフロップ/);
});

test("representative flops are picked from a modal, while unsupported spots stay truthful", () => {
  const dialog = renderToStaticMarkup(createElement(FlopCardDialog, { cards: ["As", "", ""], onApply() {}, onClose() {} }));
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.equal((dialog.match(/<select/g) ?? []).length, 0);
  assert.equal((dialog.match(/aria-label="フロップ /g) ?? []).length, 12);
  const complete = renderToStaticMarkup(createElement(FlopCardDialog, { cards: ["2c", "As", "7d"], onApply() {}, onClose() {} }));
  assert.match(complete, /class="selected" aria-pressed="true" aria-label="フロップ A♠ 7♦ 2♣"/);
  const html = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["SB", "BB"], potBb: 2, pilotAvailable: false }, cards: ["", "", ""] }));
  assert.match(html, /この局面のポストフロップ方針は未収録/);
  assert.doesNotMatch(html, /AI推定レンジ/);
  const missing = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true, spotId: "BTN_open_BB_call", ip: "BTN", oop: "BB", stackBb: 97.5 }, cards: ["As", "7d", "3c"] }));
  assert.match(missing, /このフロップの方針は未収録/);
  // A completed CO open → BTN call path ends in a 6.5BB heads-up pot that the pilot covers.
  const coBlocks = buildActionBlocks({ rangeType: "response", opener: "CO", hero: "BB", callers: ["BTN"], foldedHero: true });
  const coContext = completedFlopContext({ actionBlocks: coBlocks, rangeType: "response", opener: "CO", hero: "BB", callers: ["BTN"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual([coContext.spotId, coContext.potBb], ["CO_open_BTN_call", 6.5]);
  const sbBlocks = buildActionBlocks({ rangeType: "response", opener: "SB", hero: "BB", callers: ["BB"], foldedHero: true });
  const sbContext = completedFlopContext({ actionBlocks: sbBlocks, rangeType: "response", opener: "SB", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual([sbContext.spotId, sbContext.potBb, sbContext.ip], ["SB_open_BB_call", 7, "BB"]);
  // A completed BTN open → BB 3bet → BTN call path ends in the 24.5BB 3bet pot.
  const threeBetBlocks = buildActionBlocks({ rangeType: "three_bet", opener: "BTN", hero: "BB", callers: [], continuationAction: "call",
    spot: { three_bet_size_bb: 12, four_bet_size_bb: 26 } });
  const threeBetContext = completedFlopContext({ actionBlocks: threeBetBlocks, rangeType: "three_bet", opener: "BTN", hero: "BB", callers: [], isDefaultTable: true });
  assert.deepEqual([threeBetContext.spotId, threeBetContext.potBb, threeBetContext.tree], ["BTN_open_BB_3bet_call", 24.5, "oop_leads"]);
  // BTN open → BB 3bet → BTN 4bet 26 → BB call ends in a 52.5BB 4bet pot.
  const fourBetBlocks = buildActionBlocks({ rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [], continuationAction: "call",
    spot: { three_bet_size_bb: 12, four_bet_size_bb: 26 } });
  const fourBetContext = completedFlopContext({ actionBlocks: fourBetBlocks, rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [], isDefaultTable: true });
  assert.deepEqual([fourBetContext.spotId, fourBetContext.potBb, fourBetContext.stackBb, fourBetContext.tree], ["BTN_open_BB_4bp_call", 52.5, 74, "oop_checks"]);
  // SB's limped pots: limp → check, limp → iso → call, limp → iso → limp-reraise → call.
  for (const [actions, id, pot] of [[{ limpAction: "check" }, "SB_limp_BB_check", 2], [{ limpAction: "raise", limpResponseAction: "call" }, "SB_limp_BB_iso_call", 7],
    [{ limpAction: "raise", limpResponseAction: "raise", limpReraiseAction: "call" }, "SB_limp_BB_iso_SB_reraise_call", 21]]) {
    const limpBlocks = buildActionBlocks({ rangeType: "limp", opener: "SB", hero: "BB", callers: [], ...actions });
    const limpContext = completedFlopContext({ actionBlocks: limpBlocks, rangeType: "limp", opener: "SB", hero: "BB", callers: [], isDefaultTable: true, ...actions });
    assert.deepEqual([limpContext.spotId, limpContext.potBb], [id, pot]);
  }
});

test("every flop node, action and hand tier has a plain-language reason", async () => {
  const { actionReason, dominantTier } = await import("../src/estimated/postflop-reasons.js");
  const nodes = { btn_first: ["check", "bet33", "bet75"], bb_vs_33: ["fold", "call", "raise"], bb_vs_75: ["fold", "call", "raise"], btn_vs_raise: ["fold", "call"] };
  for (const [node, actions] of Object.entries(nodes)) for (const action of actions)
    for (const tier of ["monster", "strong", "draw", "medium", "air"]) assert.ok(actionReason(node, action, tier), `${node}/${action}/${tier}`);
  assert.equal(dominantTier({ monster: 0.2, strong: 0, draw: 0.5, medium: 0.3, air: 0 }), "draw");
});

test("combo explanation splits the opponent range into value, fold-out and continue groups", async () => {
  const { explainCombo, handClass } = await import("../scripts/postflop-ai/explain.mjs");
  const { loadInputs } = await import("../scripts/postflop-ai/inputs.mjs");
  const { parseCards } = await import("../scripts/postflop-ai/model.mjs");
  const { referencePolicy } = await import("../scripts/postflop-ai/policy.mjs");
  assert.equal(handClass(parseCards("KcAs", 2)), "AKo");
  const inputs = loadInputs();
  const boardCards = parseCards("Js8s5d", 3);
  const bet = explainCombo({ boardCards, node: "btn_first", cards: "AsKc", inputs, policy: referencePolicy });
  assert.deepEqual(Object.keys(bet.actions).sort(), ["bet33", "bet75", "check"]);
  assert.deepEqual(bet.actions.bet33.groups.map(group => group.key), ["value", "foldBetter", "continueBetter"]);
  const [value, foldBetter, continueBetter] = bet.actions.bet33.groups;
  const shares = value.share + continueBetter.share + bet.actions.bet33.foldShare;
  assert.ok(shares > 0.99 && shares <= 1.0001, `shares ${shares}`);
  const call = explainCombo({ boardCards, node: "bb_vs_33", cards: "Th9d", inputs, policy: referencePolicy });
  assert.ok(Math.abs(call.actions.call.required - 1.815 / (5.5 + 1.815 * 2)) < 0.001);
  assert.throws(() => explainCombo({ boardCards, node: "btn_first", cards: "JsKc", inputs, policy: referencePolicy }), /ボード/);
  const leads = (await import("../scripts/postflop-ai/policy.mjs")).referencePolicyFor("oop_leads");
  const sbInputs = loadInputs("SB_open_BB_call");
  const sbCall = explainCombo({ boardCards, node: "ip_vs_33", cards: "Th9d", inputs: sbInputs, policy: leads });
  assert.ok(Math.abs(sbCall.actions.call.required - 2.31 / (7 + 2.31 * 2)) < 0.001);
  assert.deepEqual(Object.keys(explainCombo({ boardCards, node: "oop_first", cards: "AsKc", inputs: sbInputs, policy: leads }).actions).sort(), ["bet33", "bet75", "check"]);
  assert.throws(() => explainCombo({ boardCards, node: "oop_first", cards: "AsKc", inputs, policy: referencePolicy }), /未対応/);
  // In a 3bet pot, a raise is capped by the stack when computing the price.
  const threeBetInputs = loadInputs("UTG_open_BB_3bet_call");
  const vsRaise = explainCombo({ boardCards, node: "oop_vs_raise", cards: "AsAd", prev: "bet75", inputs: threeBetInputs, policy: leads });
  assert.ok(Math.abs(vsRaise.actions.call.required - (24.5 * 0.75 * 2) / (24.5 + 24.5 * 0.75 * 4 + 24.5 * 0.75 * 2)) < 0.001);
});
