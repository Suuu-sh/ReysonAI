import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadFourBetDataset } from "../src/estimated/four-bet-responses.js";
import { limpActionTransition, responseActionTransition, rewindActionBlockTransition } from "../src/estimated/action-path.js";

let server, EstimatedRanges, ActionPath, Sidebar, StrategyMatrix, buildActionBlocks, prioritizeParticipantRanges;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ EstimatedRanges, ActionPath, buildActionBlocks, prioritizeParticipantRanges } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.jsx"));
  ({ Sidebar } = await server.ssrLoadModule("/src/components/layout.jsx"));
  ({ StrategyMatrix } = await server.ssrLoadModule("/src/components/StrategyMatrix.jsx"));
});

test("standard matrix keeps a dominant solid cell and puts only mixed frequencies in a bottom strip", () => {
  const aggregates = new Map([
    ["AA", { actions: { raise: 1, fold: 0 }, comboCount: 6 }],
    ["K6s", { actions: { raise: 0.75, fold: 0.25 }, comboCount: 4 }],
    ["K5s", { actions: { raise: 0.4, fold: 0.6 }, comboCount: 4, unreachable: true }],
  ]);
  const props = { node: { actingPosition: "BTN" }, aggregates, actions: ["raise", "fold"], onSelect() {} };
  const cell = (html, hand) => html.match(new RegExp(`<button[^>]*><strong>${hand}</strong>[\\s\\S]*?</button>`))?.[0] ?? "";
  const standard = renderToStaticMarkup(createElement(StrategyMatrix, props));
  const mixed = cell(standard, "K6s");
  assert.match(mixed, /background:#d9477f/);
  assert.match(mixed, /class="cell-mix"/);
  assert.match(mixed, /width:75\.0%;background:#d9477f/);
  assert.match(mixed, /width:25\.0%;background:#26262c/);
  assert.doesNotMatch(cell(standard, "AA"), /cell-mix/);
  assert.match(cell(standard, "K5s"), /unreachable-hand/);
  assert.doesNotMatch(cell(standard, "K5s"), /cell-mix/);

  const simple = renderToStaticMarkup(createElement(StrategyMatrix, { ...props, simplified: true }));
  assert.match(cell(simple, "K6s"), /background:#d9477f/);
  assert.doesNotMatch(cell(simple, "K6s"), /cell-mix/);
});

test("primary navigation is accessible in a collapsible sidebar", () => {
  const html = renderToStaticMarkup(createElement(Sidebar, { activeSection: "プリフロップ", onSectionChange() {} }));
  assert.match(html, /<aside class="app-sidebar" aria-label="SolveaAI サイドバー">/);
  assert.match(html, /Solvea<span>AI<\/span>/);
  assert.match(html, /aria-label="サイドバーを折りたたむ" aria-expanded="true" aria-controls="main-navigation"/);
  assert.match(html, /<nav id="main-navigation" class="header-nav" aria-label="メインナビゲーション">/);
  assert.match(html, /aria-label="プリフロップ"/);
  assert.doesNotMatch(html, /aria-label="ポストフロップ/);
});

test("action blocks are generated in order from the chosen actions", () => {
  const props = { expanded: true, opener: "BTN", hero: "SB", callers: [], foldedHero: false, raiseSizeFor: position => ({ SB: 11, BB: 12 })[position] ?? null };
  const response = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "response" }));
  assert.match(response, /UTG[\s\S]*HJ[\s\S]*CO[\s\S]*BTN[\s\S]*class="chosen" aria-pressed="true"[^>]*>Raise 2\.5<[\s\S]*action-seat-seat active[\s\S]*SB<\/button><span>99\.5[\s\S]*>Fold<[\s\S]*>Call 2\.5<[\s\S]*>Raise 11</);
  assert.match(response, /SB<\/button>[\s\S]*BB<\/button><span>99[\s\S]*>Call 2\.5<[\s\S]*>Raise 12</); // later seats remain directly selectable

  const bbToAct = renderToStaticMarkup(createElement(ActionPath, { ...props, hero: "BB", rangeType: "response" }));
  assert.match(bbToAct, /SB<\/button>[\s\S]*aria-pressed="true"[^>]*>Fold<[\s\S]*BB<\/button><span>99<[\s\S]*>Raise 12</);

  const utgOpen = renderToStaticMarkup(createElement(ActionPath, { ...props, opener: "UTG", hero: "HJ", rangeType: "response", raiseSizeFor: () => 8 }));
  assert.match(utgOpen, /UTG<\/button>[\s\S]*HJ<\/button>[\s\S]*CO<\/button>[\s\S]*BTN<\/button>[\s\S]*SB<\/button>[\s\S]*BB<\/button>[\s\S]*>Call 2\.5<[\s\S]*>Raise 8</);

  const directBbCall = responseActionTransition({ opener: "UTG", callers: [], position: "BB", action: "call" });
  const afterBbCall = renderToStaticMarkup(createElement(ActionPath, { ...props, ...directBbCall, opener: "UTG" }));
  assert.match(afterBbCall, /UTG<\/button>[\s\S]*HJ<\/button>[\s\S]*class="chosen" aria-pressed="true"[^>]*>Fold<[\s\S]*CO<\/button>[\s\S]*class="chosen" aria-pressed="true"[^>]*>Fold<[\s\S]*BTN<\/button>[\s\S]*class="chosen" aria-pressed="true"[^>]*>Fold<[\s\S]*SB<\/button>[\s\S]*class="chosen" aria-pressed="true"[^>]*>Fold<[\s\S]*BB<\/button>[\s\S]*class="chosen" aria-pressed="true"[^>]*>Call 2\.5</);

  const threeBet = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "three_bet", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(threeBet, /SB<\/button>[\s\S]*aria-pressed="true"[^>]*>Raise 11<[\s\S]*BB<\/button>[\s\S]*action-seat-continuation active[\s\S]*BTN<\/button><span>97\.5<[\s\S]*>Call 11<[\s\S]*>Raise 28\.5</);

  const allIn = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(allIn, /SB<\/button><span>89<[\s\S]*aria-pressed="true"[^>]*>Allin 100<[\s\S]*action-seat-shove-response active[\s\S]*BTN<\/button><span>71\.5<[\s\S]*>Fold<[\s\S]*>Call 71\.5</);
  assert.doesNotMatch(allIn, /推定レンジ準備中/); // the 5bet response range is saved, not pending
  const called = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", shoveResponse: "call", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(called, /action-seat-shove-response"[\s\S]*aria-pressed="true"[^>]*>Call 71\.5<[\s\S]*action-seat-end[\s\S]*終了[\s\S]*オールイン・ショウダウン[\s\S]*ポット 201bb/);
  const folded = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", shoveResponse: "fold", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(folded, /終了[\s\S]*SBの勝ち[\s\S]*ポット 58bb/); // 28.5 + 28.5 + BB 1; the uncalled 71.5 returns
  const compactAllIn = renderToStaticMarkup(createElement(ActionPath, { ...props, expanded: false, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(compactAllIn, /Allin 100/);
});

test("SB can limp and BB can check or iso-raise from the saved limp response", () => {
  const open = buildActionBlocks({ rangeType: "open", opener: "SB", hero: "BB" });
  const sbOpen = open.find(block => block.position === "SB");
  assert.deepEqual(sbOpen.options.map(({ action, label }) => [action, label]), [
    ["fold", "Fold"], ["call", "Call 1"], ["raise", "Raise 3.5"],
  ]);

  const startLimp = limpActionTransition({ rangeType: "open", opener: "SB", hero: "BB", position: "SB", action: "call" });
  assert.deepEqual(startLimp, { rangeType: "limp", opener: "SB", hero: "BB", limpAction: null, limpResponseAction: null });
  const bbDecision = buildActionBlocks(startLimp).find(block => block.position === "BB");
  assert.equal(bbDecision.active, true);
  assert.deepEqual(bbDecision.options.map(({ action, label }) => [action, label]), [["check", "Check"], ["raise", "Raise 3.5"]]);

  const checked = limpActionTransition({ ...startLimp, position: "BB", action: "check" });
  const checkPath = buildActionBlocks(checked);
  assert.equal(checkPath.find(block => block.position === "BB").chosen, "check");
  assert.deepEqual(checkPath.at(-1), { key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [], result: "2人でフロップへ", pot: "ポット 2bb" });

  const iso = limpActionTransition({ ...startLimp, position: "BB", action: "raise" });
  const isoPath = buildActionBlocks(iso);
  assert.deepEqual(isoPath.find(block => block.position === "SB" && block.stage === "limp-sb-response").options.map(({ action, label }) => [action, label]), [
    ["fold", "Fold"], ["call", "Call 3.5"], ["raise", "Raise 10.5"],
  ]);
  const called = limpActionTransition({ ...iso, position: "SB", action: "call" });
  assert.equal(buildActionBlocks(called).at(-1).pot, "ポット 7bb");
  const reraised = limpActionTransition({ ...iso, position: "SB", action: "raise" });
  const reraiseBlock = buildActionBlocks(reraised).at(-1);
  assert.equal(reraiseBlock.stage, "limp-bb-reraise"); // BB's saved response to the 10.5BB limp-reraise
  assert.deepEqual(reraiseBlock.rangeRef, { kind: "limp_reraise", position: "BB" });
  assert.deepEqual(reraiseBlock.options.map(option => option.label), ["Fold", "Call 10.5", "Raise 26"]);
  const bbCalled = limpActionTransition({ ...reraised, position: "BB", action: "call" });
  assert.equal(bbCalled.limpReraiseAction, "call");
  assert.deepEqual([buildActionBlocks(bbCalled).at(-1).result, buildActionBlocks(bbCalled).at(-1).pot], ["2人でフロップへ", "ポット 21bb"]);
  assert.equal(buildActionBlocks(limpActionTransition({ ...reraised, position: "BB", action: "raise" })).at(-1).result, "データなし");
  const backToBb = rewindActionBlockTransition({ ...bbCalled, block: reraiseBlock });
  assert.deepEqual([backToBb.limpResponseAction, backToBb.limpReraiseAction], ["raise", null]);

  const rewound = rewindActionBlockTransition({ ...iso, block: { stage: "limp-bb" } });
  assert.deepEqual([rewound.rangeType, rewound.limpAction, rewound.limpResponseAction], ["limp", null, null]);
});

test("SB limp action path loads both persisted participant ranges", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "limp" }));
  assert.match(html, /SB · オープンレンジ（リンプ選択）/);
  assert.match(html, /BB · SBリンプへの応答/);
  assert.match(html, />Check</);
  assert.match(html, />Raise 3\.5</);
});

