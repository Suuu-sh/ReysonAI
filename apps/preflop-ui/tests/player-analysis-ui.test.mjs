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
  ({ PlayerAnalysis } = await server.ssrLoadModule("/src/trainer/PlayerAnalysis.jsx"));
});

after(async () => { await server?.close(); });

test("player analysis opens with the style map, without the redundant summary card", () => {
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], onStart() {} }));
  assert.match(html, /プレイスタイルマップ/);
  assert.match(html, /まずは練習から/);
  assert.doesNotMatch(html, /analysis-hero|現在の練習傾向|回答履歴|重複を除いた問題|分析した局面/);
});
