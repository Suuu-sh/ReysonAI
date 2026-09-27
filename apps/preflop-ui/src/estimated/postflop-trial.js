import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { DEFAULT_SPOT_ID, fourBetSpotFor, limpSpotFor, spotById, spotFor, threeBetSpotFor } from "../../scripts/postflop-ai/spots.mjs";
import { NODES, flopState } from "../../scripts/postflop-ai/tree.mjs";

export const representativeFlops = pilot.boards.map(board => board.cards);
export const deck = "23456789TJQKA".split("").flatMap(rank => "shdc".split("").map(suit => `${rank}${suit}`));
const boardKey = cards => [...cards].sort().join("");
const representativeByCards = new Map(representativeFlops.map(board => [boardKey(board.match(/../g)), board]));
export function recognizedFlop(cards) {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !deck.includes(card)) || new Set(cards).size !== 3) return null;
  return representativeByCards.get(boardKey(cards)) ?? null;
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
const betFraction = action => action === "bet33" ? pilot.flop_bet_fractions[0] : pilot.flop_bet_fractions[1];
const betLabel = action => action === "bet33" ? "33%" : "75%";

// Replays the flop actions with the same chip rules as the scripts (engine.mjs): bets are a
// fraction of the pot, raises 3× the bet, both capped by the stack; an uncalled amount is returned.
// "oop_checks": the OOP player checks, then btn_* (IP) / bb_* (OOP) nodes.
// "oop_leads": the OOP preflop raiser acts first (oop_first → ip_vs_* → oop_vs_raise).
function replay(actions, spot) {
  const g = geometry(spot);
  const state = flopState(g.tree, actions);
  const invested = { ip: 0, oop: 0 };
  let pot = g.potBb, bet = 0;
  const left = role => round(g.stackBb - invested[role]);
  const put = (role, amount) => { const value = round(Math.min(left(role), amount)); invested[role] = round(invested[role] + value); pot = round(pot + value); return value; };
  const history = g.tree === "oop_checks" ? [`${g.oop} Check`] : [];
  const stacks = [];
  for (const { node, role, action } of state.steps) {
    const name = g[role], other = role === "ip" ? "oop" : "ip";
    stacks.push(left(role));
    if (action === "check") history.push(`${name} Check`);
    // A bet, raise or call that uses the whole remaining stack is an all-in.
    const allIn = () => left(role) === 0 ? " All-in" : "";
    if (action === "bet33" || action === "bet75") { bet = put(role, pot * betFraction(action)); history.push(`${name} Bet ${betLabel(action)} (${bet}BB)${allIn()}`); }
    else if (action === "call") { put(role, invested[other] - invested[role]); history.push(`${name} Call${allIn()}`); }
    else if (action === "raise") {
      const to = Math.min(left(role) + invested[role], round(bet * pilot.flop_check_raise_multiplier));
      put(role, to - invested[role]);
      history.push(`${name} ${node.startsWith("bb_") ? "Check-raise" : "Raise"} ${to}BB${allIn()}`);
    } else if (action === "fold") history.push(`${name} Fold`);
  }
  if (state.end && ["fold", "raise-fold"].includes(state.end.type)) {
    const winner = state.end.winner, loser = winner === "ip" ? "oop" : "ip";
    pot = round(pot - Math.max(0, invested[winner] - invested[loser]));
  }
  return { g, state, pot, history, stacks, stackNow: state.role ? left(state.role) : null };
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

const choiceLabels = { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", fold: "Fold", call: "Call", raise: "Raise 3×" };
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
