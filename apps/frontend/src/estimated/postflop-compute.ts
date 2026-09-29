import { buildInputs, boards, comboRange, seatRange, sha } from "../../scripts/postflop-ai/browser-inputs.mjs";
import { evaluate, seedFor, seededRandom } from "../../scripts/lib/equity.mjs";
import { explainCombo } from "../../scripts/postflop-ai/explain.mjs";
import { explainLaterCombo } from "../../scripts/postflop-ai/explain-later.mjs";
import { choose, NODES, nodeRole, policyMix, scaleByPath, treeNodes, validatePolicy } from "../../scripts/postflop-ai/policy.mjs";
import { boardTexture, handTier, parseCards, runoutTexture, TIERS } from "../../scripts/postflop-ai/model.mjs";
import { FLOP_BETS, flopState } from "../../scripts/postflop-ai/tree.mjs";
import { LATER_NODES } from "../../scripts/postflop-ai/later-tree.mjs";
import { laterPolicyMix, validateLaterPolicy } from "../../scripts/postflop-ai/later-policy.mjs";
import { laterDecision, laterStart, replayLater } from "./postflop-trial.ts";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "../../scripts/postflop-ai/engine.mjs";
import pilotConfig from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };

const cardText = card => "23456789TJQKA"[card >> 2] + "cdhs"[card & 3];
const cardKey = cards => [...cards].sort((a, b) => a - b).join(",");

function currentBoard(value) {
  return boards().find(item => item.id === value);
}

function policyForLater(inputs, candidate, laterCandidate) {
  if (!laterCandidate) {
    const error = new Error("ターン・リバーのAI方針がありません。");
    error.code = "LATER_POLICY_MISSING";
    throw error;
  }
  const flopPolicy = validatePolicy(candidate?.policy, inputs.spot.tree);
  if (candidate?.metadata?.source_hash !== inputs.fingerprint ||
      candidate.metadata.policy_hash !== sha(flopPolicy) ||
      laterCandidate.metadata?.source_hash !== inputs.fingerprint ||
      laterCandidate.metadata?.flop_policy_hash !== candidate.metadata.policy_hash) {
    throw new Error("Later AI policy source or flop policy is stale");
  }
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  if (laterCandidate.metadata.policy_hash !== sha(laterPolicy)) throw new Error("Saved later AI policy hash does not match its content");
  return { flopPolicy, laterPolicy };
}

export function computeBoard({ spotId, board, datasets, flopCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  const selected = currentBoard(board);
  if (!selected) throw new Error("対象の代表フロップがありません。");
  const policy = validatePolicy(flopCandidate.policy, inputs.spot.tree);
  if (flopCandidate.metadata?.source_hash !== inputs.fingerprint || flopCandidate.metadata.policy_hash !== sha(policy)) {
    throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  }
  const { spot } = inputs;
  const nodes = Object.fromEntries(treeNodes(spot.tree).map(node => {
    const actions = NODES[node];
    const seat = spot[nodeRole(node)];
    const rows = inputs.seatRows[seat].map(row => {
      const combos = comboRange([row], "freq", selected.cards);
      const total = combos.reduce((sum, item) => sum + item.weight, 0);
      const mix = Object.fromEntries(actions.map(action => [action, total
        ? combos.reduce((sum, item) => sum + item.weight * policyMix(policy, node, item.combo, selected.cards)[action], 0) / total / 100
        : 0]));
      const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0]));
      const detail = combos.map(item => {
        const tier = handTier(item.combo, selected.cards);
        if (total) tiers[tier] += item.weight / total;
        const itemMix = policyMix(policy, node, item.combo, selected.cards);
        return { cards: item.combo.map(cardText).join(""), tier, weight: item.weight,
          mix: Object.fromEntries(actions.map(action => [action, itemMix[action] / 100])) };
      });
      return { hand: row.hand, comboCount: combos.length, reachable: total > 0, mix, tiers, combos: detail };
    });
    return [node, { seat, actions, rows }];
  }));
  return { kind: "ai_estimate_not_gto", spot: spot.id, tree: spot.tree, ip: spot.ip, oop: spot.oop,
    pot_bb: spot.potBb, stack_bb: spot.stackBb, board: selected.id, split: selected.split,
    texture: boardTexture(selected.cards), source_hash: inputs.fingerprint,
    policy_hash: flopCandidate.metadata.policy_hash, nodes };
}

