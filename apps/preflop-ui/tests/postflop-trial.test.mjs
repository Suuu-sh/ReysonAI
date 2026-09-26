import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, sha } from "../scripts/postflop-ai/generate.mjs";
import { DEFAULT_SPOT_ID, POSTFLOP_SPOTS, spotById, spotFor } from "../scripts/postflop-ai/spots.mjs";
import { simulate } from "../scripts/postflop-ai/simulation.mjs";
import preflopRanges from "../src/estimated/preflop-ranges.json" with { type: "json" };
import { buildLocalBoard } from "../scripts/postflop-ai/local-view.mjs";
import { referencePolicy } from "../scripts/postflop-ai/policy.mjs";
import { buildFlopActionBlocks, completedFlopContext, flopDecision, recognizedFlop, representativeFlops } from "../src/estimated/postflop-trial.js";

const end = (result, pot) => [{ kind: "end", result, pot: `ポット ${pot}bb` }];

test("only complete paths can enter the next street, with unsupported paths marked pending", () => {
  const eligible = completedFlopContext({ actionBlocks: end("2人でフロップへ", 5.5), rangeType: "response",
    opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual(eligible, { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true,
    spotId: "BTN_open_BB_call", ip: "BTN", oop: "BB", stackBb: 97.5 });
  assert.equal(completedFlopContext({ actionBlocks: [], rangeType: "response", opener: "BTN", hero: "BB",
    callers: ["BB"], foldedHero: true, isDefaultTable: true }), null);
  assert.equal(completedFlopContext({ actionBlocks: end("BTNの勝ち", 3), rangeType: "response", opener: "BTN", hero: "BB",
    callers: [], foldedHero: true, isDefaultTable: true }), null);
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 5.5), rangeType: "response", opener: "BTN", hero: "BB",
    callers: ["BB"], foldedHero: true, isDefaultTable: false }).pilotAvailable, false);
  assert.deepEqual(completedFlopContext({ actionBlocks: end("2人でフロップへ", 2), rangeType: "limp",
    opener: "SB", hero: "BB", callers: [], foldedHero: false, isDefaultTable: true }).players, ["SB", "BB"]);
});

test("every saved open response becomes a heads-up single-raised-pot flop spot", () => {
  assert.equal(POSTFLOP_SPOTS.length, 15);
  assert.deepEqual(POSTFLOP_SPOTS.map(spot => spot.responseId).sort(), preflopRanges.spots.map(spot => spot.id).sort());
  const table = Object.fromEntries(POSTFLOP_SPOTS.map(spot => [spot.id, [spot.ip, spot.oop, spot.potBb, spot.stackBb]]));
  assert.deepEqual(table, {
    UTG_open_HJ_call: ["HJ", "UTG", 6.5, 97.5], UTG_open_CO_call: ["CO", "UTG", 6.5, 97.5], UTG_open_BTN_call: ["BTN", "UTG", 6.5, 97.5],
    UTG_open_SB_call: ["UTG", "SB", 6, 97.5], UTG_open_BB_call: ["UTG", "BB", 5.5, 97.5],
    HJ_open_CO_call: ["CO", "HJ", 6.5, 97.5], HJ_open_BTN_call: ["BTN", "HJ", 6.5, 97.5], HJ_open_SB_call: ["HJ", "SB", 6, 97.5], HJ_open_BB_call: ["HJ", "BB", 5.5, 97.5],
    CO_open_BTN_call: ["BTN", "CO", 6.5, 97.5], CO_open_SB_call: ["CO", "SB", 6, 97.5], CO_open_BB_call: ["CO", "BB", 5.5, 97.5],
    BTN_open_SB_call: ["BTN", "SB", 6, 97.5], BTN_open_BB_call: ["BTN", "BB", 5.5, 97.5], SB_open_BB_call: ["BB", "SB", 7, 96.5],
  });
  assert.equal(spotById().id, DEFAULT_SPOT_ID);
  assert.equal(spotById("BTN_open_BB_call").slug, "btn-bb-srp-v1");
  assert.equal(spotById("SB_open_BB_call").slug, "sb-bb-srp-v1");
  assert.match(artifactPaths(spotById()).candidate, /\.local\/postflop-ai\/btn-bb-srp-v1-policy\.json$/);
  assert.match(artifactPaths(spotById("CO_open_BTN_call")).handEv, /co-btn-srp-v1-hand-ev\.json$/);
  assert.equal(spotFor("BB", "SB"), null);
  assert.throws(() => spotById("BB_open_SB_call"), /Unknown postflop spot/);
  // SB is saved as 3bet-or-fold, so the four SB-call spots are listed but unreachable.
  assert.deepEqual(POSTFLOP_SPOTS.filter(spot => !spot.reachable).map(spot => spot.id),
    ["UTG_open_SB_call", "HJ_open_SB_call", "CO_open_SB_call", "BTN_open_SB_call"]);
  for (const spot of POSTFLOP_SPOTS) {
    if (!spot.reachable) { assert.throws(() => loadInputs(spot.id), /unreachable/); continue; }
    const inputs = loadInputs(spot.id);
    assert.equal(inputs.opening.id, `${spot.opener}_open`);
    assert.equal(inputs.response.id, `${spot.caller}_vs_${spot.opener}`);
  }
  assert.notEqual(loadInputs("SB_open_BB_call").fingerprint, loadInputs().fingerprint);
});

