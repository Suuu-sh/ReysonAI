import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { createElement, act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
let module, directory, dom;
const context = { players: ["BTN", "BB"], potBb: 5.5, stackBb: 97.5, pilotAvailable: true,
  spotId: "BTN_open_BB_call", ip: "BTN", oop: "BB", tree: "oop_checks" };
const calls = [];
let missingLater = false;
const row = { hand: "AKo", reachable: true, comboCount: 1, reachWeight: 1,
  mix: { check: 1, bet33: 0, bet75: 0, bet125: 0, allin: 0 }, tiers: { air: 1 },
  combos: [{ cards: "AsKd", weight: 1, tier: "air", mix: { check: 1 } }] };
const missing = () => Object.assign(new Error("Missing saved profile policy"), { code: "PROFILE_POLICY_MISSING" });
function record(kind, options) { calls.push({ kind, options }); }
const mocks = {
  async loadPostflopSpot(spotId, signal, options) {
    record("spot", options);
    if (options.opponentProfile !== "standard" && !missingLater) throw missing();
    return { spot: { ...context, id: spotId }, candidate: {}, laterCandidate: missingLater ? null : {} };
  },
  async loadPostflopDatasets(spot, signal, options) { record("datasets", options); return {}; },
  async loadPostflopFlop() { calls.push({ kind: "base" }); return null; },
  computeBoard(options) {
    record("board", options);
    return { kind: "ai_estimate_not_gto", spot: options.spotId, board: options.board, tree: "oop_checks", texture: "dry",
      nodes: { btn_first: { actions: Object.keys(row.mix), seat: "BTN", rows: [row] } },
      ...(options.opponentProfile !== "standard" || options.tableProfile?.call === "high" ? { adjusted: { tableProfile: options.tableProfile, opponentProfile: options.opponentProfile } } : {}) };
  },
  computeExplain(options) {
    record("explain", options);
    return { spot: options.spotId, board: options.board, node: options.node, cards: null,
      aggregate: { kind: "hand_class_average", combo_count: 1, reach_weight: 1 } };
  },
  computeRangeFacts(options) { record("facts", options); return null; },
  computeLaterView(options) { record("later", options); throw missing(); },
  computeLaterExplain(options) { record("later-explain", options); return null; },
  computeLaterRangeFacts() { return null; },
};

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "reyson-profile-ui-"));
  await build({ stdin: { contents: 'export * from "./src/estimated/PostflopTrial.tsx"; export * from "./src/estimated/PostflopProfileSettings.tsx";',
    resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", jsx: "automatic",
    outfile: join(directory, "ui.mjs"), plugins: [{ name: "focused-profile-ui", setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)datasets\.ts$/ }, () => ({ path: new URL("../src/estimated/datasets.ts", import.meta.url).pathname, external: true }));
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path), external: true }));
      builder.onResolve({ filter: /postflop-browser\.ts$|postflop-compute\.ts$|StrategyMatrix\.tsx$|postflop-advanced\.ts$/ }, args => ({ path: args.path, namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => {
        if (args.path.endsWith("postflop-browser.ts")) return { contents: `export const loadPostflopSpot=(...a)=>globalThis.__profileUIMocks.loadPostflopSpot(...a); export const loadPostflopDatasets=(...a)=>globalThis.__profileUIMocks.loadPostflopDatasets(...a); export const loadPostflopFlop=(...a)=>globalThis.__profileUIMocks.loadPostflopFlop(...a); export const isAbortError=e=>e?.name==='AbortError'; export const deferPostflopCalculation=(fn, signal)=>Promise.resolve().then(()=>{if(signal.aborted)throw new DOMException('aborted','AbortError');return fn();});`, loader: "js" };
        if (args.path.endsWith("postflop-compute.ts")) return { contents: Object.keys(mocks).filter(key => key.startsWith("compute")).map(key => `export const ${key}=(...a)=>globalThis.__profileUIMocks.${key}(...a);`).join("\n"), loader: "js" };
        if (args.path.endsWith("StrategyMatrix.tsx")) return { contents: `import {createElement} from 'react'; export const StrategyMatrix=({title})=>createElement('div',{'data-testid':'saved-profile-range'},title);`, loader: "js" };
        return { contents: `export const buildAdvancedExplanation=()=>({headline:'Saved AI explanation',blocks:[],texture:''});`, loader: "js" };
      });
    } }] });
  dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/app" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__profileUIMocks = mocks;
  window.localStorage.setItem("reysonai:locale:v1", "en");
  module = await import(pathToFileURL(join(directory, "ui.mjs")).href);
});
after(async () => {
  dom?.window.close(); delete globalThis.window; delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__profileUIMocks;
  await rm(directory, { recursive: true, force: true });
});
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
function button(text) { return [...document.querySelectorAll("button")].find(element => element.textContent === text); }

