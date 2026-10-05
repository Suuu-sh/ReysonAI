import type { OpeningSpot, ResponseSpot, ThreeBetSpot, FourBetSpot, FiveBetSpot, MultiwaySpot, SqueezeSpot, ColdThreeBetSpot, ColdFourBetSpot, Multiway2Spot, LimpSpot, LimpDeepSpot } from "../estimated/preflop-types.ts";
type SourceSpot = OpeningSpot | ResponseSpot | ThreeBetSpot | FourBetSpot | FiveBetSpot | MultiwaySpot | SqueezeSpot | ColdThreeBetSpot | ColdFourBetSpot | Multiway2Spot | LimpSpot | LimpDeepSpot;
import { continuationDecisionForEvents } from "../estimated/continuation-history.ts";
// Six-handed preflop for the Reyson Agent table. Every decision is looked up in a saved preflop
// dataset (opening, responses, 3bet/4bet/5bet, squeeze, cold 3bet, limp lines); nothing else
// is invented. Two table rules keep every flop heads-up (the only postflop data we have):
//   - a call that would put a third player into the pot is not offered (agents move that
//     frequency to fold, flagged `tableRule: "no_multiway"`);
//   - a situation without saved data offers only fold / check (agents fold, flagged `"no_data"`).
// Everyone starts each hand with 100BB, the depth every dataset assumes.
import { dataset } from "../estimated/datasets.ts";
import { gameConfig, openSizeFor, sbCompleteToBb } from "../estimated/sizing.ts";

export const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const;
export type Position = typeof POSITIONS[number];
export const STACK_BB = gameConfig.stack_bb;
const round = (value: number) => Math.round(value * 100) / 100;
const RANKS = "23456789TJQKA";

// "AKs" / "T9o" / "77" for two card ints (rank * 4 + suit).
export function handClass(cards: number[]): string {
  const [hi, lo] = [...cards].sort((a, b) => b - a);
  const a = RANKS[hi >> 2], b = RANKS[lo >> 2];
  if (a === b) return a + b;
  return a + b + ((hi & 3) === (lo & 3) ? "s" : "o");
}

export type PreflopAction = { type: "fold" | "check" | "call" | "raise"; to?: number; key: string };
export type PreflopEvent = { pos: Position; type: PreflopAction["type"]; to: number; key: string; kind?: string };

export type PreflopState = {
  committed: Record<string, number>;
  folded: Set<string>;
  acted: Set<string>; // acted since the last raise
  voluntary: Set<string>; // put chips in by choice (called, limped or raised)
  events: PreflopEvent[];
  raises: { pos: Position; to: number; kind: string; callers?: Position[] }[];
  limper: Position | null;
  callers: Position[]; // callers of the current raise level
};

export function startPreflop(): PreflopState {
  return { committed: { SB: 0.5, BB: 1 }, folded: new Set(), acted: new Set(), voluntary: new Set(), events: [], raises: [], limper: null, callers: [] };
}

const currentBet = (s: PreflopState) => Math.max(0, ...Object.values(s.committed));
const contribution = (s: PreflopState, pos: string) => s.committed[pos] ?? 0;

// Next position to act, or null when the round is complete.
export function nextActor(s: PreflopState): Position | null {
  const alive = POSITIONS.filter(pos => !s.folded.has(pos));
  if (alive.length < 2) return null;
  const bet = currentBet(s);
  const last = s.events.at(-1)?.pos;
  const start = last ? POSITIONS.indexOf(last) + 1 : 0;
  for (let i = 0; i < 6; i++) {
    const pos = POSITIONS[(start + i) % 6];
    if (s.folded.has(pos) || contribution(s, pos) >= STACK_BB) continue;
    if (!s.acted.has(pos) || contribution(s, pos) < bet) return pos;
  }
  return null;
}

type Situation = { source: string | null; rows: any; map: Record<string, PreflopAction> };

export type DatasetLookup = (name: string) => unknown;

