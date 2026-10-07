import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "esbuild";
import { LOCALE_KEY, productLocale, rememberLocale } from "../src/locale.ts";

async function loadCopy(file, exportName) {
  const source = readFileSync(new URL(`../src/site/${file}`, import.meta.url), "utf8");
  const { code } = await transform(source, { loader: "ts", format: "esm" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return module[exportName];
}

function shapeOf(value) {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shapeOf(item)]));
  return typeof value;
}

test("Japanese service-site copy covers every English field", async () => {
  const en = await loadCopy("content.ts", "en");
  const ja = await loadCopy("content-ja.ts", "ja");
  assert.deepEqual(shapeOf(ja), shapeOf(en));
  assert.equal(en.hero.title1, "Don't just play.");
  assert.equal(en.hero.title2, "Understand the reason.");
  assert.equal(ja.hero.title1, en.hero.title1);
  assert.equal(ja.hero.title2, en.hero.title2);
  assert.match(ja.preview.notGto, /GTO/);
  assert.equal(ja.pricing.plans[1].href, null);
});

test("Plus presents an approximate dollar price and daily value in English", async () => {
  const en = await loadCopy("content.ts", "en");
  assert.equal(en.pricing.plans[0].price, "$0");
  assert.equal(en.pricing.plans[1].price, "$3.70");
  assert.match(en.pricing.title2, /\$0\.12 a day/);
  assert.match(en.pricing.description, /Planned Free \/ Plus/);
  assert.match(en.pricing.note, /billing are not live/);
  assert.equal(en.pricing.plans[1].href, null);
});

test("Japanese Plus pricing shows the 30-day daily equivalent while billing remains unavailable", async () => {
  const ja = await loadCopy("content-ja.ts", "ja");
  assert.equal(ja.pricing.plans[1].price, "¥580");
  assert.match(ja.pricing.title2, /1日約19円/);
  assert.match(ja.pricing.description, /予定している機能分け/);
  assert.match(ja.pricing.note, /課金はまだ提供していません/);
  assert.equal(ja.pricing.plans[1].href, null);
});

test("the root site remembers its language without a separate route", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    assert.equal(productLocale(), "en");
    rememberLocale("ja");
    assert.equal(values.get(LOCALE_KEY), "ja");
    assert.equal(productLocale(), "ja");
    rememberLocale("en");
    assert.equal(productLocale(), "en");
  } finally {
    globalThis.window = previousWindow;
  }
});

for (const [locale, file, exportName] of [["zh-CN", "content-zh.ts", "zh"], ["es", "content-es.ts", "es"]]) {
  test(`${locale} site copy translates every section without changing strategy facts or routes`, async () => {
    const en = await loadCopy("content.ts", "en");
    const copy = await loadCopy(file, exportName);
    assert.deepEqual(shapeOf(copy), shapeOf(en));
    assert.equal(copy.hero.title1, en.hero.title1);
    assert.equal(copy.hero.title2, en.hero.title2);
    assert.equal(copy.footer.tagline, en.footer.tagline);
    assert.deepEqual(copy.nav.map(item => item.href), en.nav.map(item => item.href));
    assert.equal(copy.pricing.plans[0].href, en.pricing.plans[0].href);
    assert.equal(copy.pricing.plans[1].href, null);
    assert.equal(copy.compare.rows.length, 7);
    assert.equal(copy.faq.items.length, 6);
    assert.match(copy.preview.notGto, /GTO/);
    assert.notEqual(copy.description, en.description);
    assert.notEqual(copy.common.languageLabel, en.common.languageLabel);
    for (const section of ["how", "audience", "ranked", "agent", "analysis", "compare", "pricing", "final"]) {
      assert.notEqual(copy[section].title1, en[section].title1, section);
    }
    for (const fact of ["52.3%", "43.3%", "54.9%", "12BB"]) assert.ok(copy.how.whyNote.includes(fact), fact);
    assert.match(copy.faq.items[2].answer, /100BB/);
    assert.match(copy.faq.items[2].answer, /2\.5BB/);
    assert.match(copy.faq.items[2].answer, /3\.5BB/);
    for (const [action, label] of Object.entries(copy.preview.actionPast)) {
      const text = copy.preview.other(copy.preview.spotResponse, "A5s", label, 42.5);
      assert.ok(text.includes("A5s"));
      assert.ok(text.includes("42.5%"));
      assert.ok(text.includes(label), action);
      assert.notEqual(text, en.preview.other(en.preview.spotResponse, "A5s", label, 42.5));
    }
    assert.ok(copy.drill.frequency(37.5).includes("37.5%"));
    assert.ok(copy.drill.score(3, 20).includes("3"));
    assert.ok(copy.drill.score(3, 20).includes("20"));
    assert.ok(copy.drill.tableLabel("KTo").includes("KTo"));
    assert.ok(copy.ranked.hands);
    assert.ok(copy.ranked.rewards);
    assert.ok(copy.ranked.note);
    assert.ok(copy.ranked.legendRule(10).includes("10"));
    assert.ok(copy.ranked.toNext(64, copy.ranked.tiers[3]).includes("64"));
    if (locale === "zh-CN") {
      assert.equal(copy.pricing.plans[1].price, "¥580");
      assert.match(copy.pricing.plans[1].cadence, /日元/);
      assert.match(copy.faq.items[5].answer, /580日元/);
      assert.match(copy.faq.items[5].answer, /30天/);
      assert.match(copy.faq.items[5].answer, /19日元/);
    } else {
      assert.equal(copy.pricing.plans[1].price, "$3.70");
      assert.match(copy.faq.items[5].answer, /US\$0\.12/);
      assert.match(copy.faq.items[5].answer, /30 días/);
      assert.match(copy.faq.items[5].answer, /aproximada/);
    }
  });
}

