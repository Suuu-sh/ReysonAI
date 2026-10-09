import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { LOCALES, LOCALE_KEY, localeTag, localized, productLocale, rememberLocale, selectProductLocale } from "../src/locale.ts";
import { COPY, translateProductCopy } from "../src/i18n.ts";
import { productCopy } from "../src/locales/copy.ts";
import { reasonCopy } from "../src/locales/reason-copy.ts";
import { localizedPreflopReason } from "../src/estimated/english-reasons.ts";
import { buildAdvancedExplanation } from "../src/estimated/postflop-advanced.ts";
import { actionReason, evidenceReason } from "../src/estimated/postflop-reasons.ts";
import { glossaryPieces } from "../src/estimated/poker-glossary.ts";
import { displayDrillName, PRESET_DRILLS } from "../src/trainer/drill-store.ts";

const oldWindow = globalThis.window;
const values = new Map();
let reloads = 0;
before(() => { globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, location: { reload: () => reloads++ }, matchMedia: () => ({ matches: false }) }; });
after(() => { globalThis.window = oldWindow; });
const useLocale = locale => values.set(LOCALE_KEY, locale);

test("all four locales persist, unsupported locales fall back, and selection reloads in place", async () => {
  values.clear();
  assert.equal(productLocale(), "en");
  assert.deepEqual(LOCALES.map(item => item.value), ["en", "ja", "zh-CN", "es"]);
  for (const locale of LOCALES.map(item => item.value)) {
    rememberLocale(locale);
    assert.equal(productLocale(), locale);
    await selectProductLocale(locale);
    assert.equal(productLocale(), locale);
  }
  assert.equal(reloads, 4);
  rememberLocale("fr");
  assert.equal(productLocale(), "es");
  useLocale("invalid");
  assert.equal(productLocale(), "en");
  useLocale("zh-CN"); assert.equal(localeTag(), "zh-CN");
  useLocale("es"); assert.equal(localeTag(), "es-ES");
});

