import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import { color, pct } from "../src/components/action-format.ts";
import { LOCALE_KEY } from "../src/locale.ts";
import { displayModeKey } from "../src/profile.ts";

const saved = JSON.parse(readFileSync(new URL("../src/gto/benchmark-flop.json", import.meta.url), "utf8"));
let dom, server, GtoRangeView;
const globals = new Map();
before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://reysonai.test/app" });
  for (const name of ["window", "document", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  window.HTMLElement.prototype.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false });
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  ({ GtoRangeView } = await server.ssrLoadModule("/src/gto/GtoRangeView.tsx"));
});
after(async () => {
  await server?.close();
  dom?.window.close();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

const cells = () => [...document.querySelectorAll(".matrix button")];
const cell = hand => cells().find(button => button.querySelector("strong").textContent === hand);
const segments = hand => [...cell(hand).querySelectorAll(".cell-fill > span")];
const expectedColor = action => { const element = document.createElement("span"); element.style.background = color(action); return element.style.background; };
const expectedWidth = frequency => { const element = document.createElement("span"); element.style.width = pct(frequency); return element.style.width; };
const click = async element => { assert.ok(element); await act(async () => element.click()); };
async function withView(mode, run, locale = "en") {
  window.localStorage.clear();
  window.localStorage.setItem(LOCALE_KEY, locale);
  if (mode !== null) window.localStorage.setItem(displayModeKey, mode);
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(GtoRangeView)));
    assert.equal(cells().length, 169);
    await run();
  } finally { await act(async () => root.unmount()); }
}
async function forEachSavedNode(run) {
  const selectors = [...document.querySelectorAll(".gto-node-selector button")];
  for (const [index, node] of saved.nodes.entries()) {
    await click(selectors[index]);
    assert.equal(selectors[index].getAttribute("aria-pressed"), "true");
    await run(node);
  }
}

test("GTO standard renders saved mixes with Bet before Check in every node and detail", async () => {
  await withView("standard", async () => {
    await forEachSavedNode(async node => {
      for (const entry of node.classes) {
        assert.equal(cell(entry.handClass).disabled, false);
        const actions = ["bet", "check"].filter(action => entry.frequencies[action] > 0);
        assert.deepEqual(segments(entry.handClass).map(segment => [segment.style.width, segment.style.background]),
          actions.map(action => [expectedWidth(entry.frequencies[action]), expectedColor(action)]), `${node.id} ${entry.handClass}`);
      }
      assert.deepEqual([...document.querySelectorAll(".legend > span")].map(item => item.textContent), ["Bet 2.75 BB (50% pot)", "Check"]);
      const entry = node.classes.find(item => item.frequencies.bet > 0.1 && item.frequencies.check > 0.1);
      await click(cell(entry.handClass));
      assert.deepEqual([...document.querySelectorAll(".gto-detail .bar-row")].map(row => row.textContent),
        [`Bet 2.75 BB (50% pot)${pct(entry.frequencies.bet)}`, `Check${pct(entry.frequencies.check)}`]);
      assert.deepEqual([...document.querySelectorAll(".gto-combo-list thead th")].map(item => item.textContent), ["Combo", "Bet 2.75 BB (50% pot)", "Check"]);
      const comboRows = node.combos.filter(combo => combo.handClass === entry.handClass && combo.reachWeight > 0).sort((a, b) => a.combo.localeCompare(b.combo));
      assert.deepEqual([...document.querySelectorAll(".gto-combo-list tbody tr")].map(row => [...row.children].map(item => item.textContent)),
        comboRows.map(combo => [combo.combo, pct(combo.frequencies.bet), pct(combo.frequencies.check)]));
    });
    assert.match(document.querySelector(".gto-matrix-note").textContent, /action frequencies/);
  });
});

