import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dataset } from "../src/estimated/datasets.ts";
import { loadInputs, artifactPaths } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.mjs";
import { spotById } from "../scripts/postflop-ai/spots.mjs";
import { playHand, postflopSpotFor } from "../src/agent/hand.ts";
import { createAgent, makePostflopKit } from "../src/agent/policy.ts";
import { applyPreflop, handClass, nextActor, preflopOptions, startPreflop } from "../src/agent/preflop.ts";
import { createSession, finishHand, handSeed, seatPositions, toPoints } from "../src/agent/session.ts";
import { AGENT_TABLES } from "../src/agent/characters.ts";

const datasets = Object.fromEntries(["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "limp-responses"]
  .map(name => [name, dataset(name)]));
const kits = new Map();
const hasPolicies = id => { const paths = artifactPaths(spotById(id)); return existsSync(paths.candidate) && existsSync(paths.laterCandidate); };
// Saved candidates are local (gitignored). Without them every postflop pot is checked down.
const postflop = id => {
  if (!kits.has(id)) {
    let kit = null;
    if (hasPolicies(id)) {
      const inputs = loadInputs(id);
      const candidate = loadCandidate(inputs);
      kit = makePostflopKit(id, datasets, candidate, loadLaterCandidate(inputs, candidate));
    }
    kits.set(id, kit);
  }
  return kits.get(id);
};
const noPostflop = () => null;
const agents = createAgent();
const sum = values => Object.values(values).reduce((total, value) => total + value, 0);

test("same seed and human actions replay the same hand", () => {
  for (let i = 0; i < 20; i++) {
    const a = playHand({ seed: `replay-${i}`, human: null, agents, postflop });
    const b = playHand({ seed: `replay-${i}`, human: null, agents, postflop });
    assert.deepEqual(a, b);
  }
});

test("chips are conserved: returns plus rake sum to zero", () => {
  for (let i = 0; i < 60; i++) {
    const hand = playHand({ seed: `chips-${i}`, human: null, agents, postflop });
    assert.equal(hand.status, "done");
    assert.ok(Math.abs(sum(hand.returns) + hand.rake) < 0.02, `hand ${i}: ${JSON.stringify(hand.returns)} rake ${hand.rake}`);
    assert.ok(hand.rake === 0 || hand.board.length >= 3, "no flop, no drop");
  }
});

test("no flop is ever contested by three or more players", () => {
  for (let i = 0; i < 600; i++) {
    const hand = playHand({ seed: `multi-${i}`, human: null, agents, postflop: noPostflop });
    const preflop = hand.log.filter(entry => entry.street === "preflop");
    const folded = new Set(preflop.filter(entry => entry.action === "fold").map(entry => entry.pos));
    assert.ok(6 - folded.size <= 2, `hand ${i} went ${6 - folded.size}-way: ${preflop.map(e => `${e.pos}:${e.action}`).join(" ")}`);
  }
});

test("an agent plays the saved preflop frequencies", () => {
  // UTG with T8s: saved open 25 / fold 75.
  const state = startPreflop();
  const offered = preflopOptions(state, "UTG", "T8s");
  const counts = { open: 0, fold: 0 };
  for (let i = 0; i < 5000; i++) counts[agents.preflop({ pos: "UTG", hand: "T8s", cards: [], offered, random: (i + 0.5) / 5000 }).action.key]++;
  assert.ok(Math.abs(counts.open / 50 - 25) <= 3 && Math.abs(counts.fold / 50 - 75) <= 3, JSON.stringify(counts));
});

test("a call that would make the pot three-way moves to fold (table rule)", () => {
  let state = startPreflop();
  state = applyPreflop(state, "UTG", { type: "raise", to: 2.5, key: "open" });
  state = applyPreflop(state, "HJ", { type: "call", key: "call" });
  for (const pos of ["CO", "BTN"]) state = applyPreflop(state, pos, { type: "fold", key: "fold" });
  assert.equal(nextActor(state), "SB");
  const sb = preflopOptions(state, "SB", "KQs");
  assert.ok(!sb.choices.some(choice => choice.action.key === "call"));
  const total = sb.choices.reduce((sum, choice) => sum + choice.freq, 0);
  assert.ok(Math.abs(total - 100) < 0.01);
});

test("a heads-up line maps to its postflop spot", () => {
  const events = (...pairs) => pairs.map(([pos, type, key]) => ({ pos, type, key }));
  assert.equal(postflopSpotFor(events(["BTN", "raise", "open"], ["SB", "fold", "fold"], ["BB", "call", "call"])).id, "BTN_open_BB_call");
  assert.equal(postflopSpotFor(events(["CO", "raise", "open"], ["BTN", "raise", "three_bet"], ["SB", "fold", "fold"], ["BB", "fold", "fold"], ["CO", "call", "call"])).id, "CO_open_BTN_3bet_call");
  assert.equal(postflopSpotFor(events(["SB", "call", "limp"], ["BB", "check", "check"])).id, "SB_limp_BB_check");
  assert.equal(postflopSpotFor(events(["UTG", "raise", "open"], ["HJ", "call", "call"], ["BB", "raise", "squeeze"], ["UTG", "fold", "fold"], ["HJ", "call", "call"])), null);
});

test("without a postflop policy the pot is checked down", () => {
  let found = 0;
  for (let i = 0; i < 300 && found < 5; i++) {
    const hand = playHand({ seed: `missing-${i}`, human: null, agents, postflop: noPostflop });
    if (!hand.spotId) continue;
    found++;
    assert.equal(hand.policyMissing, true);
    assert.equal(hand.board.length, 5);
    assert.ok(hand.log.every(entry => entry.street === "preflop"));
  }
  assert.ok(found > 0);
});

test("the human is asked and the replay continues with the answer", () => {
  let hand, seed;
  for (let i = 0; i < 50; i++) {
    seed = `human-${i}`;
    hand = playHand({ seed, human: "BTN", agents, postflop: noPostflop });
    if (hand.status === "awaiting") break;
  }
  assert.equal(hand.status, "awaiting");
  assert.equal(hand.pending.pos, "BTN");
  const fold = hand.pending.options.find(option => option.key === "fold") ?? hand.pending.options[0];
  const next = playHand({ seed, human: "BTN", humanActions: [fold.key], agents, postflop: noPostflop });
  assert.deepEqual(next.log.slice(0, hand.log.length), hand.log);
  assert.equal(next.log[hand.log.length].pos, "BTN");
});

test("session: button moves each hand and points use 1BB = 100", () => {
  assert.equal(toPoints(1), 100);
  let session = createSession({ tableId: AGENT_TABLES[0].id, seed: "s", humanSeat: 0 });
  assert.equal(session.seats.filter(seat => seat.kind === "human").length, 1);
  assert.deepEqual(Object.values(seatPositions(session)).sort(), ["BB", "BTN", "CO", "HJ", "SB", "UTG"]);
  assert.equal(seatPositions(session)[0], "BTN");
  session = finishHand(session, { BTN: 1.5, SB: -0.5, BB: -1 });
  assert.equal(session.seats[0].points, 150);
  assert.equal(seatPositions(session)[1], "BTN");
  assert.notEqual(handSeed(session), "s|hand|0");
  const watch = createSession({ tableId: AGENT_TABLES[1].id, seed: "w", humanSeat: null });
  assert.equal(new Set(watch.seats.map(seat => seat.agentId)).size, 6);
});

test("hand classes", () => {
  assert.equal(handClass([12 * 4 + 3, 11 * 4 + 3]), "AKs");
  assert.equal(handClass([8 * 4, 7 * 4 + 1]), "T9o");
  assert.equal(handClass([5 * 4, 5 * 4 + 2]), "77");
});

test("agent-game stats: flags per hand and summary", async () => {
  const { handRecord, summarizeAgentHands } = await import("../src/agent/agent-stats.ts");
  const result = { status: "done", holeCards: {}, board: ["Ah", "Kd", "2c", "3s", "4h"], showdown: true, winners: ["BTN"], returns: { BTN: 9.5, BB: -10 }, rake: 0.5,
    log: [
      { street: "preflop", pos: "UTG", action: "fold" }, { street: "preflop", pos: "HJ", action: "fold" }, { street: "preflop", pos: "CO", action: "fold" },
      { street: "preflop", pos: "BTN", action: "open" }, { street: "preflop", pos: "SB", action: "fold" }, { street: "preflop", pos: "BB", action: "three_bet" },
      { street: "preflop", pos: "BTN", action: "call" }, { street: "flop", pos: "BB", action: "check" }, { street: "flop", pos: "BTN", action: "check" },
    ] };
  const btn = handRecord(result, "mochi-forest", "BTN", 1);
  assert.deepEqual({ vpip: btn.vpip, pfr: btn.pfr, threeBetOpp: btn.threeBetOpp, facedThreeBet: btn.facedThreeBet, foldedToThreeBet: btn.foldedToThreeBet, sawFlop: btn.sawFlop, showdown: btn.showdown, wonShowdown: btn.wonShowdown },
    { vpip: true, pfr: true, threeBetOpp: false, facedThreeBet: true, foldedToThreeBet: false, sawFlop: true, showdown: true, wonShowdown: true });
  const bb = handRecord(result, "mochi-forest", "BB", 2);
  assert.equal(bb.threeBetOpp, true); assert.equal(bb.threeBet, true); assert.equal(bb.wonShowdown, false);
  const summary = summarizeAgentHands([btn, bb]);
  assert.equal(summary.hands, 2);
  assert.equal(summary.threeBet, 1);
  assert.equal(summary.wsd, 0.5);
  assert.deepEqual(summary.trend, [9.5, -0.5]);
});