test("SB vs BB and CO vs BTN use their own seats, pot and stacks", () => {
  const sb = completedFlopContext({ actionBlocks: end("2人でフロップへ", 7), rangeType: "response",
    opener: "SB", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual(sb, { players: ["SB", "BB"], potBb: 7, pilotAvailable: true, spotId: "SB_open_BB_call", ip: "BB", oop: "SB", stackBb: 96.5 });
  const co = completedFlopContext({ actionBlocks: end("2人でフロップへ", 6.5), rangeType: "response",
    opener: "CO", hero: "BB", callers: ["BTN"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual([co.spotId, co.ip, co.oop, co.potBb, co.stackBb], ["CO_open_BTN_call", "BTN", "CO", 6.5, 97.5]);
  // A pot that does not match the heads-up single-raised geometry, or a multiway pot, stays unrecorded.
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 8), rangeType: "response",
    opener: "CO", hero: "BB", callers: ["BTN"], foldedHero: true, isDefaultTable: true }).pilotAvailable, false);
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 6), rangeType: "response",
    opener: "BTN", hero: "BB", callers: ["SB"], foldedHero: true, isDefaultTable: true }).pilotAvailable, false);
  const multiway = completedFlopContext({ actionBlocks: end("3人でフロップへ", 8.5), rangeType: "response",
    opener: "CO", hero: "BB", callers: ["BTN", "BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual([multiway.pilotAvailable, multiway.spotId], [false, null]);

  assert.deepEqual(flopDecision([], sb), { node: "btn_first", actor: "BB", potBb: 7, history: ["SB Check"] });
  assert.deepEqual(flopDecision(["bet33"], sb).history, ["SB Check", "BB Bet 33% (2.31BB)"]);
  assert.equal(flopDecision(["bet33"], sb).actor, "SB");
  assert.equal(flopDecision(["bet33", "raise"], sb).history.at(-1), "SB Check-raise 6.93BB");
  assert.equal(flopDecision(["bet33", "fold"], sb).result, "SBがフォールド。BBの勝ちです。");
  assert.equal(flopDecision(["bet75", "raise", "call"], sb).potBb, 38.5);
  const sbBlocks = buildFlopActionBlocks(["bet75", "raise"], sb);
  assert.deepEqual(sbBlocks.map(block => [block.position, block.stack]), [["SB", "96.5"], ["BB", "96.5"], ["SB", "96.5"], ["BB", "91.25"]]);

  const coBlocks = buildFlopActionBlocks(["bet33"], co);
  assert.deepEqual(coBlocks.map(block => block.position), ["CO", "BTN", "CO"]);
  assert.equal(flopDecision(["bet33"], co).history[1], "BTN Bet 33% (2.15BB)");
  assert.equal(flopDecision(["check"], co).result, "BTNもチェック。フロップの判断は終了です。");
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
  const co = buildLocalBoard("As7d2c", coInputs, { metadata: { source_hash: coInputs.fingerprint, policy_hash: sha(referencePolicy) }, policy: referencePolicy });
  assert.deepEqual([co.spot, co.ip, co.oop, co.pot_bb, co.nodes.btn_first.seat, co.nodes.bb_vs_33.seat], ["CO_open_BTN_call", "BTN", "CO", 6.5, "BTN", "CO"]);
  assert.throws(() => buildLocalBoard("As7d2c", coInputs, candidate), /ハッシュ/);
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
  const navigation = renderToStaticMarkup(createElement(Sidebar, { activeSection: "プリフロップ", onSectionChange() {} }));
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
  const sbCall = explainCombo({ boardCards, node: "bb_vs_33", cards: "Th9d", inputs: loadInputs("SB_open_BB_call"), policy: referencePolicy });
  assert.ok(Math.abs(sbCall.actions.call.required - 2.31 / (7 + 2.31 * 2)) < 0.001);
});
