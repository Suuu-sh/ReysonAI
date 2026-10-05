import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
let server, Card, dom, root;
const globals = new Map();
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:5173/app" });
  for (const name of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  window.localStorage.setItem("reysonai:locale:v1", "en");
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  ({ RangeContextCard: Card } = await server.ssrLoadModule("/src/estimated/RangeContextCard.tsx"));
  root = createRoot(document.getElementById("root"));
});
after(async () => {
  await act(async () => root?.unmount());
  await server?.close(); dom?.window.close();
  for (const [name, value] of globals) { if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; }
});
const board = (street, cards) => ({ key: street, street, cards });
let edited, resets = 0;
const props = { settingsOpen: false, boards: [board("flop", ["As", "Kd", "7c"])], onEditBoard: street => { edited = street; }, onReset: () => { resets++; } };
const render = async extra => act(async () => root.render(createElement(Card, { ...props, ...extra }, createElement("div", { className: "settings-body" }, "Cash 100bb"))));
const click = async selector => act(async () => document.querySelector(selector).click());
test("preflop keeps settings, entering flop defaults to board, switching back is immediate", async () => {
  await render({ postflop: false });
  assert.match(document.body.textContent, /Cash 100bb/);
  assert.equal(document.querySelector(".range-context-switch"), null);
  await render({ postflop: true });
  assert.equal(document.querySelectorAll(".postflop-card").length, 3);
  assert.equal(document.querySelector(".range-context-board-footer .display-mode-toggle"), null);
  assert.match(document.body.textContent, /A♠K♦7♣/);
  assert.doesNotMatch(document.body.textContent, /Cash/);
  await click('.range-context-switch button:nth-child(2)');
  assert.match(document.body.textContent, /Cash 100bb/);
  assert.equal(document.querySelector('.range-context-switch button:nth-child(2)').getAttribute("aria-pressed"), "true");
  await click('.range-context-switch button:first-child');
  await click('.range-context-street');
  assert.equal(edited, "flop");
  await click('[aria-label="Reset actions"]');
  assert.equal(resets, 1);
});
test("later board cards and pending slot follow street blocks and retain card editing", async () => {
  await render({ postflop: true, boards: [...props.boards, board("turn", ["Th"]), board("river", [""])] });
  assert.equal(document.querySelectorAll(".postflop-card").length, 5);
  assert.match(document.body.textContent, /A♠K♦7♣T♥\?/);
  await click('[aria-label="Change turn card"]'); assert.equal(edited, "turn");
  await click('[aria-label="Change river card"]'); assert.equal(edited, "river");
  await render({ postflop: true });
  assert.equal(document.querySelectorAll(".postflop-card").length, 3, "rewinding removes downstream cards");
  await click('.range-context-switch button:nth-child(2)');
  await render({ postflop: false }); await render({ postflop: true });
  assert.ok(document.querySelector(".range-context-board"), "re-entering starts on Board again");
});
test("board controls have localized labels in all four product languages", async () => {
  for (const [locale, label] of [["ja", "ボード"], ["zh-CN", "公共牌"], ["es", "Mesa"], ["en", "Board"]]) {
    window.localStorage.setItem("reysonai:locale:v1", locale);
    await render({ postflop: true });
    assert.equal(document.querySelector('.range-context-board').getAttribute("aria-label"), label);
  }
});
