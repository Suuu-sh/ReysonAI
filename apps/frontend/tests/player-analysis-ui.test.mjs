import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

let server;
let PlayerAnalysis;

before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ PlayerAnalysis } = await server.ssrLoadModule("/src/trainer/PlayerAnalysis.tsx"));
});

after(async () => { await server?.close(); });

test("player analysis opens with the style map, without the redundant summary card", () => {
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], onStart() {} }));
  assert.match(html, /<h1 class="trainer-home-eyebrow">STATS<\/h1>/);
  assert.doesNotMatch(html, /<h1>プレー分析<\/h1>/);
  assert.match(html, /プレイスタイルマップ/);
  assert.match(html, /まずは練習から/);
  assert.doesNotMatch(html, /analysis-hero|現在の練習傾向|回答履歴|重複を除いた問題|分析した局面/);
});

test("Drill and Agent Stats share the dark map structure but keep source-specific axes and baselines", () => {
  const drill = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], onStart() {} }));
  const agent = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], initialView: "agent", onStart() {} }));
  for (const html of [drill, agent]) {
    assert.match(html, /class="play-style-map"/);
    assert.match(html, /class="play-style-map-y"/);
    assert.match(html, /class="play-style-map-grid"/);
    assert.match(html, /class="play-style-map-x"/);
    assert.match(html, /class="style-zone/);
  }
  assert.match(drill, /↑<br\/>3bet 多/);
  assert.match(drill, /今回出た問題の平均方針/);
  assert.match(agent, /↑<br\/>レイズ多/);
  assert.match(agent, /Agent基準/);
  assert.doesNotMatch(agent, /↑<br\/>3bet 多/);
});

test("player analysis includes graded strengths, weaknesses and a link to detailed review", () => {
  const history = [
    ...Array.from({ length: 5 }, () => ({ spotId: "UTG_open", hand: "AA", action: "open", result: "best", score: 1 })),
    ...Array.from({ length: 5 }, () => ({ spotId: "BB_vs_BTN", hand: "AA", action: "fold", result: "miss", score: 0 })),
  ];
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history, onStart() {}, onOpenWeakness() {} }));
  assert.match(html, /aria-label="練習結果の強みと弱点"/);
  assert.match(html, /aria-label="強み"[\s\S]*UTG オープン[\s\S]*100%/);
  assert.match(html, /aria-label="弱点"[\s\S]*BB vs BTN オープン[\s\S]*復習待ち 1ハンド/);
  assert.match(html, /弱点の詳細を見る/);
  assert.doesNotMatch(html, /analysis-hero/);
});

test("player analysis shows a distinct ReysonAI Score trend", () => {
  const history = [
    { spotId: "UTG_open", hand: "AA", action: "open", result: "best", score: 1 },
    { spotId: "UTG_open", hand: "AA", action: "fold", result: "miss", score: 0 },
  ];
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history, onStart() {} }));
  assert.match(html, /ReysonAI Score/);
  assert.match(html, /直近2回答の平均 · 暫定/);
  assert.match(html, /aria-label="ReysonAI Score の推移。2回答、直近2回答の平均は50%。"/);
  assert.match(html, /復習の再回答も含む/);
  assert.match(html, /保存済みレンジとの一致度/);
  assert.doesNotMatch(html, /GTO|AI推定|AI-estimated|AI estimate|未検証|not a solver/i);
  assert.match(html, /class="analysis-score-line"/);
});

