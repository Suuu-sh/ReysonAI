import type { PilotConfig, Position, PreviousLine, Street } from "./types.ts";
import type { Spot } from "./spots.ts";
import type { ActionObservation } from "./observable-actions.mjs";
export type DecisionLog = { seat: Position; node: string; street: Street; boardLen: number; line: PreviousLine | null;
  pot: number; index: number; action: string | null; canRaise?: boolean; observation?: ActionObservation };
export type ActionPaths = Record<Street, string[]>;
export type Table = { spot: Spot; other: (seat: string) => Position; stacks: Record<string, number>; invested: Record<string, number>;
  pot: number; winner: Position | "tie" | null; lastAggressor: Position | null; log: DecisionLog[]; path: ActionPaths;
  put: (seat: string, amount: number) => number };

// Chip bookkeeping and street flow shared by the simulation and the per-hand EV.
// Bets and raises are capped by the remaining stack (all-in); once a player is all-in the
// turn and river are only dealt.
import { evaluate } from "../lib/equity.ts";
import { gameConfig } from "../../src/estimated/sizing.ts";
import { LATER_NODES, STREETS, betFraction, streetState } from "./later-tree.ts";
import { NODES, facingNode, flopBetFraction, raiseNode } from "./tree.ts";
import { actionProjection, usesObservableActions } from "./observable-actions.mjs";

const round = (value: number): number => Math.round(value * 100) / 100;
export const rake = (pot: number): number => Math.min(pot * gameConfig.rake.rate, gameConfig.rake.cap_bb);

