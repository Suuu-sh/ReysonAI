import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootPath = fileURLToPath(new URL("..", import.meta.url));
const bundleDirectory = mkdtempSync(join(tmpdir(), "reysonai-profile-dialog-"));
test.after(() => rmSync(bundleDirectory, { recursive: true, force: true }));

const bundle = await build({
  stdin: { contents: 'export { FlopCardDialog } from "./src/estimated/PostflopTrial.tsx";', resolveDir: rootPath, loader: "tsx" },
  bundle: true, write: false, platform: "node", format: "esm", jsx: "automatic",
  external: ["react", "react-dom", "@phosphor-icons/react"],
  loader: { ".css": "empty", ".png": "dataurl", ".webp": "dataurl" },
  plugins: [{ name: "stable-preflop-dataset-paths", setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)datasets\.ts$/ }, args => ({
      path: pathToFileURL(args.path.startsWith("/") ? args.path : join(args.resolveDir, args.path)).href, external: true,
    }));
  } }],
});
const code = bundle.outputFiles[0].text.replace(/from "(react(?:\/[^\"]+)?|react-dom(?:\/[^\"]+)?|@phosphor-icons\/react)"/g,
  (_, specifier) => `from "${import.meta.resolve(specifier)}"`);
const modulePath = join(bundleDirectory, "profile-dialog.mjs");
writeFileSync(modulePath, code);
const { FlopCardDialog } = await import(pathToFileURL(modulePath).href);

async function domTest(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://reysonai.test/analyze/ranges", pretendToBeVisual: true });
  const descriptors = new Map();
  for (const name of ["window", "document", "Node", "Element", "HTMLElement", "MutationObserver", "localStorage", "IS_REACT_ACT_ENVIRONMENT"]) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true,
      value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const root = createRoot(document.getElementById("root"));
  try { await run({ root }); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
}

function dialogProps({ cards, profile = "standard", seat = "oop", locale = "en", onApply }) {
  window.localStorage.setItem("reysonai:locale:v1", locale);
  return { cards, profile, seat, positions: { ip: "BTN", oop: "HJ" }, onClose() {},
    onApply: onApply ?? ((...values) => { window.__flopApply = values; }) };
}
const click = async element => { assert.ok(element, "expected control exists"); await act(async () => element.click()); };
const findTextButton = (selector, text) => [...document.querySelectorAll(selector)].find(button => button.textContent.includes(text));
const selectedCards = () => [...document.querySelectorAll(".street-card-option[aria-pressed='true']")]
  .map(button => button.getAttribute("aria-label")).sort();

test("first flop selection keeps the board draft while applying profile and seat, then commits together", async () => {
  await domTest(async ({ root }) => {
    await act(async () => root.render(React.createElement(FlopCardDialog, dialogProps({ cards: ["", "", ""] }))));
    for (const card of ["A♠", "K♦", "7♣"]) {
      await click([...document.querySelectorAll(".street-card-option")].find(button => button.getAttribute("aria-label") === card));
    }
    assert.deepEqual(selectedCards(), ["7♣", "A♠", "K♦"]);
    await click(document.querySelector(".flop-advanced-button"));
    await click(findTextButton(".opponent-profile-option", "Tight-passive (NIT)"));
    await click([...document.querySelectorAll(".opponent-seat-option")].find(button => button.textContent.includes("BTN")));
    await click(document.querySelector(".opponent-settings-actions .mode-primary"));

    assert.ok(document.querySelector(".postflop-card-dialog"), "outer flop dialog remains open until Use flop");
    assert.equal(document.querySelector(".opponent-settings-dialog"), null, "only the nested settings dialog closes");
    assert.deepEqual(selectedCards(), ["7♣", "A♠", "K♦"], "draft board survives profile changes");
    assert.match(document.querySelector(".flop-opponent-summary").textContent, /Tight-passive.*BTN/);

    await click(document.querySelector(".flop-apply-button"));
    assert.deepEqual(window.__flopApply, [["As", "Kd", "7c"], "ip", "nit"]);
  });
});

test("editing an existing flop preserves edited cards through advanced settings and Use flop", async () => {
  await domTest(async ({ root }) => {
    await act(async () => root.render(React.createElement(FlopCardDialog, dialogProps({
      cards: ["As", "Kd", "7c"], profile: "nit", seat: "ip",
    }))));
    await click([...document.querySelectorAll(".flop-card-slots button")].find(button => button.getAttribute("aria-label") === "Remove K♦ from flop"));
    await click([...document.querySelectorAll(".street-card-option")].find(button => button.getAttribute("aria-label") === "Q♥"));
    assert.deepEqual(selectedCards(), ["7♣", "A♠", "Q♥"]);

    await click(document.querySelector(".flop-advanced-button"));
    await click(findTextButton(".opponent-profile-option", "Calling station"));
    await click([...document.querySelectorAll(".opponent-seat-option")].find(button => button.textContent.includes("HJ")));
    await click(document.querySelector(".opponent-settings-actions .mode-primary"));
    assert.ok(document.querySelector(".postflop-card-dialog"));
    assert.deepEqual(selectedCards(), ["7♣", "A♠", "Q♥"]);

    await click(document.querySelector(".flop-apply-button"));
    assert.deepEqual(window.__flopApply, [["As", "Qh", "7c"], "oop", "station"]);
  });
});

test("expanded opponent settings show translated profile controls in Simplified Chinese and Spanish", async () => {
  const expected = {
    "zh-CN": ["对手", "哪位玩家是对手？", "对手类型", "有位置", "无位置",
      "没有指定对手类型。使用标准 AI 策略。", "假设对手具有某种类型。AI 会调整决策来利用其倾向。"],
    es: ["Rival", "¿Qué jugador es el rival?", "Tipo de rival", "Con posición", "Fuera de posición",
      "Sin un tipo de rival específico. Usa la estrategia de IA estándar.", "Supón un tipo de rival. La IA ajusta sus decisiones para aprovecharlo."],
  };
  for (const [locale, phrases] of Object.entries(expected)) {
    await domTest(async ({ root }) => {
      await act(async () => root.render(React.createElement(FlopCardDialog, dialogProps({ cards: ["As", "Kd", "7c"], locale }))));
      await click(document.querySelector(".flop-advanced-button"));
      await click(findTextButton(".opponent-profile-option", locale === "zh-CN" ? "紧手被动型" : "Tight-pasivo"));
      const text = document.querySelector(".postflop-card-dialog").textContent;
      for (const phrase of phrases) assert.ok(text.includes(phrase), `${locale} missing ${phrase}`);
    });
  }
});
