import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

const COLLAPSE_KEY = "reysonai.sidebar.collapsed";
const savedGlobals = new Map();
const globalNames = ["window", "document", "Node", "Element", "HTMLElement", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"];
let dom, server, Sidebar;

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://reysonai.test/app", pretendToBeVisual: true });
  for (const name of globalNames) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  ({ Sidebar } = await server.ssrLoadModule("/src/components/layout.tsx"));
});

after(async () => {
  await server?.close();
  dom?.window.close();
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

test("collapsed sidebar stays collapsed on pointer entry and uses the persistent bottom toggle", async () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.app-sidebar\.is-collapsed \{ flex-basis: 64px;[^}]*gap: 22px; padding: 14px 7px 12px;/);
  assert.doesNotMatch(styles, /is-hover-expanded/);
  assert.match(styles, /@media \(max-width: 650px\) \{\s*\.app-sidebar, \.app-sidebar\.is-collapsed, \.sidebar-backdrop \{ display: none; \}/);
  let fineHover = true;
  dom.window.matchMedia = query => ({
    matches: query.includes("(hover: hover)") ? fineHover : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
  dom.window.localStorage.setItem(COLLAPSE_KEY, "1");
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(Sidebar, { activeSection: "レンジ分析", onSectionChange() {} })));
    const sidebar = container.querySelector(".app-sidebar");
    const navigation = container.querySelector("#main-navigation");
    const toggle = container.querySelector(".sidebar-toggle");
    assert.ok(sidebar && navigation && toggle);
    assert.equal(container.querySelectorAll(".mobile-tab-bar button").length, 5, "mobile bottom tabs remain in place");
    assert.ok(sidebar.classList.contains("is-collapsed"));
    assert.equal(sidebar.classList.contains("is-hover-expanded"), false);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.match(toggle.getAttribute("aria-label"), /Expand sidebar|サイドバーを展開/);
    assert.equal(toggle.title, toggle.getAttribute("aria-label"));
    assert.equal(toggle.nextElementSibling, container.querySelector(".account-menu, .header-meta"), "persistent toggle stays immediately above the account area");
    assert.equal(navigation.compareDocumentPosition(toggle) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING);

    const pointer = async (type, pointerType) => act(async () => {
      const event = new dom.window.Event(type, { bubbles: true });
      Object.defineProperty(event, "pointerType", { value: pointerType });
      sidebar.dispatchEvent(event);
    });

    await pointer("pointerover", "mouse");
    assert.equal(sidebar.classList.contains("is-hover-expanded"), false, "mouse pointer entry never expands the sidebar");
    assert.equal(dom.window.localStorage.getItem(COLLAPSE_KEY), "1", "pointer entry preserves the saved collapsed preference");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    await pointer("pointerout", "mouse");
    await pointer("pointerover", "touch");
    assert.equal(sidebar.classList.contains("is-hover-expanded"), false, "touch pointer entry also leaves it collapsed");
    await pointer("pointerout", "touch");

    await pointer("pointerover", "mouse");
    await act(async () => toggle.click());
    assert.equal(dom.window.localStorage.getItem(COLLAPSE_KEY), "0", "manual toggle expands and persists the choice");
    assert.equal(sidebar.classList.contains("is-collapsed"), false);
    assert.equal(sidebar.classList.contains("is-hover-expanded"), false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    await pointer("pointerout", "mouse");
    assert.equal(sidebar.classList.contains("is-collapsed"), false, "pointer leave keeps the manually expanded preference");
    assert.equal(dom.window.localStorage.getItem(COLLAPSE_KEY), "0");

    await act(async () => toggle.click());
    assert.equal(dom.window.localStorage.getItem(COLLAPSE_KEY), "1", "manual toggle persists collapse");
    assert.equal(sidebar.classList.contains("is-collapsed"), true);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.match(toggle.getAttribute("aria-label"), /Expand sidebar|サイドバーを展開/);
    await act(async () => toggle.click());
    assert.equal(sidebar.classList.contains("is-collapsed"), false);
    assert.equal(dom.window.localStorage.getItem(COLLAPSE_KEY), "0");
  } finally {
    await act(async () => root.unmount());
  }

  fineHover = false;
  dom.window.localStorage.setItem(COLLAPSE_KEY, "1");
  const secondRoot = createRoot(container);
  try {
    await act(async () => secondRoot.render(createElement(Sidebar, { activeSection: "レンジ分析", onSectionChange() {} })));
    const sidebar = container.querySelector(".app-sidebar");
    const event = new dom.window.Event("pointerover", { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    await act(async () => sidebar.dispatchEvent(event));
    assert.equal(sidebar.classList.contains("is-hover-expanded"), false, "devices without fine hover do not expand on pointer entry");
    assert.equal(dom.window.localStorage.getItem(COLLAPSE_KEY), "1");
  } finally {
    await act(async () => secondRoot.unmount());
  }
});
