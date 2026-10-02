import test from "node:test";
import assert from "node:assert/strict";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { referencePolicy, referencePolicyFor } from "../scripts/postflop-ai/policy.mjs";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.mjs";
import { parseCards } from "../scripts/postflop-ai/model.mjs";
import { combosOf } from "../scripts/lib/equity.mjs";
import { laterHandEvForHand } from "../scripts/postflop-ai/later-hand-ev.mjs";

const inputs = loadInputs("BTN_open_BB_call");
const flopPolicy = referencePolicy;
const laterPolicy = referenceLaterPolicy();
const turnBase = { flop: "As7d2c", flopActions: ["check"], turn: "3s", turnActions: [],
  hand: "AKo", inputs, flopPolicy, laterPolicy, samples: 8 };

test("on-demand turn result has the legal row shape and is deterministic", () => {
  const first = laterHandEvForHand(turnBase);
  const again = laterHandEvForHand(turnBase);
  assert.deepEqual(first, again);
  assert.equal(first.street, "turn");
  assert.equal(first.node, "turn_oop_first");
  assert.equal(first.actor, inputs.spot.oop);
  assert.ok(Number.isFinite(first.pot_bb));
  assert.ok(first.row);
  assert.deepEqual(Object.keys(first.row).sort(), ["eqr", "equity_pct", "ev_bb", "mix", "mix_ev_bb"]);
  assert.deepEqual(Object.keys(first.row.ev_bb), LATER_NODES[first.node]);
  assert.deepEqual(Object.keys(first.row.mix), LATER_NODES[first.node]);
  assert.equal(Object.values(first.row.mix).reduce((sum, value) => sum + value, 0), 100);
  assert.ok(Number.isFinite(first.row.equity_pct));
  assert.ok(Number.isFinite(first.row.mix_ev_bb));
});

test("on-demand river follows the completed turn path and retains its action keys", () => {
  const result = laterHandEvForHand({ ...turnBase, turnActions: ["check", "check"], river: "5s", riverActions: [] });
  assert.equal(result.street, "river");
  assert.equal(result.node, "river_oop_first");
  assert.deepEqual(Object.keys(result.row.ev_bb), LATER_NODES[result.node]);
  assert.equal(Object.values(result.row.mix).reduce((sum, value) => sum + value, 0), 100);
});

test("on-demand evaluation accepts a flop outside the persisted representative set", () => {
  const result = laterHandEvForHand({ ...turnBase, flop: "Kh6s3d", turn: "4c", samples: 3 });
  assert.equal(result.street, "turn");
  assert.ok(result.row);
});

test("board-blocked combos in a requested class are excluded before policy evaluation", () => {
  const narrowed = structuredClone(inputs);
  narrowed.seatRows[inputs.spot.oop] = [{ hand: "AKo", freq: 100 }];
  const flop = parseCards(turnBase.flop, 3), turn = parseCards(turnBase.turn, 1)[0];
  const overlaps = combosOf("AKo").filter(combo => combo.some(card => [...flop, turn].includes(card)));
  assert.ok(overlaps.length > 0, "the chosen class includes board-blocked combos");

  // laterPolicyMix's hand evaluator rejects private cards duplicated on the board. A result
  // therefore confirms the blocked AKo combos never enter the reach-weighted actor sampler.
  const result = laterHandEvForHand({ ...turnBase, inputs: narrowed, samples: 4 });
  assert.ok(result.row);
  assert.ok(Number.isFinite(result.row.equity_pct));
});

test("a node with zero opponent reach is explicitly unreachable", () => {
  const noBet = structuredClone(laterPolicy);
  for (const rule of noBet.streets.turn.rules.filter(item => item.node === "turn_oop_first")) {
    rule.mix.check += rule.mix.bet33;
    rule.mix.bet33 = 0;
  }
  const result = laterHandEvForHand({ ...turnBase, turnActions: ["bet33"], laterPolicy: noBet });
  assert.equal(result.node, "turn_ip_vs_33");
  assert.equal(result.row, null);
  assert.equal(result.unreachable, true);
});

test("narrow 4bet ranges terminate by sampling only compatible opponent combos", () => {
  const fourBetInputs = loadInputs("HJ_open_BTN_4bp_call");
  const narrowed = structuredClone(fourBetInputs);
  narrowed.seatRows[fourBetInputs.spot.ip] = [{ hand: "AA", freq: 100 }];
  const started = performance.now();
  const result = laterHandEvForHand({ flop: "As7d2c", flopActions: ["check", "check"], turn: "3s", turnActions: [],
    hand: "KK", inputs: narrowed, flopPolicy: referencePolicyFor(fourBetInputs.spot.tree), laterPolicy,
    samples: 8 });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2000, `narrow-range request completed in ${elapsed.toFixed(1)}ms`);
  assert.equal(result.street, "turn");
  assert.ok(result.row, "the 4bet actor's KK has compatible AA opponent combos");
  assert.deepEqual(Object.keys(result.row.ev_bb), LATER_NODES[result.node]);
});