test("GTO honors the persisted Simple setting while preserving saved hand details and unavailable cells", async () => {
  await withView("simple", async () => {
    await forEachSavedNode(async node => {
      for (const entry of node.classes) {
        const dominant = entry.frequencies.bet >= entry.frequencies.check ? "bet" : "check";
        assert.deepEqual(segments(entry.handClass).map(segment => [segment.style.width, segment.style.background]), [["100%", expectedColor(dominant)]], `${node.id} ${entry.handClass}`);
      }
      const available = new Set(node.classes.map(entry => entry.handClass));
      for (const button of cells().filter(button => !available.has(button.querySelector("strong").textContent))) {
        assert.equal(button.disabled, true);
        assert.match(button.className, /unreachable-hand/);
        assert.equal(button.querySelector(".cell-fill"), null);
      }
      const entry = node.classes.find(item => item.frequencies.bet > 0.1 && item.frequencies.check > 0.1);
      await click(cell(entry.handClass));
      assert.equal(document.querySelectorAll(".gto-detail .bar-row").length, 2);
      assert.equal(document.querySelectorAll(".gto-combo-list tbody tr").length, entry.comboCount);
    });
    assert.match(document.querySelector(".gto-matrix-note").textContent, /main action/);
    assert.match(document.querySelector(".gto-facts").textContent, /Qs Jh 2h/);
    assert.equal(window.localStorage.getItem(displayModeKey), "simple");
  });
});

test("missing or unrecognized display settings retain Standard and remounting reloads Settings", async () => {
  for (const mode of [null, "invalid", "standard", "simple", "standard"]) {
    await withView(mode, async () => {
      const entry = saved.nodes[0].classes.find(item => item.frequencies.bet > 0.1 && item.frequencies.check > 0.1);
      assert.equal(segments(entry.handClass).length, mode === "simple" ? 1 : 2);
    });
  }
});

test("Settings buttons persist AI/GTO and Simple, and the source event switches the real workspace", async () => {
  const { RangeWorkspace } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.tsx");
  const { AccountPage } = await server.ssrLoadModule("/src/account/AccountPage.tsx");
  const { RANGE_SOURCE_CHANGED } = await server.ssrLoadModule("/src/account/preferences.ts");
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(LOCALE_KEY, "en");
  window.localStorage.setItem(displayModeKey, "standard");
  const historyKey = "reysonai.trainer.history.v1";
  const history = '[{"hand":"AA","source":"ai"}]';
  window.localStorage.setItem(historyKey, history);
  const settingsContainer = document.createElement("div");
  document.body.append(settingsContainer);
  const settingsRoot = createRoot(settingsContainer);
  const rangeRoot = createRoot(document.getElementById("root"));
  const profile = { nickname: "Saved learner", level: "intermediate", updatedAt: "2026-10-14" };
  let events = 0;
  const sourceChanged = () => events++;
  window.addEventListener(RANGE_SOURCE_CHANGED, sourceChanged);
  const choice = (group, label) => [...settingsContainer.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] button`)].find(button => button.querySelector("strong").textContent === label);
  try {
    await act(async () => {
      settingsRoot.render(createElement(AccountPage, { profile, tab: "appearance", onSectionChange() {}, onProfileSaved() {} }));
      rangeRoot.render(createElement(RangeWorkspace));
    });
    assert.equal(document.querySelector(".gto-range-page"), null, "fresh workspace starts on AI");
    assert.equal(choice("Calculation version", "AI").getAttribute("aria-checked"), "true");
    await click(choice("Calculation version", "GTO"));
    assert.equal(events, 1);
    assert.ok(document.querySelector(".gto-range-page"));
    assert.equal(JSON.parse(window.localStorage.getItem("reysonai:appearance:v1")).rangeSource, "gto");
    const entry = saved.nodes[0].classes.find(item => item.frequencies.bet > 0.1 && item.frequencies.check > 0.1);
    assert.equal(segments(entry.handClass).length, 2);
    await click(choice("Range display", "Simple"));
    assert.equal(window.localStorage.getItem(displayModeKey), "simple");
    assert.equal(segments(entry.handClass).length, 2, "Settings applies display mode when the range next opens");
    await click(choice("Calculation version", "AI"));
    assert.equal(events, 2);
    assert.equal(document.querySelector(".gto-range-page"), null);
    await click(choice("Calculation version", "GTO"));
    assert.equal(events, 3);
    assert.equal(segments(entry.handClass).length, 1, "returning to GTO reads the saved Simple choice");
    assert.match(document.querySelector(".gto-matrix-note").textContent, /main action/);
    assert.equal(window.localStorage.getItem(historyKey), history);
  } finally {
    window.removeEventListener(RANGE_SOURCE_CHANGED, sourceChanged);
    await act(async () => { settingsRoot.unmount(); rangeRoot.unmount(); });
    settingsContainer.remove();
  }
});
