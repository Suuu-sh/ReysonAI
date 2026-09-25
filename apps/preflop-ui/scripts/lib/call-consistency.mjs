// Constrained call-only reconciliation after the EV gate. Never changes raises,
// admits a negative-EV call, or weakens the existing consistency audit.
import { allowedCall, callFacts, squeezeFoldThreshold } from "../../src/estimated/call-ev.js";
import { comboCount } from "./equity.mjs";
import { openSizeFor } from "../../src/estimated/sizing.js";
const ranks = "AKQJT98765432", blind = { SB: 0.5, BB: 1 };
const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const continuation = row => 100 - row.fold;

export function reconcileCalls(contexts, table) {
  const nodes = contexts.flatMap(c => c.spot.hands.filter(r => c.reach(r.hand) > 0).map(row => ({
    row, context: c, ev: callFacts(c, row.hand, table.spots[c.spot.id].equities[row.hand]).call_ev_bb,
  })));
  const node = (c, hand) => nodes.find(n => n.context === c && n.row.hand === hand);
  const edges = [];
  for (const c of contexts) {
    const chains = [[...ranks].map(r => r + r)];
    for (let i = 0; i < ranks.length - 1; i++) for (const suit of ["s", "o"]) {
      chains.push([...ranks.slice(i + 1)].map(r => ranks[i] + r + suit));
    }
    for (const chain of chains) {
      const live = chain.map(hand => node(c, hand)).filter(Boolean);
      for (let i = 1; i < live.length; i++) {
        if (/^A6/.test(live[i - 1].row.hand) && /^A5/.test(live[i].row.hand)) continue;
        edges.push([live[i - 1], live[i]]);
      }
    }
    for (let i = 0; i < ranks.length; i++) for (let j = i + 1; j < ranks.length; j++) {
      const s = node(c, ranks[i] + ranks[j] + "s"), o = node(c, ranks[i] + ranks[j] + "o");
      if (s && o) edges.push([s, o]);
    }
  }
  // Defense versus a later (wider) opener must not be narrower. SB's separate
  // 3.5BB raise/limp split is excluded, matching the audit's existing rule.
  for (const hero of seats) {
    const spots = contexts.filter(c => c.type === "response" && c.spot.hero === hero)
      .sort((a, b) => seats.indexOf(a.spot.opener) - seats.indexOf(b.spot.opener));
    for (let i = 1; i < spots.length; i++) {
      if (hero === "BB" && spots[i].spot.opener === "SB") continue;
      for (const row of spots[i].spot.hands) edges.push([node(spots[i], row.hand), node(spots[i - 1], row.hand)]);
    }
  }
  const changes = [];
  const adjust = (n, delta, reason) => {
    if (!delta) return;
    const before = n.row.call;
    n.row.call += delta; n.row.fold -= delta;
    changes.push({ spot: n.context.spot.id, hand: n.row.hand, before, after: n.row.call, call_ev_bb: n.ev, reason });
  };
  // First conservatively trim weaker calls. This is monotone and terminates.
  let changed;
  do {
    changed = false;
    for (const [strong, weak] of edges) {
      const excess = continuation(weak.row) - continuation(strong.row) - 10;
      if (excess <= 0) continue;
      if (excess > weak.row.call) throw new Error(`Cannot preserve strength without changing raises: ${weak.context.spot.id}/${weak.row.hand}`);
      adjust(weak, -excess, "strength/nesting ceiling"); changed = true;
    }
  } while (changed);

  const foldRate = c => {
    const weights = c.spot.hands.map(row => [row, comboCount(row.hand) * c.reach(row.hand)]);
    return weights.reduce((n, [r, w]) => n + w * r.fold / 100, 0) / weights.reduce((n, [, w]) => n + w, 0);
  };
  function defend(group, threshold, label) {
    const fold = () => group.reduce((n, c) => n * foldRate(c), 1);
    // Add only positive-EV calls, highest EV first, and only as much as needed
    // to retain the pre-existing no-auto-profit requirement. No global widening.
    const candidates = nodes.filter(n => group.includes(n.context) && n.ev >= 0.05)
      .sort((a, b) => b.ev - a.ev || a.row.hand.localeCompare(b.row.hand));
    while (fold() > threshold + 1e-12) {
      let added = false;
      for (const n of candidates) {
        const aggressive = 100 - n.row.call - n.row.fold;
        const maxCall = allowedCall(100 - aggressive, n.ev);
        const ceilings = edges.filter(([, weak]) => weak === n).map(([strong]) => continuation(strong.row) + 10 - continuation(n.row));
        const delta = Math.min(5, maxCall - n.row.call, ...ceilings);
        if (delta <= 0) continue;
        adjust(n, delta, "positive-EV auto-profit protection"); added = true;
        if (fold() <= threshold + 1e-12) break;
      }
      if (!added) {
        // Do not invent a raise or restore a negative-EV call to force MDF.
        // The audit independently proves whether this is an intrinsic capacity
        // conflict; avoidable overfolding remains a blocking error there.
        console.warn(`${label}: exhausted positive-EV call capacity (${fold()} > ${threshold}); audit must classify`);
        break;
      }
    }
  }
  for (const opener of seats.slice(0, 5)) {
    const group = contexts.filter(c => c.type === "response" && c.spot.opener === opener);
    if (!group.length) continue;
    const risk = openSizeFor(opener) - (blind[opener] ?? 0), reward = 1.5 - (blind[opener] ?? 0);
    defend(group, risk / (risk + reward), `${opener} open`);
  }
  for (const c of contexts.filter(c => ["three_bet", "four_bet"].includes(c.type))) {
    const s = c.spot, bettor = s.three_bettor ?? s.hero;
    const dead = 1.5 - (blind[bettor] ?? 0) - (blind[s.opener] ?? 0);
    const risk = c.type === "three_bet" ? s.three_bet_size_bb - (blind[bettor] ?? 0) : s.four_bet_size_bb - openSizeFor(s.opener);
    const reward = (c.type === "three_bet" ? openSizeFor(s.opener) : s.three_bet_size_bb) + dead;
    defend([c], risk / (risk + reward), s.id);
  }
  // Facing a squeeze: the squeezer auto-profits when opener fold × caller fold
  // (after the opener folds) exceeds its break-even.
  for (const c of contexts.filter(c => c.type === "squeeze" && c.spot.prior_action === null)) {
    const partner = contexts.find(d => d.type === "squeeze" && d.spot.prior_action === "fold" && d.spot.source_squeeze_id === c.spot.source_squeeze_id);
    if (partner) defend([c, partner], squeezeFoldThreshold(c.spot), `${c.spot.source_squeeze_id} squeeze`);
  }
  return changes;
}
