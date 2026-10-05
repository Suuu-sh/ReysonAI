// Slow, independent reference for scripts/postflop-ai/exact-ev.mjs: plain enumeration of every opponent
// combo, every runout and every action sequence (engine replays + defence.mix), no vectors, no prefix sums.
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "../../scripts/postflop-ai/engine.mjs";
import { NODES } from "../../scripts/postflop-ai/policy.mjs";
import { LATER_NODES } from "../../scripts/postflop-ai/later-tree.ts";
import { evaluate } from "../../scripts/lib/equity.mjs";
import config from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };

const STOP = Symbol("stop");
const actionsOf = node => NODES[node] ?? LATER_NODES[node];
const probabilities = (mix, actions) => {
  let cumulative = 0, previous = 0;
  return actions.map((action, k) => {
    if (k === actions.length - 1) return (100 - previous) / 100;
    cumulative += mix[action];
    const clipped = Math.min(Math.max(cumulative, 0), 100), p = (clipped - previous) / 100;
    previous = clipped;
    return p;
  });
};

// Expected net (from the decision) of the hero for one hero combo, opponent combo and final board when the
// forced root action is followed by both players' mixes.
function expectation({ spot, defence, rootPath, heroSeat, hands, finalBoard, rootIndex, forced }) {
  const flopBoard = finalBoard.slice(0, 3);
  const run = script => {
    const table = createTable(spot);
    let index = 0, atNode = null, pending = null;
    const take = (seat, node, board) => {
      if (index === rootIndex) atNode = { ...table.invested };
      if (index < script.length) return script[index++];
      pending = { seat, node, board, table };
      throw STOP;
    };
    try {
      let step = 0;
      playFlop(table, spot.tree, (seat, node) => {
        const taken = rootPath.flop;
        if (step < taken.length) return taken[step++];
        step++;
        return take(seat, node, flopBoard);
      }, config);
      playLaterStreetsWithPolicy(table, flopBoard, finalBoard.slice(3), (seat, node, board) => take(seat, node, board), config, table.lastAggressor);
    } catch (error) { if (error !== STOP) throw error; }
    return { table, pending, atNode };
  };
  const walk = script => {
    const { table, pending, atNode } = run(script);
    if (!pending) {
      const winner = settle(table, hands, finalBoard);
      const paid = table.pot - rake(table.pot);
      const share = winner === heroSeat ? paid : winner === "tie" ? paid / 2 : 0;
      return share - table.invested[heroSeat] + atNode[heroSeat];
    }
    const { seat, node, board } = pending, actions = actionsOf(node);
    const combo = hands[seat];
    const mix = defence.mix(table, board, node, combo, defence.baseMix(table, board, node, combo));
    const p = probabilities(mix, actions);
    return actions.reduce((sum, action, k) => p[k] > 0 ? sum + p[k] * walk([...script, action]) : sum, 0);
  };
  return walk(forced);
}

// rootPath: { flop, turn, river } actions before the decision; the script covers the later-street
// decisions only (flop decisions are fixed by rootPath.flop, so the root must be on turn or river).
export function enumerateLaterEv({ spot, defence, rootPath, rootNode, finals, heroGroups, oppItems }) {
  const actions = actionsOf(rootNode), heroSeat = spot[rootNode.split("_")[1]], oppSeat = spot.ip === heroSeat ? spot.oop : spot.ip;
  const street = rootNode.split("_")[0];
  const prefix = street === "turn" ? [...rootPath.turn] : [...rootPath.turn, ...rootPath.river];
  const rows = new Map();
  for (const { key, items } of heroGroups) {
    let weight = 0, equity = 0; const ev = actions.map(() => 0);
    for (const hero of items) {
      let denominator = 0, eq = 0; const sums = actions.map(() => 0);
      for (const final of finals) {
        if (final.some(card => hero.combo.includes(card))) continue;
        for (const opp of oppItems) {
          if (opp.combo.some(card => hero.combo.includes(card) || final.includes(card))) continue;
          denominator += opp.weight;
          const mine = evaluate([...hero.combo, ...final]), theirs = evaluate([...opp.combo, ...final]);
          eq += opp.weight * (mine > theirs ? 1 : mine === theirs ? 0.5 : 0);
          const hands = { [heroSeat]: hero.combo, [oppSeat]: opp.combo };
          actions.forEach((action, k) => {
            sums[k] += opp.weight * expectation({ spot, defence, rootPath, heroSeat, hands, finalBoard: final,
              rootIndex: prefix.length, forced: [...prefix, action] });
          });
        }
      }
      if (!(denominator > 0)) continue;
      weight += hero.weight; equity += hero.weight * eq / denominator;
      sums.forEach((value, k) => { ev[k] += hero.weight * value / denominator; });
    }
    if (weight > 0) rows.set(key, { weight, equity: equity / weight, ev: ev.map(value => value / weight) });
  }
  return rows;
}