test("every legacy product key has authored Chinese and Spanish copy with intact placeholders", () => {
  for (const english of Object.values(COPY).filter(Boolean)) assert.ok(productCopy[english], `Missing product translation: ${english}`);
  for (const [english, translations] of Object.entries({ ...productCopy, ...reasonCopy })) {
    const slots = [...english.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
    assert.equal(translations.length, 2, english);
    for (const translation of translations) {
      assert.ok(translation.trim(), english);
      assert.deepEqual([...translation.matchAll(/\{\d+\}/g)].map(m => m[0]).sort(), slots, english);
    }
  }
});

test("Spanish ranked explanations use the same rating and tier labels as the product", () => {
  const explanation = productCopy["Server-confirmed matches only · weekly means the last 7 days. Legend: Master rating and a global top-10 placement in this period. AI-estimate alignment, not GTO or win rate."][1];
  assert.ok(explanation.includes(productCopy.Legend[1]));
  assert.ok(explanation.includes(productCopy.Master[1]));
  assert.match(explanation, /puntuación de Maestro/);
  assert.match(explanation, /servidor.*últimos 7 días.*10 primeros.*no GTO ni tasa de victorias/);
  assert.doesNotMatch(explanation, /\b(?:Legend|Master)\b/);
  assert.match(productCopy["All spots · standard difficulty · {0} questions. Harder hands move your rating more."][1], /puntuación/);
});

test("interface copy is localized but dynamic user text and poker facts stay verbatim", () => {
  for (const locale of ["zh-CN", "es"]) {
    useLocale(locale);
    assert.notEqual(localized("Display language", "表示言語"), "Display language");
    assert.notEqual(translateProductCopy("練習セッション"), "Practice sessions");
    assert.notEqual(translateProductCopy("Raise 2.5BB"), "Raise 2.5BB");
    assert.match(translateProductCopy("Raise 2.5BB"), /2\.5BB/);
    assert.equal(translateProductCopy("A5s · BTN · 52.3%"), "A5s · BTN · 52.3%");
    assert.equal(displayDrillName({ id: "mine", name: "Range analysis 日本語" }), "Range analysis 日本語");
    assert.notEqual(displayDrillName(PRESET_DRILLS[0]), "All-spot mix");
    assert.ok(localized("Account: Range analysis 日本語", "unused").includes("Range analysis 日本語"));
  }
});

test("account sync size warnings have Chinese and Spanish recovery copy", () => {
  const warnings = [
    "This data exceeds the 500 KB account-sync limit. It was not uploaded and the account snapshot was not replaced. No automatic retry was made; keep this page open and export before reloading or signing out.",
    "This account snapshot exceeds the 500 KB sync limit. Saving is paused; the account snapshot was not replaced. Keep this page open and export your records before reloading or signing out.",
  ];
  for (const locale of ["zh-CN", "es"]) {
    useLocale(locale);
    for (const english of warnings) {
      const text = localized(english, "日本語の上限警告");
      assert.notEqual(text, english, `${locale} copy is translated`);
      assert.match(text, /500 KB/);
      assert.match(text, /不會|不会|No se|No habrá|已暂停|Se han pausado/);
      assert.match(text, /导出|exporta|exporta tus|exporta los/i);
      assert.match(text, /重新加载|recargar/);
    }
  }
});

test("preflop and flop explanations preserve recorded figures in both new languages", () => {
  const hand = { hand: "22", call: 95, three_bet: 5, fold: 0 };
  const detailed = { reason: "保存済み説明", facts: { equity_vs_open_pct: 47.5, realized_equity_pct: 41, call_ev_bb: 0.64 } };
  const data = { spot_facts: { call_break_even_equity_pct: 25 } };
  const original = JSON.stringify([hand, detailed, data]);
  for (const locale of ["zh-CN", "es"]) {
    useLocale(locale);
    const text = localizedPreflopReason(hand, detailed, data);
    for (const figure of ["22", "47.5%", "41.0%", "+0.64 bb", "25.0%", "95%", "5%"]) assert.ok(text.includes(figure), text);
    assert.doesNotMatch(text, /\b(?:Under|recorded|pocket|improve|threshold)\b/);
    assert.doesNotMatch(actionReason("btn_first", "bet33", "strong"), /thin value bet|[ぁ-んァ-ヶ]/);
    const evidence = evidenceReason("call", { required: 0.25 }, 0.42);
    assert.match(evidence, /42%/); assert.match(evidence, /25%/);
  }
  assert.equal(JSON.stringify([hand, detailed, data]), original);
});

test("postflop templates retain action identities and explain the same exact combo", () => {
  const cases = [
    { node: "btn_first", hand: "AKo", board: "As7d2c", cards: "AhKd", actionMix: { check: .2, bet33: .6, bet75: .2 }, tiers: { strong: 1 }, texture: "dry", explain: { equity: .7 } },
    { node: "turn_ip_first", hand: "AQs", board: "Ks9s2d4c", cards: "AsQs", actionMix: { check: .3, bet33: .1, bet75: .4, bet125: .2 }, tiers: { draw: 1 }, texture: "flush", explain: { equity: .45 } },
    { node: "river_oop_first", hand: "A9s", board: "Ks9d4c2h7s", cards: "Ad9s", actionMix: { check: .5, bet75: .3, allin: .2 }, tiers: { medium: 1 }, texture: "over", explain: { equity: .4 } },
  ];
  for (const input of cases) {
    const english = buildAdvancedExplanation({ ...input, locale: "en" });
    for (const locale of ["zh-CN", "es"]) {
      const result = buildAdvancedExplanation({ ...input, locale });
      assert.deepEqual(result.blocks.map(({ action, frequency }) => ({ action, frequency })), english.blocks.map(({ action, frequency }) => ({ action, frequency })));
      const text = [result.headline, ...result.blocks.map(block => block.text), result.texture ?? ""].join(" ");
      assert.doesNotMatch(text, /\b(?:is|the|with|draws|holds|small|large|makes|though)\b/);
      assert.doesNotMatch(text, /[ぁ-んァ-ヶ]|\bEV\b|GTO/);
      assert.match(result.headline, /[AKQJTA2-9][♣♦♥♠]/);
    }
  }
});

test("translated poker glossary terms keep translated definitions", () => {
  for (const [locale, text] of [["zh-CN", "范围优势与坚果优势"], ["es", "ventaja de rango y ventaja de nuts"]]) {
    const pieces = glossaryPieces(text, locale);
    assert.ok(pieces.some(piece => piece.definition), text);
    for (const piece of pieces.filter(piece => piece.definition)) assert.doesNotMatch(piece.definition, /Your whole range|[ぁ-んァ-ヶ]/);
  }
});

test("settings expose four native names; sidebar removes languages and mobile tabs preserve route access", async () => {
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  try {
    const { Sidebar } = await server.ssrLoadModule("/src/components/layout.tsx");
    const { AccountPage } = await server.ssrLoadModule("/src/account/AccountPage.tsx");
    const { Onboarding } = await server.ssrLoadModule("/src/components/Onboarding.tsx");
    globalThis.window.sessionStorage = { getItem: () => JSON.stringify({ nickname: "Wrong account", level: "beginner", owner: "other-user", profileRevision: null }), removeItem() {} };
    const editing = renderToStaticMarkup(createElement(Onboarding, { initial: { nickname: "Correct profile", level: "intermediate", updatedAt: "2026-10-04" }, account: { user: { id: "current-user" } }, onComplete() {}, onCancel() {} }));
    assert.match(editing, /value="Correct profile"/);
    assert.doesNotMatch(editing, /Wrong account|onboarding-language/);
    delete globalThis.window.sessionStorage;
    for (const locale of ["zh-CN", "es"]) {
      useLocale(locale);
      const html = renderToStaticMarkup(createElement(Sidebar, { activeSection: "アカウント#language", profile: { nickname: "Language 日本語", level: "beginner" }, onSectionChange() {} }));
      const sidebar = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
      assert.doesNotMatch(sidebar, /app-language-switch|menuitemradio|<select/);
      const mobile = html.match(/<nav class="mobile-tab-bar"[\s\S]*?<\/nav>/)?.[0];
      assert.ok(mobile); assert.equal((mobile.match(/<button/g) ?? []).length, 5);
      assert.equal((mobile.match(/aria-current="page"/g) ?? []).length, 1);
      const page = renderToStaticMarkup(createElement(AccountPage, { tab: "language", profile: { nickname: "Yu", level: "beginner" }, onSectionChange() {} }));
      for (const { label } of LOCALES) assert.ok(page.includes(label));
      assert.ok(page.includes('translate="no"'));
    }
  } finally { await server.close(); }
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /max-width: 650px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.mobile-tab-bar button:focus-visible/);
  assert.match(css, /\.app-sidebar, \.app-sidebar\.is-collapsed, \.sidebar-backdrop \{ display: none; \}/);
});

