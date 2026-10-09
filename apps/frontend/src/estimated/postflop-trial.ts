import { geometry, replay, formatBb, canRaiseNow, decisionOptions, flopOptionsFor, laterStart, replayLater, laterDecision } from "../../scripts/postflop-ai/hu-v7-street-state.ts";
export { canRaiseNow, decisionOptions, laterStart, replayLater, laterDecision, formatBb };
import type { BettingAction, BettingState, FlopTree, PlayerRole } from "../../scripts/postflop-ai/tree.ts";
import type { LaterStreet } from "../../scripts/postflop-ai/later-tree.ts";
import type { PreviousLine, RoleValues, Street } from "../../scripts/postflop-ai/types.ts";
export type FlopGeometry = { ip: string; oop: string; potBb: number; stackBb: number; tree?: FlopTree };
export type FlopGeometryInput = { ip?: string | null; oop?: string | null; potBb?: number | null; stackBb?: number | null; tree?: FlopTree | null };
export type Chips = { pot: number; committed: RoleValues; stacks: RoleValues };
export type DecisionOption = { action: string; label: string; amountBb: number; allIn: boolean };
type PaidOption = DecisionOption & { paid: number };
export type LaterStartState = { pot: number; stacks: RoleValues; lastAggressor: PlayerRole | null };
export type TrialDecisionBlock = { key: string; kind: "flop" | "flop-forced"; position: string; stack: string; chosen: string | null;
  options: { action: string; label: string }[]; active: boolean; street?: LaterStreet; flopIndex?: number; laterIndex?: number };
export type TrialEndBlock = { key: string; kind: "end"; result?: string; pot?: string; options: [] };
export type TrialBoardBlock = { key: string; kind: "board"; cards: string[]; street: LaterStreet; pending: boolean; potBb: number };
export type TrialActionBlock = TrialDecisionBlock | TrialEndBlock | TrialBoardBlock;
export type CompletionActionBlock = { kind: string; result?: string; pot?: string; postflopEvents?: HistoryAction[]; continuationAvailable?: boolean; continuationTerminal?: { live_participants: string[] }; stage3Terminal?: { live_participants: string[] } };
export type CompletedFlopContext = { players: string[]; potBb: number; pilotAvailable: boolean; kind?: string; spotId: string | null; ip?: string | null; oop?: string | null; stackBb?: number | null; tree?: FlopTree | null; mw3Spot?: ReturnType<typeof mw3OriginForSelection>; mw3Available?: boolean };
type CompletionOptions = { actionBlocks?: readonly CompletionActionBlock[]; pendingRaise?: string | null; squeezeResponse?: string[]; rangeType: string; opener: string; hero: string; callers?: string[]; foldedHero?: boolean;
  limpAction?: string | null; limpResponseAction?: string | null; limpReraiseAction?: string | null; limpFourBetAction?: string | null };

import type { HistoryAction } from "./continuation-tree.ts";
import { mw3OriginForSelection } from "./mw3-context.ts";
import { openSizeFor, threeBetToSize } from "./sizing.ts";
import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { DEFAULT_SPOT_ID, multiwaySpotFor, fourBetSpotFor, limpSpotFor, spotById, spotFor, threeBetSpotFor } from "../../scripts/postflop-ai/spots.ts";
import { NODES, flopBetFraction, flopState, isFlopBet, raiseDepth } from "../../scripts/postflop-ai/tree.ts";
import { LATER_NODES, betFraction, streetState } from "../../scripts/postflop-ai/later-tree.ts";
import { parseFlopBoard } from "../../scripts/postflop-ai/model.ts";
import pilotConfig from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };

export const representativeFlops = pilot.boards.map(board => parseFlopBoard(board.cards).id);
export const deck = "23456789TJQKA".split("").flatMap(rank => "shdc".split("").map(suit => `${rank}${suit}`));
export function recognizedFlop(cards: unknown): string | null {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !deck.includes(card)) || new Set(cards).size !== 3) return null;
  try {
    return parseFlopBoard(cards.join("")).id;
  } catch {
    return null;
  }
}

