import test from "node:test";
import assert from "node:assert/strict";
import { playHand } from "../src/agent/hand.ts";
import { parseCards } from "../scripts/postflop-ai/model.ts";
import config from "../scripts/data/postflop-ai-pilot.json" with { type: "json" };

const cards = text => parseCards(text, text.length / 2);
function replay({ board, hero = "Ad8c", villain = "Qs6s", policy = true }) {
  const hole = { UTG: cards("2c2d"), HJ: cards("3c3d"), CO: cards("4c4d"),
    SB: cards("5c5d"), BTN: cards(hero), BB: cards(villain) };
  const used = [...Object.values(hole).flat(), ...cards(board)];
  assert.equal(new Set(used).size, used.length, "fixture must be a legal deal");
  return playHand({ seed: "showdown-regression", dealt: { hole, board: cards(board) }, human: "BTN",
    humanActions: ["open", "check", ...(policy ? ["call", "call"] : ["check", "check"])],
    postflop: () => policy ? { inputs: { config } } : null,
    agents: {
      preflop: ({ pos, offered }) => ({ action: offered.choices.find(choice => choice.action.key === (pos === "BB" ? "call" : "fold")).action }),
      postflop: ({ street, actions }) => ({ action: street === "flop" ? "check" : street === "turn" ? "bet33" : "bet75" }),
    },
  });
}

for (const policy of [true, false]) {
  test(`Agent payout awards a flush over a straight (${policy ? "saved-policy engine" : "missing-policy checkdown"})`, () => {
    const result = replay({ board: "Qc9s7sTsJh", policy });
    assert.equal(result.status, "done");
    assert.equal(result.showdown, true);
    assert.deepEqual(result.winners, ["BB"]);
    assert.deepEqual(result.handRanks, { BTN: 4, BB: 5 });
    assert.ok(result.returns.BTN < 0);
    assert.ok(result.returns.BB > 0);
    assert.ok(Math.abs(Object.values(result.returns).reduce((sum, value) => sum + value, 0) + result.rake) < 0.02);
    if (policy) {
      assert.deepEqual(result.log.filter(entry => entry.street !== "preflop").map(entry => entry.action),
        ["check", "check", "bet33", "call", "bet75", "call"]);
      assert.equal(result.returns.BTN, -11.18);
    }
  });
}

test("dark spades and clubs are distinct: three board spades do not make a Q6-club flush", () => {
  const result = replay({ board: "Qs9s7sTcJh", villain: "Qc6c" });
  assert.deepEqual(result.winners, ["BTN"]);
  assert.deepEqual(result.handRanks, { BTN: 4, BB: 1 });
  assert.equal(result.returns.BTN, 10.54);
});

test("Agent showdown splits a board straight despite different hole kickers", () => {
  const result = replay({ board: "9cTdJhQsKc", hero: "2h8c", villain: "7s6s" });
  assert.deepEqual(result.winners, ["BTN", "BB"]);
  assert.deepEqual(result.handRanks, { BTN: 4, BB: 4 });
  assert.equal(result.returns.BTN, result.returns.BB);
});

test("saved history captures exact cards/actions and hides folded opponents", async () => {
  const { handRecord, saveAgentHand, loadAgentHands } = await import("../src/agent/agent-stats.ts");
  const result = replay({ board: "Qc9s7sTsJh" });
  const record = handRecord(result, "reyson-01", "BTN", 123, { handNo: 1, names: { BB: "VEGA" } });
  assert.deepEqual(record.history.holeCards, { BTN: ["Ad", "8c"], BB: ["Qs", "6s"] });
  assert.deepEqual(record.history.board, ["Qc", "9s", "7s", "Ts", "Jh"]);
  assert.deepEqual(record.history.log, result.log);
  assert.deepEqual(record.history.winners, ["BB"]);
  result.board[0] = "2h";
  assert.equal(record.history.board[0], "Qc", "snapshot is detached from replay arrays");
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    saveAgentHand(record);
    assert.deepEqual(loadAgentHands(), JSON.parse(JSON.stringify([record])));
  } finally { globalThis.window = previous; }
  const folded = handRecord({ ...result, showdown: false }, "reyson-01", "BTN");
  assert.deepEqual(Object.keys(folded.history.holeCards), ["BTN"]);
});
