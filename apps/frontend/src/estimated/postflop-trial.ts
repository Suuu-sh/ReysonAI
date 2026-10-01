import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { DEFAULT_SPOT_ID, fourBetSpotFor, limpSpotFor, spotById, spotFor, threeBetSpotFor } from "../../scripts/postflop-ai/spots.mjs";
import { NODES, flopBetFraction, flopBetLabel, flopState, isFlopBet } from "../../scripts/postflop-ai/tree.mjs";
import { LATER_NODES, betFraction, streetState } from "../../scripts/postflop-ai/later-tree.mjs";
import { parseFlopBoard } from "../../scripts/postflop-ai/model.mjs";
import pilotConfig from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };

export const representativeFlops = pilot.boards.map(board => parseFlopBoard(board.cards).id);
export const deck = "23456789TJQKA".split("").flatMap(rank => "shdc".split("").map(suit => `${rank}${suit}`));
export function recognizedFlop(cards) {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !deck.includes(card)) || new Set(cards).size !== 3) return null;
  try {
    return parseFlopBoard(cards.join("")).id;
  } catch {
    return null;
  }
}
const round = value => Math.round(value * 100) / 100;

// The saved heads-up flop spot a completed preflop path reaches, or null (scripts/postflop-ai/spots.mjs):
// single-raised pots (O opens, exactly one later seat C calls), 3bet pots (O opens, X 3bets, O calls),
// 4bet pots (… O 4bets, X calls) and SB's limped pots; everyone else folds.
function flopSpotFor({ rangeType, opener, hero, callers, foldedHero, limpAction, limpResponseAction, limpReraiseAction }) {
  if (rangeType === "response") return foldedHero && callers.length === 1 ? spotFor(opener, callers[0]) : null;
  if (rangeType === "three_bet") return callers.length === 0 ? threeBetSpotFor(opener, hero) : null;
  if (rangeType === "four_bet") return callers.length === 0 ? fourBetSpotFor(opener, hero) : null;
  if (rangeType === "limp") {
    if (limpAction === "check") return limpSpotFor("SB_limp_BB_check");
    if (limpAction === "raise" && limpResponseAction === "call") return limpSpotFor("SB_limp_BB_iso_call");
    if (limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "call") return limpSpotFor("SB_limp_BB_iso_SB_reraise_call");
  }
  return null;
}

export function completedFlopContext({ actionBlocks, rangeType, opener, hero, callers = [], foldedHero, isDefaultTable, limpAction = null, limpResponseAction = null, limpReraiseAction = null }) {
  const end = actionBlocks.find(block => block.kind === "end");
  if (!end || !/^\d+人でフロップへ$/.test(end.result)) return null;
  const potBb = Number(/^ポット ([\d.]+)bb$/.exec(end.pot)?.[1]);
  if (!Number.isFinite(potBb)) return null;
  const players = rangeType === "limp" ? ["SB", "BB"]
    : rangeType === "response" ? [opener, ...callers] : [opener, hero];
  const spot = flopSpotFor({ rangeType, opener, hero, callers, foldedHero, limpAction, limpResponseAction, limpReraiseAction });
  const pilotAvailable = Boolean(spot?.reachable) && potBb === spot.potBb && Boolean(isDefaultTable);
  return {
    players, potBb, pilotAvailable,
    spotId: pilotAvailable ? spot.id : null, ip: pilotAvailable ? spot.ip : null, oop: pilotAvailable ? spot.oop : null,
    stackBb: pilotAvailable ? spot.stackBb : null, tree: pilotAvailable ? spot.tree : null,
  };
}

// Seat names, starting pot, stacks and tree of the flop; the first pilot spot when none is given.
function geometry(spot) {
  const base = spot?.ip && spot?.oop && Number.isFinite(spot.potBb) && Number.isFinite(spot.stackBb) ? spot : spotById(DEFAULT_SPOT_ID);
  return { ...base, tree: base.tree ?? "oop_checks" };
}

