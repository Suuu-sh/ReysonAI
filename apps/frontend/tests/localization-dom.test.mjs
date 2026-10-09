import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import { localizeProductSurface, translateProductCopy } from "../src/i18n.ts";
import { LOCALE_KEY, localized } from "../src/locale.ts";
import { reasonCopy } from "../src/locales/reason-copy.ts";
import { PRESET_DRILLS, displayDrillName } from "../src/trainer/drill-store.ts";

let dom, server, SessionPage, ActionPath;
const savedGlobals = new Map();
const globalNames = ["window", "document", "Node", "NodeFilter", "Element", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"];
before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://reysonai.test/analyze/ranges", pretendToBeVisual: true });
  for (const name of globalNames) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  ({ SessionPage } = await server.ssrLoadModule("/src/trainer/SessionPage.tsx"));
  ({ ActionPath } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.tsx"));
});
after(async () => {
  await server?.close();
  dom?.window.close();
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});
const useLocale = locale => window.localStorage.setItem(LOCALE_KEY, locale);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const click = async element => {
  assert.ok(element, "click target exists");
  await act(async () => { element.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
};

test("every authored Chinese and Spanish value is idempotent, including interpolated copy", () => {
  for (const [index, locale] of ["zh-CN", "es"].entries()) {
    for (const translations of Object.values(reasonCopy)) {
      const target = translations[index];
      assert.equal(translateProductCopy(target, locale), target, `${locale}: ${target}`);
      const interpolated = target.replace(/\{\d+\}/g, "42");
      assert.equal(translateProductCopy(interpolated, locale), interpolated, `${locale}: ${interpolated}`);
      const composite = `${interpolated} · 42`;
      assert.equal(translateProductCopy(composite, locale), composite, `${locale} composite: ${composite}`);
    }
  }
  assert.equal(translateProductCopy("范围分析", "zh-CN"), "范围分析");
  assert.equal(translateProductCopy("个人信息", "zh-CN"), "个人信息");
  assert.equal(translateProductCopy("还没有回答。继续练习即可在此记录手牌。", "zh-CN"), "还没有回答。继续练习即可在此记录手牌。");
  assert.equal(translateProductCopy("3問", "zh-CN"), "3题");
  assert.equal(translateProductCopy("3分", "zh-CN"), "3分");
});

test("legacy trainer JSX fragments still translate without a kana-based guess", () => {
  const expected = {
    en: [" questions · ", " · Grade", " spots · ", "In progress · 3 questions"],
    "zh-CN": ["题 · ", " · 评价", " 局面 · ", "进行中 · 3题"],
    es: [" preguntas · ", " · Evaluación", " situaciones · ", "En curso · 3 preguntas"],
  };
  for (const [locale, translated] of Object.entries(expected)) {
    const fragments = ["問 · ", " · 判定", " 局面 · ", "途中保存 · 3問"];
    assert.deepEqual(fragments.map(fragment => translateProductCopy(fragment, locale)), translated);
    for (const target of translated) assert.equal(translateProductCopy(target, locale), target);
  }
});

test("an unselected cold seat dropdown can choose its saved cold 4bet action", async () => {
  const container = document.getElementById("root");
  container.replaceChildren();
  const root = createRoot(container);
  useLocale("ja");
  const choices = [];
  const blocks = [{ key: "CO", kind: "cold", position: "CO", stack: "92", active: false, chosen: null,
    options: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call 8" }, { action: "raise", label: "Raise 26" }] }];
  await act(async () => root.render(createElement(ActionPath, { expanded: true, blocks, onColdAction: value => choices.push(value) })));
  const trigger = container.querySelector('[aria-label="COのアクションを選択"]');
  assert.ok(trigger);
  await click(trigger);
  const menu = document.body.querySelector('[role="menu"]');
  assert.ok(menu);
  await click([...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent?.includes("Raise 26")));
  assert.deepEqual(choices, [{ position: "CO", action: "raise" }]);
  assert.equal(document.body.querySelector('[role="menu"]'), null);
  await act(async () => root.unmount());
});

test("real DOM scans and MutationObserver replays keep localized Chinese and private text intact", async () => {
  const root = document.getElementById("root");
  root.replaceChildren();
  useLocale("zh-CN");
  const alreadyLocalized = localized("Range Analysis", "レンジ分析");
  const privateName = "Range analysis 日本語 个人信息 回答 分 人 回";
  root.innerHTML = '<h1></h1><button></button><p class="legacy">レンジ分析</p><p class="english">Range analysis</p><div translate="no"><span></span><input/></div>';
  root.querySelector("h1").textContent = alreadyLocalized;
  const button = root.querySelector("button");
  for (const name of ["title", "aria-label"]) button.setAttribute(name, "个人信息");
  const protectedSpan = root.querySelector('[translate="no"] span');
  protectedSpan.textContent = privateName;
  const input = root.querySelector("input");
  input.setAttribute("placeholder", privateName);
  // The supplied observer locale is authoritative even if storage changes.
  useLocale("es");
  let stop = localizeProductSurface(root, "zh-CN");
  await settle();
  assert.equal(root.querySelector("h1").textContent, alreadyLocalized);
  assert.equal(root.querySelector(".legacy").textContent, "范围分析");
  assert.equal(root.querySelector(".english").textContent, "范围分析");
  assert.equal(button.getAttribute("aria-label"), "个人信息");
  const paragraph = document.createElement("p");
  paragraph.textContent = "还没有回答。继续练习即可在此记录手牌。";
  root.append(paragraph);
  button.setAttribute("title", "还没有回答。继续练习即可在此记录手牌。");
  root.querySelector(".legacy").firstChild.nodeValue = "フロップを選択";
  await settle();
  assert.equal(root.querySelector(".legacy").textContent, translateProductCopy("フロップを選択", "zh-CN"));
  assert.equal(paragraph.textContent, "还没有回答。继续练习即可在此记录手牌。");
  const snapshot = root.innerHTML;
  stop(); stop = localizeProductSurface(root, "zh-CN");
  await settle();
  assert.equal(root.innerHTML, snapshot);
  assert.equal(protectedSpan.textContent, privateName);
  assert.equal(input.getAttribute("placeholder"), privateName);
  stop(); root.replaceChildren();
});

test("session listing and clicked details translate stock and review names but preserve custom titles", async () => {
  const session = { id: "test", at: 1000, answered: 1, score: 1, durationMs: 3000, hands: [] };
  const custom = "Range analysis 日本語 个人信息 回答";
  const drills = [{ ...PRESET_DRILLS[0], sessions: [session] }, { id: "mine", name: custom, sessions: [session] }, { ...PRESET_DRILLS[1], name: custom, sessions: [session] }];
  const drafts = {
    [PRESET_DRILLS[3].id]: { drillName: PRESET_DRILLS[3].name, reviewOnly: false, savedAt: 2000, elapsedMs: 100, session: { answered: 0, score: 0, log: [] } },
    review: { drillName: "復習ドリル", reviewOnly: true, savedAt: 3000, elapsedMs: 100, session: { answered: 0, score: 0, log: [] } },
  };
  const original = JSON.stringify({ drills, drafts, session });
  for (const locale of ["en", "ja", "zh-CN", "es"]) {
    useLocale(locale);
    const container = document.getElementById("root");
    const root = createRoot(container);
    await act(async () => root.render(createElement(SessionPage, { drills, reviews: [session], drafts, onResume() {} })));
    const expected = [localized("Review drill", "復習ドリル"), displayDrillName(PRESET_DRILLS[3]), displayDrillName(PRESET_DRILLS[0]), custom, custom, localized("Review drill", "復習ドリル")];
    assert.deepEqual([...container.querySelectorAll(".sessions-row-link")].map(el => el.textContent), expected, locale);
    for (let index = 0; index < expected.length; index++) {
      const open = container.querySelectorAll(".sessions-open")[index];
      assert.ok(open.getAttribute("aria-label").includes(expected[index]));
      await click(container.querySelectorAll(".sessions-row-link")[index]);
      assert.equal(container.querySelector("h1").textContent, expected[index], `${locale} detail ${index}`);
      await click(container.querySelector(".sessions-back"));
    }
    await act(async () => root.unmount());
  }
  assert.equal(JSON.stringify({ drills, drafts, session }), original);
});

test("mobile action menu renders localized labels in its body portal with no root observer", async () => {
  const options = [{ action: "fold", label: "フォールド" }, { action: "call", label: "Call 2.5BB" }, { action: "raise", label: "レイズ 12BB" }];
  const original = JSON.stringify(options);
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  for (const locale of ["en", "ja", "zh-CN", "es"]) {
    useLocale(locale);
    const actions = [];
    const container = document.getElementById("root");
    const root = createRoot(container);
    await act(async () => root.render(createElement(ActionPath, { expanded: true, blocks: [{ key: "BB", kind: "seat", position: "BB", stack: "100BB", active: true, options }], onAct: (...args) => actions.push(args) })));
    const trigger = container.querySelector(".action-seat-select-trigger");
    assert.equal(trigger.textContent, localized("Take action", "アクションを選択"));
    assert.equal(trigger.getAttribute("aria-label"), localized("Choose action for BB", "BBのアクションを選択"));
    await click(trigger);
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu); assert.equal(container.contains(menu), false);
    assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map(el => el.textContent), options.map(option => translateProductCopy(option.label, locale)));
    const close = document.querySelector(".action-seat-select-backdrop");
    assert.equal(close.getAttribute("aria-label"), localized("Close", "閉じる"));
    await click(close);
    assert.equal(document.querySelector('[role="menu"]'), null);
    await click(trigger);
    await click(document.querySelectorAll('[role="menuitem"]')[2]);
    assert.deepEqual(actions, [["BB", "raise"]]);
    assert.equal(document.querySelector('[role="menu"]'), null);
    await act(async () => root.unmount());
  }
  assert.equal(JSON.stringify(options), original);
});
