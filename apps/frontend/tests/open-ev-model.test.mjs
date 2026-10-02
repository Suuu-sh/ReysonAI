import assert from "node:assert/strict";
import test from "node:test";
import { actionProbabilitiesForHand, calculateOpenEvForHand } from "../scripts/lib/open-ev-model.mjs";

const spot = (fields, hands) => ({ ...fields, hands });

function smallDatasets() {
  return {
    opening: { spots: [spot({ hero: "SB", open_size_bb: 3.5, effective_stack_bb: 100 }, [{ hand: "AA", open: 100 }])] },
    preflop: { spots: [spot({ id: "BB_vs_SB", opener: "SB", hero: "BB", open_size_bb: 3.5, three_bet_size_bb: 10.5 }, [{ hand: "KK", fold: 20, call: 30, three_bet: 50 }])] },
    threeBet: { spots: [spot({ id: "SB_vs_BB_three_bet", opener: "SB", hero: "SB", three_bettor: "BB", open_size_bb: 3.5, three_bet_size_bb: 10.5, four_bet_size_bb: 24 }, [{ hand: "AA", fold: 20, call: 50, four_bet: 30 }])] },
    fourBet: { spots: [spot({ id: "BB_vs_SB_four_bet", opener: "SB", hero: "BB", three_bettor: "BB", open_size_bb: 3.5, three_bet_size_bb: 10.5, four_bet_size_bb: 24 }, [{ hand: "KK", fold: 25, call: 50, all_in: 25 }])] },
    fiveBet: { spots: [spot({ id: "SB_vs_BB_five_bet", opener: "SB", hero: "SB", five_bettor: "BB" }, [{ hand: "AA", fold: 60, call: 40 }])] },
  };
}

test("each EV branch follows the specified net-chip formulas before adding the fold baseline", () => {
  const result = calculateOpenEvForHand({
    hero: "SB",
    hand: "AA",
    openFreq: 100,
    datasets: smallDatasets(),
    samples: 1,
    equityCalculator: () => 0.8,
  });
  const calls = result.branches.calls.outcomes.BB;
  const threeBet = result.branches.three_bets.outcomes.BB;
  const fourBet = threeBet.outcomes.four_bet;
  const allIn = fourBet.outcomes.all_in;

  // BB response: fold 20%, call 30%, 3bet 50%. SB now opens to 3.5BB and BB 3bets to 10.5BB.
  assert.equal(result.p_all_fold, 0.2);
  assert.equal(calls.probability, 0.3);
  assert.equal(calls.net_ev_bb, 1.022); // .8 × .85 × (7 − 0.35 rake) − 3.5
  assert.equal(calls.raked_pot_bb, 6.65);
  assert.equal(threeBet.probability, 0.5);
  assert.equal(threeBet.outcomes.fold.probability, 0.1);
  assert.equal(threeBet.outcomes.fold.net_ev_bb, -3.5);
  assert.equal(threeBet.outcomes.call.probability, 0.25);
  assert.equal(threeBet.outcomes.call.net_ev_bb, 3.066); // .8 × .85 × (21 − 1.05 rake) − 10.5

  assert.equal(fourBet.probability, 0.15); // 50% 3bet × 30% opener 4bet
  assert.equal(fourBet.outcomes.fold.probability, 0.0375);
  assert.equal(fourBet.outcomes.fold.net_ev_bb, 10.5); // BB's 10.5BB 3bet is won
  assert.equal(fourBet.outcomes.call.net_ev_bb, 7.008); // .8 × .85 × (48 − 2.4 rake) − 24
  assert.equal(allIn.probability, 0.0375);
  assert.equal(allIn.outcomes.call.probability, 0.015);
  assert.equal(allIn.outcomes.call.net_ev_bb, 57.6); // .8 × (200 − 3 cap) − 100
  assert.equal(allIn.outcomes.fold.probability, 0.0225);
  assert.equal(allIn.outcomes.fold.net_ev_bb, -24);

  assert.equal(result.expected_net_ev_bb, 2.16645);
  assert.equal(result.delta_ev_bb, 2.66645); // Add back SB's 0.5BB blind.
});

test("card removal changes fold probability when hero blocks a different action-weighted class", () => {
  const rows = [
    { hand: "AA", fold: 100, call: 0, three_bet: 0 },
    { hand: "KK", fold: 0, call: 100, three_bet: 0 },
  ];
  const heroAA = actionProbabilitiesForHand({ rows, hand: "AA", actions: ["fold", "call", "three_bet"] });
  const heroKK = actionProbabilitiesForHand({ rows, hand: "KK", actions: ["fold", "call", "three_bet"] });
  assert.ok(Math.abs(heroAA.fold - 1 / 7) < 1e-12);
  assert.ok(Math.abs(heroKK.fold - 6 / 7) < 1e-12);
  assert.notEqual(heroAA.fold, heroKK.fold);
});

test("unopened hands reaching the 3bet branch are modeled as folding to the 3bet", () => {
  const datasets = smallDatasets();
  datasets.opening.spots[0].hands[0].open = 0;
  const result = calculateOpenEvForHand({
    hero: "SB",
    hand: "AA",
    datasets,
    samples: 1,
    equityCalculator: () => 0.8,
  });
  const threeBet = result.branches.three_bets.outcomes.BB;
  assert.equal(threeBet.outcomes.fold.probability, 0.5);
  assert.equal(threeBet.outcomes.fold.net_ev_bb, -3.5);
  assert.equal(threeBet.outcomes.fold.unreachable, true);
  assert.equal(threeBet.outcomes.call, undefined);
});
