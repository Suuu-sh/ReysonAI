import test, { before, after } from "node:test";
const core = ({ options, labels, labelsJa, ...rest }) => rest;
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { color, label } from "../src/data.ts";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, sha } from "../scripts/postflop-ai/generate.mjs";
import { DEFAULT_SPOT_ID, POSTFLOP_SPOTS, fourBetSpotFor, limpSpotFor, spotById, spotFor, threeBetSpotFor } from "../scripts/postflop-ai/spots.ts";
import { playHand, simulate } from "../scripts/postflop-ai/simulation.mjs";
import { createTable, playFlop, playLaterStreets, playLaterStreetsWithPolicy, settle } from "../scripts/postflop-ai/engine.ts";
import { FLOP_BETS, flopState, isFlopBet, treeHistories, treeNodes } from "../scripts/postflop-ai/tree.ts";
import { parseCards } from "../scripts/postflop-ai/model.ts";
import preflopRanges from "../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBetResponses from "../src/estimated/three-bet-responses.json" with { type: "json" };
import { buildLaterView, buildLocalBoard } from "../scripts/postflop-ai/local-view.mjs";
import { referencePolicy, referencePolicyFor, validatePolicy } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { buildFlopActionBlocks, buildLaterActionBlocks, completedFlopContext, deck, flopDecision, laterStart, replayLater, recognizedFlop, representativeFlops } from "../src/estimated/postflop-trial.ts";
import { nextPendingStreetCardDialog } from "../src/estimated/street-card-dialog-state.ts";

test("turn and river card dialogs open on each newly pending street, but not after a manual close", () => {
  const context = completedFlopContext({ actionBlocks: [{ kind: "end", result: "2人でフロップへ", pot: "ポット 5.5bb" }],
    rangeType: "response", opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  const pendingBoard = blocks => blocks.find(block => block.kind === "board" && block.pending)?.street ?? null;
  let previous = null;
  const advance = pending => {
    const next = nextPendingStreetCardDialog(pending, previous);
    previous = pending;
    return next;
  };
  const turnPending = pendingBoard(buildLaterActionBlocks({ flopActions: ["check"] }, context));
  assert.equal(turnPending, "turn");
  assert.equal(advance(turnPending), "turn");
  assert.equal(advance(turnPending), null, "closing without selecting must not immediately reopen the same street");
  assert.equal(advance(pendingBoard(buildLaterActionBlocks({ flopActions: ["check"], turnCard: "Kh" }, context))), null,
    "selecting the turn clears the pending street");
  const riverPending = pendingBoard(buildLaterActionBlocks({ flopActions: ["check"], turnCard: "Kh", turnActions: ["check", "check"] }, context));
  assert.equal(riverPending, "river");
  assert.equal(advance(riverPending), "river", "completing the turn action opens the river picker automatically");
});

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
  assert.equal(POSTFLOP_SPOTS.length, 49);
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
  const chain = (bets, depth) => Array.from({ length: depth }, (_, i) => bets.map(bet => `${bet},${Array(i + 1).fill("raise").join(",")}`)).flat();
  assert.deepEqual(Object.keys(treeHistories("oop_checks")), ["", "bet33", "bet75", "bet125", ...chain(["bet33", "bet75", "bet125"], 4)]);
  assert.deepEqual(Object.keys(treeHistories("oop_leads")).filter(key => !key.includes("raise")), ["", "check", "bet33", "bet75", "bet125", "check,bet33", "check,bet75", "check,bet125"]);
  assert.equal(Object.keys(treeHistories("oop_leads")).length, 8 + 24);
  assert.deepEqual(flopState("oop_leads", ["bet75", "raise", "fold"]).end, { type: "raise-fold", winner: "ip", raises: 1 });
  assert.deepEqual(flopState("oop_leads", ["check", "check"]).end, { type: "check" });
  assert.throws(() => flopState("oop_checks", ["check", "check"]), /Illegal/);
  assert.throws(() => flopState("oop_leads", ["bet33", "check"]), /Illegal/);
  // A policy is validated against its own tree's nodes and fallbacks.
  assert.throws(() => validatePolicy(referencePolicy, "oop_leads"), /Invalid postflop policy envelope|Missing fallback/);
  assert.throws(() => validatePolicy(referencePolicyFor("oop_leads"), "oop_checks"), /Invalid postflop policy/);
  assert.equal(referencePolicyFor("oop_leads").rules.length, treeNodes("oop_leads").length * 5);
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
    SB_limp_BB_iso_SB_reraise_BB_4bet_call: ["BB", "SB", 52, 74, "oop_checks"],
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
  assert.deepEqual(core(flopDecision(["bet33"], limpSpotFor("SB_limp_BB_check"))), { node: "ip_vs_33", actor: "BB", potBb: 2.66, history: ["SB Bet 0.66 (33%)"] });
});

