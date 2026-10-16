import { fixtureValue } from "./fixture-value.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.ts";
import { buildInputs } from "../scripts/postflop-ai/browser-inputs.ts";
import { loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.ts";
import { buildLaterView, buildLocalBoard, explainLocalCombo, postflopResponse } from "../scripts/postflop-ai/local-view.ts";
import { explainLaterCombo, explainLaterCombos } from "../scripts/postflop-ai/explain-later.ts";
import { flopBetTable, flopUiFacts } from "../scripts/postflop-ai/flop-ui-facts.ts";
import { canonicalFlop } from "../scripts/postflop-ai/flop-isomorphism.ts";
import { computeBoard, computeExplain, computeLaterExplain, computeLaterView } from "../src/estimated/postflop-compute.ts";
import { NODES, treeNodes } from "../scripts/postflop-ai/policy.ts";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.ts";
import { parseFlopBoard } from "../scripts/postflop-ai/model.ts";
import { seededRandom } from "../scripts/lib/equity.ts";
import opening from "../src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../src/estimated/three-bet-responses.json" with { type: "json" };
import fourBets from "../src/estimated/four-bet-responses.json" with { type: "json" };
import limp from "../src/estimated/limp-responses.json" with { type: "json" };

const datasets = { opening, responses, threeBets, fourBets, limp };
const fixtures = [
  { spotId: "BTN_open_BB_call", flopActions: "check", firstNode: "btn_first", laterHand: "AKo" },
  { spotId: "HJ_open_BTN_4bp_call", flopActions: "check,check", firstNode: "oop_first", laterHand: "AA" },
];
const withoutCandidates = fixtures.some(({ spotId }) => {
  const paths = artifactPaths(loadInputs(spotId).spot);
  return !existsSync(paths.candidate) || !existsSync(paths.laterCandidate);
});

function assertJsonEqual(actual, expected, label) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), label);
}

function assertViewMixes(view, allowedActions, label) {
  for (const [nodeName, node] of Object.entries(view.nodes)) {
    assert.ok(fixtureValue<{ rows: any }>(node).rows.length === 169, `${label} ${nodeName} has 169 hand rows`);
    for (const row of fixtureValue<{ rows: any }>(node).rows) {
      assert.deepEqual(Object.keys(row.mix), allowedActions[nodeName], `${label} ${nodeName}/${row.hand} actions`);
      if (!row.reachable) continue;
      const total = Object.values<number>(row.mix).reduce<number>((sum, value) => (sum as unknown as number) + (value as unknown as number), 0);
      assert.ok(Number.isFinite(total) && Math.abs((total as unknown as number) - 1) < 1e-8, `${label} ${nodeName}/${row.hand} mix totals 1`);
      for (const combo of row.combos) {
        const comboTotal = Object.values<number>(combo.mix).reduce<number>((sum, value) => (sum as unknown as number) + (value as unknown as number), 0);
        assert.ok(Number.isFinite(comboTotal) && Math.abs((comboTotal as unknown as number) - 1) < 1e-8, `${label} ${nodeName}/${row.hand}/${combo.cards} mix totals 1`);
        assert.ok(Object.keys(combo.mix).every(action => allowedActions[nodeName].includes(action)), `${label} ${nodeName} has legal combo actions`);
      }
    }
  }
}

function cardText(card) {
  return "23456789TJQKA"[card >> 2] + "cdhs"[card & 3];
}

function randomFlop(random) {
  const deck = Array.from({ length: 52 }, (_, card) => card);
  for (let index = 0; index < 3; index++) {
    const selected = index + Math.floor(random() * (deck.length - index));
    [deck[index], deck[selected]] = [deck[selected], deck[index]];
  }
  return parseFlopBoard(deck.slice(0, 3).map(cardText).join(""));
}

test("browser input projection is JSON-identical to loadInputs for SRP and 4bet spots", () => {
  for (const { spotId } of fixtures) {
    assertJsonEqual(buildInputs(spotId, fixtureValue(datasets)), loadInputs(spotId), `${spotId} inputs`);
  }
});