// The saved heads-up flop spot a completed preflop path reaches, or null (scripts/postflop-ai/spots.ts):
// single-raised pots (O opens, exactly one later seat C calls), 3bet pots (O opens, X 3bets, O calls),
// 4bet pots (… O 4bets, X calls) and SB's limped pots; everyone else folds.
export function flopSpotFor({ actionBlocks = [], rangeType, opener, hero, callers = [], foldedHero, pendingRaise = null, squeezeResponse = [], limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction }: CompletionOptions) {
  const savedEvents = actionBlocks.find(block => block.kind === "end")?.postflopEvents;
  if (savedEvents) return multiwaySpotFor(savedEvents);
  if (pendingRaise === "squeeze" && callers.length === 1 && squeezeResponse.length === 2) {
    const [caller] = callers, size = threeBetToSize(opener, hero, 1);
    return multiwaySpotFor([
      { seat: opener, action: "open", to_size_bb: openSizeFor(opener) },
      { seat: caller, action: "call", to_size_bb: openSizeFor(opener) },
      { seat: hero, action: "squeeze", to_size_bb: size },
      ...[opener, caller].map((seat, i) => ({ seat, action: squeezeResponse[i], to_size_bb: squeezeResponse[i] === "call" ? size : null })),
    ]);
  }
  if (rangeType === "response") return foldedHero && callers.length === 1 ? spotFor(opener, callers[0]) : null;
  if (rangeType === "three_bet") return callers.length === 0 ? threeBetSpotFor(opener, hero) : null;
  if (rangeType === "four_bet") return callers.length === 0 ? fourBetSpotFor(opener, hero) : null;
  if (rangeType === "limp") {
    if (limpAction === "check") return limpSpotFor("SB_limp_BB_check");
    if (limpAction === "raise" && limpResponseAction === "call") return limpSpotFor("SB_limp_BB_iso_call");
    if (limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "call") return limpSpotFor("SB_limp_BB_iso_SB_reraise_call");
    if (limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "raise" && limpFourBetAction === "call") return limpSpotFor("SB_limp_BB_iso_SB_reraise_BB_4bet_call");
  }
  return null;
}

export function completedFlopContext({ actionBlocks, rangeType, opener, hero, callers = [], foldedHero, isDefaultTable, pendingRaise = null, squeezeResponse = [], limpAction = null, limpResponseAction = null, limpReraiseAction = null, limpFourBetAction = null }: CompletionOptions & { actionBlocks: readonly CompletionActionBlock[]; isDefaultTable?: boolean }): CompletedFlopContext | null {
  const end = actionBlocks.find(block => block.kind === "end");
  if (!end || end.continuationAvailable === false || !/^\d+人でフロップへ$/.test(end.result!)) return null;
  const potBb = Number(/^ポット ([\d.]+)bb$/.exec(end.pot!)?.[1]);
  if (!Number.isFinite(potBb)) return null;
  let players = end.stage3Terminal?.live_participants ?? end.continuationTerminal?.live_participants ?? (rangeType === "limp" ? ["SB", "BB"]
    : rangeType === "response" ? [opener, ...callers] : [opener, hero]);
  // Three live players have a dedicated origin. Existing multiwaySpotFor
  // entries describe HU-origin cold/squeeze paths and must not dispatch here.
  if (players.length >= 3) {
    const mw3 = end.stage3Terminal ? null : mw3OriginForSelection({ rangeType, opener, callers, pendingRaise });
    const geometryMatches = Boolean(mw3 && potBb === mw3.potBb);
    return { players, potBb, pilotAvailable: false, kind: geometryMatches ? "mw3_srp" : "multiway_unavailable",
      spotId: geometryMatches ? mw3!.id : null, mw3Spot: geometryMatches ? mw3 : null,
      mw3Available: geometryMatches && Boolean(isDefaultTable) };
  }
  const spot = flopSpotFor({ actionBlocks, rangeType, opener, hero, callers, foldedHero, pendingRaise, squeezeResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction });
  if (spot?.history) players = [spot.oop, spot.ip];
  const pilotAvailable = Boolean(spot?.reachable) && potBb === spot!.potBb;
  return {
    players, potBb, pilotAvailable,
    spotId: pilotAvailable ? spot!.id : null, ip: pilotAvailable ? spot!.ip : null, oop: pilotAvailable ? spot!.oop : null,
    stackBb: pilotAvailable ? spot!.stackBb : null, tree: pilotAvailable ? spot!.tree : null,
  };
}

// Seat names, starting pot, stacks and tree of the flop; the first pilot spot when none is given.

