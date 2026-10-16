import { readFileSync, writeFileSync } from "node:fs";

const source = (name: any) : any => JSON.parse(readFileSync(new URL(`../src/estimated/${name}`, import.meta.url), "utf8"));
const output: any = {};

for (const [key, file, id, actions] of [
  ["opening", "opening-ranges.json", "BTN_open", ["open", "fold"]],
  ["response", "preflop-ranges.json", "BB_vs_BTN", ["three_bet", "call", "fold"]],
]) {
  const spot = source(file).spots.find((item: any) : any => item.id === id);
  if (!spot || spot.hands.length !== 169) throw new Error(`Missing or incomplete ${id} range`);
  output[(key as any)] = Object.fromEntries(spot.hands.map((row: any) : any => [row.hand, Object.fromEntries((actions as any).map((action: any) : any => [action, row[action]]))]));
}


const tour: any[] = [];
const openingSpots = source("opening-ranges.json").spots;
const responseSpots = source("preflop-ranges.json").spots;
for (const [file, stage, raiseAction] of [
  ["opening-ranges.json", "opening", "open"],
  ["preflop-ranges.json", "response", "three_bet"],
  ["three-bet-responses.json", "threeBet", "four_bet"],
  ["four-bet-responses.json", "fourBet", "all_in"],
]) {
  for (const spot of source(file).spots) {
    if (spot.hands.length !== 169 || new Set(spot.hands.map((row: any) : any => row.hand)).size !== 169) throw new Error(`Incomplete ${spot.id} range`);
    const hands = Object.fromEntries(spot.hands.map((row: any) : any => {
      const values = { raise: raiseAction === "all_in" ? 0 : row[raiseAction], all_in: raiseAction === "all_in" ? row.all_in : 0, call: row.call ?? 0, limp: row.limp ?? 0, fold: row.fold };
      if (Object.values<any>(values).some((value: any) : any => !Number.isFinite(value) || value < 0 || value > 100) || Object.values<any>(values).reduce((sum?: any, value?: any) : any => sum + value, 0) !== 100) throw new Error(`Invalid ${spot.id}/${row.hand} frequencies`);
      return [row.hand, values];
    }));
    const previous = stage === "threeBet" ? openingSpots.find((item: any) : any => item.hero === spot.hero) : stage === "fourBet" ? responseSpots.find((item: any) : any => item.id === spot.source_response_id) : null;
    if ((stage === "threeBet" || stage === "fourBet") && !previous) throw new Error(`Missing source range for ${spot.id}`);
    const unreachable = previous ? previous.hands.filter((row: any) : any => (stage === "threeBet" ? row.open : row.three_bet) === 0).map((row: any) : any => row.hand) : ([] as any[]);
    tour.push({ id: spot.id, stage, hands, unreachable });
  }
}
output.tour = tour;
writeFileSync(new URL("../src/site/range-preview.json", import.meta.url), `${JSON.stringify(output)}\n`);