export function computeExplain({ spotId, board, node, cards, prev, datasets, flopCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  const selected = currentBoard(board);
  if (!selected) throw new Error("対象の代表フロップがありません。");
  if (typeof cards !== "string" || !/^([2-9TJQKA][cdhs]){2}$/.test(cards)) throw new Error("カードの形式が正しくありません。");
  const previous = FLOP_BETS.includes(prev) ? prev : FLOP_BETS[0];
  return { spot: inputs.spot.id, board: selected.id,
    ...explainCombo({ boardCards: selected.cards, node, cards, prev: previous, inputs,
      policy: validatePolicy(flopCandidate.policy, inputs.spot.tree) }) };
}

function lineFor(previousAggressor, role) {
  return previousAggressor === null ? "checked" : previousAggressor === role ? "aggressor" : "defender";
}

function scaleLaterPath(items, role, steps, policy, board, previousAggressor) {
  return steps.filter(step => step.role === role).reduce((range, step) => {
    const line = lineFor(previousAggressor, role);
    return range.map(item => ({ ...item,
      weight: item.weight * laterPolicyMix(policy, step.node, item.combo, board, line)[step.action] / 100,
    }));
  }, items);
}

function representativeBoard(value) {
  if (typeof value !== "string" || !/^([2-9TJQKA][cdhs]){3}$/.test(value)) throw new Error("フロップの形式が正しくありません。");
  const cards = parseCards(value, 3);
  const match = boards().find(board => cardKey(board.cards) === cardKey(cards));
  if (!match) throw new Error("対象の代表フロップがありません。");
  return match;
}

function singleCard(value, label, used) {
  if (!value) return null;
  if (typeof value !== "string" || !/^[2-9TJQKA][cdhs]$/.test(value)) throw new Error(`${label}の形式が正しくありません。`);
  const card = parseCards(value, 1)[0];
  if (used.has(card)) throw new Error("盤面カードが重複しています。");
  used.add(card);
  return card;
}

function parseActions(value) {
  if (value == null || value === "") return [];
  if (typeof value !== "string") throw new Error("アクション履歴の形式が正しくありません。");
  return value.split(",");
}

function mixRows({ actor, role, board, node, line, inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps,
  turnBoard, riverBoard, turnPreviousAggressor, riverPreviousAggressor }) {
  const actions = LATER_NODES[node];
  const rows = inputs.seatRows[actor];
  if (!rows) throw new Error(`Missing saved range for ${actor}`);
  return rows.map(row => {
    let combos = comboRange([row], "freq", board);
    combos = scaleByPath(combos, role, flopSteps, flopPolicy, board.slice(0, 3));
    if (turnSteps) combos = scaleLaterPath(combos, role, turnSteps, laterPolicy, turnBoard, turnPreviousAggressor);
    if (riverSteps) combos = scaleLaterPath(combos, role, riverSteps, laterPolicy, riverBoard, riverPreviousAggressor);
    const totals = Object.fromEntries(actions.map(action => [action, 0]));
    const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0]));
    let weightTotal = 0;
    for (const item of combos) {
      if (!item.weight) continue;
      const rawTier = handTier(item.combo, board);
      const tier = rawTier === "draw" && node.startsWith("river_") ? "medium" : rawTier;
      const mix = laterPolicyMix(laterPolicy, node, item.combo, board, line);
      weightTotal += item.weight;
      tiers[tier] += item.weight;
      for (const action of actions) totals[action] += item.weight * mix[action] / 100;
    }
    const tier = Object.entries(tiers).reduce((best, item) => item[1] > best[1] ? item : best, ["air", -1])[0];
    const averaged = Object.fromEntries(actions.map(action => [action, weightTotal ? totals[action] / weightTotal : 0]));
    const mixTotal = Object.values(averaged).reduce((sum, value) => sum + value, 0);
    return { hand: row.hand, reachable: weightTotal > 0, tier,
      mix: Object.fromEntries(actions.map(action => [action, mixTotal ? averaged[action] / mixTotal : 0])) };
  });
}

