import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { hands } from "../src/data.ts";
import { multiway2Spots, validateMultiway2Dataset, findMultiway2Spot, multiway2MatrixModel } from "../src/estimated/multiway2-responses.ts";
import { callContexts, callFacts, allowedCall, validCallEquities } from "../src/estimated/call-ev.ts";
import { twoCallerSqueezeToSize, threeBetToSize, fourBetToSize, squeezeFourBetToSize } from "../src/estimated/sizing.ts";

// This suite can inspect a complete staged publication before it reaches the
// persisted datasets. Missing artifacts fail; there is no candidate fallback.
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = process.env.ESTIMATES_DIR ? pathToFileURL(resolve(process.env.ESTIMATES_DIR) + "/") : new URL("../src/estimated/", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8"));
const data = load("multiway2-responses"), multiway = load("multiway-responses");
const responses = load("preflop-ranges"), opening = load("opening-ranges");
const comboCount = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const weightedCombos = (spot, action) => spot.hands.reduce((n, row) => n + comboCount(row.hand) * row[action] / 100, 0);
const sourceRange = (spot, action) => spot.hands.filter(row => row[action] > 0).map(row => [row.hand, row[action] / 100]);
const predecessors = (spot, o = opening, r = responses, m = multiway) => [
  [o.spots.find(s => s.id === spot.source_opening_id), "open"],
  [r.spots.find(s => s.id === spot.source_caller_ids[0]), "call"],
  [m.spots.find(s => s.id === spot.source_caller_ids[1]), "call"],
];
const EXPECTED_IDS = [
  "BTN_vs_UTG_HJcall_COcall", "SB_vs_UTG_HJcall_COcall", "BB_vs_UTG_HJcall_COcall",
  "SB_vs_UTG_HJcall_BTNcall", "BB_vs_UTG_HJcall_BTNcall", "BB_vs_UTG_HJcall_SBcall",
  "SB_vs_UTG_COcall_BTNcall", "BB_vs_UTG_COcall_BTNcall", "BB_vs_UTG_COcall_SBcall",
  "BB_vs_UTG_BTNcall_SBcall", "SB_vs_HJ_COcall_BTNcall", "BB_vs_HJ_COcall_BTNcall",
  "BB_vs_HJ_COcall_SBcall", "BB_vs_HJ_BTNcall_SBcall", "BB_vs_CO_BTNcall_SBcall",
];

test("all 15 coverage histories contain 169 canonical conditional integer rows", () => {
  assert.equal(validateMultiway2Dataset(data, multiway, responses, opening), data);
  assert.deepEqual(multiway2Spots.map(spot => spot.id), EXPECTED_IDS);
  assert.deepEqual(data.spots.map(spot => spot.id), EXPECTED_IDS);
  assert.equal(data.entry_count, 2535);
  assert.equal(new Set(data.spots.map(spot => spot.id)).size, 15);
  for (const spot of data.spots) {
    assert.deepEqual(spot.hands.map(row => row.hand), hands);
    assert.equal(spot.callers.length, 2);
    assert.equal(spot.source_opening_id, `${spot.opener}_open`);
    assert.deepEqual(spot.source_caller_ids, [`${spot.callers[0]}_vs_${spot.opener}`, `${spot.callers[1]}_vs_${spot.opener}_${spot.callers[0]}call`]);
    assert.equal(spot.unreachable, predecessors(spot).some(([source, action]) => !source.hands.some(row => row[action] > 0)));
    assert.equal(findMultiway2Spot(data, spot.opener, spot.callers, spot.hero), spot);
    for (const row of spot.hands) {
      assert.deepEqual(Object.keys(row), ["hand", "fold", "call", "squeeze", "squeeze_size_bb"]);
      assert.ok([row.fold, row.call, row.squeeze].every(n => Number.isInteger(n) && n >= 0 && n <= 100));
      assert.equal(row.fold + row.call + row.squeeze, 100);
      assert.equal(row.squeeze_size_bb, row.squeeze > 0 ? spot.squeeze_size_bb : null);
      if (spot.unreachable) assert.equal(row.fold, 100);
    }
  }
  assert.throws(() => findMultiway2Spot(data, "UTG", ["CO", "HJ"], "BTN"));
  assert.throws(() => findMultiway2Spot(data, "BTN", ["SB", "BB"], "CO"));
  assert.throws(() => findMultiway2Spot(data, "UTG", ["HJ"], "BTN"));
});

test("two-caller fixed sizing has Python parity and preserves all previous sizes", () => {
  const postflop = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
  for (const opener of postflop) for (const hero of postflop) {
    if (opener === hero) continue;
    const ip = postflop.indexOf(hero) > postflop.indexOf(opener);
    assert.equal(threeBetToSize(opener, hero), opener === "SB" ? 10.5 : ip ? 8 : 12);
    assert.equal(threeBetToSize(opener, hero, 1), ip ? 12 : 13);
    assert.equal(fourBetToSize(opener, hero), opener === "SB" && hero === "BB" ? 24 : postflop.indexOf(opener) > postflop.indexOf(hero) ? 26 : 20);
    assert.equal(squeezeFourBetToSize(opener, hero), ["CO", "BTN"].includes(hero) ? 26 : fourBetToSize(opener, hero));
  }
  for (const spot of data.spots) {
    assert.equal(twoCallerSqueezeToSize(spot.opener, spot.hero), spot.hero === "BTN" ? 14.5 : 15.5);
    assert.equal(spot.squeeze_size_bb, twoCallerSqueezeToSize(spot.opener, spot.hero));
    assert.equal(spot.squeeze_size_bb, threeBetToSize(spot.opener, spot.hero, 2));
  }
  const python = spawnSync("python3", ["-c", "import json,sys; sys.path.insert(0,'scripts'); from sizing_rules import two_caller_squeeze_to; print(json.dumps([two_caller_squeeze_to(o,h) for o,h in json.loads(sys.argv[1])]))",
    JSON.stringify(data.spots.map(spot => [spot.opener, spot.hero]))], { cwd: root, encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), data.spots.map(spot => spot.squeeze_size_bb));
});

test("the four-way call model uses the exact saved second multiway call and full Hero reach", () => {
  const contexts = callContexts({ opening, responses, multiway, multiway2: data }).filter(c => c.type === "multiway2");
  assert.equal(contexts.length, data.spots.filter(spot => !spot.unreachable).length);
  const blind = { SB: 0.5, BB: 1 };
  for (const context of contexts) {
    const spot = context.spot, participants = [spot.hero, spot.opener, ...spot.callers];
    assert.deepEqual(context.input.opponents, [spot.opener, ...spot.callers]);
    assert.deepEqual(context.input.ranges, predecessors(spot).map(([source, action]) => sourceRange(source, action)));
    assert.equal(context.input.cost_to_call, 2.5 - (blind[spot.hero] ?? 0));
    assert.equal(context.input.total_pot_after_call, 10 + 1.5 - participants.reduce((n, p) => n + (blind[p] ?? 0), 0));
    assert.equal(context.input.bb_behind === true, spot.hero === "SB");
    assert.equal(context.input.cold_call_behind === true, spot.hero === "BTN");
    for (const hand of hands) assert.equal(context.reach(hand), 1, `${spot.id}/${hand}: Hero has not acted`);
  }
  const sbCalls = data.spots.filter(spot => spot.callers[1] === "SB");
  assert.equal(sbCalls.length, 6);
  for (const spot of sbCalls) {
    assert.ok(responses.spots.find(s => s.hero === "SB" && s.opener === spot.opener).hands.every(row => row.call === 0));
    assert.ok(multiway.spots.find(s => s.id === spot.source_caller_ids[1]).hands.some(row => row.call > 0));
    assert.equal(spot.unreachable, false, `${spot.id}: an SB multiway call is reachable`);
    assert.ok(contexts.some(c => c.spot.id === spot.id));
  }
  // Changing only a c2 heads-up call must not change this history's input.
  const original = contexts.find(c => c.spot.id === "BTN_vs_UTG_HJcall_COcall");
  const differentHu = structuredClone(responses);
  for (const row of differentHu.spots.find(s => s.id === "CO_vs_UTG").hands) { row.fold += row.call; row.call = 0; }
  const unchanged = callContexts({ opening, responses: differentHu, multiway, multiway2: data }).find(c => c.spot.id === original.spot.id);
  assert.deepEqual(unchanged.input, original.input);
  const differentMultiway = structuredClone(multiway);
  const changedRow = differentMultiway.spots.find(s => s.id === original.spot.source_caller_ids[1]).hands.find(row => row.call > 0);
  changedRow.fold += changedRow.call; changedRow.call = 0;
  const changed = callContexts({ opening, responses, multiway: differentMultiway, multiway2: data }).find(c => c.spot.id === original.spot.id);
  assert.notDeepEqual(changed.input.ranges[2], original.input.ranges[2]);
  assert.deepEqual(changed.input.ranges.slice(0, 2), original.input.ranges.slice(0, 2));
});

test("saved calls pass the current four-way EV gate and squeezes stay inside heads-up width", () => {
  const equities = load("call-equities");
  const contexts = callContexts({ opening, responses, multiway, multiway2: data }).filter(c => c.type === "multiway2");
  for (const context of contexts) {
    const spot = context.spot;
    assert.ok(validCallEquities(equities, context), `${spot.id}: complete fresh saved equity`);
    const hu = responses.spots.find(s => s.hero === spot.hero && s.opener === spot.opener);
    assert.ok(weightedCombos(spot, "squeeze") <= weightedCombos(hu, "three_bet") + 1e-9, spot.id);
    for (const row of spot.hands) {
      const facts = callFacts(context, row.hand, equities.spots[spot.id].equities[row.hand]);
      assert.equal(row.call, allowedCall(row.call, facts.call_ev_bb), `${spot.id}/${row.hand}`);
      assert.ok(Number.isFinite(facts.eqr));
    }
    for (const hand of ["AA", "KK"]) {
      const row = spot.hands.find(row => row.hand === hand);
      assert.equal(row.fold, 0, `${spot.id}/${hand}`);
      assert.ok(row.call > 0 && row.squeeze > 0, `${spot.id}/${hand}: protected passive range`);
    }
    const aks = spot.hands.find(row => row.hand === "AKs");
    const aksEv = callFacts(context, "AKs", equities.spots[spot.id].equities.AKs).call_ev_bb;
    if (aksEv >= 0.05) assert.ok(aks.call > 0, `${spot.id}/AKs: retain a legal premium flat`);
  }
});

test("matrix projection only exposes stored actions and their fixed raise-to size", () => {
  for (const spot of data.spots) {
    const model = multiway2MatrixModel(spot);
    assert.deepEqual(model.actions, ["squeeze", "call", "fold"]);
    assert.equal(model.actionLabels.squeeze, `スクイーズ ${spot.squeeze_size_bb}BB`);
    assert.equal([...model.aggregates.values()].reduce((n, row) => n + row.comboCount, 0), 1326);
    for (const row of spot.hands) {
      assert.deepEqual(model.aggregates.get(row.hand).actions, { squeeze: row.squeeze / 100, call: row.call / 100, fold: row.fold / 100 });
      assert.equal(model.aggregates.get(row.hand).ev, undefined);
    }
  }
});

test("every history has 169 four-way reasons with exact persisted frequencies", () => {
  for (const spot of data.spots) {
    const reason = load(`reasons/${spot.id}`);
    assert.equal(reason.spot_id, spot.id);
    assert.equal(reason.type, "multiway2");
    assert.match(reason.source_fingerprint, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(reason.hands).sort(), [...hands].sort());
    assert.deepEqual(reason.spot_facts.callers, spot.callers);
    assert.equal(reason.spot_facts.unreachable === true, spot.unreachable);
    assert.ok(reason.fact_labels.some(fact => fact.key === "equity_4way_pct"));
    for (const row of spot.hands) {
      const detail = reason.hands[row.hand];
      assert.ok(typeof detail.reason === "string" && detail.reason.length > 0);
      if (spot.unreachable) {
        assert.match(detail.reason, /到達不能/);
        assert.ok(Object.values(detail.facts).every(value => value === null));
      } else {
        assert.ok(Number.isFinite(detail.facts.equity_4way_pct), `${spot.id}/${row.hand}`);
        assert.ok(Number.isFinite(detail.facts.call_ev_bb), `${spot.id}/${row.hand}`);
        for (const [action, label] of [["squeeze", "スクイーズ"], ["call", "コール"], ["fold", "フォールド"]]) {
          if (row[action] > 0) assert.match(detail.reason, new RegExp(`${label} ${row[action]}%`), `${spot.id}/${row.hand}`);
        }
        assert.doesNotMatch(detail.reason, /対象外|到達不能/);
      }
    }
  }
});

test("only an empty complete history makes all 169 first-decision rows unreachable", () => {
  for (const which of ["open", "first", "second"]) {
    const d = structuredClone(data), o = structuredClone(opening), r = structuredClone(responses), m = structuredClone(multiway);
    const example = d.spots[0];
    const [source, action] = predecessors(example, o, r, m)[["open", "first", "second"].indexOf(which)];
    for (const row of source.hands) {
      row.fold += row[action]; row[action] = 0;
      if (action === "open") row.open_size_bb = null;
    }
    if (which === "first") for (const spot of m.spots.filter(s => s.opener === source.opener && s.callers[0] === source.hero)) {
      spot.unreachable = true;
      for (const row of spot.hands) Object.assign(row, { fold: 100, call: 0, squeeze: 0, squeeze_size_bb: null });
    }
    for (const spot of d.spots) {
      spot.unreachable = predecessors(spot, o, r, m).some(([s, a]) => !s.hands.some(row => row[a] > 0));
      if (spot.unreachable) for (const row of spot.hands) Object.assign(row, { fold: 100, call: 0, squeeze: 0, squeeze_size_bb: null });
    }
    assert.equal(validateMultiway2Dataset(d, m, r, o), d, which);
    assert.equal(d.spots[0].unreachable, true);
    d.spots[0].hands[0].fold = 99; d.spots[0].hands[0].call = 1;
    assert.throws(() => validateMultiway2Dataset(d, m, r, o), `${which}: placeholders cannot recommend a call`);
  }
});

test("validator rejects malformed metadata, histories, sources, percentages and placeholders", () => {
  const mutations = [
    d => { d.metadata.schema_version = "2.0"; },
    d => { d.metadata.strategy_type = "gto"; },
    d => { d.metadata.ante_bb = 1; },
    d => { d.metadata.rake.rate = 0; },
    d => { d.metadata.legal_actions.push("four_bet"); },
    d => { d.spot_count -= 1; },
    d => { d.entry_count -= 169; },
    d => { d.spots.pop(); },
    d => { d.spots.reverse(); },
    d => { d.spots[0].id = d.spots[1].id; },
    d => { d.spots[0].hero = "CO"; },
    d => { d.spots[0].opener = "HJ"; },
    d => { d.spots[0].callers.reverse(); },
    d => { d.spots[0].callers.push("SB"); },
    d => { d.spots[0].source_opening_id = "HJ_open"; },
    d => { d.spots[0].source_caller_ids.reverse(); },
    d => { d.spots[0].source_caller_ids[1] = "CO_vs_UTG"; },
    d => { d.spots[0].open_size_bb = 3.5; },
    d => { d.spots[0].squeeze_size_bb = 12; },
    d => { d.spots[0].effective_stack_bb = 200; },
    d => { delete d.spots[0].unreachable; },
    d => { d.spots[0].unreachable = "false"; },
    d => { d.spots[0].unreachable = true; },
    d => { d.spots[0].hands.pop(); },
    d => { d.spots[0].hands.reverse(); },
    d => { d.spots[0].hands[0].fold += 1; },
    d => { d.spots[0].hands[0].call = 0.5; },
    d => { d.spots[0].hands[0].fold = -1; },
    d => { d.spots[0].hands[0].squeeze = 101; },
    d => { d.spots[0].hands[0].squeeze_size_bb = null; },
    d => { d.spots[0].hands.at(-1).squeeze_size_bb = 14.5; },
    d => { d.spots[0].hands[0].reason = "inline reason forbidden"; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(data); mutate(invalid);
    assert.throws(() => validateMultiway2Dataset(invalid, multiway, responses, opening), String(mutate));
  }
  for (const index of [0, 1, 2]) {
    const sources = [structuredClone(multiway), structuredClone(responses), structuredClone(opening)];
    sources[index] = undefined;
    assert.throws(() => validateMultiway2Dataset(data, ...sources), `missing source ${index}`);
  }
  for (const [index, mutate] of [
    [0, m => { m.spots.find(s => s.id === "CO_vs_UTG_HJcall").id = "CO_vs_UTG"; }],
    [0, m => { m.spots.find(s => s.id === "CO_vs_UTG_HJcall").hands.pop(); }],
    [0, m => { m.spots.find(s => s.id === "CO_vs_UTG_HJcall").hands[0].call = NaN; }],
    [0, m => { m.spots.find(s => s.id === "CO_vs_UTG_HJcall").callers = ["BTN"]; }],
    [1, r => { r.spots.find(s => s.id === "HJ_vs_UTG").hands.reverse(); }],
    [2, o => { o.spots.find(s => s.id === "UTG_open").hands.reverse(); }],
  ]) {
    const sources = [structuredClone(multiway), structuredClone(responses), structuredClone(opening)];
    mutate(sources[index]);
    assert.throws(() => validateMultiway2Dataset(data, ...sources), String(mutate));
  }
});