test("browser postflop computations match the server-side route calculations", { skip: withoutCandidates && ".local candidate pair is unavailable" }, () => {
  for (const { spotId, flopActions, firstNode, laterHand } of fixtures) {
    const inputs = loadInputs(spotId);
    const flopCandidate = loadCandidate(inputs);
    const laterCandidate = loadLaterCandidate(inputs, flopCandidate);
    assert.ok(laterCandidate, `${spotId}: later candidate exists`);

    const board = "As7d2c";
    assertJsonEqual(computeBoard(fixtureValue({ spotId, board, datasets, flopCandidate })), buildLocalBoard(board, inputs, flopCandidate), `${spotId} board`);

    const explainParams = new URLSearchParams({ board, node: firstNode, cards: "KhKd", prev: "bet33" });
    assertJsonEqual(computeExplain(fixtureValue({ spotId, board, node: firstNode, cards: "KhKd", prev: "bet33", datasets, flopCandidate })),
      explainLocalCombo(explainParams, inputs, flopCandidate), `${spotId} flop explain`);
    const betTable = explainLocalCombo(explainParams, inputs, flopCandidate).bet_table;
    assert.ok(betTable && Object.values(betTable.actions).every(entry => fixtureValue<{ calledEquity: any }>(entry).calledEquity === null || fixtureValue<{ calledEquity: any }>(entry).calledEquity >= 0 && fixtureValue<{ calledEquity: any }>(entry).calledEquity <= 1), `${spotId} flop bet table`);
    assert.ok(Number.isFinite(betTable.actions.check.calledEquity), `${spotId} flop check equity`);
    const averageCombos = [{ cards: "KhKd", weight: 1 }, { cards: "QhJd", weight: 3 }];
    const averageFlopParams = new URLSearchParams({ board, node: firstNode, prev: "bet33", combos: JSON.stringify(averageCombos) });
    const expectedAverageFlop = { spot: inputs.spot.id, board,
      ...flopUiFacts({ boardCards: parseFlopBoard(board).cards, node: firstNode, prev: "bet33", combos: averageCombos,
        inputs, policy: flopCandidate.policy }),
      ...flopBetTable({ boardCards: parseFlopBoard(board).cards, node: firstNode, prev: "bet33", combos: averageCombos,
        inputs, policy: flopCandidate.policy }) };
    assertJsonEqual(computeExplain(fixtureValue({ spotId, board, node: firstNode, combos: averageCombos, prev: "bet33", datasets, flopCandidate })),
      expectedAverageFlop, `${spotId} average flop explanation`);
    assertJsonEqual(expectedAverageFlop, explainLocalCombo(averageFlopParams, inputs, flopCandidate), `${spotId} average flop route`);

    const later = { flop: board, flopActions, turn: "Kh", turnActions: "", river: "", riverActions: "" };
    assertJsonEqual(computeLaterView(fixtureValue({ spotId, ...later, datasets, flopCandidate, laterCandidate })),
      buildLaterView(later, inputs, flopCandidate, laterCandidate), `${spotId} later view`);

    const laterExplainParams = { ...later, cards: "QhJd" };
    const expectedLaterExplain = { spot: inputs.spot.id, ...explainLaterCombo({ ...laterExplainParams,
      inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy }) };
    assertJsonEqual(computeLaterExplain(fixtureValue({ spotId, ...laterExplainParams, datasets, flopCandidate, laterCandidate })),
      expectedLaterExplain, `${spotId} later explain`);
    assert.ok(expectedLaterExplain.bet_table?.actions && Object.values(expectedLaterExplain.bet_table.actions).every(entry => entry.calledEquity === null || Number.isFinite(entry.calledEquity)), `${spotId} later bet table`);
    const laterAverageCombos = [{ cards: "QcJd", weight: 1 }, { cards: "TcTd", weight: 3 }];
    const averageLaterParams = { ...later, combos: laterAverageCombos };
    const expectedAverageLater = { spot: inputs.spot.id, ...explainLaterCombos({ ...later, combos: laterAverageCombos,
      inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy }) };
    assertJsonEqual(computeLaterExplain(fixtureValue({ spotId, ...averageLaterParams, datasets, flopCandidate, laterCandidate })),
      expectedAverageLater, `${spotId} average later explanation`);
    const averageLaterRoute = postflopResponse("/local-postflop-later-explain", new URLSearchParams({ spot: spotId,
      flop: board, flopActions, turn: later.turn, turnActions: "", river: "", riverActions: "", combos: JSON.stringify(laterAverageCombos) }));
    assert.equal(averageLaterRoute.status, 200);
    assertJsonEqual(expectedAverageLater, averageLaterRoute.body, `${spotId} average later route`);
  }
});