test("a guest can switch languages even when account service is offline", async () => {
  const { refreshAccount, accountSnapshot } = await import("../src/account/session.ts");
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("offline"); };
    await refreshAccount();
    assert.equal(accountSnapshot().user, null);
    assert.ok(accountSnapshot().error);
    const before = reloads;
    await selectProductLocale("zh-CN");
    assert.equal(reloads, before + 1);
    assert.equal(productLocale(), "zh-CN");
  } finally { globalThis.fetch = fetch; }
});

test("234 flop, turn and river explanation variants have no English prose fallback or changed strategy", () => {
  const deck = [..."23456789TJQKA"].flatMap(rank => [..."cdhs"].map(suit => rank + suit));
  const boards = ["As7d2c", "KhTh4s", "6h5h2d", "AhKh4h", "KdKc4h", "Ks9s2d4c", "Ks9d4c2h7s"];
  let count = 0;
  for (const board of boards) {
    const cards = deck.filter(card => !board.includes(card));
    for (let i = 0; i < cards.length; i += 3) {
      const hand = cards[i] + cards[(i + 13) % cards.length];
      const node = board.length === 6 ? "btn_first" : board.length === 8 ? "turn_ip_first" : "river_oop_first";
      const input = { hand, board, cards: hand, node, actionMix: { check: .3, bet33: .3, bet75: .3, bet125: .1 }, tiers: { draw: .4, strong: .4, air: .2 }, explain: { equity: .45 } };
      const english = buildAdvancedExplanation({ ...input, locale: "en" });
      for (const locale of ["zh-CN", "es"]) {
        const result = buildAdvancedExplanation({ ...input, locale });
        assert.deepEqual(result.blocks.map(({ action, frequency }) => [action, frequency]), english.blocks.map(({ action, frequency }) => [action, frequency]));
        const text = [result.headline, ...result.blocks.map(block => block.text)].join(" ");
        const leak = locale === "zh-CN" ? /\b[a-z]{3,}\b/gi : /\b(?:is|the|with|draws|holds|small|large|makes|though|for value|only|board's|toward|behind|above|below|checks|raises|bets|enough|mostly)\b/gi;
        const words = [...text.matchAll(leak)].map(match => match[0]).filter(word => !["SPR", "ReysonAI"].includes(word));
        assert.deepEqual(words, [], `${locale} ${board} ${hand}: ${text}`);
        count++;
      }
    }
  }
  assert.equal(count, 234);
});
