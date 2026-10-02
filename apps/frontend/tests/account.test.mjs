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
  assert.match(html, /アカウントを作成/); // sign-in stays a disabled, planned control
});

test("subscription shows the provisional Plus plan from the site pricing and no live purchase", () => {
  const html = renderToStaticMarkup(createElement(AccountPage, { profile, tab: "subscription", onSectionChange() {}, onProfileSaved() {} }));
  assert.match(html, /Free/);
  assert.match(html, /¥680/);
  assert.match(html, /仮案|provisional/);
  assert.doesNotMatch(html, /<button[^>]*class="account-primary"(?![^>]*disabled)/);
});

test("appearance preferences normalise unknown values and log-out offers keeping practice data", () => {
  assert.deepEqual(prefs.loadAppearance(), { cards: "four", motion: "standard" });
  const html = renderToStaticMarkup(createElement(LogoutDialog, { onCancel() {}, onConfirm() {} }));
  assert.match(html, /練習データ（ドリル・セッション・回答履歴）も削除する/);
  assert.doesNotMatch(html, /checked=""/);
});
