// Per-hand action EV/EQR for representative turn and river nodes. Values are sampled by
// AI-policy self-play and are local estimates, not GTO or solver output.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { evaluate, seedFor, seededRandom } from "../lib/equity.mjs";
import { artifactPaths, boards, config, loadInputs, readArtifact, seatRange } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.mjs";
import { choose, scaleByPath, validatePolicy } from "./policy.mjs";
import { laterPolicyMix, validateLaterPolicy } from "./later-policy.mjs";
import { LATER_NODES, streetHistories } from "./later-tree.mjs";
import { FLOP_BETS, flopState } from "./tree.mjs";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "./engine.mjs";
import { DEFAULT_SPOT_ID } from "./spots.mjs";
import { laterDecision, laterStart, replayLater } from "../../src/estimated/postflop-trial.ts";

export const LATER_HAND_EV_DEFAULT_SAMPLES = 1000;
export const LATER_HAND_EV_VERSION = 1;
const referenceLine = (aggressor, role) => aggressor == null ? "checked" : aggressor === role ? "aggressor" : "defender";
const ranks = "23456789TJQKA";
const round = value => Math.round(value * 100) / 100;
const cardText = card => ranks[card >> 2] + "cdhs"[card & 3];
const handClass = ([a, b]) => {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return ranks[high >> 2].repeat(2);
  return ranks[high >> 2] + ranks[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
};

function flopPaths(spot) {
  const check = spot.tree === "oop_leads" ? ["check", "check"] : ["check"];
  const paths = [check, [FLOP_BETS[0], "call"]];
  return paths.map(actions => {
    const state = flopState(spot.tree, actions);
    if (!state.end || !["check", "call", "raise-call"].includes(state.end.type)) throw new Error("Invalid representative flop path");
    return { actions, steps: state.steps };
  });
}

// Deliberately identical to balance.mjs's seeded dealing rule. The four turns are removed
// first; then three distinct representative rivers are drawn from the remaining deck for
// each selected turn.
export function representativeLaterRunouts(board) {
  const random = seededRandom(seedFor(`${config.seed}|balance|${board.id}`));
  const deck = Array.from({ length: 52 }, (_, card) => card).filter(card => !board.cards.includes(card));
  const take = cards => cards.splice(Math.floor(random() * cards.length), 1)[0];
  const turns = Array.from({ length: 4 }, () => take(deck));
  return turns.flatMap(turn => {
    const rivers = deck.filter(card => card !== turn);
    const turnBoard = [...board.cards, turn];
    return Array.from({ length: 3 }, () => {
      const river = take(rivers);
      return { turn, river, turnBoard, riverBoard: [...turnBoard, river] };
    });
  });
}

export function laterHandEvKey({ flop, turn, river = "-", flopActions = [], turnActions = [], riverActions = null }) {
  // The requested five-part key is retained. For river decisions the final field is
  // `turnHistory>riverHistory`, which keeps each distinct river node addressable.
  const streetHistory = riverActions === null ? turnActions.join(",") : `${turnActions.join(",")}>${riverActions.join(",")}`;
  return `${flop}|${turn}|${river}|${flopActions.join(",")}|${streetHistory}`;
}

function makeLaterMixReader(policy) {
  const cache = new Map();
  return (node, combo, board, line) => {
    const cards = [...combo].sort((a, b) => a - b).join(",");
    const key = `${node}|${cards}|${board.join(",")}|${line}`;
    if (!cache.has(key)) cache.set(key, laterPolicyMix(policy, node, combo, board, line));
    return cache.get(key);
  };
}

function scaleLaterPath(items, role, steps, mixFor, board, previousAggressor) {
  const line = referenceLine(previousAggressor, role);
  return steps.filter(step => step.role === role).reduce((range, step) => range.map(item => ({
    ...item, weight: item.weight * mixFor(step.node, item.combo, board, line)[step.action] / 100,
  })), items);
}

function rangeAtNode({ inputs, spot, seat, role, flop, flopActions, turnBoard, turnSteps, turnPreviousAggressor,
  riverBoard, riverSteps, riverPreviousAggressor, flopPolicy, laterMix }) {
  let items = seatRange(inputs, seat, riverBoard ?? turnBoard);
  const flopStateAtPath = flopState(spot.tree, flopActions);
  items = scaleByPath(items, role, flopStateAtPath.steps, flopPolicy, flop);
  items = scaleLaterPath(items, role, turnSteps, laterMix, turnBoard, turnPreviousAggressor);
  if (riverBoard && riverSteps) items = scaleLaterPath(items, role, riverSteps, laterMix, riverBoard, riverPreviousAggressor);
  return items.filter(item => item.weight > 0);
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
  laterMix, spot, random }) {
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
      const mix = laterMix(currentNode, hands[seat], board, line);
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

function computeNode({ key, street, history, turnHistory = [], expectedNode, expectedRole, flopPath, runout, board, inputs, flopPolicy, laterPolicy, laterMix, samples }) {
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
  const ranges = {};
  for (const [seat, rangeRole] of [[actor, role], [opponent, role === "ip" ? "oop" : "ip"]]) {
    ranges[seat] = rangeAtNode({ inputs, spot, seat, role: rangeRole, flop: flopBoard, flopActions: flopPath.actions,
      turnBoard: runout.turnBoard, turnSteps: setup.turnSteps ?? replayLater("turn", turnHistory, turnStart, spot).state.steps,
      turnPreviousAggressor: turnStart.lastAggressor, riverBoard: street === "river" ? runout.riverBoard : null,
      riverSteps: street === "river" ? setup.riverSteps : null, riverPreviousAggressor: riverStart?.lastAggressor,
      flopPolicy, laterMix });
  }
  const actorRange = ranges[actor];
  const villainRange = ranges[opponent];
  const grouped = new Map();
  for (const item of actorRange) {
    const hand = handClass(item.combo);
    if (!grouped.has(hand)) grouped.set(hand, []);
    grouped.get(hand).push(item);
  }
  const nodeMix = new Map();
  const comboMix = new Map();
  for (const item of actorRange) {
    const hand = handClass(item.combo);
    if (!nodeMix.has(hand)) nodeMix.set(hand, []);
    const mix = laterMix(decision.node, item.combo, currentBoard, decision.line);
    nodeMix.get(hand).push({ item, mix });
    comboMix.set(item.combo.join(","), mix);
  }
  const actions = LATER_NODES[decision.node];
  const rows = {};
  let validClasses = 0;
  for (const [hand, combos] of grouped) {
    const pickActor = makeSampler(combos), pickVillain = makeSampler(villainRange);
    if (!pickVillain) continue;
    // compatiblePair also needs the arrays only for its rare deterministic fallback.
    pickActor.items = combos;
    pickVillain.items = villainRange;
    const random = seededRandom(seedFor(`${config.seed}|later-hand-ev|${key}|${decision.node}|${hand}`));
    const sums = Object.fromEntries(actions.map(action => [action, 0]));
    let wins = 0, mixedEv = 0, completed = 0;
    const mixEntries = nodeMix.get(hand);
    const totalWeight = combos.reduce((sum, item) => sum + item.weight, 0);
    const mix = Object.fromEntries(actions.map(action => [action, totalWeight
      ? round(mixEntries.reduce((sum, entry) => sum + entry.item.weight * entry.mix[action], 0) / totalWeight) : 0]));
    const mixSum = Object.values(mix).reduce((sum, value) => sum + value, 0);
    if (actions.length) mix[actions.at(-1)] = round(mix[actions.at(-1)] + 100 - mixSum);
    for (let sample = 0; sample < samples; sample++) {
      const pair = compatiblePair(pickActor, pickVillain, random);
      if (!pair) break;
      const actorCombo = pair.actor.combo, villainCombo = pair.villain.combo;
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
          turnActions: street === "river" ? turnHistory : history, street, streetActions: history, node: decision.node, forced: action, laterMix, spot,
          random: seededRandom(streamSeed) });
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

// Pure per-flop generator for tests and batch generation. Optional subsets are useful for
// fast deterministic function-level checks; normal callers use the complete audited set.
export function laterHandEvForBoard(board, inputs, flopPolicy, laterPolicy,
  samples = LATER_HAND_EV_DEFAULT_SAMPLES, { runouts = representativeLaterRunouts(board), turnHistories: turnHistorySubset, riverHistories: riverHistorySubset } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  const policy = validatePolicy(flopPolicy, inputs.spot.tree);
  const later = validateLaterPolicy(laterPolicy);
  const laterMix = makeLaterMixReader(later);
  const turns = turnHistorySubset ?? streetHistories("turn");
  const rivers = riverHistorySubset ?? streetHistories("river");
  const selectedFlopPaths = flopPaths(inputs.spot);
  const out = {};
  const representativeTurns = [...new Map(runouts.map(runout => [runout.turn, runout])).values()];
  for (const path of selectedFlopPaths) {
    for (const runout of representativeTurns) {
      const turnText = cardText(runout.turn);
      for (const [historyText, { node }] of Object.entries(turns)) {
        const history = historyText ? historyText.split(",") : [];
        const key = laterHandEvKey({ flop: board.id, turn: turnText, flopActions: path.actions, turnActions: history });
        out[key] = computeNode({ key, street: "turn", history, expectedNode: node, expectedRole: node.split("_")[1], flopPath: path, runout, board, inputs,
          flopPolicy: policy, laterPolicy: later, laterMix, samples })[1];
      }
    }
    for (const river of runouts) {
      const turnText = cardText(river.turn);
      for (const turnHistory of [["check", "check"], ["bet75", "call"]]) {
        for (const [riverHistoryText] of Object.entries(rivers)) {
          const riverHistory = riverHistoryText ? riverHistoryText.split(",") : [];
          const key = laterHandEvKey({ flop: board.id, turn: turnText, river: cardText(river.river),
            flopActions: path.actions, turnActions: turnHistory, riverActions: riverHistory });
          out[key] = computeNode({ key, street: "river", history: riverHistory, turnHistory, expectedNode: rivers[riverHistoryText].node,
            expectedRole: rivers[riverHistoryText].role, flopPath: path,
            runout: river, board, inputs, flopPolicy: policy, laterPolicy: later, laterMix, samples,
          })[1];
        }
      }
    }
  }
  return out;
}

function artifactPath(inputs) {
  const paths = artifactPaths(inputs.spot);
  return paths.laterHandEv ?? paths.handEv.replace(/-hand-ev\.json$/, "-later-hand-ev.json");
}

function matchesLaterHandEv(data, inputs, candidate, laterCandidate) {
  return Boolean(laterCandidate) && data?.kind === "ai_estimate_not_gto" && data.version === LATER_HAND_EV_VERSION &&
    data.source_hash === inputs.fingerprint && data.policy_hash === candidate?.metadata?.policy_hash &&
    data.later_policy_hash === sha(laterCandidate.policy) && Number.isInteger(data.samples) && data.samples > 0 &&
    data.seed === config.seed;
}

export function loadLaterHandEv(inputs, candidate, laterCandidate) {
  const data = readArtifact(inputs.spot, "laterHandEv");
  return matchesLaterHandEv(data, inputs, candidate, laterCandidate) ? data : null;
}

async function generateBoardBatch(spotId, samples, onBoard) {
  const boardList = boards();
  const workerCount = Math.min(boardList.length, Math.max(1, Math.min(8, availableParallelism?.() ?? 1)));
  const jobs = Array.from({ length: workerCount }, (_, index) => boardList.filter((_, boardIndex) => boardIndex % workerCount === index).map(board => board.id));
  const resultsByBoard = {};
  const started = Date.now();
  const workers = jobs.map(boardIds => new Worker(new URL("./later-hand-ev-worker.mjs", import.meta.url), {
    workerData: { spotId, samples, boardIds },
  }));
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      let done = false;
      worker.on("message", message => {
        if (message?.error) { done = true; reject(new Error(message.error)); return; }
        resultsByBoard[message.boardId] = message.boards;
        onBoard(message.boardId, Date.now() - started);
      });
      worker.on("error", error => { if (!done) { done = true; reject(error); } });
      worker.on("exit", code => {
        if (done) return;
        done = true;
        if (code === 0) resolve(); else reject(new Error(`later-hand-ev worker exited (${code})`));
      });
    })));
  } catch (error) {
    await Promise.all(workers.map(worker => worker.terminate().catch(() => {})));
    throw error;
  }
  return Object.assign({}, ...boardList.map(board => resultsByBoard[board.id] ?? {}));
}

export async function generateLaterHandEv({ spotId = DEFAULT_SPOT_ID, samples = LATER_HAND_EV_DEFAULT_SAMPLES, onBoard = () => {} } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  const inputs = loadInputs(spotId);
  const candidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  if (!laterCandidate) {
    const error = new Error("ターン・リバーのAI方針がありません。");
    error.code = "LATER_POLICY_MISSING";
    throw error;
  }
  const flopPolicy = validatePolicy(candidate.policy, inputs.spot.tree);
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  const result = { kind: "ai_estimate_not_gto", version: LATER_HAND_EV_VERSION, source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, later_policy_hash: sha(laterPolicy), samples, seed: config.seed, boards: {} };
  result.boards = await generateBoardBatch(spotId, samples, onBoard);
  const path = artifactPath(inputs);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result)}\n`);
  return result;
}

// Read-only local lookup for `/local-postflop-later-hand-ev?spot=&key=&hand=`.
export function laterHandEvResult(data, key, hand) {
  const node = data?.boards?.[key];
  if (!node) return null;
  return { node: node.node, actor: node.actor, pot_bb: node.pot_bb, hand,
    row: hand == null ? null : node.rows?.[hand] ?? null, samples: data.samples, kind: data.kind };
}
