// One process per cold request; no artifact writes. Usage: node .../ondemand.ts flop|turn|river
import assert from "node:assert/strict";
import { loadInputs } from "../inputs.ts";
import { loadCandidate, loadLaterCandidate } from "../generate.ts";
import { flopHandEvForHand } from "../flop-hand-ev-core.ts";
import { laterHandEvForHand } from "../later-hand-ev-core.ts";

const inputs = loadInputs("BTN_open_BB_call"), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
const street = process.argv[2] ?? "flop";
assert.ok(["flop", "turn", "river"].includes(street));
const request = { flop: "As7d2c", hand: "AKo", inputs, flopPolicy: candidate.policy, laterPolicy: later.policy };
const run = street === "flop" ? () : any => flopHandEvForHand(request)
  : () : any => laterHandEvForHand({ ...request, flopActions: ["bet33", "call"], turn: "3s",
    ...(street === "river" ? { turnActions: ["check", "check"], river: "5s", riverActions: ["check", "bet75"] } : {}) });
let t = performance.now();
const cold = run(), coldMs = performance.now() - t;
t = performance.now();
const warm = run(), warmMs = performance.now() - t;
assert.deepEqual(warm, cold);
// W3 budgets: river 50 ms, turn 400 ms, flop 1.5 s. Exhaustive turn / flop measured above them; see postflop-flop-base.md.
const targetMs = street === "flop" ? 1500 : street === "turn" ? 400 : 50;
console.log(JSON.stringify({ street, method: "exact",
  coldMs: Math.round(coldMs), warmMs: Math.round(warmMs), targetMs, withinTarget: coldMs <= targetMs, equal: true }));
