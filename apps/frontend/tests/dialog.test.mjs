import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { transform } from "esbuild";
import { JSDOM } from "jsdom";

const result = await transform(readFileSync(new URL("../src/components/Dialog.tsx", import.meta.url), "utf8"), {
  loader: "tsx", jsx: "automatic", format: "esm", target: "esnext",
});
const source = result.code.replace(/from "(react(?:\/jsx-runtime)?)"/g, (_, name) => `from "${import.meta.resolve(name)}"`);
const { Dialog } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("shared dialog contains keyboard focus, dismisses only the backdrop and restores its trigger", async () => {
  const dom = new JSDOM('<button id="trigger">Open</button><div id="root"></div>', { url: "https://app.reysonai.com" });
  const saved = Object.fromEntries(["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root"));
  const trigger = document.getElementById("trigger");
  trigger.focus();
  let oldCalls = 0, newCalls = 0;
  const content = [React.createElement("h2", { id: "title", key: "title" }, "Choose"),
    React.createElement("input", { key: "hidden-input", type: "hidden" }),
    React.createElement("button", { key: "first", id: "first" }, "First"),
    React.createElement("button", { key: "disabled", disabled: true }, "Disabled"),
    React.createElement("div", { key: "hidden", hidden: true }, React.createElement("button", null, "Hidden")),
    React.createElement("button", { key: "last", id: "last" }, "Last")];
  const render = onClose => React.createElement(React.StrictMode, null, React.createElement(Dialog, { labelledBy: "title", className: "example", onClose }, content));
  const key = (name, shiftKey = false) => {
    const event = new dom.window.KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event;
  };
  try {
    await act(async () => root.render(render(() => oldCalls++)));
    const dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(dialog.getAttribute("aria-labelledby"), "title");
    assert.equal(dialog.className, "modal example");
    assert.equal(document.activeElement, dialog);
    assert.equal(key("Tab").defaultPrevented, true);
    assert.equal(document.activeElement.id, "first");
    key("Tab", true);
    assert.equal(document.activeElement.id, "last");
    key("Tab");
    assert.equal(document.activeElement.id, "first");
    dialog.focus(); key("Tab", true);
    assert.equal(document.activeElement.id, "last");
    await act(async () => root.render(render(() => newCalls++)));
    assert.equal(key("Escape").defaultPrevented, true);
    assert.equal(oldCalls, 0); assert.equal(newCalls, 1);
    dialog.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(newCalls, 1);
    document.querySelector(".modal-backdrop").dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(newCalls, 2);
    await act(async () => root.unmount());
    assert.equal(document.activeElement, trigger);
    key("Escape"); assert.equal(newCalls, 2);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