// The saved dataset row that answers `pos` in the current state, and how its keys map to actions.
export function situation(s: PreflopState, pos: Position, lookup?: DatasetLookup): Situation {
  const read = lookup ?? dataset;
  const find = (file: string, id: string) => (read(file) as { spots: SourceSpot[] } | undefined)?.spots.find(item => item.id === id) ?? null;
  const raises = s.raises, bet = currentBet(s);
  const raise = (key: string, to: number): PreflopAction => ({ type: "raise", to: Math.min(STACK_BB, round(to)), key });
  const call: PreflopAction = { type: "call", key: "call" }, fold: PreflopAction = { type: "fold", key: "fold" };
  const of = (file: string, id: string, map: Record<string, PreflopAction>): Situation => {
    const spot = find(file, id);
    return spot ? { source: `${file}/${id}`, rows: spot, map } : { source: null, rows: null, map: {} };
  };
  const size = (spot: any, field: string, fallback: number) => Number.isFinite(spot?.[field]) ? spot[field] : fallback;

  // Limped pot (SB completes, BB to act and onwards).
  if (s.limper) {
    if (!raises.length && pos === "BB") return of("limp-responses", "BB_vs_SB_limp", { check: { type: "check", key: "check" }, raise: raise("raise", size(find("limp-responses", "BB_vs_SB_limp"), "raise_size_bb", 3.5)) });
    if (raises.length === 1 && pos === "SB") {
      const spot = find("limp-responses", "SB_vs_BB_iso");
      return of("limp-responses", "SB_vs_BB_iso", { fold, call, raise: raise("raise", size(spot, "raise_size_bb", 10.5)) });
    }
    if (raises.length === 2 && pos === "BB") {
      const spot = find("limp-responses", "BB_vs_SB_limp_reraise");
      return of("limp-responses", "BB_vs_SB_limp_reraise", { fold, call, four_bet: raise("four_bet", size(spot, "four_bet_size_bb", 24)) });
    }
    if (raises.length === 3 && pos === "SB") return of("limp-deep-responses", "SB_vs_BB_limp_four_bet", { fold, call, all_in: raise("all_in", STACK_BB) });
    if (raises.length === 4 && pos === "BB") return of("limp-deep-responses", "BB_vs_SB_limp_five_bet", { fold, call });
    return { source: null, rows: null, map: {} };
  }

  // Unopened.
  if (!raises.length) {
    if (pos === "BB") return { source: null, rows: null, map: {} };
    const spot = find("opening-ranges", `${pos}_open`);
    const map: Record<string, PreflopAction> = { fold, open: raise("open", size(spot, "open_size_bb", openSizeFor(pos))) };
    if (pos === "SB") map.limp = { type: "call", to: sbCompleteToBb, key: "limp" };
    return of("opening-ranges", `${pos}_open`, map);
  }

  const [open, second, third, fourth] = raises;
  const opener = open.pos;
  if (raises.length === 1) {
    if (!s.callers.length) {
      const spot = find("preflop-ranges", `${pos}_vs_${opener}`);
      return of("preflop-ranges", `${pos}_vs_${opener}`, { fold, call, three_bet: raise("three_bet", size(spot, "three_bet_size_bb", bet * 3)) });
    }
    if (s.callers.length === 1) {
      const id = `${pos}_vs_${opener}_${s.callers[0]}call`;
      const spot = find("multiway-responses", id);
      return of("multiway-responses", id, { fold, call, squeeze: raise("squeeze", size(spot, "squeeze_size_bb", 13)) });
    }
    return { source: null, rows: null, map: {} };
  }

  // The bounded multiway catalog owns these histories, including cold-4bet
  // and squeeze continuations. No original-opener HU response is reused here.
  const continuation = lookup === undefined ? continuationDecisionForEvents(s.events) : null;
  if (continuation && continuation.hero === pos) {
    const map: Record<string, PreflopAction> = { fold, call };
    for (const key of continuation.legal_actions) if (key === "four_bet" || key === "all_in") {
      map[key] = raise(key, continuation.action_sizes_bb[key]!);
    }
    return of(continuation.dataset, continuation.id, map);
  }

  if (second.kind === "squeeze") {
    if (raises.length !== 2) return { source: null, rows: null, map: {} };
    const squeezer = second.pos, caller = open.callers?.[0];
    if (!caller) return { source: null, rows: null, map: {} };
    if (pos === opener) {
      const id = `${opener}_vs_${squeezer}_squeeze_${caller}call`;
      const spot = find("squeeze-responses", id);
      return of("squeeze-responses", id, { fold, call, four_bet: raise("four_bet", size(spot, "four_bet_size_bb", 26)) });
    }
    if (pos === caller) {
      const openerResponse = s.folded.has(opener) ? "fold" : "call";
      const id = `${caller}_vs_${squeezer}_squeeze_${opener}${openerResponse}`;
      const spot = find("squeeze-responses", id);
      return of("squeeze-responses", id, { fold, call, four_bet: raise("four_bet", size(spot, "four_bet_size_bb", 26)) });
    }
    return { source: null, rows: null, map: {} };
  }

  // 3bet by T over the open (no flat caller in between: that is a squeeze).
  const threeBettor = second.pos;
  if (raises.length === 2) {
    if (pos === opener) {
      const id = `${opener}_vs_${threeBettor}_three_bet`;
      const spot = find("three-bet-responses", id);
      return of("three-bet-responses", id, { fold, call, four_bet: raise("four_bet", size(spot, "four_bet_size_bb", 20)) });
    }
    const id = `${pos}_vs_${threeBettor}_3bet_${opener}open`;
    const spot = find("cold-three-bet-responses", id);
    return of("cold-three-bet-responses", id, { fold, call, four_bet: raise("four_bet", size(spot, "four_bet_size_bb", 26)) });
  }
  if (raises.length === 3 && third.pos === opener && pos === threeBettor) {
    return of("four-bet-responses", `${threeBettor}_vs_${opener}_four_bet`, { fold, call, all_in: raise("all_in", STACK_BB) });
  }
  if (raises.length === 4 && third.pos === opener && fourth.pos === threeBettor && pos === opener) {
    return of("five-bet-responses", `${opener}_vs_${threeBettor}_five_bet`, { fold, call });
  }
  return { source: null, rows: null, map: {} };
}

