import { createHash } from "node:crypto";
import { evaluate, seedFor, seededRandom } from "../lib/equity.mjs";
import { gameConfig } from "../../src/estimated/sizing.js";
import { handTier } from "./model.mjs";
import { NODES, choose, opponentMix, policyMix, referencePolicy } from "./policy.mjs";
import { boards, comboRange, config, makeSampler, samplePair } from "./inputs.mjs";

const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round = value => Math.round(value * 100) / 100;
const other = seat => seat === "BTN" ? "BB" : "BTN";
export const PROFILES = ["standard", "passive", "aggressive"];
export const SIMULATION_VERSION = 2;

function rake(pot) { return Math.min(pot * gameConfig.rake.rate, gameConfig.rake.cap_bb); }

// Fixed turn/river continuation shared by the candidate and baseline. It sees
// only this player's cards, public board, and public pot/stack/action state.
export function continuationMix(hole, board, profile, facingBet) {
  const tier = handTier(hole, board);
  const street = board.length === 4 ? "turn" : "river";
  if (facingBet) {
    const base = { monster: 100, strong: 70, draw: street === "turn" ? 50 : 0, medium: 30, air: 0 }[tier];
    const call = Math.min(100, Math.max(0, base + (profile === "passive" ? 10 : profile === "aggressive" ? -10 : 0)));
    return { fold: 100 - call, call };
  }
  const base = { monster: 80, strong: 35, draw: street === "turn" ? 20 : 0, medium: 10, air: 5 }[tier];
  const bet = Math.min(100, Math.round(base * (profile === "passive" ? 0.5 : profile === "aggressive" ? 1.5 : 1)));
  return { check: 100 - bet, bet };
}

function takeRandom(deck, used, random) {
  const available = deck.filter(card => !used.has(card));
  if (!available.length) throw new Error("No cards remain");
  const card = available[Math.floor(random() * available.length)];
  used.add(card);
  return card;
}

export function dealRunout(hands, flop, random) {
  const used = new Set([...hands.BTN, ...hands.BB, ...flop]);
  if (used.size !== 7) throw new Error("Duplicate deal cards");
  const deck = Array.from({ length: 52 }, (_, i) => i);
  return [takeRandom(deck, used, random), takeRandom(deck, used, random)];
}

