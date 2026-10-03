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
const escapeText = value => renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
const preview = JSON.parse(readFileSync(new URL("../src/site/range-preview.json", import.meta.url), "utf8"));

function renderWithDisplayPreference(locale, displayMode) {
  const previousWindow = globalThis.window;
  const reads = [];
  globalThis.window = {
    localStorage: {
      getItem(key) {
        reads.push(key);
        return key === "reysonai:site-preview-display-mode:v1" ? displayMode : null;
      },
    },
  };
  try {
    return { html: render(locale), reads };
  } finally {
    globalThis.window = previousWindow;
  }
}

function renderWithMotionPreference(locale, reducedMotion) {
  const previousWindow = globalThis.window;
  const previousObserver = globalThis.IntersectionObserver;
  globalThis.window = {
    matchMedia: () => ({ matches: reducedMotion }),
    localStorage: { getItem: () => null },
  };
  globalThis.IntersectionObserver = class {};
  try {
    return render(locale);
  } finally {
    globalThis.window = previousWindow;
    globalThis.IntersectionObserver = previousObserver;
  }
}

test("the hand tour pauses offscreen, yields to interaction, and keeps playback intentional", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const explorer = source.split("function Explorer() {")[1].split("function Header()")[0];
  assert.match(explorer, /const isTouring = touring && motion/);
  assert.match(explorer, /if \(!isTouring \|\| !visible\) return/);
  assert.match(explorer, /window\.clearInterval\(timer\)/);
  for (const event of ["pointerdown", "keydown"]) {
    assert.ok(explorer.includes(`addEventListener("${event}", stop)`));
    assert.ok(explorer.includes(`removeEventListener("${event}", stop)`));
  }
  assert.match(explorer, /closest\("\[data-tour-toggle\]"\)\) return/);
  assert.match(explorer, /onSelect=\{hand => \{ setTouring\(false\); setSelected\(hand\); \}\}/);
  assert.match(explorer, /function chooseMode\([^)]*\) \{\s*setTouring\(false\)/);
  assert.match(explorer, /function chooseDisplayMode\([^)]*\) \{\s*setTouring\(false\)/);
  assert.match(explorer, /setTouring\(current => !current\)/);
  assert.match(explorer, /data-tour-running=\{isTouring && visible\}/);
  assert.match(explorer, /window\.localStorage\.setItem\(displayModeKey, next\)/);
  assert.match(explorer, /aria-live=\{isTouring \? "off" : "polite"\}/,
    "automatic hands must not repeatedly interrupt a screen reader");
});

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

