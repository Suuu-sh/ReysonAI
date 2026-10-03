import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
let server, session, locale, AuthPanel;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  session = await server.ssrLoadModule("/src/account/session.ts");
  locale = await server.ssrLoadModule("/src/locale.ts");
  ({ AuthPanel } = await server.ssrLoadModule("/src/account/AuthPanel.tsx"));
});
after(async () => { await server?.close(); });
test("Google-only account UI is gated and integration TSX parses", async () => {
  const html = renderToStaticMarkup(createElement(AuthPanel, {}));
  assert.match(html, /Googleでログイン/);
  assert.match(html, /Google Workspace/);
  assert.match(html, /独自ドメイン/);
  assert.match(html, /class="account-primary" disabled=""/);
  assert.doesNotMatch(html, /type="password"|type="email"|再設定リンク/);
  for (const file of ["ProductApp.tsx", "account/AuthPanel.tsx", "account/AccountPage.tsx", "estimated/RangeWorkspace.tsx"]) {
    await transform(await readFile(new URL(`../src/${file}`, import.meta.url), "utf8"), { loader: "tsx" });
  }
});
test("cookie sessions isolate guests, consent-gate migration, serialize versions and preserve conflict exports", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const values = new Map([["reysonai:profile:v1", JSON.stringify({ nickname: "Guest", level: "beginner" })], ["reysonai.trainer.rank.v1", '{"rating":9999}'], ["reysonai.trainer.review-sessions.v1", "[]"]]);
  let reloads = 0;
  globalThis.window = { location: { hostname: "localhost", hash: "", reload() { reloads++; } }, localStorage: {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  }};
  let enabled = false, identity = { id: "first", email: "first@custom.example", verified: true }, remoteVersion = 2;
  let remote = { "reysonai:profile:v1": { nickname: "Account", level: "intermediate" } };
  let failData = false, conflict = false;
  const posts = [], requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const path = url.split("/").at(-1);
    if (!enabled) return Response.json({ error: "accounts_not_enabled" }, { status: 503 });
    if (path === "session") return Response.json({ user: identity });
    if (path === "logout") { identity = null; return Response.json({ ok: true }); }
    if (url.endsWith("google/start")) return Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
    if (path === "data" && options.method !== "POST") return failData ? Response.json({ error: "unavailable" }, { status: 500 }) : Response.json({ data: remote, version: remoteVersion });
    const body = JSON.parse(options.body); posts.push(body);
    if (conflict) return Response.json({ error: "data_conflict" }, { status: 409 });
    assert.equal(body.version, remoteVersion);
    remote = body.data; remoteVersion++;
    return Response.json({ ok: true, version: remoteVersion });
  };
  try {
    await session.refreshAccount();
    assert.equal(session.accountSnapshot().available, false);
    assert.equal(session.accountStorage(), window.localStorage);
    enabled = true;
    const start = requests.length;
    await Promise.all([session.refreshAccount(), session.refreshAccount()]);
    assert.equal(requests.length - start, 2, "strict-mode initialization is deduplicated");
    assert.equal(JSON.parse(session.accountStorage().getItem("reysonai:profile:v1")).nickname, "Account");
    assert.equal(JSON.parse(values.get("reysonai:profile:v1")).nickname, "Guest");
    const oauth = await session.accountRequest("google/start", {});
    assert.match(oauth.url, /^https:\/\/accounts\.google\.com\//);
    assert.equal(requests.at(-1).options.method, "POST");
    assert.equal(requests.at(-1).options.headers["Content-Type"], "application/json");
    await assert.rejects(session.importGuestData(), /consent/);
    assert.equal(posts.length, 0, "guest data not uploaded automatically");
    await session.importGuestData(true);
    assert.equal(posts[0].consent, true);
    assert.equal(posts[0].importLocal, true);
    assert.equal(posts[0].data["reysonai.trainer.rank.v1"], undefined);
    assert.deepEqual(posts[0].data["reysonai.trainer.review-sessions.v1"], []);
    const storage = session.accountStorage();
    storage.setItem("reysonai:display-mode:v1", "simple");
    const first = session.saveAccountData();
    storage.setItem("reysonai:appearance:v1", '{"cards":"two"}');
    await Promise.all([first, session.saveAccountData()]);
    assert.equal(remote["reysonai:display-mode:v1"], "simple");
    assert.deepEqual(remote["reysonai:appearance:v1"], { cards: "two" });
    await session.logoutAccount();
    assert.equal(session.accountStorage(), window.localStorage);
    assert.equal(JSON.parse(values.get("reysonai:profile:v1")).nickname, "Guest");
    identity = { id: "second", email: "second@custom.example", verified: true };
    failData = true;
    await session.refreshAccount();
    assert.equal(session.accountStorage().getItem("reysonai:profile:v1"), null, "old account data never leaks on new account load failure");
    failData = false; remote = {}; remoteVersion = 0;
    await session.refreshAccount();
    conflict = true;
    session.accountStorage().setItem("reysonai.trainer.history.v1", '[{"hand":"AA"}]');
    await session.saveAccountData();
    const postCount = posts.length;
    assert.equal(session.accountSnapshot().error, "conflict");
    await session.saveAccountData();
    assert.equal(posts.length, postCount, "save failures do not retry automatically");
    assert.deepEqual(session.exportAccountData().data["reysonai.trainer.history.v1"], [{ hand: "AA" }]);
    await locale.selectProductLocale("ja");
    assert.equal(reloads, 0, "language change cannot discard unsaved conflict data");
    await assert.rejects(session.logoutAccount(), /conflict/);
    assert.equal(session.accountSnapshot().user.id, "second");
    assert.ok(requests.every(request => request.options.credentials === "include"));
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
