// Pure, browser-safe per-hand flop EV core shared by the saved 12-board artifact generator
// and the on-demand browser worker. These are AI-policy self-play estimates, not GTO.
import { evaluate, seedFor, seededRandom } from "../lib/equity.mjs";
import { seatRange } from "./browser-inputs.mjs";
import { NODES, choose, policyMix, scaleByPath, validatePolicy } from "./policy.mjs";
import { laterPolicyMix, referenceLaterPolicy, validateLaterPolicy } from "./later-policy.mjs";
import { LATER_NODES } from "./later-tree.mjs";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "./engine.mjs";
import { spotById } from "./spots.mjs";
import { flopState, treeHistories } from "./tree.mjs";
import { defenceFor, replayOrNull } from "./defence.mjs";
import { parseFlopBoard } from "./model.mjs";
import config from "../data/postflop-ai-pilot.json" with { type: "json" };

export const FLOP_HAND_EV_FOR_HAND_DEFAULT_SAMPLES = 600;
export const FLOP_HAND_EV_DEFAULT_SAMPLES = 2000;
export const historiesFor = tree => treeHistories(tree);
export const HISTORIES = Object.freeze(treeHistories("oop_checks"));
const round = value => Math.round(value * 100) / 100;
const ranks = "23456789TJQKA";
const handClass = ([a, b]) => {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return ranks[high >> 2].repeat(2);
  return ranks[high >> 2] + ranks[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
};

function validateHandClass(hand) {
  if (typeof hand !== "string" || !/^[2-9TJQKA]{2}[so]?$/.test(hand)) throw new Error("Invalid hand class");
  const high = ranks.indexOf(hand[0]), low = ranks.indexOf(hand[1]);
  if (high < low || (high === low) !== (hand.length === 2)) throw new Error("Invalid hand class");
}

function sampler(items) {
  let total = 0;
  const cumulative = items.map(item => (total += item.weight));
  if (!(total > 0)) return null;
  return random => {
    const target = random() * total;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    return items[lo];
  };
}

// Plays the rest of the hand with the selected action forced at `history.length`.
// Returns the acting player's incremental net from this decision; earlier chips are sunk.
export function playFromNode({ hands, flop, runout, history, forced, policy, laterPolicy = referenceLaterPolicy(), random,
  spot = spotById(), tree = spot.tree ?? "oop_checks", defence = null }) {
  if (typeof random !== "function") throw new Error("Invalid flop EV simulation context");
  const start = flopState(tree, history);
  if (!start.node) throw new Error("No decision after this flop history");
  const actor = spot[start.role];
  const table = createTable(spot);
  let atNode = null;
  const decide = (seat, node, step) => {
    if (step < history.length) return history[step];
    if (step === history.length) { atNode = { ...table.invested }; return forced; }
    const mix = defence ? defence.baseMix(table, flop, node, hands[seat]) : policyMix(policy, node, hands[seat], flop);
    return choose(defence ? defence.mix(table, flop, node, hands[seat], mix) : mix, random(), NODES[node]);
  };
  playFlop(table, tree, decide, config);
  playLaterStreetsWithPolicy(table, flop, runout, (seat, node, board, line) => {
    const mix = defence ? defence.baseMix(table, board, node, hands[seat]) : laterPolicyMix(laterPolicy, node, hands[seat], board, line);
    return choose(defence ? defence.mix(table, board, node, hands[seat], mix) : mix, random(), LATER_NODES[node]);
  }, config, table.lastAggressor);
  const winner = settle(table, hands, [...flop, ...runout]);
  const paid = table.pot - rake(table.pot);
  const share = winner === actor ? paid : winner === "tie" ? paid / 2 : 0;
  if (!atNode) return null;
  return share - table.invested[actor] + atNode[actor];
}

function nodeSetup(history, inputs, policy, flop, tree, defence) {
  const { spot } = inputs;
  const state = flopState(tree, history);
  const table = createTable(spot);
  const stop = new Error("stop at the decision");
  try {
    playFlop(table, tree, (seat, node, index) => {
      if (index < history.length) return history[index];
      throw stop;
    }, config);
  } catch (error) { if (error !== stop) throw error; }
  const nodeTable = replayOrNull(inputs, flop, { flop: history });
  const range = role => nodeTable ? defence.rangeItems(nodeTable, flop, spot[role])
    : scaleByPath(seatRange(inputs, spot[role], flop), role, state.steps, policy, flop);
  const heroRole = state.role, villainRole = heroRole === "ip" ? "oop" : "ip";
  return { pot: table.pot, hero: range(heroRole), villain: range(villainRole), state, nodeTable };
}

function computeNode({ board, history, inputs, flopPolicy, laterPolicy, samples, onlyHand = null, seed }) {
  const { spot } = inputs;
  const state = flopState(spot.tree, history);
  if (!state.node) return { node: null, actor: null, pot_bb: null, rows: {}, unreachable: true };
  const actor = spot[state.role];
  const key = history.join(",");
  const defence = defenceFor(inputs, flopPolicy, laterPolicy);
  let nodeTable = null;
  const nodeMix = combo => {
    const base = policyMix(flopPolicy, state.node, combo, board.cards);
    nodeTable ??= replayOrNull(inputs, board.cards, { flop: history }) ?? false;
    return nodeTable ? defence.mix(nodeTable, board.cards, state.node, combo, base) : base;
  };
  const setup = nodeSetup(history, inputs, flopPolicy, board.cards, spot.tree, defence);
  const actions = NODES[state.node];
  const reachableVillain = setup.villain.filter(item => item.weight > 0);
  if (!reachableVillain.length || !setup.hero.some(item => item.weight > 0)) {
    return { node: state.node, actor, pot_bb: setup.pot, rows: {}, unreachable: true };
  }

  const byClass = new Map();
  for (const item of setup.hero) if (item.weight > 0) {
    const hand = handClass(item.combo);
    if (onlyHand && hand !== onlyHand) continue;
    if (!byClass.has(hand)) byClass.set(hand, []);
    byClass.get(hand).push(item);
  }
  const rows = {};
  let neverReached = false;
  const compatible = new Map();
  const villainFor = heroCombo => {
    const comboKey = heroCombo.join(",");
    if (!compatible.has(comboKey)) {
      const items = reachableVillain.filter(item => !item.combo.some(card => heroCombo.includes(card)));
      compatible.set(comboKey, items.length ? sampler(items) : null);
    }
    return compatible.get(comboKey);
  };
  for (const [hand, allCombos] of byClass) {
    const combos = allCombos.filter(item => villainFor(item.combo));
    if (!combos.length) continue;
    const pickHero = sampler(combos);
    const random = seededRandom(seed ?? seedFor(`${config.seed}|hand-ev|${board.id}|${key}|${hand}`));
    const sums = Object.fromEntries(actions.map(action => [action, 0]));
    let wins = 0, mixEv = 0, completed = 0;
    const totalWeight = combos.reduce((sum, item) => sum + item.weight, 0);
    const mix = Object.fromEntries(actions.map(action => [action,
      round(combos.reduce((sum, item) => sum + item.weight * nodeMix(item.combo)[action], 0) / totalWeight)]));
    for (let sample = 0; sample < samples; sample++) {
      const heroCombo = pickHero(random).combo;
      const pickVillain = villainFor(heroCombo);
      if (!pickVillain) continue;
      const villainCombo = pickVillain(random).combo;
      const used = new Set([...heroCombo, ...villainCombo, ...board.cards]);
      const runout = [];
      while (runout.length < 2) {
        const card = Math.floor(random() * 52);
        if (!used.has(card)) { used.add(card); runout.push(card); }
      }
      const hands = { [actor]: heroCombo, [actor === spot.ip ? spot.oop : spot.ip]: villainCombo };
      const final = [...board.cards, ...runout];
      const mine = evaluate([...heroCombo, ...final]), theirs = evaluate([...villainCombo, ...final]);
      wins += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
      const streamSeed = Math.floor(random() * 2 ** 32);
      const comboMix = nodeMix(heroCombo);
      for (const action of actions) {
        const value = playFromNode({ hands, flop: board.cards, runout, history, forced: action,
          policy: flopPolicy, laterPolicy, random: seededRandom(streamSeed), spot, tree: spot.tree, defence });
        if (value === null) { neverReached = true; break; }
        sums[action] += value;
        mixEv += comboMix[action] / 100 * value;
      }
      if (neverReached) break;
      completed++;
    }
    if (neverReached) break;
    if (!completed) continue;
    const equity = wins / completed, ev = mixEv / completed;
    rows[hand] = {
      equity_pct: round(equity * 100),
      ev_bb: Object.fromEntries(actions.map(action => [action, round(sums[action] / completed)])),
      mix_ev_bb: round(ev),
      eqr: equity > 0.02 ? round(ev / (equity * (setup.pot - rake(setup.pot)))) : null,
      mix,
    };
  }
  if (neverReached) return { node: state.node, actor, pot_bb: setup.pot, rows: {}, unreachable: true };
  return { node: state.node, actor, pot_bb: setup.pot, rows, ...(!Object.keys(rows).length ? { unreachable: true } : {}) };
}

export function handEvForBoard(board, inputs, policy, samples = FLOP_HAND_EV_DEFAULT_SAMPLES,
  laterPolicy = referenceLaterPolicy()) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  const selected = parseFlopBoard(board.id);
  const validatedFlop = validatePolicy(policy, inputs.spot.tree);
  const validatedLater = validateLaterPolicy(laterPolicy);
  return Object.fromEntries(Object.entries(treeHistories(inputs.spot.tree)).map(([key]) => {
    const history = key ? key.split(",") : [];
    const result = computeNode({ board: selected, history, inputs, flopPolicy: validatedFlop,
      laterPolicy: validatedLater, samples });
    return [key, result];
  }));
}

