// Three-player-origin SRP state machine. No HU policy/defence imports and no side pots.
// The original seats/roles survive a fold: a three-player origin never becomes a HU policy.
import { evaluateContinuation } from "../lib/continuation-evaluator.mjs";
import { MW3_SEAT_ORDER } from "./mw3-spots.mjs";
export const MW3_SIZING = Object.freeze({ bets: Object.freeze({ bet33: 0.33, bet75: 0.75, bet125: 1.25 }),
  raiseMultiplier: 3, maxRaisesPerStreet: 2, allInMergeRatio: 0.67 });
export const MW3_STREETS = Object.freeze(["flop", "turn", "river"]);
const cents = value => Math.round(value * 100);
const round = value => cents(value) / 100;
const sum = values => values.reduce((a, b) => a + b, 0);
const finiteChips = value => Number.isFinite(value) && value >= 0 && Math.abs(round(value) - value) < 1e-9;
const live = table => table.seats.filter(seat => !table.folded.includes(seat));
export const mw3PriceBand = price => price <= 0.20 ? "cheap" : price <= 1 / 3 ? "standard" : "expensive";
export const mw3SprBand = spr => spr <= 1 ? "shallow" : spr <= 3 ? "medium" : "deep";

export function createMw3Table(spot) {
  const seats = spot?.seats;
  if (spot?.kind !== "mw3_srp" || !Array.isArray(seats) || seats.length !== 3 || new Set(seats).size !== 3 ||
      seats.some(seat => !MW3_SEAT_ORDER.includes(seat)) || seats.join() !== MW3_SEAT_ORDER.filter(seat => seats.includes(seat)).join() ||
      !finiteChips(spot.stackBb) || spot.stackBb <= 0 || !finiteChips(spot.potBb) || spot.potBb <= 0 ||
      spot.stacks !== undefined) throw new Error("Invalid mw3 table geometry; equal stacks and no side pots required");
  return { kind: "mw3_srp", spot, seats: [...seats],
    stacks: Object.fromEntries(seats.map(seat => [seat, spot.stackBb])),
    invested: Object.fromEntries(seats.map(seat => [seat, 0])),
    pot: spot.potBb, initialTotal: round(spot.potBb + 3 * spot.stackBb),
    folded: [], winner: null, winners: [], lastAggressor: null,
    street: null, streetState: null, log: [], path: { flop: [], turn: [], river: [] }, settled: false };
}

function put(table, seat, amount) {
  if (!finiteChips(amount) || amount > table.stacks[seat] + 1e-9) throw new Error("Invalid mw3 wager");
  table.stacks[seat] = round(table.stacks[seat] - amount);
  table.invested[seat] = round(table.invested[seat] + amount);
  table.streetState.committed[seat] = round(table.streetState.committed[seat] + amount);
  table.pot = round(table.pot + amount);
}

export function assertMw3Conservation(table) {
  if (Math.abs(sum(Object.values(table.stacks)) + table.pot - table.initialTotal) > 1e-8 ||
      [...Object.values(table.stacks), ...Object.values(table.invested), table.pot].some(value => !finiteChips(value))) {
    throw new Error("mw3 chip conservation failed");
  }
  return true;
}

export function startMw3Street(table, street) {
  if (table.settled || table.winner || !MW3_STREETS.includes(street) ||
      MW3_STREETS.indexOf(street) !== (table.street === null ? 0 : MW3_STREETS.indexOf(table.street) + 1) ||
      table.streetState && !table.streetState.end) throw new Error("Invalid mw3 street transition");
  const previousAggressor = table.lastAggressor;
  table.street = street;
  table.streetState = { street, committed: Object.fromEntries(table.seats.map(seat => [seat, 0])),
    currentBet: 0, betAction: null, raises: 0, aggressor: null, previousAggressor,
    pending: live(table).filter(seat => table.stacks[seat] > 0), end: null };
  table.lastAggressor = null;
  if (table.streetState.pending.length < 2) {
    table.streetState.pending = [];
    table.streetState.end = { type: "all_in_runout" };
  }
  return mw3Decision(table);
}

const roleOf = (table, seat) => ["first", "middle", "last"][table.seats.indexOf(seat)];
function raiseAvailable(table, seat) {
  const state = table.streetState;
  return state.raises < MW3_SIZING.maxRaisesPerStreet && round(table.stacks[seat] + state.committed[seat]) > state.currentBet &&
    live(table).some(other => other !== seat && table.stacks[other] > 0);
}

