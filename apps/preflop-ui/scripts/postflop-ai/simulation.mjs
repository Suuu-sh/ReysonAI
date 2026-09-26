import { createHash } from "node:crypto";
import { seedFor, seededRandom } from "../lib/equity.mjs";
import { handTier } from "./model.mjs";
import { NODES, choose, opponentMix, policyMix, referencePolicyFor } from "./policy.mjs";
import { createTable, playFlop, playLaterStreets, rake, settle } from "./engine.mjs";
import { boards, config, makeSampler, samplePair, seatRange } from "./inputs.mjs";
import { spotById } from "./spots.mjs";

const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round = value => Math.round(value * 100) / 100;
export const PROFILES = ["standard", "passive", "aggressive"];
export const SIMULATION_VERSION = 2;


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
  const used = new Set([...Object.values(hands).flat(), ...flop]);
  if (used.size !== 7) throw new Error("Duplicate deal cards");
  const deck = Array.from({ length: 52 }, (_, i) => i);
  return [takeRandom(deck, used, random), takeRandom(deck, used, random)];
}

// One flop-to-river hand of a heads-up pot on the spot's tree (tree.mjs).
export function playHand({ hands, flop, runout, hero, policy, profile, randoms, spot = spotById(), tree = spot.tree ?? "oop_checks" }) {
  const { ip: IP, oop: OOP } = spot;
  if (![IP, OOP].includes(hero) || !PROFILES.includes(profile) || !hands?.[IP] || !hands?.[OOP] ||
      !Array.isArray(randoms) || randoms.length < 7 || randoms.some(value => !Number.isFinite(value) || value < 0 || value >= 1) ||
      flop.length !== 3 || runout.length !== 2 || new Set([...hands[IP], ...hands[OOP], ...flop, ...runout]).size !== 9) {
    throw new Error("Invalid simulated hand");
  }
  let randomIndex = 0;
  const random = () => {
    if (randomIndex >= randoms.length) throw new Error("Simulation random stream exhausted");
    return randoms[randomIndex++];
  };
  const table = createTable(spot);
  const flopChoice = (seat, node) => {
    const mix = seat === hero ? policyMix(policy, node, hands[seat], flop) : opponentMix(node, hands[seat], flop, profile);
    return choose(mix, random(), NODES[node]);
  };
  playFlop(table, tree, flopChoice, config);
  const contProfile = seat => seat === hero ? "standard" : profile;
  playLaterStreets(table, flop, runout, (seat, board, facing) => choose(continuationMix(hands[seat], board, contProfile(seat), facing), random()), config);
  const winner = settle(table, hands, [...flop, ...runout]);
  const { pot, invested } = table;
  const fee = rake(pot), paid = round(pot - fee);
  const returns = {
    [IP]: round((winner === IP ? paid : winner === "tie" ? paid / 2 : 0) - invested[IP]),
    [OOP]: round((winner === OOP ? paid : winner === "tie" ? paid / 2 : 0) - invested[OOP]),
  };
  if (Math.abs(returns[IP] + returns[OOP] - (spot.potBb - fee)) > 0.02) throw new Error("Chip conservation failed");
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
  const { spot } = inputs;
  const referencePolicy = referencePolicyFor(spot.tree);
  const results = [];
  for (const board of boards()) {
    const ip = makeSampler(seatRange(inputs, spot.ip, board.cards));
    const oop = makeSampler(seatRange(inputs, spot.oop, board.cards));
    for (const profile of PROFILES) for (const hero of [spot.ip, spot.oop]) {
      const random = seededRandom(seedFor(`${config.seed}|${board.id}|${profile}|${hero}`));
      const candidateEvs = [], baselineEvs = [], differences = [];
      for (let i = 0; i < samples; i++) {
        const hands = samplePair(ip, oop, random, spot);
        const runout = dealRunout(hands, board.cards, random);
        const randoms = Array.from({ length: 12 }, () => random());
        const base = playHand({ hands, flop: board.cards, runout, hero, policy: referencePolicy, profile, randoms, spot });
        const trial = playHand({ hands, flop: board.cards, runout, hero, policy: candidate, profile, randoms, spot });
        candidateEvs.push(trial.returns[hero]); baselineEvs.push(base.returns[hero]);
        differences.push(trial.returns[hero] - base.returns[hero]);
      }
      results.push({ board: board.id, split: board.split, hero, opponent: profile, candidate_ev_bb: stats(candidateEvs),
      baseline_ev_bb: stats(baselineEvs), delta_bb: stats(differences) });
    }
  }
  return { kind: "ai_estimate_not_gto", version: 1, simulation_version: SIMULATION_VERSION,
    spot: spot.id, source_hash: inputs.fingerprint,
    policy_hash: sha(candidate), samples_per_board_profile_seat: samples, seed: config.seed, results };
}