// Replays the flop actions with the same chip rules as the scripts (engine.mjs): bets are a
// fraction of the pot, raises 3× the bet, both capped by the stack; an uncalled amount is returned.
// "oop_checks": the OOP player checks, then btn_* (IP) / bb_* (OOP) nodes.
// "oop_leads": the OOP preflop raiser acts first (oop_first → ip_vs_* → oop_vs_raise).
function replay(actions, spot) {
  const g = geometry(spot);
  const state = flopState(g.tree, actions);
  const invested = { ip: 0, oop: 0 };
  let pot = g.potBb, bet = 0, aggressor = null;
  const left = role => round(g.stackBb - invested[role]);
  // Same all-in merge as engine.mjs: a wager committing ≥ the merge ratio of the effective stack is all-in.
  const capFor = role => { const other = role === "ip" ? "oop" : "ip"; return Math.min(left(role), left(other) + invested[other] - invested[role]); };
  const wagerFor = (role, amount) => amount >= capFor(role) * pilot.later_all_in_merge_ratio ? capFor(role) : amount;
  const put = (role, amount) => { const value = round(Math.min(left(role), amount)); invested[role] = round(invested[role] + value); pot = round(pot + value); return value; };
  const history = g.tree === "oop_checks" ? [`${g.oop} Check`] : [];
  const stacks = [];
  for (const { node, role, action } of state.steps) {
    const name = g[role], other = role === "ip" ? "oop" : "ip";
    stacks.push(left(role));
    if (action === "check") history.push(`${name} Check`);
    // A bet, raise or call that uses the whole remaining stack is an all-in.
    const allIn = () => left(role) === 0 ? " All-in" : "";
    if (isFlopBet(action)) { bet = put(role, wagerFor(role, pot * flopBetFraction(action))); aggressor = role; history.push(`${name} Bet ${flopBetLabel(action)} (${bet}BB)${allIn()}`); }
    else if (action === "call") { put(role, invested[other] - invested[role]); history.push(`${name} Call${allIn()}`); }
    else if (action === "raise") {
      put(role, wagerFor(role, round(bet * pilot.flop_check_raise_multiplier) - invested[role]));
      aggressor = role;
      const to = invested[role];
      history.push(`${name} ${node.startsWith("bb_") ? "Check-raise" : "Raise"} ${to}BB${allIn()}`);
    } else if (action === "fold") history.push(`${name} Fold`);
  }
  if (state.end && ["fold", "raise-fold"].includes(state.end.type)) {
    const winner = state.end.winner, loser = winner === "ip" ? "oop" : "ip";
    pot = round(pot - Math.max(0, invested[winner] - invested[loser]));
  }
  const chips = { invested, stacks: { ip: left("ip"), oop: left("oop") } };
  return { g, state, pot, history, stacks, stackNow: state.role ? left(state.role) : null, ...chips,
    lastAggressor: state.end && ["call", "raise-call"].includes(state.end.type) ? aggressor : null };
}

export function flopDecision(actions = [], spot) {
  const { g, state, pot, history } = replay(actions, spot);
  if (state.node) return { node: state.node, actor: g[state.role], potBb: pot, history };
  const { type, winner } = state.end;
  const last = state.steps.at(-1);
  const result = type === "check" ? `${g[last.role]}もチェック。フロップの判断は終了です。`
    : type === "call" || type === "raise-call" ? `${g[last.role]}がコール。フロップの判断は終了です。`
    : `${g[last.role]}がフォールド。${g[winner]}の勝ちです。`;
  return { result, potBb: pot, history };
}

const choiceLabels = { check: "Check", ...Object.fromEntries(pilot.flop_bet_fractions.map(f => [`bet${Math.round(f * 100)}`, `Bet ${Math.round(f * 100)}%`])), fold: "Fold", call: "Call", raise: "Raise 3×" };
const flopChoices = Object.fromEntries(Object.entries(NODES).map(([node, actions]) =>
  [node, actions.map(action => ({ action, label: choiceLabels[action] }))]));

