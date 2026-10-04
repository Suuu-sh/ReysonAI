import { openSizeFor, threeBetToSize } from "./sizing.ts";
import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { multiwaySpotFor, fourBetSpotFor, limpSpotFor, spotFor, threeBetSpotFor } from "../../scripts/postflop-ai/spots.mjs";
import { parseFlopBoard } from "../../scripts/postflop-ai/model.mjs";
import { usesObservableActions } from "../../scripts/postflop-ai/observable-actions.mjs";
import { postflopGeometry as geometry, replayFlop, replayLater as replayLaterState, decisionOptionFacts,
  canonicalStreetActions, hasObservablePostflopActions, canRaiseNow, laterStart, laterDecisionState } from "../../scripts/postflop-ai/street-state.mjs";
export { canonicalStreetActions, hasObservablePostflopActions, canRaiseNow, laterStart };

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
export function flopSpotFor({ actionBlocks = [], rangeType, opener, hero, callers = [], foldedHero, pendingRaise = null, squeezeResponse = [], limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction }) {
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

export function completedFlopContext({ actionBlocks, rangeType, opener, hero, callers = [], foldedHero, isDefaultTable, pendingRaise = null, squeezeResponse = [], limpAction = null, limpResponseAction = null, limpReraiseAction = null, limpFourBetAction = null }) {
  const end = actionBlocks.find(block => block.kind === "end");
  if (!end || end.continuationAvailable === false || !/^\d+人でフロップへ$/.test(end.result)) return null;
  const potBb = Number(/^ポット ([\d.]+)bb$/.exec(end.pot)?.[1]);
  if (!Number.isFinite(potBb)) return null;
  let players = end.continuationTerminal?.live_participants ?? (rangeType === "limp" ? ["SB", "BB"]
    : rangeType === "response" ? [opener, ...callers] : [opener, hero]);
  const spot = flopSpotFor({ actionBlocks, rangeType, opener, hero, callers, foldedHero, pendingRaise, squeezeResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction });
  if (spot?.history) players = [spot.oop, spot.ip];
  const pilotAvailable = Boolean(spot?.reachable) && potBb === spot.potBb && Boolean(isDefaultTable);
  return {
    players, potBb, pilotAvailable,
    spotId: pilotAvailable ? spot.id : null, ip: pilotAvailable ? spot.ip : null, oop: pilotAvailable ? spot.oop : null,
    stackBb: pilotAvailable ? spot.stackBb : null, tree: pilotAvailable ? spot.tree : null,
  };
}

// Presentation is derived from the same chip/path facts used by numerical consumers.
const optionText = {
  en: { check: "Check", fold: "Fold", call: "Call", bet: "Bet", raise: "Raise", allIn: "All-in" },
  ja: { check: "チェック", fold: "フォールド", call: "コール", bet: "ベット", raise: "レイズ", allIn: "オールイン" },
};
function optionLabel(option, locale = "en") {
  const t = optionText[locale] ?? optionText.en;
  if (option.action === "check" || option.action === "fold") return t[option.action];
  if (option.action === "call") return `${t.call} ${formatBb(option.paid)}`;
  if (option.allIn) return `${t.allIn} ${formatBb(option.amountBb)}`;
  if (option.action === "raise") return `${t.raise} ${formatBb(option.amountBb)} (${option.raisePercent}%)`;
  return `${t.bet} ${formatBb(option.paid)} (${option.betPercent ?? option.action.slice(3)}%)`;
}
const presentedOption = (option, locale = "en") => ({ action: option.action, label: optionLabel(option, locale),
  amountBb: option.amountBb, allIn: option.allIn, ...(option.aliases === undefined ? {} : { aliases: option.aliases }) });
export function decisionOptions(chips, node, street = "flop", locale = "en") {
  return decisionOptionFacts(chips, node, street).map(option => presentedOption(option, locale));
}
function withHistory(replayed, street, spot) {
  const g = geometry(spot);
  const history = street === "flop" && g.tree === "oop_checks" ? [`${g.oop} Check`] : [];
  for (const step of replayed.trace) {
    const label = step.action === "check" ? "Check" : step.action === "fold" ? "Fold"
      : step.action === "call" ? `Call${step.callAllIn ? " All-in" : ""}` : optionLabel(step.option);
    history.push(`${g[step.role]} ${label}`);
  }
  const { trace, ...facts } = replayed;
  return { ...facts, history };
}
function replay(actions, spot) { return withHistory(replayFlop(actions, spot), "flop", spot); }
export function replayLater(street, actions = [], start, spot) {
  return withHistory(replayLaterState(street, actions, start, spot), street, spot);
}

// A bet or raise that the merge ratio turns into an all-in is the same line as the explicit all-in,
// so the action path offers it once (the explicit all-in wins).
const blockOptions = options => options
  .filter(option => !(option.allIn && option.action !== "allin" && option.action !== "call" && options.some(other => other.action === "allin")))
  .map(({ action, label }) => ({ action, label }));

export function flopDecision(actions = [], spot) {
  const { g, state, pot, history, chipsNow, facedAction } = replay(actions, spot);
  if (state.node) {
    const options = decisionOptions(chipsNow, state.node, "flop");
    return { node: state.node, actor: g[state.role], potBb: pot, history, options, ...(facedAction ? { facedAction } : {}),
      labels: Object.fromEntries(decisionOptions(chipsNow, state.node, "flop", "en").map(o => [o.action, o.label])),
      labelsJa: Object.fromEntries(decisionOptions(chipsNow, state.node, "flop", "ja").map(o => [o.action, o.label])) };
  }
  const { type, winner } = state.end;
  const last = state.steps.at(-1);
  const result = type === "check" ? `${g[last.role]}もチェック。フロップの判断は終了です。`
    : type === "call" || type === "raise-call" ? `${g[last.role]}がコール。フロップの判断は終了です。`
    : `${g[last.role]}がフォールド。${g[winner]}の勝ちです。`;
  return { result, potBb: pot, history };
}

export function buildFlopActionBlocks(actions = [], spot) {
  const g = geometry(spot);
  const chosenActions = usesObservableActions(g) ? canonicalStreetActions("flop", actions, undefined, g) : actions;
  const blocks = g.tree === "oop_checks"
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
      chosen: chosenActions[index] ?? null, options: blockOptions(decisionOptions(chipsNow, state.node, "flop")), active: index === actions.length });
  }
  return blocks;
}

