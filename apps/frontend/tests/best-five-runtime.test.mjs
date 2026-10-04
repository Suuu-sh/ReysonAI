import test from "node:test";
import assert from "node:assert/strict";
import { parseCards } from "../scripts/postflop-ai/model.mjs";
import { rankTable, comboId } from "../scripts/postflop-ai/defence.mjs";
import { makeRange, equityVersus, equitiesVersus } from "../scripts/postflop-ai/range-equity.mjs";
import { createTable, settle } from "../scripts/postflop-ai/engine.mjs";
import { fiveCardScore } from "./reference/best-five.mjs";

const tied = [
  ["7s7h7dAsKs", "2c3c", "4c5c"], // trips: only A/K are kickers
  ["7s7h7d7cAs", "2c2d", "3c3d"], // quads: the board ace beats both pairs
  ["AsAhKdQcJs", "2c3c", "4c5c"], // pair: only K/Q/J are kickers
  ["KsKhQdQcAs", "2c2d", "3c3d"], // two pair: the board ace beats the third pair
];

for (const [boardText, heroText, villainText] of tied) {
  test(`runtime settlement and all postflop equity paths split board ${boardText}`, () => {
    const board = parseCards(boardText, 5), hero = parseCards(heroText, 2), villain = parseCards(villainText, 2);
    const ranks = rankTable(board), heroId = comboId(...hero), villainId = comboId(...villain);
    assert.equal(ranks.score[heroId], fiveCardScore(board));
    assert.equal(ranks.score[villainId], fiveCardScore(board));
    const dense = new Float64Array(52 * 52); dense[villainId] = 1;
    for (const wasm of [false, true]) {
      const range = makeRange(dense);
      // First scan, WASM, indexed-prefix, and batched queries must agree on ties.
      for (let i = 0; i < 6; i++) assert.equal(equityVersus(range, heroId, [ranks], { wasm }), 0.5);
      assert.deepEqual(equitiesVersus(makeRange(dense), [heroId], [ranks], { wasm }), [0.5]);
    }
    const table = createTable({ ip: "BTN", oop: "BB", potBb: 5.5, stackBb: 97.5 });
    table.put("BTN", 10); table.put("BB", 10);
    assert.equal(settle(table, { BTN: hero, BB: villain }, board), "tie");
    assert.equal(table.pot, 25.5);
    assert.deepEqual(table.invested, { BTN: 10, BB: 10 });
  });
}

test("real kickers still win and folded pots bypass showdown", () => {
  const board = parseCards("7s7h7dQc2s", 5), hands = { BTN: parseCards("AcKc", 2), BB: parseCards("JcTc", 2) };
  const table = createTable({ ip: "BTN", oop: "BB", potBb: 5.5, stackBb: 97.5 });
  assert.equal(settle(table, hands, board), "BTN");
  const folded = createTable(table.spot); folded.winner = "BB";
  assert.equal(settle(folded, hands, board), "BB");
});

test("agent replay splits winnings in both check-down and policy-driven settlement", async () => {
  const { playHand } = await import("../src/agent/hand.ts");
  const { loadInputs } = await import("../scripts/postflop-ai/inputs.mjs");
  const agents = {
    preflop: ({ pos }) => ({ action: pos === "BTN" ? { type: "raise", key: "open", to: 2.5 }
      : pos === "BB" ? { type: "call", key: "call" } : { type: "fold", key: "fold" } }),
    postflop: () => ({ action: "check" }),
  };
  for (const postflop of [() => null, id => ({ inputs: loadInputs(id) })]) {
    const hand = playHand({ seed: "best-five-split-182", human: null, agents, postflop });
    assert.equal(hand.status, "done");
    assert.equal(hand.showdown, true);
    assert.deepEqual([...hand.winners].sort(), ["BB", "BTN"]);
    assert.equal(hand.returns.BTN, hand.returns.BB);
    assert.ok(Math.abs(Object.values(hand.returns).reduce((a, b) => a + b, 0) + hand.rake) < 0.02);
  }
});
