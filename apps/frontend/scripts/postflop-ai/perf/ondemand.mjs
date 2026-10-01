// One process per cold request; no artifact writes. Usage: node .../ondemand.mjs flop|turn|river
import assert from "node:assert/strict";
import { loadInputs } from "../inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../generate.mjs";
import { FLOP_HAND_EV_FOR_HAND_DEFAULT_SAMPLES, flopHandEvForHand } from "../flop-hand-ev-core.mjs";
import { LATER_HAND_EV_FOR_HAND_DEFAULT_SAMPLES, laterHandEvForHand } from "../later-hand-ev-core.mjs";

const inputs = loadInputs("BTN_open_BB_call"), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
const street = process.argv[2] ?? "flop";
assert.ok(["flop", "turn", "river"].includes(street));
const request = { flop: "As7d2c", hand: "AKo", inputs, flopPolicy: candidate.policy, laterPolicy: later.policy };
const run = street === "flop" ? () => flopHandEvForHand(request)
  : () => laterHandEvForHand({ ...request, flopActions: ["bet33", "call"], turn: "3s",
    ...(street === "river" ? { turnActions: ["check", "check"], river: "5s", riverActions: ["check", "bet75"] } : {}) });
let t = performance.now();
const cold = run(), coldMs = performance.now() - t;
t = performance.now();
const warm = run(), warmMs = performance.now() - t;
assert.deepEqual(warm, cold);
const targetMs = street === "flop" ? 1500 : 500;
console.log(JSON.stringify({ street, samples: street === "flop" ? FLOP_HAND_EV_FOR_HAND_DEFAULT_SAMPLES : LATER_HAND_EV_FOR_HAND_DEFAULT_SAMPLES,
  coldMs: Math.round(coldMs), warmMs: Math.round(warmMs), targetMs, withinTarget: coldMs <= targetMs, equal: true }));
