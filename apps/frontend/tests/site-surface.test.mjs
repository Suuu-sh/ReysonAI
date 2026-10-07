import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("scrolly audience starts at the section edge instead of centering in its scroll spacer", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /\.site-audience\.is-scrolly\s*\{[^}]*display: block;[^}]*height: 300vh/);
  assert.match(css, /\.site-audience\.is-scrolly > \.site-wrap\s*\{[^}]*position: sticky; top: 0/);
});

test("phone storytelling uses native sticky flow with short-screen and reduced-motion fallbacks", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const audience = source.slice(source.indexOf("function Audience()"), source.indexOf("const TRAIN_PAGES"));
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(audience, /\(max-width: 960px\) and \(min-height: 740px\)/);
  assert.match(audience, /if \(!motion\) \{ setScrolly\(false\)/);
  assert.match(audience, /new ResizeObserver\(update\)/);
  assert.match(audience, /window\.innerHeight - wrapper\.offsetHeight/);
  assert.match(css, /@media \(max-width: 960px\) and \(min-height: 740px\)/);
  assert.match(css, /\.has-motion \.site-how-steps li \{ position: sticky; top: 80px/);
  assert.doesNotMatch(audience, /addEventListener\("(?:wheel|touchmove)"/);
});

test("oversized translated phone How cards fall back to ordinary scrolling", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const how = source.slice(source.indexOf("function HowItWorks()"), source.indexOf("const drillPool"));
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(how, /if \(!motion \|\| typeof ResizeObserver === "undefined"\) return/);
  assert.match(how, /card\.offsetHeight > window\.innerHeight - 80/);
  assert.match(how, /new ResizeObserver\(update\)/);
  assert.match(how, /observer\.disconnect\(\)/);
  assert.match(css, /\.has-motion \.site-how-steps li\[data-oversized="true"\] \{ position: static; \}/);
});

test("phone hero uses an inert decorative chart behind centered copy and CTAs", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const mobile = css.slice(css.indexOf("@media screen and (max-width: 560px)"));
  assert.match(source, /className="site-hero-range" inert=\{decorative\} aria-hidden=\{decorative \|\| undefined\}/);
  assert.match(source, /matchMedia\("\(max-width: 560px\)"\)/);
  assert.match(source, /query\.removeEventListener\("change", sync\)/);
  assert.match(mobile, /\.site-hero-copy \{[^}]*text-align: center;/);
  assert.match(mobile, /\.site-hero-range \{ position: absolute;[^}]*pointer-events: none;/);
  assert.match(mobile, /\.site-hero h1 \.site-hero-mark \{ color: #a8a8b3;/);
  assert.match(mobile, /\.site-hero-opening \{ color: var\(--ink\);/);
  assert.match(mobile, /\.site-hero-range \.site-matrix-scroll \{[^}]*margin: 0; padding: 0;/);
  assert.match(mobile, /\.site-hero-actions \{ justify-content: center;/);
  assert.match(mobile, /\.site-hero-range \.site-matrix \{ height: auto; aspect-ratio: 1;/);
  assert.match(mobile, /\.has-motion \.site-hero-range \{ animation: none; \}/);
  assert.match(mobile, /\.site-wrap\.site-hero-main \{[^}]*width: 100%; margin: 0; min-height: 0; aspect-ratio: 1; padding: 0;/);
  assert.doesNotMatch(mobile.split("/* Compare")[0], /min-height: calc\(100svh - 64px\)/);
});

test("hero and shared English taglines use Understand the reason", () => {
  for (const file of ["content.ts", "content-ja.ts", "content-es.ts", "content-zh.ts"]) {
    const content = readFileSync(new URL(`../src/site/${file}`, import.meta.url), "utf8");
    assert.match(content, /title2: "Understand the reason\."/);
    assert.match(content, /tagline: "Don't just play\. Understand the reason\."/);
    assert.doesNotMatch(content, /Understand why\./);
  }
});

test("phone selected-hand panel stays compact without shrinking its action target", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const mobile = css.slice(css.indexOf("@media screen and (max-width: 560px)"));
  assert.match(mobile, /\.site-hero-detail \.site-hand \{ gap: 12px 16px; padding-block: 14px; \}/);
  assert.match(mobile, /\.site-hero-deal \.site-card \{ --card-w: clamp\(36px, 10vw, 48px\); \}/);
  assert.match(mobile, /\.site-hero-reason \.site-hand-link \{ min-height: 44px;/);
  assert.match(mobile, /\.site-hero-summary \.site-hand-action\.is-spacer \{ display: none; \}/);
});

test("phones hide only the illustrative analysis dashboard, retaining explanatory content", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 560px\) \{\s*\/\*[^]*?\*\/\s*\.site-analysis \.site-dash \{ display: none; \}/);
  const analysis = source.slice(source.indexOf("function Analysis()"), source.indexOf("function Compare()"));
  assert.match(analysis, /c\.analysis\.description/);
  assert.match(analysis, /c\.analysis\.points\.map/);
  assert.match(analysis, /c\.analysis\.note/);
  assert.match(analysis, /site-mock site-dash/);
});

test("ranked preview mirrors human hand metrics, not legacy quiz scoring", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const ranked = source.slice(source.indexOf("function Ranked()"), source.indexOf("function AgentFeature()"));
  assert.doesNotMatch(ranked, /matchLine|lastMatch|\.today|\.peak|site-rank-pips/);
  for (const field of ["sample", "mode", "hands", "rewards", "note", "legendRule"]) assert.ok(ranked.includes(`c.ranked.${field}`));
  assert.doesNotMatch(ranked, /site-rank-results|site-rank-queue|bb\/100|2 \/ 6/);
  assert.match(source, /const tierMins = TIERS\.map/);
  for (const file of ["content.ts", "content-ja.ts", "content-es.ts", "content-zh.ts"]) {
    const content = readFileSync(new URL(`../src/site/${file}`, import.meta.url), "utf8");
    const copy = content.slice(content.indexOf("  ranked: {"), content.indexOf("  agent: {"));
    assert.doesNotMatch(copy, /matchLine|lastMatch|today:|peak:|80%|Elo|イロ/);
    assert.match(copy, /FastFold β/);
    assert.match(copy, /sample:/);
  }
});

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
function renderAtHostname(locale, hostname) {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname } };
  try {
    return render(locale);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}
const escapeText = value => renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
const preview = JSON.parse(readFileSync(new URL("../src/site/range-preview.json", import.meta.url), "utf8"));

function renderWithMotionPreference(locale, reducedMotion) {
  const previousWindow = globalThis.window;
  const previousObserver = globalThis.IntersectionObserver;
  globalThis.window = {
    matchMedia: query => ({ matches: query.includes("prefers-reduced-motion") && reducedMotion }),
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

test("responsive hero mounts one matrix and keeps phone controls outside its inert backdrop", () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { matchMedia: query => ({ matches: query === "(max-width: 560px)" }), localStorage: { getItem: () => null } };
    const mobile = render("ja");
    assert.equal((mobile.match(/class="site-matrix"/g) ?? []).length, 1);
    assert.match(mobile, /class="site-hero-range" inert="" aria-hidden="true"/);
    assert.match(mobile, /class="site-hero-detail"/);
    assert.doesNotMatch(mobile.split('class="site-hero-detail"')[0], /class="site-mini-legend"/);
    delete globalThis.window;
    const desktop = render("en");
    assert.equal((desktop.match(/class="site-matrix"/g) ?? []).length, 1);
    assert.match(desktop, /class="site-mini-legend"/);
    assert.doesNotMatch(desktop, /class="site-hero-detail"|inert=""/);
  } finally { globalThis.window = previousWindow; }
});

test("the range tour randomly selects saved spots, pauses offscreen, yields to interaction, and keeps playback intentional", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  const explorer = source.split("function DesktopExplorer() {")[1].split("const tourHands")[0];
  assert.match(explorer, /const isTouring = touring && motion/);
  assert.match(explorer, /if \(!isTouring \|\| !visible\) return/);
  assert.match(explorer, /window\.clearInterval\(timer\)/);
  assert.match(explorer, /setRangeIndex\(current => pickNextRangeIndex\(current, heroRanges.length\)\)/);
  assert.match(explorer, /\}, 4000\)/);
  for (const event of ["pointerdown", "keydown"]) {
    assert.ok(explorer.includes(`addEventListener("${event}", stop)`));
    assert.ok(explorer.includes(`removeEventListener("${event}", stop)`));
  }
  assert.match(explorer, /onSelect=\{hand => \{ setTouring\(false\); setSelected\(hand\); \}\}/);
  assert.doesNotMatch(explorer, /chooseMode|chooseDisplayMode|displayMode|site-explorer-bar|site-segment|localStorage/);
  assert.match(explorer, /data-tour-running=\{isTouring && visible\}/);
  assert.doesNotMatch(explorer, /site-tour-progress|key=\{`\$\{mode\}-\$\{selected\}-\$\{isTouring\}`\}/);
});

