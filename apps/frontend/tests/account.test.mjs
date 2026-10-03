import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, AccountPage, LogoutDialog, AccountMenu, prefs;

before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ AccountPage, LogoutDialog } = await server.ssrLoadModule("/src/account/AccountPage.tsx"));
  ({ AccountMenu } = await server.ssrLoadModule("/src/account/AccountMenu.tsx"));
  prefs = await server.ssrLoadModule("/src/account/preferences.ts");
});
after(async () => { await server?.close(); });

const profile = { nickname: "Yu", level: "intermediate", updatedAt: "2026-09-27T00:00:00Z" };

test("account menu chip shows the profile and keeps the menu closed until opened", () => {
  const html = renderToStaticMarkup(createElement(AccountMenu, { profile, onNavigate() {}, onLogout() {} }));
  assert.match(html, /class="account-avatar">Y</);
  assert.match(html, /aria-haspopup="menu" aria-expanded="false"/);
  assert.doesNotMatch(html, /account-popover/);
});

test("settings page has account, subscription, appearance and language tabs", () => {
  const html = renderToStaticMarkup(createElement(AccountPage, { profile, tab: "account", onSectionChange() {}, onProfileSaved() {} }));
  for (const label of ["アカウント", "サブスクリプション", "外観", "言語"]) assert.match(html, new RegExp(`</svg>${label}</button>`));
  assert.match(html, /value="Yu"/);
  assert.match(html, /Googleでログイン/); // account creation is gated until the backend is configured
});

test("subscription shows the ¥580 Plus plan without a live purchase", () => {
  const html = renderToStaticMarkup(createElement(AccountPage, { profile, tab: "subscription", onSectionChange() {}, onProfileSaved() {} }));
  assert.match(html, /Free/);
  assert.match(html, /¥580/);
  assert.match(html, /Planned|予定/);
  assert.doesNotMatch(html, /¥680|provisional|仮案/);
  assert.doesNotMatch(html, /<button[^>]*class="account-primary"(?![^>]*disabled)/);
});

test("appearance preferences normalise unknown values and log-out offers keeping practice data", () => {
  assert.deepEqual(prefs.loadAppearance(), { cards: "four", motion: "standard" });
  const html = renderToStaticMarkup(createElement(LogoutDialog, { onCancel() {}, onConfirm() {} }));
  assert.match(html, /練習データ（ドリル・セッション・回答履歴）も削除する/);
  assert.doesNotMatch(html, /checked=""/);
});

function withLocalStorage(run) {
  const previous = globalThis.window;
  const values = new Map();
  const localStorage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  globalThis.window = { localStorage };
  try { run(localStorage); } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("practice export and cleanup preserve profile, appearance and unrelated data", () => {
  withLocalStorage(store => {
    store.setItem("reysonai.trainer.answers", JSON.stringify([{ hand: "AA" }]));
    store.setItem("reysonai.trainer.draft", "legacy draft");
    store.setItem("reysonai:profile:v1", "profile");
    store.setItem("reysonai:appearance:v1", "appearance");
    store.setItem("other-app", "untouched");
    assert.deepEqual(prefs.exportLocalData().data, {
      "reysonai.trainer.answers": [{ hand: "AA" }], "reysonai.trainer.draft": "legacy draft",
    });
    prefs.clearPracticeData();
    assert.deepEqual(prefs.practiceKeys(), []);
    assert.equal(store.getItem("reysonai:profile:v1"), "profile");
    assert.equal(store.getItem("reysonai:appearance:v1"), "appearance");
    assert.equal(store.getItem("other-app"), "untouched");
  });
});

test("appearance and range mode persist with invalid appearance values normalised", () => {
  withLocalStorage(store => {
    prefs.saveAppearance({ cards: "two", motion: "reduce" });
    assert.deepEqual(prefs.loadAppearance(), { cards: "two", motion: "reduce" });
    store.setItem("reysonai:appearance:v1", JSON.stringify({ cards: "bad", motion: "bad" }));
    assert.deepEqual(prefs.loadAppearance(), { cards: "four", motion: "standard" });
    prefs.saveDisplayMode("simple");
    assert.equal(prefs.loadDisplayMode(), "simple");
    prefs.saveDisplayMode("bad");
    assert.equal(prefs.loadDisplayMode(), "standard");
  });
});

test("local logout removes only the profile by default", async () => {
  const { clearProfile } = await server.ssrLoadModule("/src/profile.ts");
  withLocalStorage(store => {
    store.setItem("reysonai:profile:v1", "profile");
    store.setItem("reysonai.trainer.answers", "[]");
    clearProfile();
    assert.equal(store.getItem("reysonai:profile:v1"), null);
    assert.equal(store.getItem("reysonai.trainer.answers"), "[]");
  });
});
