// Shared benchmark helpers: combo-weighted aggregate frequencies of saved
// spots, and comparison against reference files in .local/benchmarks.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { comboCount } from "./equity.mjs";

export const DATASET_NAMES = Object.freeze(["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "limp-responses"]);
const ACTIONS = ["open", "limp", "three_bet", "four_bet", "all_in", "squeeze", "call", "fold"];

export function loadSpots(root) {
  return DATASET_NAMES
    .filter(name => existsSync(new URL(`src/estimated/${name}.json`, root)))
    .flatMap(name => JSON.parse(readFileSync(new URL(`src/estimated/${name}.json`, root))).spots);
}

export function createAggregator(spots) {
  const openBy = new Map(spots.filter(s => s.id.endsWith("_open")).map(s => [s.hero, new Map(s.hands.map(r => [r.hand, r.open / 100]))]));
  const responseBy = new Map(spots.filter(s => /^[A-Z]+_vs_[A-Z]+$/.test(s.id)).map(s => [`${s.opener}>${s.hero}`, new Map(s.hands.map(r => [r.hand, r]))]));
  // Weight of each hand reaching the spot, so frequencies match what a solver reports for the node.
  const reachWeight = spot => {
    if (spot.id.endsWith("_three_bet")) return hand => openBy.get(spot.opener).get(hand);
    if (spot.id.endsWith("_four_bet")) return hand => responseBy.get(`${spot.opener}>${spot.hero}`).get(hand).three_bet / 100;
    return () => 1;
  };
  return spot => {
    const reach = reachWeight(spot);
    const actions = Object.keys(spot.hands[0]).filter(key => ACTIONS.includes(key));
    const totals = Object.fromEntries(actions.map(action => [action, 0]));
    let weight = 0;
    for (const row of spot.hands) {
      const w = comboCount(row.hand) * reach(row.hand);
      weight += w;
      for (const action of actions) totals[action] += w * row[action];
    }
    return Object.fromEntries(actions.map(action => [action, totals[action] / weight]));
  };
}

export function loadReferences(root) {
  const dir = new URL(".local/benchmarks/", root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(new URL(name, dir))));
}

// One row per (spot, action). ours is null when the spot is not saved.
export function compareToReferences(spots, references) {
  const aggregate = createAggregator(spots);
  return references.flatMap(bench => {
    const spot = spots.find(s => s.id === bench.spot_id);
    if (!spot) return [{ spot_id: bench.spot_id, action: null, ours: null, reference: null, diff: null }];
    const ours = aggregate(spot);
    return Object.entries(bench.frequencies).map(([action, reference]) => ({
      spot_id: spot.id, action, ours: ours[action] ?? 0, reference, diff: (ours[action] ?? 0) - reference,
    }));
  });
}
