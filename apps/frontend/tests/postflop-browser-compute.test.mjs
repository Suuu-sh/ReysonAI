import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { buildInputs } from "../scripts/postflop-ai/browser-inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.mjs";
import { buildLaterView, buildLocalBoard, explainLocalCombo } from "../scripts/postflop-ai/local-view.mjs";
import { explainLaterCombo } from "../scripts/postflop-ai/explain-later.mjs";
import { laterHandEvForHand } from "../scripts/postflop-ai/later-hand-ev.mjs";
import { computeBoard, computeExplain, computeLaterExplain, computeLaterHandEv, computeLaterView } from "../src/estimated/postflop-compute.ts";
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

test("browser input projection is JSON-identical to loadInputs for SRP and 4bet spots", () => {
  for (const { spotId } of fixtures) {
    assertJsonEqual(buildInputs(spotId, datasets), loadInputs(spotId), `${spotId} inputs`);
  }
});

test("browser postflop computations match the server-side route calculations", { skip: withoutCandidates && ".local candidate pair is unavailable" }, () => {
  for (const { spotId, flopActions, firstNode, laterHand } of fixtures) {
    const inputs = loadInputs(spotId);
    const flopCandidate = loadCandidate(inputs);
    const laterCandidate = loadLaterCandidate(inputs, flopCandidate);
    assert.ok(laterCandidate, `${spotId}: later candidate exists`);

    const board = "As7d2c";
    assertJsonEqual(computeBoard({ spotId, board, datasets, flopCandidate }), buildLocalBoard(board, inputs, flopCandidate), `${spotId} board`);

    const explainParams = new URLSearchParams({ board, node: firstNode, cards: "KhKd", prev: "bet33" });
    assertJsonEqual(computeExplain({ spotId, board, node: firstNode, cards: "KhKd", prev: "bet33", datasets, flopCandidate }),
      explainLocalCombo(explainParams, inputs, flopCandidate), `${spotId} flop explain`);

    const later = { flop: board, flopActions, turn: "Kh", turnActions: "", river: "", riverActions: "" };
    assertJsonEqual(computeLaterView({ spotId, ...later, datasets, flopCandidate, laterCandidate }),
      buildLaterView(later, inputs, flopCandidate, laterCandidate), `${spotId} later view`);

    const laterExplainParams = { ...later, cards: "QhJd" };
    const expectedLaterExplain = { spot: inputs.spot.id, ...explainLaterCombo({ ...laterExplainParams,
      inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy }) };
    assertJsonEqual(computeLaterExplain({ spotId, ...laterExplainParams, datasets, flopCandidate, laterCandidate }),
      expectedLaterExplain, `${spotId} later explain`);

    const handEv = { flop: board, flopActions: flopActions.split(","), turn: "Kh", turnActions: [], river: null,
      riverActions: [], hand: laterHand, samples: 8 };
    const expectedHandEv = laterHandEvForHand({ ...handEv, inputs,
      flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy });
    assertJsonEqual(computeLaterHandEv({ spotId, ...handEv, datasets, flopCandidate, laterCandidate }),
      expectedHandEv, `${spotId} later hand EV`);
  }
});
