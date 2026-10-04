import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildActionBlocks, buildRangeUrlActionBlocks, decodeRangeUrl, defaultRangeSelection,
  encodeRangeUrl, readRangeUrl, replaceRangeUrl,
} from "../src/estimated/range-url.ts";
import { limpActionTransition, responseActionTransition } from "../src/estimated/action-path.ts";
import { defaultFormat, formatOptions } from "../src/estimated/game-formats.ts";
import { DEFAULT_PROFILE } from "../src/estimated/table-profile.ts";
import { completedFlopContext, flopDecision, laterDecision, laterStart, replayLater } from "../src/estimated/postflop-trial.ts";
import { positions } from "../src/estimated/sizing.ts";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const opening = load("opening-ranges");
const responses = load("preflop-ranges");
const threeBets = load("three-bet-responses");
const fourBets = load("four-bet-responses");
const fiveBets = load("five-bet-responses");
const squeezes = load("squeeze-responses");
const selectionFields = ["rangeType", "opener", "hero", "callers", "foldedHero", "pendingRaise", "continuationAction",
  "shoveResponse", "limpAction", "limpResponseAction", "limpReraiseAction", "limpFourBetAction", "squeezeResponse", "selected", "coldAction"];
const postflopFields = ["showFlop", "flopCards", "flopActions", "turnCard", "turnActions", "riverCard", "riverActions"];
const pick = (value, fields) => Object.fromEntries(fields.map(key => [key, value[key]]));
const selection = overrides => ({ ...defaultRangeSelection, rangeType: "response", opener: "BTN", hero: "BB", ...overrides });
const fullState = overrides => ({ ...selection(), format: { ...defaultFormat }, tableProfile: { ...DEFAULT_PROFILE },
  showFlop: false, flopCards: ["", "", ""], flopActions: [], turnCard: "", turnActions: [], riverCard: "", riverActions: [], ...overrides });
const paramsOf = url => new URL(url, "https://example.test").searchParams;
const pathOf = state => paramsOf(encodeRangeUrl(state)).get("preflop_actions") ?? "";
function roundTrip(state, label = JSON.stringify(pick(state, selectionFields))) {
  const url = encodeRangeUrl(state);
  const decoded = decodeRangeUrl(paramsOf(url));
  assert.ok(decoded, label);
  assert.deepEqual(pick(decoded, selectionFields), pick(state, selectionFields), label);
  assert.equal(encodeRangeUrl(decoded), url, `canonical query ${label}`);
  return decoded;
}
const subsets = values => values.reduce((out, value) => [...out, ...out.map(group => [...group, value])], [[]]);

// These expectations intentionally do not call the codec's token generator.
// The separate action-block assertions below bind it to the UI's actual history.
test("mandatory action histories use chronological folds, stored raise-to sizes and no current action", () => {
  assert.equal(pathOf(selection()), "F-F-F-R2.5-F");
  assert.equal(encodeRangeUrl(selection()), "/analyze/ranges?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F&hand=AKo");
  assert.equal(pathOf(selection({ callers: ["BB"], foldedHero: true })), "F-F-F-R2.5-F-C");
  const bbThreeBet = threeBets.spots.find(spot => spot.opener === "BTN" && spot.three_bettor === "BB");
  assert.equal(pathOf(selection({ rangeType: "three_bet" })), `F-F-F-R2.5-F-R${bbThreeBet.three_bet_size_bb}`);
  assert.equal(pathOf(selection({ rangeType: "limp", opener: "SB", hero: "BB", limpAction: "check" })), "F-F-F-F-C-X");
  assert.equal(pathOf(selection({ opener: "SB", hero: "BB" })), "F-F-F-F-R3.5");
  const empty = defaultRangeSelection;
  assert.equal(pathOf(empty), "");
  assert.deepEqual(pick(decodeRangeUrl(paramsOf(encodeRangeUrl(empty))), selectionFields), pick(empty, selectionFields));
});

