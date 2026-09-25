import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };

export const representativeFlops = pilot.boards.map(board => board.cards);
export const deck = "23456789TJQKA".split("").flatMap(rank => "shdc".split("").map(suit => `${rank}${suit}`));
const boardKey = cards => [...cards].sort().join("");
const representativeByCards = new Map(representativeFlops.map(board => [boardKey(board.match(/../g)), board]));
export function recognizedFlop(cards) {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !deck.includes(card)) || new Set(cards).size !== 3) return null;
  return representativeByCards.get(boardKey(cards)) ?? null;
}
const round = value => Math.round(value * 100) / 100;

export function completedFlopContext({ actionBlocks, rangeType, opener, hero, callers = [], foldedHero, isDefaultTable }) {
  const end = actionBlocks.find(block => block.kind === "end");
  if (!end || !/^\d+人でフロップへ$/.test(end.result)) return null;
  const potBb = Number(/^ポット ([\d.]+)bb$/.exec(end.pot)?.[1]);
  if (!Number.isFinite(potBb)) return null;
  const players = rangeType === "limp" ? ["SB", "BB"]
    : rangeType === "response" ? [opener, ...callers] : [opener, hero];
  return {
    players, potBb,
    pilotAvailable: rangeType === "response" && opener === "BTN" && foldedHero &&
      callers.length === 1 && callers[0] === "BB" && potBb === 5.5 && isDefaultTable,
  };
}

export function flopDecision(actions = []) {
  if (!Array.isArray(actions)) throw new Error("Invalid flop action path");
  if (actions.length === 0) return { node: "btn_first", actor: "BTN", potBb: 5.5, history: ["BB Check"] };
  const [first, second, third] = actions;
  if (first === "check" && actions.length === 1) return { result: "BTNもチェック。フロップの判断は終了です。", potBb: 5.5, history: ["BB Check", "BTN Check"] };
  if (!["bet33", "bet75"].includes(first)) throw new Error("Illegal BTN flop action");
  const bet = round(5.5 * (first === "bet33" ? pilot.flop_bet_fractions[0] : pilot.flop_bet_fractions[1]));
  const history = ["BB Check", `BTN Bet ${first === "bet33" ? "33%" : "75%"} (${bet}BB)`];
  if (actions.length === 1) return { node: first === "bet33" ? "bb_vs_33" : "bb_vs_75", actor: "BB", potBb: round(5.5 + bet), history };
  if (second === "fold" && actions.length === 2) return { result: "BBがフォールド。BTNの勝ちです。", potBb: 5.5, history: [...history, "BB Fold"] };
  if (second === "call" && actions.length === 2) return { result: "BBがコール。フロップの判断は終了です。", potBb: round(5.5 + 2 * bet), history: [...history, "BB Call"] };
  if (second !== "raise") throw new Error("Illegal BB flop action");
  const raisedHistory = [...history, `BB Check-raise ${round(3 * bet)}BB`];
  if (actions.length === 2) return { node: "btn_vs_raise", actor: "BTN", potBb: round(5.5 + 4 * bet), history: raisedHistory };
  if (third === "fold" && actions.length === 3) return { result: "BTNがフォールド。BBの勝ちです。", potBb: round(5.5 + 2 * bet), history: [...raisedHistory, "BTN Fold"] };
  if (third === "call" && actions.length === 3) return { result: "BTNがコール。フロップの判断は終了です。", potBb: round(5.5 + 6 * bet), history: [...raisedHistory, "BTN Call"] };
  throw new Error("Illegal post-raise flop action");
}

const flopChoices = {
  btn_first: [{ action: "check", label: "Check" }, { action: "bet33", label: "Bet 33%" }, { action: "bet75", label: "Bet 75%" }],
  bb_vs_33: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call" }, { action: "raise", label: "Raise 3×" }],
  bb_vs_75: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call" }, { action: "raise", label: "Raise 3×" }],
  btn_vs_raise: [{ action: "fold", label: "Fold" }, { action: "call", label: "Call" }],
};

export function buildFlopActionBlocks(actions = []) {
  const blocks = [{ key: "flop-bb-check", kind: "flop-forced", position: "BB", stack: "97.5", chosen: "check", options: [{ action: "check", label: "Check" }], active: false }];
  for (let index = 0; index <= actions.length; index++) {
    const decision = flopDecision(actions.slice(0, index));
    if (!decision.node) {
      blocks.push({ key: "flop-end", kind: "end", result: decision.result, pot: `ポット ${decision.potBb}bb`, options: [] });
      break;
    }
    const firstBet = actions[0] === "bet33" ? round(5.5 * pilot.flop_bet_fractions[0])
      : actions[0] === "bet75" ? round(5.5 * pilot.flop_bet_fractions[1]) : 0;
    blocks.push({ key: `flop-${index}`, kind: "flop", flopIndex: index, position: decision.actor,
      stack: `${round(97.5 - (decision.actor === "BTN" && index > 0 ? firstBet : 0))}`,
      chosen: actions[index] ?? null, options: flopChoices[decision.node], active: index === actions.length });
  }
  return blocks;
}