test("comparison pins a full readable desktop stage and reveals rows from scroll, not highlighting", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const compare = source.split("function Compare() {")[1].split("function Pricing()")[0];
  assert.match(compare, /if \(!motion\) \{ setScrolly\(false\)/);
  assert.match(compare, /matchMedia\("\(min-width: 961px\) and \(min-height: 600px\)"\)/);
  assert.match(compare, /Math\.min\(Math\.floor\(progress \* rowCount\) \+ 1, rowCount\)/);
  assert.match(compare, /index < visibleRows \? "is-revealed"/);
  assert.match(compare, /key=\{comparisonRowIds\[index\]\}/);
  assert.doesNotMatch(compare, /key=\{row.label\}|is-current|activeRow/);
  assert.match(compare, /cancelAnimationFrame\(frame\)/);
  assert.match(css, /\.site-compare\.is-scrolly \.site-compare-stage\s*\{[^}]*position: sticky; top: 64px;[^}]*height: calc\(100vh - 64px\); padding-block: 24px/);
  assert.match(css, /\.site-compare\.is-scrolly \.site-wrap\s*\{[^}]*height: 100%; grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.has-motion \.site-compare\.is-scrolly \.site-compare-table tbody tr\s*\{[^}]*opacity: 0/);
  assert.match(css, /\.has-motion \.site-compare\.is-scrolly \.site-compare-table tbody tr\.is-revealed\s*\{[^}]*opacity: 1/);
  assert.doesNotMatch(css, /site-compare[^}]*is-current/);
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
  test(`${locale}: the live decision studio keeps its English heading and full-width hand detail after the chart`, () => {
    const html = render(locale);
    const heading = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0];
    assert.ok(heading);
    assert.match(heading, /id="site-hero-title"/);
    assert.match(heading, /lang="en"/);
    for (const title of ["Don't just play.", "Understand why."]) assert.ok(heading.includes(escapeText(title)));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    const main = html.indexOf('class="site-wrap site-hero-main"');
    const range = html.indexOf('class="site-hero-range"');
    const detail = html.indexOf('class="site-hero-detail"');
    const playback = html.indexOf('class="site-hero-playback"');
    assert.ok(main > 0 && range > main && detail > range && playback > detail);
    assert.match(html, /class="site-hero-deal"[\s\S]*?class="site-hero-summary"[\s\S]*?class="site-hero-reason"/);
    assert.match(html, /class="site-hand" aria-live="polite" aria-atomic="true"/);
    assert.ok(html.includes(escapeText(copies[locale].hero.lead)));
    assert.match(html, /class="site-hero-secondary" href="#how"/);
    assert.doesNotMatch(html, /class="site-explorer-body"|class="site-hero-product"/);
  });

  test(`${locale}: reduced motion exposes the complete manual preview without a nonfunctional playback button`, () => {
    const html = renderWithMotionPreference(locale, true);
    assert.doesNotMatch(html, /has-motion|class="site-tour-toggle"/);
    assert.match(html, /data-tour-running="false"/);
    assert.match(html, /class="site-hand" aria-live="polite" aria-atomic="true"/);
    assert.equal((html.match(/class="site-cell /g) ?? []).length, 169);
    assert.ok(html.includes(escapeText(copies[locale].preview.manual)));
    assert.ok(html.includes(escapeText(copies[locale].preview.notGto)));

    const animated = renderWithMotionPreference(locale, false);
    assert.match(animated, /has-motion/);
    assert.match(animated, /class="site-hand" aria-live="off" aria-atomic="true"/);
    const playback = animated.match(/<button\b[^>]*class="site-tour-toggle"[^>]*>/)?.[0];
    assert.ok(playback);
    assert.ok(playback.includes(`aria-label="${escapeText(copies[locale].preview.pauseTour)}"`));
  });

  test(`${locale}: Simple and restored Standard preserve every saved opening frequency in accessible chart labels`, () => {
    const { preview: copy, common } = copies[locale];
    for (const displayMode of ["simple", "standard"]) {
      const { html, reads } = renderWithDisplayPreference(locale, displayMode);
      assert.ok(reads.includes("reysonai:site-preview-display-mode:v1"));
      const cells = html.match(/<button\b[^>]*class="site-cell [^"]*"[^>]*>[\s\S]*?<\/button>/g) ?? [];
      assert.equal(cells.length, 169);
      assert.equal(cells.filter(cell => cell.includes('aria-pressed="true"')).length, 1);
      for (const [hand, values] of Object.entries(preview.opening)) {
        const breakdown = [[common.raise, values.open], [common.fold, values.fold]]
          .filter(([, frequency]) => frequency > 0)
          .map(([action, frequency]) => `${action} ${frequency}%`).join(" / ");
        assert.ok(cells.some(cell => cell.includes(`aria-label="${escapeText(`${hand}: ${breakdown}`)}"`)), `${displayMode}: ${hand} retains its saved frequencies`);
      }
      const modeName = displayMode === "standard" ? copy.standardMode : copy.simpleMode;
      assert.ok(html.includes(`aria-pressed="true">${escapeText(modeName)}</button>`));
      if (displayMode === "standard") assert.match(html, /class="site-cell-mix" aria-hidden="true"/);
      else assert.doesNotMatch(html, /class="site-cell-mix"/);
    }
  });

  test(`${locale}: compact comparison retains every original claim and disclaimer`, () => {
    const comparison = render(locale).match(/<section class="site-section site-compare"[\s\S]*?<\/section>/)?.[0];
    assert.ok(comparison);
    assert.match(comparison, /<table>/);
    assert.match(comparison, /id="compare"[^>]*>[\s\S]*class="site-compare-stage"/);
    assert.equal((comparison.match(/id="compare"/g) ?? []).length, 1);
    assert.doesNotMatch(comparison, /is-scrolly|is-revealed|<tr[^>]*aria-hidden/);
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
