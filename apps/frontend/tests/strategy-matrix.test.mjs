import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";

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
const segments = markup => [...markup.matchAll(/width:([\d.]+%);background:/g)].map((match) => match[1]);

test("postflop matrix renders one aggregate horizontal fill with exact combo summaries intact", () => {
  const combos = [
    { cards: "AsKh", weight: 0.9, reachWeight: 0.2, mix: { raise: 0.25, fold: 0.75 } },
    { cards: "AcKd", weight: 0.6, mix: { raise: 0.5, fold: 0.5 } },
    { cards: "AhKs", weight: 0.6, reachWeight: 0, mix: { raise: 1, fold: 0 } },
  ];
  const actions = { raise: 0.375, fold: 0.625 };
  const original = structuredClone({ actions, combos });
  const markup = render(new Map([["K6s", { actions, comboCount: 4, combos }]]), ["raise", "fold"]);
  const hand = cell(markup, "K6s");
  assert.equal((hand.match(/class="cell-fill"/g) ?? []).length, 1);
  assert.deepEqual(segments(hand), ["37.5%", "62.5%"]);
  assert.doesNotMatch(hand, /cell-combo-(?:fill|strip)|data-combo/);
  assert.match(hand, /AsKh · 到達重み 20\.0%: レイズ 25\.0% \/ フォールド 75\.0%/);
  assert.match(hand, /AcKd · 到達重み 60\.0%: レイズ 50\.0% \/ フォールド 50\.0%/);
  assert.doesNotMatch(hand, /AhKs/);
  assert.deepEqual({ actions, combos }, original);
});

test("aggregate fills preserve exact 100%, 50/50, 70/30, 50/30/20 and four-way frequencies", () => {
  const cases = [
    ["AA", { raise: 1, fold: 0 }, ["raise", "fold"], ["100.0%"]],
    ["KK", { raise: 0.5, fold: 0.5 }, ["raise", "fold"], ["50.0%", "50.0%"]],
    ["QQ", { raise: 0.7, fold: 0.3 }, ["raise", "fold"], ["70.0%", "30.0%"]],
    ["JJ", { raise: 0.5, call: 0.3, fold: 0.2 }, ["raise", "call", "fold"], ["50.0%", "30.0%", "20.0%"]],
    ["TT", { raise: 0.25, call: 0.25, check: 0.25, fold: 0.25 }, ["raise", "call", "check", "fold"], ["25.0%", "25.0%", "25.0%", "25.0%"]],
  ];
  for (const [hand, frequencies, actions, expected] of cases) {
    const markup = cell(render(new Map([[hand, { actions: frequencies, comboCount: 6 }]]), actions), hand);
    assert.deepEqual(segments(markup), expected, hand);
    assert.equal((markup.match(/class="cell-fill"/g) ?? []).length, 1, hand);
    assert.doesNotMatch(markup, /cell-mix|cell-combo-/);
  }
});

test("preflop and simple matrices retain their rendering and unreachable cells keep hatching behavior", () => {
  const aggregates = new Map([
    ["AA", { actions: { raise: 1, fold: 0 }, comboCount: 6 }],
    ["K6s", { actions: { raise: 0.75, fold: 0.25 }, comboCount: 4 }],
    ["K5s", { actions: { raise: 1 }, comboCount: 4, unreachable: true }],
  ]);
  const standard = render(aggregates, ["raise", "fold"]);
  assert.deepEqual(segments(cell(standard, "AA")), ["100.0%"]);
  assert.deepEqual(segments(cell(standard, "K6s")), ["75.0%", "25.0%"]);
  assert.match(cell(standard, "K5s"), /unreachable-hand/);
  assert.doesNotMatch(cell(standard, "K5s"), /cell-fill/);
  const simple = render(aggregates, ["raise", "fold"], { simplified: true });
  assert.deepEqual(segments(cell(simple, "K6s")), ["100%"]);
});
