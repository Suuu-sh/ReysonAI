import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, ServiceSite;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ ServiceSite } = await server.ssrLoadModule("/src/site/ServiceSite.tsx"));
});
after(async () => { await server?.close(); });
const render = locale => renderToStaticMarkup(createElement(ServiceSite, { locale, onLocaleChange() {} }));

test("the chart minimum width wins over the fieldset reset and preserves mobile scrolling", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /\.site \.site-matrix\s*\{[^}]*min-width: 316px/);
  assert.match(css, /\.site-matrix-scroll\s*\{[^}]*overflow-x: auto/);
});

test("the sharp geometry is shared by controls and panels without reshaping poker objects", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /--panel-radius: 4px/);
  assert.match(css, /--control-radius: 2px/);
  assert.match(css, /\.site-explorer\s*\{[^}]*border-radius: var\(--panel-radius\)/);
  assert.match(css, /\.site \.site-button\s*\{[^}]*border-radius: var\(--control-radius\)/);
  assert.match(css, /\.site-card\s*\{[^}]*border-radius: calc\(var\(--card-w\) \* \.15\)/);
  assert.match(css, /\.site-poker-disc\s*\{[^}]*border-radius: 50%/);
});

test("mobile scenes grow with their explanation and cards instead of clipping a fixed height", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const tablet = css.split("@media (max-width: 960px)")[1].split("@media (max-width: 720px)")[0];
  assert.match(tablet, /\.site-how-inline\s*\{[^}]*min-height: 340px;[^}]*padding: 28px 20px/);
  assert.doesNotMatch(tablet, /(?<!min-)height: 340px/);
  assert.match(tablet, /\.site-how-inline \.site-scene\s*\{[^}]*height: auto/);
  assert.match(tablet, /\.site-persona-view\s*\{[^}]*display: none/);
  assert.match(tablet, /\.site-persona-view\.is-active\s*\{[^}]*display: grid/);
  assert.match(tablet, /\.site-nav\s*\{[^}]*max-height: calc\(100dvh - 64px\);[^}]*overflow-y: auto/);
  assert.match(tablet, /\.site \.site-lang, \.site \.site-button\.is-small, \.site \.site-segment button\s*\{[^}]*min-height: 44px/);
  assert.match(css, /\.site-dash-kpis\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.site-dash-kpis[^}]*text-overflow: ellipsis/);
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/matchMedia\("\(min-width: 961px\) and \(min-height: 600px\)"\)/g) ?? []).length, 2,
    "both persona pinning and Training/Ranked pinning are wide-screen-only");
});

for (const locale of ["en", "ja"]) {
  test(`${locale}: Training links target the outer track, never the pinned slide`, () => {
    const html = render(locale);
    assert.equal((html.match(/id="drill"/g) ?? []).length, 1);
    assert.match(html, /class="site-train" id="drill"/);
    assert.doesNotMatch(html, /class="site-section site-drill" id="drill"/);
    assert.match(html, /href="#drill"/);
    assert.match(html, /class="site-section site-drill" aria-labelledby="site-drill-title"/);
  });

  test(`${locale}: visual polish preserves the saved chart and honest plan states`, () => {
    const html = render(locale);
    assert.equal((html.match(/class="site-cell /g) ?? []).length, 169);
    assert.match(html, /aria-label="K7s: [^"]*100%"/);
    assert.match(html, /class="site-hand" aria-live="polite"/);
    assert.match(html, /class="site-plan is-planned"/);
    assert.match(html, /class="site-button is-disabled" aria-disabled="true"/);
    assert.match(html, /href="\/app"/);
    assert.match(html, locale === "en" ? /Not a GTO solution/ : /GTOソリューションではありません/);
  });
}