test("low-SPR 4bet pots: a raise over the stack is an all-in, the rest is dealt, chips are conserved", () => {
  const spot = spotById("UTG_open_HJ_4bp_call");
  assert.deepEqual(flopDecision(["bet75", "raise"], spot).history, ["UTG Bet 31.13 (75%)", "HJ All-in 80"]);
  assert.deepEqual(flopDecision(["bet75", "raise", "call"], spot), { result: "UTGがコール。フロップの判断は終了です。", potBb: 201.5, history: ["UTG Bet 31.13 (75%)", "HJ All-in 80", "UTG Call All-in"] });
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

  assert.deepEqual(core(flopDecision([], sb)), { node: "oop_first", actor: "SB", potBb: 7, history: [] });
  assert.deepEqual(core(flopDecision(["bet33"], sb)), { node: "ip_vs_33", actor: "BB", potBb: 9.31, history: ["SB Bet 2.31 (33%)"] });
  assert.deepEqual(flopDecision(["bet33", "raise"], sb).history, ["SB Bet 2.31 (33%)", "BB Raise 6.93 (40%)"]);
  assert.equal(flopDecision(["bet33", "raise"], sb).node, "oop_vs_raise");
  assert.equal(flopDecision(["bet33", "fold"], sb).result, "BBがフォールド。SBの勝ちです。");
  assert.equal(flopDecision(["bet75", "raise", "call"], sb).potBb, 38.5);
  assert.deepEqual(flopDecision(["check", "bet33"], sb).history, ["SB Check", "BB Bet 2.31 (33%)"]);
  assert.equal(flopDecision(["check", "bet33", "raise"], sb).history.at(-1), "SB Raise 6.93 (40%)");
  const sbBlocks = buildFlopActionBlocks(["check", "bet75", "raise"], sb);
  assert.deepEqual(sbBlocks.map(block => [block.position, block.stack]), [["SB", "96.5"], ["BB", "96.5"], ["SB", "96.5"], ["BB", "91.25"]]);
  assert.ok(!sbBlocks.some(block => block.kind === "flop-forced"));

  assert.deepEqual(buildFlopActionBlocks(["bet33"], co).map(block => block.position), ["CO", "BTN"]);
  assert.equal(flopDecision(["bet33"], co).history[0], "CO Bet 2.15 (33%)");
  assert.equal(flopDecision(["check", "check"], co).result, "BTNもチェック。フロップの判断は終了です。");
});

test("3bet pots: the SB/BB 3bettor leads out of position, an IP 3bettor faces a check", () => {
  const bb = spotById("UTG_open_BB_3bet_call"), hj = spotById("UTG_open_HJ_3bet_call");
  assert.deepEqual(core(flopDecision(["bet33"], bb)), { node: "ip_vs_33", actor: "UTG", potBb: 32.59, history: ["BB Bet 8.09 (33%)"] });
  assert.equal(flopDecision(["bet33", "raise"], bb).history.at(-1), "UTG Raise 24.27 (40%)");
  assert.equal(flopDecision(["bet75", "raise", "call"], bb).potBb, 134.78);
  assert.deepEqual(core(flopDecision(["bet33"], hj)), { node: "bb_vs_33", actor: "UTG", potBb: 23.28, history: ["UTG Check", "HJ Bet 5.78 (33%)"] });
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
  // When the local candidate exists (it is git-ignored), it must load against the current fingerprint.
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
  assert.equal(flopDecision(["bet33", "raise", "raise"]).node, "bb_vs_raise2");
  assert.throws(() => flopDecision(["bet33", "raise", "raise", "raise", "raise", "raise"]), /Illegal/);
});

test("three distinct selected cards resolve to one canonical flop, representative or not", () => {
  assert.equal(recognizedFlop(["2c", "As", "7d"]), "As7d2c");
  assert.equal(recognizedFlop(["Kc", "Kd", "4h"]), "KdKc4h");
  assert.ok(representativeFlops.includes(recognizedFlop(["Kc", "Kd", "4h"])));
  assert.equal(recognizedFlop(["As", "As", "7d"]), null);
  assert.equal(recognizedFlop(["As", "7d", ""]), null);
  assert.equal(recognizedFlop(["As", "7d", "3c"]), "As7d3c");
  assert.equal(recognizedFlop(["3c", "As", "7d"]), "As7d3c");
});

