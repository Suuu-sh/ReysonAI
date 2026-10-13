import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { config, loadInputs, readArtifact } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.mjs";
import { SINGLE_DEFENCE_VERSION, sizedDefenceFor as defenceFor } from "../scripts/postflop-ai/single-size-defence.ts";
import { playHand, simulationReport } from "../scripts/postflop-ai/simulation.mjs";
import { isFreshSimulationReport } from "../scripts/postflop-ai/publish-d1.mjs";
import { comboId, rankTable, replayDecision, tierArray } from "../scripts/postflop-ai/defence.ts";
import { makeRange, equitiesVersus } from "../scripts/postflop-ai/range-equity.ts";
import { parseCards, parseFlopBoard, runoutTexture, TIERS } from "../scripts/postflop-ai/model.ts";
import { exactActionEv } from "../scripts/postflop-ai/exact-ev.mjs";
import { laterPolicyMix } from "../scripts/postflop-ai/later-policy.ts";
import { policyMix } from "../scripts/postflop-ai/policy.ts";
import { buildLocalBoard, buildLaterView, explainLocalCombo } from "../scripts/postflop-ai/local-view.mjs";
import { computeBoard, computeExplain, computeLaterView } from "../src/estimated/postflop-compute.ts";
import opening from "../src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../src/estimated/three-bet-responses.json" with { type: "json" };
import fourBets from "../src/estimated/four-bet-responses.json" with { type: "json" };
import limp from "../src/estimated/limp-responses.json" with { type: "json" };

