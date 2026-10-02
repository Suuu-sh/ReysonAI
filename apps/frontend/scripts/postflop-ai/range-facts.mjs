// Range-level facts of one decision (both players' reach ranges by hand tier, the bettor's composition per bet
// size, SPR and how the last card shifted the ranges). Hero independent, cheap (one pass over each range) and
// never stored: the stored flop base keeps its format. Used only by the advanced-style per-action explanations.
import { comboRange } from "./browser-inputs.mjs";
import { handTier, TIERS } from "./model.mjs";
import { comboId, defenceFor, replayOrNull } from "./defence.mjs";
import { LATER_NODES, laterNodeRole } from "./later-tree.mjs";
import { laterPolicyMix } from "./later-policy.mjs";
import { NODES, nodeRole, policyMix } from "./policy.mjs";
import { historyFor } from "./tree.mjs";

const round4 = v => Math.round(v * 1e4) / 1e4;
const aggressive = a => a.startsWith("bet") || a === "allin" || a === "raise";
const emptyTiers = () => Object.fromEntries(TIERS.map(t => [t, 0]));
const normalize = (sums, total) => Object.fromEntries(TIERS.map(t => [t, total > 0 ? round4(sums[t] / total) : 0]));
const tierOf = (combo, board) => { const t = handTier(combo, board); return t === "draw" && board.length === 5 ? "medium" : t; };

function tiersOf(items, dense, board) {
  const sums = emptyTiers();
  let total = 0;
  for (const item of items) {
    const w = dense[comboId(item.combo[0], item.combo[1])];
    if (!(w > 0)) continue;
    sums[tierOf(item.combo, board)] += w;
    total += w;
  }
  return normalize(sums, total);
}
const strongOf = t => (t.monster ?? 0) + (t.strong ?? 0);

// { board, table, node, role, laterLine (null on the flop) } -> facts, or null when the line has no table.
export function rangeFactsFor({ inputs, flopPolicy, laterPolicy = null, board, table, node, role, line = null }) {
  if (!table) return null;
  const defence = defenceFor(inputs, flopPolicy, laterPolicy);
  const heroSeat = inputs.spot[role], oppSeat = inputs.spot[role === "ip" ? "oop" : "ip"];
  const heroItems = comboRange(inputs.seatRows[heroSeat], "freq", board);
  const oppItems = comboRange(inputs.seatRows[oppSeat], "freq", board);
  const heroDense = defence.rangeOf(table, board, heroSeat), oppDense = defence.rangeOf(table, board, oppSeat);
  const hero = tiersOf(heroItems, heroDense, board), opp = tiersOf(oppItems, oppDense, board);
  const facts = { street: board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river", role,
    pfr: inputs.spot.aggressor === inputs.spot.ip ? "ip" : inputs.spot.aggressor === inputs.spot.oop ? "oop" : null,
    tiers: { hero, opp }, hero_strong: round4(strongOf(hero)), opp_strong: round4(strongOf(opp)) };
  const pending = table.log.at(-1);
  const stack = Math.min(...Object.values(table.stacks));
  facts.spr = pending?.pot > 0 ? round4(stack / pending.pot) : null;
  if (board.length > 3) {
    const prev = board.slice(0, -1);
    const heroPrev = tiersOf(heroItems, heroDense, prev), oppPrev = tiersOf(oppItems, oppDense, prev);
    facts.runout_shift = { hero: round4(strongOf(hero) - strongOf(heroPrev)), opp: round4(strongOf(opp) - strongOf(oppPrev)) };
  }
  const actions = (NODES[node] ?? LATER_NODES[node] ?? []).filter(aggressive);
  if (actions.length) {
    const sums = Object.fromEntries(actions.map(a => [a, { tiers: emptyTiers(), total: 0 }]));
    let reach = 0;
    for (const item of heroItems) {
      const w = heroDense[comboId(item.combo[0], item.combo[1])];
      if (!(w > 0)) continue;
      const base = line === null ? policyMix(flopPolicy, node, item.combo, board)
        : laterPolicyMix(laterPolicy, node, item.combo, board, line);
      const mix = defence.mix(table, board, node, item.combo, base);
      const tier = tierOf(item.combo, board);
      reach += w;
      for (const a of actions) { const x = w * (mix[a] ?? 0) / 100; sums[a].tiers[tier] += x; sums[a].total += x; }
    }
    facts.sizes = Object.fromEntries(actions.map(a => [a, { share: round4(reach ? sums[a].total / reach : 0),
      tiers: normalize(sums[a].tiers, sums[a].total) }]));
  }
  return facts;
}

export function flopRangeFacts({ inputs, policy, laterPolicy = null, boardCards, node, prev = "bet33", history }) {
  try {
    history ??= historyFor(inputs.spot.tree, node, prev);
    const table = replayOrNull(inputs, boardCards, { flop: history });
    return rangeFactsFor({ inputs, flopPolicy: policy, laterPolicy, board: boardCards, table, node, role: nodeRole(node) });
  } catch { return null; }
}

export function laterRangeFacts({ inputs, flopPolicy, laterPolicy, context }) {
  try {
    const { board, decision } = context;
    const table = replayOrNull(inputs, board, { flop: context.flopPath, turn: context.turnPath,
      river: context.street === "river" ? context.riverPath : [] });
    return rangeFactsFor({ inputs, flopPolicy, laterPolicy, board, table, node: decision.node,
      role: laterNodeRole(decision.node), line: decision.line });
  } catch { return null; }
}