// Players who would contest the pot if `pos` calls now.
function contendersAfterCall(s: PreflopState, pos: Position) {
  const set = new Set([...s.voluntary].filter(p => !s.folded.has(p)));
  set.add(pos);
  return set.size;
}

export type Choice = { action: PreflopAction; freq: number };

// The offered actions for `pos` with their saved frequency for `hand`, after the table rules.
export function preflopOptions(s: PreflopState, pos: Position, hand: string, lookup?: DatasetLookup) {
  const sit = situation(s, pos, lookup);
  const row = sit.rows?.hands?.find((item: any) => item.hand === hand) ?? null;
  const bet = currentBet(s);
  const facing = bet > contribution(s, pos);
  const callBlocked = facing && contendersAfterCall(s, pos) > 2;
  if (!row) {
    // No saved data: fold (or check when nothing is owed).
    const action: PreflopAction = facing ? { type: "fold", key: "fold" } : { type: "check", key: "check" };
    return { source: sit.source, choices: [{ action, freq: 100 }], tableRule: "no_data" as const, callBlocked };
  }
  let tableRule: null | "no_multiway" = null;
  const choices: Choice[] = [];
  let foldExtra = 0;
  for (const [key, action] of Object.entries(sit.map)) {
    const freq = Number(row[key]) || 0;
    if (action.type === "call" && action.key === "call" && callBlocked) {
      if (freq > 0) tableRule = "no_multiway";
      foldExtra += freq;
      continue;
    }
    choices.push({ action, freq });
  }
  const foldChoice = choices.find(choice => choice.action.type === "fold");
  if (foldChoice) foldChoice.freq += foldExtra;
  else if (foldExtra > 0) choices.push({ action: { type: "fold", key: "fold" }, freq: foldExtra });
  return { source: sit.source, choices, tableRule, callBlocked };
}

export function applyPreflop(s: PreflopState, pos: Position, action: PreflopAction): PreflopState {
  const next: PreflopState = { ...s, committed: { ...s.committed }, folded: new Set(s.folded), acted: new Set(s.acted),
    voluntary: new Set(s.voluntary), events: [...s.events], raises: [...s.raises], callers: [...s.callers] };
  const bet = currentBet(s);
  if (action.type === "fold") next.folded.add(pos);
  else if (action.type === "call") {
    const to = action.key === "limp" ? (action.to ?? sbCompleteToBb) : Math.min(STACK_BB, bet);
    next.committed[pos] = to;
    next.voluntary.add(pos);
    if (action.key === "limp") next.limper = pos;
    else if (next.raises.length) next.callers.push(pos);
  } else if (action.type === "raise") {
    const to = Math.min(STACK_BB, action.to ?? bet);
    const kind = action.key === "squeeze" ? "squeeze" : action.key;
    // Remember who flatted the open before a squeeze (squeeze-responses are keyed by them).
    if (next.raises.length === 1) next.raises[0] = { ...next.raises[0], callers: [...next.callers] };
    next.committed[pos] = to;
    next.voluntary.add(pos);
    next.raises.push({ pos, to, kind });
    next.callers = [];
    next.acted = new Set();
  }
  next.acted.add(pos);
  next.events.push({ pos, type: action.type, to: next.committed[pos] ?? 0, key: action.key });
  return next;
}

export const preflopPot = (s: PreflopState) => round(Object.values(s.committed).reduce((sum, value) => sum + value, 0));
export const alivePositions = (s: PreflopState) => POSITIONS.filter(pos => !s.folded.has(pos));