test("profile and seat controls use all metadata names and native locales", () => {
  const expected = { en: ["Opponent tendencies", "Tight-passive (NIT)", "Calling station", "Loose-aggressive (LAG)", "Maniac"],
    ja: ["相手の傾向", "タイト・パッシブ（NIT）", "コーリングステーション", "ルース・アグレッシブ（LAG）", "マニアック"],
    "zh-CN": ["对手倾向", "紧手被动型（NIT）", "跟注站", "松手激进型（LAG）", "疯狂型"],
    es: ["Tendencias del rival", "Tight-pasivo (NIT)", "Calling station", "Loose-agresivo (LAG)", "Maníaco"] };
  for (const [locale, labels] of Object.entries(expected)) {
    window.localStorage.setItem("reysonai:locale:v1", locale);
    const html = renderToStaticMarkup(createElement(module.PostflopProfileSettings, { profile: "nit", seat: "ip", positions: context,
      onProfileChange() {} }));
    for (const label of labels) assert.ok(html.includes(label), `${locale}: ${label}`);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /BB · OOP/);
    const dialog = renderToStaticMarkup(createElement(module.FlopCardDialog, { cards: ["Ah", "7c", "2d"], seat: "ip", positions: context, onApply() {}, onClose() {} }));
    assert.match(dialog, /BTN · IP/); assert.match(dialog, /BB · OOP/);
    assert.doesNotMatch(html, /linear-gradient|style=/);
  }
  window.localStorage.setItem("reysonai:locale:v1", "en");
});

test("switching to a missing profile removes standard rows/details, retains controls, and restores only on click", async () => {
  calls.length = 0; missingLater = false;
  function Harness() {
    const [profile, setProfile] = useState("standard"), [seat, setSeat] = useState("ip");
    globalThis.__setSeat = setSeat;
    return createElement(module.PostflopTrial, { context, cards: ["Ah", "7c", "2d"], opponentProfile: profile, opponentSeat: seat,
      tableProfile: { call: "normal", three_bet: "normal" }, onOpponentProfileChange: setProfile });
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(Harness))); await settle();
    assert.ok(document.querySelector("[data-testid=saved-profile-range]"));
    assert.ok(document.querySelector(".postflop-hand-detail"));
    await act(async () => button("Tight-passive (NIT)").click()); await settle();
    assert.equal(document.querySelector("[data-testid=saved-profile-range]"), null);
    assert.equal(document.querySelector(".postflop-hand-detail"), null);
    assert.match(document.body.textContent, /policy is being prepared/);
    assert.ok(button("Return to Standard")); assert.equal(button("BB · OOP"), undefined);
    assert.equal(calls.filter(item => item.kind === "board").length, 1, "must not compute standard fallback");
    assert.equal(document.querySelector(".state-error"), null);
    await act(async () => globalThis.__setSeat("oop")); await settle();
    assert.equal(calls.at(-1).options.opponentSeat, "oop");
    assert.equal(document.querySelector("[data-testid=saved-profile-range]"), null);
    await act(async () => button("Return to Standard").click()); await settle();
    assert.ok(document.querySelector("[data-testid=saved-profile-range]"));
    assert.equal(document.querySelector(".postflop-profile-preparing"), null);
    for (const kind of ["spot", "datasets", "board", "explain", "facts"]) assert.ok(calls.some(call => call.kind === kind && call.options.opponentSeat === "oop"), kind);
  } finally { await act(async () => root.unmount()); }
});