test("every three-card combination in the deck has a canonical selectable flop", () => {
  const flops = new Set();
  for (let first = 0; first < deck.length; first++) for (let second = first + 1; second < deck.length; second++) {
    for (let third = second + 1; third < deck.length; third++) {
      flops.add(recognizedFlop([deck[first], deck[second], deck[third]]));
    }
  }
  assert.equal(flops.size, 22100);
  assert.ok(!flops.has(null));
});

test("flop decisions reuse preflop-style action blocks without inventing later actions", () => {
  const first = buildFlopActionBlocks();
  assert.deepEqual(first.map(block => block.position), ["BB", "BTN"]);
  assert.equal(first[1].active, true);
  assert.deepEqual(first[1].options.map(option => option.action), ["check", "bet33", "bet75", "bet125"]);
  const raised = buildFlopActionBlocks(["bet33", "raise"]);
  assert.deepEqual(raised.map(block => block.position), ["BB", "BTN", "BB", "BTN"]);
  assert.deepEqual(raised[3].options.map(option => option.action), ["fold", "call", "raise"]);
  assert.equal(raised[2].flopIndex, 1);
  assert.equal(buildFlopActionBlocks(["bet33", "raise", "call"]).at(-1).kind, "end");
});

test("read-only board projection expands saved source combos without revealing another hand", () => {
  const inputs = loadInputs();
  const candidate = { metadata: { source_hash: inputs.fingerprint, policy_hash: sha(referencePolicy) }, policy: referencePolicy };
  const data = buildLocalBoard("As7d2c", inputs, candidate);
  assert.equal(data.kind, "ai_estimate_not_gto");
  assert.equal(data.board, "As7d2c");
  assert.deepEqual(Object.keys(data.nodes), ["btn_first", "bb_vs_33", "bb_vs_75", "bb_vs_125", "btn_vs_raise", "bb_vs_raise2", "btn_vs_raise3", "bb_vs_raise4"]);
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
  assert.equal(Object.keys(co.nodes).length, 16);
  // A policy for the other tree is rejected.
  assert.throws(() => buildLocalBoard("As7d2c", coInputs, { metadata: { source_hash: coInputs.fingerprint, policy_hash: sha(referencePolicy) }, policy: referencePolicy }), /Invalid postflop policy envelope|Missing fallback/);
  assert.throws(() => buildLocalBoard("As7d2c", coInputs, { ...candidate, policy: leads }), /ハッシュ/);
  assert.throws(() => buildLocalBoard("AsAsAs", inputs, candidate), /Duplicate cards/);
  candidate.metadata.policy_hash = "wrong";
  assert.throws(() => buildLocalBoard("As7d2c", inputs, candidate), /ハッシュ/);
});

test("later-street action blocks follow the completed flop, deal one board card, and stop on folds or all-ins", () => {
  const spot = spotById("BTN_open_BB_call");
  const pending = buildLaterActionBlocks({ flopActions: ["bet33", "call"] }, spot);
  assert.deepEqual(pending, [{ key: "turn-board", kind: "board", cards: [], street: "turn", pending: true, potBb: 9.14 }]);
  const turn = buildLaterActionBlocks({ flopActions: ["bet33", "call"], turnCard: "Kh" }, spot);
  assert.deepEqual(turn[0], { key: "turn-board", kind: "board", cards: ["Kh"], street: "turn", pending: false, potBb: 9.14 });
  assert.equal(turn.at(-1).key, "turn_oop_first");
  assert.equal(turn.at(-1).active, true);
  assert.deepEqual(turn.at(-1).options.map(option => option.action), ["check", "bet33", "bet75", "bet125"]);

  const turnComplete = buildLaterActionBlocks({ flopActions: ["bet33", "call"], turnCard: "Kh", turnActions: ["check", "check"] }, spot);
  assert.equal(turnComplete.some(block => block.kind === "end"), false);
  assert.deepEqual(turnComplete.at(-1), { key: "river-board", kind: "board", cards: [], street: "river", pending: true, potBb: 9.14 });
  assert.equal(buildLaterActionBlocks({ flopActions: ["bet33", "fold"] }, spot).length, 0);
  const fourBet = spotById("BTN_open_BB_4bp_call");
  assert.equal(laterStart(["bet125", "call"], fourBet), null);
  assert.equal(buildLaterActionBlocks({ flopActions: ["bet125", "call"] }, fourBet).length, 0);
  const foldedTurn = buildLaterActionBlocks({ flopActions: ["bet33", "call"], turnCard: "Kh", turnActions: ["bet75", "fold"] }, spot);
  assert.equal(foldedTurn.at(-1).kind, "end");
  assert.match(foldedTurn.at(-1).result, /フォールド/);
  assert.equal(foldedTurn.some(block => block.key === "river-board"), false);
  const allInTurn = buildLaterActionBlocks({ flopActions: ["check"], turnCard: "Kh", turnActions: ["bet125", "call"] }, fourBet);
  assert.equal(allInTurn.at(-1).kind, "end");
  assert.equal(allInTurn.at(-1).result, "オールイン・ショウダウン");
  assert.equal(allInTurn.some(block => block.key === "river-board"), false);
});

