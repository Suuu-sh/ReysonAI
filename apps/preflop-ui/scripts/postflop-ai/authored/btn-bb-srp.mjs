// Policy rules authored directly by Claude (Opus 5.5) for BTN_open_BB_call while the local
// Codex model was rate-limited (2026-09-28). Same format and validation as the Codex output;
// AI estimate, not GTO. Saved through generate()/generateLater() with this as the generator.
const row = (node, texture, tiers, actions) => Object.entries(tiers).map(([tier, values]) =>
  ({ node, texture, tier, mix: Object.fromEntries(actions.map((action, i) => [action, values[i]])) }));
const FIRST = ["check", "bet33", "bet75", "bet125"], RESP = ["fold", "call", "raise"], FC = ["fold", "call"];

export const flop = { version: 1, kind: "ai_estimate_not_gto", rules: [
  ...row("btn_first", "any", { monster: [15, 30, 35, 20], strong: [30, 50, 20, 0], draw: [35, 30, 25, 10], medium: [60, 40, 0, 0], air: [55, 30, 5, 10] }, FIRST),
  ...row("btn_first", "dry", { monster: [20, 50, 20, 10], strong: [20, 70, 10, 0], draw: [35, 50, 15, 0], medium: [45, 55, 0, 0], air: [45, 50, 0, 5] }, FIRST),
  ...row("btn_first", "wet", { monster: [10, 15, 45, 30], strong: [35, 25, 35, 5], draw: [30, 20, 35, 15], medium: [75, 25, 0, 0], air: [65, 15, 10, 10] }, FIRST),
  ...row("btn_first", "monotone", { monster: [30, 50, 20, 0], strong: [50, 45, 5, 0], draw: [35, 50, 15, 0], medium: [70, 30, 0, 0], air: [60, 40, 0, 0] }, FIRST),
  ...row("btn_first", "paired", { monster: [30, 60, 10, 0], strong: [40, 60, 0, 0], draw: [50, 50, 0, 0], medium: [45, 55, 0, 0], air: [50, 50, 0, 0] }, FIRST),
  ...row("bb_vs_33", "any", { monster: [0, 55, 45], strong: [3, 87, 10], draw: [12, 73, 15], medium: [30, 70, 0], air: [85, 9, 6] }, RESP),
  ...row("bb_vs_33", "wet", { draw: [8, 70, 22] }, RESP),
  ...row("bb_vs_33", "paired", { medium: [20, 78, 2] }, RESP),
  ...row("bb_vs_75", "any", { monster: [0, 60, 40], strong: [15, 80, 5], draw: [30, 60, 10], medium: [65, 35, 0], air: [93, 1, 6] }, RESP),
  ...row("bb_vs_125", "any", { monster: [0, 70, 30], strong: [25, 73, 2], draw: [40, 55, 5], medium: [78, 22, 0], air: [96, 0, 4] }, RESP),
  ...row("btn_vs_raise", "any", { monster: [0, 100], strong: [25, 75], draw: [30, 70], medium: [70, 30], air: [92, 8] }, FC),
  ...row("btn_vs_raise", "wet", { strong: [35, 65] }, FC),
] };

// Turn/river: fallbacks per node and tier, plus line/texture overrides (barrels on blanks,
// slowing down on flush cards, probes after a checked-through street).
const later = (node, line, texture, tiers, actions) => row(node, texture, tiers, actions).map(rule => ({ ...rule, line }));
const T = ["check", "bet33", "bet75", "bet125"], R = [...T, "allin"];
const facing = (street, role, size, tiers) => later(`${street}_${role}_vs_${size}`, "any", "any", tiers, size === "allin" ? FC : RESP);
const both = (street, size, tiers) => [...facing(street, "ip", size, tiers), ...facing(street, "oop", size, tiers)];
const vsRaise = (street, tiers) => [...later(`${street}_oop_vs_raise`, "any", "any", tiers, FC), ...later(`${street}_ip_vs_raise`, "any", "any", tiers, FC)];

