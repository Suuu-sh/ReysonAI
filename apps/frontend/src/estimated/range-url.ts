import type { HistoryAction, ContinuationTerminal, ContinuationDecision } from "./continuation-tree.ts";
import { appendContinuationBlocks, chooseContinuationAction, continuationRootForSelection } from "./continuation-flow.ts";
import type { FormatKey, GameFormat } from "./game-formats.ts";
import type { TableProfile } from "./table-profile.ts";
import type { ResponseDataset, ThreeBetDataset, FourBetDataset } from "./preflop-types.ts";
export type RangeRef = { kind: string; position: string; caller?: string; squeezer?: string; priorAction?: string | null; threeBettor?: string; opponent?: string; reason?: string; dataset?: string; id?: string };
export type ActionOption = { action: string; label: string; disabled?: boolean };
export type ActionBlock = { key: string; position: string; stack: string; kind: string; options: ActionOption[]; active: boolean; chosen: string | null | undefined; rangeRef?: RangeRef; stage?: string; role?: string; result?: string; pot?: string; historical?: boolean; postflopEvents?: HistoryAction[]; continuationTerminal?: ContinuationTerminal; continuationNode?: ContinuationDecision; continuationFamily?: string; priorContinuationActions?: string[]; continuationAvailable?: boolean };
export type RangeBuildState = Partial<RangeUrlSelection> & Pick<RangeUrlSelection, "rangeType" | "opener" | "hero"> & { spot?: { three_bet_size_bb?: number; four_bet_size_bb?: number } | null; raiseToBb?: number | null; raiseSizeFor?: (position: string) => number | null };
export type RangeEncodingState = RangeBuildState & Partial<Omit<RangeUrlState, "tableProfile">> & { tableProfile?: Partial<TableProfile>; hand?: string };
import { hands } from "../data.ts";
import { positions, fourBetToSize, isoVsLimpToBb, limpReraiseToBb, openSizeFor, sbCompleteToBb, threeBetToSize } from "./sizing.ts";
import { limpActionTransition, nextActorsAfterRaise, responseActionTransition } from "./action-path.ts";
import { multiwaySpots } from "./multiway-responses.ts";
import { dataset as publishedDataset } from "./datasets.ts";
import { defaultFormat, formatOptions } from "./game-formats.ts";
import { completedFlopContext, flopDecision, laterDecision, laterStart, replayLater } from "./postflop-trial.ts";

// The recorded-matchup lookup is identical to extended-ranges.ts, isolated here
// so the shared action strip and URL codec do not depend on React hooks.
export function multiwayContext(opener: string, callers: string[], position: string) {
  const earlier = callers.filter(caller => positions.indexOf(caller) < positions.indexOf(position));
  if (earlier.length !== 1) return null;
  const [caller] = earlier;
  return multiwaySpots.some(spot => spot.opener === opener && spot.caller === caller && spot.hero === position) ? { opener, caller } : null;
}

const startingContribution: Record<string, number> = { SB: 0.5, BB: 1 };
const formatBb = (value: number | null | undefined) => value === null || value === undefined ? "—" : String(Math.round(value * 100) / 100);
// An uncalled bet is returned, so the largest contribution only counts up to the next largest.
const potLabel = (contribution: Record<string, number>) => {
  const values = Object.values(contribution).sort((a, b) => b - a);
  const counted = values.length > 1 ? [Math.min(values[0], values[1]), ...values.slice(1)] : values;
  return `ポット ${formatBb(counted.reduce((sum, value) => sum + value, 0))}bb`;
};