test("random tour picks never repeat immediately, and its fifty ranges preserve saved frequencies/reach", async () => {
  const { pickNextRangeIndex } = await server.ssrLoadModule("/src/site/range-tour.ts");
  assert.equal(pickNextRangeIndex(0, 1), 0);
  for (let current = 0; current < 50; current++) for (const random of [0, .2, .5, .999999]) {
    const next = pickNextRangeIndex(current, 50, () => random);
    assert.ok(next >= 0 && next < 50 && next !== current);
  }
  const sources = [
    ["opening-ranges", "opening", "open"], ["preflop-ranges", "response", "three_bet"],
    ["three-bet-responses", "threeBet", "four_bet"], ["four-bet-responses", "fourBet", "all_in"],
  ];
  assert.equal(preview.tour.length, 50);
  const read = file => JSON.parse(readFileSync(new URL(`../src/estimated/${file}.json`, import.meta.url), "utf8")).spots;
  for (const [file, stage, raiseAction] of sources) for (const spot of read(file)) {
    const range = preview.tour.find(range => range.id === spot.id && range.stage === stage);
    assert.ok(range);
    assert.equal(Object.keys(range.hands).length, 169);
    for (const row of spot.hands) assert.deepEqual(range.hands[row.hand], {
      raise: raiseAction === "all_in" ? 0 : row[raiseAction], all_in: raiseAction === "all_in" ? row.all_in : 0,
      call: row.call ?? 0, limp: row.limp ?? 0, fold: row.fold,
    });
    const previous = stage === "threeBet" ? read("opening-ranges").find(item => item.hero === spot.hero) : stage === "fourBet" ? read("preflop-ranges").find(item => item.id === spot.source_response_id) : null;
    assert.deepEqual(range.unreachable, previous ? previous.hands.filter(row => (stage === "threeBet" ? row.open : row.three_bet) === 0).map(row => row.hand) : []);
  }
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.match(source, /!unreachable && mixed.length > 1/);
  assert.match(source, /unreachable \? copy.preview.unreachable/);
  assert.match(source, /actionColor\(action\)/);
});

