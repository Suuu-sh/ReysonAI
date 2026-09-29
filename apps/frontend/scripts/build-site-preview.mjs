import { readFileSync, writeFileSync } from "node:fs";

const source = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}`, import.meta.url), "utf8"));
const output = {};

for (const [key, file, id, actions] of [
  ["opening", "opening-ranges.json", "BTN_open", ["open", "fold"]],
  ["response", "preflop-ranges.json", "BB_vs_BTN", ["three_bet", "call", "fold"]],
]) {
  const spot = source(file).spots.find(item => item.id === id);
  if (!spot || spot.hands.length !== 169) throw new Error(`Missing or incomplete ${id} range`);
  output[key] = Object.fromEntries(spot.hands.map(row => [row.hand, Object.fromEntries(actions.map(action => [action, row[action]]))]));
}

writeFileSync(new URL("../src/site/range-preview.json", import.meta.url), `${JSON.stringify(output)}\n`);