test("all persisted opening seats and every reachable response caller/fold selection round-trip", () => {
  assert.equal(opening.spots.length, 5);
  assert.equal(responses.spots.length, 15);
  for (const spot of opening.spots) {
    const opener = spot.hero;
    roundTrip(selection({ rangeType: "open", opener, hero: positions[positions.indexOf(opener) + 1] }));
  }
  let count = 0;
  for (const { opener, hero } of responses.spots) {
    const earlier = positions.slice(positions.indexOf(opener) + 1, positions.indexOf(hero));
    for (const callers of subsets(earlier)) {
      const state = selection({ opener, hero, callers, selected: count++ % 2 ? "A5s" : "72o" });
      roundTrip(state);
      for (const action of ["fold", "call"]) {
        roundTrip({ ...state, ...responseActionTransition({ opener, callers, position: hero, action }) });
      }
    }
  }
  assert.ok(count > responses.spots.length, "enumeration must include multi-caller and skipped-seat histories");
});

test("every stored 3bet, 4bet and 100BB all-in response retains all selection fields", () => {
  assert.equal(threeBets.spots.length, 15);
  assert.equal(fourBets.spots.length, 15);
  assert.equal(fiveBets.spots.length, 15);
  for (const spot of threeBets.spots) {
    for (const continuationAction of [null, "fold", "call"]) {
      const state = selection({ rangeType: "three_bet", opener: spot.opener, hero: spot.three_bettor, continuationAction });
      roundTrip(state, `${spot.id}/${continuationAction}`);
      const blocks = buildRangeUrlActionBlocks(state);
      const raiser = blocks.find(block => block.position === spot.three_bettor && block.chosen === "raise");
      assert.equal(raiser.options.find(option => option.action === "raise").label, `Raise ${spot.three_bet_size_bb}`);
      if (continuationAction) {
        for (const block of blocks.filter(block => block.kind === "cold")) assert.equal(block.chosen, "fold");
      }
    }
  }
  for (const spot of fourBets.spots) {
    for (const continuationAction of [null, "fold", "call"]) {
      roundTrip(selection({ rangeType: "four_bet", opener: spot.opener, hero: spot.hero, continuationAction }), `${spot.id}/${continuationAction}`);
    }
  }
  for (const spot of fiveBets.spots) {
    for (const shoveResponse of [null, "fold", "call"]) {
      const state = selection({ rangeType: "four_bet", opener: spot.opener, hero: spot.five_bettor, pendingRaise: "all_in", shoveResponse });
      roundTrip(state, `${spot.id}/${shoveResponse}`);
      assert.ok(pathOf(state).split("-").includes("RAI"));
      assert.equal(buildRangeUrlActionBlocks(state).find(block => block.kind === "continuation" && block.position === spot.five_bettor)
        .options.find(option => option.action === "all_in").label, `Allin ${spot.all_in_size_bb}`);
    }
  }
});

test("stored cold-call and cold-4bet decisions retain their actor rather than becoming an open response", () => {
  for (const spot of load("cold-three-bet-responses").spots) {
    for (const action of ["call", "raise"]) {
      roundTrip(selection({ rangeType: "three_bet", opener: spot.opener, hero: spot.three_bettor,
        coldAction: { position: spot.hero, action } }), `${spot.id}/${action}`);
    }
  }
});

test("UI-supported one-caller squeezes and opener/caller continuations round-trip", () => {
  // Stage 1 expands the data catalog; action-path UI integration is deliberately separate.
  const entries = squeezes.spots.filter(spot => spot.prior_action === null && ["BB", "SB"].includes(spot.squeezer) && spot.caller !== "SB");
  assert.equal(entries.length, 12);
  const branches = [[], ["raise"], ["fold"], ["call"],
    ...["fold", "call"].flatMap(first => ["fold", "call", "raise"].map(second => [first, second]))];
  for (const spot of entries) {
    for (const squeezeResponse of branches) {
      roundTrip(selection({ opener: spot.opener, hero: spot.squeezer, callers: [spot.caller], pendingRaise: "squeeze", squeezeResponse }),
        `${spot.id}/${squeezeResponse.join("-")}`);
    }
  }
});

