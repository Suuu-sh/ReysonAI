// Isolated extension of the unchanged shared EQR law to five/six players.
// Importing constants preserves every existing HU/Stage1/2 identity and value.
import { EQR, MULTIWAY_EQR, eqrCategory, BB_BEHIND_EQR } from "./eqr.ts";
import { isInPosition, positions } from "./sizing.ts";
import { raked } from "./rake.ts";
export { allowedCall, threeBetTargetCall, targetCall } from "./call-ev.ts";
export function callFacts(context, hand, equity) {
  if (!Number.isFinite(equity) || equity < 0 || equity > 1) throw new Error(`Invalid Stage3 equity ${hand}`);
  const { hero, opponents, all_in: allIn, cost_to_call: cost, total_pot_after_call: pot } = context.input;
  if (![1, 2, 3, 4, 5].includes(opponents.length) || new Set([hero, ...opponents]).size !== opponents.length + 1 ||
      [hero, ...opponents].some(p => !positions.includes(p))) throw new Error("Stage3 EQR requires two through six distinct seats");
  const ip = opponents.every(p => isInPosition(hero, p));
  const bbBehind = context.node.bet_level === 2 && hero === "SB" && !opponents.includes("BB");
  const eqr = allIn ? 1 : EQR[eqrCategory(hand)][ip ? 0 : 1] * MULTIWAY_EQR ** (opponents.length - 1) * (bbBehind ? BB_BEHIND_EQR : 1);
  return { eqr, realized_equity_pct: equity * eqr * 100, call_ev_bb: equity * eqr * raked(pot) - cost };
}
