import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadFourBetDataset } from "../src/estimated/four-bet-responses.js";

let server, EstimatedRanges;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom" });
  ({ EstimatedRanges } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.jsx"));
});
after(async () => { await server?.close(); });

test("4bet view shows original 3bettor, saved sizes and 5bet all-in; old view keeps opener Hero", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet" }));
  assert.match(html, /BB（元の3bettor \/ Hero）の応答/);
  assert.match(html, /BB 3bet 12BB/);
  assert.match(html, /BTN 4bet 26.5BB/);
  assert.match(html, /5betオールイン（合計）/);
  assert.match(html, /100 BB/);
  assert.match(html, /対象外/);
  assert.match(html, /アンティなし/);
  assert.equal((html.match(/aria-pressed=/g) || []).length, 169);
  const old = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "three_bet" }));
  assert.match(old, /BTN（Hero）Open/);
  assert.match(old, /BTN · Heroの3bet後の応答/);
});

test("estimated view starts with a compact six-seat action path", () => {
  const html = renderToStaticMarkup(createElement(EstimatedRanges));
  assert.match(html, /aria-label="アクション履歴"/);
  assert.match(html, /aria-label="アクション選択を開く"/);
  assert.match(html, /BTN.*Raise 2\.5.*SB.*Fold.*BB.*Take action/s);
  assert.match(html, /次のアクションノード.*BBが3betした場合/);
  assert.match(html, /3bet後の応答.*BTN.*次に応答/s);
  assert.doesNotMatch(html, /label="オープナー"/);
});

test("missing and invalid saved JSON render errors without matrix or substitute frequencies", () => {
  for (const raw of [undefined, "{", "null"]) {
    const fourBet = loadFourBetDataset(raw);
    const html = renderToStaticMarkup(createElement(EstimatedRanges, { initialRangeType: "four_bet", fourBet }));
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /aria-label="169ハンド"/);
    assert.doesNotMatch(html, /class="bars"/);
    assert.match(html, /aria-label="局面"/); // Can recover by switching to a valid dataset.
  }
});