test("later-street chip replay matches the engine for an SRP line and a low-SPR all-in merge", () => {
  const inputs = loadInputs();
  const cases = [
    { spot: spotById("BTN_open_BB_call"), flop: ["bet33", "call"], turn: ["bet75", "call"], river: ["check", "bet33", "raise", "call"] },
    { spot: spotById("BTN_open_BB_4bp_call"), flop: ["check"], turn: ["bet125", "call"], river: [] },
  ];
  for (const fixture of cases) {
    const { spot, flop, turn, river } = fixture;
    const table = createTable(spot);
    let flopIndex = 0;
    playFlop(table, spot.tree, () => flop[flopIndex++], inputs.config);
    const start = laterStart(flop, spot);
    assert.ok(start);
    assert.deepEqual([start.pot, start.stacks.ip, start.stacks.oop], [table.pot, table.stacks[spot.ip], table.stacks[spot.oop]]);

    const turnReplay = replayLater("turn", turn, start, spot);
    let expected = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    const forced = Object.fromEntries(turnReplay.state.steps.map(step => [step.node, step.action]));
    let riverReplay = null;
    if (river.length && turnReplay.state.end && turnReplay.stacks.ip > 0 && turnReplay.stacks.oop > 0) {
      riverReplay = replayLater("river", river, expected, spot);
      expected = { pot: riverReplay.pot, stacks: riverReplay.stacks, lastAggressor: riverReplay.lastAggressor };
      for (const step of riverReplay.state.steps) forced[step.node] = step.action;
    }
    playLaterStreetsWithPolicy(table, parseCards("As7d2c", 3), parseCards("3s4s", 2), (_seat, node) => forced[node], inputs.config, table.lastAggressor);
    const expectedStacks = riverReplay?.stacks ?? turnReplay.stacks;
    const expectedPot = riverReplay?.pot ?? turnReplay.pot;
    assert.deepEqual([expectedPot, expectedStacks.ip, expectedStacks.oop], [table.pot, table.stacks[spot.ip], table.stacks[spot.oop]], spot.id);
    if (spot.kind === "4bp") {
      assert.deepEqual([turnReplay.pot, turnReplay.stacks.ip, turnReplay.stacks.oop], [200.5, 0, 0]);
      assert.match(turnReplay.history[0], /All-in 74$/);
      assert.match(turnReplay.history[1], /Call All-in$/);
    }
  }
});