test("saved postflop previews retain canonical board-specific weighted mixes, reach and real bet colors", async () => {
  const snapshot = JSON.parse(readFileSync(new URL("../src/site/postflop-preview.json", import.meta.url), "utf8"));
  const { loadInputs } = await import("../scripts/postflop-ai/inputs.mjs");
  assert.equal(snapshot.source_hash, loadInputs(snapshot.spot).fingerprint);
  assert.equal(snapshot.ranges.length, 12);
  const { RangeMatrix, HeroActionLegend } = await server.ssrLoadModule("/src/site/ServiceSite.tsx");
  for (const range of snapshot.ranges) {
    assert.equal(Object.keys(range.hands).length, 169);
    assert.match(range.board, /^(?:[2-9TJQKA][cdhs]){3}$/);
    assert.ok(["BTN", "BB"].includes(range.seat));
    for (const [hand, mix] of Object.entries(range.hands)) {
      assert.deepEqual(Object.keys(mix), range.actions);
      const total = Object.values(mix).reduce((sum, value) => sum + value, 0);
      assert.ok(Math.abs(total - (range.unreachable.includes(hand) ? 0 : 1)) < 1e-12);
    }
    const html = renderToStaticMarkup(createElement(RangeMatrix, { range, selected: "A5o", onSelect() {} }));
    assert.equal((html.match(/class="site-cell /g) ?? []).length, 169);
    assert.equal((html.match(/is-unreachable/g) ?? []).length, range.unreachable.length);
    const context = renderToStaticMarkup(createElement(HeroActionLegend, { range }));
    assert.match(context, /site-range-legend/);
    assert.doesNotMatch(context, /site-card|BTN|BB|Flop|→/);
    assert.ok(!context.includes(range.board));
    assert.ok(html.includes(range.board), "board stays available to assistive technology");
    assert.equal((context.match(/<i /g) ?? []).length, range.actions.filter(action => Object.entries(range.hands).some(([hand, mix]) => !range.unreachable.includes(hand) && mix[action] > 0)).length);
  }
  const betting = snapshot.ranges.find(range => range.id.endsWith(":btn_first"));
  assert.deepEqual(betting.actions, ["check", "bet33", "bet75", "bet125"]);
  const source = readFileSync(new URL("../scripts/build-site-postflop-preview.mjs", import.meta.url), "utf8");
  assert.match(source, /flopNodes\(inputs, policy, parsed.cards\)/);
  assert.match(source, /return \[row.hand, row.mix\]/);
  assert.match(source, /!row.reachable/);
});

test("the hero key describes only used action colors, not the situation", async () => {
  const { HeroActionLegend } = await server.ssrLoadModule("/src/site/ServiceSite.tsx");
  const { color } = await server.ssrLoadModule("/src/components/action-format.ts");
  const snapshot = JSON.parse(readFileSync(new URL("../src/site/postflop-preview.json", import.meta.url), "utf8"));
  const range = snapshot.ranges.find(range => range.id.endsWith(":btn_first"));
  const html = renderToStaticMarkup(createElement(HeroActionLegend, { range }));
  for (const action of range.actions) if (Object.values(range.hands).some(mix => mix[action] > 0)) assert.ok(html.includes(`background:${color(action)}`));
  assert.match(html, /Bet 33%|Bet 75%|Bet 125%/);
  assert.match(html, /Check/);
  const opening = { ...preview.tour.find(range => range.id === "BTN_open"), actions: ["all_in", "raise", "call", "limp", "fold"] };
  const preflop = renderToStaticMarkup(createElement(HeroActionLegend, { range: opening }));
  assert.match(preflop, /Raise/);
  assert.match(preflop, /Fold/);
  assert.doesNotMatch(preflop, /Call|allin|5bet|BTN_open/);
  const allinRange = { ...preview.tour.find(range => range.stage === "fourBet"), actions: ["all_in", "call", "fold"] };
  const allin = renderToStaticMarkup(createElement(HeroActionLegend, { range: allinRange }));
  assert.match(allin, />allin<\/span>/);
  assert.doesNotMatch(allin, /5bet|100BB/);
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PostflopRangeContext|site-range-board/);
});

test("pinned training slides stay visible and the hero matrix remains square", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /\.site \.site-matrix\s*\{[^}]*aspect-ratio: 1;/);
  assert.match(css, /\.site-train\.is-scrolly \[data-reveal\]\s*\{[^}]*opacity: 1; transform: none;/);
  assert.doesNotMatch(css, /site-tour-progress|@keyframes site-tour/);
});

