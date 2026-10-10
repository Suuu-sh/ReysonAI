import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("legacy Original preferences cannot restore the removed renderer", async () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const dom = new JSDOM("", { url: "http://localhost/app" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    window.localStorage.setItem("reysonai:appearance:v1", JSON.stringify({ matrix: "original", cards: "two", motion: "reduce" }));
    document.documentElement.dataset.matrix = "original";
    const { loadAppearance, applyAppearance, saveAppearance } = await server.ssrLoadModule("/src/account/preferences.ts");
    assert.deepEqual(loadAppearance(), { cards: "two", motion: "reduce" });
    assert.equal(document.documentElement.dataset.matrix, undefined);
    // Account hydration also calls applyAppearance: even old incoming data is inert.
    document.documentElement.dataset.matrix = "original";
    applyAppearance({ cards: "four", motion: "standard", matrix: "original" });
    assert.equal(document.documentElement.dataset.matrix, undefined);
    saveAppearance(loadAppearance());
    assert.deepEqual(JSON.parse(window.localStorage.getItem("reysonai:appearance:v1")), { cards: "two", motion: "reduce" });
    const { StrategyMatrix } = await server.ssrLoadModule("/src/components/StrategyMatrix.tsx");
    const html = renderToStaticMarkup(createElement(StrategyMatrix, {
      node: { actingPosition: "BTN" }, aggregates: new Map([["AA", { actions: { raise: .6, call: .4 }, comboCount: 6 }]]),
      actions: ["call", "raise"], selected: null, onSelect() {},
    }));
    assert.match(html, /class="cell-fill"/);
    assert.match(html, /width:60(?:\.0)?%/);
    assert.match(html, /width:40(?:\.0)?%/);
    assert.doesNotMatch(html, /cell-mix|data-matrix/);
  } finally {
    await server.close();
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});
