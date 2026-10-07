// Deterministic (zero variance) per-hand action EV of the heads-up postflop pilot. Browser-safe.
//
// EV of hero action `a` = the expectation, when both players then follow the shown strategies, over
//   * the opponent combo (every combo of its reach range at the node, card-removed against the hero combo),
//   * the runout (the river for a turn decision, a fixed seeded set of turn+river runouts for a flop one),
//   * every later decision of both players (the mix of the shown strategy, including the computed
//     defence, bluff cap and MDF ceiling / floor), instead of one sampled action.
// Both players' mixes depend only on the public line and their own combo, so the probability of a path is
// s_hero(path) * v_opp(path): a hero scalar times a vector over the opponent combos. Leaves are fold
// payoffs or showdowns; showdowns are summed with rank-sorted prefix sums and per-card blocker lists, so a
// leaf costs O(hero combos) after an O(opponent combos) setup. Chips, rake, stack caps and the all-in
// merge come from engine.ts itself (every state is replayed by the engine).
import { createTable, playFlop, playLaterStreetsWithPolicy, rake } from "./engine.ts";
import { NODES } from "./policy.ts";
import { LATER_NODES } from "./later-tree.ts";
import { comboId, isBettingNode, isFacingNode, rankTable, tierArray } from "./defence.ts";
import config from "../data/postflop-ai-pilot.json" with { type: "json" };

const shapeCaches = new WeakMap();
const STOP = Symbol("stop at the pending decision");
const NONE = 255;
export const PRUNE = 1e-5;
// River defence contexts held at once (about 10 KB each; the browser worker shares the tab's memory). A turn
// request needs about 8,000 and reuses them; a flop request's runouts never share river contexts (about 800 each).
export const RIVER_CONTEXT_LIMIT = 12000, FLOP_RIVER_CONTEXT_LIMIT = 1500;
const r2 = value => Math.round(value * 100) / 100;
const actionsOf = node => NODES[node] ?? LATER_NODES[node];

// Same selection rule as policy.choose: actions in order, the last one takes any remainder.
function fillProbs(mix, actions, out, offset, stride) {
  let cumulative = 0, previous = 0;
  const last = actions.length - 1;
  for (let k = 0; k < last; k++) {
    cumulative += mix[actions[k]];
    const clipped = Math.min(Math.max(cumulative, 0), 100);
    out[offset + k * stride] = (clipped - previous) / 100;
    previous = clipped;
  }
  out[offset + last * stride] = (100 - previous) / 100;
}

// Replays `path` with the real engine: the pending decision (or null when the hand is over) and the table.
function advance(spot, path, finalBoard) {
  const table = createTable(spot);
  let pending = null;
  try {
    playFlop(table, spot.tree, (seat, node, step) => {
      if (step < path.flop.length) return path.flop[step];
      pending = { seat, node, street: "flop", boardLen: 3 };
      throw STOP;
    }, config);
    playLaterStreetsWithPolicy(table, finalBoard.slice(0, 3), finalBoard.slice(3), (seat, node, board) => {
      const street = node.split("_")[0], taken = path[street], index = table.path[street].length;
      if (index < taken.length) return taken[index];
      pending = { seat, node, street, boardLen: board.length };
      throw STOP;
    }, config, table.lastAggressor);
  } catch (error) { if (error !== STOP) throw error; }
  return { table, pending };
}

const lowerBound = (values, target, from, to) => {
  let lo = from, hi = to;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] < target) lo = mid + 1; else hi = mid; }
  return lo;
};
const upperBound = (values, target, from, to) => {
  let lo = from, hi = to;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] <= target) lo = mid + 1; else hi = mid; }
  return lo;
};

