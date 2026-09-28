// Shared generation / facts / audit model. No local facts or UI dependencies.
import { equityRealization } from "./eqr.ts";
import { raked } from "./rake.ts";
import { openSizeFor } from "./sizing.ts";

export const CALL_EQUITY_VERSION = 1;
export const CALL_EQUITY_SAMPLES = 12000;
export const CALL_EQUITY_SEED = "call-equity-v1|spot|hand";
const blind = { SB: 0.5, BB: 1 };
const byHand = spot => new Map(spot.hands.map(row => [row.hand, row]));
const range = (spot, weight) => spot.hands.map(row => [row.hand, weight(row)]).filter(([, w]) => w > 0);

// Squeezer's auto-profit break-even: its additional investment over that plus
// the whole pot before the squeeze (open + cold call + both blinds).
export function squeezeFoldThreshold(spot) {
  const risk = spot.squeeze_size_bb - (blind[spot.squeezer] ?? 0);
  return risk / (risk + 2 * spot.open_size_bb + 1.5);
}

// SB limp-reraise break-even. SB's limp-reraise bluff risks everything beyond its 1BB limp (10.5 − 1 = 9.5)
// to win the pot before the reraise (limp 1 + iso 3.5 = 4.5): 9.5 ÷ 14 = 67.9%.
export function limpReraiseFoldThreshold(spot) {
  const risk = spot.limp_reraise_size_bb - spot.open_size_bb;
  return risk / (risk + spot.open_size_bb + spot.iso_size_bb);
}

