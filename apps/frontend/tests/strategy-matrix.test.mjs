import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { combosOf } from "../scripts/lib/equity.ts";

let server;
let StrategyMatrix;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
  ({ StrategyMatrix } = await server.ssrLoadModule("/src/components/StrategyMatrix.tsx"));
});
after(async () => server?.close());

const cell = (html, hand) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([markup]) => markup.includes(`<strong>${hand}</strong>`))?.[0] ?? "";
const render = (aggregates, actions, extra = {}) => renderToStaticMarkup(createElement(StrategyMatrix, {
  node: { actingPosition: "BTN" }, aggregates, selected: null, actions, onSelect() {}, ...extra,
}));
const segments = markup => [...markup.matchAll(/width:([\d.]+%);background:/g)].map(match => match[1]);
const height = markup => {
  const style = markup.match(/class="cell-fill"[^>]*style="height:([^;\"]+)/)?.[1];
  return style === undefined ? 0 : Number.parseFloat(style);
};
const rankOrder = "23456789TJQKA", suitOrder = "cdhs";
const cardId = card => rankOrder.indexOf(card[0]) * 4 + suitOrder.indexOf(card[1]);
const cardText = id => `${rankOrder[id >> 2]}${suitOrder[id & 3]}`;
function legalCombos(hand, board) {
  const blocked = new Set(board.match(/../g).map(cardId));
  return combosOf(hand).filter(([a, b]) => !blocked.has(a) && !blocked.has(b)).map(combo => combo.map(cardText).join(""));
}
const closeTo = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: expected ${expected}, got ${actual}`);

test("postflop fills encode raw hand-class reach height without changing action mix or combo summaries", () => {
  const boardCards = "Ah2c3d";
  const combos = legalCombos("AKo", boardCards).map(cards => ({
    cards, weight: 0.9, reachWeight: 0.27,
    mix: { raise: 0.05, call: 0.18, check: 0.22, fold: 0.55 },
  }));
  const actions = { raise: 0.05, call: 0.18, check: 0.22, fold: 0.55 };
  const original = structuredClone({ actions, combos });
  const markup = cell(render(new Map([["AKo", { actions, comboCount: 12, combos }]]), Object.keys(actions), { boardCards }), "AKo");
  closeTo(height(markup), 27, "9 board-legal offsuit combos weighted at 27% each");
  assert.deepEqual(segments(markup), ["5.0%", "18.0%", "22.0%", "55.0%"]);
  assert.match(markup, /AsKc · 到達重み 27\.0%/);
  assert.doesNotMatch(markup, /cell-combo-(?:fill|strip)|data-combo/);
  assert.deepEqual({ actions, combos }, original);
});

test("reach bands represent zero, 20%, 70%, and 100% without normalizing or clamping", () => {
  const boardCards = "2s3h4d";
  const combos = legalCombos("KQo", boardCards);
  for (const value of [0, 0.2, 0.7, 1]) {
    const rows = combos.map(cards => ({ cards, weight: value, mix: { raise: 0.5, fold: 0.5 } }));
    const markup = cell(render(new Map([["KQo", { actions: { raise: 0.5, fold: 0.5 }, comboCount: 12, combos: rows }]]), ["raise", "fold"], { boardCards }), "KQo");
    if (value === 0) assert.doesNotMatch(markup, /class="cell-fill"/);
    else closeTo(height(markup), value * 100, `${value * 100}% reach`);
    assert.deepEqual(segments(markup), value === 0 ? [] : ["50.0%", "50.0%"]);
  }
  const tiny = combos.map((cards, index) => ({ cards, weight: 0, ...(index === 0 ? { reachWeight: 1e-10 } : {}), mix: { raise: 1 } }));
  const tinyCell = cell(render(new Map([["KQo", { actions: { raise: 1 }, comboCount: 12, combos: tiny }]]), ["raise"], { boardCards }), "KQo");
  const tinyExpected = (1e-10 / 12) * 100;
  assert.ok(height(tinyCell) > 0, "very small positive reach must remain visible");
  closeTo(height(tinyCell), tinyExpected, "very small positive reach remains proportional", tinyExpected * 1e-6);
});

test("board blockers and zero-filtered rows use all legal combos as the denominator", () => {
  const boardCards = "Ah2c3d";
  const pairCombos = legalCombos("AA", boardCards);
  const suitedCombos = legalCombos("AKs", boardCards);
  assert.equal(pairCombos.length, 3, "one board ace removes three pair combinations");
  assert.equal(suitedCombos.length, 3, "the board ace removes one suited combination");
  const pair = cell(render(new Map([["AA", { actions: { raise: 1 }, comboCount: 3, combos: pairCombos.map(cards => ({ cards, weight: 0.7, mix: { raise: 1 } })) }]]), ["raise"], { boardCards }), "AA");
  closeTo(height(pair), 70, "pair reach uses its three board-legal combinations");

  const reachAwareBoard = "2s3h4d";
  const reachAware = [
    { cards: "AsKs", weight: 0.9, reachWeight: 0.2, mix: { raise: 0.25, fold: 0.75 } },
    { cards: "AdKd", weight: 0.6, mix: { raise: 0.5, fold: 0.5 } },
    { cards: "AcKc", weight: 1, reachWeight: 0, mix: { raise: 1, fold: 0 } },
  ];
  const original = structuredClone(reachAware);
  const mixed = cell(render(new Map([["AKs", { actions: { raise: 0.375, fold: 0.625 }, comboCount: 3, combos: reachAware }]]), ["raise", "fold"], { boardCards: reachAwareBoard }), "AKs");
  closeTo(height(mixed), 20, "reachWeight takes precedence over weight; omitted fourth legal combo is zero");
  assert.deepEqual(segments(mixed), ["37.5%", "62.5%"]);
  assert.match(mixed, /AsKs · 到達重み 20\.0%/);
  assert.match(mixed, /AdKd · 到達重み 60\.0%/);
  assert.doesNotMatch(mixed, /AcKc/);
  assert.deepEqual(reachAware, original);

  const noSourceCombos = cell(render(new Map([["KQo", { actions: { raise: 1 }, comboCount: 0, combos: [] }]]), ["raise"], { boardCards: "2s3h4d" }), "KQo");
  assert.doesNotMatch(noSourceCombos, /class="cell-fill"/);
});

test("preflop stays full-height; simple mode, unreachable cells, and mix widths remain correct", () => {
  const aggregates = new Map([
    ["AA", { actions: { raise: 1, fold: 0 }, comboCount: 6 }],
    ["K6s", { actions: { raise: 0.75, fold: 0.25 }, comboCount: 4, combos: [{ cards: "KsKh", weight: 0.7, mix: { raise: 0.75, fold: 0.25 } }] }],
    ["K5s", { actions: { raise: 1 }, comboCount: 4, combos: [], unreachable: true }],
  ]);
  const preflop = render(aggregates, ["raise", "fold"]);
  closeTo(height(cell(preflop, "AA")), 100, "preflop remains full-height without board reach data");
  assert.deepEqual(segments(cell(preflop, "K6s")), ["75.0%", "25.0%"]);

  const postflop = render(aggregates, ["raise", "fold"], { boardCards: "2s3h4d" });
  closeTo(height(cell(postflop, "K6s")), 17.5, "one 70%-reach combo among four legal combos");
  assert.match(cell(postflop, "K5s"), /unreachable-hand/);
  assert.doesNotMatch(cell(postflop, "K5s"), /cell-fill/);
  const simple = cell(render(aggregates, ["raise", "fold"], { boardCards: "2s3h4d", simplified: true }), "K6s");
  closeTo(height(simple), 17.5, "simple mode retains node reach height");
  assert.deepEqual(segments(simple), ["100%"]);
});
