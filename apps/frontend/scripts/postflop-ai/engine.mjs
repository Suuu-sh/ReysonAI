// Chip bookkeeping and street flow shared by the simulation and the per-hand EV.
// Bets and raises are capped by the remaining stack (all-in); once a player is all-in the
// turn and river are only dealt.
import { evaluate } from "../lib/equity.mjs";
import { gameConfig } from "../../src/estimated/sizing.ts";
import { LATER_NODES, STREETS, betFraction, streetState } from "./later-tree.mjs";
import { facingNode, flopBetFraction, raiseNodeAfter } from "./tree.mjs";

const round = value => Math.round(value * 100) / 100;
export const rake = pot => Math.min(pot * gameConfig.rake.rate, gameConfig.rake.cap_bb);

export function createTable(spot) {
  const { ip, oop } = spot;
  const table = {
    spot, other: seat => seat === ip ? oop : ip,
    stacks: { [ip]: spot.stackBb, [oop]: spot.stackBb }, invested: { [ip]: 0, [oop]: 0 },
    pot: spot.potBb, winner: null, lastAggressor: null,
    // Decision log for the computed defence (defence.mjs): one entry per decision asked, in order
    // ({ seat, node, street, boardLen, line, pot: pot before the decision, action }; `action` stays null
    // while the decision is pending), and the actions taken so far on each street.
    log: [], path: { flop: [], turn: [], river: [] },
  };
  table.put = (seat, amount) => {
    const value = round(Math.min(table.stacks[seat], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid wager");
    table.stacks[seat] = round(table.stacks[seat] - value);
    table.invested[seat] = round(table.invested[seat] + value);
    table.pot = round(table.pot + value);
    return value;
  };
  return table;
}

// Flop betting for the spot's tree. `decide(seat, node, step)` returns the action at the
// step-th flop decision (step counts decisions, in order).
export function playFlop(table, tree, decide, config) {
  const { ip, oop } = table.spot;
  table.lastAggressor = null;
  table.log = []; table.path = { flop: [], turn: [], river: [] };
  let step = 0;
  const ask = (seat, node) => {
    const entry = { seat, node, street: "flop", boardLen: 3, line: null, pot: table.pot, index: table.path.flop.length, action: null };
    table.log.push(entry);
    const action = decide(seat, node, step++);
    entry.action = action;
    table.path.flop.push(action);
    return action;
  };
  // A wager that would commit at least the merge ratio of the remaining effective stack
  // becomes all-in (the same rule as the turn/river; matters at low SPR).
  const cap = seat => Math.min(table.stacks[seat], table.stacks[table.other(seat)] + table.invested[table.other(seat)] - table.invested[seat]);
  const wager = (seat, amount) => {
    const limit = cap(seat);
    return table.put(seat, amount >= limit * config.later_all_in_merge_ratio ? limit : amount);
  };
  const betLine = (bettor, action) => {
    const caller = table.other(bettor), role = bettor === ip ? "ip" : "oop";
    const bet = wager(bettor, table.pot * flopBetFraction(action));
    const response = ask(caller, facingNode(role, action));
    if (response === "fold") { table.winner = bettor; return; }
    if (response === "call" || !cap(caller) || table.invested[caller] + cap(caller) <= table.invested[bettor]) {
      table.put(caller, table.invested[bettor] - table.invested[caller]); table.lastAggressor = bettor; return;
    }
    wager(caller, round(bet * config.flop_check_raise_multiplier) - table.invested[caller]);
    if (ask(bettor, raiseNodeAfter(role)) === "fold") table.winner = caller;
    else { table.put(bettor, table.invested[caller] - table.invested[bettor]); table.lastAggressor = caller; }
  };
  if (tree === "oop_leads") {
    const lead = ask(oop, "oop_first");
    if (lead !== "check") { betLine(oop, lead); return; }
  }
  const first = ask(ip, "btn_first");
  if (first !== "check") betLine(ip, first);
}

// Fixed turn/river continuation. `chooseCont(seat, board, facingBet)` returns check/bet or fold/call.
export function playLaterStreets(table, flop, runout, chooseCont, config) {
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
export function playLaterStreetsWithPolicy(table, flop, runout, decide, config, flopLine = table.lastAggressor) {
  const { ip, oop } = table.spot;
  if (![null, ip, oop].includes(flopLine)) throw new Error("Invalid flop line aggressor");
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
    const committed = { [ip]: 0, [oop]: 0 }, actions = [];
    const put = (seat, amount) => { committed[seat] = round(committed[seat] + table.put(seat, amount)); };
    const cap = seat => Math.min(table.stacks[seat], table.stacks[table.other(seat)] + committed[table.other(seat)] - committed[seat]);
    const wager = (seat, amount) => {
      const limit = cap(seat);
      put(seat, amount >= limit * mergeRatio ? limit : amount);
    };
    let aggressor = null;
    let state = streetState(street, actions);
    table.path[street] = actions;
    while (!state.end) {
      const seat = table.spot[state.role], other = table.other(seat);
      const line = previousAggressor === null ? "checked" : previousAggressor === seat ? "aggressor" : "defender";
      const entry = { seat, node: state.node, street, boardLen: board.length, line, pot: table.pot, index: actions.length, action: null };
      table.log.push(entry);
      let action = decide(seat, state.node, board, line);
      if (!LATER_NODES[state.node].includes(action)) throw new Error(`Illegal later action at ${state.node}`);
      // A fixed rule table still has a raise key when facing a capped all-in. Collapse
      // that choice into call: it cannot reopen action or let an all-in player fold.
      if (action === "raise" && !table.stacks[other]) action = "call";
      if (action === "allin" || action.startsWith("bet")) {
        wager(seat, action === "allin" ? cap(seat) : round(table.pot * betFraction(street, action)));
        aggressor = seat;
      } else if (action === "raise") {
        const raiseBy = round(committed[other] * multiplier - committed[seat]);
        if (committed[seat] + cap(seat) <= committed[other]) action = "call";
        else { wager(seat, raiseBy); aggressor = seat; }
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
export function settle(table, hands, board) {
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