test("action block selection points to saved ranges and keeps unsupported continuations pending", () => {
  const response = buildActionBlocks({ rangeType: "response", opener: "UTG", hero: "BB", callers: [], foldedHero: false });
  assert.equal(response.find(block => block.position === "BB").rangeRef.kind, "response");
  assert.equal(response.find(block => block.position === "SB").rangeRef.kind, "response");

  const multiway = buildActionBlocks({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"], foldedHero: false });
  assert.equal(multiway.find(block => block.position === "SB").rangeRef.kind, "response");
  assert.equal(multiway.find(block => block.position === "BB").rangeRef.kind, "pending");
  assert.match(multiway.find(block => block.position === "BB").options.at(-1).label, /^Raise \d/); // squeeze size is fixed, so it is always shown

  const savedMultiway = buildActionBlocks({ rangeType: "response", opener: "UTG", hero: "BB", callers: ["HJ"], foldedHero: false });
  assert.deepEqual(savedMultiway.find(block => block.position === "SB").rangeRef, { kind: "multiway", position: "SB", caller: "HJ" });
  assert.deepEqual(savedMultiway.find(block => block.position === "BB").rangeRef, { kind: "multiway", position: "BB", caller: "HJ" });
  const twoCallers = buildActionBlocks({ rangeType: "response", opener: "UTG", hero: "BB", callers: ["HJ", "CO"], foldedHero: false });
  assert.equal(twoCallers.find(block => block.position === "BB").rangeRef.kind, "pending"); // only one caller is saved

  const squeezed = { rangeType: "response", opener: "UTG", hero: "SB", callers: ["HJ"], foldedHero: false, pendingRaise: "squeeze" };
  const squeezePath = buildActionBlocks(squeezed);
  assert.deepEqual(squeezePath.find(block => block.position === "SB").rangeRef, { kind: "multiway", position: "SB", caller: "HJ" });
  assert.equal(squeezePath.find(block => block.position === "BB").kind, "forced");
  const openerBlock = squeezePath.at(-1);
  assert.deepEqual([openerBlock.kind, openerBlock.role, openerBlock.position, openerBlock.active], ["squeeze-response", "opener", "UTG", true]);
  assert.deepEqual(openerBlock.options.map(option => option.label), ["Fold", "Call 13", "Raise 26"]);
  assert.deepEqual(openerBlock.rangeRef, { kind: "squeeze", position: "UTG", caller: "HJ", squeezer: "SB", priorAction: null });
  const afterFold = buildActionBlocks({ ...squeezed, squeezeResponse: ["fold"] }).at(-1);
  assert.deepEqual([afterFold.position, afterFold.role, afterFold.rangeRef.priorAction], ["HJ", "caller", "fold"]);
  const threeWay = buildActionBlocks({ ...squeezed, squeezeResponse: ["call", "call"] }).at(-1);
  assert.deepEqual([threeWay.result, threeWay.pot], ["3人でフロップへ", "ポット 40bb"]);
  assert.equal(buildActionBlocks({ ...squeezed, squeezeResponse: ["fold", "fold"] }).at(-1).result, "SBの勝ち");
  assert.equal(buildActionBlocks({ ...squeezed, squeezeResponse: ["raise"] }).at(-1).result, "データなし");
  const backToCaller = rewindActionBlockTransition({ ...squeezed, squeezeResponse: ["call", "fold"], block: { kind: "squeeze-response", role: "caller", position: "HJ" } });
  assert.deepEqual([backToCaller.pendingRaise, backToCaller.squeezeResponse], ["squeeze", ["call"]]);
  const unsupportedSqueeze = buildActionBlocks({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"], foldedHero: false, pendingRaise: "squeeze" });
  assert.ok(unsupportedSqueeze.some(block => block.kind === "pending")); // SB as caller is not in the saved pairs

  const threeBet = buildActionBlocks({ rangeType: "three_bet", opener: "UTG", hero: "HJ", spot: { three_bet_size_bb: 8, four_bet_size_bb: 22 } });
  assert.deepEqual(threeBet.find(block => block.key === "continuation-UTG").rangeRef, { kind: "three_bet", position: "UTG", opponent: "HJ" });
  assert.deepEqual(threeBet.find(block => block.position === "BB").rangeRef, { kind: "cold", position: "BB", threeBettor: "HJ" });
  const coldSeat = threeBet.find(block => block.position === "CO");
  assert.equal(coldSeat.kind, "cold"); // seats behind the 3-bettor keep fold / cold call / cold 4bet
  assert.deepEqual(coldSeat.options.map(option => option.label), ["Fold", "Call 8", "Raise 26"]); // cold 4bet: fourBetToSize(CO, HJ)
  const coldCall = buildActionBlocks({ rangeType: "three_bet", opener: "UTG", hero: "HJ", spot: { three_bet_size_bb: 8, four_bet_size_bb: 22 }, coldAction: { position: "BTN", action: "call" } });
  assert.deepEqual(coldCall.map(block => block.key), ["UTG", "HJ", "CO", "BTN", "end"]);
  assert.equal(coldCall.find(block => block.position === "CO").chosen, "fold");
  assert.equal(coldCall.at(-1).result, "データなし");

  const fourBet = buildActionBlocks({ rangeType: "four_bet", opener: "UTG", hero: "HJ", spot: { three_bet_size_bb: 8, four_bet_size_bb: 22 } });
  assert.deepEqual(fourBet.find(block => block.key === "continuation-HJ").rangeRef, { kind: "four_bet", position: "HJ", opponent: "UTG" });
  const fiveBet = buildActionBlocks({ rangeType: "four_bet", opener: "UTG", hero: "HJ", spot: { three_bet_size_bb: 8, four_bet_size_bb: 22 }, pendingRaise: "all_in" });
  assert.deepEqual(fiveBet.find(block => block.kind === "shove-response").rangeRef, { kind: "five_bet", position: "UTG", opponent: "HJ" });

  const multiwayRanges = ["UTG", "HJ", "CO", "SB", "BB"].map(position => ({ position }));
  const prioritized = prioritizeParticipantRanges(multiwayRanges, [{ position: "SB" }, { position: "BB" }]);
  assert.deepEqual(prioritized.map(entry => entry.position), ["SB", "BB", "UTG", "HJ", "CO"]); // selection prioritizes the current pair without hiding active ranges

  const historicalPair = [{ position: "SB", kind: "response", historical: true }, { position: "BB", kind: "response" }];
  const activeRanges = [{ position: "BTN", kind: "opening" }, { position: "BB", kind: "response" }];
  assert.deepEqual(prioritizeParticipantRanges(activeRanges, historicalPair).map(entry => entry.position), ["SB", "BB", "BTN"]);

  const html = renderToStaticMarkup(createElement(ActionPath, { expanded: true, opener: "UTG", hero: "BB", rangeType: "response", selectedRangeBlock: "BB" }));
  assert.match(html, /action-seat-seat[^\"]*range-selected/);
  assert.match(html, /aria-pressed="true" aria-label="BBのアクションに戻り、レンジ表を表示" title="このアクションに戻り、関連するレンジ表を表示"/);

  const chosenAction = renderToStaticMarkup(createElement(ActionPath, { expanded: true, opener: "UTG", hero: "BB", rangeType: "response", onRewindActionBlock() {} }));
  assert.match(chosenAction, /class="action-seat action-seat-seat active action-seat-clickable"[^>]*title="ブロック全体をクリックしてこのアクションに戻る"/);
  assert.match(chosenAction, /class="chosen" aria-pressed="true" title="クリックしてこのアクション前に戻る">Fold</);
});

test("clicking an action block rewinds choices from that decision and retains earlier callers", () => {
  const beforeCaller = rewindActionBlockTransition({
    rangeType: "response", opener: "UTG", hero: "BB", callers: ["HJ", "CO", "SB"],
    block: { kind: "seat", position: "BTN" },
  });
  assert.deepEqual(beforeCaller, {
    rangeType: "response", opener: "UTG", hero: "BTN", callers: ["HJ", "CO"],
    foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null,
  });

  const opener = rewindActionBlockTransition({
    rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"],
    block: { kind: "seat", position: "UTG" },
  });
  assert.deepEqual(opener, {
    rangeType: "open", opener: "UTG", hero: "HJ", callers: [],
    foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null,
  });

  const beforeFourBet = rewindActionBlockTransition({
    rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [],
    block: { kind: "continuation", position: "BTN" },
  });
  assert.equal(beforeFourBet.rangeType, "three_bet");
  assert.equal(beforeFourBet.pendingRaise, null);

  const beforeFiveBet = rewindActionBlockTransition({
    rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [],
    block: { kind: "continuation", position: "BB" },
  });
  assert.equal(beforeFiveBet.rangeType, "four_bet");
  assert.equal(beforeFiveBet.pendingRaise, null);

  const fiveBetResponse = rewindActionBlockTransition({
    rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [],
    block: { kind: "shove-response", position: "BTN" },
  });
  assert.equal(fiveBetResponse.pendingRaise, "all_in");
  assert.equal(fiveBetResponse.shoveResponse, null);
});
after(async () => { await server?.close(); });

test("4bet view shows original 3bettor, saved sizes and 5bet all-in; old view keeps opener Hero", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet" }));
  assert.match(html, /BB · 4betへの応答/);
  assert.match(html, /BTN · 3betへの応答/);
  assert.match(html, /Raise 12/);
  assert.match(html, /Raise 26/);
  assert.doesNotMatch(html, /対象外/);
  assert.match(html, /unreachable-hand/);
  assert.match(html, /title="[^\"]*既存3bet頻度0%（推奨なし）"/);
  assert.doesNotMatch(html, /<small>対象外<\/small>/);
  assert.doesNotMatch(html, /アンティ/);
  assert.equal((html.match(/<button aria-pressed=/g) || []).length, 338); // 2 tables × 169 hands
  assert.match(html, /aria-label="参加中のレンジ"/);
  assert.match(html, /BTNのレンジ/);
  assert.match(html, /BBのレンジ/);
  assert.doesNotMatch(html, /詳細を閉じる/);
  const old = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "three_bet" }));
  assert.match(old, /BTN · 3betへの応答/);
  assert.equal((old.match(/<button aria-pressed=/g) || []).length, 338); // 2 tables × 169 hands
});

test("the first caller keeps its regular response range while later multiway responses stay pending", () => {
  const originalWindow = globalThis.window;
  const renderPath = ({ rangeType, opener, hero, callers = [], foldedHero = false, pendingRaise }) => {
    const selection = { rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction: null, selected: "AA" };
    globalThis.window = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem: () => JSON.stringify(selection), setItem() {} } };
    return renderToStaticMarkup(createElement(EstimatedRanges));
  };
  try {
    const allIn = renderPath({ rangeType: "four_bet", opener: "UTG", hero: "HJ", pendingRaise: "all_in" });
    assert.match(allIn, /aria-label="UTGのレンジ"/);
    assert.match(allIn, /UTG · 5betオールインへの応答/);
    // The persisted 5bet dataset is lazy-loaded, so the first render shows its loading slot.
    assert.match(allIn, /UTG · 5betオールインへの応答[\s\S]*保存済みレンジを読み込んでいます。/);
    assert.match(allIn, /HJ · 4betへの応答（5bet選択）/);
    assert.doesNotMatch(allIn, /5betオールイン後の応答レンジは未収録/);

    const squeeze = renderPath({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"], pendingRaise: "squeeze" });
    assert.match(squeeze, /BTN · スクイーズへの応答/);
    assert.match(squeeze, /SB · スクイーズへの応答/);
    assert.match(squeeze, /BB · 推定レンジ準備中/);
    assert.doesNotMatch(squeeze, /スクイーズ後の応答レンジは未収録/);

    const sbCalled = renderPath({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"] });
    assert.match(sbCalled, /aria-label="BTNのレンジ"/);
    assert.match(sbCalled, /SB · オープンへの応答/);
    assert.match(sbCalled, /aria-label="SBのレンジ"/);
    assert.doesNotMatch(sbCalled, /SB · 推定レンジ準備中/);
    assert.match(sbCalled, /BB · 推定レンジ準備中/);
    assert.match(sbCalled, /aria-label="BBのレンジ"/);
    assert.equal((sbCalled.match(/<button aria-pressed=/g) || []).length, 338); // opener + first caller stay visible beside the pending response

    const actionComplete = renderPath({ rangeType: "response", opener: "UTG", hero: "BB", callers: ["SB", "BB"], foldedHero: true });
    assert.match(actionComplete, /SB · オープンへの応答/);
    assert.doesNotMatch(actionComplete, /SB · 推定レンジ準備中/);
    assert.match(actionComplete, /BB · 推定レンジ準備中/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("local generation controls are embedded in the missing range slot", () => {
  const originalWindow = globalThis.window;
  const renderPath = ({ rangeType, opener, hero, callers = [], pendingRaise }) => {
    const selection = { rangeType, opener, hero, callers, foldedHero: false, pendingRaise, continuationAction: null, selected: "AA" };
    globalThis.window = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem: () => JSON.stringify(selection), setItem() {} } };
    return renderToStaticMarkup(createElement(EstimatedRanges));
  };
  try {
    const allIn = renderPath({ rangeType: "four_bet", opener: "UTG", hero: "HJ", pendingRaise: "all_in" });
    const openerPanel = allIn.match(/<section class="panel multiway-range-panel missing-range-panel" aria-label="UTGのレンジ">[\s\S]*?<\/section>/)?.[0];
    assert.ok(openerPanel, "5bet response has an opener range slot");
    assert.match(openerPanel, /保存済みレンジを読み込んでいます。/);
    assert.doesNotMatch(openerPanel, /CodexでAI推定レンジを生成/); // persisted data replaces local generation
    assert.doesNotMatch(allIn, /class="local-estimate-control"/);
    assert.doesNotMatch(allIn, /5betオールイン後の応答レンジは未収録/);

    const multiway = renderPath({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"] });
    const heroPanel = multiway.match(/<section class="panel multiway-range-panel missing-range-panel" aria-label="BBのレンジ">[\s\S]*?<\/section>/)?.[0];
    assert.ok(heroPanel, "multiway Hero has a pending range slot");
    assert.match(heroPanel, /CodexでAI推定レンジを生成|保存状態を確認中…/);
    assert.doesNotMatch(multiway, /class="local-estimate-control"/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("saved action paths survive the SolveaAI storage-key migration", () => {
  const originalWindow = globalThis.window;
  const selection = { rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [], foldedHero: false, pendingRaise: "all_in", continuationAction: null, selected: "AA" };
  globalThis.window = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem: key => key.includes("solveagto") ? JSON.stringify(selection) : null, setItem() {} } };
  try {
    const html = renderToStaticMarkup(createElement(EstimatedRanges));
    assert.match(html, /class="action-path expanded"/);
    assert.match(html, /Raise 2\.5[\s\S]*Raise 12[\s\S]*Raise 26[\s\S]*Allin 100/);
    assert.match(html, /BTN · 5betオールインへの応答/);
    assert.match(html, /保存済みレンジを読み込んでいます。/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("estimated view always shows the expanded six-seat action path", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges));
  assert.doesNotMatch(html, /<footer class="app-footer">|SolveaAI v0\.1/);
  assert.doesNotMatch(html, /class="estimate-context"|全15局面|全5ポジション/);
  assert.match(html, /class="results estimate-results participant-results/);
  assert.match(html, /<strong>推定レンジ<\/strong><div class="settings-actions"><button[^>]*aria-label="ゲーム設定を編集"[^>]*><svg[\s\S]*?<\/svg><\/button><button[^>]*aria-label="アクションをリセット"[^>]*><svg[\s\S]*?<\/svg><\/button><\/div>/);
  assert.doesNotMatch(html, /aria-label="ゲーム設定を編集"[^>]*>編集<\/button>|aria-label="アクションをリセット"[^>]*>リセット<\/button>/);
  assert.match(html, /aria-label="アクション履歴"/);
  assert.doesNotMatch(html, /path-toggle|アクション選択を(開|閉じ)る/);
  assert.match(html, /action-path expanded/);
  assert.match(html, /BTN[\s\S]*aria-pressed="true"[^>]*>Raise 2\.5<[\s\S]*SB[\s\S]*aria-pressed="true"[^>]*>Fold<[\s\S]*action-seat-seat active[\s\S]*BB/);
  assert.doesNotMatch(html, /Take action/);
  assert.doesNotMatch(html, /次のアクションノード|aria-label="局面"|aria-label="有効スタック"|aria-label="オープンサイズ"/);
  assert.match(html, /action-seat-info[\s\S]*aria-label="ゲーム設定を編集"[\s\S]*aria-label="アクションをリセット"[\s\S]*Cash · 6max · 100bb[\s\S]*Open 2\.5BB[\s\S]*aria-label="UTGのアクションに戻り、レンジ表を表示"/);
  assert.doesNotMatch(html, /Open 2\.5BB · アンティなし/);
  assert.doesNotMatch(html, /表示アクション|すべてのアクション/);
  assert.match(html, /レイズ 2\.5 BB.*フォールド/s);
  assert.doesNotMatch(html, /label="オープナー"/);
});

test("missing and invalid saved JSON render errors without matrix or substitute frequencies", () => {
  for (const raw of [undefined, "{", "null"]) {
    const fourBet = loadFourBetDataset(raw);
    const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet", fourBet }));
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /aria-label="169ハンド"/);
    assert.doesNotMatch(html, /class="bars"/);
    assert.match(html, /aria-label="アクション履歴"/); // Can recover by choosing another path.
  }
});