test("table-only changes invalidate the visible calculation and skip the standard base cache", async () => {
  calls.length = 0; missingLater = false;
  const root = createRoot(document.getElementById("root"));
  const props = { context, cards: ["Ah", "7c", "2d"], opponentProfile: "standard", opponentSeat: "ip", onOpponentProfileChange() {} };
  try {
    await act(async () => root.render(createElement(module.PostflopTrial, { ...props, tableProfile: { call: "normal", three_bet: "normal" } })));
    await settle();
    calls.length = 0;
    await act(async () => root.render(createElement(module.PostflopTrial, { ...props, tableProfile: { call: "high", three_bet: "low" } })));
    await settle();
    assert.ok(document.querySelector("[data-testid=saved-profile-range]"));
    assert.match(document.querySelector(".postflop-adjusted-marker").textContent, /Adjusted for table/);
    assert.doesNotMatch(document.body.textContent, /assuming the opponent/);
    assert.equal(calls.some(item => item.kind === "base"), false);
    for (const kind of ["spot", "datasets", "board", "explain", "facts"]) {
      const call = calls.find(item => item.kind === kind);
      assert.ok(call, kind); assert.deepEqual(call.options.tableProfile, { call: "high", three_bet: "low" });
      assert.equal(call.options.opponentProfile, "standard"); assert.equal(call.options.opponentSeat, "ip");
    }
  } finally { await act(async () => root.unmount()); }
});

test("later-only missing profile policy remains a non-error preparing state with reachable controls", async () => {
  missingLater = true; calls.length = 0;
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(module.PostflopTrial, { context, cards: ["Ah", "7c", "2d"], actions: ["check"], turnCard: "Ts",
      opponentProfile: "station", opponentSeat: "oop", tableProfile: { call: "high", three_bet: "low" }, onOpponentProfileChange() {} })));
    await settle();
    assert.match(document.body.textContent, /policy is being prepared/);
    assert.equal(document.querySelector("[data-testid=saved-profile-range]"), null);
    assert.ok(button("Return to Standard")); assert.equal(button("BB · OOP"), undefined);
    const call = calls.find(item => item.kind === "later");
    assert.equal(call.options.opponentProfile, "station"); assert.equal(call.options.opponentSeat, "oop");
    assert.deepEqual(call.options.tableProfile, { call: "high", three_bet: "low" });
    assert.equal(calls.some(item => item.kind === "base"), false);
  } finally { await act(async () => root.unmount()); missingLater = false; }
});

test("profile note localizes assumptions and adjustment without postflop EV supplements", () => {
  for (const locale of ["en", "ja", "zh-CN", "es"]) {
    window.localStorage.setItem("reysonai:locale:v1", locale);
    const html = renderToStaticMarkup(createElement(module.PostflopProfileNote, { profile: "nit", adjusted: { tableProfile: {}, opponentProfile: "nit" } }));
    assert.match(html, /postflop-adjusted-marker/);
    assert.doesNotMatch(html, /postflop-profile-supplement|<table|action_ev_bb|EV|highest|最大/);
    if (locale === "en") assert.match(html, /These frequencies are AI decisions assuming the opponent is/);
    if (locale === "ja") assert.match(html, /この頻度は相手が/);
    if (locale === "zh-CN") assert.match(html, /这些频率是以对手为/);
    if (locale === "es") assert.match(html, /Estas frecuencias son decisiones de IA/);
  }
  window.localStorage.setItem("reysonai:locale:v1", "en");
  assert.doesNotMatch(renderToStaticMarkup(createElement(module.PostflopProfileNote, { profile: "standard" })), /postflop-profile-supplement|assuming the opponent/);
});