export function computeLaterView({ spotId, flop, flopActions = "", turn = "", turnActions = "", river = "", riverActions = "",
  datasets, flopCandidate, laterCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  const { flopPolicy, laterPolicy } = policyForLater(inputs, flopCandidate, laterCandidate);
  const flopBoard = representativeBoard(flop);
  const used = new Set(flopBoard.cards);
  const turnCard = singleCard(turn, "ターン", used);
  const riverCard = singleCard(river, "リバー", used);
  const flopPath = parseActions(flopActions);
  const turnPath = parseActions(turnActions);
  const riverPath = parseActions(riverActions);
  const start = laterStart(flopPath, inputs.spot);
  if (!start) throw new Error("フロップのアクションが後続ストリートへ進める状態ではありません。");
  if (turnCard === null) throw new Error("ターンカードを選択してください。");

  const turnBoard = [...flopBoard.cards, turnCard];
  const turnReplay = replayLater("turn", turnPath, start, inputs.spot);
  let street = "turn", currentBoard = turnBoard;
  let riverBoard = null, turnSteps = turnReplay.state.steps, riverSteps = null, riverPreviousAggressor = null;
  let decision = laterDecision("turn", turnPath, start, inputs.spot);
  if (!decision.node) {
    if (["fold", "raise-fold"].includes(turnReplay.end?.type) || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
      throw new Error("このアクションではショーダウンまで進んでおり、次の判断はありません。");
    }
    if (riverCard === null) throw new Error("リバーカードを選択してください。");
    street = "river";
    const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    currentBoard = [...turnBoard, riverCard];
    riverBoard = currentBoard;
    riverPreviousAggressor = turnReplay.lastAggressor;
    const riverReplay = replayLater("river", riverPath, riverStart, inputs.spot);
    riverSteps = riverReplay.state.steps;
    decision = laterDecision("river", riverPath, riverStart, inputs.spot);
    if (!decision.node) throw new Error("リバーの判断は終了しています。");
  }
  const flopSteps = flopState(inputs.spot.tree, flopPath).steps;
  const role = decision.role;
  const actor = inputs.spot[role];
  const rows = mixRows({ actor, role, board: currentBoard, node: decision.node, line: decision.line,
    inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps, turnBoard, riverBoard,
    turnPreviousAggressor: start.lastAggressor, riverPreviousAggressor });
  return { kind: "ai_estimate_not_gto", street, node: decision.node, actor, line: decision.line,
    texture: runoutTexture(currentBoard), pot_bb: decision.potBb, rows };
}

export function computeLaterExplain({ spotId, flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "",
  cards, datasets, flopCandidate, laterCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  return { spot: inputs.spot.id, ...explainLaterCombo({ flop, flopActions, turn, turnActions, river, riverActions,
    cards, inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy }) };
}

// The on-demand EV implementation is kept in this browser entry point so callers can
// transfer one self-contained request to a Web Worker without importing the Node-only
// artifact generation and worker-pool path from later-hand-ev.mjs.
const referenceLine = (aggressor, role) => aggressor == null ? "checked" : aggressor === role ? "aggressor" : "defender";
const ranks = "23456789TJQKA";
const round = value => Math.round(value * 100) / 100;
const handClass = ([a, b]) => {
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return ranks[high >> 2].repeat(2);
  return ranks[high >> 2] + ranks[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
};

function laterHandEvKey({ flop, turn, river = "-", flopActions = [], turnActions = [], riverActions = null }) {
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

function scaleLaterPathForEv(items, role, steps, mixFor, board, previousAggressor) {
  const line = referenceLine(previousAggressor, role);
  return steps.filter(step => step.role === role).reduce((range, step) => range.map(item => ({
    ...item, weight: item.weight * mixFor(step.node, item.combo, board, line)[step.action] / 100,
  })), items);
}

function rangeAtNodeForEv({ inputs, spot, seat, role, flop, flopActions, turnBoard, turnSteps, turnPreviousAggressor,
  riverBoard, riverSteps, riverPreviousAggressor, flopPolicy, laterMix }) {
  let items = seatRange(inputs, seat, riverBoard ?? turnBoard);
  const flopStateAtPath = flopState(spot.tree, flopActions);
  items = scaleByPath(items, role, flopStateAtPath.steps, flopPolicy, flop);
  items = scaleLaterPathForEv(items, role, turnSteps, laterMix, turnBoard, turnPreviousAggressor);
  if (riverBoard && riverSteps) items = scaleLaterPathForEv(items, role, riverSteps, laterMix, riverBoard, riverPreviousAggressor);
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
  playFlop(table, spot.tree, () => flopActions[flopIndex++], pilotConfig);
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
  playLaterStreetsWithPolicy(table, flopBoard, runout, decide, pilotConfig, table.lastAggressor);
  if (!atNode) return null;
  const actor = spot[node.split("_")[1]];
  const winner = settle(table, hands, [...flopBoard, ...runout]);
  const paid = table.pot - rake(table.pot);
  const share = winner === actor ? paid : winner === "tie" ? paid / 2 : 0;
  return share - table.invested[actor] + atNode[actor];
}

function computeNodeForHandEv({ key, street, history, turnHistory = [], expectedNode, expectedRole, flopPath, runout, board, inputs,
  flopPolicy, laterPolicy, laterMix, samples, onlyHand = null, sampleSeed = null }) {
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
    ranges[seat] = rangeAtNodeForEv({ inputs, spot, seat, role: rangeRole, flop: flopBoard, flopActions: flopPath.actions,
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
    const mix = laterMix(decision.node, item.combo, currentBoard, decision.line);
    nodeMix.get(hand).push({ item, mix });
    comboMix.set(item.combo.join(","), mix);
  }
  const actions = LATER_NODES[decision.node];
  const rows = {};
  let validClasses = 0;
  for (const [hand, combos] of grouped) {
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
    pickActor.items = combos;
    if (pickVillain) pickVillain.items = villainRange;
    const random = seededRandom(sampleSeed ?? seedFor(`${pilotConfig.seed}|later-hand-ev|${key}|${decision.node}|${hand}`));
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
          turnActions: street === "river" ? turnHistory : history, street, streetActions: history, node: decision.node,
          forced: action, laterMix, spot, random: seededRandom(streamSeed) });
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

function validateHandClass(hand) {
  if (typeof hand !== "string" || !/^[2-9TJQKA]{2}[so]?$/.test(hand)) throw new Error("Invalid hand class");
  const high = ranks.indexOf(hand[0]), low = ranks.indexOf(hand[1]);
  if (high < low || (high === low) !== (hand.length === 2)) throw new Error("Invalid hand class");
}

function unreachableHandResult({ node = null, actor = null, potBb = null, street }) {
  return { node, actor, pot_bb: potBb, street, row: null, unreachable: true };
}

function laterHandEvForHandBrowser({ flop, flopActions = [], turn, turnActions = [], river = null, riverActions = [],
  hand, inputs, flopPolicy, laterPolicy, samples = 600, seed } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  validateHandClass(hand);
  if (!inputs?.spot || !inputs?.seatRows) throw new Error("Invalid postflop inputs");
  if (!Array.isArray(flopActions) || !Array.isArray(turnActions) || !Array.isArray(riverActions)) throw new Error("Invalid action path");

  const flopCards = parseCards(flop, 3), turnCard = parseCards(turn, 1)[0];
  const riverCard = river == null ? null : parseCards(river, 1)[0];
  const boardCards = [...flopCards, turnCard, ...(riverCard == null ? [] : [riverCard])];
  if (new Set(boardCards).size !== boardCards.length) throw new Error("Duplicate board cards");
  const street = riverCard == null ? "turn" : "river";
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
  const runout = { turn: turnCard, river: riverCard, turnBoard: [...flopCards, turnCard],
    ...(riverCard == null ? {} : { riverBoard: [...flopCards, turnCard, riverCard] }) };
  const board = { id: flop, cards: flopCards };
  const flopPath = { actions: flopActions, steps: flopStateAtPath.steps };
  const key = laterHandEvKey({ flop, turn, river: riverCard == null ? "-" : river, flopActions,
    turnActions, riverActions: street === "river" ? riverActions : null });
  const seedMaterial = seed ?? `${pilotConfig.seed}|later-hand-ev|${flop}|${turn}|${river}|${flopActions}|${turnActions}|${riverActions}|${hand}`;
  const sampleSeed = typeof seedMaterial === "number" && Number.isInteger(seedMaterial) ? seedMaterial : seedFor(String(seedMaterial));
  const [, result] = computeNodeForHandEv({ key, street, history, turnHistory: turnActions,
    expectedNode: decision.node, expectedRole: decision.role, flopPath, runout, board, inputs,
    flopPolicy: policy, laterPolicy: later, laterMix, samples, onlyHand: hand, sampleSeed });
  const row = result.rows[hand] ?? null;
  return { node: result.node, actor: result.actor, pot_bb: result.pot_bb, street, row,
    ...(!row || result.unreachable ? { unreachable: true } : {}) };
}

export function computeLaterHandEv({ spotId, flop, flopActions = [], turn, turnActions = [], river = null, riverActions = [],
  hand, samples, seed, datasets, flopCandidate, laterCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  return laterHandEvForHandBrowser({ flop, flopActions, turn, turnActions, river, riverActions, hand, samples, seed,
    inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy });
}
