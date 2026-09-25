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

let server, ActionPath, Sidebar, PostflopTrial, FlopCardPicker, buildActionBlocks;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ ActionPath, buildActionBlocks } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.jsx"));
  ({ Sidebar } = await server.ssrLoadModule("/src/components/layout.jsx"));
  ({ PostflopTrial, FlopCardPicker } = await server.ssrLoadModule("/src/estimated/PostflopTrial.jsx"));
});
after(async () => { await server?.close(); });

test("completed preflop end block extends the same action path", () => {
  const blocks = buildActionBlocks({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true });
  const html = renderToStaticMarkup(createElement(ActionPath, { blocks, expanded: true, onEnterPostflop() {} }));
  assert.match(html, /フロップへ進む →/);
  const unfinished = renderToStaticMarkup(createElement(ActionPath, { blocks: buildActionBlocks({ rangeType: "response", opener: "BTN", hero: "BB", callers: [], foldedHero: false }), expanded: true, onEnterPostflop() {} }));
  assert.doesNotMatch(unfinished, /フロップへ進む/);
  const combined = renderToStaticMarkup(createElement(ActionPath, { blocks: [...blocks, ...buildFlopActionBlocks()], expanded: true, onFlopAction() {}, onEnterPostflop() {} }));
  assert.match(combined, /フロップへ進む[\s\S]*action-seat-flop-forced[\s\S]*action-seat-flop active/);
  const navigation = renderToStaticMarkup(createElement(Sidebar, { activeSection: "プリフロップ", onSectionChange() {} }));
  assert.doesNotMatch(navigation, /aria-label="ポストフロップ/);
});

test("three card selectors and unsupported spots stay truthful", () => {
  const picker = renderToStaticMarkup(createElement(FlopCardPicker, { cards: ["As", "", ""], onCardsChange() {} }));
  assert.equal((picker.match(/<select/g) ?? []).length, 3);
  assert.match(picker, /<option value="As" disabled=""/);
  const html = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["SB", "BB"], potBb: 2, pilotAvailable: false }, cards: ["", "", ""] }));
  assert.match(html, /SB · BBがフロップへ進みました/);
  assert.match(html, /この局面のポストフロップ方針は未収録/);
  assert.doesNotMatch(html, /AI推定レンジ/);
  const missing = renderToStaticMarkup(createElement(PostflopTrial, { context: { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true }, cards: ["As", "7d", "3c"] }));
  assert.match(missing, /このフロップの方針は未収録/);
});
