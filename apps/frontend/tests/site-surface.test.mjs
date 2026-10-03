import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, ServiceSite, copies;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ ServiceSite } = await server.ssrLoadModule("/src/site/ServiceSite.tsx"));
  const { en } = await server.ssrLoadModule("/src/site/content.ts");
  const { ja } = await server.ssrLoadModule("/src/site/content-ja.ts");
  copies = { en, ja };
});
after(async () => { await server?.close(); });
const render = locale => renderToStaticMarkup(createElement(ServiceSite, { locale, onLocaleChange() {} }));

test("the chart minimum width wins over the fieldset reset and preserves mobile scrolling", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /\.site \.site-matrix\s*\{[^}]*min-width: 316px/);
  assert.match(css, /\.site-matrix-scroll\s*\{[^}]*overflow-x: auto/);
});

test("sections use a wider shared canvas without empty full-screen minimums", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /--content-width: 1520px/);
  assert.match(css, /--page-gutter: clamp\(16px, 2\.5vw, 40px\)/);
  assert.match(css, /\.site-wrap\s*\{[^}]*width: min\(100% - var\(--page-gutter\) \* 2, var\(--content-width\)\)/);
  assert.match(css, /\.site-section\s*\{[^}]*padding: var\(--section-space\)/);
  assert.doesNotMatch(css, /\.site-section, \.site-final\s*\{[^}]*min-height:/);
  assert.doesNotMatch(css, /\.site-hero\s*\{[^}]*min-height:/);
  assert.match(css, /\.site-poker-table\s*\{[^}]*width: min\(100%, 760px\)/);
  assert.match(css, /@media \(min-width: 961px\) and \(max-height: 740px\)/);
  const tablet = css.split("@media (max-width: 960px)")[1].split("@media (max-width: 720px)")[0];
  assert.match(tablet, /--section-space: 48px/);
  assert.match(css, /\.site-train\.is-scrolly \.site-train-stage\s*\{[^}]*height: calc\(100vh - 64px\)/);
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
  assert.match(css, /\.site-rank-top\s*\{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.site-mock\s*\{[^}]*min-width: 0/);
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.match(source, /matchMedia\("\(min-width: 961px\) and \(min-height: 840px\)"\)/,
    "persona pinning needs enough height for every translated preview");
  assert.match(source, /matchMedia\("\(min-width: 961px\) and \(min-height: 600px\)"\)/,
    "Training/Ranked pinning remains wide-screen-only");
});

test("mobile comparison pairs columns with one visible sticky heading instead of repeated labels", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const mobile = css.split("@media (max-width: 720px)")[1].split("@media (max-width: 560px)")[0];
  assert.match(mobile, /\.site-compare tr\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.site-compare tbody th\s*\{[^}]*grid-column: 1 \/ -1/);
  assert.match(mobile, /\.site-compare thead\s*\{[^}]*position: sticky; top: 64px/);
  assert.doesNotMatch(mobile, /\.site-compare thead\s*\{[^}]*display: none/);
  assert.doesNotMatch(css, /content: attr\(data-label\)/);
});

for (const locale of ["en", "ja"]) {
  test(`${locale}: compact comparison retains every original claim and disclaimer`, () => {
    const comparison = render(locale).match(/<section class="site-section site-compare"[\s\S]*?<\/section>/)?.[0];
    assert.ok(comparison);
    assert.match(comparison, /<table>/);
    assert.equal((comparison.match(/scope="col"/g) ?? []).length, 2);
    assert.equal((comparison.match(/scope="row"/g) ?? []).length, 7);
    assert.doesNotMatch(comparison, /data-label=/);
    const { compare } = copies[locale];
    const text = [compare.description, compare.us, compare.them, compare.themNote, compare.note,
      ...compare.rows.flatMap(row => [row.label, row.us, row.them])];
    for (const value of text) {
      const escaped = renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
      assert.ok(comparison.includes(escaped), `retains: ${value}`);
    }
  });

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
