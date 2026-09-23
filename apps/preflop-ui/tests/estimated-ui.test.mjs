import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadFourBetDataset } from "../src/estimated/four-bet-responses.js";

let server, EstimatedRanges, ActionPath, Sidebar;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom" });
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

test("expanded path keeps opening controls separate from post-open actions and shows saved raise-to sizes", () => {
  const props = { expanded: true, opener: "BTN", hero: "SB", callers: [], foldedHero: false, onOpenerChange() {}, onHeroChange() {}, onCall() {}, onFold() {} };
  const response = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "response" }));
  assert.equal((response.match(/>Raise 2\.5<\/button>/g) || []).length, 4); // UTG, HJ, CO, BTN only
  assert.match(response, /SB[\s\S]*ここからオープン[\s\S]*Fold[\s\S]*Call[\s\S]*3bet —BB/);
  assert.doesNotMatch(response, /Take action/);
  assert.match(response, /aria-label="BBを行動位置に選択" aria-pressed="false"/);
  assert.doesNotMatch(response, /SB[\s\S]*>Raise 2\.5<\/button>/);
  const sizedResponse = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "response", spot: { hands: [{ three_bet_size_bb: 11 }] } }));
  assert.match(sizedResponse, /3bet 11BB/);

  const threeBet = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "three_bet", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(threeBet, /SB[\s\S]*3bet 11BB[\s\S]*BB[\s\S]*BTN[\s\S]*3betへの応答[\s\S]*>Call<\/button>[\s\S]*4bet 28\.6BB/);
  assert.equal((threeBet.match(/>Call<\/button>/g) || []).length, 1);

  const fourBet = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(fourBet, /SB[\s\S]*3bet 11BB[\s\S]*BB[\s\S]*BTN[\s\S]*4bet 28\.6BB[\s\S]*SB[\s\S]*4betへの応答[\s\S]*5bet 100BB/);
  assert.doesNotMatch(fourBet, /5bet All-in 100BB/);
  assert.doesNotMatch(fourBet, /SB[\s\S]*>Raise 2\.5<\/button>/);
  const allIn = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(allIn, /再応答<\/span>[\s\S]*推定レンジ準備中/);
  assert.doesNotMatch(allIn, /次のアクションノード/);
  const compactAllIn = renderToStaticMarkup(createElement(ActionPath, { ...props, expanded: false, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(compactAllIn, /5bet 100BB/);
  assert.doesNotMatch(compactAllIn, /Take action/);
  assert.doesNotMatch(compactAllIn, /5bet All-in 100BB/);
});
after(async () => { await server?.close(); });

test("4bet view shows original 3bettor, saved sizes and 5bet all-in; old view keeps opener Hero", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet" }));
  assert.match(html, /BB（元の3bettor \/ Hero）の応答/);
  assert.match(html, /BB 3bet 12BB/);
  assert.match(html, /BTN 4bet 26.5BB/);
  assert.doesNotMatch(html, /対象外/);
  assert.match(html, /unreachable-hand/);
  assert.match(html, /title="[^\"]*既存3bet頻度0%（推奨なし）"/);
  assert.doesNotMatch(html, /<small>対象外<\/small>/);
  assert.match(html, /アンティなし/);
  assert.equal((html.match(/aria-pressed=/g) || []).length, 338);
  assert.match(html, /aria-label="参加中のレンジ"/);
  assert.match(html, /BTNのレンジ/);
  assert.match(html, /BBのレンジ/);
  assert.doesNotMatch(html, /詳細を閉じる/);
  const old = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "three_bet" }));
  assert.match(old, /BTN（Hero）Open/);
  assert.match(old, /BTN · 3betへの応答/);
  assert.equal((old.match(/aria-pressed=/g) || []).length, 338);
});

