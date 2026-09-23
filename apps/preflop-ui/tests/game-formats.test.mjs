import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, formats, GameFormatDialog, AdvancedSettingsPage;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", logLevel: "silent" });
  formats = await server.ssrLoadModule("/src/estimated/game-formats.js");
  ({ GameFormatDialog, AdvancedSettingsPage } = await server.ssrLoadModule("/src/estimated/GameFormatDialog.jsx"));
});
after(async () => { await server?.close(); });

test("only formats with saved ranges are selectable", () => {
  assert.equal(formats.isBuilt(formats.defaultFormat), true);
  assert.equal(formats.isBuilt({ ...formats.defaultFormat, game: "mtt" }), false);
  assert.equal(formats.optionAvailable("table", "6max"), true);
  assert.equal(formats.optionAvailable("table", "9max"), false);
});

test("dialog locks formats without ranges", () => {
  const html = renderToStaticMarkup(createElement(GameFormatDialog, { format: formats.defaultFormat, onSave() {}, onClose() {} }));
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /aria-pressed="true"[^>]*>Cash</);
  assert.match(html, /disabled=""[^>]*title="レンジ表を準備中"><svg[\s\S]*?<\/svg>MTT<span class="sr-only">（準備中）<\/span>/);
  assert.match(html, /disabled=""[^>]*title="レンジ表を準備中"><svg[\s\S]*?<\/svg>9max/);
  assert.match(html, /より詳細な設定/);
  assert.doesNotMatch(html, /<legend>アンティ<\/legend>|アンティあり|アンティなし/);
  assert.doesNotMatch(html, /<button type="button" class="primary" disabled="">適用する/);
});

test("ante lives on its own detailed settings page and unsupported ante ranges stay locked", () => {
  const html = renderToStaticMarkup(createElement(AdvancedSettingsPage, { format: formats.defaultFormat, onChange() {} }));
  assert.match(html, /aria-label="より詳細な設定"/);
  assert.match(html, /<legend>アンティ<\/legend>/);
  assert.match(html, /aria-pressed="true"[^>]*>アンティなし/);
  assert.match(html, /disabled=""[^>]*title="レンジ表を準備中">[\s\S]*?アンティあり/);
  assert.match(html, /現在選べるレンジはアンティなしのみです/);
});
