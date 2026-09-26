import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { DEFAULT_SPOT_ID, spotById, spotFor } from "../../scripts/postflop-ai/spots.mjs";

export const representativeFlops = pilot.boards.map(board => board.cards);
export const deck = "23456789TJQKA".split("").flatMap(rank => "shdc".split("").map(suit => `${rank}${suit}`));
const boardKey = cards => [...cards].sort().join("");
const representativeByCards = new Map(representativeFlops.map(board => [boardKey(board.match(/../g)), board]));
export function recognizedFlop(cards) {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !deck.includes(card)) || new Set(cards).size !== 3) return null;
  return representativeByCards.get(boardKey(cards)) ?? null;
}
const round = value => Math.round(value * 100) / 100;

// Heads-up single-raised pots: O opens, exactly one later seat C calls, everyone else folds.
// The saved candidate for that spot (scripts/postflop-ai/spots.mjs) is shown read-only.
export function completedFlopContext({ actionBlocks, rangeType, opener, hero, callers = [], foldedHero, isDefaultTable }) {
  const end = actionBlocks.find(block => block.kind === "end");
  if (!end || !/^\d+人でフロップへ$/.test(end.result)) return null;
  const potBb = Number(/^ポット ([\d.]+)bb$/.exec(end.pot)?.[1]);
  if (!Number.isFinite(potBb)) return null;
  const players = rangeType === "limp" ? ["SB", "BB"]
    : rangeType === "response" ? [opener, ...callers] : [opener, hero];
  const spot = rangeType === "response" && foldedHero && callers.length === 1 ? spotFor(opener, callers[0]) : null;
  const pilotAvailable = Boolean(spot?.reachable) && potBb === spot.potBb && Boolean(isDefaultTable);
  return {
    players, potBb, pilotAvailable,
    spotId: pilotAvailable ? spot.id : null, ip: pilotAvailable ? spot.ip : null, oop: pilotAvailable ? spot.oop : null,
    stackBb: pilotAvailable ? spot.stackBb : null,
  };
}

// Seat names, starting pot and stacks of the flop tree; the first pilot spot when none is given.
function geometry(spot) {
  if (spot?.ip && spot?.oop && Number.isFinite(spot.potBb) && Number.isFinite(spot.stackBb)) return spot;
  return spotById(DEFAULT_SPOT_ID);
}
const betFraction = action => action === "bet33" ? pilot.flop_bet_fractions[0] : pilot.flop_bet_fractions[1];

// The OOP player checks; "btn_*" nodes are the IP player's decisions and "bb_*" the OOP player's.
export function flopDecision(actions = [], spot) {
  if (!Array.isArray(actions)) throw new Error("Invalid flop action path");
  const { ip, oop, potBb: start } = geometry(spot);
  if (actions.length === 0) return { node: "btn_first", actor: ip, potBb: start, history: [`${oop} Check`] };
  const [first, second, third] = actions;
  if (first === "check" && actions.length === 1) return { result: `${ip}もチェック。フロップの判断は終了です。`, potBb: start, history: [`${oop} Check`, `${ip} Check`] };
  if (!["bet33", "bet75"].includes(first)) throw new Error("Illegal IP flop action");
  const bet = round(start * betFraction(first));
  const history = [`${oop} Check`, `${ip} Bet ${first === "bet33" ? "33%" : "75%"} (${bet}BB)`];
  if (actions.length === 1) return { node: first === "bet33" ? "bb_vs_33" : "bb_vs_75", actor: oop, potBb: round(start + bet), history };
  if (second === "fold" && actions.length === 2) return { result: `${oop}がフォールド。${ip}の勝ちです。`, potBb: start, history: [...history, `${oop} Fold`] };
  if (second === "call" && actions.length === 2) return { result: `${oop}がコール。フロップの判断は終了です。`, potBb: round(start + 2 * bet), history: [...history, `${oop} Call`] };
  if (second !== "raise") throw new Error("Illegal OOP flop action");
  const raisedHistory = [...history, `${oop} Check-raise ${round(3 * bet)}BB`];
  if (actions.length === 2) return { node: "btn_vs_raise", actor: ip, potBb: round(start + 4 * bet), history: raisedHistory };
  if (third === "fold" && actions.length === 3) return { result: `${ip}がフォールド。${oop}の勝ちです。`, potBb: round(start + 2 * bet), history: [...raisedHistory, `${ip} Fold`] };
  if (third === "call" && actions.length === 3) return { result: `${ip}がコール。フロップの判断は終了です。`, potBb: round(start + 6 * bet), history: [...raisedHistory, `${ip} Call`] };
  throw new Error("Illegal post-raise flop action");
}

const flopChoices = {
  btn_first: [{ action: "check", label: "Check" }, { action: "bet33", label: "Bet 33%" }, { action: "bet75", label: "Bet 75%" }],
  bb_vs_33: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call" }, { action: "raise", label: "Raise 3×" }],
  bb_vs_75: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call" }, { action: "raise", label: "Raise 3×" }],
  btn_vs_raise: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call" }],
};

export function buildFlopActionBlocks(actions = [], spot) {
  const { ip, oop, potBb: start, stackBb } = geometry(spot);
  const blocks = [{ key: "flop-oop-check", kind: "flop-forced", position: oop, stack: `${stackBb}`, chosen: "check", options: [{ action: "check", label: "Check" }], active: false }];
  for (let index = 0; index <= actions.length; index++) {
    const decision = flopDecision(actions.slice(0, index), spot);
    if (!decision.node) {
      blocks.push({ key: "flop-end", kind: "end", result: decision.result, pot: `ポット ${decision.potBb}bb`, options: [] });
      break;
    }
    const firstBet = ["bet33", "bet75"].includes(actions[0]) ? round(start * betFraction(actions[0])) : 0;
    blocks.push({ key: `flop-${index}`, kind: "flop", flopIndex: index, position: decision.actor,
      stack: `${round(stackBb - (decision.actor === ip && index > 0 ? firstBet : 0))}`,
      chosen: actions[index] ?? null, options: flopChoices[decision.node], active: index === actions.length });
  }
  return blocks;
}