const turn = [
  ...later("turn_oop_first", "any", "any", { monster: [45, 15, 25, 15], strong: [75, 20, 5, 0], draw: [80, 10, 10, 0], medium: [90, 10, 0, 0], air: [88, 8, 2, 2] }, T),
  ...later("turn_oop_first", "any", "flush", { monster: [30, 20, 30, 20], strong: [85, 15, 0, 0], air: [90, 8, 1, 1] }, T),
  ...later("turn_oop_first", "any", "pair", { monster: [55, 20, 15, 10], strong: [85, 15, 0, 0] }, T),
  ...later("turn_oop_first", "aggressor", "any", { monster: [25, 15, 35, 25], strong: [45, 35, 20, 0], draw: [50, 15, 25, 10], air: [70, 10, 10, 10] }, T),
  ...later("turn_ip_first", "any", "any", { monster: [20, 20, 35, 25], strong: [40, 40, 20, 0], draw: [45, 25, 20, 10], medium: [70, 30, 0, 0], air: [65, 20, 5, 10] }, T),
  ...later("turn_ip_first", "aggressor", "blank", { strong: [25, 45, 30, 0], draw: [25, 25, 30, 20], air: [45, 20, 15, 20] }, T),
  ...later("turn_ip_first", "aggressor", "over", { strong: [30, 45, 25, 0], draw: [30, 25, 30, 15], air: [45, 25, 15, 15] }, T),
  ...later("turn_ip_first", "aggressor", "flush", { monster: [20, 30, 30, 20], strong: [60, 35, 5, 0], air: [70, 25, 0, 5] }, T),
  ...later("turn_ip_first", "defender", "any", { strong: [35, 45, 20, 0], air: [60, 25, 5, 10] }, T),
  ...both("turn", "33", { monster: [0, 55, 45], strong: [8, 82, 10], draw: [20, 68, 12], medium: [40, 58, 2], air: [85, 5, 10] }),
  ...both("turn", "75", { monster: [0, 65, 35], strong: [20, 74, 6], draw: [35, 58, 7], medium: [65, 35, 0], air: [92, 0, 8] }),
  ...both("turn", "125", { monster: [0, 75, 25], strong: [30, 67, 3], draw: [45, 50, 5], medium: [75, 25, 0], air: [95, 0, 5] }),
  ...later("turn_oop_vs_75", "checked", "any", { medium: [45, 55, 0] }, RESP),
  ...vsRaise("turn", { monster: [0, 100], strong: [35, 65], draw: [40, 60], medium: [80, 20], air: [95, 5] }),
];
const river = [
  ...later("river_oop_first", "any", "any", { monster: [40, 10, 25, 15, 10], strong: [75, 20, 5, 0, 0], medium: [92, 8, 0, 0, 0], air: [78, 6, 6, 5, 5] }, R),
  ...later("river_oop_first", "aggressor", "any", { monster: [25, 10, 30, 20, 15], strong: [55, 35, 10, 0, 0], air: [30, 10, 20, 20, 20] }, R),
  ...later("river_oop_first", "any", "flush", { strong: [85, 15, 0, 0, 0], air: [84, 4, 4, 4, 4] }, R),
  ...later("river_ip_first", "any", "any", { monster: [10, 15, 35, 25, 15], strong: [45, 45, 10, 0, 0], medium: [80, 20, 0, 0, 0], air: [62, 10, 10, 10, 8] }, R),
  // After calling a turn bet the range is strong; the few missed draws that remain are the
  // bluffs, so they bet often to keep bluffs proportional to value (balance audit).
  ...later("river_ip_first", "defender", "any", { air: [25, 20, 20, 20, 15] }, R),
  ...later("river_ip_first", "aggressor", "any", { strong: [40, 45, 15, 0, 0], air: [55, 5, 5, 20, 15] }, R),
  ...later("river_ip_first", "aggressor", "flush", { monster: [15, 20, 35, 20, 10], strong: [65, 30, 5, 0, 0], air: [70, 10, 0, 10, 10] }, R),
  ...both("river", "33", { monster: [0, 55, 45], strong: [10, 85, 5], medium: [35, 65, 0], air: [88, 0, 12] }),
  ...both("river", "75", { monster: [0, 70, 30], strong: [25, 72, 3], medium: [60, 40, 0], air: [95, 0, 5] }),
  ...both("river", "125", { monster: [0, 80, 20], strong: [35, 63, 2], medium: [75, 25, 0], air: [97, 0, 3] }),
  ...both("river", "allin", { monster: [0, 100], strong: [45, 55], medium: [85, 15], air: [99, 1] }),
  ...vsRaise("river", { monster: [0, 100], strong: [45, 55], medium: [88, 12], air: [97, 3] }),
];
export const laterPolicy = { version: 1, kind: "ai_estimate_not_gto", streets: { turn: { rules: turn }, river: { rules: river } } };