test("later decision projections return 169 normalized rows without weighting opponent actions", () => {
  const inputs = loadInputs();
  const flopCandidate = { metadata: { source_hash: inputs.fingerprint }, policy: referencePolicy };
  flopCandidate.metadata.policy_hash = sha(referencePolicy);
  const laterPolicy = referenceLaterPolicy();
  const laterCandidate = { metadata: { source_hash: inputs.fingerprint, flop_policy_hash: flopCandidate.metadata.policy_hash, policy_hash: sha(laterPolicy) }, policy: laterPolicy };
  const view = buildLaterView({ flop: "As7d2c", flopActions: "bet33,call", turn: "Kh" }, inputs, flopCandidate, laterCandidate);
  assert.deepEqual([view.kind, view.street, view.node, view.actor, view.line, view.rows.length], ["ai_estimate_not_gto", "turn", "turn_oop_first", "BB", "defender", 169]);
  for (const row of view.rows) {
    if (row.reachable) {
      assert.ok(Math.abs(Object.values(row.mix).reduce((sum, value) => sum + value, 0) - 1) < 1e-10, row.hand);
      assert.ok(Math.abs(Object.values(row.tiers).reduce((sum, value) => sum + value, 0) - 1) < 1e-10, row.hand);
    }
    assert.equal(row.comboCount, row.combos.length);
    assert.ok(Math.abs(row.reachWeight - row.combos.reduce((sum, combo) => sum + combo.weight, 0)) < 1e-10, row.hand);
    assert.ok(row.combos.every(combo => combo.weight > 0 && combo.cards.length === 4 && !["As", "7d", "2c", "Kh"].includes(combo.cards.slice(0, 2)) && !["As", "7d", "2c", "Kh"].includes(combo.cards.slice(2))), row.hand);
    for (const action of Object.keys(row.mix)) {
      const weighted = row.combos.reduce((sum, combo) => sum + combo.weight * combo.mix[action], 0);
      assert.ok(Math.abs((row.reachWeight ? weighted / row.reachWeight : 0) - row.mix[action]) < 1e-10, `${row.hand}/${action}`);
    }
  }
  assert.ok(view.rows.some(row => row.combos.length > 1 && new Set(row.combos.map(combo => combo.cards.slice(1, 2))).size > 1));
  const riverView = buildLaterView({ flop: "As7d2c", flopActions: "bet33,call", turn: "Kh", turnActions: "check,check", river: "2d" }, inputs, flopCandidate, laterCandidate);
  assert.deepEqual([riverView.street, riverView.node, riverView.actor, riverView.line, riverView.texture, riverView.rows.length], ["river", "river_oop_first", "BB", "checked", "pair", 169]);
  assert.ok(riverView.rows.every(row => row.combos.every(combo => ![combo.cards.slice(0, 2), combo.cards.slice(2)].includes("2d"))));
  const suitedTurn = buildLaterView({ flop: "Js8s5d", flopActions: "bet33,call", turn: "2s" }, inputs, flopCandidate, laterCandidate);
  assert.ok(suitedTurn.rows.some(row => new Set(row.combos.map(combo => JSON.stringify(combo.mix))).size > 1), "turn policy retains suit-specific mixes");
  const suitedRiver = buildLaterView({ flop: "Js8s5d", flopActions: "bet33,call", turn: "2s", turnActions: "check,check", river: "2d" }, inputs, flopCandidate, laterCandidate);
  assert.ok(suitedRiver.rows.some(row => new Set(row.combos.map(combo => JSON.stringify(combo.mix))).size > 1), "river policy retains suit-specific mixes");

  const coInputs = loadInputs("CO_open_BTN_call");
  const leads = referencePolicyFor("oop_leads");
  const noOpponentWeightPolicy = { ...leads, rules: leads.rules.map(rule => /^ip_vs_\d+$/.test(rule.node)
    ? { ...rule, mix: { fold: 0, call: 100, raise: 0 } } : rule) };
  validatePolicy(noOpponentWeightPolicy, "oop_leads");
  const coCandidate = { metadata: { source_hash: coInputs.fingerprint, policy_hash: sha(noOpponentWeightPolicy) }, policy: noOpponentWeightPolicy };
  const coLaterCandidate = { metadata: { source_hash: coInputs.fingerprint, flop_policy_hash: coCandidate.metadata.policy_hash, policy_hash: sha(laterPolicy) }, policy: laterPolicy };
  const smallLead = buildLaterView({ flop: "As7d2c", flopActions: "bet33,call", turn: "Kh", turnActions: "check" }, coInputs, coCandidate, coLaterCandidate);
  const largeLead = buildLaterView({ flop: "As7d2c", flopActions: "bet75,call", turn: "Kh", turnActions: "check" }, coInputs, coCandidate, coLaterCandidate);
  assert.deepEqual([smallLead.node, smallLead.actor, smallLead.line], ["turn_ip_first", "BTN", "defender"]);
  assert.deepEqual(smallLead.rows, largeLead.rows);
  assert.throws(() => buildLaterView({ flop: "As7d2c", flopActions: "bet33,call", turn: "Kh" }, inputs, flopCandidate, null), /ターン・リバーのAI方針がありません/);
});

