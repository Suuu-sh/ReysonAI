import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, profile, Onboarding;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom", logLevel: "silent" });
  profile = await server.ssrLoadModule("/src/profile.ts");
  ({ Onboarding } = await server.ssrLoadModule("/src/components/Onboarding.tsx"));
});
after(async () => { await server?.close(); });

function withStorage(run) {
  const store = new Map();
  const original = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) } };
  try { return run(store); } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
}

test("saving a level stores the profile and that level's default display mode", () => {
  withStorage(store => {
    assert.equal(profile.loadProfile(), null);
    profile.saveProfile({ nickname: "  yota  ", level: "beginner" });
    assert.equal(profile.loadProfile().nickname, "yota");
    assert.equal(store.get(profile.displayModeKey), "simple");
    profile.saveProfile({ level: "intermediate" });
    assert.equal(store.get(profile.displayModeKey), "standard");
    assert.throws(() => profile.saveProfile({ level: "advanced" }), /レベル/);
  });
});

test("onboarding offers the two levels and requires one before starting", () => {
  const html = renderToStaticMarkup(createElement(Onboarding, { onComplete() {} }));
  for (const label of ["初級", "中級"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /上級/);
  assert.match(html, /<button type="submit" class="primary" disabled="">はじめる<\/button>/);
  assert.doesNotMatch(html, /type="password"/);
  const editing = renderToStaticMarkup(createElement(Onboarding, { initial: { level: "intermediate", nickname: "y" }, onComplete() {}, onCancel() {} }));
  assert.match(editing, /レベルを変更/);
  assert.match(editing, /<input(?=[^>]*value="intermediate")(?=[^>]*checked="")[^>]*>/);
});
