import { canonicalPostflopPath, usesObservableActions } from "./observable-actions.mjs";
// The pure core of the turn/river per-hand action EV (no node:*): shared by the Node scripts
// (later-hand-ev.mjs) and the browser worker (src/estimated/postflop-compute.ts), so both compute
// exactly the same numbers. Values are sampled by AI-policy self-play with the computed defence at
// facing decisions (defence.ts); they are local estimates, not GTO or solver output.
import { evaluate, seedFor, seededRandom } from "../lib/equity.ts";
import { choose, validatePolicy } from "./policy.ts";
import { laterPolicyMix, validateLaterPolicy } from "./later-policy.ts";
import { parseCards } from "./model.ts";
import { LATER_NODES } from "./later-tree.ts";
import { flopState } from "./tree.ts";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "./engine.ts";
import { defenceFor, replayDecision } from "./defence.ts";
import { exactActionEv } from "./exact-ev.mjs";
import { laterDecisionState as laterDecision, laterStart, replayLater } from "./street-state.mjs";
import config from "../data/postflop-ai-pilot.json" with { type: "json" };

export const LATER_HAND_EV_FOR_HAND_DEFAULT_SAMPLES = 600;
const ranks = "23456789TJQKA";
const round = value => Math.round(value * 100) / 100;
const handClass = ([a, b]) => {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return ranks[high >> 2].repeat(2);
  return ranks[high >> 2] + ranks[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
};

export function laterHandEvKey({ flop, turn, river = "-", flopActions = [], turnActions = [], riverActions = null }) {
  // The requested five-part key is retained. For river decisions the final field is
  // `turnHistory>riverHistory`, which keeps each distinct river node addressable.
  const streetHistory = riverActions === null ? turnActions.join(",") : `${turnActions.join(",")}>${riverActions.join(",")}`;
  return `${flop}|${turn}|${river}|${flopActions.join(",")}|${streetHistory}`;
}

export function makeLaterMixReader(policy) {
  const cache = new Map();
  return (node, combo, board, line) => {
    const cards = [...combo].sort((a, b) => a - b).join(",");
    const key = `${node}|${cards}|${board.join(",")}|${line}`;
    if (!cache.has(key)) cache.set(key, laterPolicyMix(policy, node, combo, board, line));
    return cache.get(key);
  };
}

function currentNodeSetup({ street, actions, turnStart, riverStart, spot }) {
  if (street === "turn") {
    const replay = replayLater("turn", actions, turnStart, spot);
    const decision = laterDecision("turn", actions, turnStart, spot);
    return { replay, decision, turnSteps: replay.state.steps, turnPreviousAggressor: turnStart.lastAggressor,
      riverStart: null };
  }
  const replay = replayLater("river", actions, riverStart, spot);
  const decision = laterDecision("river", actions, riverStart, spot);
  return { replay, decision, riverSteps: replay.state.steps, riverPreviousAggressor: riverStart.lastAggressor };
}

function makeSampler(items) {
  let total = 0;
  const cumulative = items.map(item => (total += item.weight));
  if (!total) return null;
  return random => {
    const target = random() * total;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    return items[lo];
  };
}

function compatiblePair(pickActor, pickVillain, random) {
  for (let tries = 0; tries < 1000; tries++) {
    const actor = pickActor(random), villain = pickVillain(random);
    if (actor.combo.every(card => !villain.combo.includes(card))) return { actor, villain };
  }
  // Deterministic reachability fallback for very blocker-heavy classes.
  const actorItems = pickActor.items, villainItems = pickVillain.items;
  for (const actor of actorItems) {
    const villain = villainItems.find(item => actor.combo.every(card => !item.combo.includes(card)));
    if (villain) return { actor, villain };
  }
  return null;
}

function playFromLaterNode({ hands, flopBoard, runout, flopActions, turnActions, street, streetActions, node, forced,
  laterMix, defence, spot, random }) {
  if (usesObservableActions(spot)) {
    const path = canonicalPostflopPath(spot, { flop: flopActions,
      turn: street === 'turn' ? [...streetActions, forced] : turnActions,
      river: street === 'river' ? [...streetActions, forced] : [] }, config);
    flopActions = path.flop;
    if (street === 'turn') { forced = path.turn.at(-1); streetActions = path.turn.slice(0, -1); turnActions = streetActions; }
    else { turnActions = path.turn; forced = path.river.at(-1); streetActions = path.river.slice(0, -1); }
  }
  const table = createTable(spot);
  let flopIndex = 0, atNode = null;
  playFlop(table, spot.tree, () => flopActions[flopIndex++], config);
  const paths = { turn: [], river: [] };
  const decide = (seat, currentNode, board, line) => {
    const currentStreet = currentNode.split("_")[0];
    const history = paths[currentStreet];
    const targetHistory = currentStreet === "turn" ? turnActions : currentStreet === street ? streetActions : [];
    let action;
    if (history.length < targetHistory.length) action = targetHistory[history.length];
    else if (currentStreet === street && history.length === targetHistory.length && !atNode) {
      if (currentNode !== node) throw new Error(`Later hand-EV target mismatch: ${currentNode} !== ${node}`);
      atNode = { ...table.invested };
      action = forced;
    } else {
      const mix = defence.mix(table, board, currentNode, hands[seat], defence.baseMix(table, board, currentNode, hands[seat]));
      action = choose(mix, random(), LATER_NODES[currentNode]);
    }
    history.push(action);
    return action;
  };
  playLaterStreetsWithPolicy(table, flopBoard, runout, decide, config, table.lastAggressor);
  if (!atNode) return null;
  const actor = spot[node.split("_")[1]];
  const winner = settle(table, hands, [...flopBoard, ...runout]);
  const paid = table.pot - rake(table.pot);
  const share = winner === actor ? paid : winner === "tie" ? paid / 2 : 0;
  return share - table.invested[actor] + atNode[actor];
}

function computeNodeMonteCarloRaw({ key, street, history, turnHistory = [], expectedNode, expectedRole, flopPath, runout, board, inputs,
  flopPolicy, laterPolicy, laterMix, samples, onlyHand = null, sampleSeed = null, rng = seededRandom }) {
  const { spot } = inputs;
  const turnStart = laterStart(flopPath.actions, spot);
  if (!turnStart) throw new Error("Invalid representative flop path");
  let riverStart = null;
  if (street === "river") {
    const turnResult = replayLater("turn", turnHistory, turnStart, spot);
    if (!turnResult.state.end || ["fold", "raise-fold"].includes(turnResult.end?.type) || turnResult.stacks.ip <= 0 || turnResult.stacks.oop <= 0) {
      return [key, { node: expectedNode, actor: spot[expectedRole], pot_bb: turnResult.pot, rows: {}, unreachable: true }];
    }
    riverStart = { pot: turnResult.pot, stacks: turnResult.stacks, lastAggressor: turnResult.lastAggressor };
  }
  const setup = currentNodeSetup({ street, actions: history, turnStart, riverStart, spot });
  const decision = setup.decision;
  const table = setup.replay;
  if (!decision.node) return [key, { node: expectedNode, actor: spot[expectedRole], pot_bb: decision.potBb, rows: {}, unreachable: true }];
  const role = decision.role;
  const actor = spot[role];
  const opponent = spot[role === "ip" ? "oop" : "ip"];
  const liveStacks = table.stacks;
  if (liveStacks[role] <= 0) return [key, { node: decision.node, actor, pot_bb: decision.potBb, rows: {}, unreachable: true }];
  const flopBoard = board.cards;
  const currentBoard = street === "turn" ? runout.turnBoard : runout.riverBoard;
  // Every decision uses the computed defence and bluff cap (defence.ts), in this node's mix, in the
  // reach weights of both ranges and in every later decision of the sampled continuations.
  const defence = defenceFor(inputs, flopPolicy, laterPolicy);
  const nodeTable = replayDecision(inputs, currentBoard, { flop: flopPath.actions,
    turn: street === "river" ? turnHistory : history, river: street === "river" ? history : [] });
  const mixAtNode = combo => defence.observableMix(nodeTable, currentBoard, decision.node, combo, laterMix(decision.node, combo, currentBoard, decision.line));
  const ranges = {};
  for (const seat of [actor, opponent]) ranges[seat] = defence.rangeItems(nodeTable, currentBoard, seat);
  const actorRange = ranges[actor];
  const villainRange = ranges[opponent];
  const grouped = new Map();
  for (const item of actorRange) {
    const hand = handClass(item.combo);
    if (onlyHand && hand !== onlyHand) continue;
    if (!grouped.has(hand)) grouped.set(hand, []);
    grouped.get(hand).push(item);
  }
  const nodeMix = new Map();
  const comboMix = new Map();
  for (const item of actorRange) {
    const hand = handClass(item.combo);
    if (onlyHand && hand !== onlyHand) continue;
    if (!nodeMix.has(hand)) nodeMix.set(hand, []);
    const mix = mixAtNode(item.combo);
    nodeMix.get(hand).push({ item, mix });
    comboMix.set(item.combo.join(","), mix);
  }
  const actions = nodeTable.log.at(-1)?.observation?.classes.map(group => group.action) ?? LATER_NODES[decision.node];
  const rows = {};
  let validClasses = 0;
  for (const [hand, combos] of grouped) {
    // On-demand evaluation samples only actor combos with at least one compatible villain
    // combo. This avoids rejection sampling (and terminates for narrow 4bet ranges).
    const compatibleVillain = new Map();
    const compatibleSamplerFor = combo => {
      const comboKey = combo.join(",");
      if (!compatibleVillain.has(comboKey)) {
        const compatible = villainRange.filter(item => !item.combo.some(card => combo.includes(card)));
        compatibleVillain.set(comboKey, compatible.length ? makeSampler(compatible) : null);
      }
      return compatibleVillain.get(comboKey);
    };
    const sampleCombos = onlyHand ? combos.filter(item => compatibleSamplerFor(item.combo)) : combos;
    if (!sampleCombos.length) continue;
    const pickActor = makeSampler(sampleCombos), pickVillain = onlyHand ? null : makeSampler(villainRange);
    if (!onlyHand && !pickVillain) continue;
    // compatiblePair also needs the arrays only for its rare deterministic fallback.
    pickActor.items = combos;
    if (pickVillain) pickVillain.items = villainRange;
    const samplingKey = usesObservableActions(spot) ? `${currentBoard}|${nodeTable.path.flop}|${nodeTable.path.turn}|${nodeTable.path.river}` : key;
    const random = rng(sampleSeed ?? seedFor(`${config.seed}|later-hand-ev|${samplingKey}|${decision.node}|${hand}`));
    const sums = Object.fromEntries(actions.map(action => [action, 0]));
    let wins = 0, mixedEv = 0, completed = 0;
    const allowedCombos = onlyHand ? new Set(sampleCombos) : null;
    const mixEntries = nodeMix.get(hand).filter(entry => !allowedCombos || allowedCombos.has(entry.item));
    const totalWeight = sampleCombos.reduce((sum, item) => sum + item.weight, 0);
    const mix = Object.fromEntries(actions.map(action => [action, totalWeight
      ? round(mixEntries.reduce((sum, entry) => sum + entry.item.weight * entry.mix[action], 0) / totalWeight) : 0]));
    const mixSum = Object.values(mix).reduce((sum, value) => sum + value, 0);
    if (actions.length) mix[actions.at(-1)] = round(mix[actions.at(-1)] + 100 - mixSum);
    for (let sample = 0; sample < samples; sample++) {
      let actorCombo, villainCombo;
      if (onlyHand) {
        actorCombo = pickActor(random).combo;
        const pickCompatibleVillain = compatibleSamplerFor(actorCombo);
        if (!pickCompatibleVillain) continue;
        villainCombo = pickCompatibleVillain(random).combo;
      } else {
        const pair = compatiblePair(pickActor, pickVillain, random);
        if (!pair) break;
        actorCombo = pair.actor.combo;
        villainCombo = pair.villain.combo;
      }
      const used = new Set([...actorCombo, ...villainCombo, ...runout.turnBoard]);
      let finalRunout;
      if (street === "turn") {
        const live = [];
        for (let card = 0; card < 52; card++) if (!used.has(card)) live.push(card);
        if (!live.length) break;
        finalRunout = [runout.turn, live[Math.floor(random() * live.length)]];
      } else finalRunout = [runout.turn, runout.river];
      const finalBoard = [...flopBoard, ...finalRunout];
      const mine = evaluate([...actorCombo, ...finalBoard]), theirs = evaluate([...villainCombo, ...finalBoard]);
      wins += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
      const hands = { [actor]: actorCombo, [opponent]: villainCombo };
      const sampleMix = comboMix.get(actorCombo.join(","));
      const streamSeed = Math.floor(random() * 2 ** 32);
      for (const action of actions) {
        const value = playFromLaterNode({ hands, flopBoard, runout: finalRunout, flopActions: flopPath.actions,
          turnActions: street === "river" ? turnHistory : history, street, streetActions: history, node: decision.node, forced: action, laterMix, defence, spot,
          random: rng(streamSeed) });
        if (value == null) continue;
        sums[action] += value;
        mixedEv += sampleMix[action] / 100 * value;
      }
      completed++;
    }
    if (!completed) continue;
    validClasses++;
    const equity = wins / completed;
    const ev = mixedEv / completed;
    rows[hand] = {
      equity_pct: round(equity * 100),
      ev_bb: Object.fromEntries(actions.map(action => [action, round(sums[action] / completed)])),
      mix_ev_bb: round(ev),
      eqr: equity > 0.02 ? round(ev / (equity * (decision.potBb - rake(decision.potBb)))) : null,
      mix,
    };
  }
  return [key, { node: decision.node, actor, pot_bb: decision.potBb, rows, ...(!validClasses ? { unreachable: true } : {}) }];
}

// Exact (zero variance) per-class action EV of one turn / river decision: see exact-ev.mjs. A turn decision
// averages over every river card; a river decision has none left to average.
function computeNodeExactRaw({ key, street, history, turnHistory = [], expectedNode, expectedRole, flopPath, runout, board, inputs,
  flopPolicy, laterPolicy, onlyHand = null }) {
  const { spot } = inputs;
  const turnStart = laterStart(flopPath.actions, spot);
  if (!turnStart) throw new Error("Invalid representative flop path");
  let riverStart = null;
  if (street === "river") {
    const turnResult = replayLater("turn", turnHistory, turnStart, spot);
    if (!turnResult.state.end || ["fold", "raise-fold"].includes(turnResult.end?.type) || turnResult.stacks.ip <= 0 || turnResult.stacks.oop <= 0) {
      return [key, { node: expectedNode, actor: spot[expectedRole], pot_bb: turnResult.pot, rows: {}, unreachable: true }];
    }
    riverStart = { pot: turnResult.pot, stacks: turnResult.stacks, lastAggressor: turnResult.lastAggressor };
  }
  const setup = currentNodeSetup({ street, actions: history, turnStart, riverStart, spot });
  const decision = setup.decision;
  if (!decision.node) return [key, { node: expectedNode, actor: spot[expectedRole], pot_bb: decision.potBb, rows: {}, unreachable: true }];
  const role = decision.role, actor = spot[role], opponent = spot[role === "ip" ? "oop" : "ip"];
  if (setup.replay.stacks[role] <= 0) return [key, { node: decision.node, actor, pot_bb: decision.potBb, rows: {}, unreachable: true }];
  const currentBoard = street === "turn" ? runout.turnBoard : runout.riverBoard;
  const defence = defenceFor(inputs, flopPolicy, laterPolicy);
  const nodeTable = replayDecision(inputs, currentBoard, { flop: flopPath.actions,
    turn: street === "river" ? turnHistory : history, river: street === "river" ? history : [] });
  const actorRange = defence.rangeItems(nodeTable, currentBoard, actor);
  const villainRange = defence.rangeItems(nodeTable, currentBoard, opponent);
  const groups = new Map();
  for (const item of actorRange) {
    const hand = handClass(item.combo);
    if (onlyHand && hand !== onlyHand) continue;
    if (!groups.has(hand)) groups.set(hand, []);
    groups.get(hand).push(item);
  }
  const actions = nodeTable.log.at(-1)?.observation?.classes.map(group => group.action) ?? LATER_NODES[decision.node];
  const finals = [];
  if (street === "turn") {
    for (let card = 0; card < 52; card++) if (!runout.turnBoard.includes(card)) finals.push([...runout.turnBoard, card]);
  } else finals.push(runout.riverBoard);
  const rows = {};
  if (groups.size && villainRange.length) {
    const result = exactActionEv({ spot, defence, expectedNode: decision.node, finals, oppItems: villainRange,
      rootPath: { flop: flopPath.actions, turn: street === "river" ? turnHistory : history, river: street === "river" ? history : [] },
      heroGroups: [...groups].map(([group, items]) => ({ key: group, items })) });
    const exactActions = usesObservableActions(spot) ? result.actions : actions;
    for (const [hand, row] of result.rows) {
      const mix = Object.fromEntries(exactActions.map((action, k) => [action, round(row.mix[k])]));
      const mixSum = Object.values(mix).reduce((sum, value) => sum + value, 0);
      if (exactActions.length) mix[exactActions.at(-1)] = round(mix[exactActions.at(-1)] + 100 - mixSum);
      rows[hand] = {
        equity_pct: round(row.equity * 100),
        ev_bb: Object.fromEntries(exactActions.map((action, k) => [action, round(row.ev[k])])),
        mix_ev_bb: round(row.mixEv),
        eqr: row.equity > 0.02 ? round(row.mixEv / (row.equity * (decision.potBb - rake(decision.potBb)))) : null,
        mix,
      };
    }
  }
  return [key, { node: decision.node, actor, pot_bb: decision.potBb, rows, ...(!Object.keys(rows).length ? { unreachable: true } : {}) }];
}

export const computeNode = args => args.method === "monte-carlo" ? computeNodeMonteCarlo(args) : computeNodeExact(args);

// A history can list actions after a raise the engine had to play as a call (the raiser had no chips
// to raise with); that line never happens, so its node is unreachable rather than an error.
const effectivelyCalled = error => /effectively called|effectively ended|Action history continues after a pending or completed hand/.test(error?.message ?? "");
const unreachableNode = ({ key, expectedNode, expectedRole, inputs }) =>
  [key, { node: expectedNode, actor: inputs.spot[expectedRole], pot_bb: null, rows: {}, unreachable: true }];
export function computeNodeMonteCarlo(args) {
  try { return computeNodeMonteCarloRaw(args); } catch (error) { if (effectivelyCalled(error)) return unreachableNode(args); throw error; }
}
function computeNodeExact(args) {
  try { return computeNodeExactRaw(args); } catch (error) { if (effectivelyCalled(error)) return unreachableNode(args); throw error; }
}

function validateHandClass(hand) {
  if (typeof hand !== "string" || !/^[2-9TJQKA]{2}[so]?$/.test(hand)) throw new Error("Invalid hand class");
  const high = ranks.indexOf(hand[0]), low = ranks.indexOf(hand[1]);
  if (high < low || (high === low) !== (hand.length === 2)) throw new Error("Invalid hand class");
}

function unreachableHandResult({ node = null, actor = null, potBb = null, street }) {
  return { node, actor, pot_bb: potBb, street, row: null, unreachable: true };
}

// On-demand, pure one-hand entry point. All ranges and policies are provided by the caller;
// it does not load artifacts or touch the local filesystem.
export function laterHandEvForHand({ flop, flopActions = [], turn, turnActions = [], river = null, riverActions = [],
  hand, inputs, flopPolicy, laterPolicy, samples = LATER_HAND_EV_FOR_HAND_DEFAULT_SAMPLES, seed, method = "exact", rng } = {}) {
  if (method === "monte-carlo" && (!Number.isInteger(samples) || samples < 1)) throw new Error("samples must be a positive integer");
  validateHandClass(hand);
  if (!inputs?.spot || !inputs?.seatRows) throw new Error("Invalid postflop inputs");
  if (!Array.isArray(flopActions) || !Array.isArray(turnActions) || !Array.isArray(riverActions)) throw new Error("Invalid action path");

  const flopCards = parseCards(flop, 3), turnCard = parseCards(turn, 1)[0];
  const riverCard = river == null ? null : parseCards(river, 1)[0];
  const boardCards = [...flopCards, turnCard, ...(riverCard == null ? [] : [riverCard])];
  if (new Set(boardCards).size !== boardCards.length) throw new Error("Duplicate board cards");
  const street = riverCard == null ? "turn" : "river";
  if (usesObservableActions(inputs.spot)) {
    const path = canonicalPostflopPath(inputs.spot, { flop: flopActions, turn: turnActions, river: riverActions }, config);
    flopActions = path.flop; turnActions = path.turn; riverActions = path.river;
  }
  const history = street === "turn" ? turnActions : riverActions;
  const spot = inputs.spot;
  const flopStateAtPath = flopState(spot.tree, flopActions);
  if (!flopStateAtPath.end || !["check", "call", "raise-call"].includes(flopStateAtPath.end.type)) {
    return unreachableHandResult({ street });
  }
  const turnStart = laterStart(flopActions, spot);
  if (!turnStart) return unreachableHandResult({ street });

  let riverStart = null;
  if (street === "river") {
    const turnReplay = replayLater("turn", turnActions, turnStart, spot);
    if (!turnReplay.state.end || ["fold", "raise-fold"].includes(turnReplay.state.end.type) ||
        turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
      return unreachableHandResult({ potBb: turnReplay.pot, street });
    }
    riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
  }
  const decision = laterDecision(street, history, street === "turn" ? turnStart : riverStart, spot);
  if (!decision.node) return unreachableHandResult({ potBb: decision.potBb, street });

  const policy = validatePolicy(flopPolicy, spot.tree);
  const later = validateLaterPolicy(laterPolicy);
  const laterMix = makeLaterMixReader(later);
  const runout = { turn: turnCard, river: riverCard,
    turnBoard: [...flopCards, turnCard],
    ...(riverCard == null ? {} : { riverBoard: [...flopCards, turnCard, riverCard] }) };
  const board = { id: flop, cards: flopCards };
  const flopPath = { actions: flopActions, steps: flopStateAtPath.steps };
  const key = laterHandEvKey({ flop, turn, river: riverCard == null ? "-" : river,
    flopActions, turnActions, riverActions: street === "river" ? riverActions : null });
  const seedMaterial = seed ?? `${config.seed}|later-hand-ev|${flop}|${turn}|${river}|${flopActions}|${turnActions}|${riverActions}|${hand}`;
  const sampleSeed = typeof seedMaterial === "number" && Number.isInteger(seedMaterial)
    ? seedMaterial : seedFor(String(seedMaterial));
  const [, result] = computeNode({ key, street, history, turnHistory: turnActions,
    expectedNode: decision.node, expectedRole: decision.role, flopPath, runout, board, inputs,
    flopPolicy: policy, laterPolicy: later, laterMix, samples, onlyHand: hand, sampleSeed, method, rng });
  const row = result.rows[hand] ?? null;
  return { node: result.node, actor: result.actor, pot_bb: result.pot_bb, street, row,
    ...(!row || result.unreachable ? { unreachable: true } : {}) };
}

// The sampled estimate the exact method replaced; kept only to validate it (tests, validation scripts).
export const laterHandEvForHandMonteCarlo = args => laterHandEvForHand({ ...args, method: "monte-carlo" });
