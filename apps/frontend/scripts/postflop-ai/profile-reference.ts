import type { ActionMix, FlopPolicy, Inputs, LaterPolicy } from "./types.ts";
import type { Table } from "./engine.ts";
import { defenceFor } from "./defence.ts";
import { NODES, effectiveMix, withRaise } from "./policy.ts";
import { LATER_NODES } from "./later-tree.ts";

export type ProfileReferenceFacts = {
  kind: "profile_policy_supplement_not_solver"; profile: string; role: "villain" | "exploit" | null;
  shown_mix: ActionMix; balanced_mix: ActionMix | null;
  frequency_reference: "computed_defence_same_ranges_and_policy";
  assumptions: readonly string[]; legal_actions: string[]; unsupported_reason: string | null;
};

// Frequency context only: compare the shown profile policy with computed defence
// using the same ranges and policy. Never compute postflop action EV or rank actions.
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
    assumptions: ["Same adjusted preflop ranges and composed AI policy, not an independent balanced policy or solver."],
    legal_actions: legal, unsupported_reason: null,
  };
  if (!table || pending?.node !== node) {
    result.unsupported_reason = "Pending legal decision could not be replayed.";
    return result;
  }
  const computed = defenceFor(inputs, flopPolicy, laterPolicy, { profileMode: false });
  result.balanced_mix = computed.mix(table, board, node, combo, base);
  return result;
}