let server, ActionPath, Sidebar, PostflopTrial, FlopCardDialog, StreetCardDialog, buildActionBlocks, labelsFor, nodeTitle, laterNodeTitle, randomFlop;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ ActionPath, buildActionBlocks } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.tsx"));
  ({ Sidebar } = await server.ssrLoadModule("/src/components/layout.tsx"));
  ({ PostflopTrial, FlopCardDialog, StreetCardDialog, labelsFor, nodeTitle, laterNodeTitle, randomFlop } = await server.ssrLoadModule("/src/estimated/PostflopTrial.tsx"));
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
  const laterPath = renderToStaticMarkup(createElement(ActionPath, { expanded: true, blocks: [
    { key: "turn-board", kind: "board", cards: ["Kh"], street: "turn" },
    { key: "turn_oop_first", kind: "flop", street: "turn", laterIndex: 0, position: "BB", stack: "95.68", chosen: null,
      options: [{ action: "check", label: "Check" }, { action: "bet75", label: "Bet 75%" }], active: true },
  ], onOpenLaterCard() {}, onLaterAction() {}, onRewindActionBlock() {} }));
  assert.match(laterPath, /action-seat-board-later[\s\S]*Turn[\s\S]*K<span class="suit">♥<\/span>[\s\S]*action-seat-flop active[\s\S]*BB[\s\S]*Bet 75%/);
  const navigation = renderToStaticMarkup(createElement(Sidebar, { activeSection: "レンジ分析", onSectionChange() {} }));
  assert.doesNotMatch(navigation, /aria-label="ポストフロップ/);
});

test("any flop can be selected manually or randomly without representative quick picks", () => {
  const dialog = renderToStaticMarkup(createElement(FlopCardDialog, { cards: ["As", "", ""], onApply() {}, onClose() {} }));
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.equal((dialog.match(/<select/g) ?? []).length, 0);
  assert.equal((dialog.match(/aria-label="フロップ /g) ?? []).length, 0);
  assert.equal((dialog.match(/class="flop-quick-picks"/g) ?? []).length, 0);
  assert.doesNotMatch(dialog, /Quick picks|代表12ボード/);
  assert.equal((dialog.match(/class="street-card-option suit-/g) ?? []).length, 52);
  assert.match(dialog, /ランダムなフロップ/);
  assert.match(dialog, /好きなカードを3枚選べます/);
  const random = randomFlop(() => 0.37);
  assert.equal(random.length, 3);
  assert.equal(new Set(random).size, 3);
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => "en" } };
  try {
    const english = renderToStaticMarkup(createElement(FlopCardDialog, { cards: ["As", "", ""], onApply() {}, onClose() {} }));
    assert.match(english, /Select flop/);
    assert.match(english, /Random flop/);
    assert.doesNotMatch(english, /Quick picks|representative flops|flop-quick-picks/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  const complete = renderToStaticMarkup(createElement(FlopCardDialog, { cards: ["2c", "As", "7d"], onApply() {}, onClose() {} }));
  assert.doesNotMatch(complete, /postflop-board-options|flop-quick-picks/);
  assert.match(complete, /class="flop-apply-button"[^>]*>このフロップを使う/);
  assert.doesNotMatch(complete, /GTO|solver/i);
  const html = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["SB", "BB"], potBb: 2, pilotAvailable: false }, cards: ["", "", ""] }));
  assert.match(html, /この局面のポストフロップ方針は未収録/);
  assert.doesNotMatch(html, /AI推定レンジ/);
  const available = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true, spotId: "BTN_open_BB_call", ip: "BTN", oop: "BB", stackBb: 97.5 }, cards: ["As", "7d", "3c"] }));
  assert.doesNotMatch(available, /代表12ボードに含まれません|このフロップの方針は未収録/);
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
    [{ limpAction: "raise", limpResponseAction: "raise", limpReraiseAction: "call" }, "SB_limp_BB_iso_SB_reraise_call", 21],
    [{ limpAction: "raise", limpResponseAction: "raise", limpReraiseAction: "raise", limpFourBetAction: "call" }, "SB_limp_BB_iso_SB_reraise_BB_4bet_call", 52]]) {
    const limpBlocks = buildActionBlocks({ rangeType: "limp", opener: "SB", hero: "BB", callers: [], ...actions });
    const limpContext = completedFlopContext({ actionBlocks: limpBlocks, rangeType: "limp", opener: "SB", hero: "BB", callers: [], isDefaultTable: true, ...actions });
    assert.deepEqual([limpContext.spotId, limpContext.potBb], [id, pot]);
  }
});