export function buildFlopActionBlocks(actions = [], spot) {
  const g = geometry(spot);
  const blocks = g.tree === "oop_checks"
    ? [{ key: "flop-oop-check", kind: "flop-forced", position: g.oop, stack: `${g.stackBb}`, chosen: "check", options: [{ action: "check", label: "Check" }], active: false }]
    : [];
  for (let index = 0; index <= actions.length; index++) {
    const { state, stackNow } = replay(actions.slice(0, index), spot);
    if (!state.node) {
      const decision = flopDecision(actions.slice(0, index), spot);
      blocks.push({ key: "flop-end", kind: "end", result: decision.result, pot: `ポット ${decision.potBb}bb`, options: [] });
      break;
    }
    blocks.push({ key: `flop-${index}`, kind: "flop", flopIndex: index, position: g[state.role], stack: `${stackNow}`,
      chosen: actions[index] ?? null, options: flopChoices[state.node], active: index === actions.length });
  }
  return blocks;
}

const formatBb = value => `${Number(round(value).toFixed(2))}`;
const laterChoiceLabels = {
  check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in",
  fold: "Fold", call: "Call", raise: "Raise 3×",
};
const laterChoices = Object.fromEntries(Object.entries(LATER_NODES).map(([node, actions]) => [node,
  actions.map(action => ({ action, label: laterChoiceLabels[action] }))]));

const foldEnd = (state, spot) => {
  const foldedRole = state.steps.at(-1)?.role;
  const winnerRole = state.end?.winner;
  return `${spot[foldedRole]}がフォールド。${spot[winnerRole]}の勝ちです。`;
};
const showdownEnd = allIn => allIn ? "オールイン・ショウダウン" : "ショーダウン";

function isFlopContinueState(state) {
  return Boolean(state.end && ["check", "call", "raise-call"].includes(state.end.type));
}

// A later street is available only after a completed, non-folded, non-all-in flop.
// `lastAggressor` remains a role (IP/OOP), matching the later policy engine.
export function laterStart(flopActions = [], spot) {
  const { g, state, pot, stacks, lastAggressor } = replay(flopActions, spot);
  if (!isFlopContinueState(state) || stacks.ip <= 0 || stacks.oop <= 0) return null;
  return { pot, stacks, lastAggressor };
}

