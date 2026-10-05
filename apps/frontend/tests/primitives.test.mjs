import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { color, label, pct } from "../src/components/action-format.ts";

let server, components;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  components = await server.ssrLoadModule("/src/components/primitives.tsx");
});
after(async () => { await server?.close(); });
const render = (name, props, children) => renderToStaticMarkup(createElement(components[name], props, children));

test("panel preserves section attributes and optional heading action", () => {
  assert.equal(render("Panel", { className: "details", "aria-label": "Details", id: "detail" }, "Body"), '<section class="panel details" aria-label="Details" id="detail">Body</section>');
  assert.equal(render("SectionHeading", { title: "Hand", action: createElement("button", {}, "Close") }), '<div class="panel-heading"><h2>Hand</h2><button>Close</button></div>');
});

test("action bars retain labels, fold contrast, percentages and animation variables", () => {
  assert.equal(render("ActionBars", { items: [] }), "");
  const html = render("ActionBars", { items: [{ action: "fold", frequency: .25 }, { action: "call", frequency: .75 }], labels: { call: "Call" } });
  assert.match(html, /class="bar-row" style="--i:0"/);
  assert.match(html, /background:#6e6e78/);
  assert.match(html, /width:25\.0%/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /Call<\/span>/);
  assert.match(html, /<b>75\.0%<\/b>/);
  assert.equal(components.barColor("raise_2.5"), color("raise_2.5"));
  assert.match(render("ActionBars", { items: [{ action: "call" }] }), /未計算/);
});

test("stat list, field and status keep semantic wrappers and optional content", () => {
  assert.equal(render("StatList", { items: [{ label: "Size", value: "2.5 BB" }] }), '<dl class="stat-list"><div class="stat-row"><dt>Size</dt><dd>2.5 BB</dd></div></dl>');
  assert.equal(render("Field", { label: "Name", hint: "Optional" }, createElement("input")), '<label class="field"><span class="field-label">Name</span><input/><small>Optional</small></label>');
  assert.equal(render("StatusState", {}), '<div class="state state-neutral" role="status"></div>');
  assert.equal(render("StatusState", { title: "Failed", tone: "error" }, "Try again"), '<div class="state state-error" role="alert"><h2>Failed</h2><div class="state-content">Try again</div></div>');
});

test("shared action formatting retains aliases and uncomputed fallbacks", () => {
  assert.equal(label("raise_four_bet"), "4bet（推定サイズ）");
  assert.equal(label("raise_ai"), "レイズ（推定サイズ）");
  assert.equal(label("allin"), label("all_in"));
  assert.equal(label("raise_2.5"), "レイズ 2.5 BB");
  assert.equal(label("bet75"), "bet75 BB");
  assert.equal(color("allin"), color("all_in"));
  for (const action of ["unknown", null, undefined]) assert.equal(color(action), color("raise"));
  assert.equal(pct(.25), "25.0%");
  for (const value of [null, undefined, NaN, Infinity, "0.25"]) assert.equal(pct(value), "未計算");
});