const formatBb = value => `${Number(round(value).toFixed(2))}`;
const foldEnd = (state, spot) => {
  const foldedRole = state.steps.at(-1)?.role;
  const winnerRole = state.end?.winner;
  return `${spot[foldedRole]}がフォールド。${spot[winnerRole]}の勝ちです。`;
};
const showdownEnd = allIn => allIn ? "オールイン・ショウダウン" : "ショーダウン";

function boardBlock(street, card, potBb) {
  return { key: `${street}-board`, kind: "board", cards: card ? [card] : [], street, pending: !card, potBb };
}

function appendLaterDecisionBlocks(blocks, street, actions, start, spot, hasNextStreet = false) {
  const g = geometry(spot);
  const chosenActions = usesObservableActions(g) ? canonicalStreetActions(street, actions, start, g) : actions;
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
      stack: formatBb(replayed.stacks[role]), chosen: chosenActions[index] ?? null, options: blockOptions(decisionOptions(replayed.chipsNow, state.node, street)), active: index === actions.length });
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

// The shared core owns actor/line/legal-option semantics; this wrapper adds presentation.
export function laterDecision(street, actions = [], start, spot) {
  const decision = laterDecisionState(street, actions, start, spot);
  const history = replayLater(street, actions, start, spot).history;
  if (!decision.node) return { ...decision, history };
  const { options, ...facts } = decision;
  const labelsFor = locale => Object.fromEntries(options.map(option => [option.action, optionLabel(option, locale)]));
  return { ...facts, options: options.map(option => presentedOption(option)), labels: labelsFor("en"), labelsJa: labelsFor("ja"), history };
}