const spotId = "BTN_open_BB_call", datasets = { opening, responses, threeBets, fourBets, limp };
const single = loadInputs(spotId, { sizing: "single" });
const candidate = loadCandidate(single), laterCandidate = loadLaterCandidate(single, candidate);
const originalPolicy = candidate.policy, laterPolicy = laterCandidate.policy;
const base = { spotId, sizing: "single", datasets, flopCandidate: candidate, laterCandidate };
const near = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} vs ${expected}`);
const sum = values => values.reduce((a, b) => a + b, 0);
const aggressive = mix => sum(Object.entries(mix).filter(([key]) => key !== "check").map(([, value]) => value));
function first(text, inputs = single, policy = originalPolicy, later = laterPolicy) {
  const board = parseFlopBoard(text).cards, table = replayDecision(inputs, board, { flop: [] });
  const defence = defenceFor(inputs, policy, later, { bluffCap: false });
  return { board, table, defence, dense: defence.rangeOf(table, board, inputs.spot.ip) };
}

for (const text of ["Qh8d2c", "9h8h4c", "7c7d2s"]) test(`Single ${text}: tier wager mass conserved and strongest combos filled first`, () => {
  const { board, table, defence, dense } = first(text);
  const tiers = tierArray(board), opponent = makeRange(defence.rangeOf(table, board, single.spot.oop));
  const ids = Array.from(dense, (weight, id) => weight > 0 ? id : -1).filter(id => id >= 0);
  const equities = equitiesVersus(opponent, ids, [rankTable(board)]);
  for (let tier = 0; tier < TIERS.length; tier++) {
    const items = ids.map((id, index) => ({ id, weight: dense[id], equity: equities[index] })).filter(item => tiers[item.id] === tier);
    if (!items.length) continue;
    let before = 0, after = 0;
    for (const item of items) {
      const combo = [Math.floor(item.id / 52), item.id % 52], raw = policyMix(originalPolicy, "btn_first", combo, board);
      const purified = defence.baseMix(table, board, "btn_first", combo);
      before += item.weight * aggressive(raw) / 100;
      after += item.weight * aggressive(purified) / 100;
      item.share = aggressive(purified) / 100;
      near(sum(Object.values(purified)), 100, `${text}/${item.id} normalization`);
      assert.ok(Object.entries(purified).filter(([action, value]) => action !== "check" && value > 0).length <= 1);
    }
    near(after, before, `${text}/${TIERS[tier]} wager mass`);
    assert.ok(items.filter(item => item.share > 1e-12 && item.share < 1 - 1e-12).length <= 1, `${text}/${TIERS[tier]} one fractional boundary`);
    items.sort((a, b) => (b.equity ?? -Infinity) - (a.equity ?? -Infinity) || a.id - b.id);
    for (let index = 1; index < items.length; index++) assert.ok(items[index - 1].share + 1e-12 >= items[index].share, `${text}/${TIERS[tier]} descending equity, ascending combo id`);
  }
});

test("omitted/explicit Multi retain every original tier mix and immutable fresh report", () => {
  const omitted = loadInputs(spotId), multi = loadInputs(spotId, { sizing: "multi" });
  const mc = loadCandidate(omitted), ml = loadLaterCandidate(omitted, mc);
  const expected = {
    Qh8d2c: [[45, 40, 13, 2], [20, 50, 27, 3], [45, 40, 13, 2]],
    "9h8h4c": [[68, 6, 21, 5], [40, 8, 40, 12], [70, 16, 12, 2]],
    "7c7d2s": [[78, 15, 6, 1], [78, 15, 6, 1], [78, 15, 6, 1]],
  };
  for (const [text, mixes] of Object.entries(expected)) for (const inputs of [omitted, multi]) {
    const { board, table, defence } = first(text, inputs, mc.policy, ml.policy);
    for (const [index, cards] of ["AsKh", "QcJd", "5c4d"].entries()) {
      const combo = parseCards(cards, 2), original = policyMix(mc.policy, "btn_first", combo, board);
      assert.deepEqual(Object.values(defence.baseMix(table, board, "btn_first", combo)), mixes[index]);
      assert.deepEqual(defence.baseMix(table, board, "btn_first", combo), original);
    }
  }
  const bytes = readFileSync(new URL("../scripts/data/postflop-ai/policies/btn-bb-srp-v1-report.json", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "cca0d293e2eac98c0cd46afe6d98ce171278624edd863ed92c44050f03bfe444");
  assert.equal(isFreshSimulationReport(omitted, mc, ml, readArtifact(omitted.spot, "report")), true);
});

test("one-action nodes stay unchanged; facing nodes keep their original base and defence algorithm", () => {
  for (const selected of ["check", "bet33"]) {
    const policy = structuredClone(originalPolicy);
    for (const rule of policy.rules.filter(rule => rule.node === "btn_first")) rule.mix = Object.fromEntries(Object.keys(rule.mix).map(key => [key, key === selected ? 100 : 0]));
    const { board, table, defence, dense } = first("Qh8d2c", single, policy);
    for (let id = 0; id < dense.length; id++) if (dense[id] > 0) assert.deepEqual(defence.baseMix(table, board, "btn_first", [Math.floor(id / 52), id % 52]), policyMix(policy, "btn_first", [Math.floor(id / 52), id % 52], board));
  }
  const board = parseFlopBoard("Qh8d2c").cards, table = replayDecision(single, board, { flop: ["bet33"] });
  const defence = defenceFor(single, originalPolicy, laterPolicy, { bluffCap: false }), node = table.log.at(-1).node;
  const dense = defence.rangeOf(table, board, single.spot.oop), context = defence.context(table, board, node);
  assert.ok(context);
  for (const id of Array.from(dense, (weight, id) => weight > 0 ? id : -1).filter(id => id >= 0).slice(0, 3)) {
    const combo = [Math.floor(id / 52), id % 52];
    const raw = policyMix(originalPolicy, node, combo, board);
    assert.deepEqual(defence.baseMix(table, board, node, combo), raw);
    const equity = defence.equity(context, combo);
    assert.deepEqual(defence.mix(table, board, node, combo, raw), defence.applyEquity(context, raw, equity, combo));
  }
});

test("Single exact-combo browser, view and explanation mixes agree without suit-coordinate tie drift", () => {
  const text = "Qh8d2c", view = buildLocalBoard(text, single, candidate);
  assert.deepEqual(computeBoard({ ...base, board: text }), view);
  const reachable = view.nodes.btn_first.rows.filter(row => row.reachable), mixed = reachable.filter(row => Object.values(row.mix).filter(share => share > 1e-9).length > 1);
  assert.equal(reachable.length, 119); assert.ok(mixed.length < 119, `mixed hand classes reduced: ${mixed.length}`);
  const { board, table, defence } = first(text);
  for (const cards of ["AsKh", "QcJd", "5c4c"]) {
    const combo = parseCards(cards, 2), id = comboId(...combo);
    const displayed = view.nodes.btn_first.rows.flatMap(row => row.combos).find(item => comboId(...parseCards(item.cards, 2)) === id);
    assert.ok(displayed);
    const effective = defenceFor(single, originalPolicy).mix(table, board, "btn_first", combo, defence.baseMix(table, board, "btn_first", combo));
    for (const [action, value] of Object.entries(effective)) near(displayed.mix[action], value / 100, `${cards}/${action} view`);
    const params = new URLSearchParams({ board: text, node: "btn_first", cards });
    const local = explainLocalCombo(params, single, candidate);
    assert.deepEqual(computeExplain({ ...base, board: text, node: "btn_first", cards }), local);
    assert.equal(local.sizing, "single");
  }
});

test("Single later and historical reach use purified past decisions without future-card leakage", () => {
  const flop = "Qh8d2c", turn = "3s", board = parseFlopBoard(flop).cards, laterBoard = [...board, ...parseCards(turn, 1)];
  const defence = defenceFor(single, originalPolicy, laterPolicy, { bluffCap: false });
  const rootTable = replayDecision(single, board, { flop: [] });
  const rootDense = defence.rangeOf(rootTable, board, single.spot.ip);
  const past = replayDecision(single, laterBoard, { flop: ["check"], turn: [] });
  const historical = defence.rangeOf(past, laterBoard, single.spot.ip);
  for (let id = 0; id < rootDense.length; id++) if (rootDense[id] > 0) {
    const combo = [Math.floor(id / 52), id % 52];
    const expected = combo.some(card => laterBoard.includes(card)) ? 0 : rootDense[id] * defence.baseMix(rootTable, board, "btn_first", combo).check / 100;
    near(historical[id], expected, `past check reach/${id}`);
  }
  const later = { flop, flopActions: "check", turn, turnActions: "check" };
  assert.deepEqual(computeLaterView({ ...base, ...later }), buildLaterView(later, single, candidate, laterCandidate));
  // Identical current node/actor prefix with distinct opponent histories must not alias a cache.
  const histories = [["check"], ["bet33", "call"]];
  const cached = histories.map(actions => {
    const table = replayDecision(single, laterBoard, { flop: actions, turn: [] });
    return { table, dense: defence.rangeOf(table, laterBoard, single.spot.ip) };
  });
  assert.notDeepEqual(cached[0].dense, cached[1].dense);
  for (const { table, dense } of cached) assert.deepEqual(defence.rangeOf(table, laterBoard, single.spot.ip), dense);
  for (const future of ["Ah", "5d"]) {
    const full = [...laterBoard, ...parseCards(future, 1)], table = replayDecision(single, full, { flop: ["check"], turn: ["check", "check"], river: [] });
    const before = defence.baseMix(rootTable, board, "btn_first", parseCards("AsKh", 2));
    defence.rangeOf(table, full, single.spot.ip);
    assert.deepEqual(defence.baseMix(rootTable, board, "btn_first", parseCards("AsKh", 2)), before);
  }
});


test("Single audit freshness is versioned separately without regenerating saved reports", () => {
  const saved = readArtifact(single.spot, "report", { sizing: "single" });
  assert.equal(isFreshSimulationReport(single, candidate, laterCandidate, { ...saved, defence_version: 7 }), false);
  // Build report identity around saved result records only; no simulation or writes.
  const updated = simulationReport(single, candidate.policy, config.samples_per_board_profile_seat, laterCandidate, saved.results);
  assert.equal(updated.defence_version, SINGLE_DEFENCE_VERSION);
  assert.equal(isFreshSimulationReport(single, candidate, laterCandidate, updated), true);
});

test("Single river wager budgets include a binding bluff cap exactly once", () => {
  const board = parseCards("9h8h4c3sAh", 5), table = replayDecision(single, board, { flop: ["check"], turn: ["check", "check"], river: [] });
  const node = table.log.at(-1).node, actor = table.log.at(-1).seat;
  const defence = defenceFor(single, originalPolicy, laterPolicy), dense = defence.rangeOf(table, board, actor);
  const cap = defence.betting(table, board, node), tiers = tierArray(board);
  assert.ok(cap && cap.caps.some(item => item.factor < 1), "real river has a binding pre-existing cap");
  const before = Array(TIERS.length).fill(0), after = Array(TIERS.length).fill(0);
  for (let id = 0; id < dense.length; id++) if (dense[id] > 0) {
    const combo = [Math.floor(id / 52), id % 52], raw = defence.policyRule(table.log.at(-1), runoutTexture(board), tiers[id]);
    const effective = cap.applyCombo(raw, combo);
    const purified = defence.baseMix(table, board, node, combo);
    assert.deepEqual(defence.mix(table, board, node, combo, purified), purified, "already-effective purified mix is not capped twice");
    before[tiers[id]] += dense[id] * aggressive(effective) / 100;
    after[tiers[id]] += dense[id] * aggressive(purified) / 100;
  }
  for (let tier = 0; tier < TIERS.length; tier++) near(after[tier], before[tier], `${TIERS[tier]} capped wager mass`);
});

for (const [text, paths] of [
  ["Qh8d2c3s", { flop: ["check"], turn: [] }],
  ["9h8h4c3sAh", { flop: ["check"], turn: ["check", "check"], river: [] }],
]) test(`Single later ${text}: reached tier mass, one boundary and current-board monotonicity`, () => {
  const board = parseCards(text, text.length / 2), table = replayDecision(single, board, paths), entry = table.log.at(-1);
  const defence = defenceFor(single, originalPolicy, laterPolicy, { bluffCap: false }), dense = defence.rangeOf(table, board, entry.seat), tiers = tierArray(board);
  const ids = Array.from(dense, (weight, id) => weight > 0 ? id : -1).filter(id => id >= 0);
  const equities = equitiesVersus(makeRange(defence.rangeOf(table, board, table.other(entry.seat))), ids, [rankTable(board)]);
  for (let tier = 0; tier < TIERS.length; tier++) {
    const items = ids.map((id, index) => ({ id, weight: dense[id], equity: equities[index] })).filter(item => tiers[item.id] === tier);
    let before = 0, after = 0;
    for (const item of items) {
      const raw = defence.policyRule(entry, runoutTexture(board), tier), purified = defence.baseMix(table, board, entry.node, [Math.floor(item.id / 52), item.id % 52]);
      before += item.weight * aggressive(raw) / 100; after += item.weight * aggressive(purified) / 100; item.share = aggressive(purified) / 100;
    }
    near(after, before, `${entry.node}/${TIERS[tier]} reached mass`);
    assert.ok(items.filter(item => item.share > 1e-12 && item.share < 1 - 1e-12).length <= 1);
    items.sort((a, b) => (b.equity ?? -Infinity) - (a.equity ?? -Infinity) || a.id - b.id);
    for (let index = 1; index < items.length; index++) assert.ok(items[index - 1].share + 1e-12 >= items[index].share);
  }
});

test("offline exactActionEv downstream caches read Single combo maps, not one mix per tier", () => {
  const board = parseCards("Qh8d2c3sAh", 5), rootPath = { flop: ["check"], turn: [], river: [] };
  const table = replayDecision(single, board.slice(0, 4), rootPath), node = table.log.at(-1).node;
  const defence = defenceFor(single, originalPolicy, laterPolicy, { bluffCap: false }), calls = [];
  const model = new Proxy(defence, { get(target, key) {
    if (key === "baseMix") return (table, cards, node, combo) => { calls.push({ node, id: comboId(...combo) }); return target.baseMix(table, cards, node, combo); };
    const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
  } });
  const hero = defence.rangeItems(table, board, table.log.at(-1).seat).slice(0, 1);
  const opponents = defence.rangeItems(table, board, table.other(table.log.at(-1).seat)).filter(item => item.combo.every(card => !hero[0].combo.includes(card))).slice(0, 8);
  const result = exactActionEv({ spot: single.spot, defence: model, rootPath, finals: [board], expectedNode: node, heroGroups: [{ key: "hero", items: hero }], oppItems: opponents });
  assert.ok(result.rows.has("hero"));
  const downstream = calls.filter(call => call.node.startsWith("river_") && call.node.endsWith("_first"));
  assert.ok(downstream.length > 0, "offline tree visits downstream river Single maps");
  assert.ok(new Set(downstream.map(call => call.id)).size > 1, "cached opponent probabilities read multiple exact combos");
});

test("Single capped first allocation restores actual cap totals after betting-cache eviction", () => {
  const inputs = { ...single }, board = parseCards("9h8h4c3sAh", 5);
  const paths = { flop: ["check"], turn: ["check", "check"], river: [] };
  const table = replayDecision(inputs, board, paths), node = table.log.at(-1).node;
  const defence = defenceFor(inputs, originalPolicy, laterPolicy), dense = defence.rangeOf(table, board, table.log.at(-1).seat);
  const id = dense.findIndex(weight => weight > 0);
  defence.baseMix(table, board, node, [Math.floor(id / 52), id % 52]);
  const original = defence.betting(table, board, node);
  assert.ok(original.caps.some(cap => cap.factor < 1));
  const totals = original.caps.map(({ action, valueAfter, bluffAfter }) => ({ action, valueAfter, bluffAfter }));
  defence.bets.river.clear();
  const rebuilt = defence.betting(table, board, node);
  assert.deepEqual(rebuilt.caps.map(({ action, valueAfter, bluffAfter }) => ({ action, valueAfter, bluffAfter })), totals);
  const facedTable = replayDecision(inputs, board, { ...paths, river: ["bet125"] });
  const faced = defence.context(facedTable, board, facedTable.log.at(-1).node);
  assert.ok(faced);
  const expected = totals.find(cap => cap.action === "bet125");
  near(faced.facedCap.valueAfter, expected.valueAfter, "evicted faced cap value mass");
  near(faced.facedCap.bluffAfter, expected.bluffAfter, "evicted faced cap bluff mass");
});


test("Multi and legacy custom playHand models retain mix calls when computedDefence is explicitly false", () => {
  const inputs = loadInputs(spotId), mc = loadCandidate(inputs), ml = loadLaterCandidate(inputs, mc);
  const hands = { BTN: parseCards("AsKh", 2), BB: parseCards("QcJd", 2) };
  const flop = parseFlopBoard("9h8h4c").cards, runout = parseCards("3sAh", 2), randoms = Array(64).fill(0.5);
  randoms[0] = 0.9; // Opponent bets on the flop before the hero model acts.
  for (const modelInputs of [inputs, undefined]) {
    const execute = flag => {
      const calls = [], defence = {
        ...(modelInputs ? { inputs: modelInputs } : {}),
        baseMix(table, board, node, combo) {
          return board.length === 3 ? policyMix(mc.policy, node, combo, board)
            : laterPolicyMix(ml.policy, node, combo, board, table.log.at(-1).line);
        },
        mix(table, board, node, combo, raw) {
          calls.push(node);
          // Deliberately differ from the raw tier mix, forcing calls/checks so the
          // same hand exercises both flop and later-street model invocation.
          const selected = "check" in raw ? "check" : "call";
          return Object.fromEntries(Object.keys(raw).map(action => [action, action === selected ? 100 : 0]));
        },
      };
      const result = playHand({ hands, flop, runout, hero: "BB", policy: mc.policy, laterPolicy: ml.policy,
        profile: "standard", randoms, spot: inputs.spot, defence, ...(flag === undefined ? {} : { computedDefence: flag }) });
      return { result, calls };
    };
    const original = execute(undefined);
    assert.ok(original.calls.some(node => node.startsWith("bb_vs_")), "mock model called at flop facing node");
    assert.ok(original.calls.some(node => node.startsWith("turn_")), "mock model called on later street");
    assert.deepEqual(execute(true), original);
    assert.deepEqual(execute(false), original, "extra false flag must not bypass Multi or legacy custom models");
  }
});