test("drill styles keep animal avatars with type labels after the existing diverse-sample threshold", async () => {
  const { practiceAnimal } = await server.ssrLoadModule("/src/trainer/practice-style.ts");
  const { STYLES } = await server.ssrLoadModule("/src/agent/player-read.ts");
  assert.equal(practiceAnimal({ ready: false, style: { key: "nit" } }).id, "collecting");
  for (const [key, id] of [["nit", "nit"], ["tag", "tag"], ["lag", "lag"], ["calling", "station"], ["tight", "tight_passive"], ["balanced", "balanced"]]) {
    assert.equal(practiceAnimal({ ready: true, style: { key } }).id, id);
  }
  const previousWindow = globalThis.window;
  let locale = "ja";
  globalThis.window = { localStorage: { getItem: key => key === "reysonai:locale:v1" ? locale : null } };
  const ids = ["nit", "tight_passive", "tag", "passive", "balanced", "aggressive", "station", "lag"];
  const locales = [
    ["en", "Types describe deviations from the estimate for the same drill questions, not Agent-table VPIP/PFR or real-money play.", ["Nit", "Tight-passive", "TAG", "Passive-leaning", "Balanced", "Aggressive-leaning", "Calling station", "LAG"]],
    ["ja", "タイプは同じドリル問題の推定方針との差を表します。Agent卓のVPIP・PFRや実戦の打ち方の判定ではありません。", ["NIT", "タイト・パッシブ", "TAG", "パッシブ寄り", "バランス型", "アグレッシブ寄り", "コーリングステーション", "LAG"]],
    ["zh-CN", "类型表示在相同训练题目中与估计策略的偏差，并不代表Agent牌桌的VPIP/PFR或真钱游戏表现。", ["极紧型", "紧弱型", "TAG", "偏被动", "平衡型", "偏激进", "跟注站", "LAG"]],
    ["es", "Los tipos describen las desviaciones respecto a la estimación de las mismas preguntas de práctica; no representan el VPIP/PFR en mesas Agent ni el juego con dinero real.", ["Nit", "Conservador pasivo", "TAG", "Tendencia pasiva", "Equilibrado", "Tendencia agresiva", "Pagador habitual", "LAG"]],
  ];
  try {
    assert.equal(ids.length, Object.keys(STYLES).length - 1);
    assert.match(renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], onStart() {} })), /ドリルのプレイスタイル/);
    for (const [selectedLocale, explanation, expectedNames] of locales) {
      locale = selectedLocale;
      const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], onStart() {} }));
      const document = new JSDOM(html).window.document;
      assert.equal(document.querySelector(".practice-animals > p")?.textContent, explanation, selectedLocale);
      const roster = [...document.querySelectorAll(".style-roster li")];
      assert.deepEqual(roster.map(item => item.querySelector("span")?.textContent), expectedNames, selectedLocale);
      assert.equal(document.querySelectorAll(".style-roster svg.style-unit[aria-hidden=\"true\"]").length, ids.length, selectedLocale);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("ranked stats require live FastFold access and never substitute legacy quiz or drill records", async () => {
  const { RankedStats } = await server.ssrLoadModule("/src/trainer/RankedStats.tsx");
  const rank = { rating: 1120, peak: 1200, matches: [{ id: "confirmed", at: Date.now(), before: 1100, after: 1120, accuracy: .75, answered: 20 }] };
  const html = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [{ spotId: "UTG_open", hand: "AA", action: "open", result: "best", score: 1 }], rank, rankedReady: true, initialView: "ranked", onStart() {} }));
  // FastFold supersedes quiz summaries. A supplied legacy rank and a readiness
  // prop alone cannot replace an authenticated, current server profile.
  assert.match(html, /ランク戦Statsは利用できません/);
  assert.match(html, /ログインとランク戦サーバーの接続が必要/);
  assert.match(html, /ローカル・ドリル・通常Agent戦の記録は代用しません/);
  assert.doesNotMatch(html, /75%|1,120|確定済み 20 回答/);
  assert.doesNotMatch(html, /プレイスタイルマップ|style-roster|まずは練習から/);
  const closed = renderToStaticMarkup(createElement(RankedStats, { rank, ready: false }));
  assert.match(closed, /利用できません/);
  assert.doesNotMatch(closed, /75%|1,120/);
  const gated = renderToStaticMarkup(createElement(PlayerAnalysis, { history: [], rank, rankedReady: false, onStart() {} }));
  assert.doesNotMatch(gated, /<button[^>]*>[^<]*ランク戦/);
});

test("ranked answers stay outside local drill history", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/trainer/TrainerPage.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!rankedMatch\) onAnswer\(/);
  assert.match(source, /PlayerAnalysis rank=\{rankState\} rankedReady=\{rankedReady\}/);
});

test("drill Stats use compact observability panels: metric tiles, time series, daily columns and a breakdown", () => {
  const now = Date.now();
  const history = Array.from({ length: 24 }, (_, i) => ({ spotId: i % 2 ? "UTG_open" : "BB_vs_BTN", hand: "AA", action: i % 3 ? "open" : "fold", result: i % 3 ? "best" : "miss", score: i % 3 ? 1 : 0, at: now - i * 3600000 }));
  const doc = new JSDOM(renderToStaticMarkup(createElement(PlayerAnalysis, { history, onStart() {}, onOpenWeakness() {} }))).window.document;
  assert.equal(doc.querySelectorAll(".stats-panels > .stats-panel").length, 6);
  assert.ok(doc.querySelectorAll(".stats-panel .stats-spark").length >= 3);
  const score = doc.querySelector(".analysis-score .stats-ts");
  assert.ok(score.querySelector("svg.analysis-score-chart polyline.analysis-score-line"));
  assert.deepEqual([...score.querySelectorAll(".stats-ts-y span")].map(span => span.textContent), ["0", "25", "50", "75", "100"]);
  assert.equal(score.querySelectorAll(".stats-ts-summary dd").length, 4);
  const columns = doc.querySelectorAll(".stats-daily .stats-col");
  assert.equal(columns.length, 14);
  assert.ok([...columns].every(column => column.getAttribute("tabindex") === "0" && column.getAttribute("aria-label")));
  assert.ok(doc.querySelector(".stats-breakdown .stats-mix i.part-best"));
  assert.doesNotMatch(doc.body.innerHTML, /rk-hero|analysis-hero/);
});