test("non-representative monotone, paired, and dry flops match the read-only local middleware", { skip: withoutCandidates && ".local candidate pair is unavailable" }, () => {
  const spotId = "BTN_open_BB_call";
  const inputs = loadInputs(spotId);
  const flopCandidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, flopCandidate);
  const cases = [
    { board: "AsKsQs", texture: "monotone" },
    { board: "KhKd4h", texture: "paired" },
    { board: "8h6d2c", texture: "dry" },
  ];
  for (const { board, texture } of cases) {
    const browser = computeBoard(fixtureValue({ spotId, board, datasets, flopCandidate }));
    const local = buildLocalBoard(board, inputs, flopCandidate);
    assertJsonEqual(browser, local, `${board} flop view`);
    const route = postflopResponse("/local-postflop", new URLSearchParams({ spot: spotId, board }));
    assert.equal(route.status, 200, `${board} read-only middleware route`);
    assertJsonEqual(browser, route.body, `${board} middleware view`);
    assert.equal(browser.texture, texture);
    assertViewMixes(browser, NODES, `${board} flop`);

    const params = new URLSearchParams({ board, node: "btn_first", cards: "AhAd", prev: "bet33" });
    assertJsonEqual(computeExplain(fixtureValue({ spotId, board, node: "btn_first", cards: "AhAd", prev: "bet33", datasets, flopCandidate })),
      explainLocalCombo(params, inputs, flopCandidate), `${board} explanation`);
    const expectedExplain = computeExplain(fixtureValue({ spotId, board, node: "btn_first", cards: "AhAd", prev: "bet33", datasets, flopCandidate }));
    const explainRoute = postflopResponse("/local-postflop-explain", new URLSearchParams({ spot: spotId, board,
      node: "btn_first", cards: "AhAd", prev: "bet33" }));
    assert.equal(explainRoute.status, 200, `${board} explanation middleware route`);
    assertJsonEqual(expectedExplain, explainRoute.body, `${board} explanation middleware`);

    const laterArgs = { flop: board, flopActions: "check", turn: "3h", turnActions: "", river: "", riverActions: "" };
    assertJsonEqual(computeLaterView(fixtureValue({ spotId, ...laterArgs, datasets, flopCandidate, laterCandidate })),
      buildLaterView(laterArgs, inputs, flopCandidate, laterCandidate), `${board} turn view`);
    const laterRoute = postflopResponse("/local-postflop-later", new URLSearchParams({ spot: spotId, flop: board,
      flopActions: laterArgs.flopActions, turn: laterArgs.turn, turnActions: laterArgs.turnActions,
      river: laterArgs.river, riverActions: laterArgs.riverActions }));
    assert.equal(laterRoute.status, 200, `${board} later middleware route`);
    assertJsonEqual(computeLaterView(fixtureValue({ spotId, ...laterArgs, datasets, flopCandidate, laterCandidate })), laterRoute.body, `${board} later middleware`);
    const laterExplainArgs = { ...laterArgs, cards: "AhAd" };
    assertJsonEqual(computeLaterExplain(fixtureValue({ spotId, ...laterExplainArgs, datasets, flopCandidate, laterCandidate })),
      { spot: inputs.spot.id, ...explainLaterCombo({ ...laterExplainArgs, inputs,
        flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy }) }, `${board} turn explanation`);
    const laterExplainRoute = postflopResponse("/local-postflop-later-explain", new URLSearchParams({ spot: spotId,
      flop: board, flopActions: laterArgs.flopActions, turn: laterArgs.turn, turnActions: laterArgs.turnActions,
      river: "", riverActions: "", cards: "AhAd" }));
    assert.equal(laterExplainRoute.status, 200, `${board} later explanation middleware route`);
    assertJsonEqual(computeLaterExplain(fixtureValue({ spotId, ...laterExplainArgs, datasets, flopCandidate, laterCandidate })),
      laterExplainRoute.body, `${board} later explanation middleware`);
  }
});

test("30 seeded random flops build every flop node, turn and river views, ", { skip: withoutCandidates && ".local candidate pair is unavailable" }, () => {
  const spotId = "BTN_open_BB_call";
  const inputs = loadInputs(spotId);
  const flopCandidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, flopCandidate);
  const random = seededRandom(20260930);
  const flops = Array.from({ length: 30 }, () => randomFlop(random));
  assert.equal(new Set(flops.map(board => board.id)).size, 30, "all 30 seeded flops are distinct");

  for (const [flopIndex, flop] of flops.entries()) {
    const view = computeBoard(fixtureValue({ spotId, board: flop.id, datasets, flopCandidate }));
    assert.equal(Object.keys(view.nodes).length, treeNodes(inputs.spot.tree).length, `${flop.id} covers every flop node for ${inputs.spot.tree}`);
    assertViewMixes(view, NODES, `${flop.id} flop`);

    const used = new Set(flop.cards);
    const turnCard = Array.from({ length: 52 }, (_, card) => card).find(card => !used.has(card));
    used.add(fixtureValue(turnCard));
    const riverCard = Array.from({ length: 52 }, (_, card) => card).find(card => !used.has(card));
    const turn = cardText(turnCard), river = cardText(riverCard);
    const turnView = computeLaterView(fixtureValue({ spotId, flop: flop.id, flopActions: "check", turn, turnActions: "",
      datasets, flopCandidate, laterCandidate }));
    assert.equal(turnView.street, "turn", `${flop.id} turn view`);
    assert.ok(turnView.rows.length > 0);
    assert.ok(turnView.rows.every(row => Object.keys(row.mix).every(action => LATER_NODES[turnView.node].includes(fixtureValue(action))) &&
      (!row.reachable || Math.abs(Object.values<number>(row.mix).reduce<number>((sum, value) => sum + value, 0) - 1) < 1e-8)), `${flop.id} turn mixes`);
    const riverView = computeLaterView(fixtureValue({ spotId, flop: flop.id, flopActions: "check", turn, turnActions: "check,check",
      river, riverActions: "", datasets, flopCandidate, laterCandidate }));
    assert.equal(riverView.street, "river", `${flop.id} river view`);
    assert.ok(riverView.rows.length > 0);
    assert.ok(riverView.rows.every(row => Object.keys(row.mix).every(action => LATER_NODES[riverView.node].includes(fixtureValue(action))) &&
      (!row.reachable || Math.abs(Object.values<number>(row.mix).reduce<number>((sum, value) => sum + value, 0) - 1) < 1e-8)), `${flop.id} river mixes`);
  }
});
