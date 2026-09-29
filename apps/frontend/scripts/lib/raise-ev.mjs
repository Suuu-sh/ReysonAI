// 3bet EV for open responses, from the saved downstream strategies (advisory, not solver EV).
// EV is measured like call EV: incremental chips vs folding now (blinds already posted are sunk).
//   fold  → opener folds: win the pot before the 3bet
//   call  → equity vs opener's calling range × EQR × raked(pot) − 3bet cost
//   4bet  → hero's saved 4bet response: fold loses the 3bet; call realizes vs the 4bet range;
//           all-in gets it in at 100BB (ignores opener folding to the shove, so conservative)
import { raked } from "../../src/estimated/rake.ts";
import { equityRealization } from "../../src/estimated/eqr.ts";
import { combosOf } from "./equity.mjs";

const blind = { SB: 0.5, BB: 1 };

// Opener's reply shares to hero's 3bet, with hero's cards removed from the opener's range.
export function replyShares(hand, openRows, replyRows) {
  const replies = new Map(replyRows.map(r => [r.hand, r]));
  const mine = combosOf(hand);
  let w = 0, fold = 0, call = 0, four = 0;
  for (const row of openRows) {
    const reach = row.open / 100;
    if (!reach) continue;
    const reply = replies.get(row.hand);
    for (const combo of combosOf(row.hand)) {
      // average over hero's combos: share of hero combos this opener combo is compatible with
      const live = mine.filter(([a, b]) => !combo.includes(a) && !combo.includes(b)).length / mine.length;
      const k = reach * live;
      w += k; fold += k * reply.fold / 100; call += k * reply.call / 100; four += k * reply.four_bet / 100;
    }
  }
  return w ? { fold: fold / w, call: call / w, four_bet: four / w } : { fold: 0, call: 0, four_bet: 0 };
}

// geometry: { hero, opener, open, threeBet, fourBet, stack }; eq: { vsCall, vsFourBet } (0..1)
export function raiseEv(hand, shares, fourBetRow, eq, g, { eqrScale = 1 } = {}) {
  if (!Number.isFinite(eqrScale) || eqrScale <= 0) throw new Error("EQR scale must be positive and finite");
  const heroBlind = blind[g.hero] ?? 0, openerBlind = blind[g.opener] ?? 0;
  const dead = 1.5 - heroBlind - openerBlind;
  const potBefore = g.open + 1.5 - openerBlind;
  const risk3 = g.threeBet - heroBlind;
  const eqr = equityRealization(hand, g.hero, [g.opener]) * eqrScale;
  const whenCalled = eq.vsCall * eqr * raked(2 * g.threeBet + dead) - risk3;
  const vsFour = fourBetRow ? (
    fourBetRow.fold / 100 * -risk3 +
    fourBetRow.call / 100 * (eq.vsFourBet * eqr * raked(2 * g.fourBet + dead) - (g.fourBet - heroBlind)) +
    (fourBetRow.all_in ?? 0) / 100 * (eq.vsFourBet * raked(2 * g.stack + dead) - (g.stack - heroBlind))
  ) : -risk3;
  return {
    ev: shares.fold * potBefore + shares.call * whenCalled + shares.four_bet * vsFour,
    parts: { potBefore, whenCalled, vsFour },
  };
}

// Advisory flags. margin in bb; call EV below 0 means folding is the alternative.
export function classify({ threeBet, callEv, raiseEv }, margin = 0.1) {
  const alt = Math.max(callEv, 0);
  if (threeBet === 0 && raiseEv > alt + margin) return "under-raised";
  if (threeBet > 0 && raiseEv < alt - margin) return "over-raised";
  return null;
}
