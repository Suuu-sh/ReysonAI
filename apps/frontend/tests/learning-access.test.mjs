import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
let server, access;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  access = await server.ssrLoadModule("/src/account/LearningAccess.tsx");
});
after(async () => { await server?.close(); });
const signed = { ready: true, available: true, user: { id: "google-user", verified: true }, error: "" };
const render = account => renderToStaticMarkup(createElement(access.LearningAccess, { account, onBack() {} }, createElement("div", {}, "PRIVATE_TRAINER")));
test("all Learn sections are protected, ranges and settings are public", () => {
  for (const section of ["トレーナー", "セッション", "プレー分析", "弱点"]) assert.equal(access.isLearningSection(section), true);
  for (const section of ["レンジ分析", "アカウント", "トレーナー#anything"]) assert.equal(access.isLearningSection(section), false);
});
test("loading, guest, unverified and expired accounts never render learning children", () => {
  for (const account of [{ ...signed, ready: false }, { ...signed, user: null }, { ...signed, user: { verified: false } }, { ...signed, available: false }, { ...signed, error: "session" }, { ...signed, error: "verification" }]) assert.doesNotMatch(render(account), /PRIVATE_TRAINER/);
  assert.match(render({ ...signed, user: null }), /Googleログインが必要です/);
  assert.match(render({ ...signed, user: null }), /レンジ分析に戻る/);
  assert.match(render(signed), /PRIVATE_TRAINER/);
  assert.match(render({ ...signed, error: "conflict" }), /PRIVATE_TRAINER/, "save conflicts do not revoke verified sessions");
});
test("OAuth intent allowlist persists only section names and guest back clears it", () => {
  const prior = globalThis.window, values = new Map();
  globalThis.window = { sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  try {
    access.rememberLearningIntent("弱点"); assert.equal(access.readLearningIntent(), "弱点");
    access.rememberLearningIntent("https://evil.example"); assert.equal(access.readLearningIntent(), null);
    access.rememberLearningIntent("トレーナー"); access.rememberLearningIntent(null); assert.equal(values.size, 0);
  } finally { globalThis.window = prior; }
});
test("ProductApp routes every learning destination through the guard and guest continuation resets ranges", async () => {
  const source = await readFile(new URL("../src/ProductApp.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('isLearningSection(section) ? <LearningAccess account={account}'));
  assert.ok(source.includes('<TrainerPage {...shared} section={section} path={path} onNavigate={go} /></LearningAccess>'));
  // Pages are URLs now: a saved intent reopens its learning page when sign-in lands on the front page.
  assert.match(source, /const intent = current === HOME_PATH \? readLearningIntent\(\) : null;/);
  assert.match(source, /onGuest=.*rememberLearningIntent\(null\); go\(HOME_PATH\)/s);
  assert.match(source, /onBack=\{\(\) => navigate\(RANGE_SECTION\)\}/);
});
test("save 401 blocks learning and preserves unsaved account records for export", async () => {
  const session = await server.ssrLoadModule("/src/account/session.ts");
  const priorWindow = globalThis.window, priorFetch = globalThis.fetch;
  globalThis.window = { location: { hostname: "localhost" } };
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/session")) return Response.json({ user: { id: "real-google", verified: true } });
    if (options?.method === "POST") return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json({ data: {}, version: 0 });
  };
  try {
    const refresh = session.refreshAccount();
    assert.equal(session.accountSnapshot().ready, false);
    await refresh;
    assert.equal(access.learningAllowed(session.accountSnapshot()), true);
    session.accountStorage().setItem("reysonai.trainer.history.v1", '[{"hand":"AA"}]');
    await session.saveAccountData();
    assert.equal(session.accountSnapshot().error, "session");
    assert.equal(access.learningAllowed(session.accountSnapshot()), false);
    assert.deepEqual(session.exportAccountData().data["reysonai.trainer.history.v1"], [{ hand: "AA" }]);
  } finally { globalThis.window = priorWindow; globalThis.fetch = priorFetch; }
});

test("expired session offers Google reauthentication without discarding the export snapshot", async () => {
  const session = await server.ssrLoadModule("/src/account/session.ts");
  const { AuthPanel } = await server.ssrLoadModule("/src/account/AuthPanel.tsx");
  const priorWindow = globalThis.window, priorFetch = globalThis.fetch;
  globalThis.window = { location: { hostname: "localhost", hash: "" } };
  globalThis.fetch = async () => Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    await session.refreshAccount();
    assert.equal(session.accountSnapshot().available, true);
    assert.equal(session.accountSnapshot().error, "session");
    assert.equal(access.learningAllowed(session.accountSnapshot()), false);
    const html = renderToStaticMarkup(createElement(AuthPanel));
    assert.match(html, /class="account-primary">Sign in with Google/);
    assert.doesNotMatch(html, /Signed in with Google/);
  } finally { globalThis.window = priorWindow; globalThis.fetch = priorFetch; }
});

test("focus session validation preserves dirty records without data reload or learning remount", async () => {
  // A fresh module keeps this independent from previous expired-session cases.
  const session = await server.ssrLoadModule("/src/account/session.ts?focus-check");
  const priorWindow = globalThis.window, priorFetch = globalThis.fetch;
  globalThis.window = { location: { hostname: "localhost" } };
  const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(url);
    if (url.endsWith("/session")) return Response.json({ user: { id: "focus-user", verified: true } });
    if (options?.method === "POST") return Response.json({ version: 1 });
    return Response.json({ data: {}, version: 0 });
  };
  try {
    await session.refreshAccount();
    session.accountStorage().setItem("reysonai.trainer.history.v1", '[{"hand":"KK"}]');
    paths.length = 0;
    const checking = session.revalidateAccountSession();
    assert.equal(session.accountSnapshot().ready, true);
    await checking;
    assert.deepEqual(paths, ["http://localhost:8787/v1/account/session"]);
    assert.deepEqual(session.exportAccountData().data["reysonai.trainer.history.v1"], [{ hand: "KK" }]);
    assert.equal(access.learningAllowed(session.accountSnapshot()), true);
    await session.saveAccountData();
  } finally { globalThis.window = priorWindow; globalThis.fetch = priorFetch; }
});