export function mw3Decision(table) {
  const state = table.streetState;
  if (!state) throw new Error("mw3 street not started");
  if (state.end) return { end: state.end };
  const seat = state.pending[0], role = roleOf(table, seat);
  if (!seat || table.folded.includes(seat) || table.stacks[seat] <= 0) throw new Error("Invalid mw3 pending actor");
  const facing = state.currentBet > state.committed[seat];
  const behind = state.pending.length > 1 ? "behind" : "closing";
  const effectiveStack = Math.min(...live(table).map(other => table.stacks[other] + state.committed[other])) - state.committed[seat];
  // The explicit all-in action is available only where the largest fixed bet would merge.
  const lowSpr = !facing && Math.round(cents(table.pot) * 125 / 100) * 100 >= cents(effectiveStack) * 67;
  const canRaise = facing && raiseAvailable(table, seat);
  const situation = facing ? `vs_${!canRaise && state.raises < 2 ? "allin" : state.raises ? `raise${state.raises}` : state.betAction.slice(3)}_${behind}`
    : lowSpr ? "first_low_spr" : "first";
  const node = `mw3_${table.street}_${role}_${situation}`;
  const actions = facing ? ["fold", "call", ...(canRaise ? ["raise"] : [])]
    : ["check", ...Object.keys(MW3_SIZING.bets), ...(lowSpr ? ["allin"] : [])];
  const liveSeats = live(table), callBb = facing ? round(state.currentBet - state.committed[seat]) : 0;
  const potAfterCall = table.pot + callBb;
  const callPrice = facing ? callBb / (potAfterCall - Math.min(potAfterCall * 0.05, 3)) : null;
  const remainingAfterCall = Math.min(...liveSeats.map(other => round(table.stacks[other] + state.committed[other] - state.currentBet)));
  const sprAfterCall = remainingAfterCall / potAfterCall;
  const activeIndex = liveSeats.indexOf(seat);
  const activePosition = activeIndex === 0 ? "first" : activeIndex === liveSeats.length - 1 ? "last" : "middle";
  return { seat, role, node, street: table.street, actions, facing, lowSpr, raises: state.raises,
    pendingBehind: state.pending.slice(1), liveSeats, potBb: table.pot, callBb,
    stackBb: table.stacks[seat], committedBb: state.committed[seat], currentBetBb: state.currentBet,
    activePosition, players: liveSeats.length, responseType: facing ? state.committed[seat] > 0 ? "invested" : "cold" : "none",
    callPrice, priceBand: facing ? mw3PriceBand(callPrice) : "none", sprAfterCall, sprBand: mw3SprBand(sprAfterCall),
    line: state.previousAggressor === null ? "checked" : state.previousAggressor === seat ? "aggressor" : "defender" };
}

export function applyMw3Action(table, action) {
  if (table.settled) throw new Error("mw3 table already settled");
  const decision = mw3Decision(table);
  if (decision.end || !decision.actions.includes(action)) throw new Error(`Illegal mw3 action ${action} at ${decision.node ?? "terminal"}`);
  const state = table.streetState, seat = decision.seat;
  const before = table.pot, committedBefore = state.committed[seat];
  if (action === "fold") table.folded.push(seat);
  else if (action === "call") put(table, seat, decision.callBb);
  else if (action !== "check") {
    // All live seats started this street with equal remaining budgets. Any short all-in
    // would need a side pot and is rejected rather than approximated by a HU cap.
    const budgets = live(table).map(other => round(table.stacks[other] + state.committed[other]));
    if (new Set(budgets).size !== 1) throw new Error("mw3 unequal live budgets need side pots");
    const limitCents = cents(table.stacks[seat]);
    const requestedCents = action === "raise" ? cents(state.currentBet) * MW3_SIZING.raiseMultiplier - cents(committedBefore)
      : action === "allin" ? limitCents : Math.round(cents(table.pot) * Math.round(MW3_SIZING.bets[action] * 100) / 100);
    const amount = (requestedCents * 100 >= limitCents * 67 ? limitCents : Math.min(limitCents, requestedCents)) / 100;
    if (round(committedBefore + amount) <= state.currentBet) throw new Error("mw3 aggression did not increase the bet");
    put(table, seat, amount);
    state.currentBet = state.committed[seat]; state.aggressor = seat;
    if (action === "raise") state.raises++;
    else state.betAction = table.stacks[seat] === 0 ? "betallin" : action;
    const index = table.seats.indexOf(seat);
    state.pending = [...table.seats.slice(index + 1), ...table.seats.slice(0, index)]
      .filter(other => !table.folded.includes(other) && table.stacks[other] > 0 && state.committed[other] < state.currentBet);
  }
  if (["fold", "call", "check"].includes(action)) state.pending.shift();
  const entry = { ...decision, index: table.path[table.street].length, pot: before, action,
    amountBb: round(state.committed[seat] - committedBefore) };
  table.log.push(entry); table.path[table.street].push(action);
  const survivors = live(table);
  if (survivors.length === 1) {
    table.winner = survivors[0]; state.pending = []; state.end = { type: "fold", winner: table.winner };
  } else if (!state.pending.length) {
    table.lastAggressor = state.aggressor;
    state.end = { type: survivors.some(other => table.stacks[other] === 0) ? "all_in_runout" : "street_complete" };
  }
  assertMw3Conservation(table);
  return mw3Decision(table);
}

