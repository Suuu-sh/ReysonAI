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