test("unsupported branch notices occupy participant range slots instead of a separate banner", () => {
  const originalWindow = globalThis.window;
  const renderPath = ({ rangeType, opener, hero, callers = [], pendingRaise }) => {
    const selection = { rangeType, opener, hero, callers, foldedHero: false, pendingRaise, continuationAction: null, pathExpanded: true, selected: "AA" };
    globalThis.window = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem: () => JSON.stringify(selection), setItem() {} } };
    return renderToStaticMarkup(createElement(EstimatedRanges));
  };
  try {
    const allIn = renderPath({ rangeType: "four_bet", opener: "UTG", hero: "HJ", pendingRaise: "all_in" });
    assert.match(allIn, /aria-label="UTGのレンジ"/);
    assert.match(allIn, /UTG · 5betオールインへの応答/);
    assert.match(allIn, /レンジ未収録/);
    assert.match(allIn, /5betオールイン後の応答データはまだ保存されていません。/);
    assert.match(allIn, /HJ · 4betへの応答（5bet選択）/);
    assert.doesNotMatch(allIn, /5betオールイン後の応答レンジは未収録/);

    const squeeze = renderPath({ rangeType: "response", opener: "BTN", hero: "BB", callers: ["SB"], pendingRaise: "squeeze" });
    assert.match(squeeze, /BTN · スクイーズへの応答/);
    assert.match(squeeze, /SB · スクイーズへの応答/);
    assert.match(squeeze, /BB · 推定レンジ準備中/);
    assert.doesNotMatch(squeeze, /スクイーズ後の応答レンジは未収録/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("local generation controls are embedded in the missing range slot", () => {
  const originalWindow = globalThis.window;
  const renderPath = ({ rangeType, opener, hero, callers = [], pendingRaise }) => {
    const selection = { rangeType, opener, hero, callers, foldedHero: false, pendingRaise, continuationAction: null, pathExpanded: true, selected: "AA" };
    globalThis.window = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem: () => JSON.stringify(selection), setItem() {} } };
    return renderToStaticMarkup(createElement(EstimatedRanges));
  };
  try {
    const allIn = renderPath({ rangeType: "four_bet", opener: "UTG", hero: "HJ", pendingRaise: "all_in" });
    const openerPanel = allIn.match(/<section class="panel multiway-range-panel missing-range-panel" aria-label="UTGのレンジ">[\s\S]*?<\/section>/)?.[0];
    assert.ok(openerPanel, "5bet response has an opener range slot");
    assert.match(openerPanel, /CodexでAI推定レンジを生成|保存状態を確認中…/);
    assert.match(openerPanel, /5betオールイン後の応答データはまだ保存されていません。/);
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
  const selection = { rangeType: "four_bet", opener: "BTN", hero: "BB", callers: [], foldedHero: false, pendingRaise: "all_in", continuationAction: null, pathExpanded: true, selected: "AA" };
  globalThis.window = { matchMedia: () => ({ matches: false }), sessionStorage: { getItem: key => key.includes("solveagto") ? JSON.stringify(selection) : null, setItem() {} } };
  try {
    const html = renderToStaticMarkup(createElement(EstimatedRanges));
    assert.match(html, /BTN Open 2\.5BB → BB 3bet 12BB → BTN 4bet 26\.5BB → BB/);
    assert.match(html, /BTN · 5betオールインへの応答/);
    assert.match(html, /CodexでAI推定レンジを生成|保存状態を確認中…/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("estimated view starts with a compact six-seat action path", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges));
  assert.match(html, /button[^>]*class="path-reset"[^>]*>リセット<\/button>/);
  assert.match(html, /aria-label="アクション履歴"/);
  assert.match(html, /aria-label="アクション選択を開く"/);
  assert.match(html, /BTN.*Raise 2\.5.*SB.*Fold.*BB.*—/s);
  assert.doesNotMatch(html, /Take action/);
  assert.doesNotMatch(html, /次のアクションノード|aria-label="局面"|aria-label="有効スタック"|aria-label="オープンサイズ"/);
  assert.match(html, /100BB · Open 2\.5BB/);
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