function buildLimpActionBlocks({ limpAction, limpResponseAction, limpReraiseAction = null, limpFourBetAction = null }: Pick<RangeUrlSelection, "limpAction" | "limpResponseAction"> & Partial<Pick<RangeUrlSelection, "limpReraiseAction" | "limpFourBetAction">>): ActionBlock[] {
  const contribution = { ...startingContribution };
  const stackOf = (position: string) => formatBb(100 - (contribution[position] ?? 0));
  const blocks: ActionBlock[] = [];
  for (const position of positions.slice(0, positions.indexOf("SB"))) {
    blocks.push({ key: position, position, stack: stackOf(position), active: false, chosen: "fold", options: [{ action: "fold", label: "Fold", disabled: true }], kind: "seat", rangeRef: { kind: "opening", position } });
  }
  contribution.SB = sbCompleteToBb;
  blocks.push({ key: "SB", position: "SB", stack: stackOf("SB"), active: false, chosen: "call", stage: "limp-opening", options: [{ action: "call", label: `Call ${formatBb(sbCompleteToBb)}` }], kind: "seat", rangeRef: { kind: "opening", position: "SB" } });

  const pot = () => {
    const values = Object.values(contribution).sort((a, b) => b - a);
    const counted = values.length > 1 ? [Math.min(values[0], values[1]), ...values.slice(1)] : values;
    return `ポット ${formatBb(counted.reduce((sum, value) => sum + value, 0))}bb`;
  };
  const end = (result: string) => blocks.push({ key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [], result, pot: pot() });

  if (!limpAction) {
    blocks.push({ key: "limp-BB", position: "BB", stack: stackOf("BB"), active: true, chosen: null, stage: "limp-bb", options: [
      { action: "check", label: "Check" }, { action: "raise", label: `Raise ${formatBb(isoVsLimpToBb)}` },
    ], kind: "seat", rangeRef: { kind: "limp_bb", position: "BB" } });
    return blocks;
  }

  if (limpAction === "check") {
    blocks.push({ key: "limp-BB", position: "BB", stack: stackOf("BB"), active: false, chosen: "check", stage: "limp-bb", options: [
      { action: "check", label: "Check" }, { action: "raise", label: `Raise ${formatBb(isoVsLimpToBb)}` },
    ], kind: "seat", rangeRef: { kind: "limp_bb", position: "BB" } });
    end("2人でフロップへ");
    return blocks;
  }

  contribution.BB = isoVsLimpToBb;
  blocks.push({ key: "limp-BB", position: "BB", stack: stackOf("BB"), active: false, chosen: "raise", stage: "limp-bb", options: [
    { action: "check", label: "Check" }, { action: "raise", label: `Raise ${formatBb(isoVsLimpToBb)}` },
  ], kind: "seat", rangeRef: { kind: "limp_bb", position: "BB" } });
  contribution.SB = limpResponseAction === "call" ? isoVsLimpToBb : limpResponseAction === "raise" ? limpReraiseToBb : sbCompleteToBb;
  blocks.push({ key: "limp-SB-response", position: "SB", stack: stackOf("SB"), active: limpResponseAction === null, chosen: limpResponseAction, stage: "limp-sb-response", options: [
    { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(isoVsLimpToBb)}` }, { action: "raise", label: `Raise ${formatBb(limpReraiseToBb)}` },
  ], kind: "seat", rangeRef: { kind: "limp_sb", position: "SB" } });

  if (limpResponseAction === "fold") end("BBの勝ち");
  else if (limpResponseAction === "call") end("2人でフロップへ");
  else if (limpResponseAction === "raise") {
    const fourBetSizeBb = fourBetToSize("BB", "SB");
    blocks.push({ key: "limp-BB-reraise-response", position: "BB", stack: stackOf("BB"), active: !limpReraiseAction, chosen: limpReraiseAction, stage: "limp-bb-reraise", options: [
      { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(limpReraiseToBb)}` }, { action: "raise", label: `Raise ${formatBb(fourBetSizeBb)}` },
    ], kind: "seat", rangeRef: { kind: "limp_reraise", position: "BB" } });
    if (limpReraiseAction === "fold") end("SBの勝ち");
    else if (limpReraiseAction === "call") { contribution.BB = limpReraiseToBb; end("2人でフロップへ"); }
    else if (limpReraiseAction === "raise") {
      contribution.BB = fourBetSizeBb;
      blocks.push({ key: "limp-SB-four-bet-response", position: "SB", stack: stackOf("SB"), active: !limpFourBetAction, chosen: limpFourBetAction, stage: "limp-sb-four-bet", options: [
        { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(fourBetSizeBb)}` }, { action: "all_in", label: "All-in 100" },
      ], kind: "seat", rangeRef: { kind: "limp_four_bet", position: "SB" } });
      if (limpFourBetAction === "fold") end("BBの勝ち");
      else if (limpFourBetAction === "call") { contribution.SB = fourBetSizeBb; end("2人でフロップへ"); }
      else if (limpFourBetAction === "all_in") { contribution.SB = 100; end("オールイン"); }
    }
  }
  return blocks;
}

// Builds the seat blocks in acting order; each later block's options depend on the choices before it.
export function buildActionBlocks({ rangeType, opener, hero, spot, callers = [], foldedHero, raiseToBb, pendingRaise, continuationAction, shoveResponse = null, coldAction = null, limpAction = null, limpResponseAction = null, limpReraiseAction = null, limpFourBetAction = null, squeezeResponse = [], continuationActions = [], raiseSizeFor = () => null }: RangeBuildState): ActionBlock[] {
  if (rangeType === "limp") return buildLimpActionBlocks({ limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction });
  const boundedState = { rangeType, opener, hero, callers, pendingRaise, coldAction, squeezeResponse, continuationActions };
  const boundedRoot = continuationRootForSelection(boundedState);
  const opening = rangeType === "open";
  const openerIndex = positions.indexOf(opener);
  const heroIndex = opening ? openerIndex : positions.indexOf(hero);
  const reraised = rangeType === "three_bet" || rangeType === "four_bet";
  const threeBetSizeBb = reraised ? spot?.three_bet_size_bb : raiseSizeFor(hero);
  const contribution = { ...startingContribution };
  const stackOf = (position: string) => formatBb(100 - (contribution[position] ?? 0));
  const blocks: ActionBlock[] = [];
  const lastIndex = opening ? openerIndex : positions.length - 1;
  for (let index = 0; index <= lastIndex; index += 1) {
    const position = positions[index];
    const stack = stackOf(position);
    if (index <= openerIndex) {
      const acting = opening && index === openerIndex;
      const chosen = acting ? null : index === openerIndex ? "raise" : "fold";
      const options = [
        { action: "fold", label: "Fold", disabled: positions[index + 1] === "BB" },
        ...(acting && position === "SB" ? [{ action: "call", label: `Call ${formatBb(sbCompleteToBb)}` }] : []),
        { action: "raise", label: `Raise ${formatBb(openSizeFor(position))}`, disabled: position === "BB" },
      ];
      if (index === openerIndex && !acting) contribution[position] = openSizeFor(position);
      blocks.push({ key: position, position, stack, active: acting, chosen, options, kind: "seat", rangeRef: { kind: "opening", position } });
      continue;
    }
    const earlierCallers = callers.filter(caller => positions.indexOf(caller) < index);
    // Squeeze sizes are fixed by the sizing rules (base + per additional caller).
    const raiseLabel = earlierCallers.length
      ? `Raise ${formatBb(threeBetToSize(opener, position, earlierCallers.length))}`
      : `Raise ${formatBb(index === heroIndex ? threeBetSizeBb : raiseSizeFor(position))}`;
    const options = [{ action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(openSizeFor(opener))}` }, { action: "raise", label: raiseLabel }];
    // Seats behind the 3-bettor still act before the opener: fold, cold call or cold 4bet
    // (saved cold-three-bet ranges). What follows a cold call / cold 4bet has no data yet.
    if (rangeType === "three_bet" && index > heroIndex) {
      const coldIndex = coldAction ? positions.indexOf(coldAction.position) : -1;
      if (coldAction && index > coldIndex && !boundedRoot) continue;
      const chosen = coldAction?.position === position ? coldAction.action : coldAction || continuationAction ? "fold" : null;
      blocks.push({ key: position, position, stack, active: false, chosen, kind: "cold", rangeRef: { kind: "cold", position, threeBettor: hero }, options: [
        { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(threeBetSizeBb)}` }, { action: "raise", label: `Raise ${formatBb(fourBetToSize(position, hero))}` },
      ] });
      continue;
    }
    if (index > heroIndex && (reraised || pendingRaise === "squeeze")) {
      blocks.push({ key: position, position, stack, active: false, chosen: "fold", options: [{ action: "fold", label: "Fold", disabled: true }], kind: "forced", rangeRef: { kind: "pending", position, reason: reraised ? "3bet後の応答データはまだ保存されていません。" : "スクイーズ後の応答データはまだ保存されていません。" } });
      continue;
    }
    let chosen = null;
    if (callers.includes(position)) { chosen = "call"; contribution[position] = openSizeFor(opener); }
    else if (index < heroIndex || foldedHero) chosen = "fold";
    else if (reraised || pendingRaise === "squeeze") { chosen = "raise"; contribution[position] = earlierCallers.length ? threeBetToSize(opener, position, earlierCallers.length) : raiseToBb ?? threeBetSizeBb ?? 0; }
    const hasEarlierCaller = callers.some(caller => positions.indexOf(caller) < index);
    const multiway = hasEarlierCaller ? multiwayContext(opener, callers, position) : null;
    const rangeRef: RangeRef = multiway
      ? { kind: "multiway", position, caller: multiway.caller }
      : hasEarlierCaller || (pendingRaise === "squeeze" && index === heroIndex)
      ? { kind: "pending", position, reason: pendingRaise === "squeeze" ? "スクイーズ後の応答データはまだ保存されていません。" : "このマルチウェイ局面の応答データはまだ保存されていません。" }
      : reraised && index > heroIndex
        ? { kind: "pending", position, reason: "3bet後の応答データはまだ保存されていません。" }
        : { kind: "response", position };
    blocks.push({ key: position, position, stack, active: index === heroIndex && chosen === null, chosen, options, kind: "seat", rangeRef });
  }
  if (boundedRoot) return appendContinuationBlocks(blocks, boundedRoot, boundedState);
  if (coldAction) {
    blocks.push({ key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [], result: "データなし", pot: `${coldAction.position}の${coldAction.action === "call" ? "コールドコール" : "コールド4bet"}以降の推定レンジはまだありません。` });
    return blocks;
  }
  if (reraised) {
    const fourBetSizeBb = spot?.four_bet_size_bb;
    const openerChosen = rangeType === "four_bet" ? "raise" : continuationAction;
    blocks.push({ key: `continuation-${opener}`, position: opener, stack: stackOf(opener), kind: "continuation", rangeRef: { kind: "three_bet", position: opener, opponent: hero }, active: rangeType === "three_bet" && !continuationAction, chosen: openerChosen, options: [
      { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(threeBetSizeBb)}` }, { action: "raise", label: `Raise ${formatBb(fourBetSizeBb)}` },
    ] });
    if (rangeType === "four_bet") {
      contribution[opener] = fourBetSizeBb ?? 0;
      blocks.push({ key: `continuation-${hero}`, position: hero, stack: stackOf(hero), kind: "continuation", rangeRef: { kind: "four_bet", position: hero, opponent: opener }, active: !continuationAction && !pendingRaise, chosen: pendingRaise === "all_in" ? "all_in" : continuationAction, options: [
        { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(fourBetSizeBb)}` }, { action: "all_in", label: "Allin 100" },
      ] });
      if (pendingRaise === "all_in") contribution[hero] = 100;
    }
  }
  // The opener's call/fold vs the 5bet all-in is a saved range, so it is a normal acting block.
  if (pendingRaise === "all_in") {
    blocks.push({ key: `shove-response-${opener}`, position: opener, stack: stackOf(opener), kind: "shove-response", rangeRef: { kind: "five_bet", position: opener, opponent: hero }, active: !shoveResponse, chosen: shoveResponse, options: [
      { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(100 - (contribution[opener] ?? 0))}` },
    ] });
    if (shoveResponse === "call") contribution[opener] = 100;
  }
  const end = handResult({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, contribution, threeBetSizeBb, spot });
  if (end) blocks.push({ key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [], ...end });
  const squeeze = pendingRaise === "squeeze" && callers.length === 1 ? multiwayContext(opener, callers, hero) : null;
  if (squeeze) return appendSqueezeResponses(blocks, { opener, caller: squeeze.caller, squeezer: hero, squeezeResponse, contribution, stackOf });
  const pendingActors = pendingRaise === "squeeze" ? nextActorsAfterRaise(hero, [opener, ...callers]) : [];
  for (const position of pendingActors) {
    blocks.push({ key: `pending-${position}`, position, stack: stackOf(position), kind: "pending", rangeRef: { kind: "pending", position, reason: "スクイーズ後の応答データはまだ保存されていません。" }, active: true, chosen: null, options: [
      { action: "fold", label: "Fold", disabled: true }, { action: "call", label: "Call", disabled: true },
    ] });
  }
  return blocks;
}

