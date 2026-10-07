import { actionModelIdentity } from "./observable-actions.mjs";
import { hasPostflopDeal } from "./range-support.mjs";
import { createHash } from "node:crypto";
import { seedFor, seededRandom } from "../lib/equity.ts";
import { handTier } from "./hu-hand-tier.ts";
import { NODES, choose, opponentMix, policyMix, referencePolicyFor } from "./policy.ts";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "./engine.ts";
import { laterPolicyMix, referenceLaterMix, referenceLaterPolicy, validateLaterPolicy } from "./later-policy.ts";
import { LATER_NODES } from "./later-tree.ts";
import { boards, config, laterSizingHash, makeSampler, samplePair, seatRange } from "./inputs.mjs";
import { spotById } from "./spots.ts";
import { defenceVersionFor, defenceFor } from "./defence.ts";

const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round = value => Math.round(value * 100) / 100;
export const PROFILES = ["standard", "passive", "aggressive"];
export const SIMULATION_VERSION = 3;
const referenceLater = referenceLaterPolicy();


// Legacy fixed continuation retained for callers of the old engine. Version 3 simulation
// uses the explicit later-street rule tables instead.
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

// One flop-to-river hand of a heads-up pot on the spot's tree (tree.ts). `defence` (defence.ts,
// built for the hero's policies) replaces the hero's call / fold part at facing nodes with the
// computed defence; without it the hero plays its policy mixes as saved. The opponent is the fixed
// reference and never uses it.
export function playHand({ hands, flop, runout, hero, policy, laterPolicy = referenceLater, profile, randoms, spot = spotById(), tree = spot.tree ?? "oop_checks", defence = null }) {
  const { ip: IP, oop: OOP } = spot;
  if (![IP, OOP].includes(hero) || !PROFILES.includes(profile) || !hands?.[IP] || !hands?.[OOP] ||
      !Array.isArray(randoms) || randoms.length < 12 || randoms.some(value => !Number.isFinite(value) || value < 0 || value >= 1) ||
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
    let mix;
    if (seat === hero) {
      mix = defence ? defence.baseMix(table, flop, node, hands[seat]) : policyMix(policy, node, hands[seat], flop);
      if (defence) mix = defence.mix(table, flop, node, hands[seat], mix);
    } else mix = opponentMix(node, hands[seat], flop, profile);
    return choose(mix, random(), NODES[node]);
  };
  playFlop(table, tree, flopChoice, config);
  playLaterStreetsWithPolicy(table, flop, runout, (seat, node, board, line) => {
    let mix;
    if (seat === hero) {
      mix = defence ? defence.baseMix(table, board, node, hands[seat]) : laterPolicyMix(laterPolicy, node, hands[seat], board, line);
      if (defence) mix = defence.mix(table, board, node, hands[seat], mix);
    } else mix = referenceLaterMix(node, hands[seat], board, line, profile);
    return choose(mix, random(), LATER_NODES[node]);
  }, config, table.lastAggressor);
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

// laterCandidate may be the raw policy (like candidate) or the loadLaterCandidate artifact.
// The candidate plays the computed defence at facing nodes (`computedDefence: false` plays its
// policy mixes as saved, e.g. the reference-versus-reference drift check).
export function simulate(inputs, candidate, samples = config.samples_per_board_profile_seat, laterCandidate = null, { computedDefence = true, boardList = boards(), cacheBatchSize = 512 } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("Invalid simulation sample count");
  if (!Number.isInteger(cacheBatchSize) || cacheBatchSize < 0) throw new Error("Invalid simulation cache batch size");
  const { spot } = inputs;
  const referencePolicy = referencePolicyFor(spot.tree);
  const laterPolicy = laterCandidate ? validateLaterPolicy(laterCandidate.policy ?? laterCandidate) : referenceLater;
  const defence = computedDefence ? defenceFor(inputs, candidate, laterPolicy) : null;
  const results = [];
  for (const board of boardList) {
    if (spot.history && !hasPostflopDeal(inputs, board.cards)) continue;
    // Cache lifetime is not part of a strategy or random stream. Completed
    // boards and bounded batches are recomputed if revisited, rather than
    // retaining thousands of context graphs beyond the worker heap budget.
    defence?.releaseBoardCaches();
    const ip = makeSampler(seatRange(inputs, spot.ip, board.cards));
    const oop = makeSampler(seatRange(inputs, spot.oop, board.cards));
    for (const profile of PROFILES) for (const hero of [spot.ip, spot.oop]) {
      const random = seededRandom(seedFor(`${config.seed}|${board.id}|${profile}|${hero}`));
      const candidateEvs = [], baselineEvs = [], differences = [];
      for (let i = 0; i < samples; i++) {
        if (cacheBatchSize && i % cacheBatchSize === 0) defence?.releaseBoardCaches();
        const hands = samplePair(ip, oop, random, spot);
        const runout = dealRunout(hands, board.cards, random);
        const randoms = Array.from({ length: 24 }, () => random());
        const base = playHand({ hands, flop: board.cards, runout, hero, policy: referencePolicy, profile, randoms, spot });
        const trial = playHand({ hands, flop: board.cards, runout, hero, policy: candidate, laterPolicy, profile, randoms, spot, defence });
        candidateEvs.push(trial.returns[hero]); baselineEvs.push(base.returns[hero]);
        differences.push(trial.returns[hero] - base.returns[hero]);
      }
      results.push({ board: board.id, split: board.split, hero, opponent: profile, candidate_ev_bb: stats(candidateEvs),
      baseline_ev_bb: stats(baselineEvs), delta_bb: stats(differences) });
    }
  }
  return simulationReport(inputs, candidate, samples, laterCandidate, results, { computedDefence });
}

export function simulationReport(inputs, candidate, samples, laterCandidate, results, { computedDefence = true } = {}) {
  const laterPolicy = laterCandidate ? laterCandidate.policy ?? laterCandidate : referenceLater;
  const { spot } = inputs;
  const unreachable = spot.history ? boards().filter(board => !hasPostflopDeal(inputs, board.cards)).map(board => board.id) : [];
  return { kind: "ai_estimate_not_gto", version: 1, simulation_version: SIMULATION_VERSION, ...actionModelIdentity(spot),
    spot: spot.id, source_hash: inputs.fingerprint,
    ...(unreachable.length ? { unreachable_boards: unreachable } : {}),
    later_sizing_hash: laterSizingHash(),
    ...(laterCandidate ? { later_policy_hash: sha(laterPolicy) } : {}),
    ...(computedDefence ? { defence_version: defenceVersionFor(inputs) } : {}),
    policy_hash: sha(candidate), samples_per_board_profile_seat: samples, seed: config.seed, results };
}