export function playHand({ hands, flop, runout, hero, policy, profile, randoms }) {
  if (!["BTN", "BB"].includes(hero) || !PROFILES.includes(profile) ||
      !Array.isArray(randoms) || randoms.length < 7 || randoms.some(value => !Number.isFinite(value) || value < 0 || value >= 1) ||
      flop.length !== 3 || runout.length !== 2 || new Set([...hands.BTN, ...hands.BB, ...flop, ...runout]).size !== 9) {
    throw new Error("Invalid simulated hand");
  }
  const stacks = { BTN: 97.5, BB: 97.5 }, invested = { BTN: 0, BB: 0 };
  let pot = 5.5, winner = null;
  let randomIndex = 0;
  const random = () => {
    if (randomIndex >= randoms.length) throw new Error("Simulation random stream exhausted");
    return randoms[randomIndex++];
  };
  const put = (seat, amount) => {
    const value = round(Math.min(stacks[seat], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid wager");
    stacks[seat] = round(stacks[seat] - value);
    invested[seat] = round(invested[seat] + value);
    pot = round(pot + value);
    return value;
  };
  const flopChoice = (seat, node) => {
    const mix = seat === hero ? policyMix(policy, node, hands[seat], flop) : opponentMix(node, hands[seat], flop, profile);
    return choose(mix, random(), NODES[node]);
  };
  const first = flopChoice("BTN", "btn_first"); // BB checks in this v1 tree.
  if (first !== "check") {
    const bet = put("BTN", pot * (first === "bet33" ? config.flop_bet_fractions[0] : config.flop_bet_fractions[1]));
    const response = flopChoice("BB", first === "bet33" ? "bb_vs_33" : "bb_vs_75");
    if (response === "fold") winner = "BTN";
    else if (response === "call") put("BB", bet);
    else {
      const raiseTo = Math.min(stacks.BB + invested.BB, round(bet * config.flop_check_raise_multiplier));
      put("BB", raiseTo - invested.BB);
      const back = flopChoice("BTN", "btn_vs_raise");
      if (back === "fold") winner = "BB";
      else put("BTN", invested.BB - invested.BTN);
    }
  }
  for (let street = 0; street < 2 && !winner; street++) {
    if (!stacks.BTN || !stacks.BB) break;
    const board = [...flop, ...runout.slice(0, street + 1)];
    const contProfile = seat => seat === hero ? "standard" : profile;
    const chooseCont = (seat, facing) => choose(continuationMix(hands[seat], board, contProfile(seat), facing), random());
    const oop = chooseCont("BB", false);
    if (oop === "bet") {
      const amount = put("BB", Math.min(pot * config.continuation_bet_fraction, stacks.BTN));
      if (chooseCont("BTN", true) === "fold") winner = "BB";
      else put("BTN", amount);
    } else if (chooseCont("BTN", false) === "bet") {
      const amount = put("BTN", Math.min(pot * config.continuation_bet_fraction, stacks.BB));
      if (chooseCont("BB", true) === "fold") winner = "BTN";
      else put("BB", amount);
    }
  }
  if (!winner) {
    const board = [...flop, ...runout];
    const btn = evaluate([...hands.BTN, ...board]), bb = evaluate([...hands.BB, ...board]);
    winner = btn === bb ? "tie" : btn > bb ? "BTN" : "BB";
  }
  // The part of a bet that was never called is returned before the pot is
  // raked or awarded. This applies to folds on every street, including a
  // check-raise that BTN folds to.
  if (winner !== "tie") {
    const excess = round(invested[winner] - invested[other(winner)]);
    if (excess > 0) {
      invested[winner] = round(invested[winner] - excess);
      stacks[winner] = round(stacks[winner] + excess);
      pot = round(pot - excess);
    }
  }
  const fee = rake(pot), paid = round(pot - fee);
  const returns = {
    BTN: round((winner === "BTN" ? paid : winner === "tie" ? paid / 2 : 0) - invested.BTN),
    BB: round((winner === "BB" ? paid : winner === "tie" ? paid / 2 : 0) - invested.BB),
  };
  if (Math.abs(returns.BTN + returns.BB - (5.5 - fee)) > 0.02) throw new Error("Chip conservation failed");
  return { winner, pot, fee, invested, returns };
}

function stats(values) {
  const n = values.length, mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, n - 1);
  const half = 1.96 * Math.sqrt(variance / n);
  const precise = value => Math.round(value * 10000) / 10000;
  return { mean: precise(mean), ci95: [precise(mean - half), precise(mean + half)] };
}

export function simulate(inputs, candidate, samples = config.samples_per_board_profile_seat) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("Invalid simulation sample count");
  const results = [];
  for (const board of boards()) {
    const btn = makeSampler(comboRange(inputs.opening.hands, "open", board.cards));
    const bb = makeSampler(comboRange(inputs.response.hands, "call", board.cards));
    for (const profile of PROFILES) for (const hero of ["BTN", "BB"]) {
      const random = seededRandom(seedFor(`${config.seed}|${board.id}|${profile}|${hero}`));
      const candidateEvs = [], baselineEvs = [], differences = [];
      for (let i = 0; i < samples; i++) {
        const hands = samplePair(btn, bb, random);
        const runout = dealRunout(hands, board.cards, random);
        const randoms = Array.from({ length: 12 }, () => random());
        const base = playHand({ hands, flop: board.cards, runout, hero, policy: referencePolicy, profile, randoms });
        const trial = playHand({ hands, flop: board.cards, runout, hero, policy: candidate, profile, randoms });
        candidateEvs.push(trial.returns[hero]); baselineEvs.push(base.returns[hero]);
        differences.push(trial.returns[hero] - base.returns[hero]);
      }
      results.push({ board: board.id, split: board.split, hero, opponent: profile, candidate_ev_bb: stats(candidateEvs),
      baseline_ev_bb: stats(baselineEvs), delta_bb: stats(differences) });
    }
  }
  return { kind: "ai_estimate_not_gto", version: 1, simulation_version: SIMULATION_VERSION,
    spot: config.spot, source_hash: inputs.fingerprint,
    policy_hash: sha(candidate), samples_per_board_profile_seat: samples, seed: config.seed, results };
}