// Replays the flop actions with the same chip rules as the scripts (engine.ts): bets are a
// fraction of the pot, raises 3× the bet, both capped by the stack; an uncalled amount is returned.
// "oop_checks": the OOP player checks, then btn_* (IP) / bb_* (OOP) nodes.
// "oop_leads": the OOP preflop raiser acts first (oop_first → ip_vs_* → oop_vs_raise).

// ---- amount-based action options (shared by the flop and later streets) ----
// `chips`: { pot, committed: { ip, oop } (street totals so far), stacks: { ip, oop } (remaining before acting) }.

// Raising needs an opponent who is not all-in and chips beyond the call (same rule as engine.ts).

// A wager of `amount` chips: committing >= the merge ratio of the effective stack becomes all-in.

// The options of a decision with their real amounts: [{ action, label, amountBb, allIn }] (raise is dropped
// when raising is impossible). `street` is "flop", "turn" or "river"; `locale` "en" or "ja".

// A bet or raise that the merge ratio turns into an all-in is the same line as the explicit all-in,
// so the action path offers it once (the explicit all-in wins).
const blockOptions = (options: readonly DecisionOption[]) => options
  .filter(option => !(option.allIn && option.action !== "allin" && option.action !== "call" && options.some(other => other.action === "allin")))
  .map(({ action, label }) => ({ action, label }));

export function flopDecision(actions: readonly string[] = [], spot?: FlopGeometryInput | null) {
  const { g, state, pot, history, chipsNow } = replay(actions, spot);
  if (state.node) {
    const options = decisionOptions(chipsNow!, state.node, "flop");
    return { node: state.node, actor: g[state.role], potBb: pot, history, options,
      labels: Object.fromEntries(decisionOptions(chipsNow!, state.node, "flop", "en").map(o => [o.action, o.label])),
      labelsJa: Object.fromEntries(decisionOptions(chipsNow!, state.node, "flop", "ja").map(o => [o.action, o.label])) };
  }
  const { type, winner } = state.end!;
  const last = state.steps.at(-1)!;
  const result = type === "check" ? `${g[last.role]}もチェック。フロップの判断は終了です。`
    : type === "call" || type === "raise-call" ? `${g[last.role]}がコール。フロップの判断は終了です。`
    : `${g[last.role]}がフォールド。${g[winner!]}の勝ちです。`;
  return { result, potBb: pot, history };
}

export type PostflopPotHistory = {
  flopActions?: readonly string[];
  turnCard?: string;
  turnActions?: readonly string[];
  riverCard?: string;
  riverActions?: readonly string[];
};

function displayLaterStreetPot(replay: ReturnType<typeof replayLater>, start: LaterStartState) {
  const end = replay.state.end;
  if (!end || !["fold", "raise-fold"].includes(end.type) || !end.winner) return replay.pot;
  const loser = end.winner === "ip" ? "oop" : "ip";
  const winnerInvested = start.stacks[end.winner] - replay.stacks[end.winner];
  const loserInvested = start.stacks[loser] - replay.stacks[loser];
  const uncalledBb = Math.max(0, winnerInvested - loserInvested);
  return Math.round(Math.max(0, replay.pot - uncalledBb) * 100) / 100;
}

/** Read the current pot from the same street replay used to build the action path. */
export function currentPostflopPotBb(history: PostflopPotHistory, spot: FlopGeometryInput) {
  const flopActions = history.flopActions ?? [];
  const flopPot = flopDecision(flopActions, spot).potBb;
  if (!history.turnCard) return flopPot;

  const turnStart = laterStart(flopActions, spot);
  if (!turnStart) return flopPot;
  const turn = replayLater("turn", history.turnActions ?? [], turnStart, spot);
  if (!history.riverCard || !turn.state.end || ["fold", "raise-fold"].includes(turn.state.end.type) ||
      turn.stacks.ip <= 0 || turn.stacks.oop <= 0) return displayLaterStreetPot(turn, turnStart);

  const riverStart = { pot: turn.pot, stacks: turn.stacks, lastAggressor: turn.lastAggressor };
  return displayLaterStreetPot(replayLater("river", history.riverActions ?? [], riverStart, spot), riverStart);
}

