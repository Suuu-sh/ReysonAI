import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { legalDocumentOf, isProductAppRoute } from "../src/route.ts";
import worker from "../worker/index.js";

let server, LegalPage, copy;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ LegalPage } = await server.ssrLoadModule("/src/site/LegalPage.tsx"));
  ({ LEGAL_COPY: copy } = await server.ssrLoadModule("/src/site/legal-content.ts"));
});
after(async () => { await server?.close(); });

test("legal paths resolve independently on the service and app hosts", () => {
  for (const document of ["terms", "privacy"]) {
    assert.equal(legalDocumentOf(`/${document}`), document);
    assert.equal(legalDocumentOf(`/${document}/`), document);
    for (const host of ["reysonai.com", "app.reysonai.com", "localhost"]) assert.equal(isProductAppRoute(`/${document}`, host), false);
  }
  for (const path of ["/ja/terms", "/terms-extra", "/privacy/other", "/"]) assert.equal(legalDocumentOf(path), null);
});

test("each legal document renders full localized text and links in four locales", () => {
  for (const locale of ["en", "ja", "zh-CN", "es"]) {
    for (const document of ["terms", "privacy"]) {
      const markup = renderToStaticMarkup(createElement(LegalPage, { document, locale, onLocaleChange() {} }));
      assert.ok(markup.includes(copy[locale][document].title));
      assert.equal((markup.match(/<h2>/g) ?? []).length, 7);
      assert.match(markup, /href="\/terms"/);
      assert.match(markup, /href="\/privacy"/);
      assert.match(markup, /aria-current="page"/);
      assert.match(markup, /mailto:yisshiki39@gmail.com/);
      assert.match(markup, /Suu/);
      assert.match(markup, /value="zh-CN"/);
      assert.match(markup, /value="es"/);
      assert.doesNotMatch(markup, /coming soon|準備中|即将推出|próximamente/);
    }
  }
  assert.match(JSON.stringify(copy.ja.terms), /GTO.*数学的/);
  assert.match(JSON.stringify(copy.ja.terms), /EV、実際の勝率/);
  assert.match(JSON.stringify(copy.en.privacy), /Signing out.*does not delete/);
});

test("direct legal-page HTTP requests receive the shared shell on both production hosts", async () => {
  for (const host of ["reysonai.com", "app.reysonai.com"]) for (const document of ["terms", "privacy"]) {
    const calls = [];
    const response = await worker.fetch(new Request(`https://${host}/${document}`, { headers: { accept: "text/html" } }), {
      ASSETS: { fetch: async request => { const path = new URL(request.url).pathname; calls.push(path); return new Response(path === "/index.html" ? "shell" : "missing", { status: path === "/index.html" ? 200 : 404 }); } },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [`/${document}`, "/index.html"]);
  }
});
