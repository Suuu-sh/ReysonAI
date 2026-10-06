import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let server, PlayStyleDashboard, playerRead, STYLES;
const previousWindow = globalThis.window;
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ PlayStyleDashboard } = await server.ssrLoadModule("/src/agent/PlayStyleDashboard.tsx"));
  ({ playerRead, STYLES } = await server.ssrLoadModule("/src/agent/player-read.ts"));
});
after(async () => { globalThis.window = previousWindow; await server?.close(); });

for (const locale of ["en", "ja", "zh-CN", "es"]) {
  test(`style introductions stay under the selected card in ${locale}`, () => {
    globalThis.window = { localStorage: { getItem: () => locale } };
    const read = { ...playerRead([]), style: STYLES.lag, map: { x: .6, y: .3 } };
    const doc = new JSDOM(renderToStaticMarkup(createElement(PlayStyleDashboard, { read }))).window.document;
    const summary = doc.querySelector(".style-dash-summary");
    assert.equal(summary.children[0].className, "style-label");
    assert.equal(summary.querySelectorAll(".style-roster-compact li").length, 8);
    assert.equal(summary.querySelectorAll('li[aria-current="true"]').length, 1);
    assert.ok([...summary.querySelectorAll("li")].every(li => li.title && li.textContent.trim()));
    const map = summary.nextElementSibling;
    assert.equal(map.className, "play-style-map");
    assert.equal(map.tagName, "FIGURE");
    assert.ok(map.getAttribute("aria-label")?.trim());
    assert.equal(map.querySelector(".play-style-map-y").getAttribute("aria-hidden"), "true");
    assert.equal(map.querySelector(".play-style-map-x").tagName, "FIGCAPTION");
    const point = map.querySelector(".play-style-map-point");
    assert.ok(point);
    assert.equal(point.parentElement, map.querySelector(".play-style-map-grid"));
    assert.equal(point.getAttribute("role"), "img");
    assert.ok(point.getAttribute("aria-label")?.trim());
    assert.equal(point.style.left, "76.4%");
    assert.equal(point.style.top, "36.8%");
    assert.equal(doc.querySelectorAll(".style-row").length, 8);
  });
}

test("shared map frame stays shrinkable with a readable plot and the compact roster remains scoped", async () => {
  const css = await readFile(new URL("../src/agent/agent.css", import.meta.url), "utf8");
  assert.match(css, /\.play-style-map\s*\{[^}]*grid-template-columns: auto minmax\(0, 1fr\);[^}]*grid-template-rows: minmax\(0, 1fr\) auto;[^}]*min-width: 0;/);
  assert.match(css, /\.play-style-map-grid\s*\{[^}]*position: relative;[^}]*min-height: clamp\(210px, 26vw, 300px\);[^}]*aspect-ratio: 1\.7;[^}]*overflow: hidden;/);
  assert.match(css, /\.play-style-map-x\s*\{[^}]*grid-column: 2;/);
  assert.match(css, /\.style-roster-compact \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.style-roster-compact li \{ min-width: 0; overflow-wrap: anywhere;/);
});
