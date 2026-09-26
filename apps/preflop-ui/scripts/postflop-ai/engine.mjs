// Chip bookkeeping and street flow shared by the simulation and the per-hand EV.
// Bets and raises are capped by the remaining stack (all-in); once a player is all-in the
// turn and river are only dealt.
import { evaluate } from "../lib/equity.mjs";
import { gameConfig } from "../../src/estimated/sizing.js";

const round = value => Math.round(value * 100) / 100;
export const rake = pot => Math.min(pot * gameConfig.rake.rate, gameConfig.rake.cap_bb);

export function createTable(spot) {
  const { ip, oop } = spot;
  const table = {
    spot, other: seat => seat === ip ? oop : ip,
    stacks: { [ip]: spot.stackBb, [oop]: spot.stackBb }, invested: { [ip]: 0, [oop]: 0 },
    pot: spot.potBb, winner: null,
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
  let step = 0;
  const fraction = action => action === "bet33" ? config.flop_bet_fractions[0] : config.flop_bet_fractions[1];
  const betLine = (bettor, action, facing, raiseNode) => {
    const caller = table.other(bettor);
    const bet = table.put(bettor, table.pot * fraction(action));
    const response = decide(caller, action === "bet33" ? facing[0] : facing[1], step++);
    if (response === "fold") { table.winner = bettor; return; }
    if (response === "call") { table.put(caller, bet); return; }
    const raiseTo = Math.min(table.stacks[caller] + table.invested[caller], round(bet * config.flop_check_raise_multiplier));
    table.put(caller, raiseTo - table.invested[caller]);
    if (decide(bettor, raiseNode, step++) === "fold") table.winner = caller;
    else table.put(bettor, table.invested[caller] - table.invested[bettor]);
  };
  if (tree === "oop_leads") {
    const lead = decide(oop, "oop_first", step++);
    if (lead !== "check") { betLine(oop, lead, ["ip_vs_33", "ip_vs_75"], "oop_vs_raise"); return; }
  }
  const first = decide(ip, "btn_first", step++);
  if (first !== "check") betLine(ip, first, ["bb_vs_33", "bb_vs_75"], "btn_vs_raise");
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
