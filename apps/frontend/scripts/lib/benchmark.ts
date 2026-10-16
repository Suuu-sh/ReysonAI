// Shared benchmark helpers: combo-weighted aggregate frequencies of saved
// spots, and comparison against reference files in .local/benchmarks.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { comboCount } from "./equity.ts";

export const DATASET_NAMES = Object.freeze(["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "limp-deep-responses", "cold-three-bet-responses", "multiway2-responses", "cold-four-bet-responses"]);
const ACTIONS = ["open", "limp", "three_bet", "four_bet", "all_in", "squeeze", "call", "fold"];

export function loadSpots(root?: any) : any {
  return DATASET_NAMES
    .filter((name: any) : any => existsSync(new URL(`src/estimated/${name}.json`, root)))
    .flatMap((name: any) : any => (((JSON.parse((readFileSync(new URL(`src/estimated/${name}.json`, root)) as any)) as any))).spots);
}

export function createAggregator(spots?: any) : any {
  const openBy: any = new Map(spots.filter((s: any) : any => s.id.endsWith("_open")).map((s: any) : any => [s.hero, new Map(s.hands.map((r: any) : any => [r.hand, r.open / 100]))]));
  const responseBy: any = new Map(spots.filter((s: any) : any => /^[A-Z]+_vs_[A-Z]+$/.test(s.id)).map((s: any) : any => [`${s.opener}>${s.hero}`, new Map(s.hands.map((r: any) : any => [r.hand, r]))]));
  // Weight of each hand reaching the spot, so frequencies match what a solver reports for the node.
  const reachWeight = (spot: any) : any => {
    if (spot.id.endsWith("_three_bet")) return (hand: any) : any => openBy.get(spot.opener).get(hand);
    if (spot.id.endsWith("_four_bet")) return (hand: any) : any => responseBy.get(`${spot.opener}>${spot.hero}`).get(hand).three_bet / 100;
    return () : any => 1;
  };
  return (spot: any) : any => {
    const reach = reachWeight(spot);
    const actions = Object.keys(spot.hands[0]).filter((key: any) : any => ACTIONS.includes(key));
    const totals = Object.fromEntries(actions.map((action: any) : any => [action, 0]));
    let weight = 0;
    for (const row of spot.hands) {
      const w = comboCount(row.hand) * reach(row.hand);
      weight += w;
      for (const action of actions) totals[action] += w * row[action];
    }
    return Object.fromEntries(actions.map((action: any) : any => [action, totals[action] / weight]));
  };
}

export function loadReferences(root?: any) : any {
  const dir = new URL(".local/benchmarks/", root);
  if (!existsSync(dir)) return ([] as any[]);
  return readdirSync(dir).filter((name: any) : any => name.endsWith(".json")).map((name: any) : any => JSON.parse((readFileSync(new URL(name, dir)) as any)));
}

// One row per (spot, action). ours is null when the spot is not saved.
export function compareToReferences(spots?: any, references?: any) : any {
  const aggregate = createAggregator(spots);
  return references.flatMap((bench: any) : any => {
    const spot = spots.find((s: any) : any => s.id === bench.spot_id);
    if (!spot) return [{ spot_id: bench.spot_id, action: null, ours: null, reference: null, diff: null }];
    const ours = aggregate(spot);
    return Object.entries<any>(bench.frequencies).map(([action, reference]: any) : any => ({
      spot_id: spot.id, action, ours: ours[action] ?? 0, reference, diff: (ours[action] ?? 0) - reference,
    }));
  });
}
