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
import { defaultFormat } from "../src/estimated/game-formats.ts";
import { DEFAULT_PROFILE } from "../src/estimated/table-profile.ts";

const saved = JSON.parse(readFileSync(new URL("../src/gto/benchmark-flop.json", import.meta.url), "utf8"));
let dom, server, GtoRangeView, viewRoot, activeMode, selectedHand, selectedNode, renderDirect;
const globals = new Map();
before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://reysonai.test/app" });
  for (const name of ["window", "document", "Event", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
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
  activeMode = mode === "simple" ? "simple" : "standard";
  const root = createRoot(document.getElementById("root")); viewRoot = root;
  selectedHand = null; selectedNode = "bb-root";
  renderDirect = () => root.render(createElement(GtoRangeView, { available: true, nodeId: selectedNode, selected: selectedHand,
    onSelect(hand) { selectedHand = hand; renderDirect(); }, displayMode: activeMode, workspaceRake: "5% · cap 3BB" }));
  try {
    await act(async () => renderDirect());
    assert.equal(cells().length, 169);
    await run();
  } finally { await act(async () => root.unmount()); viewRoot = null; renderDirect = null; }
}
async function forEachSavedNode(run) {
  for (const node of saved.nodes) {
    await act(async () => { selectedNode = node.id; selectedHand = null; renderDirect(); });
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
      assert.ok(document.querySelector(".postflop-range-layout .matrix-panel"), "GTO reuses the AI responsive postflop grid");
      assert.ok(document.querySelector(".postflop-side .postflop-range-summary"), "GTO shows the shared entire-range summary");
      assert.ok(document.querySelector(".postflop-side .postflop-hand-detail"), "GTO shows the shared hand-detail panel");
      assert.ok(document.querySelector(".postflop-hand-detail .postflop-suit-picker"), "the shared combo picker appears in the hand detail");
      assert.ok(document.querySelector(".postflop-hand-detail .postflop-suit-picker").compareDocumentPosition(document.querySelector(".postflop-hand-detail .bar-row")) & window.Node.DOCUMENT_POSITION_FOLLOWING,
        "combo picker precedes action frequencies, matching AI postflop details");
      assert.deepEqual([...document.querySelectorAll(".postflop-hand-detail .bar-row")].map(row => row.textContent),
        [`Bet 2.75 BB (50% pot)${pct(entry.frequencies.bet)}`, `Check${pct(entry.frequencies.check)}`]);
      const comboRows = node.combos.filter(combo => combo.handClass === entry.handClass && combo.reachWeight > 0).sort((a, b) => a.combo.localeCompare(b.combo));
      assert.equal(document.querySelectorAll(".postflop-suit-grid button").length, comboRows.length, "GTO uses the shared suit-combination picker");
    });
    assert.match(document.querySelector(".gto-scope").textContent, /action frequencies/i);
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
      assert.equal(document.querySelectorAll(".postflop-hand-detail .bar-row").length, 2);
      assert.equal(document.querySelectorAll(".postflop-suit-grid button").length, entry.comboCount);
    });
    assert.match(document.querySelector(".gto-scope").textContent, /main action/i);
    assert.match(document.querySelector(".gto-scope").textContent, /Qs Jh 2h/);
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
  const { encodeRangeUrl, defaultRangeSelection } = await server.ssrLoadModule("/src/estimated/range-url.ts");
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
  window.history.replaceState({}, "", encodeRangeUrl({ ...defaultRangeSelection, selected: "AA" }));
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
    const sharedActionPath = document.querySelector(".action-path");
    assert.equal(cell("AA").getAttribute("aria-pressed"), "true", "URL-seeded hand selection is active before switching");
    await click(choice("Calculation version", "GTO"));
    assert.equal(document.querySelector(".action-path"), sharedActionPath, "source toggle preserves the same action-path DOM node");
    assert.equal(events, 1);
    assert.ok(document.querySelector(".estimate-settings"));
    assert.equal(JSON.parse(window.localStorage.getItem("reysonai:appearance:v1")).rangeSource, "gto");
    assert.ok(document.querySelector(".estimate-settings"));
    assert.ok(document.querySelector(".settings-body") || document.querySelector(".settings-toggle"));
    assert.equal(document.querySelector(".gto-node-selector"), null, "decision node follows the shared action path");
    assert.equal(document.querySelector(".gto-range-page"), null, "GTO does not replace the workspace shell");
    assert.match(document.body.textContent, /No saved GTO data for this selection/);
    const selectorsBefore = document.querySelectorAll(".action-path").length;
    assert.ok(document.querySelector(".missing-range-panel"));
    await click(choice("Range display", "Simple"));
    assert.equal(window.localStorage.getItem(displayModeKey), "simple");
    assert.equal(document.querySelectorAll(".action-path").length, selectorsBefore, "source switching keeps the existing action-path layout mounted");
    await click(choice("Calculation version", "AI"));
    assert.equal(events, 2);
    assert.equal(document.querySelector(".action-path"), sharedActionPath);
    assert.equal(cell("AA").getAttribute("aria-pressed"), "true", "selected AI hand survives source changes");
    assert.equal(document.querySelector(".gto-range-content"), null);
    await click(choice("Calculation version", "GTO"));
    assert.equal(events, 3);
    assert.ok(document.querySelector(".estimate-settings"));
    assert.ok(document.querySelector(".missing-range-panel"), "unsupported GTO state does not fall back to AI data");
    assert.equal(window.localStorage.getItem(historyKey), history);
  } finally {
    window.removeEventListener(RANGE_SOURCE_CHANGED, sourceChanged);
    await act(async () => { settingsRoot.unmount(); rangeRoot.unmount(); });
    settingsContainer.remove();
  }
});