// Pure, deterministic on-demand EV for the current flop decision and one hand class.
export function flopHandEvForHand({ flop, history = [], hand, inputs, flopPolicy, laterPolicy = referenceLaterPolicy(),
  samples = FLOP_HAND_EV_FOR_HAND_DEFAULT_SAMPLES, seed } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  validateHandClass(hand);
  if (!Array.isArray(history) || !inputs?.spot || !inputs?.seatRows) throw new Error("Invalid flop hand-EV inputs");
  const board = parseFlopBoard(flop);
  const policy = validatePolicy(flopPolicy, inputs.spot.tree);
  const later = validateLaterPolicy(laterPolicy);
  const state = flopState(inputs.spot.tree, history);
  if (!state.node) return { node: null, actor: null, pot_bb: null, row: null, unreachable: true, street: "flop" };
  const sampleSeed = seed == null ? undefined : Number.isInteger(seed) ? seed : seedFor(String(seed));
  const result = computeNode({ board, history, inputs, flopPolicy: policy, laterPolicy: later, samples,
    onlyHand: hand, seed: sampleSeed });
  const row = result.rows[hand] ?? null;
  return { node: result.node, actor: result.actor, pot_bb: result.pot_bb, street: "flop", row,
    ...(!row || result.unreachable ? { unreachable: true } : {}) };
}