export function replayMw3(spot, paths = {}) {
  if (!paths || typeof paths !== "object" || Array.isArray(paths) || Object.keys(paths).some(key => !MW3_STREETS.includes(key))) {
    throw new Error("Invalid mw3 action path");
  }
  const table = createMw3Table(spot);
  const supplied = MW3_STREETS.filter(street => Object.hasOwn(paths, street));
  if (supplied.some((street, i) => MW3_STREETS[i] !== street)) throw new Error("Non-contiguous mw3 streets");
  for (const [index, street] of supplied.entries()) {
    if (!Array.isArray(paths[street])) throw new Error("Invalid mw3 action path");
    startMw3Street(table, street);
    for (const action of paths[street]) applyMw3Action(table, action);
    if (index < supplied.length - 1 && (table.winner || !table.streetState.end)) {
      throw new Error("Illegal mw3 later street after incomplete or terminal history");
    }
  }
  return table;
}

export function settleMw3(table, hands = {}, board = []) {
  if (table.settled || !table.streetState?.end || !table.winner && table.street !== "river" && table.streetState.end.type !== "all_in_runout") {
    throw new Error("mw3 cannot settle an unfinished hand");
  }
  // Only chips above every other seat's actual contribution are uncalled. A folded
  // player's matching chips stay in the pot and can never receive a showdown share.
  const ranked = table.seats.map(seat => [seat, table.invested[seat]]).sort((a, b) => b[1] - a[1]);
  const refundBb = round(ranked[0][1] - ranked[1][1]);
  if (refundBb) {
    const seat = ranked[0][0];
    table.invested[seat] = round(table.invested[seat] - refundBb);
    table.stacks[seat] = round(table.stacks[seat] + refundBb);
    table.pot = round(table.pot - refundBb);
  }
  const survivors = live(table);
  if (!table.winner) {
    const known = [...board, ...Object.values(hands).flat()];
    if (board.length !== 5 || known.some(card => !Number.isInteger(card) || card < 0 || card > 51) || new Set(known).size !== known.length ||
        survivors.some(seat => !Array.isArray(hands[seat]) || hands[seat].length !== 2)) throw new Error("Invalid mw3 showdown cards");
    const scores = survivors.map(seat => [seat, evaluateContinuation([...hands[seat], ...board])]);
    const best = Math.max(...scores.map(([, score]) => score));
    table.winners = scores.filter(([, score]) => score === best).map(([seat]) => seat);
    table.winner = table.winners.length === 1 ? table.winners[0] : "tie";
  } else table.winners = [table.winner];
  // Every hand in this module has seen a flop. No-flop-no-drop is a preflop concern.
  const rakeBb = Math.min(table.pot * 0.05, 3), awardBb = (table.pot - rakeBb) / table.winners.length;
  const payouts = Object.fromEntries(table.seats.map(seat => [seat, table.winners.includes(seat) ? awardBb : 0]));
  const finalStacks = Object.fromEntries(table.seats.map(seat => [seat, table.stacks[seat] + payouts[seat]]));
  table.settled = true;
  assertMw3Conservation(table);
  if (Math.abs(sum(Object.values(finalStacks)) + rakeBb - table.initialTotal) > 1e-8) throw new Error("mw3 settlement conservation failed");
  return { winner: table.winner, winners: [...table.winners], potBb: table.pot, rakeBb, refundBb, payouts, finalStacks };
}