export function callContexts({ opening, responses, threeBets, fourBets, multiway, limp, squeezes, coldThreeBets }) {
  const opens = new Map(opening.spots.map(s => [s.hero, s]));
  const response = (opener, hero) => responses.spots.find(s => s.opener === opener && s.hero === hero);
  const contexts = [];
  function add(type, spot, opponents, cost, pot, ranges, reach = () => 1, toSize, { bbBehind = false, callerBehind = false, openerBehind = false } = {}) {
    const hero = spot.hero;
    const allIn = toSize >= spot.effective_stack_bb;
    // bb_behind / caller_behind / opener_behind are recorded only when true, so older inputs keep their fingerprint.
    const input = { hero, opponents, cost_to_call: cost, total_pot_after_call: pot, all_in: allIn,
      ...(bbBehind ? { bb_behind: true } : {}), ...(callerBehind ? { caller_behind: true } : {}),
      ...(openerBehind ? { opener_behind: true } : {}), ranges };
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
    // BB (1BB) or SB (0.5BB) calls the 2.5BB open after one cold call: 1.5BB into 8BB,
    // or 2BB into 8.5BB with BB's blind dead money and BB still to act behind SB.
    const size = spot.open_size_bb;
    const participants = [spot.hero, spot.opener, ...spot.callers];
    const dead = 1.5 - participants.reduce((n, p) => n + (blind[p] ?? 0), 0);
    add("multiway", spot, [spot.opener, ...spot.callers], size - (blind[spot.hero] ?? 0),
      participants.length * size + dead,
      [range(opens.get(spot.opener), row => row.open / 100), ...spot.callers.map(p => range(response(spot.opener, p), row => row.call / 100))],
      undefined, size, { bbBehind: spot.hero === "SB" && !participants.includes("BB") });
  }
  for (const spot of limp?.spots.filter(s => s.id === "SB_vs_BB_iso") ?? []) {
    const open = byHand(opens.get("SB"));
    const iso = limp.spots.find(s => s.id === spot.source_limp_response_id);
    add("iso_response", spot, [spot.opponent], spot.iso_size_bb - spot.open_size_bb, 2 * spot.iso_size_bb,
      [range(iso, row => row.raise / 100)], hand => open.get(hand).limp / 100, spot.iso_size_bb);
  }
  // BB facing SB's limp-reraise after its own iso: 7BB more into a 21BB pot, IP.
  // Opponent range: SB's limp × limp-reraise; reach: BB's iso-raise frequency.
  for (const spot of limp?.spots.filter(s => s.id === "BB_vs_SB_limp_reraise") ?? []) {
    const open = byHand(opens.get("SB"));
    const iso = byHand(limp.spots.find(s => s.id === spot.source_limp_response_id));
    const sbIso = limp.spots.find(s => s.id === spot.source_iso_response_id);
    add("limp_reraise", spot, [spot.opponent], spot.limp_reraise_size_bb - spot.iso_size_bb, 2 * spot.limp_reraise_size_bb,
      [range(sbIso, row => open.get(row.hand).limp / 100 * row.raise / 100)], hand => iso.get(hand).raise / 100, spot.limp_reraise_size_bb);
  }
  // Facing a squeeze (S = BB or SB; with SB squeezing, BB has folded). Opponent
  // range: S's saved squeeze frequencies. The other blind is dead money.
  //   prior null:   opener, caller still behind (its 2.5BB is in the pot; CALLER_BEHIND_EQR)
  //   prior "fold": caller after the opener folded (opener's 2.5BB dead)
  //   prior "call": caller after the opener called — three-way vs S and the opener's calls
  for (const spot of squeezes?.spots ?? []) {
    const source = multiway.spots.find(s => s.id === spot.source_squeeze_id);
    const squeezeRange = range(source, row => row.squeeze / 100);
    const size = spot.squeeze_size_bb, open = spot.open_size_bb;
    const deadBlind = 1.5 - (blind[spot.squeezer] ?? 0);
    const cost = size - open;
    if (spot.prior_action === null) {
      const openRows = byHand(opens.get(spot.opener));
      add("squeeze", spot, [spot.squeezer], cost, 2 * size + open + deadBlind, [squeezeRange],
        hand => openRows.get(hand).open / 100, size, { callerBehind: true });
      continue;
    }
    const callRows = byHand(response(spot.opener, spot.caller));
    const reach = hand => callRows.get(hand).call / 100;
    if (spot.prior_action === "fold") {
      add("squeeze", spot, [spot.squeezer], cost, 2 * size + open + deadBlind, [squeezeRange], reach, size);
    } else {
      const first = squeezes.spots.find(s => s.source_squeeze_id === spot.source_squeeze_id && s.prior_action === null);
      const openRows = byHand(opens.get(spot.opener));
      add("squeeze", spot, [spot.squeezer, spot.opener], cost, 3 * size + deadBlind,
        [squeezeRange, range(first, row => openRows.get(row.hand).open / 100 * row.call / 100)], reach, size);
    }
  }
  // Cold call of a 3bet: O opened, X 3bet, Y (hero, not yet acted) calls X's
  // 3bet minus its own blind. Pot after the call: both 3bets, O's open and the
  // blinds of seats other than Y / X / O as dead money. Opponent range: X's
  // saved 3bet frequencies versus O. O (uncapped) and later seats are still to
  // act: OPENER_BEHIND_EQR. Every hand reaches (Y has not acted yet).
  for (const spot of coldThreeBets?.spots ?? []) {
    const source = response(spot.opener, spot.three_bettor);
    const size = spot.three_bet_size_bb;
    const dead = 1.5 - [spot.hero, spot.three_bettor, spot.opener].reduce((n, p) => n + (blind[p] ?? 0), 0);
    add("cold_three_bet", spot, [spot.three_bettor], size - (blind[spot.hero] ?? 0), 2 * size + spot.open_size_bb + dead,
      [range(source, row => row.three_bet / 100)], undefined, size, { openerBehind: true });
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
  const { hero, opponents, cost_to_call: cost, total_pot_after_call: pot, all_in: allIn, bb_behind: bbBehind = false,
    caller_behind: callerBehind = false, opener_behind: openerBehind = false } = context.input;
  const eqr = equityRealization(hand, hero, opponents, { allIn, bbBehind, callerBehind, openerBehind });
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

// 3bet pots (opener facing a 3bet): the EQR table may still overstate OOP
// realization there, so only clearly profitable calls are filled. At +0.50bb
// or better the whole non-4bet share calls (no fold left); below that the
// authored call stands, subject to the usual EV gate. 4bets never change.
export const THREE_BET_FILL_EV = 0.5;
export function threeBetTargetCall(call, ev, available) {
  if (!Number.isFinite(available) || available < call) throw new Error("Invalid available call share");
  return ev >= THREE_BET_FILL_EV ? available : allowedCall(call, ev);
}

// Pairs of reachable hands [stronger, weaker] whose continuation the audit's
// strength-order / suited-vs-offsuit checks keep within 10pt (A6x→A5x exempt).
const RANKS = "AKQJT98765432";
const ORDER_CHAINS = [[...RANKS].map(r => r + r), ...[...RANKS].slice(0, -1).flatMap((high, i) =>
  ["s", "o"].map(suit => [...RANKS.slice(i + 1)].map(kicker => high + kicker + suit)))];
function orderEdges(reachable) {
  const edges = [];
  for (const chain of ORDER_CHAINS) {
    const live = chain.filter(reachable);
    for (let i = 1; i < live.length; i += 1) {
      if (!(/^A6/.test(live[i - 1]) && /^A5/.test(live[i]))) edges.push([live[i - 1], live[i]]);
    }
  }
  for (let i = 0; i < RANKS.length; i += 1) for (let j = i + 1; j < RANKS.length; j += 1) {
    const suited = RANKS[i] + RANKS[j] + "s", offsuit = RANKS[i] + RANKS[j] + "o";
    if (reachable(suited) && reachable(offsuit)) edges.push([suited, offsuit]);
  }
  return edges;
}

// Optimistic upper bound with every legal call filled, keeping all raises fixed.
// An auto-profit warning is unavoidable if even this bound cannot defend enough.
// `ordered` also caps each weaker hand at its stronger neighbour + 10pt, the
// most a strategy can continue without breaking the blocking strength-order checks
// (used for squeeze responses, where equal-EV pairs differ only by sampling noise).
export function callDefenseCapacity(context, table, { ordered = false } = {}) {
  const maxContinue = new Map(), weights = new Map();
  for (const row of context.spot.hands) {
    const combos = row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12;
    const ev = callFacts(context, row.hand, table.spots[context.spot.id].equities[row.hand]).call_ev_bb;
    const aggressive = 100 - row.fold - row.call;
    weights.set(row.hand, combos * context.reach(row.hand));
    maxContinue.set(row.hand, aggressive + allowedCall(100 - aggressive, ev));
  }
  if (ordered) {
    const edges = orderEdges(hand => weights.get(hand) > 0);
    for (let changed = true; changed;) {
      changed = false;
      for (const [strong, weak] of edges) {
        const row = context.spot.hands.find(r => r.hand === weak);
        const cap = Math.max(100 - row.fold - row.call, maxContinue.get(strong) + 10);
        if (maxContinue.get(weak) > cap) { maxContinue.set(weak, cap); changed = true; }
      }
    }
  }
  let total = 0, folds = 0;
  for (const [hand, weight] of weights) {
    total += weight;
    folds += weight * (100 - maxContinue.get(hand)) / 100;
  }
  return total ? { minimumFoldRate: folds / total, maximumContinuationPct: (1 - folds / total) * 100 } : null;
}
