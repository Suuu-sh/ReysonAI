// Exact policy storage is separate from reach-weighted 169-cell display rows.
// Canonical hand/action order makes defaults compact without rounding or loss.
import { hands } from "../src/data.ts";
import { validateAiv2Policy } from "./aiv2-preflop.ts";

type Policy = ReturnType<typeof validateAiv2Policy>;
export type CompactPolicySpot = {
  id: string;
  hands?: Array<Record<string, unknown>>;
  class_defaults?: unknown;
  class_default_actions?: unknown;
  combo_overrides?: unknown;
};

export function encodeCompactPolicy(policy: Policy) {
  const validated = validateAiv2Policy(policy, policy.scenario_id, policy.actions);
  return {
    class_default_actions: [...validated.actions],
    class_defaults: hands.map(hand => validated.actions.map(action => validated.class_mixes[hand][action])),
    combo_overrides: Object.entries(validated.combo_overrides).map(([combo, mix]) => ({ combo, mix: { ...mix } })),
  };
}

export function decodeCompactPolicy(spot: CompactPolicySpot, actions: string[]): Policy {
  const overrides = spot.combo_overrides === undefined ? [] : spot.combo_overrides;
  if (!Array.isArray(overrides)) throw new Error("Compact policy combo_overrides must be an array");
  let classMixes: Array<{ hand: string; mix: Record<string, unknown> }>;
  if (spot.class_defaults !== undefined) {
    const defaults = spot.class_defaults;
    const columns = spot.class_default_actions;
    if (!Array.isArray(columns) || columns.length !== actions.length || new Set(columns).size !== actions.length || columns.some(action => typeof action !== "string" || !actions.includes(action)))
      throw new Error("Compact policy must include its exact legal action columns");
    if (!Array.isArray(defaults) || defaults.length !== hands.length || defaults.some(row => !Array.isArray(row) || row.length !== actions.length))
      throw new Error("Compact policy must contain exactly 169 complete class defaults");
    classMixes = hands.map((hand, index) => ({ hand, mix: Object.fromEntries(actions.map(action => [action, defaults[index][columns.indexOf(action)]])) }));
  } else {
    // An aggregate is an exact default only if no exception was applied. Even a
    // zero-reach override changes the underlying counterfactual policy, so never
    // infer or reverse-engineer a default from a rounded weighted display cell.
    if (overrides.length) throw new Error("Legacy policy with combo overrides is missing exact class defaults");
    if (!Array.isArray(spot.hands) || spot.hands.length !== hands.length || spot.hands.some((row, index) => row.hand !== hands[index]))
      throw new Error("Legacy zero-exception policy must contain all canonical hand rows");
    classMixes = spot.hands.map(row => ({ hand: String(row.hand), mix: Object.fromEntries(actions.map(action => [action, row[action]])) }));
  }
  return validateAiv2Policy({ kind: "aiv2_preflop_combo_policy", scenario_id: spot.id, class_mixes: classMixes, combo_overrides: overrides }, spot.id, actions);
}
