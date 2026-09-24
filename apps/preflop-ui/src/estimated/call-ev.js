// Shared generation / facts / audit model. No local facts or UI dependencies.
import { equityRealization } from "./eqr.js";
import { raked } from "./rake.js";
import { openSizeFor } from "./sizing.js";

export const CALL_EQUITY_VERSION = 1;
export const CALL_EQUITY_SAMPLES = 12000;
export const CALL_EQUITY_SEED = "call-equity-v1|spot|hand";
const blind = { SB: 0.5, BB: 1 };
const byHand = spot => new Map(spot.hands.map(row => [row.hand, row]));
const range = (spot, weight) => spot.hands.map(row => [row.hand, weight(row)]).filter(([, w]) => w > 0);

export function callContexts({ opening, responses, threeBets, fourBets, multiway, limp }) {
  const opens = new Map(opening.spots.map(s => [s.hero, s]));
  const response = (opener, hero) => responses.spots.find(s => s.opener === opener && s.hero === hero);
  const contexts = [];
  function add(type, spot, opponents, cost, pot, ranges, reach = () => 1, toSize) {
    const hero = spot.hero;
    const allIn = toSize >= spot.effective_stack_bb;
    const input = { hero, opponents, cost_to_call: cost, total_pot_after_call: pot, all_in: allIn, ranges };
    contexts.push({ type, spot, input, reach });
  }
  for (const spot of responses?.spots ?? []) {
    const size = spot.open_size_bb ?? openSizeFor(spot.opener);
    const dead = 1.5 - (blind[spot.hero] ?? 0) - (blind[spot.opener] ?? 0);
    add("response", spot, [spot.opener], size - (blind[spot.hero] ?? 0), 2 * size + dead,
      [range(opens.get(spot.opener), row => row.open / 100)], undefined, size);
  }
  for (const spot of threeBets?.spots ?? []) {
    const open = byHand(opens.get(spot.opener));
    const dead = 1.5 - (blind[spot.hero] ?? 0) - (blind[spot.three_bettor] ?? 0);
    add("three_bet", spot, [spot.three_bettor], spot.three_bet_size_bb - (spot.open_size_bb ?? openSizeFor(spot.opener)),
      2 * spot.three_bet_size_bb + dead, [range(response(spot.opener, spot.three_bettor), row => row.three_bet / 100)],
      hand => open.get(hand).open / 100, spot.three_bet_size_bb);
  }
  for (const spot of fourBets?.spots ?? []) {
    const open = byHand(opens.get(spot.opener));
    const source = byHand(response(spot.opener, spot.hero));
    const previous = threeBets.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.hero);
    const dead = 1.5 - (blind[spot.hero] ?? 0) - (blind[spot.opener] ?? 0);
    add("four_bet", spot, [spot.opener], spot.four_bet_size_bb - spot.three_bet_size_bb,
      2 * spot.four_bet_size_bb + dead, [range(previous, row => open.get(row.hand).open / 100 * row.four_bet / 100)],
      hand => source.get(hand).three_bet / 100, spot.four_bet_size_bb);
  }
  for (const spot of multiway?.spots ?? []) {
    const size = spot.open_size_bb;
    const participants = [spot.hero, spot.opener, ...spot.callers];
    const dead = 1.5 - participants.reduce((n, p) => n + (blind[p] ?? 0), 0);
    add("multiway", spot, [spot.opener, ...spot.callers], size - (blind[spot.hero] ?? 0),
      participants.length * size + dead,
      [range(opens.get(spot.opener), row => row.open / 100), ...spot.callers.map(p => range(response(spot.opener, p), row => row.call / 100))],
      undefined, size);
  }
  for (const spot of limp?.spots.filter(s => s.id === "SB_vs_BB_iso") ?? []) {
    const open = byHand(opens.get("SB"));
    const iso = limp.spots.find(s => s.id === spot.source_limp_response_id);
    add("iso_response", spot, [spot.opponent], spot.iso_size_bb - spot.open_size_bb, 2 * spot.iso_size_bb,
      [range(iso, row => row.raise / 100)], hand => open.get(hand).limp / 100, spot.iso_size_bb);
  }
  return contexts;
}

export function validCallEquities(table, context) {
  const entry = table?.spots?.[context.spot.id];
  return table?.version === CALL_EQUITY_VERSION && table.samples === CALL_EQUITY_SAMPLES && table.seed === CALL_EQUITY_SEED &&
    JSON.stringify(entry?.input) === JSON.stringify(context.input) &&
    context.spot.hands.every(({ hand }) => Number.isFinite(entry.equities?.[hand]) && entry.equities[hand] >= 0 && entry.equities[hand] <= 1);
}
export function callFacts(context, hand, equity) {
  if (!Number.isFinite(equity) || equity < 0 || equity > 1) throw new Error(`Invalid equity: ${hand}`);
  const { hero, opponents, cost_to_call: cost, total_pot_after_call: pot, all_in: allIn } = context.input;
  const eqr = equityRealization(hand, hero, opponents, { allIn });
  return { eqr, realized_equity_pct: equity * eqr * 100, call_ev_bb: equity * eqr * raked(pot) - cost };
}
export function allowedCall(call, ev) {
  if (!Number.isFinite(ev)) throw new Error("Call EV must be finite");
  return ev < -0.05 ? 0 : ev < 0.05 ? Math.min(call, 50) : call;
}

// Generation-time target: besides removing -EV calls, fill clearly +EV hands.
// `available` is the non-raise share (call + fold); raise frequencies never change.
export function targetCall(call, ev, available) {
  if (!Number.isFinite(available) || available < call) throw new Error("Invalid available call share");
  if (ev >= 0.10) return available;
  if (ev >= 0.05) return Math.max(call, Math.round(available / 2 / 5) * 5);
  return allowedCall(call, ev);
}

// Optimistic upper bound with every legal call filled, keeping all raises fixed.
// An auto-profit warning is unavoidable if even this bound cannot defend enough.
export function callDefenseCapacity(context, table) {
  let total = 0, folds = 0;
  for (const row of context.spot.hands) {
    const combos = row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12;
    const weight = combos * context.reach(row.hand);
    const ev = callFacts(context, row.hand, table.spots[context.spot.id].equities[row.hand]).call_ev_bb;
    const aggressive = 100 - row.fold - row.call;
    const maxCall = allowedCall(100 - aggressive, ev);
    total += weight;
    folds += weight * (100 - aggressive - maxCall) / 100;
  }
  return total ? { minimumFoldRate: folds / total, maximumContinuationPct: (1 - folds / total) * 100 } : null;
}