test("RangeWorkspace derives both saved nodes from the real URL action path and gates mismatches", async () => {
  const { RangeWorkspace } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.tsx");
  const { encodeRangeUrl, defaultRangeSelection } = await server.ssrLoadModule("/src/estimated/range-url.ts");
  const { saveRangeSource } = await server.ssrLoadModule("/src/account/preferences.ts");
  const buildUrl = overrides => encodeRangeUrl({
    ...defaultRangeSelection, rangeType: "response", opener: "BTN", hero: "BB", callers: ["BB"], foldedHero: true,
    format: { ...defaultFormat }, tableProfile: { ...DEFAULT_PROFILE }, opponentProfile: "standard",
    showFlop: true, flopCards: ["Qs", "Jh", "2h"], flopActions: [], turnCard: "", turnActions: [], riverCard: "", riverActions: [],
    ...overrides,
  });
  const scenarios = [
    { node: saved.nodes[0], actions: [], title: /BB · first to act/ },
    { node: saved.nodes[1], actions: ["check"], title: /BTN · after BB checks/ },
  ];
  const { AccountPage } = await server.ssrLoadModule("/src/account/AccountPage.tsx");
  const settingsContainer = document.createElement("div");
  document.body.append(settingsContainer);
  const settingsRoot = createRoot(settingsContainer);
  let rangeRoot;
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(LOCALE_KEY, "en");
    for (const scenario of scenarios) {
      rangeRoot = createRoot(document.getElementById("root"));
      window.history.replaceState({}, "", buildUrl({ flopActions: scenario.actions }));
      saveRangeSource("gto");
      await act(async () => {
        settingsRoot.render(createElement(AccountPage, { tab: "appearance", onSectionChange() {}, onProfileSaved() {} }));
        rangeRoot.render(createElement(RangeWorkspace));
      });
      assert.match(document.querySelector(".matrix-panel h2").textContent, scenario.title);
      const entry = scenario.node.classes.find(item => item.frequencies.bet > 0.1 && item.frequencies.check > 0.1);
      assert.deepEqual(segments(entry.handClass).map(segment => segment.style.width), [expectedWidth(entry.frequencies.bet), expectedWidth(entry.frequencies.check)]);
      assert.ok(document.querySelectorAll(".action-path .action-seat").length > 0, "shared action path is rendered");
      assert.deepEqual([...document.querySelectorAll(".action-seat-flop .action-seat-position")].map(button => button.textContent),
        scenario.actions.length ? ["BB", "BTN"] : ["BB"], "GTO action path shows only the saved decision node(s)");
      assert.equal(document.querySelector(".street-card-dialog"), null, "saved BTN-after-check node does not auto-open turn selection");
      if (scenario.actions.length) {
        assert.ok([...document.querySelectorAll(".action-path button.chosen")].some(button => button.textContent === "Check"),
          "the saved node matches a Check action in the real action strip");
        const activeBlock = document.querySelector(".action-seat-flop.active");
        await click(activeBlock.querySelector(".action-seat-select-trigger"));
        await click([...document.querySelectorAll('[role="menu"] button')].find(button => button.textContent === "Check"));
        assert.match(document.body.textContent, /No saved GTO data for this selection/,
          "a second check is outside the fixed benchmark and never advances to fabricated data");
        const historyNode = [...document.querySelectorAll(".action-seat-flop .action-seat-position")].at(-1);
        await click(historyNode);
        assert.match(document.querySelector(".matrix-panel h2").textContent, /BTN · after BB checks/,
          "rewinding the unsupported second check returns to the saved BTN node");
      } else {
        const rootBlock = document.querySelector(".action-seat-flop.active");
        await click(rootBlock.querySelector(".action-seat-select-trigger"));
        await click([...document.querySelectorAll('[role="menu"] button')].find(button => button.textContent.includes("Bet 2.75 BB")));
        assert.match(document.body.textContent, /No saved GTO data for this selection/,
          "an unsaved bet shows unavailable data while preserving its action history");
        assert.deepEqual([...document.querySelectorAll(".action-seat-flop .action-seat-position")].map(button => button.textContent), ["BB"],
          "unsupported action history remains in the shared action strip");
        await click(document.querySelector(".action-seat-flop .action-seat-position"));
        assert.match(document.querySelector(".matrix-panel h2").textContent, /BB · first to act/,
          "rewinding an unsupported bet returns to the saved BB root");
      }
      assert.equal(document.querySelector(".gto-node-selector"), null);
      assert.equal(document.querySelector(".gto-range-page"), null);
      await act(async () => rangeRoot.unmount());
      rangeRoot = null;
    }
    const unsupported = [
      buildUrl({ flopCards: ["As", "Kh", "7d"] }),
      buildUrl({ flopActions: ["check"], turnCard: "2c", turnActions: ["check"] }),
      buildUrl({ opener: "CO", callers: ["BB"] }),
      buildUrl({ opponentProfile: "nit" }),
      buildUrl({ tableProfile: { call: "low", three_bet: "normal" } }),
      buildUrl({ format: { ...defaultFormat, game: "mtt" } }),
      buildUrl({ format: { ...defaultFormat, table: "9max" } }),
      buildUrl({ format: { ...defaultFormat, stack: 40 } }),
      buildUrl({ format: { ...defaultFormat, stack: 200 } }),
      buildUrl({ format: { ...defaultFormat, openSize: 2 } }),
      buildUrl({ format: { ...defaultFormat, openSize: 3 } }),
      buildUrl({ format: { ...defaultFormat, ante: true } }),
    ];
    for (const [index, url] of unsupported.entries()) {
      rangeRoot = createRoot(document.getElementById("root"));
      window.history.replaceState({}, "", url);
      await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
      assert.match(document.body.textContent, /No saved GTO data for this selection/, `unsupported scenario ${index}`);
      assert.equal(document.querySelector(".matrix-panel"), null, "unsupported GTO selection never falls back to AI or another saved node");
      await act(async () => rangeRoot.unmount());
      rangeRoot = null;
    }

    rangeRoot = createRoot(document.getElementById("root"));
    window.history.replaceState({}, "", buildUrl({ flopActions: [] }));
    saveRangeSource("gto");
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;
    window.history.replaceState({}, "", "/app/settings");
    window.history.replaceState({}, "", "/analyze/ranges");
    rangeRoot = createRoot(document.getElementById("root"));
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    assert.match(document.querySelector(".matrix-panel h2").textContent, /BB · first to act/,
      "returning from settings restores the prior saved board and GTO decision from the session URL");
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;

    window.sessionStorage.clear();
    window.history.replaceState({}, "", buildUrl({ flopActions: ["check"] }));
    saveRangeSource("gto");
    rangeRoot = createRoot(document.getElementById("root"));
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    assert.match(document.querySelector(".matrix-panel h2").textContent, /BTN · after BB checks/);
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;
    window.history.replaceState({}, "", "/app/settings");
    saveRangeSource("ai");
    window.history.replaceState({}, "", "/analyze/ranges");
    rangeRoot = createRoot(document.getElementById("root"));
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    assert.deepEqual([...document.querySelectorAll('.action-seat[class*="action-seat-flop"] .action-seat-position')].map(button => button.textContent), ["BB", "BTN"],
      "GTO BTN-after-BB-check maps to the AI's implicit BB-check path on a real settings roundtrip");
    assert.equal(document.querySelector(".street-card-dialog"), null, "source change does not advance to or prompt for turn");
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;
    window.history.replaceState({}, "", "/app/settings");
    saveRangeSource("gto");
    window.history.replaceState({}, "", "/analyze/ranges");
    rangeRoot = createRoot(document.getElementById("root"));
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    assert.match(document.querySelector(".matrix-panel h2").textContent, /BTN · after BB checks/,
      "the AI implicit-check node maps back to the saved GTO BTN node");
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;

    window.history.replaceState({}, "", buildUrl({ flopActions: [] }));
    saveRangeSource("gto");
    rangeRoot = createRoot(document.getElementById("root"));
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;
    window.history.replaceState({}, "", "/app/settings");
    saveRangeSource("ai");
    window.history.replaceState({}, "", "/analyze/ranges");
    rangeRoot = createRoot(document.getElementById("root"));
    await act(async () => rangeRoot.render(createElement(RangeWorkspace)));
    assert.deepEqual([...document.querySelectorAll('.action-seat[class*="action-seat-flop"] .action-seat-position')].map(button => button.textContent), ["BB"],
      "GTO BB-root remains the selected actor when AI has no matching BB-root estimate");
    assert.match(document.body.textContent, /No AI estimate for BB's first flop decision/);
    await act(async () => rangeRoot.unmount());
    rangeRoot = null;
  } finally {
    await act(async () => { settingsRoot.unmount(); rangeRoot?.unmount(); });
    settingsContainer.remove();
  }
});

test("unsupported GTO selection shows no saved data without AI fallback", async () => {
  const root = createRoot(document.getElementById("root"));
  try { await act(async () => root.render(createElement(GtoRangeView, { available: false, nodeId: "bb-root", selected: null, onSelect() {}, displayMode: "standard", workspaceRake: "5% · cap 3BB" })));
    assert.match(document.body.textContent, /No saved GTO data for this selection/);
    assert.equal(cells().length, 0);
  } finally { await act(async () => root.unmount()); }
});
