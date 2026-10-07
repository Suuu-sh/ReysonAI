import assert from "node:assert/strict";
import test from "node:test";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { promptFor } from "../scripts/postflop-ai/generate.mjs";

test("squeeze and cold-four-bet history prompts explain low-SPR range context", () => {
  const squeeze = promptFor(loadInputs("CO_open_BTN_call_BB_squeeze_CO_fold_BTN_call"));
  assert.match(squeeze, /CO open to 2\.5BB, BTN call to 2\.5BB, BB squeeze to 13BB, CO fold, BTN call to 13BB/);
  assert.match(squeeze, /flop pot 29BB, stacks 87BB/);
  assert.match(squeeze, /low stack-to-pot ratio/i);
  assert.match(squeeze, /squeeze\/cold-4bet and other multiway-origin histories/i);
  assert.match(squeeze, /unknown cards are not removed from either player's range/i);

  const coldFourBet = promptFor(loadInputs("BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call"));
  assert.match(coldFourBet, /flop pot 54\.5BB, stacks 74BB/);
  assert.match(coldFourBet, /unknown cards are not removed from either player's range/i);
  assert.match(coldFourBet, /low SPR/i);
});

test("legacy heads-up prompt keeps its original range summary without history guidance", () => {
  const prompt = promptFor(loadInputs("BTN_open_BB_call"));
  assert.match(prompt, /BTN opens 2\.5BB, BB calls, every other seat folds; heads-up/);
  assert.doesNotMatch(prompt, /multiway-origin histories|unknown folded cards|low SPR/i);
});