test("mobile segments retain 44px targets and wrapping without decorative stripes", async () => {
  const css = await readFile(new URL("../src/estimated/ranges.css", import.meta.url), "utf8");
  const scoped = css.slice(css.indexOf("/* Opponent profile controls"));
  assert.match(scoped, /max-width: 650px[\s\S]*min-height: 44px/);
  assert.match(scoped, /flex-wrap: wrap/); assert.match(scoped, /focus-visible/);
  assert.doesNotMatch(scoped, /gradient|border-left|linear-gradient/);
});


test("unsupported postflop context explicitly localizes its message in all four locales", () => {
  const expected = {
    en: "This exact history has no saved postflop policy for the selected settings.",
    ja: "この履歴と選択した設定のポストフロップ方針は未収録です。",
    "zh-CN": "此完整行动记录和所选设置尚无保存的翻牌后策略。",
    es: "Este historial exacto no tiene una estrategia postflop guardada para los ajustes elegidos.",
  };
  for (const [locale, copy] of Object.entries(expected)) {
    window.localStorage.setItem("reysonai:locale:v1", locale);
    const html = renderToStaticMarkup(createElement(module.PostflopTrial, {
      context: { ...context, pilotAvailable: false }, cards: ["Ah", "7c", "2d"],
      opponentProfile: "standard", opponentSeat: "ip", onOpponentProfileChange() {},
    }));
    assert.ok(html.includes(copy), `${locale}: unavailable paragraph must be localized without a DOM observer`);
    const unavailable = new JSDOM(html).window.document.querySelector(".postflop-unavailable").textContent;
    if (locale !== "ja") assert.doesNotMatch(unavailable, /[\u3040-\u30ff]/, "unsupported title and paragraph must not remain Japanese");
    assert.doesNotMatch(unavailable, /default settings|標準設定|默认设置|configuración predeterminada/);
  }
  window.localStorage.setItem("reysonai:locale:v1", "en");
});

test("MW3 does not substitute standard policies for a selected HU opponent profile", async () => {
  const workspace = await readFile(new URL("../src/estimated/RangeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /useMw3RangeSession\([^;]*showFlop && postflopAllowed && opponentProfile === "standard"\)/,
    "nonstandard opponent profiles must disable the standard MW3 runtime");
  assert.match(workspace, /const mw3ProfilePreparing = opponentProfile !== "standard" && \(flopContext\?\.kind === "mw3_srp" \|\| flopContext\?\.kind === "multiway_unavailable"\)/);
  assert.match(workspace, /mw3ProfilePreparing \? <ProfilePolicyPreparing onRestoreStandard=\{\(\) => setOpponentProfile\("standard"\)\} \/> : flopContext!\.kind === "mw3_srp"/,
    "the preparing state must precede MW3 rendering and require explicit restoration");

  window.localStorage.setItem("reysonai:locale:v1", "en");
  function Harness() {
    const [profile, setProfile] = useState("nit");
    return profile !== "standard"
      ? createElement(module.ProfilePolicyPreparing, { onRestoreStandard: () => setProfile("standard") })
      : createElement("div", { "data-testid": "restored-mw3" }, "Standard MW3");
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(Harness)));
    assert.equal(document.querySelector("[data-testid=restored-mw3]"), null);
    assert.match(document.body.textContent, /Standard frequencies are not substituted/);
    assert.ok(button("Return to Standard"));
    await act(async () => button("Return to Standard").click());
    assert.ok(document.querySelector("[data-testid=restored-mw3]"));
    assert.equal(document.querySelector(".postflop-profile-preparing"), null);
  } finally { await act(async () => root.unmount()); }
});