test("the hero range fills its column without a separate action legend", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  assert.match(css, /\.site-hero\s*\{ padding: 0; \}/);
  assert.match(css, /\.site-hero-main\s*\{[^}]*width: 100%; min-height: var\(--hero-height\); grid-template-columns: minmax\(0, 1fr\) var\(--hero-range-size\); align-items: center; gap: 0; padding: 0;/);
  assert.match(css, /--header-height: 64px;/);
  assert.match(css, /\.site-header\s*\{[^}]*height: var\(--header-height\);/);
  assert.match(css, /--hero-height: calc\(100svh - var\(--header-height\)\); --hero-range-size: min\(var\(--hero-height\), calc\(100vw - min\(40vw, 480px\)\)\);/);
  assert.match(css, /\.site-hero-copy\s*\{[^}]*align-self: center; transform: translateY\(28px\);/);
  assert.doesNotMatch(css.split("@media screen and (max-width: 560px)")[0], /\.site-hero-range\s*\{[^}]*(?:max-width:|width: min\(|margin-top: -)/);
  assert.match(css, /\.site-hero-main\s*\{ width: calc\(100% - var\(--page-gutter\) \* 2\); min-height: 0; grid-template-columns: 1fr;/);
  for (const locale of ["en", "ja"]) {
    const html = render(locale);
    assert.doesNotMatch(html, /class="site-legend"/);
    assert.match(html, /class="site-mini-legend"/);
    assert.doesNotMatch(html, /class="site-hero-detail"|class="site-hero-playback"/);
  }
});

test("production service-site app CTAs use the app host while previews keep their existing path", () => {
  const production = renderAtHostname("en", "reysonai.com");
  assert.equal((production.match(/href="https:\/\/app\.reysonai\.com"/g) ?? []).length, 6);
  assert.doesNotMatch(production, /href="\/analyze\/ranges"/);

  const previewSite = renderAtHostname("ja", "preview.local");
  assert.equal((previewSite.match(/href="\/analyze\/ranges"/g) ?? []).length, 6);
  assert.doesNotMatch(previewSite, /href="https:\/\/app\.reysonai\.com"/);
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
  assert.match(tablet, /\.site \.site-lang, \.site \.site-button\.is-small\s*\{[^}]*min-height: 44px/);
  assert.match(css, /\.site-dash-kpis\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.site-dash-kpis[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.site-rank-card\s*\{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.site-mock\s*\{[^}]*min-width: 0/);
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.match(source, /matchMedia\("\(min-width: 961px\) and \(min-height: 640px\), \(max-width: 960px\) and \(min-height: 740px\)"\)/,
    "persona pinning is desktop-only and enables a compact stage on short screens");
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
  test(`${locale}: the live decision studio keeps its English heading and matrix without the removed hand rail`, () => {
    const html = render(locale);
    const heading = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0];
    assert.ok(heading);
    assert.match(heading, /id="site-hero-title"/);
    assert.match(heading, /lang="en"/);
    for (const title of ["Don't just play.", "Understand the reason."]) assert.ok(heading.includes(escapeText(title)));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    const main = html.indexOf('class="site-wrap site-hero-main"');
    const range = html.indexOf('class="site-hero-range"');
    assert.ok(main > 0 && range > main);
    assert.doesNotMatch(html, /class="site-hero-detail"|class="site-hero-playback"|class="site-hero-deal"/);
    assert.ok(html.includes(escapeText(copies[locale].preview.saved)));
    assert.ok(html.includes(escapeText(copies[locale].preview.notGto)));
    assert.ok(html.includes(escapeText(copies[locale].hero.lead)));
    assert.match(html, /class="site-hero-secondary" href="#how"/);
    assert.doesNotMatch(html, /class="site-explorer-body"|class="site-hero-product"/);
  });

  test(`${locale}: reduced motion exposes the complete manual preview without a nonfunctional playback button`, () => {
    const html = renderWithMotionPreference(locale, true);
    assert.doesNotMatch(html, /has-motion|class="site-tour-toggle"/);
    assert.match(html, /data-tour-running="false"/);
    assert.equal((html.match(/class="site-cell /g) ?? []).length, 169);
    assert.ok(html.includes(escapeText(copies[locale].preview.notGto)));

    const animated = renderWithMotionPreference(locale, false);
    assert.match(animated, /has-motion/);
    assert.match(animated, /data-tour-running="false"/);
    assert.doesNotMatch(animated, /class="site-tour-toggle"|class="site-hero-detail"/);
  });

  test(`${locale}: the fixed Standard hero preview keeps selectors hidden and exposes every saved opening frequency`, () => {
    const { common } = copies[locale];
    const html = render(locale);
    const hero = html.split('class="site-wrap site-hero-main"')[1].split('id="audience"')[0];
    const cells = html.match(/<button\b[^>]*class="site-cell [^"]*"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    assert.equal(cells.length, 169);
    assert.equal(cells.filter(cell => cell.includes('aria-pressed="true"')).length, 1);
    assert.doesNotMatch(hero, /site-explorer-bar|site-segment/);
    assert.doesNotMatch(html, /reysonai:site-preview-display-mode:v1/);
    assert.match(html, /class="site-cell-mix" aria-hidden="true"/);
    for (const [hand, values] of Object.entries(preview.opening)) {
      const breakdown = [[common.raise, values.open], [common.fold, values.fold]]
        .filter(([, frequency]) => frequency > 0)
        .map(([action, frequency]) => `${action} ${frequency}%`).join(" / ");
      assert.ok(cells.some(cell => cell.includes(`aria-label="${escapeText(`${hand}: ${breakdown}`)}"`)), `${hand} retains its saved frequencies`);
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
    assert.doesNotMatch(html, /class="site-hero-detail"/);
    assert.match(html, /class="site-plan is-planned"/);
    assert.match(html, /class="site-button is-disabled" aria-disabled="true"/);
    assert.match(html, /href="\/analyze\/ranges"/);
    assert.match(html, locale === "en" ? /Not a GTO solution/ : /GTOソリューションではありません/);
  });
}
