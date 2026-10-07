import type { ActionMix, FlopPolicy, Inputs, LaterPolicy } from "./types.ts";
import type { Table } from "./engine.ts";
import { comboId, defenceFor, finalTables, isFacingNode, replayOrNull } from "./defence.ts";
import { equityVersus, makeRange } from "./range-equity.ts";
import { handTier } from "./model.ts";
import { NODES, effectiveMix, withRaise } from "./policy.ts";
import { LATER_NODES } from "./later-tree.ts";
import { rake } from "./engine.ts";

const rounded = (value: number) => Math.round(value * 1e4) / 1e4;
export type ProfileReferenceFacts = {
  kind: "profile_policy_supplement_not_solver"; profile: string; role: "villain" | "exploit" | null;
  shown_mix: ActionMix; balanced_mix: ActionMix | null;
  frequency_reference: "computed_defence_same_ranges_and_policy";
  ev_model: "one_step_equity_realization_showdown";
  assumptions: readonly string[]; legal_actions: string[]; evaluated_actions: string[];
  unsupported_actions: Record<string, string>; action_ev_bb: Record<string, number>;
  max_ev_action: string | null; unsupported_reason: string | null;
};

// A deliberately small, optional reference, NOT a solved hand EV or strategy engine.
// Bets/raises: villain folds or calls (its raise share is treated as a call); then both
// hands show down with the existing tier/position EQR. Check has no further betting.
// Flop uses the existing seeded 300-runout measure, turn enumerates rivers, river is exact.
// Costs are incremental chips from the pending decision, with actual stack caps and rake.
// Never imports the offline hand-EV tools and never feeds its results back into mixes/reach.
export function profileReferenceFacts(inputs: Inputs, flopPolicy: FlopPolicy, laterPolicy: LaterPolicy | null,
  table: Table | null, board: readonly number[], node: string, combo: readonly number[], base: ActionMix): ProfileReferenceFacts | null {
  if (!inputs.opponentProfile || inputs.opponentProfile === "standard") return null;
  const pending = table?.log.at(-1);
  const legal = [...(NODES[node] ?? LATER_NODES[node] ?? [])].filter(action => action !== "raise" || pending?.canRaise !== false);
  const shown = effectiveMix(withRaise(node, base), pending?.canRaise);
  const role = pending && inputs.opponentSeat ? (pending.seat === inputs.spot[inputs.opponentSeat] ? "villain" : "exploit") : null;
  const result: ProfileReferenceFacts = {
    kind: "profile_policy_supplement_not_solver", profile: inputs.opponentProfile, role,
    shown_mix: shown, balanced_mix: null, frequency_reference: "computed_defence_same_ranges_and_policy",
    ev_model: "one_step_equity_realization_showdown",
    assumptions: ["Same adjusted preflop ranges and composed AI policy, not an independent balanced policy or solver.",
      "Opponent continuation (including raises) is modelled as a call; no future betting or re-raise tree.",
      "Existing tier/position realization factors on flop/turn, exact showdown on river; incremental chip costs and capped rake.",
      "Flop equity uses 300 seeded runouts; turn enumerates legal rivers. Maximum is only reported when every legal action is evaluated."],
    legal_actions: legal, evaluated_actions: [], unsupported_actions: {}, action_ev_bb: {},
    max_ev_action: null, unsupported_reason: null,
  };
  if (!table || pending?.node !== node) {
    result.unsupported_reason = "Pending legal decision could not be replayed.";
    for (const action of legal) result.unsupported_actions[action] = result.unsupported_reason;
    return result;
  }
  const profile = defenceFor(inputs, flopPolicy, laterPolicy);
  const computed = defenceFor(inputs, flopPolicy, laterPolicy, { profileMode: false });
  result.balanced_mix = computed.mix(table, board, node, combo, base);
  const actor = pending.seat, opponent = table.other(actor), street = pending.street;
  const actorRole = actor === inputs.spot.ip ? "ip" : "oop";
  const tier = handTier(combo, board);
  const realization = street === "river" ? 1 : profile.realization?.[street]?.[actorRole]?.[tier] ?? 1;
  const tables = finalTables(board), id = comboId(combo[0], combo[1]);
  const compatible = (cards: readonly number[]) => !cards.includes(combo[0]) && !cards.includes(combo[1]);
  const equityOf = (items: readonly { combo: readonly number[]; weight: number }[]) => {
    const weights = new Float64Array(52 * 52);
    for (const item of items) if (compatible(item.combo)) weights[comboId(item.combo[0], item.combo[1])] += item.weight;
    const range = makeRange(weights);
    return range.total > 0 ? equityVersus(range, id, tables) : null;
  };
  for (const action of legal) {
    let ev: number | null = null, reason = "No compatible opponent reach for this action.";
    if (action === "fold") ev = 0;
    else if (action === "check") {
      const equity = equityOf(profile.rangeItems(table, board, opponent));
      if (equity !== null) ev = equity * realization * (table.pot - rake(table.pot));
    } else if (action === "call") {
      const context = profile.context(table, board, node);
      const equity = context && profile.equity(context, combo);
      if (context && equity !== null) ev = equity! * realization * (context.finalPot - context.rake) - context.call;
    } else {
      const after = replayOrNull(inputs, board, { ...table.path, [street]: [...table.path[street], action] });
      const response = after?.log.at(-1);
      // A merged all-in is evaluated at its actual capped chip amount. No hypothetical
      // response is invented when the engine cannot reach a facing decision.
      if (!after || !response || response.seat !== opponent || response.street !== street || !isFacingNode(response.node)) {
        reason = "Aggressive action has no replayable immediate facing response.";
      } else {
        const items = profile.rangeItems(after, board, opponent).filter(item => compatible(item.combo));
        let total = 0, folded = 0;
        const called = items.map(item => {
          const mix = profile.mix(after, board, response.node, item.combo, profile.baseMix(after, board, response.node, item.combo));
          const fold = (mix.fold ?? 0) / 100;
          total += item.weight; folded += item.weight * fold;
          return { ...item, weight: item.weight * (1 - fold) };
        });
        const wager = rounded(after.pot - table.pot);
        const call = Math.min(after.stacks[opponent], Math.max(0, rounded(after.invested[actor] - after.invested[opponent])));
        const pot = after.pot + call;
        // settle() refunds unmatched chips before charging rake. A folded bet or
        // raise wins the pending pot; its uncalled excess is not part of the raked pot.
        const matchedPot = after.pot - Math.max(0, after.invested[actor] - after.invested[opponent]);
        const foldShare = total > 0 ? folded / total : null;
        const equity = equityOf(called);
        if (foldShare !== null && (foldShare >= 1 - 1e-12 || equity !== null)) {
          ev = foldShare * (table.pot - rake(matchedPot)) + (1 - foldShare) * ((equity ?? 0) * realization * (pot - rake(pot)) - wager);
        }
      }
    }
    if (ev !== null && Number.isFinite(ev)) {
      result.action_ev_bb[action] = rounded(ev);
      result.evaluated_actions.push(action);
    } else result.unsupported_actions[action] = reason;
  }
  if (legal.length > 0 && result.evaluated_actions.length === legal.length) {
    result.max_ev_action = legal.reduce((best, action) => result.action_ev_bb[action] > result.action_ev_bb[best] ? action : best, legal[0]);
  } else result.unsupported_reason = "At least one legal action is unsupported by the one-step model; no complete maximum is claimed.";
  return result;
}