test("single-card street picker blocks used cards and localizes later node headings", () => {
  const dialog = renderToStaticMarkup(createElement(StreetCardDialog, { street: "turn", currentCard: "Kh", usedCards: ["As", "7d", "2c"], onApply() {}, onClose() {} }));
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.equal((dialog.match(/<button type="button" class="street-card-option/g) ?? []).length, 52);
  const suitRows = [...dialog.matchAll(/<div class="street-suit-row suit-([shdc])"[^>]*>(.*?)<\/div>/g)];
  assert.deepEqual(suitRows.map(([, suit]) => suit), ["s", "h", "d", "c"]);
  for (const [, suit, row] of suitRows) {
    assert.equal((row.match(/class="street-card-option/g) ?? []).length, 13);
    assert.ok(row.indexOf(`aria-label="2${{ s: "♠", h: "♥", d: "♦", c: "♣" }[suit]}"`) < row.indexOf(`aria-label="A${{ s: "♠", h: "♥", d: "♦", c: "♣" }[suit]}"`));
  }
  assert.match(dialog, /class="street-card-board"/);
  assert.match(dialog, /aria-label="A♠" disabled/);
  assert.match(dialog, /class="street-card-option suit-h selected" aria-pressed="true" aria-label="K♥"/);
  assert.equal(color("allin"), color("all_in"));
  assert.equal(label("allin"), label("all_in"));
  assert.equal(laterNodeTitle("turn_oop_first", { ip: "BTN", oop: "BB" }, "turn"), "BB · ターン · 最初の判断");
  assert.equal(laterNodeTitle("river_ip_vs_75", { ip: "BTN", oop: "BB" }, "river"), "BTN · リバー · 75%ベットへの応答");

  const previousWindow = globalThis.window;
  const hadWindow = Object.hasOwn(globalThis, "window");
  globalThis.window = { localStorage: { getItem: key => key === "reysonai:locale:v1" ? "en" : null } };
  try {
    assert.equal(laterNodeTitle("turn_oop_first", { ip: "BTN", oop: "BB" }, "turn"), "BB · Turn · first decision");
    assert.equal(laterNodeTitle("river_ip_vs_allin", { ip: "BTN", oop: "BB" }, "river"), "BTN · River · facing an all-in");
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test("125% flop bets use the shared size list, localized labels, and facing-node titles", () => {
  assert.deepEqual(FLOP_BETS, ["bet33", "bet75", "bet125"]);
  assert.equal(isFlopBet("bet125"), true);
  assert.equal(labelsFor("btn_first").bet125, "ベット 125%");
  assert.equal(labelsFor("ip_vs_125").bet125, "ベット 125%");
  const context = { ip: "BTN", oop: "BB" };
  assert.equal(nodeTitle("bb_vs_125", context), "BB · 125%ベットへの応答");
  assert.equal(nodeTitle("ip_vs_125", context), "BTN · 125%ベットへの応答");

  const previousWindow = globalThis.window;
  const hadWindow = Object.hasOwn(globalThis, "window");
  globalThis.window = { localStorage: { getItem: key => key === "reysonai:locale:v1" ? "en" : null } };
  try {
    assert.equal(nodeTitle("bb_vs_125", context), "BB · facing a 125% bet");
    assert.equal(nodeTitle("ip_vs_125", context), "BTN · facing a 125% bet");
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test("every flop node, action and hand tier has a plain-language reason", async () => {
  const { actionReason, dominantTier } = await import("../src/estimated/postflop-reasons.ts");
  const nodes = { btn_first: ["check", "bet33", "bet75", "bet125"], bb_vs_33: ["fold", "call", "raise"], bb_vs_75: ["fold", "call", "raise"], bb_vs_125: ["fold", "call", "raise"], ip_vs_125: ["fold", "call", "raise"], btn_vs_raise: ["fold", "call"] };
  for (const [node, actions] of Object.entries(nodes)) for (const action of actions)
    for (const tier of ["monster", "strong", "draw", "medium", "air"]) assert.ok(actionReason(node, action, tier), `${node}/${action}/${tier}`);
  assert.equal(dominantTier({ monster: 0.2, strong: 0, draw: 0.5, medium: 0.3, air: 0 }), "draw");
});

test("combo explanation splits the opponent range into value, fold-out and continue groups", async () => {
  const { explainCombo, handClass } = await import("../scripts/postflop-ai/explain.mjs");
  const { loadInputs } = await import("../scripts/postflop-ai/inputs.mjs");
  const { parseCards } = await import("../scripts/postflop-ai/model.ts");
  const { referencePolicy } = await import("../scripts/postflop-ai/policy.ts");
  assert.equal(handClass(parseCards("KcAs", 2)), "AKo");
  const inputs = loadInputs();
  const boardCards = parseCards("Js8s5d", 3);
  const bet = explainCombo({ boardCards, node: "btn_first", cards: "AsKc", inputs, policy: referencePolicy });
  assert.deepEqual(Object.keys(bet.actions).sort(), ["bet125", "bet33", "bet75", "check"]);
  assert.deepEqual(bet.actions.bet33.groups.map(group => group.key), ["value", "foldBetter", "continueBetter"]);
  const [value, foldBetter, continueBetter] = bet.actions.bet33.groups;
  const shares = value.share + continueBetter.share + bet.actions.bet33.foldShare;
  assert.ok(shares > 0.99 && shares <= 1.0001, `shares ${shares}`);
  // Break-even is call / (final pot - capped rake) (defence.ts).
  const breakEven = (call, potBefore, wager) => {
    const finalPot = potBefore + wager + call;
    return call / (finalPot - Math.min(finalPot * 0.05, 3));
  };
  const call = explainCombo({ boardCards, node: "bb_vs_33", cards: "Th9d", inputs, policy: referencePolicy });
  assert.ok(Math.abs(call.actions.call.required - breakEven(1.815, 5.5, 1.815)) < 0.001);
  assert.equal(call.defence.node, "bb_vs_33");
  assert.ok(Math.abs(call.defence.required_equity - call.actions.call.required) < 1e-3);
  assert.throws(() => explainCombo({ boardCards, node: "btn_first", cards: "JsKc", inputs, policy: referencePolicy }), /ボード/);
  const leads = (await import("../scripts/postflop-ai/policy.ts")).referencePolicyFor("oop_leads");
  const sbInputs = loadInputs("SB_open_BB_call");
  const sbCall = explainCombo({ boardCards, node: "ip_vs_33", cards: "Th9d", inputs: sbInputs, policy: leads });
  assert.ok(Math.abs(sbCall.actions.call.required - breakEven(2.31, 7, 2.31)) < 0.001);
  assert.deepEqual(Object.keys(explainCombo({ boardCards, node: "oop_first", cards: "AsKc", inputs: sbInputs, policy: leads }).actions).sort(), ["bet125", "bet33", "bet75", "check"]);
  assert.throws(() => explainCombo({ boardCards, node: "oop_first", cards: "AsKc", inputs, policy: referencePolicy }), /未対応/);
  // In a 3bet pot, a raise is capped by the stack when computing the price.
  const threeBetInputs = loadInputs("UTG_open_BB_3bet_call");
  const vsRaise = explainCombo({ boardCards, node: "oop_vs_raise", cards: "AsAd", prev: "bet75", inputs: threeBetInputs, policy: leads });
  assert.ok(Math.abs(vsRaise.actions.call.required - breakEven(24.5 * 0.75 * 2, 24.5 + 24.5 * 0.75, 24.5 * 0.75 * 3)) < 0.001);
});

test("combo evidence reasons follow the computed numbers", async () => {
  const { evidenceReason } = await import("../src/estimated/postflop-reasons.ts");
  const bet = groups => ({ foldShare: 0.3, groups: Object.entries(groups).map(([key, share]) => ({ key, share, hands: [] })) });
  assert.match(evidenceReason("bet33", bet({ value: 0.4, foldBetter: 0.1, continueBetter: 0.2 }), 0.6), /主にバリュー.*40%/);
  assert.match(evidenceReason("bet75", bet({ value: 0.05, foldBetter: 0.25, continueBetter: 0.3 }), 0.4), /主に降ろし.*25%/);
  assert.match(evidenceReason("bet75", bet({ value: 0.05, foldBetter: 0.03, continueBetter: 0.6 }), 0.3), /効果は限定的/);
  assert.match(evidenceReason("call", { required: 0.2, groups: [] }, 0.35), /上回る/);
  assert.match(evidenceReason("call", { required: 0.3, groups: [] }, 0.2), /届かず/);
  assert.match(evidenceReason("fold", { required: 0.3, groups: [] }, 0.2), /降りるのが基本/);
  assert.equal(evidenceReason("check", null, 0.5), null);
});