// After SB/BB squeezes an open plus one caller: the opener responds (caller still
// behind), then the caller responds to the opener's fold or call. A 4bet ends the
// saved data.
function appendSqueezeResponses(blocks: ActionBlock[], { opener, caller, squeezer, squeezeResponse, contribution, stackOf }: { opener: string; caller: string; squeezer: string; squeezeResponse: string[]; contribution: Record<string, number>; stackOf: (position: string) => string }) {
  const size = threeBetToSize(opener, squeezer, 1);
  const [openerAction = null, callerAction = null] = squeezeResponse;
  const options = (position: string) => [
    { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(size)}` }, { action: "raise", label: `Raise ${formatBb(fourBetToSize(position, squeezer))}` },
  ];
  const noData = (position: string) => blocks.push({ key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [], result: "データなし", pot: `${position}の4bet後の応答レンジはまだありません。` });
  blocks.push({ key: `squeeze-${opener}`, position: opener, stack: stackOf(opener), kind: "squeeze-response", role: "opener", active: !openerAction, chosen: openerAction,
    rangeRef: { kind: "squeeze", position: opener, caller, squeezer, priorAction: null }, options: options(opener) });
  if (!openerAction) return blocks;
  if (openerAction === "raise") { noData(opener); return blocks; }
  if (openerAction === "call") contribution[opener] = size;
  blocks.push({ key: `squeeze-${caller}`, position: caller, stack: stackOf(caller), kind: "squeeze-response", role: "caller", active: !callerAction, chosen: callerAction,
    rangeRef: { kind: "squeeze", position: caller, caller, squeezer, priorAction: openerAction }, options: options(caller) });
  if (!callerAction) return blocks;
  if (callerAction === "raise") { noData(caller); return blocks; }
  if (callerAction === "call") contribution[caller] = size;
  const players = [squeezer, ...(openerAction === "call" ? [opener] : []), ...(callerAction === "call" ? [caller] : [])];
  blocks.push({ key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [],
    result: players.length > 1 ? `${players.length}人でフロップへ` : `${squeezer}の勝ち`, pot: potLabel(contribution) });
  return blocks;
}

// The hand's outcome once the last decision closes the action, with the final pot.
function handResult({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, contribution, threeBetSizeBb, spot }: RangeBuildState & { callers: string[]; contribution: Record<string, number>; threeBetSizeBb?: number | null }) {
  // An uncalled bet is returned, so the largest contribution only counts up to the next largest.
  const pot = () => {
    const values = Object.values(contribution).sort((x, y) => y - x);
    const counted = values.length > 1 ? [Math.min(values[0], values[1]), ...values.slice(1)] : values;
    return `ポット ${formatBb(counted.reduce((acc, value) => acc + value, 0))}bb`;
  };
  if (pendingRaise === "all_in") {
    if (!shoveResponse) return null;
    return shoveResponse === "call" ? { result: "オールイン・ショウダウン", pot: pot() } : { result: `${hero}の勝ち`, pot: pot() };
  }
  if (rangeType === "three_bet" && continuationAction) {
    if (continuationAction === "call") { contribution[opener] = threeBetSizeBb ?? 0; return { result: "2人でフロップへ", pot: pot() }; }
    return { result: `${hero}の勝ち`, pot: pot() };
  }
  if (rangeType === "four_bet" && continuationAction) {
    if (continuationAction === "call") { contribution[hero] = spot?.four_bet_size_bb ?? 0; return { result: "2人でフロップへ", pot: pot() }; }
    return { result: `${opener}の勝ち`, pot: pot() };
  }
  if (rangeType === "response" && foldedHero && hero === "BB") {
    const players = [opener, ...callers];
    return players.length > 1 ? { result: `${players.length}人でフロップへ`, pot: pot() } : { result: `${opener}の勝ち`, pot: pot() };
  }
  return null;
}


export type RangeUrlSelection = {
  rangeType: string; opener: string; hero: string; callers: string[];
  foldedHero: boolean; pendingRaise: string | null; continuationAction: string | null;
  shoveResponse: string | null; coldAction: { position: string; action: string } | null;
  limpAction: string | null; limpResponseAction: string | null; limpReraiseAction: string | null;
  limpFourBetAction: string | null; squeezeResponse: string[]; continuationActions: string[]; selected: string;
};
export type RangeUrlState = RangeUrlSelection & {
  format: typeof defaultFormat; tableProfile: TableProfile;
  showFlop: boolean; flopCards: string[]; flopActions: string[];
  turnCard: string; turnActions: string[]; riverCard: string; riverActions: string[];
};

// The empty action path is the first unopened decision, not an inferred BTN open.
export const defaultRangeSelection: RangeUrlSelection = {
  rangeType: "open", opener: "UTG", hero: "HJ", callers: [], foldedHero: false,
  pendingRaise: null, continuationAction: null, shoveResponse: null, coldAction: null,
  limpAction: null, limpResponseAction: null, limpReraiseAction: null,
  limpFourBetAction: null, squeezeResponse: [], continuationActions: [], selected: "AKo",
};
const emptyPostflop = () => ({ showFlop: false, flopCards: ["", "", ""], flopActions: [], turnCard: "", turnActions: [], riverCard: "", riverActions: [] });
const validHand = (hand: string | null | undefined) => hands.includes(hand!) ? hand! : "AKo";
const profileLevel = (value: string | null | undefined) => ["low", "normal", "high"].includes(value!) ? value as TableProfile["call"] : "normal";
const copySelection = (): RangeUrlSelection => ({ ...defaultRangeSelection, callers: [], squeezeResponse: [], continuationActions: [] });

function availableDataset<T>(name: string): T | null {
  try { return publishedDataset<T>(name); } catch { return null; }
}

// Uses the same saved sizes and exact strip builder as the workspace. No strategy
// rows are synthesized: config sizing is only the fallback when data is absent.
export function buildRangeUrlActionBlocks(state: RangeBuildState) {
  const { opener, hero, rangeType } = state;
  const responses = availableDataset<ResponseDataset>("preflop-ranges");
  const threeBets = availableDataset<ThreeBetDataset>("three-bet-responses");
  const fourBets = availableDataset<FourBetDataset>("four-bet-responses");
  const responseFor = (position: string) => responses?.spots.find(spot => spot.opener === opener && spot.hero === position);
  const savedSpot = rangeType === "four_bet"
    ? fourBets?.spots.find(spot => spot.opener === opener && spot.hero === hero)
    : rangeType === "three_bet"
      ? threeBets?.spots.find(spot => spot.opener === opener && spot.three_bettor === hero)
      : responseFor(hero);
  const spot = state.spot ?? savedSpot ?? (positions.includes(opener) && positions.includes(hero) && opener !== hero
    ? { three_bet_size_bb: threeBetToSize(opener, hero), four_bet_size_bb: fourBetToSize(opener, hero) } : null);
  return buildActionBlocks({ ...state, spot, raiseSizeFor: state.raiseSizeFor ?? (position =>
    responseFor(position)?.hands.find(row => row.three_bet_size_bb != null)?.three_bet_size_bb
      ?? (position !== opener ? threeBetToSize(opener, position) : null)) });
}

const preflopToken = (token: string) => token === "F" ? "fold" : token === "C" ? "call" : token === "X" ? "check"
  : token === "RAI" ? "all_in" : /^R\d+(?:\.\d+)?$/.test(token) ? "raise" : null;
function chosenPreflopTokens(blocks: readonly ActionBlock[]) {
  const tokens = [];
  for (const block of blocks) {
    if (block.kind === "end" || !block.chosen) break;
    const action = block.chosen;
    if (action === "raise") {
      const option = block.options.find(option => option.action === action);
      const size = /(?:Raise|Allin)\s+([\d.]+)/i.exec(option?.label ?? "")?.[1];
      if (!size) break;
      tokens.push(`R${size}`);
    } else {
      const token = { fold: "F", call: "C", check: "X", all_in: "RAI" }[action as "fold" | "call" | "check" | "all_in"];
      if (!token) break;
      tokens.push(token);
    }
  }
  return tokens;
}
const splitActions = (value: string | null | undefined) => value ? value.split(/[-,]/) : [];
function replayPreflop(value: string | null) {
  let state = copySelection();
  let index = 0;
  // The block cursor also consumes forced folds and cold folds without changing
  // hero; those are history, not a fresh response to the initial open.
  for (const token of splitActions(value).slice(0, 32)) {
    const action = preflopToken(token);
    if (!action) break;
    const block = buildRangeUrlActionBlocks(state)[index];
    if (!block || block.kind === "end" || block.kind === "pending") break;
    const option = block.options.find(option => option.action === action);
    if (!option || (option.disabled && block.chosen !== action)) break;
    if (block.chosen) {
      if (block.chosen !== action) break;
    } else if (block.continuationNode) {
      state = { ...state, ...chooseContinuationAction(state, block, action) };
    } else if (block.kind === "cold") {
      if (action !== "fold") state = { ...state, coldAction: { position: block.position, action }, continuationAction: null };
    } else if (block.kind === "forced") {
      if (action !== "fold") break;
    } else if (block.kind === "squeeze-response") {
      state = { ...state, squeezeResponse: block.role === "opener" ? [action] : [state.squeezeResponse[0], action] };
    } else if (block.kind === "shove-response") {
      state = { ...state, shoveResponse: action };
    } else if (block.kind === "continuation") {
      if (state.rangeType === "three_bet" && action === "raise") {
        state = { ...state, rangeType: "four_bet", pendingRaise: null, continuationAction: null, coldAction: null };
      } else if (action === "all_in") {
        state = { ...state, pendingRaise: "all_in", continuationAction: null, shoveResponse: null, coldAction: null };
      } else state = { ...state, continuationAction: action, pendingRaise: null, shoveResponse: null };
    } else {
      const limp = limpActionTransition({ ...state, position: block.position, action });
      if (limp) {
        state = { ...state, ...limp, callers: [], foldedHero: false, pendingRaise: null,
          continuationAction: null, shoveResponse: null, coldAction: null, squeezeResponse: [],
          limpReraiseAction: limp.limpReraiseAction ?? null, limpFourBetAction: limp.limpFourBetAction ?? null };
      } else if (state.rangeType === "open") {
        const next = positions[positions.indexOf(block.position) + 1];
        if (action === "raise" && next) state = { ...state, rangeType: "response", hero: next };
        else if (action === "fold" && next && next !== "BB") state = { ...state, opener: next, hero: positions[positions.indexOf(next) + 1] };
        else break;
      } else {
        const transition = responseActionTransition({ ...state, position: block.position, action });
        if (!transition) break;
        state = { ...state, ...transition, continuationAction: null, shoveResponse: null,
          coldAction: null, squeezeResponse: [], limpReraiseAction: null, limpFourBetAction: null };
      }
    }
    index += 1;
  }
  return state;
}

function postflopToken(action: string) {
  if (action === "check") return "X";
  if (action === "call") return "C";
  if (action === "fold") return "F";
  if (action === "allin") return "AI";
  if (action === "raise") return "R";
  if (/^raise\d+(?:\.\d+)?$/.test(action)) return `R${action.slice(5)}`;
  if (/^bet\d+(?:\.\d+)?$/.test(action)) return `B${action.slice(3)}`;
  return null;
}
function parsePostflopActions(value: string | null) {
  const actions = [];
  for (const token of splitActions(value).slice(0, 32)) {
    const action = token === "X" ? "check" : token === "C" ? "call" : token === "F" ? "fold"
      : token === "AI" ? "allin" : token === "R" ? "raise"
      : /^R\d+(?:\.\d+)?$/.test(token) ? "raise"
      : /^B\d+(?:\.\d+)?$/.test(token) ? `bet${token.slice(1)}` : null;
    if (!action) break;
    actions.push(action);
  }
  return actions;
}
// Native decision options enforce node reachability, stack caps, and street
// termination. Never feed an imported illegal sequence to the UI replay engine.
function reachablePostflopPrefix(actions: string[], decisionFor: (actions: string[]) => { options?: readonly { action: string }[] }) {
  const prefix: string[] = [];
  for (const action of actions) {
    const decision = decisionFor(prefix);
    if (!decision.options?.some(option => option.action === action)) break;
    prefix.push(action);
  }
  return prefix;
}
const cardValid = (card: string) => /^[2-9TJQKA][shdc]$/.test(card);
function boardCards(value: string | null | undefined, count: number, used: readonly string[] = []) {
  if (typeof value !== "string" || value.length !== count * 2) return null;
  const cards = value.match(/.{2}/g)!;
  return cards.every(cardValid) && new Set([...used, ...cards]).size === used.length + count ? cards : null;
}

/** Pure canonical spot URL. UI callers pass the actual preflop strip blocks. */
export function encodeRangeUrl(state: RangeEncodingState, actionBlocks = buildRangeUrlActionBlocks(state)) {
  const format = { ...defaultFormat, ...state.format };
  const params = new URLSearchParams();
  params.set("gametype", `${format.game}-${format.table}`);
  params.set("depth", String(format.stack));
  if (format.openSize !== defaultFormat.openSize) params.set("open", String(format.openSize));
  if (format.ante !== defaultFormat.ante) params.set("ante", format.ante ? "1" : "0");
  if (format.rake !== defaultFormat.rake) params.set("rake", format.rake);
  for (const key of ["call", "three_bet"] as const) {
    const level = profileLevel(state.tableProfile?.[key]);
    if (level !== "normal") params.set(key, level);
  }
  const actions = chosenPreflopTokens(actionBlocks);
  if (actions.length) params.set("preflop_actions", actions.join("-"));
  const flop = state.showFlop === false ? null : boardCards(state.flopCards?.join(""), 3);
  if (flop) {
    params.set("board", flop.join(""));
    const writeActions = (key: string, actions: string[] | undefined) => params.set(key, (actions ?? []).map(postflopToken).filter(Boolean).join("-"));
    writeActions("flop_actions", state.flopActions);
    const turn = boardCards(state.turnCard, 1, flop);
    if (turn) {
      params.set("turn", turn[0]); writeActions("turn_actions", state.turnActions);
      const river = boardCards(state.riverCard, 1, [...flop, ...turn]);
      if (river) { params.set("river", river[0]); writeActions("river_actions", state.riverActions); }
    }
  }
  params.set("hand", validHand(state.selected ?? state.hand));
  return `/analyze/ranges?${params.toString()}`;
}

/** Query wins over persisted state. With no recognized spot parameters, return null. */
export function decodeRangeUrl(query: string | URLSearchParams): RangeUrlState | null {
  const raw = typeof query === "string" ? query.replace(/^[^?]*\?/, "").split("#")[0] : query;
  const params = new URLSearchParams(raw);
  const keys = ["gametype", "depth", "open", "ante", "rake", "call", "three_bet", "preflop_actions", "board", "flop_actions", "turn", "turn_actions", "river", "river_actions", "hand"];
  if (!keys.some(key => params.has(key))) return null;
  const gametype = params.get("gametype") ?? `${defaultFormat.game}-${defaultFormat.table}`;
  const [game, table] = gametype.split("-");
  const format = { game, table, stack: params.has("depth") ? Number(params.get("depth")) : defaultFormat.stack,
    openSize: params.has("open") ? Number(params.get("open")) : defaultFormat.openSize,
    ante: params.has("ante") ? params.get("ante") === "1" : defaultFormat.ante,
    rake: params.get("rake") ?? defaultFormat.rake };
  const knownFormat = gametype === `${game}-${table}` && (!params.has("ante") || ["0", "1"].includes(params.get("ante")!))
    && (Object.keys(defaultFormat) as FormatKey[]).every(key => formatOptions[key].some(option => option.value === format[key]));
  const state: RangeUrlState = { ...replayPreflop(params.get("preflop_actions")),
    selected: validHand(params.get("hand")), format: knownFormat ? format : { ...defaultFormat },
    tableProfile: { call: profileLevel(params.get("call")), three_bet: profileLevel(params.get("three_bet")) }, ...emptyPostflop() };
  const flop = boardCards(params.get("board"), 3);
  if (!flop) return state;
  const context = completedFlopContext({ ...state, actionBlocks: buildRangeUrlActionBlocks(state),
    isDefaultTable: (Object.keys(defaultFormat) as FormatKey[]).every(key => state.format[key] === defaultFormat[key])
      && state.tableProfile.call === "normal" && state.tableProfile.three_bet === "normal" });
  // A board cannot revive a closed/winning preflop path. A completed path
  // without a pilot still has an active read-only placeholder in the workspace.
  if (!context) return state;
  state.showFlop = true; state.flopCards = flop;
  if (!context.pilotAvailable) {
    state.flopActions = parsePostflopActions(params.get("flop_actions"));
    const turn = boardCards(params.get("turn"), 1, flop);
    if (!turn) return state;
    state.turnCard = turn[0]; state.turnActions = parsePostflopActions(params.get("turn_actions"));
    const river = boardCards(params.get("river"), 1, [...flop, ...turn]);
    if (!river) return state;
    state.riverCard = river[0]; state.riverActions = parsePostflopActions(params.get("river_actions"));
    return state;
  }
  state.flopActions = reachablePostflopPrefix(parsePostflopActions(params.get("flop_actions")),
    actions => flopDecision(actions, context));
  const turn = boardCards(params.get("turn"), 1, flop);
  const turnStart = laterStart(state.flopActions, context);
  if (!turn || !turnStart) return state;
  state.turnCard = turn[0];
  state.turnActions = reachablePostflopPrefix(parsePostflopActions(params.get("turn_actions")),
    actions => laterDecision("turn", actions, turnStart, context));
  const river = boardCards(params.get("river"), 1, [...flop, ...turn]);
  const turnReplay = replayLater("turn", state.turnActions, turnStart, context);
  if (!river || !turnReplay.state.end || ["fold", "raise-fold"].includes(turnReplay.state.end.type)
    || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) return state;
  const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
  state.riverCard = river[0];
  state.riverActions = reachablePostflopPrefix(parsePostflopActions(params.get("river_actions")),
    actions => laterDecision("river", actions, riverStart, context));
  return state;
}

// Browser effects are deliberately isolated from the codec above.
export function readRangeUrl(browser = typeof window === "undefined" ? null : window) {
  return browser?.location?.pathname === "/analyze/ranges" ? decodeRangeUrl(browser.location.search) : null;
}
export function replaceRangeUrl(url: string, browser = typeof window === "undefined" ? null : window) {
  if (browser?.location?.pathname !== "/analyze/ranges") return false;
  const canonical = `${url.split("#")[0]}${browser.location.hash ?? ""}`;
  const current = `${browser.location.pathname}${browser.location.search}${browser.location.hash ?? ""}`;
  if (canonical === current) return false;
  browser.history.replaceState(browser.history.state, "", canonical);
  return true;
}
