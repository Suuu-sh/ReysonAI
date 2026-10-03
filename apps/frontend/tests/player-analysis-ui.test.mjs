import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let PlayerAnalysis;

before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ PlayerAnalysis } = await server.ssrLoadModule("/src/trainer/PlayerAnalysis.tsx"));
});

after(async () => { await server?.close(); });

test("player analysis opens with the style map, without the redundant summary card", () => {
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], onStart() {} }));
  assert.match(html, /プレイスタイルマップ/);
  assert.match(html, /まずは練習から/);
  assert.doesNotMatch(html, /analysis-hero|現在の練習傾向|回答履歴|重複を除いた問題|分析した局面/);
});

test("player analysis includes graded strengths, weaknesses and a link to detailed review", () => {
  const history = [
    ...Array.from({ length: 5 }, () => ({ spotId: "UTG_open", hand: "AA", action: "open", result: "best", score: 1 })),
    ...Array.from({ length: 5 }, () => ({ spotId: "BB_vs_BTN", hand: "AA", action: "fold", result: "miss", score: 0 })),
  ];
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history, onStart() {}, onOpenWeakness() {} }));
  assert.match(html, /aria-label="練習結果の強みと弱点"/);
  assert.match(html, /aria-label="強み"[\s\S]*UTG オープン[\s\S]*100%/);
  assert.match(html, /aria-label="弱点"[\s\S]*BB vs BTN オープン[\s\S]*復習待ち 1ハンド/);
  assert.match(html, /弱点の詳細を見る/);
  assert.doesNotMatch(html, /analysis-hero/);
});

test("player analysis shows a distinct ReysonAI Score trend", () => {
  const history = [
    { spotId: "UTG_open", hand: "AA", action: "open", result: "best", score: 1 },
    { spotId: "UTG_open", hand: "AA", action: "fold", result: "miss", score: 0 },
  ];
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history, onStart() {} }));
  assert.match(html, /ReysonAI Score/);
  assert.match(html, /直近2回答の平均 · 暫定/);
  assert.match(html, /aria-label="ReysonAI Score の推移。2回答、直近2回答の平均は50%。"/);
  assert.match(html, /復習の再回答も含む/);
  assert.match(html, /保存済みレンジとの一致度/);
  assert.doesNotMatch(html, /GTO|AI推定|AI-estimated|AI estimate|未検証|not a solver/i);
  assert.match(html, /class="analysis-score-line"/);
});
