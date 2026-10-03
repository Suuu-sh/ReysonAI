// One Evion Agent hand, replayed from (seed, human actions). The hand is a pure function of its
// inputs: cards come from a seeded shuffle and each agent decision from its own seeded draw, so
// replaying with one more human action reproduces everything before it. When the human must act
// and no action is left, the replay stops and returns the pending decision.
//
// Postflop reuses the AI-estimate engine (scripts/postflop-ai/engine.mjs) on the heads-up spot the
// preflop reached, with the same mixes the candidate plays in the simulation (policy + computed
// defence). A pot without a saved postflop policy is checked down, never filled from another spot.
import { evaluate as evaluateHand, seededRandom, seedFor } from "../../scripts/lib/equity.mjs";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "../../scripts/postflop-ai/engine.mjs";
import { NODES, choose } from "../../scripts/postflop-ai/policy.mjs";
import { LATER_NODES } from "../../scripts/postflop-ai/later-tree.mjs";
import { cardText } from "../../scripts/postflop-ai/flop-isomorphism.mjs";
import { fourBetSpotFor, limpSpotFor, spotFor, threeBetSpotFor } from "../../scripts/postflop-ai/spots.mjs";
import { POSITIONS, type Position, type PreflopAction, STACK_BB, alivePositions, applyPreflop, handClass, nextActor, preflopOptions, preflopPot, startPreflop } from "./preflop.ts";
import { type Decider, type PostflopKit } from "./policy.ts";

const round = (value: number) => Math.round(value * 100) / 100;

export type HumanAction = string; // preflop: dataset key (fold/call/check/open/three_bet/...); postflop: node action

export type HandSetup = {
  seed: string;
  human: Position | null; // null: agents only
  humanActions?: HumanAction[];
  agents: Decider; // decides for every non-human seat
  postflop: (spotId: string) => PostflopKit | null | undefined; // undefined: not loaded yet
};

// `to`: the street total the action makes (BB); `toCall`: chips the human owes now.
export type Pending = { street: "preflop" | "flop" | "turn" | "river"; pos: Position; options: { key: string; to?: number }[]; pot: number; board: string[]; toCall?: number; notice?: "no_multiway" | "no_data" | null };
// `pot` is the pot after the action; `bets` the street totals in front of each seat after it.
export type LogEntry = { street: string; pos: Position; action: string; to?: number; pot: number; bets?: Record<string, number>; source?: string; tableRule?: string | null };

export type HandResult = {
  status: "awaiting" | "needs_postflop" | "done";
  pending?: Pending;
  spotId?: string | null;
  holeCards: Record<string, string[]>;
  board: string[]; // cards dealt so far (all five at showdown)
  log: LogEntry[];
  policyMissing?: boolean;
  winners?: Position[];
  showdown?: boolean;
  returns?: Record<string, number>; // BB won or lost per position
  rake?: number;
  pot?: number;
  handRanks?: Record<string, number>; // made-hand category of each seat at showdown (0 high card … 8 straight flush)
};

