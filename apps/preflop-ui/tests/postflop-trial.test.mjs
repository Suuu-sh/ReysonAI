import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { sha } from "../scripts/postflop-ai/generate.mjs";
import { buildLocalBoard } from "../scripts/postflop-ai/local-view.mjs";
import { referencePolicy } from "../scripts/postflop-ai/policy.mjs";
import { buildFlopActionBlocks, completedFlopContext, flopDecision, recognizedFlop, representativeFlops } from "../src/estimated/postflop-trial.js";

const end = (result, pot) => [{ kind: "end", result, pot: `ポット ${pot}bb` }];

test("only complete paths can enter the next street, with unsupported paths marked pending", () => {
  const eligible = completedFlopContext({ actionBlocks: end("2人でフロップへ", 5.5), rangeType: "response",
    opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true, isDefaultTable: true });
  assert.deepEqual(eligible, { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true });
  assert.equal(completedFlopContext({ actionBlocks: [], rangeType: "response", opener: "BTN", hero: "BB",
    callers: ["BB"], foldedHero: true, isDefaultTable: true }), null);
  assert.equal(completedFlopContext({ actionBlocks: end("BTNの勝ち", 3), rangeType: "response", opener: "BTN", hero: "BB",
    callers: [], foldedHero: true, isDefaultTable: true }), null);
  assert.equal(completedFlopContext({ actionBlocks: end("2人でフロップへ", 5.5), rangeType: "response", opener: "BTN", hero: "BB",
    callers: ["BB"], foldedHero: true, isDefaultTable: false }).pilotAvailable, false);
  assert.deepEqual(completedFlopContext({ actionBlocks: end("2人でフロップへ", 2), rangeType: "limp",
    opener: "SB", hero: "BB", callers: [], foldedHero: false, isDefaultTable: true }).players, ["SB", "BB"]);
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
  const missing = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true }, cards: ["As", "7d", "3c"] }));
  assert.match(missing, /このフロップの方針は未収録/);
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
});
