import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadFourBetDataset } from "../src/estimated/four-bet-responses.js";

let server, EstimatedRanges, ActionPath;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom" });
  ({ EstimatedRanges, ActionPath } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.jsx"));
});

test("expanded path keeps opening controls separate from post-open actions and shows saved raise-to sizes", () => {
  const props = { expanded: true, opener: "BTN", hero: "SB", callers: [], foldedHero: false, onOpenerChange() {}, onHeroChange() {}, onCall() {}, onFold() {} };
  const response = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "response" }));
  assert.equal((response.match(/>Raise 2\.5<\/button>/g) || []).length, 4); // UTG, HJ, CO, BTN only
  assert.match(response, /SB[\s\S]*ここからオープン[\s\S]*Fold[\s\S]*Call[\s\S]*Take action/);
  assert.doesNotMatch(response, /SB[\s\S]*>Raise 2\.5<\/button>/);
  const sizedResponse = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "response", spot: { hands: [{ three_bet_size_bb: 11 }] } }));
  assert.match(sizedResponse, /3bet 11BB/);

  const threeBet = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "three_bet", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(threeBet, /SB[\s\S]*3bet 11BB[\s\S]*BB[\s\S]*BTN[\s\S]*3betへの応答[\s\S]*>Call<\/button>[\s\S]*4bet 28\.6BB/);
  assert.equal((threeBet.match(/>Call<\/button>/g) || []).length, 1);

  const fourBet = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(fourBet, /SB[\s\S]*3bet 11BB[\s\S]*BB[\s\S]*BTN[\s\S]*4bet 28\.6BB[\s\S]*SB[\s\S]*4betへの応答[\s\S]*5bet All-in 100BB/);
  assert.doesNotMatch(fourBet, /SB[\s\S]*>Raise 2\.5<\/button>/);
  const allIn = renderToStaticMarkup(createElement(ActionPath, { ...props, rangeType: "four_bet", pendingRaise: "all_in", spot: { three_bet_size_bb: 11, four_bet_size_bb: 28.6 } }));
  assert.match(allIn, /再応答<\/span>[\s\S]*推定レンジ準備中/);
  assert.doesNotMatch(allIn, /次のアクションノード/);
});
after(async () => { await server?.close(); });

test("4bet view shows original 3bettor, saved sizes and 5bet all-in; old view keeps opener Hero", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet" }));
  assert.match(html, /BB（元の3bettor \/ Hero）の応答/);
  assert.match(html, /BB 3bet 12BB/);
  assert.match(html, /BTN 4bet 26.5BB/);
  assert.match(html, /対象外/);
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

test("estimated view starts with a compact six-seat action path", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges));
  assert.match(html, /aria-label="アクション履歴"/);
  assert.match(html, /aria-label="アクション選択を開く"/);
  assert.match(html, /BTN.*Raise 2\.5.*SB.*Fold.*BB.*Take action/s);
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
