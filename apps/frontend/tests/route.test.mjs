import test from "node:test";
import assert from "node:assert/strict";
import { appEntryHref, canonicalPath, isAppPath, isProductAppRoute, pathOfSection, sectionOfPath, trainerPath, trainerRouteOf } from "../src/route.ts";

test("every trainer route round-trips through its /learn path", () => {
  const routes = [
    { phase: "library" }, { phase: "drills" }, { phase: "ranking" }, { phase: "new" }, { phase: "edit", id: "d-1" },
    { phase: "drill", key: "d-1" }, { phase: "result", key: "d-1" }, { phase: "drill", key: "review" }, { phase: "result", key: "review" },
    { phase: "drill", key: "ranked" }, { phase: "result", key: "ranked" },
    { phase: "agent", tableId: "reyson-01", watch: false }, { phase: "agent", tableId: "reyson-01", watch: true },
  ];
  for (const route of routes) {
    const path = trainerPath(route);
    assert.ok(path.startsWith("/learn/"), path);
    assert.deepEqual(trainerRouteOf(path), route, path);
    assert.equal(sectionOfPath(path), "トレーナー", path);
  }
  assert.equal(trainerPath({ phase: "drill", key: "ranked" }), "/learn/trainer/ranked/play");
  assert.equal(trainerPath({ phase: "ranking" }), "/learn/trainer/ranked/leaderboard");
  assert.equal(trainerPath({ phase: "drill", key: "d-1" }), "/learn/trainer/drills/d-1/play");
});

test("sections map to /analyze and /learn", () => {
  assert.equal(pathOfSection("レンジ分析"), "/analyze/ranges");
  assert.equal(pathOfSection("セッション"), "/learn/sessions");
  assert.equal(pathOfSection("プレー分析"), "/learn/analysis");
  assert.equal(pathOfSection("弱点"), "/learn/weakness");
  assert.equal(pathOfSection("アカウント#language"), "/account/language");
  assert.equal(sectionOfPath("/learn/analysis"), "プレー分析");
  assert.equal(sectionOfPath("/analyze/ranges"), "レンジ分析");
});

test("old addresses move to the current ones", () => {
  assert.equal(canonicalPath("/app"), "/analyze/ranges");
  assert.equal(canonicalPath("/welcome"), "/analyze/ranges");
  assert.ok(isAppPath("/welcome"));
  assert.equal(canonicalPath("/ranges"), "/analyze/ranges");
  assert.equal(canonicalPath("/solutions"), "/analyze/ranges");
  assert.equal(canonicalPath("/analyze"), "/analyze/ranges");
  assert.equal(canonicalPath("/trainer"), "/learn/trainer");
  assert.equal(canonicalPath("/trainer/play/ranked"), "/learn/trainer/ranked/play");
  assert.equal(canonicalPath("/trainer/play/d-1/result"), "/learn/trainer/drills/d-1/play/result");
  assert.equal(canonicalPath("/trainer/ranking"), "/learn/trainer/ranked/leaderboard");
  assert.equal(canonicalPath("/trainer/agent/reyson-01/watch"), "/learn/agent/reyson-01/watch");
  assert.equal(canonicalPath("/sessions"), "/learn/sessions");
  assert.equal(canonicalPath("/learn"), "/learn/trainer");
  for (const path of ["/analyze/ranges", "/solutions", "/learn/trainer", "/account/language", "/app", "/trainer/drills"]) assert.ok(isAppPath(path), path);
  for (const path of ["/", "/ja", "/admin", "/learning"]) assert.ok(!isAppPath(path), path);
});

test("production app host opens ProductApp at root while local and preview routes stay unchanged", () => {
  assert.equal(isProductAppRoute("/", "app.reysonai.com"), true);
  assert.equal(isProductAppRoute("/app", "localhost"), true);
  assert.equal(isProductAppRoute("/", "localhost"), false);
  assert.equal(appEntryHref("reysonai.com"), "https://app.reysonai.com");
  assert.equal(appEntryHref("preview.local"), "/analyze/ranges");
});