// Replay one turn or river with the exact effective-stack and all-in merge rules used by
// scripts/postflop-ai/engine.mjs. `start` is the state at the beginning of this street.
export function replayLater(street, actions = [], start, spot) {
  if (!start || !["turn", "river"].includes(street)) throw new Error("Invalid later-street start");
  const g = geometry(spot);
  const stacks = { ip: round(start.stacks.ip), oop: round(start.stacks.oop) };
  let pot = round(start.pot), aggressor = null;
  const committed = { ip: 0, oop: 0 }, history = [];
  const put = (role, amount) => {
    const value = round(Math.min(stacks[role], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid later-street wager");
    stacks[role] = round(stacks[role] - value);
    committed[role] = round(committed[role] + value);
    pot = round(pot + value);
    return value;
  };
  const cap = role => {
    const other = role === "ip" ? "oop" : "ip";
    return Math.min(stacks[role], stacks[other] + committed[other] - committed[role]);
  };
  const wager = (role, amount) => {
    const limit = cap(role);
    return put(role, amount >= limit * pilotConfig.later_all_in_merge_ratio ? limit : amount);
  };
  const requestedState = streetState(street, actions);
  const actualActions = [];
  for (let index = 0; index < requestedState.steps.length; index++) {
    const { node, role } = requestedState.steps[index];
    const name = g[role], other = role === "ip" ? "oop" : "ip";
    let action = requestedState.steps[index].action;
    const suffix = () => stacks[role] === 0 ? " All-in" : "";
    if (action === "allin" || action.startsWith("bet")) {
      const amount = action === "allin" ? cap(role) : round(pot * betFraction(street, action));
      const paid = wager(role, amount);
      aggressor = role;
      history.push(action === "allin" ? `${name} All-in (${formatBb(paid)}BB) All-in` : `${name} Bet ${action.slice(3)}% (${formatBb(paid)}BB)${suffix()}`);
    } else if (action === "raise") {
      const raiseBy = round(committed[other] * pilotConfig.later_raise_multiplier - committed[role]);
      if (committed[role] + cap(role) <= committed[other] || !stacks[other]) {
        action = "call";
      } else {
        wager(role, raiseBy);
        aggressor = role;
        history.push(`${name} Raise ${pilotConfig.later_raise_multiplier}× (${formatBb(committed[role])}BB)${suffix()}`);
      }
    }
    if (action === "check") history.push(`${name} Check`);
    else if (action === "call") {
      const paid = put(role, round(committed[other] - committed[role]));
      history.push(`${name} Call${stacks[role] === 0 && paid > 0 ? " All-in" : ""}`);
    } else if (action === "fold") history.push(`${name} Fold`);
    actualActions.push(action);
    // The engine treats a raise that cannot reopen action as a call. Do not replay
    // impossible decisions that may follow that effective call.
    if (action === "call" && requestedState.steps[index].action === "raise") {
      if (index !== requestedState.steps.length - 1) throw new Error(`Illegal action after ${street} was effectively called`);
    }
  }
  const state = streetState(street, actualActions);
  const lastAggressor = state.end?.winner ? null : state.end ? aggressor : start.lastAggressor;
  return { state, pot, stacks, history, end: state.end ?? null, lastAggressor };
}

function boardBlock(street, card, potBb) {
  return { key: `${street}-board`, kind: "board", cards: card ? [card] : [], street, pending: !card, potBb };
}

function appendLaterDecisionBlocks(blocks, street, actions, start, spot, hasNextStreet = false) {
  const g = geometry(spot);
  for (let index = 0; index <= actions.length; index++) {
    const replayed = replayLater(street, actions.slice(0, index), start, spot);
    const state = replayed.state;
    if (!state.node) {
      const isFold = ["fold", "raise-fold"].includes(state.end.type);
      const allIn = replayed.stacks.ip <= 0 || replayed.stacks.oop <= 0;
      if (isFold || allIn || !hasNextStreet) {
        const result = isFold ? foldEnd(state, g) : showdownEnd(allIn);
        blocks.push({ key: `${street}-end`, kind: "end", result, options: [] });
      }
      return replayed;
    }
    const role = state.role;
    blocks.push({ key: state.node, kind: "flop", street, laterIndex: index, position: g[role],
      stack: formatBb(replayed.stacks[role]), chosen: actions[index] ?? null, options: laterChoices[state.node], active: index === actions.length });
  }
  return replayLater(street, actions, start, spot);
}

// Build later street board/decision blocks in action order. The end block for a normally
// completed flop is replaced by its turn block; folds and all-ins are left to the flop view.
export function buildLaterActionBlocks({ flopActions = [], turnCard = "", turnActions = [], riverCard = "", riverActions = [] } = {}, spot) {
  const turnStart = laterStart(flopActions, spot);
  if (!turnStart) return [];
  const blocks = [boardBlock("turn", turnCard, turnStart.pot)];
  if (!turnCard) return blocks;
  const turnReplay = appendLaterDecisionBlocks(blocks, "turn", turnActions, turnStart, spot, true);
  if (!turnReplay.state.end || ["fold", "raise-fold"].includes(turnReplay.state.end.type) ||
      turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) return blocks;
  const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
  blocks.push(boardBlock("river", riverCard, riverStart.pot));
  if (!riverCard) return blocks;
  appendLaterDecisionBlocks(blocks, "river", riverActions, riverStart, spot);
  return blocks;
}

function lineFor(previousAggressor, role) {
  return previousAggressor === null ? "checked" : previousAggressor === role ? "aggressor" : "defender";
}

// Presentation contract used by the local range API: the current node, actor, pot, and
// the previous-street line from the acting player's perspective.
export function laterDecision(street, actions = [], start, spot) {
  const replayed = replayLater(street, actions, start, spot);
  if (!replayed.state.node) return { street, end: replayed.end, potBb: replayed.pot, stacks: replayed.stacks, history: replayed.history, lastAggressor: replayed.lastAggressor };
  const role = replayed.state.role;
  return { street, node: replayed.state.node, actor: geometry(spot)[role], role, potBb: replayed.pot,
    line: lineFor(start.lastAggressor ?? null, role), history: replayed.history, lastAggressor: replayed.lastAggressor };
}