const CATEGORY = ["ハイカード", "ワンペア", "ツーペア", "スリーカード", "ストレート", "フラッシュ", "フルハウス", "フォーカード", "ストレートフラッシュ"];
const CATEGORY_EN = ["High card", "One pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
// Category of a 5-7 card score from evaluate() (packed as category * 16^5 + kickers).
export const handCategory = (score: number) => Math.floor(score / 16 ** 5);
export const categoryName = (category: number, locale: "ja" | "en" = "ja") => (locale === "ja" ? CATEGORY : CATEGORY_EN)[category] ?? "";

class Await extends Error {
  pending: Pending;
  constructor(pending: Pending) { super("awaiting human"); this.pending = pending; }
}

export function deal(seed: string) {
  const random = seededRandom(seedFor(`${seed}|deal`));
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const hole: Record<string, number[]> = {};
  POSITIONS.forEach((pos, i) => { hole[pos] = [deck[i], deck[i + 6]]; });
  return { hole, board: deck.slice(12, 17) };
}

// The postflop spot a heads-up preflop line reached, or null when no spot describes it.
export function postflopSpotFor(events: { pos: Position; type: string; key: string }[]) {
  const voluntary = events.filter(e => e.type !== "fold" && e.type !== "check");
  const keys = voluntary.map(e => e.key);
  const raisers = voluntary.filter(e => e.type === "raise");
  const sig = keys.join(",");
  if (sig === "limp" && events.some(e => e.pos === "BB" && e.key === "check")) return limpSpotFor("SB_limp_BB_check");
  if (sig === "limp,raise,call") return limpSpotFor("SB_limp_BB_iso_call");
  if (sig === "limp,raise,raise,call") return limpSpotFor("SB_limp_BB_iso_SB_reraise_call");
  if (sig === "open,call") return spotFor(raisers[0].pos, voluntary[1].pos);
  if (sig === "open,three_bet,call") return threeBetSpotFor(raisers[0].pos, raisers[1].pos);
  if (sig === "open,three_bet,four_bet,call") return fourBetSpotFor(raisers[0].pos, raisers[1].pos);
  return null;
}

export function playHand(setup: HandSetup): HandResult {
  const { hole, board } = deal(setup.seed);
  const holeText = Object.fromEntries(Object.entries(hole).map(([pos, cards]) => [pos, cards.map(cardText)]));
  const humanQueue = [...(setup.humanActions ?? [])];
  const log: LogEntry[] = [];
  let decisionIndex = 0;
  const drawFor = () => seededRandom(seedFor(`${setup.seed}|decision|${decisionIndex++}`))();
  const result = (extra: Partial<HandResult>): HandResult => ({ status: "done", holeCards: holeText, board: [], log, ...extra });

  // Preflop.
  let state = startPreflop();
  for (let pos = nextActor(state); pos; pos = nextActor(state)) {
    const hand = handClass(hole[pos]);
    const offered = preflopOptions(state, pos, hand);
    let action: PreflopAction, source = offered.source ?? undefined, tableRule: string | null = null;
    if (pos === setup.human) {
      const options = humanPreflopOptions(state, pos, offered);
      const owed = round(Math.max(0, ...Object.values(state.committed)) - (state.committed[pos] ?? 0));
      if (!humanQueue.length) return result({ status: "awaiting", pending: { street: "preflop", pos, options, pot: preflopPot(state), board: [], toCall: owed,
        notice: offered.tableRule ?? (offered.callBlocked && owed > 0 ? "no_multiway" : null) } });
      const key = humanQueue.shift()!;
      const picked = options.find(option => option.key === key);
      if (!picked) throw new Error(`Illegal preflop action ${key} for ${pos}`);
      action = offered.choices.find(choice => choice.action.key === key)?.action ?? { type: key as any, key };
    } else {
      const decision = setup.agents.preflop({ pos, hand, cards: hole[pos], offered, random: drawFor() });
      action = decision.action; tableRule = offered.tableRule;
    }
    state = applyPreflop(state, pos, action);
    log.push({ street: "preflop", pos, action: action.key, to: state.committed[pos], pot: preflopPot(state), bets: { ...state.committed }, source, tableRule });
  }

  const alive = alivePositions(state);
  const pot = preflopPot(state);
  const invested = Object.fromEntries(POSITIONS.map(pos => [pos, state.committed[pos] ?? 0]));
  if (alive.length === 1) {
    const winner = alive[0];
    const returns = Object.fromEntries(POSITIONS.map(pos => [pos, round((pos === winner ? pot : 0) - invested[pos])]));
    return result({ winners: [winner], showdown: false, returns, rake: 0, pot });
  }
  const [a, b] = alive;
  const allIn = alive.some(pos => (state.committed[pos] ?? 0) >= STACK_BB);
  const spot = allIn ? null : postflopSpotFor(state.events);
  const kit = spot ? setup.postflop(spot.id) : null;
  if (spot && kit === undefined) return result({ status: "needs_postflop", spotId: spot.id });

  const showdownOf = (cards: number[], contributions: Record<string, number>, total: number, extra: Partial<HandResult>) => {
    const fee = rake(total), paid = round(total - fee);
    const scoreA = evaluateHand([...hole[a], ...cards]), scoreB = evaluateHand([...hole[b], ...cards]);
    const winners: Position[] = scoreA === scoreB ? [a, b] : scoreA > scoreB ? [a] : [b];
    const returns = Object.fromEntries(POSITIONS.map(pos => [pos,
      round((winners.includes(pos) ? paid / winners.length : 0) - (contributions[pos] ?? 0))]));
    const handRanks = { [a]: handCategory(scoreA), [b]: handCategory(scoreB) };
    return result({ ...extra, board: cards.map(cardText), winners, showdown: true, returns, rake: fee, pot: total, handRanks });
  };

  if (!spot || !kit || Math.abs(spot.potBb - pot) > 0.01 || ![spot.ip, spot.oop].every(pos => alive.includes(pos))) {
    // All-in preflop, or no saved postflop policy: deal it out (checked down). A human still in the
    // pot gets each street with check as the only option instead of the board jumping to showdown.
    if (!allIn && setup.human && alive.includes(setup.human)) {
      const POSTFLOP_ORDER: Position[] = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
      const order = POSTFLOP_ORDER.filter(pos => alive.includes(pos));
      for (const [street, cards] of [["flop", 3], ["turn", 4], ["river", 5]] as const) {
        for (const pos of order) {
          if (pos === setup.human) {
            if (!humanQueue.length) return result({ status: "awaiting", spotId: spot?.id ?? null, board: board.slice(0, cards).map(cardText),
              pending: { street, pos, options: [{ key: "check" }], pot, board: board.slice(0, cards).map(cardText), toCall: 0, notice: "no_data" } });
            const key = humanQueue.shift()!;
            if (key !== "check") throw new Error(`Illegal ${street} action ${key} for ${pos}`);
          }
          log.push({ street, pos, action: "check", pot, bets: {} });
        }
      }
    }
    return showdownOf(board, invested, pot, { spotId: spot?.id ?? null, policyMissing: !allIn });
  }

  // Heads-up postflop on the reached spot.
  const table = createTable(spot);
  const flop = board.slice(0, 3), runout = board.slice(3, 5);
  const boardSoFar = (len: number) => board.slice(0, len).map(cardText);
  const config = kit.inputs.config;
  let currentStreet = "", streetBase: Record<string, number> = {}, pendingEntry: LogEntry | null = null;
  const streetBets = () => Object.fromEntries([spot.ip, spot.oop].map(pos => [pos, round(table.invested[pos] - (streetBase[pos] ?? 0))]));
  // Pot and street bets are known once the engine applied the action: fill them in lazily.
  const flush = () => { if (pendingEntry) { pendingEntry.pot = round(table.pot); pendingEntry.bets = streetBets(); pendingEntry = null; } };
  const sizeOf = (street: string, action: string, bets: Record<string, number>, seat: Position) => {
    const facing = Math.max(...Object.values(bets)), mine = bets[seat] ?? 0, stack = table.stacks[seat];
    if (action === "call") return round(Math.min(facing, mine + stack));
    if (action === "allin") return round(mine + stack);
    if (action === "raise") return round(Math.min(mine + stack, facing * (street === "flop" ? config.flop_check_raise_multiplier : config.later_raise_multiplier)));
    const bet = /^bet(\d+)$/.exec(action);
    return bet ? round(Math.min(mine + stack, table.pot * Number(bet[1]) / 100)) : undefined;
  };
  const ask = (street: "flop" | "turn" | "river", seat: Position, node: string, cards: number[], line: string | null) => {
    flush();
    if (street !== currentStreet) { currentStreet = street; streetBase = { ...table.invested }; }
    const entry = table.log.at(-1);
    const actions: string[] = (street === "flop" ? NODES : LATER_NODES)[node].filter((act: string) => act !== "raise" || entry?.canRaise);
    const bets = streetBets();
    let action: string;
    if (seat === setup.human) {
      const toCall = round(Math.max(...Object.values(bets)) - (bets[seat] ?? 0));
      if (!humanQueue.length) throw new Await({ street, pos: seat, options: actions.map(key => ({ key, to: key === "fold" || key === "check" ? undefined : sizeOf(street, key, bets, seat) })),
        pot: round(table.pot), board: boardSoFar(cards.length), toCall });
      action = humanQueue.shift()!;
      if (!actions.includes(action)) throw new Error(`Illegal ${street} action ${action} for ${seat}`);
    } else {
      action = setup.agents.postflop({ kit, table, street, seat, node, board: cards, hole: hole[seat], line, actions, random: drawFor() }).action;
    }
    pendingEntry = { street, pos: seat, action, to: action === "fold" || action === "check" ? undefined : sizeOf(street, action, bets, seat), pot: table.pot };
    log.push(pendingEntry);
    return action;
  };
  try {
    playFlop(table, spot.tree, (seat: Position, node: string) => ask("flop", seat, node, flop, null), kit.inputs.config);
    playLaterStreetsWithPolicy(table, flop, runout, (seat: Position, node: string, cards: number[], line: string) =>
      ask(cards.length === 4 ? "turn" : "river", seat, node, cards, line), kit.inputs.config, table.lastAggressor);
  } catch (error) {
    if (error instanceof Await) return result({ status: "awaiting", pending: error.pending, spotId: spot.id, board: error.pending.board });
    throw error;
  }
  flush();
  const foldedOut = Boolean(table.winner);
  const winner = settle(table, { [spot.ip]: hole[spot.ip], [spot.oop]: hole[spot.oop] }, board);
  const total = round(table.pot);
  const fee = rake(total), paid = round(total - fee);
  const winners: Position[] = winner === "tie" ? [spot.ip, spot.oop] : [winner];
  const returns = Object.fromEntries(POSITIONS.map(pos => {
    const put = round((state.committed[pos] ?? 0) + ([spot.ip, spot.oop].includes(pos) ? table.invested[pos] : 0));
    return [pos, round((winners.includes(pos) ? paid / winners.length : 0) - put)];
  }));
  const lastStreet = log.at(-1)?.street;
  const shown = foldedOut ? (lastStreet === "flop" ? 3 : lastStreet === "turn" ? 4 : 5) : 5;
  const handRanks = foldedOut ? undefined : Object.fromEntries([spot.ip, spot.oop].map(pos => [pos, handCategory(evaluateHand([...hole[pos], ...board]))]));
  return result({ spotId: spot.id, board: boardSoFar(shown), winners, showdown: !foldedOut, returns, rake: fee, pot: total, handRanks });
}


// What the human may press: the saved situation's actions (minus a blocked multiway call), or
// fold / check plus a plain call when the line has no saved data.
function humanPreflopOptions(state: any, pos: Position, offered: ReturnType<typeof preflopOptions>) {
  if (offered.tableRule !== "no_data") return offered.choices.map(choice => ({ key: choice.action.key, to: choice.action.to }));
  const bet = Math.max(0, ...Object.values(state.committed as Record<string, number>));
  const owed = bet > (state.committed[pos] ?? 0);
  if (!owed) return [{ key: "check" }];
  return offered.callBlocked ? [{ key: "fold" }] : [{ key: "fold" }, { key: "call", to: Math.min(STACK_BB, bet) }];
}