test("the shared browser preference persists all four site locales and rejects unsupported values", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    for (const locale of ["en", "ja", "zh-CN", "es"]) {
      rememberLocale(locale);
      assert.equal(values.get(LOCALE_KEY), locale);
      assert.equal(productLocale(), locale);
    }
    rememberLocale("unsupported");
    assert.equal(productLocale(), "es");
  } finally {
    globalThis.window = previousWindow;
  }
});

test("all site locales render a selected native-language control and localized previews", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { fileURLToPath } = await import("node:url");
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
  try {
    const { ServiceSite } = await server.ssrLoadModule("/src/site/ServiceSite.tsx");
    const { SITE_COPY } = await server.ssrLoadModule("/src/site/locales.ts");
    const escaped = text => renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);
    for (const [locale, name] of [["en", "English"], ["ja", "日本語"], ["zh-CN", "简体中文"], ["es", "Español"]]) {
      const html = renderToStaticMarkup(createElement(ServiceSite, { locale, onLocaleChange() {} }));
      const copy = SITE_COPY[locale];
      assert.ok(html.includes(`aria-label="${copy.common.languageLabel}"`));
      assert.ok(html.includes(`<option value="${locale}" lang="${locale}" selected="">${name}</option>`));
      assert.equal((html.match(/<option /g) ?? []).length, 4);
      assert.ok(html.includes(escaped(copy.hero.lead)));
      assert.ok(html.includes(escaped(copy.how.whyNote)));
      assert.ok(html.includes(escaped(copy.preview.notGto)));
      assert.ok(html.includes(escaped(copy.pricing.note)));
      assert.ok(html.includes(escaped(copy.footer.disclaimer)));
      assert.ok(html.includes('id="site-hero-title" lang="en"'));
      assert.doesNotMatch(html, /href="\/(?:ja|es|zh-CN)(?:\/|")/);
    }
  } finally {
    await server.close();
  }
});

test("the marketing entry chooses metadata from the selected locale and preserves the route", () => {
  const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(source, /const copy = SITE_COPY\[initialSiteLocale\]/);
  assert.match(source, /const selectedCopy = legalDocument/);
  assert.match(source, /: SITE_COPY\[locale\]/);
  assert.match(source, /LEGAL_COPY\[locale\]\[legalDocument\]/);
  assert.match(source, /document\.documentElement\.lang = locale/);
  assert.match(source, /document\.title = selectedCopy\.title/);
  assert.match(source, /setAttribute\("content", selectedCopy\.description\)/);
  assert.match(source, /const switchLocale = \(next: SiteLocale\)/);
  assert.match(source, /rememberLocale\(next\)/);
  assert.match(source, /setLocale\(next\)/);
  assert.doesNotMatch(source, /history\.(?:pushState|replaceState)|location\.(?:assign|replace|href\s*=)/);
});


test("all locales keep the agreed planned Free and Plus split without live paid access", async () => {
  for (const [file, name, pre, post] of [["content.ts", "en", "Preflop", "Postflop"], ["content-ja.ts", "ja", "プリフロップ", "ポストフロップ"], ["content-es.ts", "es", "preflop", "postflop"], ["content-zh.ts", "zh", "翻前", "翻后"]]) {
    const copy = await loadCopy(file, name);
    const [free, plus] = copy.pricing.plans;
    assert.equal(free.features.length, 3);
    assert.equal(plus.features.length, 3);
    assert.ok(free.features.join(" ").includes(pre));
    assert.ok(plus.features.join(" ").includes(post));
    assert.ok(plus.features[0].includes("Free"));
    assert.deepEqual(copy.audience.freeList, free.features);
    assert.equal(plus.href, null);
    assert.ok(copy.faq.items[4].answer.includes("Plus"));
    assert.ok(copy.faq.items[5].answer.includes("Free"));
  }
});