export function createTable(spot: Spot): Table {
  const { ip, oop } = spot;
  const table: Omit<Table, "put"> & Partial<Pick<Table, "put">> = {
    spot, other: (seat: string) => seat === ip ? oop : ip,
    stacks: { [ip]: spot.stackBb, [oop]: spot.stackBb }, invested: { [ip]: 0, [oop]: 0 },
    pot: spot.potBb, winner: null, lastAggressor: null,
    // Decision log for the computed defence (defence.mjs): one entry per decision asked, in order
    // ({ seat, node, street, boardLen, line, pot: pot before the decision, action }; `action` stays null
    // while the decision is pending), and the actions taken so far on each street.
    log: [], path: { flop: [], turn: [], river: [] },
  };
  table.put = (seat: string, amount: number) => {
    const value = round(Math.min(table.stacks[seat], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid wager");
    table.stacks[seat] = round(table.stacks[seat] - value);
    table.invested[seat] = round(table.invested[seat] + value);
    table.pot = round(table.pot + value);
    return value;
  };
  return table as Table;
}

// Flop betting for the spot's tree. `decide(seat, node, step)` returns the action at the
// step-th flop decision (step counts decisions, in order).
export function playFlop(table: Table, tree: string, decide: (seat: Position, node: string, step: number) => string, config: PilotConfig) {
  const { ip, oop } = table.spot;
  table.lastAggressor = null;
  table.log = []; table.path = { flop: [], turn: [], river: [] };
  let step = 0;
  // A wager that would commit at least the merge ratio of the remaining effective stack
  // becomes all-in (the same rule as the turn/river; matters at low SPR).
  const cap = (seat: string) => Math.min(table.stacks[seat], table.stacks[table.other(seat)] + table.invested[table.other(seat)] - table.invested[seat]);
  // Raising needs chips beyond the call and an opponent who is not all-in. When it is impossible the
  // decision is recorded with `canRaise: false` and a requested raise plays (and is recorded) as a call.
  const canRaise = (seat: string) => table.stacks[table.other(seat)] > 0 && table.invested[seat] + cap(seat) > table.invested[table.other(seat)];
  const ask = (seat: Position, node: string): string => {
    const entry: DecisionLog = { seat, node, street: "flop", boardLen: 3, line: null, pot: table.pot, index: table.path.flop.length, action: null, canRaise: canRaise(seat) };
    if (usesObservableActions(table.spot)) entry.observation = actionProjection({ street: "flop", node,
      role: seat === ip ? "ip" : "oop", pot: table.pot, tree, config,
      stacks: { ip: table.stacks[ip], oop: table.stacks[oop] },
      committed: { ip: table.invested[ip], oop: table.invested[oop] } });
    table.log.push(entry);
    let action = decide(seat, node, step++);
    if (!(NODES[node] as readonly string[]).includes(action)) throw new Error(`Illegal flop action at ${node}`);
    if (entry.observation) action = entry.observation.byAction[action].action;
    else if (action === "raise" && !entry.canRaise) action = "call";
    entry.action = action;
    table.path.flop.push(action);
    return action;
  };
  const wager = (seat: string, amount: number) => {
    const limit = cap(seat);
    return table.put(seat, amount >= limit * config.later_all_in_merge_ratio ? limit : amount);
  };
  // bet -> (fold | call | raise -> (fold | call | raise -> ...)): the raiser's total is the multiplier times
  // the facing total, until a player folds or calls (the last allowed raise's node offers only fold/call).
  const betLine = (bettor: Position, action: string) => {
    const role = bettor === ip ? "ip" : "oop";
    wager(bettor, table.pot * flopBetFraction(action));
    let aggressor = bettor;
    for (let raises = 0; ; raises++) {
      const seat = table.other(aggressor);
      const response = ask(seat, raises ? raiseNode(raises, role) : facingNode(role, action));
      if (response === "fold") { table.winner = aggressor; return; }
      if (response === "call") {
        table.put(seat, table.invested[aggressor] - table.invested[seat]); table.lastAggressor = aggressor; return;
      }
      wager(seat, round(table.invested[aggressor] * config.flop_check_raise_multiplier) - table.invested[seat]);
      aggressor = seat;
    }
  };
  if (tree === "oop_leads") {
    const lead = ask(oop, "oop_first");
    if (lead !== "check") { betLine(oop, lead); return; }
  }
  const first = ask(ip, "btn_first");
  if (first !== "check") betLine(ip, first);
}

// Fixed turn/river continuation. `chooseCont(seat, board, facingBet)` returns check/bet or fold/call.
export function playLaterStreets(table: Table, flop: readonly number[], runout: readonly number[], chooseCont: (seat: Position, board: number[], facingBet: boolean) => string, config: PilotConfig) {
  const { ip, oop } = table.spot;
  for (let street = 0; street < 2 && !table.winner; street++) {
    if (!table.stacks[ip] || !table.stacks[oop]) break;
    const board = [...flop, ...runout.slice(0, street + 1)];
    if (chooseCont(oop, board, false) === "bet") {
      const amount = table.put(oop, Math.min(table.pot * config.continuation_bet_fraction, table.stacks[ip]));
      if (chooseCont(ip, board, true) === "fold") table.winner = oop;
      else table.put(ip, amount);
    } else if (chooseCont(ip, board, false) === "bet") {
      const amount = table.put(ip, Math.min(table.pot * config.continuation_bet_fraction, table.stacks[oop]));
      if (chooseCont(oop, board, true) === "fold") table.winner = ip;
      else table.put(oop, amount);
    }
  }
}

// flopLine is the last called flop aggressor's seat (or null for check/check), as recorded
// by playFlop. Each decision receives that prior street's line from its own perspective;
// current-street aggression cannot change it until the next street starts.
export function playLaterStreetsWithPolicy(table: Table, flop: readonly number[], runout: readonly number[], decide: (seat: Position, node: string, board: number[], line: PreviousLine) => string, config: PilotConfig, flopLine: Position | null = table.lastAggressor) {
  const { ip, oop } = table.spot;
  if (!([null, ip, oop] as readonly (string | null)[]).includes(flopLine)) throw new Error("Invalid flop line aggressor");
  let previousAggressor = flopLine;
  for (const [index, street] of STREETS.entries()) {
    if (table.winner || !table.stacks[ip] || !table.stacks[oop]) break;
    const board = [...flop, ...runout.slice(0, index + 1)];
    const multiplier = config.later_raise_multiplier, mergeRatio = config.later_all_in_merge_ratio;
    if (!Number.isFinite(multiplier) || multiplier < 2 || !Number.isFinite(mergeRatio) || mergeRatio <= 0 || mergeRatio > 1) {
      throw new Error("Invalid later street sizing");
    }
    // Wagers are street-local: invested includes earlier streets and must not be used
    // as the raise-to amount. Cap at the effective stack (no heads-up side pot), and merge a
    // wager that would commit at least `mergeRatio` of the seat's remaining stack into all-in.
    const committed = { [ip]: 0, [oop]: 0 }, actions: string[] = [];
    const put = (seat: string, amount: number) => { committed[seat] = round(committed[seat] + table.put(seat, amount)); };
    const cap = (seat: string) => Math.min(table.stacks[seat], table.stacks[table.other(seat)] + committed[table.other(seat)] - committed[seat]);
    const wager = (seat: string, amount: number) => {
      const limit = cap(seat);
      put(seat, amount >= limit * mergeRatio ? limit : amount);
    };
    let aggressor: Position | null = null;
    let state = streetState(street, actions);
    table.path[street] = actions;
    while (!state.end) {
      const seat = table.spot[state.role], other = table.other(seat);
      const line = previousAggressor === null ? "checked" : previousAggressor === seat ? "aggressor" : "defender";
      const entry: DecisionLog = { seat, node: state.node, street, boardLen: board.length, line, pot: table.pot, index: actions.length, action: null };
      table.log.push(entry);
      // Raising needs an opponent who is not all-in and chips beyond the call.
      entry.canRaise = table.stacks[other] > 0 && committed[seat] + cap(seat) > committed[other];
      if (usesObservableActions(table.spot)) entry.observation = actionProjection({ street, node: state.node,
        role: state.role, pot: table.pot, tree: table.spot.tree, config,
        stacks: { ip: table.stacks[ip], oop: table.stacks[oop] },
        committed: { ip: committed[ip], oop: committed[oop] } });
      let action = decide(seat, state.node, board, line);
      if (!(LATER_NODES[state.node] as readonly string[]).includes(action)) throw new Error(`Illegal later action at ${state.node}`);
      // A fixed rule table still has a raise key when facing a capped all-in. Collapse
      // that choice into call: it cannot reopen action or let an all-in player fold.
      if (entry.observation) action = entry.observation.byAction[action].action;
      else if (action === "raise" && !entry.canRaise) action = "call";
      if (action === "allin" || action.startsWith("bet")) {
        wager(seat, action === "allin" ? cap(seat) : round(table.pot * betFraction(street, action)));
        aggressor = seat;
      } else if (action === "raise") {
        wager(seat, round(committed[other] * multiplier - committed[seat])); aggressor = seat;
      }
      if (action === "call") put(seat, round(committed[other] - committed[seat]));
      entry.action = action;
      actions.push(action);
      state = streetState(street, actions);
    }
    if (state.end.winner) table.winner = table.spot[state.end.winner];
    // Only a called bet/raise records an aggressor. Check/check clears the prior line.
    table.lastAggressor = table.winner ? null : aggressor;
    previousAggressor = table.lastAggressor;
  }
}

// Showdown if needed, then the part of a bet that was never called is returned before the
// pot is raked or awarded (folds on every street, including a folded check-raise).
export function settle(table: Table, hands: Record<string, readonly number[]>, board: readonly number[]) {
  const { ip, oop } = table.spot;
  if (!table.winner) {
    const ipValue = evaluate([...hands[ip], ...board]), oopValue = evaluate([...hands[oop], ...board]);
    table.winner = ipValue === oopValue ? "tie" : ipValue > oopValue ? ip : oop;
  }
  const high = table.invested[ip] >= table.invested[oop] ? ip : oop;
  const excess = round(table.invested[high] - table.invested[table.other(high)]);
  if (excess > 0) {
    table.invested[high] = round(table.invested[high] - excess);
    table.stacks[high] = round(table.stacks[high] + excess);
    table.pot = round(table.pot - excess);
  }
  return table.winner;
}
