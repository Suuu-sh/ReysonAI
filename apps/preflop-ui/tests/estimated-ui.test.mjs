import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadFourBetDataset } from "../src/estimated/four-bet-responses.js";

let server, EstimatedRanges, ActionPath, Sidebar;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ EstimatedRanges, ActionPath } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.jsx"));
  ({ Sidebar } = await server.ssrLoadModule("/src/components/layout.jsx"));
});

test("primary navigation is accessible in a collapsible sidebar", () => {
  const html = renderToStaticMarkup(createElement(Sidebar, { activeSection: "プリフロップ", onSectionChange() {} }));
  assert.match(html, /<aside class="app-sidebar" aria-label="SolveaAI サイドバー">/);
  assert.match(html, /Solvea<span>AI<\/span>/);
  assert.match(html, /aria-label="サイドバーを折りたたむ" aria-expanded="true" aria-controls="main-navigation"/);
  assert.match(html, /<nav id="main-navigation" class="header-nav" aria-label="メインナビゲーション">/);
  assert.match(html, /aria-label="プリフロップ"/);
  assert.match(html, /aria-label="ポストフロップ（準備中）"/);
});

test("action blocks are generated in order from the chosen actions", () => {
  const props = { expanded: true, opener: "BTN", hero: "SB", callers: [], foldedHero: false, raiseSizeFor: position => ({ SB: 11, BB: 12 })[position] ?? null };
  const response = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "response" }));
  assert.match(response, /UTG[\s\S]*HJ[\s\S]*CO[\s\S]*BTN[\s\S]*class="chosen" aria-pressed="true"[^>]*>Raise 2\.5<[\s\S]*action-seat-seat active[\s\S]*SB<\/strong><span>99\.5[\s\S]*>Fold<[\s\S]*>Call 2\.5<[\s\S]*>Raise 11</);
  assert.doesNotMatch(response, /<strong>BB<\/strong>/); // later seats appear only after SB acts

  const bbToAct = renderToStaticMarkup(createElement(ActionPath, { ...props, hero: "BB", rangeType: "response" }));
  assert.match(bbToAct, /SB<\/strong>[\s\S]*aria-pressed="true"[^>]*>Fold<[\s\S]*BB<\/strong><span>99<[\s\S]*>Raise 12</);

  const threeBet = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "three_bet", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(threeBet, /SB<\/strong>[\s\S]*aria-pressed="true"[^>]*>Raise 11<[\s\S]*BB<\/strong>[\s\S]*action-seat-continuation active[\s\S]*BTN<\/strong><span>97\.5<[\s\S]*>Call 11<[\s\S]*>Raise 28\.5</);

  const allIn = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(allIn, /SB<\/strong><span>89<[\s\S]*aria-pressed="true"[^>]*>Allin 100<[\s\S]*action-seat-shove-response active[\s\S]*BTN<\/strong><span>71\.5<[\s\S]*>Fold<[\s\S]*>Call 71\.5</);
  assert.doesNotMatch(allIn, /推定レンジ準備中/); // the 5bet response range is saved, not pending
  const called = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", shoveResponse: "call", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(called, /action-seat-shove-response"[\s\S]*aria-pressed="true"[^>]*>Call 71\.5<[\s\S]*action-seat-end[\s\S]*終了[\s\S]*オールイン・ショウダウン[\s\S]*ポット 201bb/);
  const folded = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", shoveResponse: "fold", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(folded, /終了[\s\S]*SBの勝ち[\s\S]*ポット 58bb/); // 28.5 + 28.5 + BB 1; the uncalled 71.5 returns
  const compactAllIn = renderToStaticMarkup(createElement(ActionPath, { ...props, expanded: false, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.5 } }));
  assert.match(compactAllIn, /Allin 100/);
});
after(async () => { await server?.close(); });

test("4bet view shows original 3bettor, saved sizes and 5bet all-in; old view keeps opener Hero", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet" }));
  assert.match(html, /BB（元の3bettor \/ Hero）の応答/);
  assert.match(html, /BB 3bet 12BB/);
  assert.match(html, /BTN 4bet 26BB/);
  assert.doesNotMatch(html, /対象外/);
  assert.match(html, /unreachable-hand/);
  assert.match(html, /title="[^\"]*既存3bet頻度0%（推奨なし）"/);
  assert.doesNotMatch(html, /<small>対象外<\/small>/);
  assert.match(html, /アンティなし/);
  assert.equal((html.match(/<button aria-pressed=/g) || []).length, 338); // 2 tables × 169 hands
  assert.match(html, /aria-label="参加中のレンジ"/);
  assert.match(html, /BTNのレンジ/);
  assert.match(html, /BBのレンジ/);
  assert.doesNotMatch(html, /詳細を閉じる/);
  const old = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "three_bet" }));
  assert.match(old, /BTN（Hero）Open/);
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
    assert.match(sbCalled, /SB · オープンへの応答/);
    assert.doesNotMatch(sbCalled, /SB · 推定レンジ準備中/);
    assert.match(sbCalled, /BB · 推定レンジ準備中/);

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
    assert.match(html, /BTN Open 2\.5BB → BB 3bet 12BB → BTN 4bet 26BB → BB/);
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
  assert.match(html, /<strong>推定レンジ<\/strong><div class="settings-actions"><button[^>]*aria-label="ゲーム設定を編集"[^>]*><svg[\s\S]*?<\/svg><\/button><button[^>]*aria-label="アクションをリセット"[^>]*><svg[\s\S]*?<\/svg><\/button><\/div>/);
  assert.doesNotMatch(html, /aria-label="ゲーム設定を編集"[^>]*>編集<\/button>|aria-label="アクションをリセット"[^>]*>リセット<\/button>/);
  assert.match(html, /aria-label="アクション履歴"/);
  assert.doesNotMatch(html, /path-toggle|アクション選択を(開|閉じ)る/);
  assert.match(html, /action-path expanded/);
  assert.match(html, /BTN[\s\S]*aria-pressed="true"[^>]*>Raise 2\.5<[\s\S]*SB[\s\S]*aria-pressed="true"[^>]*>Fold<[\s\S]*action-seat-seat active[\s\S]*BB/);
  assert.doesNotMatch(html, /Take action/);
  assert.doesNotMatch(html, /次のアクションノード|aria-label="局面"|aria-label="有効スタック"|aria-label="オープンサイズ"/);
  assert.match(html, /action-seat-info[\s\S]*aria-label="ゲーム設定を編集"[\s\S]*aria-label="アクションをリセット"[\s\S]*Cash · 6max · 100bb[\s\S]*Open 2\.5BB · アンティなし[\s\S]*<strong>UTG<\/strong>/);
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
