import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, raiseEv, replyShares } from "../scripts/lib/raise-ev.mjs";

const g = { hero: "BB", opener: "BTN", open: 2.5, threeBet: 12, fourBet: 26, stack: 100 };

test("opener that always folds hands the hero the pot before the 3bet", () => {
  const { ev } = raiseEv("72o", { fold: 1, call: 0, four_bet: 0 }, null, { vsCall: 0, vsFourBet: 0 }, g);
  assert.equal(ev, 4); // 2.5 open + 0.5 SB + hero's own 1BB blind, measured against folding
});

test("folding to a 4bet loses the 3bet increment", () => {
  const { ev } = raiseEv("72o", { fold: 0, call: 0, four_bet: 1 }, { fold: 100, call: 0, all_in: 0 }, { vsCall: 0, vsFourBet: 0 }, g);
  assert.equal(ev, -11);
});

test("reply shares remove hero's blockers from the opener range", () => {
  const open = [{ hand: "AA", open: 100 }, { hand: "KK", open: 100 }];
  const reply = [{ hand: "AA", fold: 0, call: 0, four_bet: 100 }, { hand: "KK", fold: 100, call: 0, four_bet: 0 }];
  const withAce = replyShares("AKs", open, reply), neutral = replyShares("QJs", open, reply);
  assert.equal(neutral.four_bet, 0.5);
  assert.ok(Math.abs(withAce.four_bet - 0.5) < 1e-9); // A and K blocked equally here
  assert.ok(replyShares("AQs", open, reply).four_bet < 0.5);
});

test("classify flags only gaps beyond the margin", () => {
  assert.equal(classify({ threeBet: 0, callEv: 0.2, raiseEv: 0.5 }), "under-raised");
  assert.equal(classify({ threeBet: 10, callEv: -1, raiseEv: -0.05 }), null);
  assert.equal(classify({ threeBet: 10, callEv: 0.6, raiseEv: 0.2 }), "over-raised");
});