export function buildFlopActionBlocks(actions: readonly string[] = [], spot?: FlopGeometryInput | null): TrialActionBlock[] {
  const g = geometry(spot);
  const blocks: TrialActionBlock[] = g.tree === "oop_checks"
    ? [{ key: "flop-oop-check", kind: "flop-forced", position: g.oop, stack: `${g.stackBb}`, chosen: "check", options: [{ action: "check", label: "Check" }], active: false }]
    : [];
  for (let index = 0; index <= actions.length; index++) {
    const { state, stackNow, chipsNow } = replay(actions.slice(0, index), spot);
    if (!state.node) {
      const decision = flopDecision(actions.slice(0, index), spot);
      blocks.push({ key: "flop-end", kind: "end", result: decision.result, pot: `ポット ${decision.potBb}bb`, options: [] });
      break;
    }
    blocks.push({ key: `flop-${index}`, kind: "flop", flopIndex: index, position: g[state.role], stack: `${stackNow}`,
      chosen: actions[index] ?? null, options: blockOptions(decisionOptions(chipsNow!, state.node, "flop")), active: index === actions.length });
  }
  return blocks;
}

const foldEnd = (state: BettingState, spot: FlopGeometry): string => {
  const foldedRole = state.steps.at(-1)?.role;
  const winnerRole = state.end?.winner;
  return `${spot[foldedRole!]}がフォールド。${spot[winnerRole!]}の勝ちです。`;
};
const showdownEnd = (allIn: boolean): string => allIn ? "オールイン・ショウダウン" : "ショーダウン";

// A later street is available only after a completed, non-folded, non-all-in flop.
// `lastAggressor` remains a role (IP/OOP), matching the later policy engine.

// Replay one turn or river with the exact effective-stack and all-in merge rules used by
// scripts/postflop-ai/engine.ts. `start` is the state at the beginning of this street.

function boardBlock(street: LaterStreet, card: string, potBb: number): TrialBoardBlock {
  return { key: `${street}-board`, kind: "board", cards: card ? [card] : [], street, pending: !card, potBb };
}

function appendLaterDecisionBlocks(blocks: TrialActionBlock[], street: LaterStreet, actions: readonly string[], start: LaterStartState, spot?: FlopGeometryInput | null, hasNextStreet = false) {
  const g = geometry(spot);
  for (let index = 0; index <= actions.length; index++) {
    const replayed = replayLater(street, actions.slice(0, index), start, spot);
    const state = replayed.state;
    if (!state.node) {
      const isFold = ["fold", "raise-fold"].includes(state.end!.type);
      const allIn = replayed.stacks.ip <= 0 || replayed.stacks.oop <= 0;
      if (isFold || allIn || !hasNextStreet) {
        const result = isFold ? foldEnd(state, g) : showdownEnd(allIn);
        blocks.push({ key: `${street}-end`, kind: "end", result, options: [] });
      }
      return replayed;
    }
    const role = state.role;
    blocks.push({ key: state.node, kind: "flop", street, laterIndex: index, position: g[role],
      stack: formatBb(replayed.stacks[role]), chosen: actions[index] ?? null, options: blockOptions(decisionOptions(replayed.chipsNow!, state.node, street)), active: index === actions.length });
  }
  return replayLater(street, actions, start, spot);
}

// Build later street board/decision blocks in action order. The end block for a normally
// completed flop is replaced by its turn block; folds and all-ins are left to the flop view.
export function buildLaterActionBlocks({ flopActions = [], turnCard = "", turnActions = [], riverCard = "", riverActions = [] }: { flopActions?: string[]; turnCard?: string; turnActions?: string[]; riverCard?: string; riverActions?: string[] } = {}, spot?: FlopGeometryInput | null): TrialActionBlock[] {
  const turnStart = laterStart(flopActions, spot);
  if (!turnStart) return [];
  const blocks: TrialActionBlock[] = [boardBlock("turn", turnCard, turnStart.pot)];
  if (!turnCard) return blocks;
  const turnReplay = appendLaterDecisionBlocks(blocks, "turn", turnActions, turnStart, spot, true);
  if (!turnReplay.state.end || ["fold", "raise-fold"].includes(turnReplay.state.end!.type) ||
      turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) return blocks;
  const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
  blocks.push(boardBlock("river", riverCard, riverStart.pot));
  if (!riverCard) return blocks;
  appendLaterDecisionBlocks(blocks, "river", riverActions, riverStart, spot);
  return blocks;
}

// Presentation contract used by the local range API: the current node, actor, pot, and
// the previous-street line from the acting player's perspective.