test("all SB limp, check, iso, limp-reraise, 4bet and all-in branches round-trip", () => {
  assert.equal(load("limp-responses").spots.length, 3);
  assert.equal(load("limp-deep-responses").spots.length, 2);
  const initial = { ...selection({ rangeType: "open", opener: "SB", hero: "BB" }),
    ...limpActionTransition({ rangeType: "open", opener: "SB", hero: "BB", position: "SB", action: "call" }) };
  const visit = state => {
    roundTrip(state);
    let actor, actions;
    if (!state.limpAction) { actor = "BB"; actions = ["check", "raise"]; }
    else if (state.limpAction === "raise" && !state.limpResponseAction) { actor = "SB"; actions = ["fold", "call", "raise"]; }
    else if (state.limpResponseAction === "raise" && !state.limpReraiseAction) { actor = "BB"; actions = ["fold", "call", "raise"]; }
    else if (state.limpReraiseAction === "raise" && !state.limpFourBetAction) { actor = "SB"; actions = ["fold", "call", "all_in"]; }
    else return;
    for (const action of actions) visit({ ...state, ...limpActionTransition({ ...state, position: actor, action }) });
  };
  visit(initial);
});

test("encoder consumes the same chosen action blocks that RangeWorkspace renders", () => {
  const state = selection({ rangeType: "four_bet", pendingRaise: "all_in", shoveResponse: "call" });
  const spot = fourBets.spots.find(item => item.opener === state.opener && item.hero === state.hero);
  const actualBlocks = buildActionBlocks({ ...state, spot, raiseSizeFor: position =>
    responses.spots.find(item => item.opener === state.opener && item.hero === position)?.three_bet_size_bb ?? null });
  assert.deepEqual(actualBlocks, buildRangeUrlActionBlocks(state));
  assert.equal(encodeRangeUrl(state, actualBlocks), encodeRangeUrl(state));
  // Supplying a rewound display history must serialize that history, not recreate the old selection.
  const rewoundBlocks = actualBlocks.slice(0, actualBlocks.findIndex(block => block.kind === "continuation"));
  assert.equal(paramsOf(encodeRangeUrl(state, rewoundBlocks)).get("preflop_actions"), "F-F-F-R2.5-F-R12");
  const ui = readFileSync(new URL("../src/estimated/RangeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /import\s*\{[^}]*buildActionBlocks[^}]*\}\s*from\s*["']\.\/range-url\.ts["']/);
  assert.doesNotMatch(ui, /(?:export\s+)?function buildActionBlocks\s*\(/);
  assert.match(ui, /encodeRangeUrl\([\s\S]*?actionBlocks\)/);
});

test("flop, turn and river preserve exact native bet sizes, raises and action strings", () => {
  const preflops = [selection({ callers: ["BB"], foldedHero: true }),
    selection({ rangeType: "three_bet", continuationAction: "call" }),
    selection({ rangeType: "four_bet", continuationAction: "call" }),
    selection({ rangeType: "limp", opener: "SB", hero: "BB", limpAction: "check" })];
  const walk = (decisionFor, visit, actions = []) => {
    visit(actions);
    for (const option of decisionFor(actions).options ?? []) walk(decisionFor, visit, [...actions, option.action]);
  };
  for (const preflop of preflops) {
    const context = completedFlopContext({ ...preflop, actionBlocks: buildRangeUrlActionBlocks(preflop), isDefaultTable: true });
    assert.equal(context.pilotAvailable, true);
    const base = fullState({ ...preflop, showFlop: true, flopCards: ["As", "Kh", "7d"] });
    const assertPostflop = state => assert.deepEqual(pick(roundTrip(state), postflopFields), pick(state, postflopFields));
    walk(actions => flopDecision(actions, context), flopActions => assertPostflop({ ...base, flopActions }));
    const flopActions = context.tree === "oop_leads" ? ["check", "check"] : ["check"];
    const turnStart = laterStart(flopActions, context);
    assert.ok(turnStart);
    walk(actions => laterDecision("turn", actions, turnStart, context), turnActions =>
      assertPostflop({ ...base, flopActions, turnCard: "2c", turnActions }));
    const turnActions = ["check", "check"];
    const turnReplay = replayLater("turn", turnActions, turnStart, context);
    const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    walk(actions => laterDecision("river", actions, riverStart, context), riverActions =>
      assertPostflop({ ...base, flopActions, turnCard: "2c", turnActions, riverCard: "3d", riverActions }));
  }
});

test("URLSearchParams round-trips every recognized format and both profile levels in stable parameter order", () => {
  for (const [key, options] of Object.entries(formatOptions)) for (const { value } of options) {
    const state = fullState({ format: { ...defaultFormat, [key]: value } });
    assert.deepEqual(decodeRangeUrl(paramsOf(encodeRangeUrl(state))).format, state.format, `${key}=${value}`);
  }
  for (const call of ["low", "normal", "high"]) for (const three_bet of ["low", "normal", "high"]) {
    const state = fullState({ selected: "QJs", tableProfile: { call, three_bet } });
    assert.deepEqual(roundTrip(state).tableProfile, state.tableProfile);
  }
  const state = fullState({ selected: "QJs", format: { ...defaultFormat, openSize: 3, ante: true, rake: "none" }, tableProfile: { call: "high", three_bet: "low" },
    callers: ["BB"], foldedHero: true });
  const url = encodeRangeUrl(state);
  const params = paramsOf(url);
  assert.equal(new URL(url, "https://example.test").pathname, "/analyze/ranges");
  assert.deepEqual([...params.keys()], ["gametype", "depth", "open", "ante", "rake", "call", "three_bet", "preflop_actions", "hand"]);
  const decoded = roundTrip(state);
  assert.deepEqual(decoded.format, state.format);
  assert.deepEqual(decoded.tableProfile, state.tableProfile);
  assert.deepEqual(pick(decoded, postflopFields), pick(state, postflopFields));
  const postflop = fullState({ callers: ["BB"], foldedHero: true, showFlop: true, flopCards: ["As", "Kh", "7d"],
    flopActions: ["check"], turnCard: "2c", turnActions: ["check", "check"], riverCard: "3d", riverActions: ["bet33", "call"] });
  const fullParams = paramsOf(encodeRangeUrl(postflop));
  assert.deepEqual([...fullParams.keys()], ["gametype", "depth", "preflop_actions", "board", "flop_actions", "turn", "turn_actions", "river", "river_actions", "hand"]);
  assert.equal(fullParams.get("board"), "AsKh7d");
  assert.equal(fullParams.get("flop_actions"), "X");
  assert.equal(fullParams.get("turn_actions"), "X-X");
  assert.equal(fullParams.get("river_actions"), "B33-C");
  assert.deepEqual(pick(roundTrip(postflop), postflopFields), pick(postflop, postflopFields));
  assert.equal(paramsOf(encodeRangeUrl(fullState())).has("rake"), false);
  assert.equal(paramsOf(encodeRangeUrl(fullState())).has("call"), false);
  assert.equal(paramsOf(encodeRangeUrl(fullState())).has("three_bet"), false);
});

test("invalid preflop token retains the valid prefix; numeric raise sizes do not replace stored sizing", () => {
  const params = paramsOf(encodeRangeUrl(selection()));
  params.set("preflop_actions", "F-F-F-R2.5-F-invalid-C");
  assert.deepEqual(pick(decodeRangeUrl(params), selectionFields), pick(selection(), selectionFields));
  params.set("preflop_actions", "F-F-F-R2.5-F-Rbanana-C");
  assert.deepEqual(pick(decodeRangeUrl(params), selectionFields), pick(selection(), selectionFields));
  params.set("preflop_actions", "F-F-F-R999-F-R123.45");
  const decoded = decodeRangeUrl(params);
  assert.equal(decoded.rangeType, "three_bet");
  assert.equal(pathOf(decoded), "F-F-F-R2.5-F-R12");
  params.set("depth", "200");
  for (const gametype of ["unknown", "cash-6max-", "cash-6max--garbage", "cash-6max-extra"]) {
    params.set("gametype", gametype);
    assert.deepEqual(decodeRangeUrl(params).format, defaultFormat, gametype);
  }
});

test("unknown parameters do not override storage; recognized malformed values fail safely", () => {
  assert.equal(decodeRangeUrl(""), null);
  assert.equal(decodeRangeUrl("?unrelated=1"), null);
  assert.equal(decodeRangeUrl("?hand=not-a-hand").selected, "AKo");
  assert.deepEqual(pick(decodeRangeUrl("?preflop_actions=invalid"), selectionFields), pick(defaultRangeSelection, selectionFields));
  const state = fullState({ callers: ["BB"], foldedHero: true, showFlop: true, flopCards: ["As", "Kh", "7d"], flopActions: ["bet33", "call"] });
  const url = encodeRangeUrl(state);
  assert.deepEqual(decodeRangeUrl(url), decodeRangeUrl(paramsOf(url)));
  const params = paramsOf(url);
  params.set("flop_actions", "B33-invalid-C");
  assert.deepEqual(decodeRangeUrl(params).flopActions, ["bet33"]);
  params.set("call", "invalid");
  params.set("three_bet", "invalid");
  assert.deepEqual(decodeRangeUrl(params).tableProfile, DEFAULT_PROFILE);
});

test("invalid or duplicate board cards discard the affected and later streets without losing preflop", () => {
  const state = fullState({ callers: ["BB"], foldedHero: true, showFlop: true, flopCards: ["As", "Kh", "7d"], flopActions: ["check"],
    turnCard: "2c", turnActions: ["check", "check"], riverCard: "3d", riverActions: ["bet33", "call"] });
  for (const bad of [
    { flopCards: ["As", "As", "7d"], turnCard: "", riverCard: "", flopActions: [], turnActions: [], riverActions: [] },
    { turnCard: "As", riverCard: "", turnActions: [], riverActions: [] },
    { riverCard: "not-a-card", riverActions: [] },
  ]) {
    const params = paramsOf(encodeRangeUrl(state));
    if (bad.flopCards) params.set("board", bad.flopCards.join(""));
    else if (bad.turnCard !== undefined) params.set("turn", bad.turnCard);
    else params.set("river", bad.riverCard);
    const decoded = decodeRangeUrl(params);
    assert.deepEqual(pick(decoded, selectionFields), pick(state, selectionFields));
    if (bad.flopCards) {
      assert.deepEqual(decoded.flopCards, ["", "", ""]);
      assert.deepEqual(decoded.flopActions, []);
    }
    if (bad.turnCard !== undefined) {
      assert.equal(decoded.turnCard, "");
      assert.deepEqual(decoded.turnActions, []);
    }
    assert.equal(decoded.riverCard, "");
    assert.deepEqual(decoded.riverActions, []);
  }
});

function mockBrowser(pathname, search = "", hash = "#kept") {
  const location = { pathname, search, hash };
  const calls = [];
  return { location, calls, history: { state: { keep: true }, replaceState(...args) {
    calls.push(args);
    const next = new URL(args[2], "https://example.test");
    Object.assign(location, { pathname: next.pathname, search: next.search, hash: next.hash });
  }, pushState() { assert.fail("sync must replace, never push"); } } };
}

test("browser URL helpers read and replace only /analyze/ranges, retain hash/history state and skip identical writes", () => {
  const url = encodeRangeUrl(selection({ selected: "A5s" }));
  assert.equal(readRangeUrl({}), null, "SSR storage-only window mock has no location");
  assert.equal(replaceRangeUrl(url, {}), false);
  assert.equal(readRangeUrl({ location: null }), null);
  assert.equal(replaceRangeUrl(url, { location: null }), false);
  for (const pathname of ["/", "/app", "/admin", "/analyze/ranges/other"]) {
    const browser = mockBrowser(pathname, new URL(url, "https://example.test").search);
    assert.equal(readRangeUrl(browser), null);
    replaceRangeUrl(url, browser);
    assert.equal(browser.calls.length, 0);
  }
  const browser = mockBrowser("/analyze/ranges");
  replaceRangeUrl(url, browser);
  assert.equal(browser.calls.length, 1);
  assert.deepEqual(browser.calls[0][0], { keep: true });
  assert.equal(browser.calls[0][2], `${url}#kept`);
  assert.equal(readRangeUrl(browser).selected, "A5s");
  replaceRangeUrl(url, browser);
  assert.equal(browser.calls.length, 1);
});

test("workspace initializes from URL ahead of storage and preserves postflop state across first-render effects", () => {
  const ui = readFileSync(new URL("../src/estimated/RangeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /\[initialUrlState\][\s\S]*?useState\([\s\S]*?readRangeUrl\(/);
  assert.match(ui, /initialUrlState\s*\?\?\s*restoredSelection\(initialRangeType\)/);
  for (const field of ["flopCards", "flopActions", "turnCard", "turnActions", "riverCard", "riverActions", "format", "tableProfile"]) {
    assert.ok(ui.includes(`initialUrlState?.${field}`) || ui.includes(`initialUrlState.${field}`), `URL overrides saved ${field}`);
  }
  assert.match(ui, /useRef\(/, "restored downstream paths require initialized previous-input refs");
  assert.match(ui, /replaceRangeUrl\(/);
});