// `finals`: final 5-card boards sharing the decision's street board as prefix (1 for the river, ~48 for
// the turn, the seeded runout set for the flop). `heroGroups`: [{ key, items: [{ combo, weight }] }] (the
// acting seat's reach range split by hand class). `oppItems`: [{ combo, weight }] (the other seat's reach
// range at the node). Returns Map(key -> { weight, equity, ev: [per action], mixEv, mix: [per action %] })
// for the combos that have at least one compatible opponent combo.
export function exactActionEv({ spot, defence, rootPath, finals, expectedNode, heroGroups, oppItems, prune = PRUNE }) {
  const nOpp = oppItems.length;
  const oppId = new Int32Array(nOpp), oppLo = new Uint8Array(nOpp), oppHi = new Uint8Array(nOpp), oppW = new Float64Array(nOpp);
  oppItems.forEach((item, i) => {
    oppLo[i] = Math.min(item.combo[0], item.combo[1]); oppHi[i] = Math.max(item.combo[0], item.combo[1]);
    oppId[i] = oppLo[i] * 52 + oppHi[i]; oppW[i] = item.weight;
  });
  const oppMask = new Uint8Array(52); // scratch
  const finalBoard0 = finals[0];

  const massOf = v => { let sum = 0; for (let i = 0; i < nOpp; i++) sum += oppW[i] * v[i]; return sum; };
  const allActive = Int32Array.from({ length: nOpp }, (_, i) => i).filter(i => oppW[i] > 0);
  // The engine replay of a path does not depend on the cards (chips, log and path only), so it is shared
  // by every runout and every call for the same spot.
  let shapes = shapeCaches.get(spot);
  if (!shapes) shapeCaches.set(spot, shapes = new Map());
  const shapeOf = (path, finalBoard) => {
    const key = `${path.flop}|${path.turn}|${path.river}`;
    let shape = shapes.get(key);
    if (!shape) {
      const { table, pending } = advance(spot, path, finalBoard);
      shape = pending ? { terminal: false, len: pending.boardLen, table, node: pending.node, seat: pending.seat,
        street: pending.street, actions: actionsOf(pending.node) } : { terminal: true, len: 3, table, leaf: null };
      if (shapes.size > 20000) shapes.clear();
      shapes.set(key, shape);
    }
    return shape;
  };
  const makeEntry = (path, finalBoard, v, active, mass) => {
    const shape = shapeOf(path, finalBoard);
    if (shape.terminal) return { terminal: true, len: 3, shape, table: shape.table, v, active, mass };
    return { terminal: false, len: shape.len, shape, table: shape.table, node: shape.node, seat: shape.seat, street: shape.street,
      board: finalBoard.slice(0, shape.len), actions: shape.actions, path, v, active, mass,
      kids: [], oppProbs: null, hero: new Map(), mixer: null };
  };

  const mixerOf = entry => {
    if (entry.mixer) return entry.mixer;
    const { table, board, node } = entry, tiers = tierArray(board), baseByTier = [];
    const baseOf = (combo, id) => {
      const tier = tiers[id];
      if (tier === NONE) return null;
      return baseByTier[tier] ??= defence.baseMix(table, board, node, combo);
    };
    let mixer;
    if (!isFacingNode(node)) {
      const cap = isBettingNode(node) ? defence.betting(table, board, node) : null;
      mixer = (combo, id) => { const base = baseOf(combo, id); return base && cap ? cap.applyCombo(base, combo) : base; };
    } else {
      const context = defence.context(table, board, node);
      const bet = !context && isBettingNode(node) ? defence.betting(table, board, node) : null;
      mixer = (combo, id) => {
        const base = baseOf(combo, id);
        if (!base) return null;
        const capped = context ? (context.cap ? context.cap.applyCombo(base, combo) : base) : (bet?.applyCombo(base, combo) ?? base);
        if (!context) return capped;
        const equity = defence.equity(context, combo);
        return equity === null ? capped : defence.applyEquity(context, capped, equity, combo);
      };
    }
    return entry.mixer = mixer;
  };

  const oppProbsOf = (entry, oppSeatIsActor) => {
    if (entry.oppProbs) return entry.oppProbs;
    const n = entry.actions.length, probs = new Float64Array(n * nOpp), mixer = mixerOf(entry);
    for (const i of entry.active) {
      const mix = mixer(oppItems[i].combo, oppId[i]);
      if (mix) fillProbs(mix, entry.actions, probs, i, nOpp);
    }
    return entry.oppProbs = probs;
  };

  const heroInfo = (entry, hero) => {
    let info = entry.hero.get(hero.id);
    if (info) return info;
    const n = entry.actions.length, p = new Float64Array(n), raw = new Float64Array(n);
    const mix = mixerOf(entry)(hero.combo, hero.id);
    if (mix) {
      fillProbs(mix, entry.actions, p, 0, 1);
      for (let k = 0; k < n; k++) raw[k] = mix[entry.actions[k]] / 100;
    }
    entry.hero.set(hero.id, info = { p, raw });
    return info;
  };

  // --- root ---
  const root = makeEntry(rootPath, finalBoard0, new Float64Array(nOpp).fill(1), allActive, massOf(new Float64Array(nOpp).fill(1)));
  if (root.terminal || root.node !== expectedNode) throw new Error(`Exact EV root mismatch: ${root.node} !== ${expectedNode}`);
  const heroSeat = root.seat, oppSeat = spot.ip === heroSeat ? spot.oop : spot.ip;
  const atRoot = { ...root.table.invested };
  // An impossible raise (the opponent is all-in, no chips beyond the call) is not an option of the root.
  const actions = root.table.log.at(-1)?.canRaise === false ? root.actions.filter(action => action !== "raise") : root.actions, nA = actions.length;

  const slotKey = (len, finalBoard) => len <= 3 ? 0 : len === 4 ? finalBoard[3] + 1 : (finalBoard[3] + 1) * 64 + finalBoard[4] + 1;
  const childOf = (entry, k, finalBoard) => {
    let slot = entry.kids[k];
    if (slot && slot.dead) return null;
    if (slot) {
      const hit = slot.byBoard.get(slotKey(slot.len, finalBoard));
      if (hit) return hit;
    }
    const path = { flop: entry.path.flop, turn: entry.path.turn, river: entry.path.river };
    path[entry.street] = [...path[entry.street], entry.actions[k]];
    const oppActs = entry.seat === oppSeat;
    let v = entry.v, active = entry.active, mass = entry.mass;
    if (oppActs) {
      const probs = oppProbsOf(entry), out = new Float64Array(nOpp), base = k * nOpp, list = [];
      mass = 0;
      for (const i of entry.active) {
        const value = entry.v[i] * probs[base + i];
        if (value > 0) { out[i] = value; list.push(i); mass += oppW[i] * value; }
      }
      v = out; active = Int32Array.from(list);
    }
    const child = makeEntry(path, finalBoard, v, active, mass);
    if (!(child.mass > 0)) { entry.kids[k] = { dead: true }; return null; }
    slot ??= entry.kids[k] = { len: child.len, byBoard: new Map() };
    // Only states on the root's own street are shared by several runouts; deeper states are used once.
    if (child.len <= root.len) slot.byBoard.set(slotKey(child.len, finalBoard), child);
    return child;
  };

  const leafOf = entry => {
    if (entry.leaf) return entry.leaf;
    const { table } = entry, { ip, oop } = spot, invested = { ...table.invested };
    let pot = table.pot;
    const high = invested[ip] >= invested[oop] ? ip : oop, low = high === ip ? oop : ip;
    const excess = r2(invested[high] - invested[low]);
    if (excess > 0) { invested[high] = r2(invested[high] - excess); pot = r2(pot - excess); }
    const paid = pot - rake(pot);
    return entry.leaf = { winner: table.winner, paid, cost: invested[heroSeat] - atRoot[heroSeat] };
  };

  // --- hero combos ---
  const heroes = [];
  for (const group of heroGroups) for (const item of group.items) {
    const lo = Math.min(item.combo[0], item.combo[1]), hi = Math.max(item.combo[0], item.combo[1]);
    heroes.push({ group: group.key, combo: [lo, hi], weight: item.weight, id: lo * 52 + hi, lo, hi,
      D: 0, eq: 0, ev: new Float64Array(nA), cover: new Float64Array(nA) });
  }
  const nH = heroes.length;
  const ones = new Float64Array(nH).fill(1);
  // Per runout hero positions.
  const hValid = new Uint8Array(nH), hScore = new Int32Array(nH), hLoK = new Int32Array(nH), hHiK = new Int32Array(nH);
  const hLoC = new Int32Array(nH * 2), hHiC = new Int32Array(nH * 2), hSelf = new Int32Array(nH);

  const posOfId = new Int32Array(52 * 52).fill(-1);
  const cardOff = new Int32Array(53);
  const out3 = new Float64Array(3);

  for (const finalBoard of finals) {
    const rank = rankTable(finalBoard), score = rank.score;
    // valid opponent items sorted by rank
    const keys = [];
    for (let i = 0; i < nOpp; i++) if (oppW[i] > 0 && score[oppId[i]] >= 0) keys.push(score[oppId[i]] * 2048 + i);
    const sortedKeys = Float64Array.from(keys).sort();
    const K = sortedKeys.length;
    if (!K) continue;
    const item = new Int32Array(K), sc = new Int32Array(K);
    for (let k = 0; k < K; k++) { const i = sortedKeys[k] % 2048; item[k] = i; sc[k] = score[oppId[i]]; }
    cardOff.fill(0);
    for (let k = 0; k < K; k++) { cardOff[oppLo[item[k]] + 1]++; cardOff[oppHi[item[k]] + 1]++; }
    for (let c = 0; c < 52; c++) cardOff[c + 1] += cardOff[c];
    const cardPos = new Int32Array(2 * K), cardSc = new Int32Array(2 * K), fill = cardOff.slice(0, 52);
    for (let k = 0; k < K; k++) {
      const i = item[k];
      let at = fill[oppLo[i]]++; cardPos[at] = k; cardSc[at] = sc[k];
      at = fill[oppHi[i]]++; cardPos[at] = k; cardSc[at] = sc[k];
      posOfId[oppId[i]] = k;
    }
    for (let h = 0; h < nH; h++) {
      const hero = heroes[h], s = score[hero.id];
      hValid[h] = s >= 0 ? 1 : 0;
      if (!hValid[h]) continue;
      hScore[h] = s; hLoK[h] = lowerBound(sc, s, 0, K); hHiK[h] = upperBound(sc, s, 0, K);
      hSelf[h] = posOfId[hero.id];
      for (let j = 0; j < 2; j++) {
        const c = j === 0 ? hero.lo : hero.hi, from = cardOff[c], to = cardOff[c + 1];
        hLoC[h * 2 + j] = lowerBound(cardSc, s, from, to); hHiC[h * 2 + j] = upperBound(cardSc, s, from, to);
      }
    }
    // scratch prefix sums
    const m = new Float64Array(K), P = new Float64Array(K + 1), CP = new Float64Array(2 * K + 52), cardTotal = new Float64Array(52);
    const posOfItem = new Int32Array(nOpp).fill(-1);
    for (let k = 0; k < K; k++) posOfItem[item[k]] = k;
    let foldTotal = 0;
    const setMasses = (v, active) => {
      m.fill(0);
      if (v) for (const i of active) { const k = posOfItem[i]; if (k >= 0) m[k] = oppW[i] * v[i]; }
      else for (let k = 0; k < K; k++) m[k] = oppW[item[k]];
      for (let k = 0; k < K; k++) P[k + 1] = P[k] + m[k];
      for (let c = 0; c < 52; c++) {
        const base = cardOff[c] + c; CP[base] = 0;
        for (let j = cardOff[c], n = cardOff[c + 1]; j < n; j++) CP[base + j - cardOff[c] + 1] = CP[base + j - cardOff[c]] + m[cardPos[j]];
      }
    };
    // fold leaves need only the total mass and the per-card totals
    const setTotals = (v, active) => {
      cardTotal.fill(0); foldTotal = 0; m.fill(0);
      for (const i of active) {
        const k = posOfItem[i];
        if (k < 0) continue;
        const mass = oppW[i] * v[i];
        m[k] = mass; foldTotal += mass; cardTotal[oppLo[i]] += mass; cardTotal[oppHi[i]] += mass;
      }
    };
    const foldMass = h => {
      const hero = heroes[h], self = hSelf[h];
      return foldTotal - cardTotal[hero.lo] - cardTotal[hero.hi] + (self >= 0 ? m[self] : 0);
    };
    // total, win, tie masses of hero h against masses set above
    const heroMass = h => {
      const hero = heroes[h];
      let total = P[K], win = P[hLoK[h]], tie = P[hHiK[h]] - P[hLoK[h]];
      for (let j = 0; j < 2; j++) {
        const c = j === 0 ? hero.lo : hero.hi, base = cardOff[c] + c, from = cardOff[c];
        const lo = hLoC[h * 2 + j] - from, hi = hHiC[h * 2 + j] - from, n = cardOff[c + 1] - from;
        total -= CP[base + n]; win -= CP[base + lo]; tie -= CP[base + hi] - CP[base + lo];
      }
      const self = hSelf[h];
      if (self >= 0) { total += m[self]; tie += m[self]; }
      out3[0] = total; out3[1] = win; out3[2] = tie;
    };

    // pseudo leaf: denominator and equity
    setMasses(null, allActive);
    for (let h = 0; h < nH; h++) {
      if (!hValid[h]) continue;
      heroMass(h);
      heroes[h].D += out3[0]; heroes[h].eq += out3[1] + 0.5 * out3[2];
    }

    // Walk the tree under each root action and settle every leaf as it is reached. A branch whose
    // opponent mass (relative to the root) times the best hero probability is below `prune` moves no EV by
    // more than `prune` x the pot; it is skipped and the surviving mass is renormalised (`cover`).
    const settle = (entry, a, scalars) => {
      const info = leafOf(entry), { v, active } = entry;
      const fold = info.winner !== null;
      if (fold) setTotals(v, active); else setMasses(v, active);
      for (let h = 0; h < nH; h++) {
        if (!hValid[h]) continue;
        const scalar = scalars[h];
        if (!(scalar > 0)) continue;
        let value, covered;
        if (fold) {
          covered = foldMass(h);
          value = (info.winner === heroSeat ? info.paid - info.cost : -info.cost) * covered;
        } else {
          heroMass(h);
          covered = out3[0];
          value = info.paid * (out3[1] + 0.5 * out3[2]) - info.cost * covered;
        }
        heroes[h].ev[a] += scalar * value;
        heroes[h].cover[a] += scalar * covered;
      }
    };
    const visit = (entry, a, scalars) => {
      if (entry.terminal) { settle(entry, a, scalars); return; }
      const heroActs = entry.seat === heroSeat;
      for (let k = 0; k < entry.actions.length; k++) {
        const child = childOf(entry, k, finalBoard);
        if (!child) continue;
        let next = scalars, best = 0;
        if (heroActs) {
          next = new Float64Array(nH);
          for (let h = 0; h < nH; h++) if (hValid[h] && scalars[h] > 0) {
            next[h] = scalars[h] * heroInfo(entry, heroes[h]).p[k];
            if (next[h] > best) best = next[h];
          }
        } else for (let h = 0; h < nH; h++) if (scalars[h] > best) best = scalars[h];
        if (best * child.mass < prune * root.mass) continue;
        visit(child, a, next);
      }
    };
    for (let a = 0; a < nA; a++) {
      const child = childOf(root, a, finalBoard);
      if (child) visit(child, a, ones);
    }
    for (let k = 0; k < K; k++) posOfId[oppId[item[k]]] = -1;
    defence.trimRiverCaches(root.len === 3 ? FLOP_RIVER_CONTEXT_LIMIT : RIVER_CONTEXT_LIMIT);
  }

  // --- aggregate per class ---
  const rows = new Map();
  for (const hero of heroes) {
    if (!(hero.D > 1e-12)) continue;
    let row = rows.get(hero.group);
    if (!row) rows.set(hero.group, row = { weight: 0, equity: 0, ev: new Float64Array(nA), mixEv: 0, mix: new Float64Array(nA) });
    const raw = heroInfo(root, hero).raw;
    row.weight += hero.weight;
    row.equity += hero.weight * hero.eq / hero.D;
    for (let k = 0; k < nA; k++) {
      const ev = hero.cover[k] > 0 ? hero.ev[k] / hero.cover[k] : 0;
      row.ev[k] += hero.weight * ev;
      row.mixEv += hero.weight * raw[k] * ev;
      row.mix[k] += hero.weight * raw[k] * 100;
    }
  }
  for (const row of rows.values()) {
    row.equity /= row.weight; row.mixEv /= row.weight;
    for (let k = 0; k < nA; k++) { row.ev[k] /= row.weight; row.mix[k] /= row.weight; }
  }
  return { rows, actions, pot: root.table.pot };
}
