// Claude-authored (Opus 5.5) rule builder for every heads-up flop spot, used while the
// local Codex model was rate-limited (2026-09-28). Starts from the reviewed BTN vs BB rules
// (btn-bb-srp.mjs) and adjusts them by the spot's shape:
// - kind: 3bet / 4bet pots have lower SPR, so sizes shift from 125% towards 33–75% and
//   medium hands continue more; limped pots have capped ranges and bet small.
// - tree "oop_leads": the OOP last raiser leads (oop_first) with a check-heavier version of
//   the raiser's c-bet, IP defends with position (more calls, fewer raises), and after the
//   OOP check the IP caller stabs more often while OOP folds less to the stab.
// AI estimate, not GTO.
import { flop as base, laterPolicy } from "./btn-bb-srp.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const FIRST = ["check", "bet33", "bet75", "bet125"];
const norm = (mix, actions) => {
  const total = actions.reduce((sum, action) => sum + Math.max(0, mix[action]), 0);
  const raw = Object.fromEntries(actions.map(action => [action, Math.max(0, mix[action]) * 100 / total]));
  const out = Object.fromEntries(actions.map(action => [action, Math.floor(raw[action])]));
  let left = 100 - Object.values(out).reduce((a, b) => a + b, 0);
  for (const action of [...actions].sort((a, b) => raw[b] % 1 - raw[a] % 1)) { if (left-- <= 0) break; out[action]++; }
  return out;
};
// Moves `share` of the 125% (and part of 75%) bets into smaller sizes.
const shrinkSizes = (mix, share) => {
  const moved125 = mix.bet125 * share, moved75 = mix.bet75 * share * 0.5;
  return { ...mix, bet125: mix.bet125 - moved125, bet75: mix.bet75 - moved75 + moved125 * 0.6, bet33: mix.bet33 + moved75 + moved125 * 0.4 };
};
const moreChecks = (mix, factor) => { const bet = 100 - mix.check; return { ...mix, check: 100 - bet * factor, bet33: mix.bet33 * factor, bet75: mix.bet75 * factor, bet125: mix.bet125 * factor }; };
const lessFold = (mix, factor) => ({ ...mix, fold: mix.fold * factor, call: mix.call + mix.fold * (1 - factor) });
const lessRaise = (mix, factor) => ({ ...mix, raise: mix.raise * factor, call: mix.call + mix.raise * (1 - factor) });

function adjustFirst(rule, spot, node) {
  let mix = rule.mix;
  if (spot.kind === "3bp") mix = shrinkSizes(mix, 0.6);
  if (spot.kind === "4bp") mix = shrinkSizes(mix, 1);
  if (spot.kind === "limp") mix = moreChecks(shrinkSizes(mix, 0.8), 0.8);
  if (node === "oop_first") mix = moreChecks(mix, 0.7);
  // oop_leads: after the OOP raiser checks, the IP caller stabs; medium/air bet more (small).
  if (node === "btn_first" && spot.tree === "oop_leads" && ["medium", "air"].includes(rule.tier)) mix = { ...mix, check: mix.check - 10, bet33: mix.bet33 + 10 };
  return norm(mix, FIRST);
}
function adjustFacing(rule, spot, node) {
  let mix = rule.mix;
  if (spot.kind === "3bp" || spot.kind === "4bp") mix = lessFold(mix, rule.tier === "air" ? 0.95 : 0.75);
  if (node.startsWith("ip_vs_")) mix = lessRaise(lessFold(mix, 0.9), 0.7); // IP defends with position.
  if (node.startsWith("bb_vs_") && spot.tree === "oop_leads") mix = lessFold(mix, 0.85); // OOP raiser vs a stab.
  const actions = Object.keys(rule.mix);
  return norm(mix, actions);
}

export function build(spot) {
  const rules = [];
  const mapped = (from, to) => base.rules.filter(rule => rule.node === from).map(rule => ({ ...clone(rule), node: to }));
  const source = spot.tree === "oop_leads"
    ? [...mapped("btn_first", "oop_first"), ...["33", "75", "125"].flatMap(size => mapped(`bb_vs_${size}`, `ip_vs_${size}`)), ...mapped("btn_vs_raise", "oop_vs_raise"),
      ...base.rules.map(clone)]
    : base.rules.map(clone);
  for (const rule of source) {
    if (rule.node.endsWith("_first")) rule.mix = adjustFirst(rule, spot, rule.node);
    else if (!rule.node.endsWith("_vs_raise")) rule.mix = adjustFacing(rule, spot, rule.node);
    rules.push(rule);
  }
  return { flop: { version: 1, kind: "ai_estimate_not_gto", rules }, laterPolicy: clone(laterPolicy) };
}
