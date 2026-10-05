import test from "node:test";
import assert from "node:assert/strict";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { referencePolicy, referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { defenceFor, replayDecision } from "../scripts/postflop-ai/defence.ts";
import { exactActionEv } from "../scripts/postflop-ai/exact-ev.mjs";
import { parseCards } from "../scripts/postflop-ai/model.ts";
import { laterHandEvForHand, laterHandEvForHandMonteCarlo } from "../scripts/postflop-ai/later-hand-ev-core.mjs";
import { flopHandEvForHand, flopHandEvForHandMonteCarlo, flopEvRunouts, FLOP_EV_RUNOUTS } from "../scripts/postflop-ai/flop-hand-ev-core.mjs";
import { parseFlopBoard } from "../scripts/postflop-ai/model.ts";
import { enumerateLaterEv } from "./reference/hand-ev-enumeration.mjs";

const inputs = loadInputs("BTN_open_BB_call"), flopPolicy = referencePolicy, laterPolicy = referenceLaterPolicy();
const defence = defenceFor(inputs, flopPolicy, laterPolicy);
const ranks = "23456789TJQKA";
const handClass = ([a, b]) => {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return ranks[high >> 2].repeat(2);
  return ranks[high >> 2] + ranks[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
};

// Exact vs plain enumeration (engine replays + defence.mix, no vectors or prefix sums) on thinned ranges.
function compare({ street, rootPath, board, hand, opponentStride, riverStride = 1, tolerance = 2e-3 }) {
  const probe = replayDecision(inputs, board, rootPath), { seat, node } = probe.log.at(-1);
  const opp = inputs.spot.ip === seat ? inputs.spot.oop : inputs.spot.ip;
  const heroItems = defence.rangeItems(probe, board, seat).filter(item => handClass(item.combo) === hand);
  const oppItems = defence.rangeItems(probe, board, opp).filter((_, index) => index % opponentStride === 0);
  const finals = street === "river" ? [board]
    : Array.from({ length: 52 }, (_, card) => card).filter(card => !board.includes(card))
      .filter((_, index) => index % riverStride === 0).map(card => [...board, card]);
  const groups = [{ key: hand, items: heroItems }];
  const exact = exactActionEv({ spot: inputs.spot, defence, rootPath, finals, expectedNode: node, heroGroups: groups, oppItems }).rows.get(hand);
  const reference = enumerateLaterEv({ spot: inputs.spot, defence, rootPath, rootNode: node, finals, heroGroups: groups, oppItems }).get(hand);
  assert.ok(exact && reference);
  assert.equal(exact.ev.length, reference.ev.length);
  assert.ok(Math.abs(exact.equity - reference.equity) < 1e-9, `equity ${exact.equity} vs ${reference.equity}`);
  reference.ev.forEach((value, k) => assert.ok(Math.abs(exact.ev[k] - value) < tolerance, `${node}/${hand}[${k}] ${exact.ev[k]} vs ${value}`));
}

const flop = parseCards("As7d2c", 3), turn = parseCards("3s", 1)[0], river = parseCards("5s", 1)[0];

test("exact EV equals plain enumeration at river decisions (first to act and facing a bet)", () => {
  const board = [...flop, turn, river];
  compare({ street: "river", rootPath: { flop: ["check"], turn: ["check", "check"], river: [] }, board, hand: "KQs", opponentStride: 5 });
  compare({ street: "river", rootPath: { flop: ["check"], turn: ["check", "check"], river: ["check", "bet75"] }, board, hand: "AKo", opponentStride: 5 });
});

test("exact EV equals plain enumeration at a turn decision over every river card", () => {
  compare({ street: "turn", rootPath: { flop: ["bet33", "call"], turn: [], river: [] }, board: [...flop, turn], hand: "77",
    opponentStride: 25, riverStride: 6 });
});

test("exact EV is identical across repeated requests and ignores sample counts and seeds", () => {
  const base = { flop: "As7d2c", flopActions: ["check"], turn: "3s", turnActions: ["check", "check"], river: "5s", riverActions: ["check", "bet75"],
    hand: "AKo", inputs, flopPolicy, laterPolicy };
  const first = laterHandEvForHand(base);
  assert.deepEqual(laterHandEvForHand(base), first);
  assert.deepEqual(laterHandEvForHand({ ...base, samples: 1, seed: 7 }), first);
  assert.deepEqual(Object.keys(first.row).sort(), ["eqr", "equity_pct", "ev_bb", "mix", "mix_ev_bb"]);
  assert.equal(first.row.ev_bb.fold, 0);
});

test("exact river EV agrees with the Monte Carlo it replaced within sampling error", () => {
  const request = { flop: "As7d2c", flopActions: ["check"], turn: "3s", turnActions: ["check", "check"], river: "5s", riverActions: ["check", "bet75"],
    hand: "AKo", inputs, flopPolicy, laterPolicy };
  const exact = laterHandEvForHand(request).row;
  const sampled = laterHandEvForHandMonteCarlo({ ...request, samples: 20000, seed: 11, rng: () => Math.random }).row;
  for (const action of Object.keys(exact.ev_bb)) assert.ok(Math.abs(exact.ev_bb[action] - sampled.ev_bb[action]) < 0.5, action);
  assert.ok(Math.abs(exact.equity_pct - sampled.equity_pct) < 2);
});

test("flop exact EV is a fixed expectation over the seeded runout set: repeatable and sample-independent", () => {
  assert.equal(flopEvRunouts(parseFlopBoard("As7d2c").cards).length, FLOP_EV_RUNOUTS);
  const request = { flop: "As7d2c", history: ["bet75"], hand: "KQs", inputs, flopPolicy, laterPolicy };
  const first = flopHandEvForHand(request);
  assert.ok(first.row);
  assert.deepEqual(Object.keys(first.row.ev_bb), ["fold", "call", "raise"]);
  assert.deepEqual(flopHandEvForHand({ ...request, samples: 3, seed: 5 }), first);
  const sampled = flopHandEvForHandMonteCarlo({ ...request, samples: 40, seed: 1,
    runoutSet: flopEvRunouts(parseFlopBoard("As7d2c").cards) });
  assert.deepEqual(Object.keys(sampled.row.ev_bb), Object.keys(first.row.ev_bb));
});

// Compare both cache representations over every reachable hero/opponent combo,
// with a fixed runout and both flop trees. This only adds coverage; the complete
// 24-runout board and sample-independence tests above remain unchanged.
test("cold and preselected compact caches give bit-identical exact flop EV in both trees", () => {
  for (const spotId of ["BTN_open_BB_call", "SB_open_BB_call"]) {
    const source = loadInputs(spotId), policy = referencePolicyFor(source.spot.tree), later = referenceLaterPolicy();
    const board = parseCards("As7d2c", 3), rootPath = { flop: ["bet75"], turn: [], river: [] };
    const evaluateWith = compact => {
      const input = { ...source }, cache = defenceFor(input, policy, later);
      cache.largeRun = compact;
      try {
        const table = replayDecision(input, board, rootPath), { seat, node } = table.log.at(-1);
        const opponent = seat === input.spot.ip ? input.spot.oop : input.spot.ip;
        const groups = new Map();
        for (const item of cache.rangeItems(table, board, seat)) {
          const key = handClass(item.combo);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        }
        return exactActionEv({ spot: input.spot, defence: cache, rootPath,
          finals: [[...board, ...parseCards("3s5s", 2)]], expectedNode: node,
          heroGroups: [...groups].map(([key, items]) => ({ key, items })),
          oppItems: cache.rangeItems(table, board, opponent) });
      } finally { cache.releaseBoardCaches(); }
    };
    assert.deepEqual(evaluateWith(true), evaluateWith(false), spotId);
  }
});
